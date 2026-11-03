#!/usr/bin/env python3
"""Rewrite What's here record chunks in place. No source GeoJSON: it reads the
geometry already stored in layers/rec/*.json (tags P/L/A, half-metre coordinates)
and writes integer metres, delta-encoded, simplified to about 1 m (tags p/l/a).
The viewer reads both forms. Chunks that are already p/l/a are left untouched.

    python3 scripts/reencode_rec_chunks.py layers/rec
    python3 scripts/reencode_rec_chunks.py /path/to/rec

Does not upload anything. Prints each file's old and new size.
"""
import json, math, os, sys

TOL = 1.0  # metres

def dist_point_seg(p, a, b):
    ax, ay = a; bx, by = b; px, py = p
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    if t < 0: t = 0
    elif t > 1: t = 1
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

def simplify(pts, tol):
    """Douglas-Peucker. A closed ring (first point repeated) stays closed.
    If the tolerance would erase the shape, the original points are kept."""
    if len(pts) < 3:
        return pts
    closed = pts[0] == pts[-1] and len(pts) > 3
    def rec(s):
        if len(s) <= 2:
            return s
        a, b = s[0], s[-1]
        imax, dmax = 0, 0.0
        for i in range(1, len(s) - 1):
            d = dist_point_seg(s[i], a, b)
            if d > dmax:
                imax, dmax = i, d
        if dmax <= tol:
            return [a, b]
        left, right = rec(s[:imax + 1]), rec(s[imax:])
        return left[:-1] + right
    chain = pts if closed else pts
    out = rec(chain)
    if closed:
        if not out or out[0] != out[-1]:
            out = out + [out[0]]
        if len(out) < 4:  # fewer than 3 corners
            return pts
        return out
    if len(out) < 2:
        return pts
    return out

def ints(pts):
    out = []
    for x, y in pts:
        p = (int(round(x)), int(round(y)))
        if not out or out[-1] != p:
            out.append(p)
    return out

def flat_delta(pts, close):
    pts = list(pts)
    if close and len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    if len(pts) < (3 if close else 2):
        return []
    out = [pts[0][0], pts[0][1]]
    x, y = pts[0]
    for px, py in pts[1:]:
        out.append(px - x); out.append(py - y)
        x, y = px, py
    return out

def as_line(pts):
    """A collapsed shape still has to be stored. One integer point becomes a
    point; two or more become a line. A sub-metre scribble is kept as a 1 m stub."""
    ip = ints(pts)
    if len(ip) > 1 and ip[0] == ip[-1]:
        ip = ip[:-1]
    if not ip:
        return None
    if len(ip) == 1:
        x, y = ip[0]
        return ['p', x, y]
    return ['l', flat_delta(ip, False)]

def enc_line(line):
    ip = ints(simplify(line, TOL))
    if len(ip) < 2:
        ip = ints(line)
    return flat_delta(ip, False)

def enc_ring(ring):
    ip = ints(simplify(ring, TOL))
    body = ip[:-1] if len(ip) > 1 and ip[0] == ip[-1] else ip
    if len(body) < 3:
        return []  # caller keeps the raw points as a line or a point
    return flat_delta(ip, True)

def enc(g):
    if not isinstance(g, list) or not g:
        return g
    tag = g[0]
    if tag in ('p', 'l', 'a'):
        return g
    if tag == 'P':
        x, y = g[1]
        return ['p', int(round(x)), int(round(y))]
    if tag == 'L':
        return pack(parts_of_lines(g[1])) or g
    if tag == 'A':
        polys = []
        loose = []
        for poly in g[1]:
            rings = []
            for ring in poly:
                d = enc_ring(ring)
                if d:
                    rings.append(d)
                else:
                    stub = as_line(ints(ring))
                    if stub:
                        loose.append(stub)
            if rings:
                polys.append(rings)
        if polys:
            return ['a', *polys]
        return pack(loose) or g
    return g

def parts_of_lines(lines):
    out = []
    for line in lines:
        d = enc_line(line)
        if d:
            out.append(['l', d])
        else:
            stub = as_line(ints(line))
            if stub:
                out.append(stub)
    return out

def pack(pieces):
    """One geometry tag per feature. Several pieces become a multi-line;
    a lone point stays a point."""
    if not pieces:
        return None
    if len(pieces) == 1:
        return pieces[0]
    lines = []
    for p in pieces:
        if p[0] == 'l':
            lines.append(p[1])
        elif p[0] == 'p':
            lines.append([p[1], p[2], 1, 0])
    return ['l', *lines] if lines else None

def rewrite(path):
    with open(path, 'r', encoding='utf-8') as f:
        raw = f.read()
    data = json.loads(raw)
    feats = data.get('f')
    if not isinstance(feats, list):
        print(path, 'skipped (no f[])')
        return
    changed = 0
    for feat in feats:
        g = feat.get('g')
        if isinstance(g, list) and g and g[0] in ('P', 'L', 'A'):
            ng = enc(g)
            if ng is not g:
                feat['g'] = ng
                changed += 1
    if not changed:
        print('%s  unchanged  %d features' % (path, len(feats)))
        return
    new = json.dumps(data, separators=(',', ':'), ensure_ascii=False)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(new)
    os.replace(tmp, path)
    print('%s  %d -> %d bytes  (%d features re-encoded)' % (path, len(raw.encode('utf-8')), len(new.encode('utf-8')), changed))

def main():
    if len(sys.argv) != 2:
        sys.exit('usage: python3 scripts/reencode_rec_chunks.py layers/rec')
    root = sys.argv[1]
    if not os.path.isdir(root):
        sys.exit('not a directory: ' + root)
    files = sorted(n for n in os.listdir(root) if n.endswith('.json'))
    if not files:
        sys.exit('no .json files in ' + root)
    for name in files:
        rewrite(os.path.join(root, name))

if __name__ == '__main__':
    main()
