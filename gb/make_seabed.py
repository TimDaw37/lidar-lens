"""Seabed fallback tiles for LiDAR Lens (live TEST, 15 Nov 2026): EMODnet Digital Bathymetry DTM 2024, mean-sea-level variant
(ESRI ASCII "MSL" tiles D3 D4 D5 E3 E4 E5, CC BY 4.0, not for navigation) as Terrarium lossless WebP under seabed/{z}/{x}/{y}.webp,
zoom 5-10 over 11W-9E, 49-61.5N (zoom 11-17: the zoom 10 tile enlarged in the service worker, gb/seabed-route.js).
A pixel is kept only where it is (at least partly) sea: outside the OpenStreetMap land polygons (osmdata.openstreetmap.de,
ODbL, used here only as a mask) and below +8 m MSL (intertidal ground up to about high water; polders and other land below
sea level stay out because they are inside the land polygons). LiDAR and GEM-15 always come first: the worker only fills pixels they leave empty.
Marker: blue = 1 mod 4 (LiDAR is 0 mod 4, GEM-15 2 mod 4; 3 mod 4 is used by the multibeam patches, gb/make_seabed_patch.py).
Heights are metres relative to mean sea level, quantised to 1/16 m (EMODnet's own precision is far coarser).
usage: python3 gb/make_seabed.py EMOD_VRT LAND_GPKG GEM_INDEX_JSON OUT_DIR"""
import sys, os, json, math, numpy as np, multiprocessing as mp
import rasterio, geopandas as gpd
from rasterio.vrt import WarpedVRT
from rasterio.enums import Resampling
from rasterio.transform import Affine
from rasterio.features import rasterize
from PIL import Image
VRT, LAND, GEMI, OUT = sys.argv[1:5]
Z = 10; W, S, E, N = -11.0, 49.0, 9.0, 61.5; R0 = 6378137 * math.pi; Q = 16; MARK = 1; HMAX = 8.0; SS = 4
def tx(lon, z): return int((lon + 180) / 360 * 2 ** z)
def ty(lat, z): r = math.radians(lat); return int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** z)
X0, X1, Y0, Y1 = tx(W, Z), tx(E, Z), ty(N, Z), ty(S, Z)
RES = 2 * R0 / (256 * 2 ** Z)
def enc(h):   # h float32 256x256 with NaN = empty -> RGBA uint8 (Terrarium, 1/Q m, blue marker)
    ok = np.isfinite(h); v = np.where(ok, np.round((h + 32768) * Q) / Q, 0); vi = np.floor(v).astype(np.int64)
    out = np.zeros((256, 256, 4), np.uint8); out[..., 0] = (vi >> 8) & 255; out[..., 1] = vi & 255
    out[..., 2] = ((np.round((v - vi) * 256).astype(np.int64) & 252) + MARK); out[..., 3] = 255
    out[~ok] = 0; return out
def save(z, x, y, h):
    p = f'{OUT}/{z}/{x}'; os.makedirs(p, exist_ok=True); Image.fromarray(enc(h), 'RGBA').save(f'{p}/{y}.webp', lossless=True, quality=100, method=6, exact=False)
land = None
def strip(ty_):   # one row of zoom 10 tiles: returns {(x,y): float32 tile} and open-sea flags (no land at all in the tile)
    global land
    if land is None: land = gpd.read_file(LAND).to_crs(3857)
    w = (X1 - X0 + 1) * 256; tr = Affine(RES, 0, -R0 + X0 * 256 * RES, 0, -RES, R0 - ty_ * 256 * RES)
    with rasterio.open(VRT) as s, WarpedVRT(s, crs='EPSG:3857', transform=tr, width=w, height=256, resampling=Resampling.bilinear, src_nodata=9999, nodata=float('nan'), dtype='float32') as v:
        A = v.read(1)
    b = (tr.c, tr.f - 256 * RES, tr.c + w * RES, tr.f); g = land.cx[b[0]:b[2], b[1]:b[3]]
    trs = Affine(RES / SS, 0, tr.c, 0, -RES / SS, tr.f)
    L = rasterize(((geom, 1) for geom in g.geometry), out_shape=(256 * SS, w * SS), transform=trs, fill=0, dtype='uint8', all_touched=False) if len(g) else np.zeros((256 * SS, w * SS), np.uint8)
    frac = L.reshape(256, SS, w, SS).mean(axis=(1, 3))
    A[(frac >= 1) | ~(A < HMAX)] = np.nan
    res = {}; opn = {}
    for i in range(X1 - X0 + 1):
        t = A[:, i * 256:(i + 1) * 256]; x = X0 + i
        opn[(x, ty_)] = not frac[:, i * 256:(i + 1) * 256].any()
        if np.isfinite(t).any(): res[(x, ty_)] = t.copy()
    return res, opn
if __name__ == '__main__':
    gem = json.load(open(GEMI)); gem10 = set(gem.get('10', []))
    G = {}; OPN = {}
    with mp.Pool(7) as pool:
        for r, o in pool.imap_unordered(strip, range(Y0, Y1 + 1)):
            G.update({(10,) + k: v for k, v in r.items()}); OPN.update(o); print('strip', len(G), flush=True)
    # open sea: no land in the tile or any of its 8 neighbours, and no GEM-15 tile at zoom 10 there (so the worker can skip LiDAR/GEM)
    op10 = sorted(f'{x}_{y}' for (x, y) in OPN if (10, x, y) in G and f'{x}_{y}' not in gem10 and all(OPN.get((x + dx, y + dy), False) for dx in (-1, 0, 1) for dy in (-1, 0, 1)))
    for z in range(9, 4, -1):
        ks = {(z, x // 2, y // 2) for (zz, x, y) in G if zz == z + 1}
        for (_, X, Y) in ks:
            q = np.full((512, 512), np.nan, np.float32)
            for dx in (0, 1):
                for dy in (0, 1):
                    c = G.get((z + 1, 2 * X + dx, 2 * Y + dy))
                    if c is not None: q[dy * 256:(dy + 1) * 256, dx * 256:(dx + 1) * 256] = c
            with np.errstate(all='ignore'): G[(z, X, Y)] = np.nanmean(q.reshape(256, 2, 256, 2), axis=(1, 3)).astype(np.float32)
    idx = {}
    for (z, x, y), a in G.items(): idx.setdefault(str(z), []).append(f'{x}_{y}')
    with mp.Pool(8) as pool: pool.starmap(save, [(z, x, y, a) for (z, x, y), a in G.items()], chunksize=16)
    idx = {k: sorted(v) for k, v in sorted(idx.items())}; idx['open10'] = op10
    idx['src'] = 'EMODnet Digital Bathymetry (DTM 2024), MSL, CC BY 4.0, doi:10.12770/cf51df64-56f9-4a99-b1aa-36b8d7b743a1'
    json.dump(idx, open(f'{OUT}/index.json', 'w'), separators=(',', ':'))
    print({k: len(v) for k, v in idx.items() if isinstance(v, list)})
