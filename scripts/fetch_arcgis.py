"""Generic ArcGIS REST downloader: all features of a layer intersecting a bbox, paged, as GeoJSON (EPSG:27700).
usage: fetch_arcgis.py LAYER_URL OUT.geojson xmin ymin xmax ymax [where]"""
import sys, json, time, urllib.request, urllib.parse
url,out=sys.argv[1],sys.argv[2];bb=list(map(float,sys.argv[3:7]));where=sys.argv[7] if len(sys.argv)>7 else '1=1'
def q(params):
    data=urllib.parse.urlencode(params).encode()
    for a in range(6):
        try:
            req=urllib.request.Request(url+'/query',data=data,headers={'User-Agent':'LiDARLens-data/1.0 (private research)'})
            return json.load(urllib.request.urlopen(req,timeout=180))
        except Exception as e:
            print('retry',a,e,flush=True);time.sleep(5*(a+1))
    raise SystemExit('failed')
base={'where':where,'geometry':','.join(map(str,bb)),'geometryType':'esriGeometryEnvelope','inSR':27700,'spatialRel':'esriSpatialRelIntersects','outSR':27700,'outFields':'*','f':'geojson'}
n=q({**base,'returnCountOnly':'true','f':'json'})['count'];print(url,'count',n,flush=True)
feats=[];off=0;page=1000
while off<n:
    r=q({**base,'resultOffset':off,'resultRecordCount':page,'orderByFields':'OBJECTID'})
    fs=r.get('features',[])
    if not fs: print('empty page at',off,str(r)[:200]);break
    feats+=fs;off+=len(fs);print(off,'/',n,flush=True)
json.dump({'type':'FeatureCollection','features':feats},open(out,'w'))
print('done',out,len(feats))
