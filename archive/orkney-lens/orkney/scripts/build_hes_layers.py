"""HES designations (OGL, inspire.hes.scot) for the Orkney lens: hes_sm.geojson overlay (WGS84) + 5 km 'What's here?' record chunks (EPSG:27700)."""
import requests,json,os,time,geopandas as gpd
from shapely.geometry import shape,box,mapping
from shapely import set_precision
B="https://inspire.hes.scot/arcgis/rest/services/HES/HES_Designations/MapServer"
area=gpd.read_file('data/area_orkney_27700.geojson').set_crs(27700,allow_override=True).geometry.iloc[0].buffer(2000).simplify(200)
bb=area.bounds
def q(layer):
    r=requests.get(f"{B}/{layer}/query",params=dict(geometry=','.join(map(str,bb)),geometryType='esriGeometryEnvelope',inSR=27700,spatialRel='esriSpatialRelIntersects',outFields='*',outSR=27700,f='geojson'),timeout=300).json()
    assert not r.get('exceededTransferLimit'); return [f for f in r['features'] if f['geometry'] and shape(f['geometry']).intersects(area)]
L={'Scheduled monument':5,'Listed building':0,'World Heritage Site':6,'Historic Marine Protected Area':1,'Conservation area':2,'Garden and designed landscape':4}
data={k:q(v) for k,v in L.items()}
for k,v in data.items(): print(k,len(v))
sm=data['Scheduled monument']
g=gpd.GeoSeries([shape(f['geometry']).simplify(0.5) for f in sm],crs=27700).to_crs(4326)
ov={'type':'FeatureCollection','features':[{'type':'Feature','properties':{'Name':f['properties']['DES_TITLE'],'ListEntry':f['properties']['DES_REF'],'hyperlink':f['properties'].get('LINK') or ''},'geometry':mapping(set_precision(gg,1e-5))} for f,gg in zip(sm,g)]}
json.dump(ov,open('site/hes_sm.geojson','w'),separators=(',',':'))
BIG=('World Heritage Site','Historic Marine Protected Area','Conservation area','Garden and designed landscape')
def ag(gm,tol):
    s=shape(gm).simplify(tol)
    if s.geom_type=='Point': return ['P',[round(s.x),round(s.y)]],s
    polys=[s] if s.geom_type=='Polygon' else [p for p in getattr(s,'geoms',[]) if p.geom_type=='Polygon']
    return ['A',[[[[round(x,1),round(y,1)] for x,y in p.exterior.coords]] for p in polys]],s
cells={}
for t,fs in data.items():
    for f in fs:
        p=f['properties']; cat=(p.get('CATEGORY') or '').strip()
        gg,s=ag(f['geometry'],10 if t in BIG else 0.5)
        r=dict(s='HES',id=p.get('DES_REF',''),n=p.get('DES_TITLE',''),t=t+(f' (Category {cat})' if t=='Listed building' and cat else ''),p='',d='',u=p.get('LINK') or '',g=gg)
        sb=s.buffer(200); x0,y0,x1,y1=sb.bounds
        for cx in range(int(x0//5000),int(x1//5000)+1):
            for cy in range(int(y0//5000),int(y1//5000)+1):
                if sb.intersects(box(cx*5000,cy*5000,cx*5000+5000,cy*5000+5000)): cells.setdefault(f'{cx}_{cy}',[]).append(r)
tot=0
for k,v in cells.items():
    t=json.dumps({'f':v},separators=(',',':')); open(f'site/layers/v2/rec/{k}.json','w').write(t); tot+=len(t)
json.dump({'crs':'EPSG:27700','cell':5000,'buf':200,'layers':{'rec':sorted(cells)},'bytes':{'rec':tot},'sources':{'HES':'Historic Environment Scotland designations (scheduled monuments, listed buildings, World Heritage Site, Historic MPAs, conservation areas, gardens and designed landscapes), inspire.hes.scot, OGL v3, fetched '+time.strftime('%d %b %Y')},'built':time.strftime('%Y-%m-%d %H:%M %Z')},open('site/layers/index.json','w'))
print(len(cells),'cells',tot,'B; overlay',os.path.getsize('site/hes_sm.geojson'))
