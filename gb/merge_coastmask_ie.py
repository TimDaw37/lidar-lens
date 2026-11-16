"""Merge the Irish coastline mask (gb/make_coastmask.py run with COAST_TILES = the zoom 10 seabed tiles that touch the island of Ireland
and its 12 nm belt and were not in the published mask) into a copy of the published mask (live TEST, 16 Nov 2026, Tim t2277u).
Zoom 10-14: the Irish tiles are new keys (asserted). Zoom 5-9: each overview tile is the zoom 10 coverage box-averaged, so only the
blocks of the rebuilt zoom 10 tiles are replaced (they used to count as sea) and every other pixel is the published value. The index
lists are then recomputed from tile status for all of zoom 5-10 and checked against the published lists outside the changed tiles.
usage: [IE_POLY=ie_poly.json] python3 gb/merge_coastmask_ie.py OLD_PACK_DIR IE_MASK_DIR IE_PACK_DIR LAND_GPKG OUT_DIR"""
import sys, os, json, shutil, numpy as np, geopandas as gpd, math
from shapely.geometry import Point
from PIL import Image
OLD, IEM, IEP, LAND, OUT = sys.argv[1:6]
O = json.load(open(f'{OLD}/index.json')); N = json.load(open(f'{IEM}/index.json'))
S = lambda d, z: set(d.get(str(z), []))
Om = {z: S(O['m'], z) for z in range(5, 15)}; Ol = {z: S(O['l'], z) for z in range(5, 15)}
Nm = {z: S(N['m'], z) for z in range(10, 15)}; Nl = {z: S(N['l'], z) for z in range(11, 15)}
ieb = set(N['b10']); assert not ieb & set(O['b10']), 'Irish zoom 10 tiles already in the published mask'
for z in range(10, 15): assert not Nm[z] & Om[z] and not Nl.get(z, set()) & Ol[z], z
def lon(x, z): return x / 2 ** z * 360 - 180
def lat(y, z): return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / 2 ** z))))
land = gpd.read_file(LAND); sidx = land.sindex
def all_land(x, y):   # a rebuilt zoom 10 tile that is not mixed is all land or all sea: test its centre
    p = Point(lon(x + 0.5, 10), lat(y + 0.5, 10)); return any(land.geometry.values[i].contains(p) for i in sidx.query(p))
c10 = {}
for k in ieb:
    x, y = map(int, k.split('_'))
    if k in Nm[10]: c10[(x, y)] = np.asarray(Image.open(f'{IEM}/10/{x}/{y}.png'), np.float32) / 255
    else: c10[(x, y)] = np.full((256, 256), 1.0 if all_land(x, y) else 0.0, np.float32)
# Interior zoom 10 tiles (16 Nov 2026 fix): the Irish zoom 10 tiles that hold no seabed were never built, so the overview tiles
# (zoom 5-9) counted them as sea and the page cut GEM-15 out of inland Ireland at zoom 5-9. Every other zoom 10 tile whose centre is in
# IE_POLY (the island and its belt, gem15/mask-v2 'ie') is rasterised from the land polygons here, for the overviews only (not added to
# b10, so zoom 10+ still treat them as no mask, as before).
ext = {}
IEP_POLY = os.environ.get('IE_POLY')
if IEP_POLY:
    from shapely.geometry import Polygon, box
    from rasterio import features
    from rasterio.transform import from_bounds
    from pyproj import Transformer
    tr = Transformer.from_crs(4326, 3857, always_xy=True)
    poly = Polygon([(p[1], p[0]) for p in json.load(open(IEP_POLY))]); x0, y0, x1, y1 = poly.bounds
    xs = range(int((x0 + 180) / 360 * 1024), int((x1 + 180) / 360 * 1024) + 1)
    ys = range(int((1 - math.asinh(math.tan(math.radians(y1))) / math.pi) / 2 * 1024), int((1 - math.asinh(math.tan(math.radians(y0))) / math.pi) / 2 * 1024) + 1)
    ob10 = set(O['b10']); R = 20037508.342789244
    for x in xs:
        for y in ys:
            k = f'{x}_{y}'
            if k in ieb or k in ob10 or not poly.contains(Point(lon(x + 0.5, 10), lat(y + 0.5, 10))): continue
            bb = box(lon(x, 10), lat(y + 1, 10), lon(x + 1, 10), lat(y, 10)); geo = [land.geometry.values[i] for i in sidx.query(bb)]
            geo = [g.intersection(bb) for g in geo if g.intersects(bb)]
            if not geo: ext[(x, y)] = np.zeros((256, 256), np.float32); continue
            if any(g.buffer(1e-9).contains(bb) for g in geo): ext[(x, y)] = np.ones((256, 256), np.float32); continue
            from shapely.ops import transform as stf
            t = from_bounds(x / 1024 * 2 * R - R, R - (y + 1) / 1024 * 2 * R, (x + 1) / 1024 * 2 * R - R, R - y / 1024 * 2 * R, 1024, 1024)
            a = features.rasterize([(stf(tr.transform, g), 1) for g in geo], out_shape=(1024, 1024), transform=t, dtype='uint8')
            ext[(x, y)] = a.reshape(256, 4, 256, 4).mean(axis=(1, 3)).astype(np.float32)
    print('interior zoom 10 tiles rasterised for the overviews', len(ext), 'all land', sum(1 for v in ext.values() if v.min() == 1))
def old_status(z, x, y):
    k = f'{x}_{y}'
    if k in Om[z]: return 'm'
    if k in Ol[z]: return 'l'
    if z == 5: return None
    p = old_status(z - 1, x >> 1, y >> 1); return 's' if p == 'm' else p
