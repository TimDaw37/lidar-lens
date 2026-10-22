"""Make the compact rights-of-way file the viewer shows (site/prow.geojson), from a council's open data.

Councils publish rights of way in one of two ways, and both work:
  - an ArcGIS map service ("FeatureServer" layer URL), e.g. Wiltshire;
  - a download: a shapefile (.shp, or the .zip it comes in) or a GeoJSON, e.g. North Yorkshire.

usage:
  fetch_prow.py SOURCE OUT.geojson TYPE_FIELD 'byway=VAL,restricted=VAL,bridleway=VAL,footpath=VAL' [NAME_FIELDS] [--bbox "xmin ymin xmax ymax"]
  fetch_prow.py SOURCE --fields [FIELD]      # list the fields, or the values found in one field, to fill in the line above

  SOURCE       ArcGIS layer URL (https://.../FeatureServer/0) or a local .shp / .zip / .geojson
  TYPE_FIELD   the field that says what kind of path it is
  VAL          that field's value for each kind; several values separated by |, matched ignoring case
               (e.g. 'byway=BOAT|Byway Open to All Traffic,restricted=RB,bridleway=BR,footpath=FP')
  NAME_FIELDS  fields joined to label each path in its popup, e.g. PARISH,PATHNO
  --bbox       keep only paths crossing this box, in British National Grid metres (EPSG:27700), e.g. your Lens area

Examples (both OGL v3.0; check each dataset's licence first, and credit the council plus OS, Crown copyright):
  fetch_prow.py https://maps.wiltshire.gov.uk/arcgis/rest/services/OpenData/PublicRightsofWay/FeatureServer/0 site/prow.geojson TYPE 'byway=1,restricted=2,bridleway=3,footpath=4' PARISH,PATHNO
  fetch_prow.py NYC_PROW.zip --fields                    # then pick the type field and its values
  fetch_prow.py NYC_PROW.zip site/prow.geojson <TYPE_FIELD> '<mapping>' <NAME_FIELDS> --bbox "422000 465000 441000 502000"

Then add to the area's config:  prow:{url:'prow.geojson',attribution:'Rights of way: <Council> (OGL v3.0), contains OS data &copy; Crown copyright <year>; working copy, not the legal Definitive Map'}
Needs (downloads only): pip install pyshp pyproj
"""
import sys, json, os, io, zipfile, tempfile, urllib.request, urllib.parse
from collections import Counter

KINDS = {'byway': 1, 'restricted': 2, 'bridleway': 3, 'footpath': 4}


def arcgis(url, fields):
    feats, off = [], 0
    while True:
        q = urllib.parse.urlencode({'where': '1=1', 'outFields': ','.join(fields) or '*', 'outSR': 4326, 'f': 'geojson',
                                    'resultOffset': off, 'resultRecordCount': 2000, 'orderByFields': 'OBJECTID', 'geometryPrecision': 6})
        fs = json.load(urllib.request.urlopen(url.rstrip('/') + '/query?' + q, timeout=120))['features']
        if not fs:
            break
        feats += fs; off += len(fs)
        if len(fs) < 2000:
            break
    return feats


def local(path):
    """Read a shapefile (or a .zip holding one) or a GeoJSON; reproject to WGS84 using the .prj (British National Grid if none)."""
    if path.lower().endswith(('.geojson', '.json')):
        return json.load(open(path))['features']
    import shapefile
    from pyproj import CRS, Transformer
    tmp = None
    if path.lower().endswith('.zip'):
        tmp = tempfile.mkdtemp(); zipfile.ZipFile(path).extractall(tmp)
        shps = [os.path.join(d, f) for d, _, fs in os.walk(tmp) for f in fs if f.lower().endswith('.shp')]
        if len(shps) != 1:
            sys.exit(f'expected one .shp in the zip, found {len(shps)}: {shps}')
        path = shps[0]
    prj = os.path.splitext(path)[0] + '.prj'
    src = CRS.from_wkt(open(prj).read()) if os.path.exists(prj) else CRS.from_epsg(27700)
    tr = Transformer.from_crs(src, 4326, always_xy=True)
    r = shapefile.Reader(path)
    names = [f[0] for f in r.fields[1:]]
    feats = []
    for sr in r.iterShapeRecords():
        s = sr.shape
        if not s.points:
            continue
        parts = list(s.parts) + [len(s.points)]
        lines = [[list(tr.transform(*p[:2])) for p in s.points[parts[i]:parts[i + 1]]] for i in range(len(parts) - 1)]
        g = {'type': 'LineString', 'coordinates': lines[0]} if len(lines) == 1 else {'type': 'MultiLineString', 'coordinates': lines}
        feats.append({'type': 'Feature', 'properties': dict(zip(names, sr.record)), 'geometry': g})
    return feats


def main():
    a = sys.argv[1:]
    bbox = None
    if '--bbox' in a:
        i = a.index('--bbox'); bbox = [float(x) for x in a[i + 1].replace(',', ' ').split()]; del a[i:i + 2]
    src = a[0]
    is_url = src.startswith('http')
    if '--fields' in a:
        feats = arcgis(src, []) if is_url else local(src)
        rest = a[a.index('--fields') + 1:]
        if rest:
            for v, n in Counter(str(f['properties'].get(rest[0])) for f in feats).most_common(40):
                print(f'{n:7d}  {v}')
        else:
            p = feats[0]['properties'] if feats else {}
            print(f'{len(feats)} features. Fields and a sample value:')
            for k, v in p.items():
                print(f'  {k:20s} {v!r}'[:120])
        return
    out, tf, mp = a[1:4]
    names = a[4].split(',') if len(a) > 4 else []
    code = {}
    for k, v in (x.split('=', 1) for x in mp.split(',')):
        for val in v.split('|'):
            code[val.strip().lower()] = KINDS[k.strip()]
    feats = arcgis(src, [tf] + names) if is_url else local(src)
    keep = None
    if bbox:
        from pyproj import Transformer
        t = Transformer.from_crs(27700, 4326, always_xy=True)
        x0, y0 = t.transform(bbox[0], bbox[1]); x1, y1 = t.transform(bbox[2], bbox[3])
        keep = lambda cs: any(x0 <= x <= x1 and y0 <= y <= y1 for x, y in cs)

    def rd(c):
        r = []
        for x, y in c:
            p = [round(x, 5), round(y, 5)]
            if not r or r[-1] != p:
                r.append(p)
        return r
    o, unknown = [], Counter()
    for f in feats:
        g, p = f['geometry'], f['properties']
        if not g:
            continue
        flat = g['coordinates'] if g['type'] == 'LineString' else [c for l in g['coordinates'] for c in l]
        if keep and not keep(flat):
            continue
        v = str(p.get(tf)).strip().lower()
        if v not in code:
            unknown[p.get(tf)] += 1
        cs = rd(g['coordinates']) if g['type'] == 'LineString' else [rd(l) for l in g['coordinates']]
        o.append({'type': 'Feature', 'properties': {'t': code.get(v, 4), 'r': ' '.join(str(p.get(n) or '') for n in names).strip()},
                  'geometry': {'type': g['type'], 'coordinates': cs}})
    json.dump({'type': 'FeatureCollection', 'features': o}, open(out, 'w'), separators=(',', ':'))
    print(len(o), 'paths ->', out, f'({os.path.getsize(out) // 1024} KB)', dict(Counter(f['properties']['t'] for f in o)))
    if unknown:
        print('WARNING: values not in the mapping, drawn as footpaths:', dict(unknown.most_common(10)))


if __name__ == '__main__':
    main()
