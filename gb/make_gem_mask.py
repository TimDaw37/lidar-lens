# GEM-15 territorial-waters mask for the GB live-test lens (13 Nov 2026, Tim pt2182u; v2 16 Nov 2026, Tim t2277u: the whole island of
# Ireland, Republic and Northern Ireland, as one map with its 12 nm belt, cut at the median line with Britain; France still excluded)
# Allowed = the land of Scotland, the Isle of Man, Jersey and Guernsey (Bailiwick: Alderney, Sark, Herm) and the sea out to 12 nautical
# miles, split at the median line (equidistance) wherever another territory is nearer: Northern Ireland, Ireland, France, England, Wales.
# Plus the RAF Fylingdales gap in the EA LiDAR (England land only). Source: Natural Earth 10 m admin-0 map units (public domain).
import shapefile, numpy as np, json, math
from pyproj import Transformer
from rasterio.features import rasterize
from rasterio.transform import from_origin
from scipy.ndimage import distance_transform_edt
CL={'SCT':1,'IMN':2,'JEY':3,'GGY':3,'ENG':4,'WLS':5,'NIR':6,'IRL':7,'FXX':8}
import os
V=int(os.environ.get('MASKV','2'))
OK={1,2,3,6,7} if V>=2 else {1,2,3}; NM12=22224.0; RES=200.0
r=shapefile.Reader('ne_10m_admin_0_map_units.shp');f=[x[0] for x in r.fields[1:]];gk=f.index('GU_A3')
T=Transformer.from_crs(4326,3035,always_xy=True)
def proj(geo):
  def ring(c): xs,ys=T.transform([p[0] for p in c],[p[1] for p in c]); return list(zip(xs,ys))
  if geo['type']=='Polygon': return {'type':'Polygon','coordinates':[ring(c) for c in geo['coordinates']]}
  return {'type':'MultiPolygon','coordinates':[[ring(c) for c in p] for p in geo['coordinates']]}
shapes={}
for sr in r.iterShapeRecords():
  g=sr.record[gk]
  if g in CL: shapes.setdefault(CL[g],[]).append(proj(sr.shape.__geo_interface__))
# 3035 extent covering 48.4..61.5 N, -10.5..1.5 E (v2: from 11.604 W, 184 columns of 0.006 deg west of v1 so the cells line up, so the Blaskets / Tearaght and their 12 nm belt fit)
W0=-11.604 if V>=2 else -10.5
xs,ys=T.transform([W0,1.5,W0,1.5,-4],[48.4,48.4,61.5,61.5,61.5])
x0,x1,y0,y1=min(xs)-30000,max(xs)+30000,min(ys)-30000,max(ys)+30000
W=int((x1-x0)/RES);H=int((y1-y0)/RES);tr=from_origin(x0,y1,RES,RES);print('grid',W,H,flush=True)
D=np.full((9,H,W),np.inf,np.float32)
for c,sh in shapes.items():
  m=rasterize([(s,1) for s in sh],out_shape=(H,W),transform=tr,fill=0,all_touched=False,dtype='uint8').astype(bool)
  D[c]=distance_transform_edt(~m,sampling=RES).astype(np.float32); print('class',c,m.sum(),flush=True)
near=np.argmin(D,axis=0);dmin=np.min(D,axis=0)
allow=np.isin(near,list(OK))&(dmin<=NM12)&(D[4]>300)&(D[5]>300)   # never within 300 m of England or Wales
# output: a lat/lng grid, run-length rows (cells where allowed)
LAT0,LAT1,LNG0,LNG1,DLAT,DLNG=48.4,61.5,W0,1.5,0.004,0.006
NR=int(round((LAT1-LAT0)/DLAT));NC=int(round((LNG1-LNG0)/DLNG))
lat=LAT1-(np.arange(NR)+0.5)*DLAT;lng=LNG0+(np.arange(NC)+0.5)*DLNG
LO,LA=np.meshgrid(lng,lat);X,Y=T.transform(LO,LA)
ci=np.clip(((X-x0)/RES).astype(int),0,W-1);ri=np.clip(((y1-Y)/RES).astype(int),0,H-1)
A=allow[ri,ci]
# RAF Fylingdales: the EA LiDAR has no data in a ~12 km circle on the North York Moors (England land only, so GEM-15 can fill it)
eng_land=(D[4][ri,ci]==0)
fy=(LA>=54.25)&(LA<=54.52)&(LO>=-0.88)&(LO<=-0.42)&eng_land
A=A|fy
def rle(A):
  rows=[]
  for j in range(NR):
    a=A[j].astype(np.int8);d=np.diff(np.concatenate([[0],a,[0]]));s=np.where(d==1)[0];e=np.where(d==-1)[0]
    rows.append([int(v) for p in zip(s,e) for v in p])
  return rows
out={'v':V,'lat1':LAT1,'lng0':LNG0,'dlat':DLAT,'dlng':DLNG,'nr':NR,'nc':NC,'rows':rle(A),
  'about':'GEM-15 allowed area: Scotland, Isle of Man, Channel Islands + 12 nm territorial sea split at median lines (Natural Earth 10 m); RAF Fylingdales EA LiDAR gap'}
if V>=2:
  # 'ie': cells where Ireland or Northern Ireland is the nearest territory and within 12 nm (the island and its belt): no open LiDAR
  # is served there yet, so the service worker does not ask the England/Wales pipeline for those tiles
  IE=np.isin(near,[6,7])&(dmin<=NM12); IEg=IE[ri,ci]; out['ie']=rle(IEg)
  # Britain unchanged: the v2 allowed area is exactly the published mask-v1.json cells (same 0.004 x 0.006 grid, shifted 184 columns)
  # plus the Irish cells, so a re-rasterised edge cell in Scotland, the Isle of Man or the Channel Islands cannot flip
  B1=os.environ.get('MASK_V1','mask-v1.json')
  if os.path.exists(B1):
    j1=json.load(open(B1)); off=round((j1['lng0']-LNG0)/DLNG); assert abs(j1['lng0']-LNG0-off*DLNG)<1e-9 and j1['nr']==NR and j1['lat1']==LAT1
    a1=np.zeros(j1['nr']*j1['nc'],bool)
    for i,r in enumerate(j1['rows']):
      for k in range(0,len(r),2): a1[i*j1['nc']+r[k]:i*j1['nc']+r[k+1]]=True
    A=np.zeros_like(A); A[:,off:off+j1['nc']]=a1.reshape(NR,j1['nc']); A=A|IEg; out['rows']=rle(A); out['base']='mask-v1.json + ie'
  else: print('WARNING: no mask-v1.json to keep Britain identical; using the fresh raster')
  out['about']='GEM-15 allowed area: Scotland, the Isle of Man, the Channel Islands and the island of Ireland (Republic and Northern Ireland) + 12 nm territorial sea split at median lines with England, Wales and France (Natural Earth 10 m); RAF Fylingdales EA LiDAR gap. ie = the island of Ireland and its 12 nm belt.'
json.dump(out,open(f'mask-v{V}.json','w'),separators=(',',':'))
from PIL import Image
Image.fromarray((A*255).astype(np.uint8)).save(f'mask-v{V}.png');print('cells',NR,NC,int(A.sum()))
if V>=2: Image.fromarray((IE[ri,ci]*255).astype(np.uint8)).save('mask-v2-ie.png'); print('ie cells',int(IE[ri,ci].sum()))
