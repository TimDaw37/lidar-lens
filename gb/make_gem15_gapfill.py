"""GEM-15 gap fill (14 Nov 2026, Perth, t2204u). Stage 2 (gem15-fallback build/stage2.py) built a zoom 13 GEM-15 tile only where at least
MIN_NEED=64 of its pixels were GEM-15 land not covered by the Scottish LiDAR overview (ov13), so small coverage gaps (< 64 px at zoom 13,
about 0.8 ha) were left blank in the lens. This adds every zoom 13 tile with any such pixel within 2 px of uncovered ground, inside the
GEM-15 mask, to gem15/13/ and appends them to index.json. Part 1 lists candidates (extra_need.json); part 2 encodes them as stage 2 does."""
# ---- part 1
import os, glob, json, numpy as np
from scipy.ndimage import binary_dilation
from multiprocessing import Pool
B='/workspace/lidar-cvat/gem15-fallback-20261113/'; OV='/workspace/lidar-scotland/live/ov13/'
idx=set(json.load(open('index.json'))['13'])
parts={}
for f in glob.glob(B+'z13parts/*.npy'): parts.setdefault(os.path.basename(f).split('.')[0],[]).append(f)
def one(item):
    k,fs=item
    if k in idx: return None
    a=None
    for f in fs:
        g=np.load(f); a=g if a is None else np.where(np.isfinite(a),a,g)
    gv=np.isfinite(a)
    if not os.path.exists(OV+k+'.bin'): return (k,int(gv.sum()),int(gv.sum()),'noov')
    lid=np.isfinite(np.fromfile(OV+k+'.bin','float32').reshape(256,256))
    need=int((gv&~lid).sum()); need2=int((gv&binary_dilation(~lid,iterations=2)).sum())
    return (k,need,need2,'ov')
with Pool(7) as p: R=[r for r in p.imap_unordered(one,list(parts.items()),chunksize=32) if r]
json.dump(R,open('extra_need.json','w'))
print('not in index',len(R),'need>=1',sum(r[1]>=1 for r in R),'dilated need>=1',sum(r[2]>=1 for r in R),'noov',sum(r[3]=='noov' for r in R))

# ---- part 2
import math
from PIL import Image
B='/workspace/lidar-cvat/gem15-fallback-20261113/'; O='gem15add/'
M=json.load(open('mask.json')); nr,nc=M['nr'],M['nc']; A=np.zeros(nr*nc,np.uint8)
for i,r in enumerate(M['rows']):
    for k in range(0,len(r),2): A[i*nc+r[k]:i*nc+r[k+1]]=1
A=A.reshape(nr,nc)
def t2lat(y,n): return math.degrees(math.atan(math.sinh(math.pi*(1-2*y/n))))
def t2lng(x,n): return x/n*360-180
def inmask(x,y,z=13):
    n=2**z; r0=max(0,math.floor((M['lat1']-t2lat(y,n))/M['dlat'])); r1=min(nr-1,math.floor((M['lat1']-t2lat(y+1,n))/M['dlat']))
    c0=max(0,math.floor((t2lng(x,n)-M['lng0'])/M['dlng'])); c1=min(nc-1,math.floor((t2lng(x+1,n)-M['lng0'])/M['dlng']))
    return r1>=r0 and c1>=c0 and A[r0:r1+1,c0:c1+1].any()
def enc(d,out):   # as gem15-fallback stage2.enc
    m=np.isfinite(d); v=np.round(np.where(m,d,0)*16)/16+32768.0
    R=np.floor(v/256); G=np.floor(v)-R*256; Bc=np.round((v-np.floor(v))*256)+2
    rgba=np.dstack([R,G,Bc,np.where(m,255,0)]).astype('uint8'); rgba[~m,:3]=0
    assert ((rgba[...,2][m]&3)==2).all()
    os.makedirs(os.path.dirname(out),exist_ok=True)
    Image.fromarray(rgba,'RGBA').save(out,'WEBP',lossless=True,quality=100,method=2,exact=True)
    if (np.asarray(Image.open(out).convert('RGBA'))[m]!=rgba[m]).any(): raise RuntimeError('webp mismatch '+out)
R=json.load(open('extra_need.json')); add=[]
for k,need,need2,src in R:
    if need2<1: continue
    x,y=map(int,k.split('_'))
    if not inmask(x,y): continue
    a=None
    for f in sorted(glob.glob(B+f'z13parts/{k}.*npy')):
        g=np.load(f); a=g if a is None else np.where(np.isfinite(a),a,g)
    enc(a,f'{O}13/{x}/{y}.webp'); add.append(k)
idx=json.load(open('lt_index.json')); assert not set(add)&set(idx['13'])
idx['13']=idx['13']+sorted(add); idx['added14nov']='z13 tiles with any GEM-15 pixel not covered by the Scottish ov13 LiDAR overview within 2 px (MIN_NEED 64 had left small coverage gaps blank, Perth t2204u)'
json.dump(idx,open('index_new.json','w'),separators=(',',':'))
print('added',len(add),'index13',len(idx['13']),'4022_2533' in add)
