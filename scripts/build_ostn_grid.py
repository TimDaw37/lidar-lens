"""Correction grid (OSTN15 minus 7-parameter Helmert) for WGS84<->OSGB in the browser. Covers the configured bbox with margin."""
import os,json; os.environ['PROJ_NETWORK']='ON'
import numpy as np
from pyproj.transformer import TransformerGroup
tg=TransformerGroup('EPSG:4326','EPSG:27700',always_xy=True)
ost=[t for t in tg.transformers if 'OSTN15' in t.definition][0]; hel=[t for t in tg.transformers if 'helmert' in t.definition and 'x=446.448' in t.definition][0]
# bbox from env BBOX='lat0,lat1,lng0,lng1' (WGS84), grid step 0.02 deg
lat0,lat1,lng0,lng1=map(float,os.environ.get('BBOX','50.80,51.80,-2.50,-1.40').split(','));st=0.02
la=np.round(np.arange(lat0,lat1+1e-9,st),4); lo=np.round(np.arange(lng0,lng1+1e-9,st),4)
LO,LA=np.meshgrid(lo,la)
e1,n1=ost.transform(LO,LA); e2,n2=hel.transform(LO,LA)
de=np.round(e1-e2,2); dn=np.round(n1-n2,2)
print(de.min(),de.max(),dn.min(),dn.max(),de.shape)
tests=[[(lat0+lat1)/2,(lng0+lng1)/2],[lat0+0.2,lng0+0.2],[lat1-0.2,lng1-0.2]]
tv=[[a,b,*ost.transform(b,a),*hel.transform(b,a)] for a,b in tests]
json.dump({'lat0':lat0,'lng0':lng0,'step':st,'nlat':len(la),'nlng':len(lo),'de':de.flatten().tolist(),'dn':dn.flatten().tolist(),'test':tv},open(os.environ.get('OSTN_OUT','site/data/ostn_grid.json'),'w'),separators=(',',':'))
print(tv)
