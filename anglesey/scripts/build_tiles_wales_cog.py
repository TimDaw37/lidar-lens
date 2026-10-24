"""Wales COG variant of scripts/build_tiles.py (Ynys Môn lens): reads the DataMapWales national DTM COG by HTTP range reads instead of the EA WCS.
Area polygon (e.g. a county + 1 km buffer) -> EA LiDAR Composite DTM 1 m -> Terrarium lossless-WebP XYZ tiles, z12-17.
Encoding (matches site/lens.js):
  h = R*256 + G + B/256 - 32768 m, heights rounded to 1/64 m, alpha 0 = nodata, lossless WebP exact=True,
  resampling: average for z<16, bilinear for z16-17, reprojected EPSG:27700 -> EPSG:3857.
Work unit = one z12 web-mercator tile: its whole BNG footprint (+margin) is fetched in one WCS request,
so every z12-17 tile is built from complete source data and belongs to exactly one unit (no seams, no overwrites).
Resumable via manifest.json; stops if free disk < 15 GB."""
import os, sys, json, time, shutil, io, traceback, math
import numpy as np, mercantile, requests, rasterio
from rasterio.io import MemoryFile
from rasterio.warp import reproject, transform_bounds
from rasterio.enums import Resampling
from rasterio.transform import from_bounds as tfb
from rasterio.features import geometry_mask
from multiprocessing import Pool
from PIL import Image
import geopandas as gpd
from shapely.geometry import box, mapping

ROOT=os.environ.get('LENS_ROOT','./build');  # generic: set LENS_ROOT and LENS_AREA (area polygon, EPSG:27700, already buffered) for another county
OUT=f'{ROOT}/tiles'; MAN=f'{ROOT}/manifest.json'; COV=f'{ROOT}/data/cov'
WCS='https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs'
COVID='13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m'
Q=1/64; UZ=12; ZMAX=17; MARGIN=40; MIN_FREE=15e9
WORKERS=int(os.environ.get('WORKERS',4)); THREADS=int(os.environ.get('THREADS',2))
os.makedirs(COV,exist_ok=True)

BUF27700=gpd.read_file(os.environ.get('LENS_AREA',f'{ROOT}/data/area_buf1km_27700.geojson')).set_crs(27700,allow_override=True).geometry.iloc[0]
BUF3857=gpd.GeoSeries([BUF27700],crs=27700).to_crs(3857).iloc[0]
BUF4326=gpd.GeoSeries([BUF27700],crs=27700).to_crs(4326).iloc[0]

def free(): return shutil.disk_usage(ROOT).free

def units():
    W,S,E,N=BUF4326.bounds
    us=[]
    for t in mercantile.tiles(W,S,E,N,UZ):
        b=mercantile.xy_bounds(t)
        if box(b.left,b.bottom,b.right,b.top).intersects(BUF3857): us.append((t.x,t.y))
    return us

