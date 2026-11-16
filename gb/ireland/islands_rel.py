import osmium,json
out=[]
class H(osmium.SimpleHandler):
    def area(self,a):
        p=a.tags.get('place')
        if a.from_way() or p not in ('island','islands','archipelago','islet') or 'name' not in a.tags: return
        n=0;sx=sy=0
        for ring in a.outer_rings():
            for nd in ring: sx+=nd.lat;sy+=nd.lon;n+=1
        if n: out.append(('r',a.orig_id(),p,a.tags.get('name:en') or a.tags.get('name'),a.tags.get('name'),None,sx/n,sy/n))
H().apply_file('ie.osm.pbf',locations=True,idx='flex_mem')
json.dump(out,open('islands_rel.json','w'));print(len(out),[x[3] for x in out][:40])
