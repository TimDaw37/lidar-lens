# Run in a work folder holding list.json ([[z,x,y],...]: zoom 8-10 tiles not wholly inside the Scotland outline); writes tiles/{z}/{x}/{y}.png -> R2 gb-live-test/ewov/
# England/Wales overview tiles (zoom 8-10) for the GB live-test lens, built once from the GB relay's 64 m blocks, the same
# sources and Terrarium encoding as the service worker's tile() (EA composite DTM, Welsh Government DTM laid over it in Wales).
import json,math,os,sys,zlib,io,time,urllib.request,numpy as np,tifffile
from concurrent.futures import ThreadPoolExecutor
from pyproj import Transformer
from PIL import Image
R=64;S=512*R;EA='https://lidar-lens-gb-relay-test.tim-daw.workers.dev/wcs';WA='https://lidar-lens-gb-relay-test.tim-daw.workers.dev/wales'
WALES=dict(e0=164993,n0=164000,e1=356007,n1=397000);ENG=dict(e0=80000,n0=0,e1=660000,n1=660000)
TR=Transformer.from_crs(4326,27700,always_xy=True);BD='blocks';FAILS=[]
def readcm(b):
  W,H=np.frombuffer(b[4:8],'<u2');N=int(W)*int(H);pl=np.frombuffer(zlib.decompress(b[8:]),np.uint8)
  z=(pl[:N].astype(np.uint32)|pl[N:2*N].astype(np.uint32)<<8|pl[2*N:3*N].astype(np.uint32)<<16|pl[3*N:4*N].astype(np.uint32)<<24)
  d=((z>>1).astype(np.int64)^-(z&1).astype(np.int64)).reshape(int(H),int(W))
  c=np.cumsum(np.cumsum(d,0),1);c=((c+2**31)%2**32-2**31)
  out=np.where(c==-1000000,np.nan,c/100.0);return out
def get(url,fn):
  if os.path.exists(fn): return open(fn,'rb').read()
  last=None
  for t in range(2):
    try:
      r=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'lens-ewov-build'}),timeout=120);b=r.read();open(fn,'wb').write(b);return b
    except urllib.error.HTTPError as e:
      if e.code in (400,404): open(fn,'wb').write(b'');return b''
      last=e.code
    except Exception as e: last=str(e)
    time.sleep(5*(t+1))
  return None
def decode(b,zero):
  if b is None: return 'FAIL'
  if not b: return None
  a=readcm(b) if b[:4]==b'LLC1' else tifffile.imread(io.BytesIO(b)).astype(np.float64)
  a=np.where(~(a>-1000)|((a==0) if zero else False),np.nan,a)
  return a if np.isfinite(a).any() else None
def block(bx,by):
  x0,x1,y0,y1=bx*S-R,bx*S+S+R,by*S-R,by*S+S+R
  def src(base,tag,zero):
    b=get(f'{base}?r={R}&bx={bx}&by={by}&f=cm',f'{BD}/{tag}_{bx}_{by}.cm')
    v=decode(b,zero) if b is not None else 'FAIL'
    if isinstance(v,str) or (b and b[:4]!=b'LLC1'):
      b2=get(f'{base}?r={R}&bx={bx}&by={by}',f'{BD}/{tag}_{bx}_{by}.tif');v=decode(b2,zero)
    return v
  e=src(EA,'ea',True)
  w=src(WA,'wa',False) if (x1>WALES['e0'] and x0<WALES['e1'] and y1>WALES['n0'] and y0<WALES['n1']) else None
  if isinstance(e,str) or isinstance(w,str): FAILS.append((bx,by,'ea' if isinstance(e,str) else 'wa'))
  if isinstance(e,str): e=None
  if isinstance(w,str): w=None
  if e is not None and w is not None: e=np.where(np.isfinite(w),w,e)
  elif w is not None: e=w
  return (x0,y1,e) if e is not None else None
def t2lat(y,n): return np.degrees(np.arctan(np.sinh(np.pi*(1-2*y/n))))
def pix(z,x,y):
  n=2**z;i=(np.arange(256)+0.5)/256;LO=(x+i)/n*360-180;LA=t2lat(y+i,n);lo,la=np.meshgrid(LO,LA);return TR.transform(lo,la)
L=json.load(open('list.json'));jobs={}
for z,x,y in L:
  E,N=pix(z,x,y)
  if E.max()<ENG['e0'] or E.min()>ENG['e1'] or N.max()<ENG['n0'] or N.min()>ENG['n1']: continue
  ids={(bx,by) for bx in range(int(E.min()//S),int(E.max()//S)+1) for by in range(int(N.min()//S),int(N.max()//S)+1)}
  jobs[(z,x,y)]=ids
need=sorted(set().union(*jobs.values()));print('tiles',len(jobs),'blocks',len(need),flush=True)
B={}
with ThreadPoolExecutor(int(os.environ.get('P','6'))) as ex:
  for k,v in zip(need,ex.map(lambda k:block(*k),need)): B[k]=v
print('blocks done; with data',sum(1 for v in B.values() if v is not None),'fails',FAILS,flush=True)
made=0;tot=0
for (z,x,y),ids in jobs.items():
  E,N=pix(z,x,y);h=np.full((256,256),np.nan)
  for (bx,by) in ids:
    b=B.get((bx,by))
    if b is None: continue
    x0,yT,a=b;m=(np.floor(E/S)==bx)&(np.floor(N/S)==by)
    if not m.any(): continue
    fx=(E[m]-x0)/R-0.5;fy=(yT-N[m])/R-0.5;ix=np.floor(fx).astype(int);iy=np.floor(fy).astype(int);ax=fx-ix;ay=fy-iy
    H,W=a.shape;ok=(ix>=0)&(iy>=0)&(ix+1<W)&(iy+1<H);ix=np.clip(ix,0,W-2);iy=np.clip(iy,0,H-2)
    h00,h10,h01,h11=a[iy,ix],a[iy,ix+1],a[iy+1,ix],a[iy+1,ix+1]
    bl=(h00*(1-ax)+h10*ax)*(1-ay)+(h01*(1-ax)+h11*ax)*ay
    q=np.where(ay>0.5,np.where(ax>0.5,h11,h01),np.where(ax>0.5,h10,h00))
    v=np.where(np.isfinite(bl),bl,q);v=np.where(ok,v,np.nan);hm=h[m];hm[:]=v;h[m]=hm
  good=np.isfinite(h)
  if not good.any(): continue
  vv=np.round((np.where(good,h,0)+32768)*64)/64;vi=np.floor(vv).astype(np.int64)
  px=np.zeros((256,256,4),np.uint8);px[...,0]=vi>>8;px[...,1]=vi&255;px[...,2]=np.round((vv-vi)*256).astype(np.int64)&255;px[...,3]=255
  px[~good]=0
  os.makedirs(f'tiles/{z}/{x}',exist_ok=True);f=f'tiles/{z}/{x}/{y}.png';Image.fromarray(px,'RGBA').save(f,optimize=True);made+=1;tot+=os.path.getsize(f)
print('made',made,'tiles',round(tot/1e6,1),'MB',flush=True);json.dump(FAILS,open('fails.json','w'))
