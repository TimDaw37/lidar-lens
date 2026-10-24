"""Coverage gaps against the island itself (not the sea in the buffer): intersect coverage_gaps.geojson with the ONS
Isle of Anglesey boundary (LAD W06000001, BFC). usage: python gap_check_island.py BUILD_DIR ISLAND_27700.geojson"""
import sys,geopandas as gpd
R,I=sys.argv[1],sys.argv[2]
gaps=gpd.read_file(f'{R}/coverage_gaps.geojson').to_crs(27700); isl=gpd.read_file(I).set_crs(27700,allow_override=True).geometry.union_all()
g=gaps.geometry.intersection(isl).explode(index_parts=False); g=g[~g.is_empty&(g.area>0)]
print(f'island {isl.area/1e6:.1f} km2; gaps {g.area.sum()/1e6:.4f} km2 in {len(g)} pieces ({g.area.sum()/isl.area*100:.4f}%), largest {g.area.max()/1e4 if len(g) else 0:.2f} ha')
gpd.GeoDataFrame({'area_m2':g.area.round(0).values},geometry=g.values,crs=27700).to_file(f'{R}/coverage_gaps_island.geojson',driver='GeoJSON')
