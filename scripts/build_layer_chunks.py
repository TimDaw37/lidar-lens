"""Package 'What is it?' layers into 5 km BNG chunks so the browser loads only what is near a click.
Generic: area polygon (EPSG:27700) in, chunk JSON out. Sources are listed in SOURCES below / a JSON config.
usage: build_layer_chunks.py AREA_27700.geojson RAW_DIR OUT_DIR [--cell 5000] [--buf 200]
Output: OUT_DIR/{her,rec,ctx}/{cx}_{cy}.json + OUT_DIR/index.json
  her  = local HER records (PRIVATE: no open licence; keep out of public repos/buckets)
  rec  = open records: NHLE scheduled + listed, HE AIM, OSM historic
  ctx  = context: OS OpenMap Local + OSM (buildings, woods, water, streams, roads, rail, tracks, field edges, settled, embankments)
cell id: cx=floor(E/cell), cy=floor(N/cell); each feature is clipped to cell box + buf metres (buf must exceed the client's search radius)."""
import os, sys, json, math, glob, argparse, time
os.environ.setdefault('PROJ_NETWORK','ON')
import numpy as np, geopandas as gpd, pandas as pd, shapely
from shapely.geometry import box, shape
ap=argparse.ArgumentParser();ap.add_argument('area');ap.add_argument('raw');ap.add_argument('out');ap.add_argument('--cell',type=int,default=5000);ap.add_argument('--buf',type=int,default=200)
ap.add_argument('--include-her',action='store_true',help='PRIVATE builds only: also package RAW/her_*.geojson (needs your HER\'s permission; never publish)')
ap.add_argument('--her-guid',default='',help='Heritage Gateway resource GUID for your HER (for record links)')
ap.add_argument('--her-prefix',default='',help='HER record ID prefix that has a Heritage Gateway page (e.g. MWI)')
A=ap.parse_args();RAW=A.raw;OUT=A.out;CELL=A.cell;BUF=A.buf
area=gpd.read_file(A.area).to_crs(27700).union_all();X0,Y0,X1,Y1=area.bounds
cells=[(cx,cy) for cx in range(int(X0//CELL),int(X1//CELL)+1) for cy in range(int(Y0//CELL),int(Y1//CELL)+1) if area.intersects(box(cx*CELL,cy*CELL,(cx+1)*CELL,(cy+1)*CELL))]
cboxes=np.array([box(cx*CELL-BUF,cy*CELL-BUF,(cx+1)*CELL+BUF,(cy+1)*CELL+BUF) for cx,cy in cells]);tree=shapely.STRtree(cboxes)
print('cells',len(cells),flush=True)
areabuf=area.buffer(BUF)
def r(v): return round(v*2)/2
def ring(cs): return [[r(c[0]),r(c[1])] for c in cs]
def enc(g):
    if g is None or g.is_empty: return None
    t=g.geom_type
    if t=='Point': return ['P',[r(g.x),r(g.y)]]
    if t=='MultiPoint': return ['P',[r(g.geoms[0].x),r(g.geoms[0].y)]]
    if t in('LineString','LinearRing'): return ['L',[ring(g.coords)]] if len(g.coords)>1 else None
    if t=='MultiLineString': return ['L',[ring(l.coords) for l in g.geoms if len(l.coords)>1]]
    if t=='Polygon': return ['A',[[ring(g.exterior.coords)]+[ring(i.coords) for i in g.interiors]]]
    if t=='MultiPolygon': return ['A',[[ring(p.exterior.coords)]+[ring(i.coords) for i in p.interiors] for p in g.geoms]]
    if t=='GeometryCollection':
        ps=[enc(x) for x in g.geoms];ps=[p for p in ps if p]
        if not ps: return None
        k=ps[0][0];same=[p for p in ps if p[0]==k]
        return [k,sum((p[1] for p in same),[])] if k!='P' else ps[0]
    return None
store={'her':{},'rec':{},'ctx':{}}  # 'her' stays empty unless --include-her
def add(layer,geoms,props,tol):
    """geoms: array of shapely geoms (27700); props: list of dict (rec/her) or str layer name (ctx)."""
    geoms=np.asarray(geoms);ok=~shapely.is_empty(geoms)&~shapely.is_missing(geoms);geoms=geoms[ok];props=[p for p,o in zip(props,ok) if o]
    geoms=shapely.make_valid(geoms)
    gi,ci=tree.query(geoms,predicate='intersects')
    clipped=shapely.intersection(geoms[gi],cboxes[ci])
    if tol: clipped=shapely.simplify(clipped,tol,preserve_topology=True)
    n=0
    for g,i,c in zip(clipped,gi,ci):
        e=enc(g)
        if not e or not e[1]: continue
        key='%d_%d'%cells[c];d=store[layer].setdefault(key,{} if layer=='ctx' else [])
        if layer=='ctx': d.setdefault(props[i],[]).append(e)
        else: d.append({**props[i],'g':e})
        n+=1
    print(layer,'added',n,'pieces',flush=True)
def clean(s):
    if s is None or (isinstance(s,float) and math.isnan(s)): return ''
    return str(s).strip()
def rd(path,**kw):
    g=gpd.read_file(path,**kw)
    # ArcGIS f=geojson with outSR=27700 has BNG coordinates but readers assume WGS84
    if g.crs is None or (len(g) and g.crs.to_epsg()==4326 and abs(g.total_bounds[0])>1000): g=g.set_crs(27700,allow_override=True)
    return g.to_crs(27700)
t0=time.time()
# ---------------- HER (private) ----------------
HG='https://historicengland.org.uk/listing/heritage-gateway/results/record/%s/'%A.her_guid
for f in (sorted(glob.glob(RAW+'/her_*.geojson')) if A.include_her else []):
    g=rd(f);g=g[g.intersects(areabuf)]
    props=[{'s':'HER','id':clean(x.MONUMENT_UID),'n':clean(x.NAME),'t':clean(x.MONUMENT_TYPE).title(),'p':clean(x.PERIOD),'d':clean(x.SUMMARY)[:220],'u':HG+clean(x.MONUMENT_UID) if A.her_guid and A.her_prefix and clean(x.MONUMENT_UID).startswith(A.her_prefix) else ''} for x in g.itertuples()]
    add('her',g.geometry.values,props,0.5)
# ---------------- open records ----------------
g=rd(RAW+'/nhle_sched.geojson');g=g[g.intersects(areabuf)]
add('rec',g.geometry.values,[{'s':'NHLE','id':str(x.ListEntry),'n':clean(x.Name),'t':'Scheduled monument','p':'','d':'','u':clean(x.hyperlink)} for x in g.itertuples()],0.5)
if os.path.exists(RAW+'/nhle_listed_pts.geojson'):
    g=rd(RAW+'/nhle_listed_pts.geojson');g=g[g.intersects(areabuf)]
    add('rec',g.geometry.values,[{'s':'LB','id':str(x.ListEntry),'n':clean(x.Name),'t':'Listed building, grade '+clean(x.Grade),'p':'','d':'','u':clean(x.hyperlink)} for x in g.itertuples()],0)
# Optional curated site gazetteer(s): RAW/sites_*.geojson (EPSG:27700 points; name,type,nhle,certainty,source,notes)
for f in sorted(glob.glob(RAW+'/sites_*.geojson')):
    g=rd(f);g=g[g.intersects(areabuf)]
    add('rec',g.geometry.values,[{'s':'GAZ','id':clean(getattr(x,'nhle','')),'n':clean(x.name),'t':clean(x.type).capitalize(),'p':'','d':(clean(getattr(x,'certainty',''))+': '+clean(getattr(x,'notes','')))[:220],'u':clean(getattr(x,'source',''))} for x in g.itertuples()],0)
    print('gazetteer',f,len(g),flush=True)
a=rd(RAW+'/aim_detailed.geojson');a=a[a.intersects(areabuf)];a['uid']=a.HE_UID.map(clean)
meta={}
for x in a.itertuples():
    if x.uid and x.uid not in meta: meta[x.uid]=(clean(x.MONUMENT_TYPE).replace('\\',', ').title(),clean(x.PERIOD).replace('\\',', ').title(),clean(x.HE_URL1),clean(x.project))
gs=[];ps=[]
for (uid,lay),grp in a.groupby(['uid','LAYER']):
    m=meta.get(uid,('','','',''));gs.append(shapely.union_all(shapely.make_valid(grp.geometry.values)))
    ps.append({'s':'AIM','id':uid,'n':m[0].split(',')[0] if m[0] else 'AIM feature','t':m[0],'p':m[1],'d':'Mapped '+str(lay).lower()+' ('+m[3]+' NMP project)','u':m[2]})
add('rec',gs,ps,0.7)
e=rd(RAW+'/aim_extents.geojson');e=e[e.intersects(areabuf)]
ps=[];
for x in e.itertuples():
    uid=clean(x.HE_UID);m=meta.get(uid,('','','',''))
    ps.append({'s':'AIM','id':uid,'n':m[0].split(',')[0] if m[0] else 'AIM monument extent','t':m[0],'p':m[1],'d':'Monument extent ('+clean(x.project)+')','u':clean(x.HE_URL1) or m[2]})
add('rec',e.geometry.values,ps,0.7)
# ---------------- OSM (records + context) ----------------
rows=[json.loads(l) for l in open(RAW+'/osm/osm_whatis.geojsonl')]
og=gpd.GeoDataFrame([r_['properties'] for r_ in rows],geometry=[shape(r_['geometry']) for r_ in rows],crs=4326).to_crs(27700)
og=og[og.intersects(areabuf)];print('osm in area',len(og),round(time.time()-t0),'s',flush=True)
h=og[og.k=='historic']
def osmtype(x):
    kind=x.site or x.historic;return (kind.replace('_',' ')+(' ('+x.historic.replace('_',' ')+')' if kind!=x.historic else '')).capitalize()
add('rec',h.geometry.values,[{'s':'OSM','id':x.id,'n':clean(x.name),'t':osmtype(x),'p':clean(x.period),'d':clean(x.desc),'u':'https://www.openstreetmap.org/'+x.id} for x in h.itertuples()],0.5)
for k in ['track','fieldedge','settled','wood','water','stream','embankment']:
    s=og[og.k==k];add('ctx',s.geometry.values,[k]*len(s),1.0)
fp=og[og.k=='fieldpoly'];add('ctx',shapely.boundary(fp.geometry.values),['fieldedge']*len(fp),1.0)
# ---------------- OS OpenMap Local ----------------
for name,lyr in [('Building','building'),('Woodland','wood'),('SurfaceWater_Area','water'),('SurfaceWater_Line','stream'),('Road','road'),('RailwayTrack','rail')]:
    for shp in glob.glob(RAW+'/os/**/*_'+name+'.shp',recursive=True):
        g=rd(shp,bbox=areabuf.bounds);g=g[g.intersects(areabuf)];g['geometry']=shapely.force_2d(g.geometry.values)
        add('ctx',g.geometry.values,[lyr]*len(g),1.0)
# ---------------- write ----------------
os.makedirs(OUT,exist_ok=True);idx={'crs':'EPSG:27700','cell':CELL,'buf':BUF,'layers':{},'bytes':{},
  'sources':{'HER':os.environ.get('HER_NAME','local HER (no open licence: keep PRIVATE)'),'NHLE':'Historic England NHLE (OGL)','LB':'Historic England NHLE listed buildings (OGL)','AIM':'Historic England Aerial Investigation & Mapping (OGL)','OSM':'OpenStreetMap contributors (ODbL), community-mapped, not an official record','ctx':'OS OpenMap Local (OGL) + OpenStreetMap contributors (ODbL)'},'built':time.strftime('%Y-%m-%d %H:%M %Z')}
for layer,d in store.items():
    if layer=='her' and not A.include_her: continue
    os.makedirs(OUT+'/'+layer,exist_ok=True);tot=0
    for key,v in d.items():
        p=OUT+'/'+layer+'/'+key+'.json';json.dump({'f':v} if layer!='ctx' else {'L':v},open(p,'w'),separators=(',',':'));tot+=os.path.getsize(p)
    idx['layers'][layer]=sorted(d.keys());idx['bytes'][layer]=tot;print(layer,len(d),'chunks',round(tot/1e6,1),'MB',flush=True)
json.dump(idx,open(OUT+'/index.json','w'),separators=(',',':'))
print('done',round(time.time()-t0),'s')
