# GEM-15 tiles for the RAF Fylingdales gap in the EA LiDAR (North York Moors): z13 from wm1s54 (GEM-15 DTM), z12-8 pyramid;
# same encoding as stage2 (1/16 m, blue = 2 mod 4 marker). Output tiles/13..8 + added.json (keys per zoom).
import numpy as np, mercantile, rasterio, math, os, json, sys
from rasterio.vrt import WarpedVRT
from rasterio.enums import Resampling
from rasterio.transform import Affine
from PIL import Image
B='/workspace/lidar-cvat/gem15-fallback-20261113/'
src=open(B+'build/stage2.py').read();exec(src[src.index('def enc('):src.index('parts={}')])
Z=13;R0=6378137*math.pi;RES=2*R0/(256*2**Z)
ts=list(mercantile.tiles(-0.88,54.25,-0.42,54.52,Z));x0=min(t.x for t in ts);x1=max(t.x for t in ts)+1;y0=min(t.y for t in ts);y1=max(t.y for t in ts)+1
tr=Affine(RES,0,-R0+x0*256*RES,0,-RES,R0-y0*256*RES)
G={}
with rasterio.open(B+'src/wm1s54.tif') as s, WarpedVRT(s,crs='EPSG:3857',transform=tr,width=(x1-x0)*256,height=(y1-y0)*256,resampling=Resampling.bilinear,src_nodata=float('nan'),nodata=float('nan'),dtype='float32') as v:
  A=v.read(1)
for t in ts:
  a=A[(t.y-y0)*256:(t.y-y0+1)*256,(t.x-x0)*256:(t.x-x0+1)*256]
  if np.isfinite(a).any(): G[(13,t.x,t.y)]=a
print('z13',len(G))
for z in range(12,7,-1):
  ks={(z,x//2,y//2) for (zz,x,y) in G if zz==z+1}
  for (_,X,Y) in ks:
    q=np.full((512,512),np.nan,np.float32)
    for dx in (0,1):
      for dy in (0,1):
        c=G.get((z+1,2*X+dx,2*Y+dy))
        if c is not None: q[dy*256:(dy+1)*256,dx*256:(dx+1)*256]=c
    with np.errstate(all='ignore'): G[(z,X,Y)]=np.nanmean(q.reshape(256,2,256,2),axis=(1,3))
added={}
for (z,x,y),a in G.items():
  enc(a,f'tiles/{z}/{x}/{y}.webp');added.setdefault(str(z),[]).append(f'{x}_{y}')
json.dump(added,open('added.json','w'));print({k:len(v) for k,v in added.items()})
