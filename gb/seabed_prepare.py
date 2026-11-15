"""Prepare downloaded UKHO ADMIRALTY (Seabed Mapping) surveys for gb/make_seabed_patch.py (live TEST, 15 Nov 2026).
Put the downloads (zips, .bag, .asc, regular-grid .xyz) in one folder, then:
  python3 gb/seabed_prepare.py /workspace/research/seabed-doggerland/ukho /workspace/research/seabed-doggerland/ukho/tif [--srs EPSG:32630]
Each grid becomes a float32 GeoTIFF (band 1 = elevation, or depth: make_seabed_patch.py flips positive depths and levels every grid
to EMODnet MSL, since UKHO surveys are reduced to chart datum, roughly LAT). BAG: band 1 (elevation). ESRI ASCII / XYZ: CRS from a .prj
if present, else --srs (check the survey's metadata; UKHO ASCII downloads are usually WGS84 lat/long or UTM 30N in the Bristol Channel).
Uses the GDAL bundled with rasterio (it has the BAG and XYZ drivers)."""
import sys, os, glob, zipfile, numpy as np, rasterio
a = sys.argv[1:]; SRS = None
if '--srs' in a: i = a.index('--srs'); SRS = a[i + 1]; a = a[:i] + a[i + 2:]
SRC, OUT = a; os.makedirs(OUT, exist_ok=True); U = os.path.join(SRC, 'unzipped')
for z in glob.glob(os.path.join(SRC, '*.zip')):
    with zipfile.ZipFile(z) as f: f.extractall(U)
fs = [f for e in ('bag', 'asc', 'xyz', 'tif', 'tiff') for f in glob.glob(os.path.join(SRC, '**', '*.' + e), recursive=True) if not f.startswith(os.path.abspath(OUT))]
for f in sorted(fs):
    if os.path.abspath(f).startswith(os.path.abspath(OUT)): continue
    b = os.path.splitext(os.path.basename(f))[0]; o = os.path.join(OUT, b + '.tif')
    try:
        with rasterio.open(('XYZ:' if f.lower().endswith('.xyz') else '') + f) as s:
            A = s.read(1).astype('float32'); nd = s.nodata
            if nd is not None: A[A == nd] = np.nan
            A[(A > 1e6) | (A < -1e6)] = np.nan
            crs = s.crs or (rasterio.crs.CRS.from_string(SRS) if SRS else None)
            if crs is None: print('SKIP (no CRS, give --srs):', f); continue
            p = dict(driver='GTiff', dtype='float32', count=1, width=s.width, height=s.height, crs=crs, transform=s.transform, nodata=np.nan, compress='deflate', predictor=3, tiled=True)
        with rasterio.open(o, 'w', **p) as d: d.write(A, 1)
        v = A[np.isfinite(A)]; print(f'{b}: {s.width}x{s.height} res {abs(s.transform.a):.2f} {crs} values {v.min():.1f}..{v.max():.1f}' if v.size else f'{b}: empty')
    except Exception as e: print('FAIL', f, e)
print('Then: python3 gb/make_seabed_patch.py EMOD_MSL.vrt OUT/seabed/mb [--maxz 16] <JNCC tifs first or last> ' + OUT + '/*.tif')
