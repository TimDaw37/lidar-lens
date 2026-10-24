"""Ynys Môn: fetch the Welsh Language Commissioner's standardised place-names and Cadw scheduled monuments from the
DataMapWales WFS (both OGL), clip to the 1 km buffer, label Welsh first with English in brackets (Welsh only when the
same), fix 'Fali, Y' -> 'Y Fali', and write placenames.geojson, cadw_sam.geojson and the What's here? rec chunks.
No HER data is fetched or stored. usage: python build_names_and_records.py OUT_DIR"""
import json,os,re,sys,time,urllib.request,geopandas as gpd
from shapely.geometry import box
OUT=sys.argv[1] if len(sys.argv)>1 else 'build'; os.makedirs(OUT+'/layers/v2/rec',exist_ok=True)
HERE=os.path.dirname(os.path.abspath(__file__)); BUF=gpd.read_file(f'{HERE}/../data/area_buf1km_27700.geojson').set_crs(27700,allow_override=True)
W='https://datamap.gov.wales/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&outputFormat=application/json&srsName=EPSG:4326&bbox=219000,360000,267000,397500,EPSG:27700&typeNames='
def wfs(t): return gpd.read_file(urllib.request.urlopen(W+t,timeout=120))
buf=BUF.to_crs(4326).geometry.iloc[0]
fix=lambda s: re.sub(r'^(.*), (Y|Yr)$',r'\2 \1',s.strip()) if isinstance(s,str) else s
lab=lambda cy,en: cy if not en or en==cy else f'{cy} ({en})'
p=wfs('geonode:wg_placenames'); p['geometry']=p.geometry.to_crs(27700).centroid.to_crs(4326); p=p[p.within(buf)]
feats=[dict(type='Feature',geometry=dict(type='Point',coordinates=[round(r.geometry.x,5),round(r.geometry.y,5)]),
  properties=dict(n=lab(fix(r.ffurf_safonol),fix(r.ffurf_saesneg)),cy=fix(r.ffurf_safonol),alt=fix(r.ffurf_safonol_arall),en=fix(r.ffurf_saesneg),t=r.math_cymraeg,te=r.math_saesneg,gr=r.cyfeirnod_grid)) for _,r in p.iterrows()]
json.dump(dict(type='FeatureCollection',features=feats),open(f'{OUT}/placenames.geojson','w'),ensure_ascii=False)
s=wfs('inspire-wg:Cadw_SAM'); s=s[s.intersects(buf)]
s['Name']=[lab(a,b) for a,b in zip(s.Name_cy,s.Name)]; s['ListEntry']=s.SAMNumber; s['hyperlink']=s.Report.str.replace('http://','https://')
s[['Name','ListEntry','hyperlink','geometry']].to_file(f'{OUT}/cadw_sam.geojson',driver='GeoJSON',COORDINATE_PRECISION=6)
# What's here? chunks (5 km BNG cells, 200 m buffer), same format as scripts/build_layer_chunks.py
C=5000;B=200;recs=[]
for _,r in s.to_crs(27700).iterrows():
    g=r.geometry; polys=[g] if g.geom_type=='Polygon' else list(g.geoms)
    recs.append((g,dict(s='CADW',id=r.ListEntry,n=r.Name,t='Scheduled monument',p='',d='',u=r.hyperlink,
      g=['A',[[[[round(x,1),round(y,1)] for x,y in ring.coords] for ring in [q.exterior,*q.interiors]] for q in polys]])))
for f in gpd.GeoDataFrame.from_features(feats,crs=4326).to_crs(27700).itertuples():
    recs.append((f.geometry,dict(s='Enw',id='',n=f.n,t=f.t if f.t==f.te else f'{f.t} ({f.te})',p=f.gr or '',d='',u='',g=['P',[round(f.geometry.x),round(f.geometry.y)]])))
cells={}
for g,f in recs:
    gb=g.buffer(B); x0,y0,x1,y1=gb.bounds
    for cx in range(int(x0//C),int(x1//C)+1):
        for cy in range(int(y0//C),int(y1//C)+1):
            if gb.intersects(box(cx*C,cy*C,(cx+1)*C,(cy+1)*C)): cells.setdefault(f'{cx}_{cy}',[]).append(f)
tot=0
for k,fs in cells.items():
    d=json.dumps({'f':fs},ensure_ascii=False,separators=(',',':')); open(f'{OUT}/layers/v2/rec/{k}.json','w').write(d); tot+=len(d.encode())
json.dump({'crs':'EPSG:27700','cell':C,'buf':B,'layers':{'rec':sorted(cells)},'bytes':{'rec':tot},'sources':{'CADW':'Cadw scheduled monuments (OGL)','Enw':'Welsh Language Commissioner standardised place-names (OGL)'},'built':time.strftime('%Y-%m-%d %H:%M %Z')},open(f'{OUT}/layers/index.json','w'),ensure_ascii=False)
print(len(feats),'place names,',len(s),'scheduled monuments,',len(cells),'chunks')
