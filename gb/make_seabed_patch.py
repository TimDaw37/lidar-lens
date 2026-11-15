"""High-resolution seabed patches for LiDAR Lens (live TEST, 15 Nov 2026): open multibeam grids as Terrarium lossless WebP under
seabed/mb/{z}/{x}/{y}.webp at zoom MINZ-MAXZ (default 12-15; zoom above MAXZ is enlarged in the service worker, gb/seabed-route.js),
index seabed/mb/index.json. Marker blue = 3 mod 4, heights 1/64 m.
Sources: any GDAL-readable float grid with a CRS (GeoTIFF; UKHO BAG / ESRI ASCII / regular XYZ can be converted first with
gb/seabed_prepare.sh). Each source is levelled to the EMODnet MSL grid (its vertical datum is often chart datum or unstated): the
median of (EMODnet - source) over the source's own cells, sampled at the EMODnet resolution, is added; the sign is flipped first if
the grid holds depths as positive numbers. Where sources overlap, the one listed first wins.
usage: python3 gb/make_seabed_patch.py EMOD_VRT OUT_DIR [--minz 12] [--maxz 15] SRC.tif [SRC2.tif ...]"""
import sys, os, json, math, numpy as np, multiprocessing as mp
import rasterio, mercantile
from rasterio.vrt import WarpedVRT
from rasterio.enums import Resampling
from rasterio.transform import Affine
from rasterio.warp import transform_bounds
from PIL import Image
a = sys.argv[1:]; EMOD, OUT = a[0], a[1]; a = a[2:]
def opt(k, d):
    global a
    if k in a: i = a.index(k); v = int(a[i + 1]); a = a[:i] + a[i + 2:]; return v
    return d
MINZ, MAXZ = opt('--minz', 12), opt('--maxz', 15); SRCS = a
R0 = 6378137 * math.pi; MARK = 3
def level(f):
    """offset (and sign) that brings source f onto EMODnet MSL"""
    with rasterio.open(f) as s, rasterio.open(EMOD) as e:
        b = transform_bounds(s.crs, e.crs, *s.bounds); w = e.window(*b).round_offsets().round_lengths()
        et = e.window_transform(w); E = e.read(1, window=w, boundless=True, fill_value=9999).astype('float32'); E[E == 9999] = np.nan
        with WarpedVRT(s, crs=e.crs, transform=et, width=E.shape[1], height=E.shape[0], resampling=Resampling.average, nodata=np.nan, dtype='float32') as v:
            S = v.read(1); nd = s.nodata
        if nd is not None: S[S == nd] = np.nan
        S[(S > 1e30) | (S < -1e30)] = np.nan
    ok = np.isfinite(S) & np.isfinite(E)
    if ok.sum() < 5: return None
    sign = 1.0 if np.nanmedian(S[ok]) * np.nanmedian(E[ok]) >= 0 else -1.0
    off = float(np.median(E[ok] - sign * S[ok])); res = E[ok] - (sign * S[ok] + off)
    return {'src': os.path.basename(f), 'sign': sign, 'offset_m': round(off, 3), 'n': int(ok.sum()), 'resid_iqr_m': [round(float(np.percentile(res, 25)), 2), round(float(np.percentile(res, 75)), 2)]}
def enc(h):
    ok = np.isfinite(h); v = np.where(ok, np.round((h + 32768) * 64) / 64, 0); vi = np.floor(v).astype(np.int64)
    out = np.zeros((256, 256, 4), np.uint8); out[..., 0] = (vi >> 8) & 255; out[..., 1] = vi & 255
    out[..., 2] = (np.round((v - vi) * 256).astype(np.int64) & 252) + MARK; out[..., 3] = 255; out[~ok] = 0; return out
LV = {}
def tile(t):
    z, x, y = t; RES = 2 * R0 / (256 * 2 ** z); tr = Affine(RES, 0, -R0 + x * 256 * RES, 0, -RES, R0 - y * 256 * RES)
    out = np.full((256, 256), np.nan, np.float32)
    for f in SRCS:
        L = LV.get(f)
        if not L: continue
        with rasterio.open(f) as s:
            b = transform_bounds(s.crs, 'EPSG:3857', *s.bounds)
            if b[0] > tr.c + 256 * RES or b[2] < tr.c or b[1] > tr.f or b[3] < tr.f - 256 * RES: continue
            with WarpedVRT(s, crs='EPSG:3857', transform=tr, width=256, height=256, resampling=Resampling.bilinear, nodata=np.nan, dtype='float32') as v:
                A = v.read(1)
            if s.nodata is not None: A[A == s.nodata] = np.nan
        A[(A > 1e30) | (A < -1e30)] = np.nan; A = L['sign'] * A + L['offset_m']
        m = np.isnan(out) & np.isfinite(A); out[m] = A[m]
    return (t, out) if np.isfinite(out).any() else (t, None)
def save(z, x, y, h):
    p = f'{OUT}/{z}/{x}'; os.makedirs(p, exist_ok=True); Image.fromarray(enc(h), 'RGBA').save(f'{p}/{y}.webp', lossless=True, quality=100, method=4, exact=False)
if __name__ == '__main__':
    rep = []
    for f in SRCS:
        L = level(f); print(f, L, flush=True); rep.append(L or {'src': os.path.basename(f), 'skipped': 'no overlap with EMODnet'})
        if L: LV[f] = L
    ts = set()
    for f in LV:
        with rasterio.open(f) as s: b = transform_bounds(s.crs, 'EPSG:4326', *s.bounds)
        ts |= {(t.z, t.x, t.y) for t in mercantile.tiles(*b, MAXZ)}
    print(len(ts), 'candidate tiles at', MAXZ, flush=True)
    G = {}
    with mp.Pool(6) as pool:
        for t, h in pool.imap_unordered(tile, sorted(ts), chunksize=8):
            if h is not None: G[t] = h
    print(len(G), 'tiles with data', flush=True)
    for z in range(MAXZ - 1, MINZ - 1, -1):
        ks = {(z, x // 2, y // 2) for (zz, x, y) in G if zz == z + 1}
        for (_, X, Y) in ks:
            q = np.full((512, 512), np.nan, np.float32)
            for dx in (0, 1):
                for dy in (0, 1):
                    c = G.get((z + 1, 2 * X + dx, 2 * Y + dy))
                    if c is not None: q[dy * 256:(dy + 1) * 256, dx * 256:(dx + 1) * 256] = c
            with np.errstate(all='ignore'): G[(z, X, Y)] = np.nanmean(q.reshape(256, 2, 256, 2), axis=(1, 3)).astype(np.float32)
    with mp.Pool(8) as pool: pool.starmap(save, [(z, x, y, h) for (z, x, y), h in G.items()], chunksize=16)
    idx = {}
    for (z, x, y) in G: idx.setdefault(str(z), []).append(f'{x}_{y}')
    idx = {k: sorted(v) for k, v in sorted(idx.items())}; idx['maxz'] = MAXZ; idx['levelling'] = rep
    json.dump(idx, open(f'{OUT}/index.json', 'w'), separators=(',', ':'))
    print({k: len(v) for k, v in idx.items() if isinstance(v, list) and k.isdigit()})
