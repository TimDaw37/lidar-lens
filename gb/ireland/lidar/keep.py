"""Phase B step 1, stage 2: the 'drop patches under about 1 km2' rule. All 20 m ITM valid-fraction grids are mosaicked (max), cells with
any ground are joined 8-connected, and a patch is dropped when its ground (sum of fractions x 400 m2) is under MINA. Writes keep.tif."""
import json,glob,numpy as np,rasterio,sys
from scipy import ndimage
from affine import Affine
MINA=float(sys.argv[1]) if len(sys.argv)>1 else 1e6
M=[m for m in json.load(open('convert.json')) if 'err' not in m]
G=[(m,np.load(f"src/{m['layer']}/{m['name']}.frac.npy")) for m in M]
l=min(m['g0'][0] for m,_ in G); t=max(m['g0'][1] for m,_ in G)
r=max(m['g0'][0]+g.shape[1]*20 for m,g in G); b=min(m['g0'][1]-g.shape[0]*20 for m,g in G)
W=int(round((r-l)/20)); H=int(round((t-b)/20)); A=np.zeros((H,W),'float32')
for m,g in G:
    c=int(round((m['g0'][0]-l)/20)); rr=int(round((t-m['g0'][1])/20)); s=A[rr:rr+g.shape[0],c:c+g.shape[1]]; np.maximum(s,g[:s.shape[0],:s.shape[1]],out=s)
lab,n=ndimage.label(A>0,structure=np.ones((3,3)))
area=ndimage.sum(A,lab,index=np.arange(1,n+1))*400
dropped=np.zeros(n+1,bool); dropped[1:]=area<MINA
keep=(lab>0)&~dropped[lab]; dropc=dropped[lab]&(lab>0)
keep=ndimage.binary_dilation(keep,iterations=1)&~dropc
with rasterio.open('keep.tif','w',driver='GTiff',width=W,height=H,count=1,dtype='uint8',crs='EPSG:2157',transform=Affine(20,0,l,0,-20,t),compress='deflate') as d: d.write(keep.astype('uint8'),1)
S={'patches':int(n),'dropped':int(dropped.sum()),'dropped_km2':float(area[area<MINA].sum()/1e6),'kept':int(n-dropped.sum()),'kept_km2':float(area[area>=MINA].sum()/1e6),
   'min_area_m2':MINA,'largest_dropped_km2':float(area[area<MINA].max()/1e6) if dropped.any() else 0}
json.dump(S,open('keep.json','w'),indent=1); print(S)
