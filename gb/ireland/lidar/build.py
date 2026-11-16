"""Phase B step 1, stage 3: zoom 17 packs. For each zoom 14 tile (a 2048 px block of zoom 17, plus a 32 px margin) the converted GSI
tiles are warped to web mercator in priority order (finer source first, then newer), the keep mask (patches >= ~1 km2) applied, and the
edges blended into GEM-15 over F px: within F px of a large gap that GEM-15 covers, h = w*LiDAR + (1-w)*GEM, w = smoothstep(d/F); pixels
with w < 0.5 carry the GEM-15 marker (blue = 2 mod 4) so the page never calls them LiDAR or m OD. LiDAR pixels: 1/64 m steps, blue = 0 mod 4.
Each block writes one pack, ie/lidar/17/{bx}_{by}.pak: 512-byte header of 64 x (offset, length) uint32 LE (slot = row*8 + col), then
the lossless WebP tiles; and a zoom 16 copy of the block (1024 px) for the pyramid."""
import json,os,sys,glob,io,time,struct,numpy as np,rasterio,warnings
from rasterio.vrt import WarpedVRT
from rasterio.warp import transform_bounds,Resampling
from affine import Affine
from scipy import ndimage
from PIL import Image
from multiprocessing import Pool
warnings.filterwarnings('ignore')
R=20037508.342789244; Z=17; PX=2*R/2**Z/256; MG=32; F=16; N=2048+2*MG
OUT=os.environ.get('OUT','out')
def yr(d):
    import re; m=re.findall(r'(19|20)(\d\d)',str(d or '')); return int(m[-1][0]+m[-1][1]) if m else 0
M=[m for m in json.load(open('convert.json')) if 'err' not in m]
for m in M:
    m['path']=f"src/{m['layer']}/{m['name']}.tif"; m['eres']=m['res']*m['k']
    with rasterio.open(m['path']) as s: m['mb']=transform_bounds(s.crs,'EPSG:3857',*s.bounds)
M.sort(key=lambda m:(round(m['eres'],2),-yr(m['date'])))
GEM=[]
for p in sorted(glob.glob('/workspace/ireland-phaseA/gem/src/*.tif')):
    with rasterio.open(p) as s: GEM.append((p,transform_bounds(s.crs,'EPSG:3857',*s.bounds)))
def blocks():
    B=set()
    for m in M:
        l,b,r,t=m['mb']; x0=int((l+R)/(2*R)*2**14); x1=int((r+R)/(2*R)*2**14); y0=int((R-t)/(2*R)*2**14); y1=int((R-b)/(2*R)*2**14)
        for x in range(x0,x1+1):
            for y in range(y0,y1+1): B.add((x,y))
    return sorted(B)
def inter(bb,tr):
    l,t=tr.c,tr.f; r=l+N*PX; b=t-N*PX; return not (bb[2]<=l or bb[0]>=r or bb[3]<=b or bb[1]>=t)
def warp(path,tr,rs,nod=np.nan):
    with rasterio.open(path) as s, WarpedVRT(s,crs='EPSG:3857',transform=tr,width=N,height=N,resampling=rs,src_nodata=s.nodata,nodata=np.nan) as v:
        return v.read(1).astype('float32')
def enc(h,gm):
    m=np.isfinite(h); v=np.round(np.where(m,h,0)*64)/64+32768.0
    Rr=np.floor(v/256); G=np.floor(v)-Rr*256; B=np.round((v-np.floor(v))*256)+np.where(gm,2,0)
    rgba=np.dstack([Rr,G,B,np.where(m,255,0)]).astype('uint8'); rgba[~m,:3]=0
    bio=io.BytesIO(); Image.fromarray(rgba,'RGBA').save(bio,'WEBP',lossless=True,quality=100,method=2,exact=True); b=bio.getvalue()
    if (np.asarray(Image.open(io.BytesIO(b)).convert('RGBA'))[m]!=rgba[m]).any(): raise RuntimeError('webp mismatch')
    return b
def pack(tiles):   # {slot: bytes}
    hd=[0]*128; body=b''; off=512
    for s in sorted(tiles): hd[2*s]=off; hd[2*s+1]=len(tiles[s]); body+=tiles[s]; off+=len(tiles[s])
    return struct.pack('<128I',*hd)+body
def occ(slots):
    d=[0]*16
    for s in slots: d[s>>2]|=1<<(s&3)
    return ''.join('%x'%x for x in d)
