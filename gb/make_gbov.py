# Zoom 6-7 overview tiles for the GB live-test lens (all of GB at a glance without hundreds of zoom 8 tiles): built from the zoom 8
# tiles the lens already uses: Scottish open LiDAR overview (Worker terrain/8), England/Wales overview (ewov/8), and GEM-15 (gem15/8)
# where there is no LiDAR and the GEM-15 mask allows it, keeping its marker. 2x2 means, LiDAR first.
import numpy as np, json, os, io, math, urllib.request
from PIL import Image
LT='https://lidar-lens-gb-live-test.tim-daw.workers.dev/'
EW='/workspace/lidar-cvat/ewov-20261113/tiles/8';GEM=['/workspace/lidar-cvat/gem15-fallback-20261113/tiles/gem15/8','/workspace/lidar-cvat/fy-gem/tiles/8']
M=json.load(open('/workspace/lidar-cvat/tw-mask/mask-v1.json'));MA=np.zeros(M['nr']*M['nc'],np.uint8)
for i,r in enumerate(M['rows']):
  for k in range(0,len(r),2): MA[i*M['nc']+r[k]:i*M['nc']+r[k+1]]=1
MA=MA.reshape(M['nr'],M['nc'])
def dec(a):
  a=a.astype(np.float64);h=a[...,0]*256+a[...,1]+a[...,2]/256-32768;ok=a[...,3]>=128;g=ok&((a[...,2].astype(int)&3)==2);return np.where(ok,h,np.nan),g
def t2lat(y,n): return np.degrees(np.arctan(np.sinh(np.pi*(1-2*y/n))))
def maskpx(z,x,y):
  n=2**z;i=(np.arange(256)+0.5)/256;lo=(x+i)/n*360-180;la=t2lat(y+i,n)
  r=np.floor((M['lat1']-la)/M['dlat']).astype(int);c=np.floor((lo-M['lng0'])/M['dlng']).astype(int)
  okr=(r>=0)&(r<M['nr']);okc=(c>=0)&(c<M['nc']);R,C=np.meshgrid(np.clip(r,0,M['nr']-1),np.clip(c,0,M['nc']-1),indexing='ij')
  return MA[R,C].astype(bool)&okr[:,None]&okc[None,:]
def get(url):
  try: return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'lens-gbov-build'}),timeout=60).read()
  except urllib.error.HTTPError as e: return None
n8=256;L={};G={}
for x in range(int((-8.8+180)/360*n8),int((1.8+180)/360*n8)+1):
  for y in range(int((1-math.asinh(math.tan(math.radians(61.0)))/math.pi)/2*n8),int((1-math.asinh(math.tan(math.radians(48.85)))/math.pi)/2*n8)+1):
    lid=np.full((256,256),np.nan);gem=np.full((256,256),np.nan)
    b=get(f'{LT}terrain/8/{x}/{y}.webp')
    if b:
      h,g=dec(np.array(Image.open(io.BytesIO(b)).convert('RGBA')));lid=np.where(~g,h,np.nan);gem=np.where(g,h,gem)
    f=f'{EW}/{x}/{y}.png'
    if os.path.exists(f):
      h,g=dec(np.array(Image.open(f).convert('RGBA')));lid=np.where(np.isfinite(lid),lid,np.where(~g,h,np.nan))
    for d in GEM:
      f=f'{d}/{x}/{y}.webp'
      if os.path.exists(f):
        h,g=dec(np.array(Image.open(f).convert('RGBA')));gem=np.where(np.isfinite(gem),gem,np.where(g,h,np.nan))
    gem=np.where(maskpx(8,x,y),gem,np.nan)
    if np.isfinite(lid).any() or np.isfinite(gem).any(): L[(8,x,y)]=lid;G[(8,x,y)]=gem
print('z8 tiles',len(L),flush=True)
def down(D,z):
  out={}
  for (_,X,Y) in {(z,x//2,y//2) for (zz,x,y) in D if zz==z+1}:
    q=np.full((512,512),np.nan)
    for dx in (0,1):
      for dy in (0,1):
        c=D.get((z+1,2*X+dx,2*Y+dy))
        if c is not None: q[dy*256:(dy+1)*256,dx*256:(dx+1)*256]=c
    with np.errstate(all='ignore'): out[(z,X,Y)]=np.nanmean(q.reshape(256,2,256,2),axis=(1,3))
  return out
def enc(lid,gem):
  ok=np.isfinite(lid);gk=~ok&np.isfinite(gem);px=np.zeros((256,256,4),np.uint8)
  v=np.round((np.where(ok,lid,0)+32768)*64)/64;vi=np.floor(v).astype(np.int64)
  px[...,0]=vi>>8;px[...,1]=vi&255;px[...,2]=np.round((v-vi)*256).astype(np.int64)&255;px[...,3]=np.where(ok,255,0)
  w=np.round(np.where(gk,gem,0)*16)/16+32768.0;R=np.floor(w/256);Gc=np.floor(w)-R*256;Bc=np.round((w-np.floor(w))*256)+2
  px[gk,0]=R[gk];px[gk,1]=Gc[gk];px[gk,2]=Bc[gk];px[gk,3]=255;return px
n=0;tot=0
for z in (7,6):
  L.update(down(L,z));G.update(down(G,z))
  for k in [k for k in L if k[0]==z]:
    px=enc(L[k],G[k])
    if px[...,3].any():
      os.makedirs(f'tiles/{z}/{k[1]}',exist_ok=True);f=f'tiles/{z}/{k[1]}/{k[2]}.png';Image.fromarray(px,'RGBA').save(f,optimize=True);n+=1;tot+=os.path.getsize(f)
print('made',n,round(tot/1e6,1),'MB')
