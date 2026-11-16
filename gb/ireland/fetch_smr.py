import json,urllib.request,urllib.parse,time
U='https://services-eu1.arcgis.com/HyjXgkV6KGMSF3jt/arcgis/rest/services/SMROpenData/FeatureServer/0/query'
out=[];off=0
while True:
    q=urllib.parse.urlencode({'where':'1=1','outFields':'ENTITY_ID,SMRS,MONUMENT_CLASS,TOWNLAND,COUNTY,LATITUDE,LONGITUDE,ITM_E,ITM_N,WEBSITE_LINK,WEB_NOTES','returnGeometry':'false','orderByFields':'OBJECTID','resultOffset':off,'resultRecordCount':2000,'f':'json'})
    for t in range(5):
        try:
            j=json.load(urllib.request.urlopen(urllib.request.Request(U+'?'+q,headers={'User-Agent':'lidar-lens build (Tim Daw)'}),timeout=120));break
        except Exception as e: print('retry',off,e); time.sleep(5)
    f=j.get('features',[]); out+= [x['attributes'] for x in f]; off+=len(f)
    if not f or not j.get('exceededTransferLimit'): break
print(len(out)); json.dump(out,open('smr_roi.json','w'))
