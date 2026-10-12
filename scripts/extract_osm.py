"""Extract the OSM features the 'What is it?' card needs from a Geofabrik .osm.pbf into one GeoJSON (WGS84).
usage: extract_osm.py in.osm.pbf out.geojsonl"""
import sys, json, osmium
from shapely import wkb
IN,OUT=sys.argv[1],sys.argv[2]
fab=osmium.geom.WKBFactory()
TRACK={'track','path','bridleway','footway','service','cycleway','byway'}
EDGE_LU={'farmland','meadow','grass','orchard'};SETTLED={'residential','industrial','farmyard','commercial','retail'}
out=open(OUT,'w');n=0
def cls(t):
    if 'historic' in t: return 'historic'
    if t.get('highway') in TRACK: return 'track'
    if t.get('barrier') in ('hedge','fence','wall','ditch','hedge_bank'): return 'fieldedge'
    if t.get('landuse') in EDGE_LU: return 'fieldpoly'
    if t.get('landuse') in SETTLED: return 'settled'
    if t.get('natural') in ('wood','scrub') or t.get('landuse')=='forest': return 'wood'
    if t.get('natural')=='water' or t.get('landuse') in('reservoir','basin'): return 'water'
    if t.get('waterway') in ('stream','river','drain','ditch','canal'): return 'stream'
    if t.get('man_made')=='embankment': return 'embankment'
    return None
def emit(kind,geom,t,oid):
    global n
    p={'k':kind,'id':oid}
    if kind=='historic':
        p.update({'name':t.get('name',''),'historic':t.get('historic',''),'site':t.get('archaeological_site') or t.get('site_type') or '','period':t.get('historic:period',''),'desc':t.get('description','')[:200]})
    out.write(json.dumps({'type':'Feature','properties':p,'geometry':geom.__geo_interface__})+'\n');n+=1
class H(osmium.SimpleHandler):
    def node(self,o):
        t=dict(o.tags)
        if 'historic' in t:
            try: emit('historic',wkb.loads(fab.create_point(o),hex=True),t,'node/'+str(o.id))
            except Exception: pass
    def way(self,o):
        t=dict(o.tags);k=cls(t)
        if not k or k in('wood','water','settled','fieldpoly') and o.is_closed(): 
            if not(k=='historic'): return
        try: g=wkb.loads(fab.create_linestring(o),hex=True)
        except Exception: return
        emit(k,g,t,'way/'+str(o.id))
    def area(self,a):
        t=dict(a.tags);k=cls(t)
        if k not in('wood','water','settled','fieldpoly','historic'): return
        if k=='historic' and a.from_way(): return  # closed historic ways already emitted as lines; keep polygons from relations only
        try: g=wkb.loads(fab.create_multipolygon(a),hex=True)
        except Exception: return
        emit(k,g,t,('way/' if a.from_way() else 'relation/')+str(a.orig_id()))
H().apply_file(IN,locations=True)
print('features',n)
