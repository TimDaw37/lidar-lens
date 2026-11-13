"""Stage 2: merge per-cell parts into one z13 grid per tile; decide which z13 tiles the live test needs (GEM-15 land not covered by
the Scottish open LiDAR overview ov13, or anywhere on the Isle of Man / Channel Islands); write Terrarium lossless WebP with the
GEM-15 marker (blue channel = 2 mod 4; LiDAR tiles are always 0 mod 4) for those z13 tiles and a z12-8 pyramid (2x2 nanmean of
all z13 GEM-15 grids). index.json lists the tiles per zoom."""
import os, glob, json, re, sys, numpy as np, mercantile, warnings
from PIL import Image
sys.path.insert(0,os.path.dirname(__file__)); from stage1 import region
B='/workspace/lidar-cvat/gem15-fallback-20261113/'; O=B+'tiles/gem15/'; OV='/workspace/lidar-scotland/live/ov13/'
MIN_NEED=int(os.environ.get('MIN_NEED','64'))
def enc(d,out):
    m=np.isfinite(d); v=np.round(np.where(m,d,0)*16)/16+32768.0
    R=np.floor(v/256); G=np.floor(v)-R*256; Bc=np.round((v-np.floor(v))*256)+2   # 1/16 m steps (0 mod 16), +2 = GEM-15 marker (LiDAR: 0 mod 4)
    rgba=np.dstack([R,G,Bc,np.where(m,255,0)]).astype('uint8'); rgba[~m,:3]=0
    assert ((rgba[...,2][m]&3)==2).all()
    os.makedirs(os.path.dirname(out),exist_ok=True)
    Image.fromarray(rgba,'RGBA').save(out,'WEBP',lossless=True,quality=100,method=2,exact=True)
    if (np.asarray(Image.open(out).convert('RGBA'))[m]!=rgba[m]).any(): raise RuntimeError('webp mismatch '+out)
parts={}
for f in glob.glob(B+'z13parts/*.npy'): parts.setdefault(os.path.basename(f).split('.')[0],[]).append(f)
def one(item):
    k,fs=item; x,y=map(int,k.split('_')); a=None
    for f in fs:
        g=np.load(f); a=g if a is None else np.where(np.isfinite(a),a,g)
    reg=region(mercantile.Tile(x,y,13)); gv=np.isfinite(a); lid=np.zeros_like(gv)
    if os.path.exists(OV+k+'.bin'): lid=np.isfinite(np.fromfile(OV+k+'.bin','float32').reshape(256,256))
    need=int((gv&~lid).sum())
    if need>=MIN_NEED: enc(a,f'{O}13/{x}/{y}.webp')
    return k,a,need,int(lid.sum()),reg
from multiprocessing import Pool
L={}; idx={'13':[]}; stats={'scotland':[0,0],'iom':[0,0],'ci':[0,0]}; needs=[]
with Pool(7) as pool:
    for k,a,need,nl,reg in pool.imap_unordered(one,list(parts.items()),chunksize=16):
        x,y=map(int,k.split('_')); L[(x,y)]=a; needs.append((need,nl,reg,k)); stats[reg][0]+=1
        if need>=MIN_NEED: stats[reg][1]+=1; idx['13'].append(k)
print('z13 tiles with GEM-15 data / needed, by region:',stats,flush=True)
json.dump(needs,open(B+'build/needs.json','w'))
for z in range(12,7,-1):
    P={}
    for (x,y) in L: P.setdefault((x//2,y//2),[]).append((x,y))
    N={}; idx[str(z)]=[]
    for (px,py),ch in P.items():
        big=np.full((512,512),np.nan,'float32')
        for (x,y) in ch: dx,dy=x-2*px,y-2*py; big[dy*256:(dy+1)*256,dx*256:(dx+1)*256]=L[(x,y)]
        with warnings.catch_warnings():
            warnings.simplefilter('ignore'); d=np.nanmean(big.reshape(256,2,256,2),axis=(1,3)).astype('float32')
        if np.isfinite(d).sum()>=16: N[(px,py)]=d; idx[str(z)].append(f'{px}_{py}'); enc(d,f'{O}{z}/{px}/{py}.webp')
    L=N; print('z',z,len(N),flush=True)
idx.update(v=1,src='GEM-15 v1 (Google Research, CC BY 4.0, experimental): bare-earth dtm band, EGM96 heights, 15 m, resampled bilinear to web-mercator z13',
  marker='Terrarium blue channel = 2 mod 4 marks GEM-15 pixels (LiDAR tiles are 0 mod 4); heights quantised to 1/16 m then +2/256 m',minNeed=MIN_NEED)
json.dump(idx,open(O+'index.json','w'),separators=(',',':'))
print('index',{k:len(v) for k,v in idx.items() if isinstance(v,list)})
