# Pilot area: Fife + Lothians land (ONS LAD Dec 2023 BFC) + 30 m, EPSG:27700
import json,geopandas as gpd,sys
names=sys.argv[1].split(',');out=sys.argv[2]
g=gpd.read_file('/workspace/research/orkney-lens/scot/lad_bfc.geojson').set_crs(27700,allow_override=True)
a=g[g.LAD23NM.isin(names)]
assert len(a)==len(names),a.LAD23NM.tolist()
u=a.geometry.union_all().buffer(30).simplify(5)
gpd.GeoSeries([u],crs=27700).to_file(out,driver='GeoJSON');print(names,'land',round(a.area.sum()/1e6),'km2; buffered',round(u.area/1e6),'km2')
