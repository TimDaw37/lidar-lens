import json,numpy as np,collections
from scipy.spatial import cKDTree
from shapely.geometry import Polygon,Point
from pyproj import Transformer
P=Polygon([(b,a) for a,b in json.load(open('../mask/ie_poly.json'))])
raw=json.load(open('places_all.json')); d=json.load(open('smr_roi.json'))
tt=lambda s:' '.join(w.capitalize() for w in s.split())
pts=[(x['LATITUDE'],x['LONGITUDE']*0.6) for x in d]; lab=['Co. '+tt(x['COUNTY']) for x in d]
t=Transformer.from_crs(29902,4326,always_xy=True)
CO={'ANT':'Co. Antrim','ARM':'Co. Armagh','DOW':'Co. Down','FER':'Co. Fermanagh','LDY':'Co. Londonderry','TYR':'Co. Tyrone'}
for f in json.load(open('nismr.geojson'))['features']:
    p=f['properties']
    if p['SMRNo'][:3] in CO: lo,la=t.transform(p['X'],p['Y']); pts.append((la,lo*0.6)); lab.append(CO[p['SMRNo'][:3]]+', NI')
T=cKDTree(np.array(pts))
KIND={'city':'city','town':'town','village':'village','hamlet':'hamlet','suburb':'district','island':'island','islet':'island','islands':'islands','archipelago':'islands'}
out=[];seen=set()
for r in raw:
    typ,i,p,name,nat,pop,la,lo=r[:8]
    if not P.contains(Point(lo,la)): continue
    k=(name.lower(),round(la,2),round(lo,2))
    if k in seen: continue
    seen.add(k); _,j=T.query((la,lo*0.6))
    try: pop=int(str(pop).replace(',','')) if pop else 0
    except: pop=0
    row=[name,round(la,5),round(lo,5),KIND[p],lab[j],pop]
    if nat and nat!=name: row.append(nat)
    out.append(row)
json.dump(out,open('towns-ie.json','w'),separators=(',',':'),ensure_ascii=False)
print(len(out),collections.Counter(r[3] for r in out))
for q in ['Skellig','Inishmore','Aran','Derry','Great Blasket','Tory']:
    print(q,[r for r in out if q.lower() in r[0].lower()][:4])
