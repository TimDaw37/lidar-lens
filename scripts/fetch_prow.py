"""Download a council's public rights of way (ArcGIS FeatureServer layer) to a compact WGS84 GeoJSON for the viewer.
usage: fetch_prow.py LAYER_URL OUT.geojson TYPE_FIELD 'byway=VAL,restricted=VAL,bridleway=VAL,footpath=VAL' [NAME_FIELDS]
Example (Wiltshire, OGL v3.0):
  fetch_prow.py https://maps.wiltshire.gov.uk/arcgis/rest/services/OpenData/PublicRightsofWay/FeatureServer/0 site/prow.geojson TYPE 'byway=1,restricted=2,bridleway=3,footpath=4' PARISH,PATHNO
Check the dataset's licence first (many councils publish PRoW under OGL; some don't). Credit the council, plus OS (Crown copyright)."""
import sys, json, urllib.request, urllib.parse
url,out,tf,mp=sys.argv[1:5];names=sys.argv[5].split(',') if len(sys.argv)>5 else []
code={v:{'byway':1,'restricted':2,'bridleway':3,'footpath':4}[k] for k,v in (x.split('=') for x in mp.split(','))}
feats=[];off=0
while True:
    q=urllib.parse.urlencode({'where':'1=1','outFields':','.join([tf]+names),'outSR':4326,'f':'geojson','resultOffset':off,'resultRecordCount':2000,'orderByFields':'OBJECTID','geometryPrecision':6})
    fs=json.load(urllib.request.urlopen(url.rstrip('/')+'/query?'+q,timeout=120))['features']
    if not fs: break
    feats+=fs;off+=len(fs)
    if len(fs)<2000: break
def rd(c):
    r=[]
    for x,y in c:
        p=[round(x,5),round(y,5)]
        if not r or r[-1]!=p: r.append(p)
    return r
o=[]
for f in feats:
    g=f['geometry'];p=f['properties']
    if not g: continue
    cs=rd(g['coordinates']) if g['type']=='LineString' else [rd(l) for l in g['coordinates']]
    o.append({'type':'Feature','properties':{'t':code.get(str(p.get(tf)),4),'r':' '.join(str(p.get(n) or '') for n in names).strip()},'geometry':{'type':g['type'],'coordinates':cs}})
json.dump({'type':'FeatureCollection','features':o},open(out,'w'),separators=(',',':'));print(len(o),'paths ->',out)
