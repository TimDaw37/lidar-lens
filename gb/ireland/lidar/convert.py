"""Phase B step 1, stage 1: each downloaded GSI tile -> one float32 GeoTIFF (NaN = no ground) in its own CRS, finer than 0.5 m
block-averaged (NaN-aware) to about 0.5 m, plus a 20 m ITM valid-fraction grid for the patch-size rule. Resumable."""
import json,os,sys,glob,time,subprocess,shutil,tempfile,zipfile,numpy as np,rasterio,warnings
from rasterio.crs import CRS
from rasterio.windows import Window
from affine import Affine
from rasterio.warp import reproject,Resampling
from multiprocessing import Pool
warnings.filterwarnings('ignore')
L=['WH_CoCo','GSI_Phase2','GSI_DCHG_DP','OPW_Cork']
H={h[1]:h for h in json.load(open('../s2/heads.json')) if h[0] in L and h[3]==200}
DATE={}; FPB={}
from shapely.geometry import shape
from shapely.ops import transform as stx
from pyproj import Transformer
_t=Transformer.from_crs(4326,2157,always_xy=True).transform
for lay in L:
    for f in json.load(open(f'../s2/IE_GSI_LiDAR_Coverage_{lay}_IE26_ITM.geojson'))['features']:
        p=f['properties']; DATE[p['DATA_URL']]=p.get('DATECAPTUR'); FPB[p['DATA_URL']]=stx(_t,shape(f['geometry'])).bounds
ITM=CRS.from_epsg(2157); IG=CRS.from_epsg(29903)
def pick(names):
    c=[x for x in names if x.lower().endswith(('.tif','.asc'))]+[os.path.dirname(x) for x in names if x.lower().endswith('hdr.adf')]
    d=[x for x in c if 'dtm' in x.lower().replace(os.path.dirname(os.path.dirname(x)).lower(),'')] or [x for x in c if '/dtm' in x.lower()]
    if d: return d[0],'DTM'
    nd=[x for x in c if 'dsm' not in os.path.basename(x).lower()]
    if nd: return nd[0],'single'
    return (c[0],'DSM') if c else (None,None)
