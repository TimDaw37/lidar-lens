"""Fill/refresh the WGS84 fields of site/models.json from the OSGB ones (EPSG:27700 -> 4326).
Usage: python scripts/models_wgs84.py   (needs pyproj). Edit only the OSGB 'point' / 'bbox' by hand."""
import json
from pyproj import Transformer
t = Transformer.from_crs(27700, 4326, always_xy=True)
P = 'site/models.json'
d = json.load(open(P))
for m in d['models']:
    g = m['geometry']
    if 'point' in g:
        lon, lat = t.transform(*g['point']); g['latlng'] = [round(lat, 6), round(lon, 6)]
    if 'bbox' in g:
        w, s, e, n = g['bbox']; lon0, lat0 = t.transform(w, s); lon1, lat1 = t.transform(e, n)
        g['latlngBounds'] = [[round(lat0, 6), round(lon0, 6)], [round(lat1, 6), round(lon1, 6)]]
json.dump(d, open(P, 'w'), indent=1, ensure_ascii=False)
print(len(d['models']), 'models')
