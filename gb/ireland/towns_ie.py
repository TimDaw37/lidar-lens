import osmium,json
K={'city','town','village','hamlet','island','islet','islands','archipelago','suburb'}
out=[]
class H(osmium.SimpleHandler):
    def node(self,n):
        p=n.tags.get('place')
        if p in K and ('name' in n.tags or 'name:en' in n.tags):
            out.append(('n',n.id,p,n.tags.get('name:en') or n.tags.get('name'),n.tags.get('name'),n.tags.get('population'),n.location.lat,n.location.lon))
    def way(self,w):
        p=w.tags.get('place')
        if p in ('island','islands','archipelago') and ('name' in w.tags):
            try:
                xs=[(nd.lat,nd.lon) for nd in w.nodes if nd.location.valid()]
            except Exception: return
            if xs: out.append(('w',w.id,p,w.tags.get('name:en') or w.tags.get('name'),w.tags.get('name'),None,sum(a for a,b in xs)/len(xs),sum(b for a,b in xs)/len(xs),len(xs)))
H().apply_file('ie.osm.pbf',locations=True,idx='flex_mem')
json.dump(out,open('places_raw.json','w'))
import collections;print(len(out),collections.Counter(x[2] for x in out))
