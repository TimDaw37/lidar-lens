# products.json -> data/products_idx.json : priority-ordered OGL DTM products with BNG bbox
import json
from pyproj import Transformer
T=Transformer.from_crs(4326,27700,always_xy=True)
PRI=['national-lidar-programme','coastal/coastal-2025-2026','orkney-islands-council-23','outerheb-2019/dtm/25cm','outerheb-2019/dtm/50cm','phase-6','phase-5','phase-4','hes/hes-2017sp3','hes/hes-2017','hes/hes-2016','phase-3','phase-2','phase-1']
d=json.load(open('/workspace/research/orkney-lens/scot/products.json'));out=[];cons={}
for i,c in enumerate(PRI):
    for p in d[c]:
        pts=[T.transform(*q) for q in p['footprint']['coordinates'][0][0]]
        xs=[q[0] for q in pts];ys=[q[1] for q in pts];h=p['data']['product']['http']
        out.append(dict(pri=i,coll=c,url=h['url'],size=h['size'],bbox=[min(xs),min(ys),max(xs),max(ys)]))
        cons.setdefault(c,p['metadata'].get('useConstraints'))
json.dump(dict(pri=PRI,products=out),open('data/products_idx.json','w'));json.dump(cons,open('data/use_constraints.json','w'),indent=1)
print(len(out))
