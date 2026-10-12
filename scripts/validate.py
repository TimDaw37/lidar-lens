"""Validate: (1) random z17/z15 tiles decode and match EA source heights at pixel centres (fresh WCS fetch);
(2) seams: along every z12 unit boundary, compare height steps across the boundary with steps just inside, and count nodata along edges."""
import os, glob, random, json, numpy as np, mercantile, sys
from PIL import Image
from pyproj import Transformer
from rasterio.io import MemoryFile
sys.argv=['x']; exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'build_tiles.py')).read().split("if __name__=='__main__':")[0])
from scipy.ndimage import map_coordinates
def dec(f):
    a=np.asarray(Image.open(f).convert('RGBA')).astype('float64')
    h=a[...,0]*256+a[...,1]+a[...,2]/256-32768; h[a[...,3]==0]=np.nan; return h
tr=Transformer.from_crs(3857,27700,always_xy=True)
random.seed(1); res={'height_check':[], 'seams':{}}
for z in (17,15):
    fs=glob.glob(f'{OUT}/{z}/*/*.webp'); 
    for f in random.sample(fs,12 if z==17 else 4):
        x=int(f.split('/')[-2]); y=int(os.path.basename(f)[:-5]); h=dec(f); b=mercantile.xy_bounds(x,y,z)
        px=(b.right-b.left)/256; jj,ii=np.mgrid[0:256:8,0:256:8]
        mx=b.left+(ii+0.5)*px; my=b.top-(jj+0.5)*px; E,N=tr.transform(mx,my)
        x0,y0,x1,y1=int(E.min())-5,int(N.min())-5,int(E.max())+6,int(N.max())+6
        with MemoryFile(fetch(x0,y0,x1,y1)) as m, m.open() as s: a=s.read(1).astype('float64'); t=s.transform
        a[(a<-1000)|(a>5000)]=np.nan
        col=(E-t.c)/t.a-0.5; row=(N-t.f)/t.e-0.5
        src=map_coordinates(a,[row.ravel(),col.ravel()],order=1,mode='nearest').reshape(E.shape)
        tile=h[jj,ii]; ok=np.isfinite(src)&np.isfinite(tile)
        d=np.abs(src-tile)[ok]
        res['height_check'].append(dict(tile=f'{z}/{x}/{y}',n=int(ok.sum()),median_abs=float(np.median(d)) if d.size else None,p95=float(np.percentile(d,95)) if d.size else None,max=float(d.max()) if d.size else None))
# seams at z17 along z12 unit boundaries
man=json.load(open(MAN)); units=[tuple(map(int,k.split('_'))) for k,v in man['units'].items() if v.get('status')=='done']
us=set(units); across=[]; inside=[]; gaps_edge=0; edges=0
for (ux,uy) in units:
    for dx,dy in ((1,0),(0,1)):
        if (ux+dx,uy+dy) not in us: continue
        for k in range(32):
            if dx: A=(ux*32+31,uy*32+k); B=(ux*32+32,uy*32+k)
            else: A=(ux*32+k,uy*32+31); B=(ux*32+k,uy*32+32)
            fa=f'{OUT}/17/{A[0]}/{A[1]}.webp'; fb=f'{OUT}/17/{B[0]}/{B[1]}.webp'
            if not (os.path.exists(fa) and os.path.exists(fb)): continue
            ha=dec(fa); hb=dec(fb); edges+=1
            if dx: ea,eb,ia=ha[:,-1],hb[:,0],ha[:,-2]
            else: ea,eb,ia=ha[-1,:],hb[0,:],ha[-2,:]
            m=np.isfinite(ea)&np.isfinite(eb)&np.isfinite(ia)
            gaps_edge+=int((np.isfinite(ea)!=np.isfinite(eb)).sum())
            across+=list(np.abs(ea-eb)[m]); inside+=list(np.abs(ea-ia)[m])
across=np.array(across); inside=np.array(inside)
res['seams']=dict(tile_pairs=edges,pixels=int(across.size),across_median=float(np.median(across)),across_p99=float(np.percentile(across,99)),
  inside_median=float(np.median(inside)),inside_p99=float(np.percentile(inside,99)),across_max=float(across.max()),one_sided_nodata_px=gaps_edge)
json.dump(res,open(f'{ROOT}/validation.json','w'),indent=1); print(json.dumps(res,indent=1))
