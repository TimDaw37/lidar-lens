"""GEM-15 for the island of Ireland (live TEST, 16 Nov 2026, Tim t2277u): Republic and Northern Ireland as one map with the 12 nautical
mile belt cut at the median line with Britain (gb/make_gem_mask.py v2, 'ie' rows). Same recipe as stage1/stage2 (bilinear warp of the
one-degree EGM96 DTM COGs to web-mercator zoom 13, Terrarium lossless WebP, 1/16 m steps, blue = 2 mod 4 marker), written to a separate
tile set gem15/ie/{z}/{x}/{y}.webp with its own index (gem15/ie/index.json) so the published Scotland / Isle of Man / Channel Islands
tiles are not rewritten. Zoom 13 tiles: any GEM-15 pixel and any 'ie' mask cell. Zoom 12-6: 2x2 nanmean pyramid; where a pyramid
tile (or a zoom 13 tile) already exists in gem15/index.json, its pixels are kept and the Irish pixels only fill its empty ones, so the
Irish copy of a shared tile is a superset of the published one (the service worker reads the Irish copy for those keys).
usage: python3 stage_ie.py WORKDIR (with WORKDIR/src/*.tif, WORKDIR/mask-v2.json, WORKDIR/lt_index.json, and EXIST_URL for shared tiles)"""
import os, re, sys, glob, json, math, warnings, numpy as np, mercantile, rasterio, urllib.request, io
from rasterio.vrt import WarpedVRT
from rasterio.enums import Resampling
from rasterio.transform import Affine
from multiprocessing import Pool
from PIL import Image
W=sys.argv[1].rstrip('/')+'/'; Z=13; R0=6378137*math.pi; RES=2*R0/(256*2**Z)
EXIST=os.environ.get('EXIST_URL','https://lidar-lens-gb-live-test.tim-daw.workers.dev/gem15/')
M=json.load(open(W+'mask-v2.json')); nr,nc=M['nr'],M['nc']; IE=np.zeros(nr*nc,np.uint8)
for i,r in enumerate(M['ie']):
    for k in range(0,len(r),2): IE[i*nc+r[k]:i*nc+r[k+1]]=1
IE=IE.reshape(nr,nc); IEc=np.cumsum(np.cumsum(IE,0),1).astype(np.int64)
def t2lat(y,n): return math.degrees(math.atan(math.sinh(math.pi*(1-2*y/n))))
def t2lng(x,n): return x/n*360-180
def in_ie(x,y,z=Z):
    n=2**z; r0=max(0,math.floor((M['lat1']-t2lat(y,n))/M['dlat'])); r1=min(nr-1,math.floor((M['lat1']-t2lat(y+1,n))/M['dlat']))
    c0=max(0,math.floor((t2lng(x,n)-M['lng0'])/M['dlng'])); c1=min(nc-1,math.floor((t2lng(x+1,n)-M['lng0'])/M['dlng']))
    if r1<r0 or c1<c0: return False
    s=IEc[r1,c1]-(IEc[r0-1,c1] if r0 else 0)-(IEc[r1,c0-1] if c0 else 0)+(IEc[r0-1,c0-1] if r0 and c0 else 0)
    return s>0
def cell(f):
    m=re.match(r'w(m?)(\d+)s(\d+)\.tif',os.path.basename(f)); lon=(-1 if m.group(1) else 1)*int(m.group(2)); lat=int(m.group(3))
    out=W+'z13parts/'; os.makedirs(out,exist_ok=True)
    ts=[t for t in mercantile.tiles(lon,lat,lon+1,lat+1,Z) if in_ie(t.x,t.y)]
    if not ts: return (f,0,0)
    x0=min(t.x for t in ts); x1=max(t.x for t in ts)+1; y0=min(t.y for t in ts); y1=max(t.y for t in ts)+1
    tr=Affine(RES,0,-R0+x0*256*RES,0,-RES,R0-y0*256*RES); n=0
    with rasterio.open(f) as src, WarpedVRT(src,crs='EPSG:3857',transform=tr,width=(x1-x0)*256,height=(y1-y0)*256,resampling=Resampling.bilinear,src_nodata=float('nan'),nodata=float('nan'),dtype='float32') as v:
        for t in ts:
            a=v.read(1,window=rasterio.windows.Window((t.x-x0)*256,(t.y-y0)*256,256,256))
            if np.isfinite(a).any(): np.save(out+f'{t.x}_{t.y}.{os.path.basename(f)[:-4]}.npy',a.astype('float32')); n+=1
    return (f,len(ts),n)