COG='/vsicurl/https://dmwproductionblob.blob.core.windows.net/cogs/lidar/wales_dtm_32bit_cog.tif'
def fetch(x0,y0,x1,y1):
    """Range-read a BNG window from the DataMapWales Wales DTM COG (1 m, Float32, nodata -9999)."""
    from rasterio.windows import from_bounds as wfb
    last=None
    for a in range(6):
        try:
            with rasterio.Env(GDAL_HTTP_MULTIRANGE='YES',GDAL_HTTP_MERGE_CONSECUTIVE_RANGES='YES',GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',VSI_CACHE='TRUE',GDAL_HTTP_TIMEOUT='60',GDAL_HTTP_MAX_RETRY='5',GDAL_HTTP_RETRY_DELAY='3'):
                with rasterio.open(COG) as s:
                    w=wfb(x0,y0,x1,y1,s.transform).round_offsets().round_lengths()
                    arr=s.read(1,window=w,boundless=True,fill_value=-9999)
                    return arr,s.window_transform(w),-9999.0
        except Exception as e: last=repr(e)
        time.sleep(5*2**a)
    raise RuntimeError('COG failed: '+str(last))

def encode_save(d,m,out):
    v=np.round(np.where(m,d,0)/Q)*Q+32768.0
    R=np.floor(v/256); G=np.floor(v)-R*256; B=np.round((v-np.floor(v))*256); B=np.clip(B,0,255)
    rgba=np.dstack([R,G,B,np.where(m,255,0)]).astype('uint8'); rgba[~m,:3]=0
    os.makedirs(os.path.dirname(out),exist_ok=True)
    im=Image.fromarray(rgba,'RGBA'); tmp=out+'.tmp'
    im.save(tmp,'WEBP',lossless=True,quality=100,method=4,exact=True)
    back=np.asarray(Image.open(tmp).convert('RGBA'))
    if (back[m]!=rgba[m]).any(): raise RuntimeError('webp mismatch '+out)
    os.replace(tmp,out); return os.path.getsize(out)

def do_unit(u):
    ux,uy=u; t0=time.time()
    try:
        if free()<MIN_FREE: return dict(unit=u,status='stopped_disk',free=free())
        b=mercantile.xy_bounds(ux,uy,UZ); ubox=box(b.left,b.bottom,b.right,b.top)
        # BNG footprint of the unit (densified), intersect with buffer, + margin
        fx0,fy0,fx1,fy1=transform_bounds('EPSG:3857','EPSG:27700',b.left,b.bottom,b.right,b.top,densify_pts=64)
        need=box(fx0,fy0,fx1,fy1).intersection(BUF27700)
        if need.is_empty: return dict(unit=u,status='done',tiles=0,bytes=0,note='outside buffer')
        nx0,ny0,nx1,ny1=need.bounds
        x0=int(math.floor(nx0-MARGIN)); y0=int(math.floor(ny0-MARGIN)); x1=int(math.ceil(nx1+MARGIN)); y1=int(math.ceil(ny1+MARGIN))
        src,st,snd=fetch(x0,y0,x1,y1); tdl=time.time()-t0; nraw=src.nbytes
        src=src.astype('float32'); 
        bad=~np.isfinite(src)|(src<-1000)|(src>5000)
        if snd is not None and np.isfinite(snd): bad|=(src==snd)
        src[bad]=np.nan
        srcvalid=float((~bad).mean())
        ntiles=0; nbytes=0; per={}
        for z in range(UZ,ZMAX+1):
            n=2**(z-UZ); size=256*n
            dt=tfb(b.left,b.bottom,b.right,b.top,size,size)
            d=np.full((size,size),np.nan,'float32')
            reproject(src,d,src_crs='EPSG:27700',src_transform=st,src_nodata=np.nan,dst_transform=dt,dst_crs='EPSG:3857',
                      dst_nodata=np.nan,resampling=Resampling.average if z<16 else Resampling.bilinear,
                      init_dest_nodata=True,num_threads=THREADS)
            inpoly=~geometry_mask([mapping(BUF3857)],(size,size),dt)   # True inside buffered county
            if z==UZ:
                np.savez_compressed(f'{COV}/{ux}_{uy}.npz',data=np.isfinite(d)&inpoly,poly=inpoly)
            d[~inpoly]=np.nan
            cnt=0
            for j in range(n):
                for i in range(n):
                    blk=d[j*256:(j+1)*256,i*256:(i+1)*256]; m=np.isfinite(blk)
                    if not m.any(): continue
                    nbytes+=encode_save(blk,m,f'{OUT}/{z}/{ux*n+i}/{uy*n+j}.webp'); cnt+=1
            per[z]=cnt; ntiles+=cnt; del d,inpoly
        return dict(unit=u,status='done',tiles=ntiles,bytes=nbytes,per_zoom=per,bng=[x0,y0,x1,y1],raw_bytes=nraw,
                    src_valid=round(srcvalid,5),t_download=round(tdl,1),t_total=round(time.time()-t0,1))
    except Exception as e:
        return dict(unit=u,status='failed',error=repr(e),tb=traceback.format_exc()[-1500:])

def save_manifest(man):
    tmp=MAN+'.tmp'; json.dump(man,open(tmp,'w'),indent=1); os.replace(tmp,MAN)

def write_status(man,t_start,n_this_run,done_this_run):
    us=man['units']; done=[v for v in us.values() if v.get('status')=='done']; failed=[k for k,v in us.items() if v.get('status')=='failed']
    tot=len(us); nd=len(done); el=time.time()-t_start
    rate=el/max(done_this_run,1); rem=(tot-nd)*rate
    tiles=sum(v.get('tiles',0) for v in done); by=sum(v.get('bytes',0) for v in done)
    # projected size: scale by buffered-area fraction done
    afrac=sum(v.get('area_km2',0) for v in done)/max(man['buffer_area_km2'],1)
    s=f"""# LiDAR tiles: build status
Updated: {time.strftime('%Y-%m-%d %H:%M:%S %Z')}

- Work units (z12 tiles touching the area): **{nd} / {tot} done**, {len(failed)} failed{(' ('+', '.join(failed)+')') if failed else ''}
- Area done: {afrac*100:.1f}% of {man['buffer_area_km2']:.0f} km2 (buffered)
- Tiles written (z12-17): {tiles:,}, {by/1e9:.2f} GB
- Projected final (z12-17): ~{(tiles/max(afrac,1e-6)):,.0f} tiles, ~{by/max(afrac,1e-6)/1e9:.2f} GB
- This run: {done_this_run} units in {el/60:.1f} min, {WORKERS} workers; ETA for remaining units: ~{rem/60:.0f} min (finishing ~{time.strftime('%H:%M %Z',time.localtime(time.time()+rem))})
- Free disk: {free()/1e9:.1f} GB (stop threshold 15 GB)
- Then: low-zoom overview z8-11 from z12 (minutes), coverage GeoJSON + SUMMARY.md.
"""
    open(f'{ROOT}/STATUS.md','w').write(s)

if __name__=='__main__':
    us=units()
    man=json.load(open(MAN)) if os.path.exists(MAN) else {'units':{}}
    man['buffer_area_km2']=BUF27700.area/1e6
    for u in us:
        k=f'{u[0]}_{u[1]}'
        if k not in man['units']: man['units'][k]={'status':'todo'}
        b=mercantile.xy_bounds(u[0],u[1],UZ)
        man['units'][k]['area_km2']=gpd.GeoSeries([box(b.left,b.bottom,b.right,b.top).intersection(BUF3857)],crs=3857).to_crs(27700).area.iloc[0]/1e6
    todo=[u for u in us if man['units'][f'{u[0]}_{u[1]}'].get('status')!='done']
    todo.sort(key=lambda u:(u[1],u[0]))
    save_manifest(man); print(len(us),'units,',len(todo),'to do',flush=True)
    t_start=time.time(); k=0; stop=False
    with Pool(WORKERS,maxtasksperchild=4) as p:
        for r in p.imap_unordered(do_unit,todo):
            key=f'{r["unit"][0]}_{r["unit"][1]}'; area=man['units'][key].get('area_km2')
            r['area_km2']=area; r['finished']=time.strftime('%Y-%m-%dT%H:%M:%S%z')
            man['units'][key]=r
            if r['status']=='done': k+=1
            print(time.strftime('%H:%M:%S'),key,r['status'],r.get('tiles'),r.get('t_download'),r.get('t_total'),r.get('src_valid'),r.get('error',''),flush=True)
            save_manifest(man); write_status(man,t_start,len(todo),k)
            if r['status']=='stopped_disk' and not stop:
                stop=True; print('LOW DISK: stopping',flush=True); p.terminate(); break
    print('finished run; done',sum(1 for v in man['units'].values() if v.get('status')=='done'),'of',len(us),flush=True)