def one(bxy):
    bx,by=bxy; key=f'{bx}_{by}'; fo=f'{OUT}/17/{key}.pak'; fz=f'{OUT}/z16/{key}.npz'
    if os.path.exists(fz) or os.path.exists(fz+'.empty'): return None
    os.makedirs(f'{OUT}/17',exist_ok=True); os.makedirs(f'{OUT}/z16',exist_ok=True)
    t0=time.time(); tr=Affine(PX,0,bx*2048*PX-R-MG*PX,0,-PX,R-by*2048*PX+MG*PX)
    h=np.full((N,N),np.nan,'float32'); used=[]
    for m in M:
        if not inter(m['mb'],tr): continue
        a=warp(m['path'],tr,Resampling.average if m['eres']<0.7 else Resampling.bilinear)
        f=np.isnan(h)&np.isfinite(a)
        if f.any(): h[f]=a[f]; used.append(m['layer'])
    with rasterio.open('keep.tif') as k, WarpedVRT(k,crs='EPSG:3857',transform=tr,width=N,height=N,resampling=Resampling.nearest,nodata=0) as v: kp=v.read(1)>0
    h[~kp]=np.nan; V=np.isfinite(h)
    core=V[MG:-MG,MG:-MG]
    if not core.any(): open(fz+'.empty','w').close(); return None
    g=np.full((N,N),np.nan,'float32')
    for p,bb in GEM:
        if inter(bb,tr):
            a=warp(p,tr,Resampling.bilinear); f=np.isnan(g)&np.isfinite(a); g[f]=a[f]
    big=~ndimage.binary_closing(V,structure=np.ones((3,3)),iterations=4,border_value=1)   # gaps wider than ~8 px (small specks are healed by the page)
    T=big&np.isfinite(g)
    gm=np.zeros((N,N),bool)
    if T.any():
        d=ndimage.distance_transform_edt(~T); w=np.clip(d/F,0,1); w=w*w*(3-2*w)
        bl=V&np.isfinite(g)&(w<1); h[bl]=w[bl]*h[bl]+(1-w[bl])*g[bl]; gm=bl&(w<0.5)
    h=h[MG:-MG,MG:-MG]; gm=gm[MG:-MG,MG:-MG]
    tiles={}
    for j in range(8):
        for i in range(8):
            hh=h[j*256:(j+1)*256,i*256:(i+1)*256]
            if np.isfinite(hh).sum()>=16: tiles[j*8+i]=enc(hh,gm[j*256:(j+1)*256,i*256:(i+1)*256])
    if not tiles: open(fz+'.empty','w').close(); return None
    os.makedirs(f'{OUT}/17',exist_ok=True); os.makedirs(f'{OUT}/z16',exist_ok=True)
    open(fo,'wb').write(pack(tiles))
    q=h.reshape(1024,2,1024,2); c=np.isfinite(q).sum(axis=(1,3)); s=np.nansum(q,axis=(1,3)); h16=np.where(c>=2,s/np.maximum(c,1),np.nan).astype('float32')
    g16=(gm.reshape(1024,2,1024,2).sum(axis=(1,3))*2>=np.maximum(c,1))&(c>=2)
    np.savez(fz,h=h16,g=g16)
    return {'k':key,'occ':occ(tiles),'n':len(tiles),'bytes':os.path.getsize(fo),'valid_px':int(np.isfinite(h).sum()),'lidar_px':int((np.isfinite(h)&~gm).sum()),'used':sorted(set(used)),'s':time.time()-t0}
if __name__=='__main__':
    B=blocks(); print(len(B),'blocks',len(M),'sources',time.strftime('%H:%M:%S'),flush=True)
    if len(sys.argv)>2: B=B[:int(sys.argv[2])]
    t=time.time(); res=[]
    with Pool(int(sys.argv[1]) if len(sys.argv)>1 else 6) as p:
        for i,r in enumerate(p.imap_unordered(one,B,chunksize=2)):
            if r: res.append(r)
            if i%100==0: print(i,len(B),len(res),'%.0fs'%(time.time()-t),time.strftime('%H:%M:%S'),flush=True)
    old=json.load(open(f'{OUT}/z17.json')) if os.path.exists(f'{OUT}/z17.json') else []
    have={r['k'] for r in res}; res+= [r for r in old if r['k'] not in have]
    json.dump(res,open(f'{OUT}/z17.json','w')); print('BUILD_DONE',len(res),'packs','%.0fs'%(time.time()-t),time.strftime('%H:%M:%S'),flush=True)
