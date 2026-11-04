"""HES designations (OGL, inspire.hes.scot) for the Scotland lens: 5 km 'What's here?' record chunks (EPSG:27700), all of Scotland.
Grid queries (25 km, split when the server truncates), dedup by DES_REF."""
import requests,json,os,time,geopandas as gpd
from shapely.geometry import shape,box
B="https://inspire.hes.scot/arcgis/rest/services/HES/HES_Designations/MapServer"
scot=gpd.read_file('/workspace/research/orkney-lens/scot/lad_bfc.geojson').set_crs(27700,allow_override=True).geometry.simplify(200).union_all().buffer(2000).simplify(500)
S=requests.Session()
def q(layer,bb,depth=0):
    r={'error':'x'}
    for a in range(10):
        try:
            r=S.get(f"{B}/{layer}/query",params=dict(geometry=','.join(map(str,bb)),geometryType='esriGeometryEnvelope',inSR=27700,spatialRel='esriSpatialRelIntersects',outFields='*',outSR=27700,f='geojson'),timeout=300).json(); break
        except Exception as e: time.sleep(5*(a+1))
    if 'error' in r and depth>3: print('GIVE UP',layer,bb,flush=True); return []
    if r.get('exceededTransferLimit') or 'error' in r:
        x0,y0,x1,y1=bb; mx=(x0+x1)/2; my=(y0+y1)/2; out=[]
        for b in ((x0,y0,mx,my),(mx,y0,x1,my),(x0,my,mx,y1),(mx,my,x1,y1)): out+=q(layer,b,depth+1)
        return out
    return r['features']
L={'Scheduled monument':5,'Listed building':0,'World Heritage Site':6,'Historic Marine Protected Area':1,'Conservation area':2,'Garden and designed landscape':4,'Inventory battlefield':3}
x0,y0,x1,y1=scot.bounds; C=25000; cellsq=[(x,y,x+C,y+C) for x in range(int(x0//C)*C,int(x1)+1,C) for y in range(int(y0//C)*C,int(y1)+1,C) if scot.intersects(box(x,y,x+C,y+C))]
data={}
for k,v in L.items():
    cf=f'data/hes_{v}.json'
    if os.path.exists(cf): data[k]=json.load(open(cf)); print(k,len(data[k]),'cached'); continue
    seen={}
    for bb in cellsq:
        for f in q(v,bb):
            if f.get('geometry'): seen.setdefault(f['properties'].get('DES_REF'),f)
    data[k]=list(seen.values()); json.dump(data[k],open(cf,'w')); print(k,len(data[k]),flush=True)
BIG=('World Heritage Site','Historic Marine Protected Area','Conservation area','Garden and designed landscape','Inventory battlefield')
def ag(gm,tol):
    s=shape(gm).simplify(tol)
    if s.geom_type=='Point': return ['P',[round(s.x),round(s.y)]],s
    if s.geom_type=='MultiPoint': p=s.geoms[0]; return ['P',[round(p.x),round(p.y)]],s
    polys=[s] if s.geom_type=='Polygon' else [p for p in getattr(s,'geoms',[]) if p.geom_type=='Polygon']
    return ['A',[[[[round(x,1),round(y,1)] for x,y in p.exterior.coords]] for p in polys]],s
cells={}
for t,fs in data.items():
    for f in fs:
        p=f['properties']; cat=(p.get('CATEGORY') or '').strip()
        try: gg,s=ag(f['geometry'],10 if t in BIG else 0.5)
        except Exception: continue
        r=dict(s='HES',id=p.get('DES_REF',''),n=p.get('DES_TITLE',''),t=t+(f' (Category {cat})' if t=='Listed building' and cat else ''),p='',d='',u=p.get('LINK') or '',g=gg)
        sb=s.buffer(200); a,b,c,d=sb.bounds
        for cx in range(int(a//5000),int(c//5000)+1):
            for cy in range(int(b//5000),int(d//5000)+1):
                if sb.intersects(box(cx*5000,cy*5000,cx*5000+5000,cy*5000+5000)): cells.setdefault(f'{cx}_{cy}',[]).append(r)
tot=0
for k,v in cells.items():
    t=json.dumps({'f':v},separators=(',',':')); open(f'site/layers/v2/rec/{k}.json','w').write(t); tot+=len(t)
src=json.load(open('/workspace/lidar-orkney/site/layers/index.json'))
src['layers']={'rec':sorted(cells)}; src['bytes']={'rec':tot}
json.dump(src,open('site/layers/index.json','w'))
print(len(cells),'cells',tot,'B')
