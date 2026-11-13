"""Stage 1: GEM-15 DTM (EGM96, 15 m UTM COGs) -> web-mercator z13 float32 grids (256x256, NaN = none), one .npy per tile and
source cell, only for tiles in the target region: centre inside the Scotland outline (from gb/config-live-test.js), or touching
the Isle of Man or Channel Islands boxes. Heights are left on EGM96 (no datum shift)."""
import os, re, sys, math, glob, json, numpy as np, mercantile, rasterio
from rasterio.vrt import WarpedVRT
from rasterio.enums import Resampling
from rasterio.transform import Affine
from multiprocessing import Pool
B='/workspace/lidar-cvat/gem15-fallback-20261113/'
Z=13; R0=6378137*math.pi; RES=2*R0/(256*2**Z)
cfg=open(B+'repo/gb/config-live-test.js').read()
SC=json.loads(re.search(r"\{c:'scotland',poly:(\[\[.*?\]\])\}",cfg).group(1))
def inpoly(lat,lng,P):
    ins=False; j=len(P)-1
    for i in range(len(P)):
        a,b=P[i],P[j]
        if ((a[0]>lat)!=(b[0]>lat)) and (lng<(b[1]-a[1])*(lat-a[0])/(b[0]-a[0])+a[1]): ins=not ins
        j=i
    return ins
BOX={'iom':(54.02,-4.88,54.45,-4.28),'ci':(48.85,-2.80,49.77,-1.85)}
def region(t):
    b=mercantile.bounds(t); clat=(b.south+b.north)/2; clng=(b.west+b.east)/2
    for k,(s,w,n,e) in BOX.items():
        if b.north>s and b.south<n and b.east>w and b.west<e: return k
    return 'scotland' if inpoly(clat,clng,SC) else None
def cell(f):
    m=re.match(r'w(m?)(\d+)s(\d+)\.tif',os.path.basename(f)); lon=(-1 if m.group(1) else 1)*int(m.group(2)); lat=int(m.group(3))
    out=B+'z13parts/'; os.makedirs(out,exist_ok=True)
    ts=[t for t in mercantile.tiles(lon,lat,lon+1,lat+1,Z) if region(t)]
    if not ts: return (f,0,0)
    x0=min(t.x for t in ts); x1=max(t.x for t in ts)+1; y0=min(t.y for t in ts); y1=max(t.y for t in ts)+1
    tr=Affine(RES,0,-R0+x0*256*RES,0,-RES,R0-y0*256*RES)
    n=0
    with rasterio.open(f) as src, WarpedVRT(src,crs='EPSG:3857',transform=tr,width=(x1-x0)*256,height=(y1-y0)*256,resampling=Resampling.bilinear,src_nodata=float('nan'),nodata=float('nan'),dtype='float32') as v:
        for t in ts:
            a=v.read(1,window=rasterio.windows.Window((t.x-x0)*256,(t.y-y0)*256,256,256))
            if np.isfinite(a).any(): np.save(out+f'{t.x}_{t.y}.{os.path.basename(f)[:-4]}.npy',a.astype('float32')); n+=1
    return (f,len(ts),n)
if __name__=='__main__':
    fs=sorted(glob.glob(B+'src/*.tif'),key=os.path.getsize,reverse=True)
    with Pool(6) as p:
        for r in p.imap_unordered(cell,fs): print(os.path.basename(r[0]),'tiles',r[1],'with data',r[2],flush=True)