def one(u):
    lay,_,name,_,size,_=H[u]; zf=f'dl/{lay}/{os.path.basename(u)}'; out=f'src/{lay}/{name}.tif'; mj=out[:-4]+'.json'
    if os.path.exists(mj): return json.load(open(mj))
    while not (os.path.exists(zf) and os.path.getsize(zf)==size):
        if os.path.exists('dl.done'): return {'url':u,'err':'not downloaded'}
        time.sleep(5)
    os.makedirs(f'src/{lay}',exist_ok=True); tmp=None
    try:
        if zf.endswith('.7z'):
            tmp=tempfile.mkdtemp(dir='tmp'); subprocess.run(['/workspace/venv-osm/bin/python','-c',f'import py7zr;py7zr.SevenZipFile({zf!r}).extractall({tmp!r})'],check=True)
            names=[os.path.join(d,x) for d,_,xs in os.walk(tmp) for x in xs]; src,kind=pick(names); path=src
        else:
            Z=zipfile.ZipFile(zf); names=Z.namelist(); src,kind=pick(names); path='/vsizip/'+zf+'/'+src
            if src and src in names and Z.getinfo(src).file_size>2e8:   # big single GeoTIFFs (0.1 m sites): unzip first, seeking inside deflate is slow
                tmp=tempfile.mkdtemp(dir='tmp'); path=Z.extract(src,tmp)
        if kind not in ('DTM','single'): return {'url':u,'err':'no DTM ('+str(kind)+')'}
        with rasterio.open(path) as s:
            crs=s.crs
            if crs is None: crs=ITM if s.bounds.left>350000 else IG
            res=abs(s.res[0]); k=max(1,int(0.5/res+1e-6)) if res<0.45 else 1
            c0,q0,cw,qh=0,0,s.width,s.height
            if s.width*s.height>3e7 and u in FPB and crs==ITM:   # whole-site rasters (e.g. Sligo, 16 x 23 km) with ground only in this 2 km tile: read the tile (+100 m)
                from rasterio.windows import from_bounds
                l,b_,r,t=FPB[u]; w=from_bounds(l-100,b_-100,r+100,t+100,s.transform).round_offsets().round_lengths()
                c0=max(0,int(w.col_off)); q0=max(0,int(w.row_off)); cw=min(s.width,int(w.col_off+w.width))-c0; qh=min(s.height,int(w.row_off+w.height))-q0
            W,Hh=cw//k,qh//k; a=np.full((Hh,W),np.nan,'float32'); nd=s.nodata
            for r0 in range(0,Hh,max(1,1024//k)):
                r1=min(Hh,r0+max(1,1024//k)); b=s.read(1,window=Window(c0,q0+r0*k,W*k,(r1-r0)*k)).astype('float32')
                v=np.isfinite(b)&(b>-50)&(b<1100)
                if nd is not None: v&=(b!=nd)
                else: v&=(b!=0)
                b[~v]=np.nan
                if k>1:
                    b=b.reshape(r1-r0,k,W,k); c=np.isfinite(b).sum(axis=(1,3)); sm=np.nansum(b,axis=(1,3))
                    b=np.where(c*2>=k*k,sm/np.maximum(c,1),np.nan).astype('float32')   # at least half the fine pixels are ground
                a[r0:r1]=b
            tr=s.transform*Affine.translation(c0,q0)*Affine.scale(k,k)
        nv=int(np.isfinite(a).sum())
        if nv==0: return {'url':u,'err':'empty'}
        with rasterio.open(out,'w',driver='GTiff',width=W,height=Hh,count=1,dtype='float32',crs=crs,transform=tr,nodata=np.nan,
                           tiled=True,blockxsize=512,blockysize=512,compress='deflate',predictor=3,zlevel=1) as d: d.write(a,1)
        # 20 m ITM valid-fraction grid, aligned to multiples of 20 m
        from rasterio.warp import transform_bounds
        l,b_,r,t=transform_bounds(crs,ITM,*rasterio.transform.array_bounds(Hh,W,tr)); l=np.floor(l/20)*20; t=np.ceil(t/20)*20
        gw=int(np.ceil((r-l)/20)); gh=int(np.ceil((t-b_)/20)); g=np.zeros((gh,gw),'float32')
        reproject(np.isfinite(a).astype('float32'),g,src_transform=tr,src_crs=crs,dst_transform=Affine(20,0,l,0,-20,t),dst_crs=ITM,resampling=Resampling.average)
        np.save(out[:-4]+'.frac.npy',g)
        m={'url':u,'layer':lay,'name':name,'file':os.path.basename(src),'kind':kind,'res':res,'k':k,'crs':crs.to_string(),'date':DATE.get(u),
           'valid_km2':nv*(res*k)**2/1e6,'g0':[l,t],'dl_bytes':size}
        json.dump(m,open(mj,'w')); return m
    except Exception as e: return {'url':u,'err':str(e)[:300]}
    finally:
        if tmp: shutil.rmtree(tmp,ignore_errors=True)
if __name__=='__main__':
    os.makedirs('tmp',exist_ok=True); us=sorted(H,key=lambda u:(H[u][0]!='OPW_Cork',u)); t=time.time(); R=[]
    with Pool(int(sys.argv[1]) if len(sys.argv)>1 else 4) as p:
        for i,m in enumerate(p.imap_unordered(one,us)):
            R.append(m)
            if 'err' in m: print('ERR',m,flush=True)
            if i%50==0: print(i,len(us),'%.0fs'%(time.time()-t),time.strftime('%H:%M:%S'),flush=True)
    json.dump(R,open('convert.json','w')); print('CONVERT_DONE','%.0fs'%(time.time()-t),time.strftime('%H:%M:%S'),sum('err' in m for m in R),'errors',flush=True)
