"""After build_tiles.py: z11..z8 overview tiles from z12 (2x2 mean of decoded heights, nodata-aware),
coverage + gaps GeoJSON from per-unit z12 masks, SUMMARY.md."""
import os, glob, json, time, numpy as np, mercantile, rasterio
from PIL import Image
from rasterio.features import shapes
from rasterio.transform import from_bounds as tfb
from shapely.geometry import shape
from shapely.ops import unary_union
import geopandas as gpd
import sys; sys.argv=['x']
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'build_tiles.py')).read().split("if __name__=='__main__':")[0])

def dec(f):
    a=np.asarray(Image.open(f).convert('RGBA')).astype('float64')
    h=a[...,0]*256+a[...,1]+a[...,2]/256-32768; h[a[...,3]==0]=np.nan; return h

def overview():
    for z in range(UZ-1,7,-1):
        kids=glob.glob(f'{OUT}/{z+1}/*/*.webp'); parents=set()
        for f in kids:
            x=int(f.split('/')[-2]); y=int(os.path.basename(f)[:-5]); parents.add((x//2,y//2))
        n=0
        for (px,py) in sorted(parents):
            big=np.full((512,512),np.nan)
            for dx in (0,1):
                for dy in (0,1):
                    f=f'{OUT}/{z+1}/{2*px+dx}/{2*py+dy}.webp'
                    if os.path.exists(f): big[dy*256:(dy+1)*256,dx*256:(dx+1)*256]=dec(f)
            b=big.reshape(256,2,256,2)
            with np.errstate(invalid='ignore'): d=np.nanmean(b,axis=(1,3)).astype('float32')
            m=np.isfinite(d)
            if m.any(): encode_save(d,m,f'{OUT}/{z}/{px}/{py}.webp'); n+=1
        print('z',z,n,'tiles',flush=True)

def coverage():
    files=glob.glob(f'{COV}/*.npz'); xs=[int(os.path.basename(f).split('_')[0]) for f in files]; ys=[int(os.path.basename(f)[:-4].split('_')[1]) for f in files]
    x0,x1,y0,y1=min(xs),max(xs),min(ys),max(ys)
    W=(x1-x0+1)*256; H=(y1-y0+1)*256
    data=np.zeros((H,W),'uint8'); poly=np.zeros((H,W),'uint8')
    for f,x,y in zip(files,xs,ys):
        z=np.load(f); data[(y-y0)*256:(y-y0+1)*256,(x-x0)*256:(x-x0+1)*256]=z['data']; poly[(y-y0)*256:(y-y0+1)*256,(x-x0)*256:(x-x0+1)*256]=z['poly']
    b0=mercantile.xy_bounds(x0,y0,UZ); b1=mercantile.xy_bounds(x1,y1,UZ)
    tr=tfb(b0.left,b1.bottom,b1.right,b0.top,W,H)
    gap=(poly==1)&(data==0)
    def poly_of(mask):
        g=[shape(s) for s,v in shapes(mask.astype('uint8'),mask=mask,transform=tr) if v==1]
        return gpd.GeoSeries([unary_union(g)] if g else [],crs=3857)
    cov=poly_of(data==1).to_crs(4326); gp=poly_of(gap)
    gpd.GeoDataFrame({'name':['EA LiDAR DTM 1m coverage (tiled)']},geometry=cov).to_file(f'{ROOT}/coverage.geojson',driver='GeoJSON')
    gaps=gp.explode(index_parts=False).to_crs(27700); gaps=gaps[gaps.area>0]
    gdf=gpd.GeoDataFrame({'area_m2':gaps.area.round(0).values},geometry=gaps.values,crs=27700)
    gdf['centroid_bng']=[f'{int(c.x)},{int(c.y)}' for c in gdf.centroid]
    gdf.to_crs(4326).to_file(f'{ROOT}/coverage_gaps.geojson',driver='GeoJSON')
    return gdf

if __name__=='__main__':
    t=time.time(); overview(); gaps=coverage()
    man=json.load(open(MAN)); us=man['units']
    failed={k:v.get('error') for k,v in us.items() if v.get('status')!='done'}
    counts={}; sizes={}
    for z in range(8,ZMAX+1):
        fs=glob.glob(f'{OUT}/{z}/*/*.webp'); counts[z]=len(fs); sizes[z]=sum(os.path.getsize(f) for f in fs)
    big=gaps.sort_values('area_m2',ascending=False)
    lines=[f'| {r.centroid_bng} | {r.area_m2/1e4:.2f} |' for r in big.head(25).itertuples()]
    s=f"""# LiDAR Lens tiles: summary
Built {time.strftime('%Y-%m-%d %H:%M %Z')}. Source: Environment Agency LiDAR Composite DTM 1 m (2022 composite), WCS 2.0.1 coverage {COVID}, OGL v3 (c) Environment Agency.
Area: {os.environ.get('LENS_AREA','area polygon')}, buffered = {man['buffer_area_km2']:.0f} km2. Pixels outside the buffer are transparent.
Format: Terrarium (h = R*256 + G + B/256 - 32768 m), 1/64 m steps, alpha 0 = nodata, lossless WebP (exact, every tile verified by decoding), XYZ web-mercator {{z}}/{{x}}/{{y}}.webp, average resampling z<16, bilinear z16-17; z8-11 are 2x2 means of the level below.

## Tiles
| zoom | tiles | MB |
|---|---|---|
""" + '\n'.join(f'| {z} | {counts[z]:,} | {sizes[z]/1e6:.1f} |' for z in counts) + f"""
| **total** | **{sum(counts.values()):,}** | **{sum(sizes.values())/1e6:.0f}** |

Work units: {sum(1 for v in us.values() if v.get('status')=='done')}/{len(us)} done. Failed/not done: {failed if failed else 'none'}.

## Coverage gaps (inside the buffered county, at z12 resolution, about 24 m pixels)
Total gap area: {gaps.area_m2.sum()/1e6:.3f} km2 in {len(gaps)} pieces ({gaps.area_m2.sum()/1e6/man['buffer_area_km2']*100:.3f}% of the area). Largest (BNG centroid, hectares):
| centroid E,N | ha |
|---|---|
""" + '\n'.join(lines) + """

Files: tiles/, coverage.geojson (where there is data), coverage_gaps.geojson (no EA data inside the buffer), manifest.json (per-unit log), area polygon geojson (boundary).
"""
    open(f'{ROOT}/SUMMARY.md','w').write(s); print(s); print('took',time.time()-t)
