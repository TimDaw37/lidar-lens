"""Scotland lens build (streaming). SRSP OGL DTM COGs -> priority mosaic with 30 m feathered seams -> Terrarium lossless WebP z13-17
(z8-12 later from kept z13). Work unit = one z13 web-mercator tile (BNG footprint + 100 m margin, 0.5 m grid).
Batch = one z10 tile: download needed products -> build units -> upload z13-17 to R2 via Worker -> delete z14-17 + raw no longer needed.
Encoding identical to the England/Orkney lenses (h=R*256+G+B/256-32768, 1/64 m, alpha 0 nodata)."""
import os, sys, json, time, shutil, math, traceback, threading, hashlib, struct
import numpy as np, mercantile, requests, rasterio, rasterio.errors
from rasterio.windows import from_bounds as wfb
from rasterio.warp import reproject, transform_bounds
from rasterio.enums import Resampling
from rasterio.transform import from_bounds as tfb
from rasterio.features import geometry_mask
from scipy import ndimage
from multiprocessing import Pool
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
import geopandas as gpd
from shapely.geometry import box, mapping

ROOT=os.environ.get('LENS_ROOT','/workspace/lidar-scotland'); OUT=f'{ROOT}/tiles'; RAW=f'{ROOT}/raw'; COV=f'{ROOT}/cov'
MAN=f'{ROOT}/manifest.json'; QA=f'{ROOT}/seams.jsonl'
Q=1/64; UZ=13; ZMAX=17; BZ=10; MARGIN=100; RES=0.5; FEATHER=30.0; MIN_FREE=12e9
WORKERS=int(os.environ.get('WORKERS',5)); THREADS=int(os.environ.get('THREADS',2))
UPLOAD=os.environ.get('UPLOAD_URL'); SECF=os.environ.get('UPLOAD_SECRET_FILE')
for d in (OUT,RAW,COV): os.makedirs(d,exist_ok=True)
AREA=gpd.read_file(os.environ.get('LENS_AREA',f'{ROOT}/data/pilot_area.geojson')).geometry.iloc[0]
AREA3857=gpd.GeoSeries([AREA],crs=27700).to_crs(3857).iloc[0]; AREA4326=gpd.GeoSeries([AREA],crs=27700).to_crs(4326).iloc[0]
IDX=json.load(open(f'{ROOT}/data/products_idx.json')); PRI=IDX['pri']; PRODS=IDX['products']
# 100 m winner grid (EPSG:27700, X0=0, Y1=1240000) -> per-collection "needed" mask, dilated 2 cells so the lower survey exists under the feather band
SC='/workspace/research/orkney-lens/scot'; WIN=np.load(f'{SC}/winner.npy'); GR=100; GY1=1240000
NEED={i:ndimage.binary_dilation(WIN==i,iterations=2) for i in range(len(PRI))}
def fname(p): return f"{RAW}/{p['pri']:02d}_{p['url'].rsplit('/',1)[1]}"
def product_needed(p,b):
    x0,y0,x1,y1=[max(a,c) for a,c in zip(p['bbox'][:2],b[:2])]+[min(a,c) for a,c in zip(p['bbox'][2:],b[2:])]
    if x0>=x1 or y0>=y1: return False
    c0,c1=int(x0//GR),int(math.ceil(x1/GR)); r0,r1=int((GY1-y1)//GR),int(math.ceil((GY1-y0)/GR))
    return bool(NEED[p['pri']][max(r0,0):r1,max(c0,0):c1].any())
def free(): return shutil.disk_usage(ROOT).free
def ubng(ux,uy):
    b=mercantile.xy_bounds(ux,uy,UZ); fx0,fy0,fx1,fy1=transform_bounds('EPSG:3857','EPSG:27700',b.left,b.bottom,b.right,b.top,densify_pts=64)
    need=box(fx0,fy0,fx1,fy1).intersection(AREA)
    if need.is_empty: return None
    a,c,e,f=need.bounds; return [math.floor(a-MARGIN),math.floor(c-MARGIN),math.ceil(e+MARGIN),math.ceil(f+MARGIN)]
def unit_products(bb): return [p for p in PRODS if p['bbox'][0]<bb[2] and p['bbox'][2]>bb[0] and p['bbox'][1]<bb[3] and p['bbox'][3]>bb[1] and product_needed(p,bb)]

def layer(ps,x0,y0,x1,y1,w,h,dt):
    d=np.full((h,w),np.nan,'float32')
    for p in ps:
        f=fname(p)
        if not os.path.exists(f): continue
        with rasterio.open(f) as s:
            win=wfb(x0-5,y0-5,x1+5,y1+5,s.transform).round_offsets().round_lengths()
            try: win=win.intersection(rasterio.windows.Window(0,0,s.width,s.height))
            except rasterio.errors.WindowError: continue
            if win.width<1 or win.height<1: continue
            a=s.read(1,window=win).astype('float32'); st=s.window_transform(win); nd=s.nodata
            bad=~np.isfinite(a)|(a<-1000)|(a>5000)
            if nd is not None: bad|=a==nd
            a[bad]=np.nan
            tmp=np.full((h,w),np.nan,'float32')
            rs=Resampling.average if abs(s.res[0])<RES*0.99 else Resampling.bilinear
            reproject(a,tmp,src_crs='EPSG:27700',src_transform=st,src_nodata=np.nan,dst_transform=dt,dst_crs='EPSG:27700',dst_nodata=np.nan,resampling=rs,init_dest_nodata=True)
        m=np.isnan(d)&np.isfinite(tmp); d[m]=tmp[m]
    return d

def fetch(x0,y0,x1,y1,ps):
    """Priority mosaic: lowest priority first; each higher survey blended in over FEATHER m from its own data edge (only where lower data exists)."""
    w=int((x1-x0)/RES); h=int((y1-y0)/RES); dt=tfb(x0,y0,x1,y1,w,h)
    acc=np.full((h,w),np.nan,'float32'); seams={}; used=[]
    for i in sorted({p['pri'] for p in ps},reverse=True):
        L=layer([p for p in ps if p['pri']==i],x0,y0,x1,y1,w,h,dt); v=np.isfinite(L)
        if not v.any(): continue
        used.append(PRI[i]); a=np.isfinite(acc); both=v&a
        if both.any():
            # distance (m) from the edge of this survey's data, on a 2 m grid for speed
            k=4; vs=v[::k,::k]; dist=ndimage.distance_transform_edt(vs)*RES*k
            wgt=np.clip(np.repeat(np.repeat(dist,k,0),k,1)[:h,:w]/FEATHER,0,1).astype('float32')
            diff=(L-acc)[both][::97]; band=both&(wgt<1)
            seams[PRI[i]]=dict(over=[x for x in used[:-1]],n=int(both.sum()),med=float(np.median(diff)),p90abs=float(np.percentile(np.abs(diff),90)),band_px=int(band.sum()))
            acc=np.where(both,wgt*L+(1-wgt)*acc,np.where(v,L,acc))
        else: acc=np.where(v,L,acc)
        del L
    return acc,dt,seams,used

def encode_save(d,m,out):
    v=np.round(np.where(m,d,0)/Q)*Q+32768.0
    R=np.floor(v/256); G=np.floor(v)-R*256; B=np.clip(np.round((v-np.floor(v))*256),0,255)
    rgba=np.dstack([R,G,B,np.where(m,255,0)]).astype('uint8'); rgba[~m,:3]=0
    os.makedirs(os.path.dirname(out),exist_ok=True); tmp=out+'.tmp'
    Image.fromarray(rgba,'RGBA').save(tmp,'WEBP',lossless=True,quality=100,method=4,exact=True)
    if (np.asarray(Image.open(tmp).convert('RGBA'))[m]!=rgba[m]).any(): raise RuntimeError('webp mismatch '+out)
    os.replace(tmp,out); return os.path.getsize(out)

def do_unit(u):
    ux,uy=u; t0=time.time()
    try:
        bb=ubng(ux,uy)
        if bb is None: return dict(unit=u,status='done',tiles=0,bytes=0,note='outside')
        ps=unit_products(bb); src,st,seams,used=fetch(*bb,ps); tf=time.time()-t0
        b=mercantile.xy_bounds(ux,uy,UZ); ntiles=0; nbytes=0; per={}
        for z in range(UZ,ZMAX+1):
            n=2**(z-UZ); size=256*n; dt=tfb(b.left,b.bottom,b.right,b.top,size,size)
            d=np.full((size,size),np.nan,'float32')
            reproject(src,d,src_crs='EPSG:27700',src_transform=st,src_nodata=np.nan,dst_transform=dt,dst_crs='EPSG:3857',dst_nodata=np.nan,
                      resampling=Resampling.average if z<16 else Resampling.bilinear,init_dest_nodata=True,num_threads=THREADS)
            inpoly=~geometry_mask([mapping(AREA3857)],(size,size),dt)
            if z==UZ: np.savez_compressed(f'{COV}/{ux}_{uy}.npz',data=np.isfinite(d)&inpoly,poly=inpoly)
            d[~inpoly]=np.nan; cnt=0
            for j in range(n):
                for i in range(n):
                    blk=d[j*256:(j+1)*256,i*256:(i+1)*256]; m=np.isfinite(blk)
                    if m.any(): nbytes+=encode_save(blk,m,f'{OUT}/{z}/{ux*n+i}/{uy*n+j}.webp'); cnt+=1
            per[z]=cnt; ntiles+=cnt
        return dict(unit=u,status='done',tiles=ntiles,bytes=nbytes,per_zoom=per,bng=bb,used=used,seams=seams,t_fetch=round(tf,1),t_total=round(time.time()-t0,1))
    except Exception as e: return dict(unit=u,status='failed',error=repr(e),tb=traceback.format_exc()[-1500:])

def download(ps):
    def one(p):
        f=fname(p)
        if os.path.exists(f) and os.path.getsize(f)==p['size']: return 0
        for a in range(6):
            try:
                with requests.get(p['url'],stream=True,timeout=120) as r:
                    r.raise_for_status()
                    with open(f+'.part','wb') as o:
                        for c in r.iter_content(1<<22): o.write(c)
                os.replace(f+'.part',f); return p['size']
            except Exception as e: err=e; time.sleep(2**a)
        raise RuntimeError(f'download failed {p["url"]}: {err!r}')
    with ThreadPoolExecutor(8) as ex: return sum(ex.map(one,ps))

TYPES={'webp':'image/webp'}; IMM='public, max-age=31536000, immutable'
def upload(files):
    """files: list of (key, path). Batched POSTs to the Worker's temporary /__bulk_upload route."""
    sec=open(SECF).read().strip(); batches=[]; cur=[]; sz=0
    for k,p in files:
        n=os.path.getsize(p)
        if cur and (len(cur)>=200 or sz+n>8e6): batches.append(cur); cur=[]; sz=0
        cur.append((k,p)); sz+=n
    if cur: batches.append(cur)
    def send(b):
        hdr=[]; bodies=[]
        for k,p in b:
            d=open(p,'rb').read(); bodies.append(d); hdr.append(dict(k=k,n=len(d),ct='image/webp',cc=IMM,md5=hashlib.md5(d).hexdigest()))
        hj=json.dumps(hdr).encode(); payload=struct.pack('>I',len(hj))+hj+b''.join(bodies); last=''
        for a in range(8):
            try:
                r=requests.post(UPLOAD,data=payload,headers={'X-Upload-Secret':sec},timeout=180)
                if r.status_code==200: return len(b)
                last=f'{r.status_code} {r.text[:100]}'
            except requests.RequestException as e: last=repr(e)
            time.sleep(min(60,2**a))
        raise RuntimeError(last)
    with ThreadPoolExecutor(8) as ex: return sum(ex.map(send,batches))

def save(man): tmp=MAN+'.tmp'; json.dump(man,open(tmp,'w'),indent=1); os.replace(tmp,MAN)

if __name__=='__main__':
    W,S,E,N=AREA4326.bounds
    us=[(t.x,t.y) for t in mercantile.tiles(W,S,E,N,UZ) if box(*mercantile.xy_bounds(t)).intersects(AREA3857)]
    man=json.load(open(MAN)) if os.path.exists(MAN) else {'units':{},'batches':{}}
    groups={}
    for u in us: groups.setdefault(f'{u[0]>>(UZ-BZ)}_{u[1]>>(UZ-BZ)}',[]).append(u)
    keys=sorted(groups,key=lambda k:(int(k.split('_')[1]),int(k.split('_')[0])))
    only=os.environ.get('ONLY_BATCHES'); keys=[k for k in keys if not only or k in only.split(',')]
    print(len(us),'units in',len(groups),'batches',flush=True)
    BP={}
    for bk in keys:
        ps={}
        for b in (ubng(*u) for u in groups[bk]):
            if b:
                for p in unit_products(b): ps[p['url']]=p
        BP[bk]=ps
    for bi,bk in enumerate(keys):
        if man['batches'].get(bk,{}).get('status')=='done': continue
        if free()<MIN_FREE: print('LOW DISK, stop'); break
        T={'start':time.strftime('%Y-%m-%dT%H:%M:%S%z')}; t0=time.time()
        todo=[u for u in groups[bk] if man['units'].get(f'{u[0]}_{u[1]}',{}).get('status')!='done']
        bbs=[b for b in (ubng(*u) for u in todo) if b]
        ps={}
        for b in bbs:
            for p in unit_products(b): ps[p['url']]=p
        ps=list(ps.values()); gb=sum(p['size'] for p in ps)/1e9
        print(f'== batch {bk} ({bi+1}/{len(keys)}): {len(todo)} units, {len(ps)} products {gb:.1f} GB',flush=True)
        dl=download(ps); T['t_download']=round(time.time()-t0); T['dl_gb']=round(dl/1e9,2); T['raw_gb']=round(gb,2); t1=time.time()
        with Pool(WORKERS,maxtasksperchild=6) as pool:
            for r in pool.imap_unordered(do_unit,todo):
                k=f'{r["unit"][0]}_{r["unit"][1]}'; man['units'][k]=r
                if r.get('seams'): open(QA,'a').write(json.dumps(dict(unit=k,bng=r['bng'],seams=r['seams']))+'\n')
                print(time.strftime('%H:%M:%S'),k,r['status'],r.get('tiles'),r.get('t_fetch'),r.get('t_total'),r.get('used'),r.get('error',''),flush=True)
        save(man); T['t_build']=round(time.time()-t1)
        if any(man['units'][f'{u[0]}_{u[1]}']['status']!='done' for u in groups[bk]): print('failures in batch; stop'); break
        files=[]
        for u in groups[bk]:
            for z in range(UZ,ZMAX+1):
                n=2**(z-UZ)
                for i in range(n):
                    for j in range(n):
                        p=f'{OUT}/{z}/{u[0]*n+i}/{u[1]*n+j}.webp'
                        if os.path.exists(p): files.append((f'terrain/{z}/{u[0]*n+i}/{u[1]*n+j}.webp',p))
        t2=time.time(); T['tiles']=len(files); T['tile_mb']=round(sum(os.path.getsize(p) for _,p in files)/1e6,1)
        if UPLOAD: upload(files); T['t_upload']=round(time.time()-t2)
        if UPLOAD or os.environ.get('DELETE')=='1':
            for k,p in files:
                if not k.startswith(f'terrain/{UZ}/'): os.remove(p)
            later=set().union(*[BP[k].keys() for k in keys[bi+1:]]) if bi+1<len(keys) else set()
            for p in ps:
                if p['url'] not in later and os.path.exists(fname(p)): os.remove(fname(p))
        T['t_total']=round(time.time()-t0); T['status']='done'; man['batches'][bk]=T; save(man); print('batch',bk,T,flush=True)