new = {}   # (z,x,y) -> status for the changed overview tiles
changed_png = {}
for z in range(9, 4, -1):
    par = {(x >> (10 - z), y >> (10 - z)) for (x, y) in list(c10) + list(ext)}
    for (X, Y) in par:
        st = old_status(z, X, Y); k = 2 ** (10 - z); sub = 256 // k
        if st == 'm': A = np.asarray(Image.open(f'{OLD}/{z}/{X}/{Y}.png'), np.float32) / 255
        elif st == 'l': A = np.ones((256, 256), np.float32)
        else: A = np.zeros((256, 256), np.float32)   # sea, or no mask (None: z5 only, not reached here)
        for (x, y), c in list(c10.items()) + list(ext.items()):
            if (x >> (10 - z), y >> (10 - z)) != (X, Y): continue
            i, j = x - X * k, y - Y * k; A[j * sub:(j + 1) * sub, i * sub:(i + 1) * sub] = c.reshape(sub, k, sub, k).mean(axis=(1, 3))
        q = np.round(A * 255).astype(np.uint8)
        new[(z, X, Y)] = 'l' if q.min() == 255 else 's' if q.max() == 0 else 'm'
        if new[(z, X, Y)] == 'm': changed_png[(z, X, Y)] = q
for (x, y), c in c10.items():
    q = np.round(c * 255).astype(np.uint8); new[(10, x, y)] = 'l' if q.min() == 255 else 's' if q.max() == 0 else 'm'
    assert (new[(10, x, y)] == 'm') == (f'{x}_{y}' in Nm[10])
def status(z, x, y):
    if (z, x, y) in new: return new[(z, x, y)]
    if z == 10 and (x, y) not in c10 and f'{x}_{y}' not in set(O['b10']): pass
    k = f'{x}_{y}'
    if k in Om[z]: return 'm'
    if k in Ol[z]: return 'l'
    if z == 5: return None
    p = status(z - 1, x >> 1, y >> 1); return 's' if p == 'm' else p
# zoom 5-10 lists from status, over the whole published area plus Ireland
allk = {}
for z in range(5, 11):
    ks = set(Om[z]) | set(Ol[z]) | {(f'{x}_{y}') for (zz, x, y) in new if zz == z}
    ks |= {f'{x}_{y}' for (zz, X, Y) in new if zz == z - 1 for x in (2 * X, 2 * X + 1) for y in (2 * Y, 2 * Y + 1)}
    if z == 10: ks |= set(O['b10']) | ieb
    allk[z] = ks
M2 = {}; L2 = {}
for z in range(5, 11):
    for k in allk[z]:
        x, y = map(int, k.split('_')); s = status(z, x, y)
        if s == 'm': M2.setdefault(z, set()).add(k)
        elif s == 'l' and (z == 5 or status(z - 1, x >> 1, y >> 1) == 'm'): L2.setdefault(z, set()).add(k)
# check: outside the changed tiles the lists are the published ones
chg = {(z, f'{x}_{y}') for (z, x, y) in new}
for z in range(5, 11):
    for nm, a, b in (('m', Om[z], M2.get(z, set())), ('l', Ol[z], L2.get(z, set()))):
        d = {k for k in a ^ b if (z, k) not in chg and (z - 1, '%d_%d' % (int(k.split('_')[0]) >> 1, int(k.split('_')[1]) >> 1)) not in chg}
        if d: print('WARNING', nm, z, 'differs outside the changed tiles', sorted(d)[:10], len(d))
print('changed overview tiles', {z: sum(1 for t in new if t[0] == z) for z in range(5, 11)})
idx = dict(O); idx['b10'] = sorted(set(O['b10']) | ieb)
idx['m'] = {str(z): sorted(M2.get(z, set())) for z in range(5, 11)}; idx['l'] = {str(z): sorted(L2.get(z, set())) for z in range(5, 11) if L2.get(z)}
for z in range(11, 15): idx['m'][str(z)] = sorted(Om[z] | Nm[z]); idx['l'][str(z)] = sorted(Ol[z] | Nl.get(z, set()))
idx['src'] = O.get('src', '') + '; Ireland (16 Nov 2026): OpenStreetMap land polygons, ODbL'
# files: published copy, then the Irish zoom 10 tiles and zoom 11 packs, then the changed overview tiles
if os.path.exists(OUT): shutil.rmtree(OUT)
shutil.copytree(OLD, OUT)
n = 0
for z in (10, 11):
    for k in Nm[z]:
        x, y = k.split('_'); d = f'{OUT}/{z}/{x}'; os.makedirs(d, exist_ok=True); assert not os.path.exists(f'{d}/{y}.png'); shutil.copy(f'{IEP}/{z}/{x}/{y}.png', f'{d}/{y}.png'); n += 1
for (z, X, Y), q in changed_png.items():
    d = f'{OUT}/{z}/{X}'; os.makedirs(d, exist_ok=True); Image.fromarray(q, 'L').save(f'{d}/{Y}.png', optimize=True); n += 1
# overview tiles that stopped being mixed are no longer read; leave no stale file
for z in range(5, 10):
    for k in Om[z] - M2.get(z, set()):
        x, y = k.split('_'); os.remove(f'{OUT}/{z}/{x}/{y}.png'); print('dropped', z, k)
json.dump(idx, open(f'{OUT}/index.json', 'w'), separators=(',', ':'))
print('written', n, 'new/changed files; m', {z: len(v) for z, v in idx['m'].items()})
