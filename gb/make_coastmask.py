"""Coastline mask for the seabed TEST (live-test only, 15 Nov 2026, Tim's steer: "coastline defined explicitly, no LiDAR beyond it").
Land = OpenStreetMap land polygons (osmdata.openstreetmap.de, split, WGS84; ODbL; the OSM coastline is mean high water), rasterised
4 x 4 supersampled to give 8-bit land coverage (0 = sea, 255 = land) on web-mercator tiles. Built for every zoom 10 tile of the
seabed index (seabed/index.json) that is not open sea, at zoom 10-14; zoom 5-9 are the zoom 10 coverage averaged. Only tiles that
contain the coastline ("mixed") are written, as greyscale PNG under coastmask/{z}/{x}/{y}.png; the index lists, per zoom, the mixed
tiles ("m") and the all-land tiles whose parent is mixed ("l"); anything else under a mixed parent is open sea. The service worker
(gb/seabed-route.js) drops LiDAR / GEM-15 pixels where coverage < 50 % (bilinear from the zoom 14 mask above zoom 14) and shows the
seabed there instead; islands such as Lundy are land polygons and keep their LiDAR.
With a 4th argument (OS Boundary-Line GeoPackage, OGL), the coastline in Great Britain is OS mean high water instead: the
`high_water` lines and the `country_region` outlines (which run to low water) are cut into faces per zoom 10 tile, and each face is
land if most of it is OSM land (so reclaimed marsh behind a sea wall, e.g. Cley, stays land with the mainland while intertidal flats,
estuaries and saltmarsh outside high water are sea). Outside the OS faces (beyond low water, Isle of Man, Channel Islands) OSM decides.
usage: python3 gb/make_coastmask.py LAND_GPKG SEABED_INDEX_JSON OUT_DIR [OS_BOUNDARYLINE_GPKG]"""
import sys, os, json, math, numpy as np, multiprocessing as mp
import geopandas as gpd
from rasterio.transform import Affine
from rasterio.features import rasterize
from PIL import Image
LAND, SIDX, OUT = sys.argv[1:4]; OSG = sys.argv[4] if len(sys.argv) > 4 else None
R0 = 6378137 * math.pi; SS = 4; ZT = 14
if OSG: SS = 2   # 2 x 2 supersampling with the OS faces (face ids as int32 would not fit at 4 x 4)
def lon(x, z): return x / 2 ** z * 360 - 180
def lat(y, z): return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / 2 ** z))))
def keep(x, y):   # Great Britain, Isle of Man and the Channel Islands only (no LiDAR in Lens elsewhere): skip the Continent and Ireland
    lo, la = lon(x + 0.5, 10), lat(y + 0.5, 10)
    if lo > 2.0: return False
    if -6.0 < lo < -4.9 and 49.8 < la < 50.0: return True            # Land's End, Mount's Bay and the Lizard (south of 50.0 N; was missed until 15 Nov 2026)
    if -6.0 < lo < -5.6 and 51.6 < la < 51.85: return True      # the Smalls (west of the Ireland cut)
    if la < 50.0 and not (-3.0 < lo < -1.9 and la > 48.9): return False   # the Channel Islands incl. Les Minquiers
    if lo < -5.8 and 51.3 < la < 55.25: return False           # Ireland (Pembrokeshire and Kintyre stay in)
    return True
def keep2(x, y):
    lo, la = lon(x + 0.5, 10), lat(y + 0.5, 10)
    if -6.6 < lo < -6.1 and 49.8 < la < 50.1: return True        # Isles of Scilly
    return keep(x, y)
land = None; hwl = None; crb = None
def os_faces(x0, y0, w):   # faces of the OS high water / low water outlines inside one tile box (3857), as a list of polygons
    import shapely
    from shapely.geometry import box
    b = box(x0, y0 - w, x0 + w, y0); bb = b.buffer(w * 0.01, join_style='mitre'); big = b.buffer(w * 0.05, join_style='mitre')
    ls = [g for g in hwl.geometry.values[hwl.sindex.query(big)]] + [g for g in crb.geometry.values[crb.sindex.query(big)]]
    if not ls: return None
    if not any(shapely.intersects(g, bb) for g in ls): return None   # only far-off outlines / bounding boxes matched (e.g. Scotland's around the Isle of Man): OSM decides
    # lines are cut to a bigger box so they cross the tile box outline and get noded with it; lines cut exactly at the tile box
    # could end a hair short of it and leave every face open (the Beauly Firth was one land face until 15 Nov 2026)
    ls = [shapely.intersection(g, big) for g in ls]; ls = [g for g in ls if not g.is_empty] + [bb.exterior]
    F = shapely.polygonize(shapely.get_parts(shapely.union_all(shapely.get_parts(shapely.GeometryCollection(ls))))).geoms
    return [f for f in F if bb.contains(f.representative_point())]
