"""After build_scot.py: z12..z8 overviews from the kept z13 tiles (2x2 nodata-aware mean of decoded heights), coverage outline
(Scotland build + the Orkney lens outline), upload overviews + outline. Orkney's own z8-11 tiles sit in the Orkney bucket (fallback)."""
import os,glob,json,numpy as np,mercantile,rasterio
from PIL import Image
from rasterio.features import shapes
from rasterio.transform import from_bounds as tfb
from shapely.geometry import shape,mapping
from shapely.ops import unary_union
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'build_scot.py')).read().split("if __name__=='__main__':")[0])
def dec(f):
    a=np.asarray(Image.open(f).convert('RGBA')).astype('float64'); h=a[...,0]*256+a[...,1]+a[...,2]/256-32768; h[a[...,3]==0]=np.nan; return h
files=[]
for z in range(UZ-1,7,-1):
    parents=set((int(f.split('/')[-2])//2,int(os.path.basename(f)[:-5])//2) for f in glob.glob(f'{OUT}/{z+1}/*/*.webp'))
    for px,py in sorted(parents):
        big=np.full((512,512),np.nan)
        for dx in (0,1):
            for dy in (0,1):
                f=f'{OUT}/{z+1}/{2*px+dx}/{2*py+dy}.webp'
                if os.path.exists(f): big[dy*256:(dy+1)*256,dx*256:(dx+1)*256]=dec(f)
        with np.errstate(invalid='ignore'): d=np.nanmean(big.reshape(256,2,256,2),axis=(1,3)).astype('float32')
        m=np.isfinite(d)
        if m.any(): o=f'{OUT}/{z}/{px}/{py}.webp'; encode_save(d,m,o); files.append((f'terrain/{z}/{px}/{py}.webp',o))
    print('z',z,len(parents),flush=True)
# coverage outline from z13 unit masks (256 px per unit)
geoms=[]
for f in glob.glob(f'{COV}/*.npz'):
    ux,uy=map(int,os.path.basename(f)[:-4].split('_')); m=np.load(f)['data'].astype('uint8'); b=mercantile.xy_bounds(ux,uy,UZ)
    geoms+=[shape(g) for g,v in shapes(m,mask=m>0,transform=tfb(b.left,b.bottom,b.right,b.top,256,256)) if v==1]
import geopandas as gpd
u=gpd.GeoSeries([unary_union(geoms).buffer(60).buffer(-60).simplify(40)],crs=3857).to_crs(4326).iloc[0]
ork=gpd.read_file('/workspace/lidar-orkney/viewer/site/coverage_outline.geojson').to_crs(4326).geometry.union_all()
allg=unary_union([u,ork])
os.makedirs(f'{ROOT}/site',exist_ok=True)
json.dump({'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':mapping(allg)}]},open(f'{ROOT}/site/coverage_outline.geojson','w'),separators=(',',':'))
print('overview tiles',len(files),'outline bytes',os.path.getsize(f'{ROOT}/site/coverage_outline.geojson'))
if UPLOAD: print('uploaded',upload(files))