def enc(d,out):   # as stage2.enc
    m=np.isfinite(d); v=np.round(np.where(m,d,0)*16)/16+32768.0
    R=np.floor(v/256); G=np.floor(v)-R*256; Bc=np.round((v-np.floor(v))*256)+2
    rgba=np.dstack([R,G,Bc,np.where(m,255,0)]).astype('uint8'); rgba[~m,:3]=0
    assert ((rgba[...,2][m]&3)==2).all()
    os.makedirs(os.path.dirname(out),exist_ok=True)
    Image.fromarray(rgba,'RGBA').save(out,'WEBP',lossless=True,quality=100,method=2,exact=True)
    if (np.asarray(Image.open(out).convert('RGBA'))[m]!=rgba[m]).any(): raise RuntimeError('webp mismatch '+out)
def dec(b):
    a=np.asarray(Image.open(io.BytesIO(b)).convert('RGBA')).astype(np.float64)
    h=a[...,0]*256+a[...,1]+a[...,2]/256-32768; h[a[...,3]<128]=np.nan; return h.astype('float32')
EI=json.load(open(W+'lt_index.json')); ES={z:set(EI[z]) for z in EI if isinstance(EI[z],list)}
def existing(z,x,y):
    if f'{x}_{y}' not in ES.get(str(z),()): return None
    for t in range(4):
        try: return dec(urllib.request.urlopen(urllib.request.Request(f'{EXIST}{z}/{x}/{y}.webp',headers={'User-Agent':'lidar-lens build (stage_ie.py)'}),timeout=60).read())
        except Exception as e: err=e
    raise RuntimeError(f'existing tile {z}/{x}/{y}: {err}')
def merge13(item):
    k,fs=item; x,y=map(int,k.split('_')); a=None
    for f in sorted(fs):
        g=np.load(f); a=g if a is None else np.where(np.isfinite(a),a,g)
    e=existing(13,x,y); shared=e is not None
    if shared: a=np.where(np.isfinite(e),e,a)
    enc(a,f'{W}tiles/13/{x}/{y}.webp'); np.save(f'{W}z13full/{k}.npy',a)
    return k,shared
if __name__=='__main__':
    step=sys.argv[2] if len(sys.argv)>2 else 'all'
    if step in ('all','warp'):
        fs=sorted(glob.glob(W+'src/*.tif'),key=os.path.getsize,reverse=True)
        with Pool(int(os.environ.get('NP','5'))) as p:
            for r in p.imap_unordered(cell,fs): print(os.path.basename(r[0]),'tiles',r[1],'with data',r[2],flush=True)
    if step in ('all','encode'):
        parts={}
        for f in glob.glob(W+'z13parts/*.npy'): parts.setdefault(os.path.basename(f).split('.')[0],[]).append(f)
        os.makedirs(W+'z13full',exist_ok=True); idx={'13':[]}; shared={'13':[]}
        with Pool(7) as p:
            for k,sh in p.imap_unordered(merge13,list(parts.items()),chunksize=16):
                idx['13'].append(k)
                if sh: shared['13'].append(k)
        print('z13',len(idx['13']),'shared',len(shared['13']),flush=True)
        L={tuple(map(int,k.split('_'))):None for k in idx['13']}
        cur={k:np.load(f'{W}z13full/{k[0]}_{k[1]}.npy') for k in L}
        for z in range(12,5,-1):
            P={}
            for (x,y) in cur: P.setdefault((x//2,y//2),[]).append((x,y))
            N={}; idx[str(z)]=[]; shared[str(z)]=[]
            for (px,py),ch in P.items():
                big=np.full((512,512),np.nan,'float32')
                for (x,y) in ch: dx,dy=x-2*px,y-2*py; big[dy*256:(dy+1)*256,dx*256:(dx+1)*256]=cur[(x,y)]
                with warnings.catch_warnings():
                    warnings.simplefilter('ignore'); d=np.nanmean(big.reshape(256,2,256,2),axis=(1,3)).astype('float32')
                e=existing(z,px,py)
                if e is not None: d=np.where(np.isfinite(e),e,d); shared[str(z)].append(f'{px}_{py}')
                if np.isfinite(d).sum()>=16: N[(px,py)]=d; idx[str(z)].append(f'{px}_{py}'); enc(d,f'{W}tiles/{z}/{px}/{py}.webp')
            cur=N; print('z',z,len(N),'shared',len(shared[str(z)]),flush=True)
        for z in idx: idx[z]=sorted(idx[z])
        idx.update(v=1,src='GEM-15 v1 (Google Research, CC BY 4.0, experimental): bare-earth dtm band, EGM96 heights, 15 m, resampled bilinear to web-mercator z13; the island of Ireland and its 12 nm belt (mask-v2 ie)',
          marker='Terrarium blue channel = 2 mod 4 marks GEM-15 pixels (LiDAR tiles are 0 mod 4); heights quantised to 1/16 m then +2/256 m',
          shared='keys also in gem15/index.json: this copy keeps every published pixel and adds the Irish ones; the service worker reads this copy for them')
        json.dump(idx,open(W+'tiles/index.json','w'),separators=(',',':')); json.dump(shared,open(W+'shared.json','w'))
        print('index',{k:len(v) for k,v in idx.items() if isinstance(v,list)})