def tile(xy):
    global land, hwl, crb
    x, y = xy
    if land is None:
        land = gpd.read_file(LAND).to_crs(3857)
        if OSG:
            hwl = gpd.read_file(OSG, layer='high_water').to_crs(3857)
            cr = gpd.read_file(OSG, layer='country_region').to_crs(3857); crb = gpd.GeoDataFrame(geometry=cr.boundary.values, crs=3857)
    res = 2 * R0 / (256 * 2 ** 10); x0 = -R0 + x * 256 * res; y0 = R0 - y * 256 * res
    g = land.cx[x0:x0 + 256 * res, y0 - 256 * res:y0]
    n = 256 * 2 ** (ZT - 10)
    if not len(g): return xy, None, 0
    tr = Affine(res * 256 / (n * SS), 0, x0, 0, -res * 256 / (n * SS), y0)
    L = rasterize(((geom, 1) for geom in g.geometry), out_shape=(n * SS, n * SS), transform=tr, fill=0, dtype='uint8')
    if OSG:
        F = os_faces(x0, y0, 256 * res)
        if F:
            Fid = rasterize(((f, i + 1) for i, f in enumerate(F)), out_shape=(n * SS, n * SS), transform=tr, fill=0, dtype='int32')
            cnt = np.bincount(Fid.ravel(), minlength=len(F) + 1); lan = np.bincount(Fid.ravel(), weights=L.ravel(), minlength=len(F) + 1)
            vote = np.zeros(len(F) + 1, np.uint8); vote[1:] = (lan[1:] > 0.5 * np.maximum(cnt[1:], 1)).astype(np.uint8)
            # inside a face: the face's vote; outside every face: OSM. A face OSM never touches (cnt 0) is skipped (sea)
            inside = Fid > 0; L = np.where(inside, vote[Fid], L).astype(np.uint8); del Fid
    C = L.reshape(n, SS, n, SS).sum(axis=(1, 3), dtype=np.uint16).astype(np.float32) / (SS * SS)   # coverage 0..1 at zoom 14
    del L
    out = {}
    for z in range(ZT, 9, -1):
        f = 2 ** (ZT - z); A = C if f == 1 else C.reshape(n // f, f, n // f, f).mean(axis=(1, 3))
        k = 2 ** (z - 10)
        for i in range(k):
            for j in range(k):
                t = A[j * 256:(j + 1) * 256, i * 256:(i + 1) * 256]; q = np.round(t * 255).astype(np.uint8)
                key = (z, x * k + i, y * k + j)
                if q.min() == 255: out[key] = 'l'
                elif q.max() == 0: out[key] = 's'
                else:
                    p = f'{OUT}/{z}/{key[1]}'; os.makedirs(p, exist_ok=True); Image.fromarray(q, 'L').save(f'{p}/{key[2]}.png', optimize=True); out[key] = 'm'
    c10 = C.reshape(256, n // 256, 256, n // 256).mean(axis=(1, 3))
    return xy, out, c10
if __name__ == '__main__':
    I = json.load(open(SIDX)); op = set(I['open10'])
    T = [tuple(map(int, k.split('_'))) for k in I['10'] if k not in op]
    T = [t for t in T if keep2(*t)]
    print('zoom 10 tiles', len(T), flush=True)
    CL = {}; C10 = {}
    with mp.Pool(4 if OSG else 6) as pool:
        for n_, (xy, out, c10) in enumerate(pool.imap_unordered(tile, T)):
            if out is None: CL[(10,) + xy] = 's'; C10[xy] = np.zeros((256, 256), np.float32)
            else: CL.update(out); C10[xy] = c10
            if n_ % 50 == 0: print(n_, flush=True)
    # zoom 5-9: zoom 10 coverage averaged; zoom 10 tiles not built count as land if they are not in the seabed index (no sea) and sea if open
    s10 = set(I['10'])
    def cov10(x, y):
        if (x, y) in C10: return C10[(x, y)]
        k = f'{x}_{y}'; return np.zeros((256, 256), np.float32) if k in s10 else np.ones((256, 256), np.float32)
    level = {xy: None for xy in C10}
    for z in range(9, 4, -1):
        parents = {(x >> (10 - z), y >> (10 - z)) for (x, y) in C10}
        for (X, Y) in parents:
            k = 2 ** (10 - z); A = np.zeros((256, 256), np.float32); sub = 256 // k
            if k > 64: continue
            for i in range(k):
                for j in range(k):
                    c = cov10(X * k + i, Y * k + j); A[j * sub:(j + 1) * sub, i * sub:(i + 1) * sub] = c.reshape(sub, k, sub, k).mean(axis=(1, 3))
            q = np.round(A * 255).astype(np.uint8)
            if q.min() == 255: CL[(z, X, Y)] = 'l'
            elif q.max() == 0: CL[(z, X, Y)] = 's'
            else:
                p = f'{OUT}/{z}/{X}'; os.makedirs(p, exist_ok=True); Image.fromarray(q, 'L').save(f'{p}/{Y}.png', optimize=True); CL[(z, X, Y)] = 'm'
    idx = {'b10': sorted(f'{x}_{y}' for (x, y) in C10), 'm': {}, 'l': {}, 'top': 5, 'maxz': ZT, 'src': 'OpenStreetMap land polygons (osmdata.openstreetmap.de), ODbL; coastline = mean high water'}
    for (z, x, y), c in CL.items():
        if c == 'm': idx['m'].setdefault(str(z), []).append(f'{x}_{y}')
        elif c == 'l' and (z == 5 or CL.get((z - 1, x >> 1, y >> 1)) == 'm'): idx['l'].setdefault(str(z), []).append(f'{x}_{y}')
    for d in ('m', 'l'): idx[d] = {k: sorted(v) for k, v in sorted(idx[d].items(), key=lambda kv: int(kv[0]))}
    json.dump(idx, open(f'{OUT}/index.json', 'w'), separators=(',', ':'))
    print({d: {k: len(v) for k, v in idx[d].items()} for d in ('m', 'l')})
