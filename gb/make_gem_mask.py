# GEM-15 territorial-waters mask for the GB live-test lens (13 Nov 2026, Tim pt2182u)
# Allowed = the land of Scotland, the Isle of Man, Jersey and Guernsey (Bailiwick: Alderney, Sark, Herm) and the sea out to 12 nautical
# miles, split at the median line (equidistance) wherever another territory is nearer: Northern Ireland, Ireland, France, England, Wales.
# Plus the RAF Fylingdales gap in the EA LiDAR (England land only). Source: Natural Earth 10 m admin-0 map units (public domain).
import shapefile, numpy as np, json, math
from pyproj import Transformer
from rasterio.features import rasterize
from rasterio.transform import from_origin
from scipy.ndimage import distance_transform_edt
CL={'SCT':1,'IMN':2,'JEY':3,'GGY':3,'ENG':4,'WLS':5,'NIR':6,'IRL':7,'FXX':8}
OK={1,2,3}; NM12=22224.0; RES=200.0
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
# 3035 extent covering 48.4..61.5 N, -10.5..1.5 E
xs,ys=T.transform([-10.5,1.5,-10.5,1.5,-4],[48.4,48.4,61.5,61.5,61.5])
x0,x1,y0,y1=min(xs)-30000,max(xs)+30000,min(ys)-30000,max(ys)+30000
W=int((x1-x0)/RES);H=int((y1-y0)/RES);tr=from_origin(x0,y1,RES,RES);print('grid',W,H,flush=True)
D=np.full((9,H,W),np.inf,np.float32)
for c,sh in shapes.items():
  m=rasterize([(s,1) for s in sh],out_shape=(H,W),transform=tr,fill=0,all_touched=False,dtype='uint8').astype(bool)
  D[c]=distance_transform_edt(~m,sampling=RES).astype(np.float32); print('class',c,m.sum(),flush=True)
near=np.argmin(D,axis=0);dmin=np.min(D,axis=0)
allow=np.isin(near,list(OK))&(dmin<=NM12)&(D[4]>300)&(D[5]>300)   # never within 300 m of England or Wales
# output: a lat/lng grid, run-length rows (cells where allowed)
LAT0,LAT1,LNG0,LNG1,DLAT,DLNG=48.4,61.5,-10.5,1.5,0.004,0.006
NR=int(round((LAT1-LAT0)/DLAT));NC=int(round((LNG1-LNG0)/DLNG))
lat=LAT1-(np.arange(NR)+0.5)*DLAT;lng=LNG0+(np.arange(NC)+0.5)*DLNG
LO,LA=np.meshgrid(lng,lat);X,Y=T.transform(LO,LA)
ci=np.clip(((X-x0)/RES).astype(int),0,W-1);ri=np.clip(((y1-Y)/RES).astype(int),0,H-1)
A=allow[ri,ci]
# RAF Fylingdales: the EA LiDAR has no data in a ~12 km circle on the North York Moors (England land only, so GEM-15 can fill it)
eng_land=(D[4][ri,ci]==0)
fy=(LA>=54.25)&(LA<=54.52)&(LO>=-0.88)&(LO<=-0.42)&eng_land
A=A|fy
rows=[]
for j in range(NR):
  a=A[j].astype(np.int8);d=np.diff(np.concatenate([[0],a,[0]]));s=np.where(d==1)[0];e=np.where(d==-1)[0]
  rows.append([int(v) for p in zip(s,e) for v in p])
json.dump({'v':1,'lat1':LAT1,'lng0':LNG0,'dlat':DLAT,'dlng':DLNG,'nr':NR,'nc':NC,'rows':rows,
  'about':'GEM-15 allowed area: Scotland, Isle of Man, Channel Islands + 12 nm territorial sea split at median lines (Natural Earth 10 m); RAF Fylingdales EA LiDAR gap'},open('mask-v1.json','w'),separators=(',',':'))
from PIL import Image
Image.fromarray((A*255).astype(np.uint8)).save('mask-v1.png');print('cells',NR,NC,int(A.sum()))
