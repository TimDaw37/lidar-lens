"""Phase B step 1, stage 4: zoom 16-13 packs from the zoom 16 block copies (NaN-aware box mean; a coarser pixel is kept when at least a
quarter of the zoom 16 pixels under it are ground; the GEM-15 marker when half of them are marked). Then the index ie/lidar/index.json."""
import json,os,glob,numpy as np,time
from build import enc,pack,occ,OUT
from multiprocessing import Pool
Z16={tuple(map(int,os.path.basename(f)[:-4].split('_'))):f for f in glob.glob(f'{OUT}/z16/*.npz')}
def one(a):
    z,P=a; X,Y=P; n=2**(17-z); f=2**(16-z); sz=1024//f; H=np.full((2048,2048),np.nan,'float32'); C=np.zeros((2048,2048),'float32'); G=np.zeros((2048,2048),'float32'); any_=False
    for j in range(n):
        for i in range(n):
            k=(X*n+i,Y*n+j)
            if k not in Z16: continue
            d=np.load(Z16[k]); h=d['h']; g=d['g']; v=np.isfinite(h)
            q=h.reshape(sz,f,sz,f); c=v.reshape(sz,f,sz,f).sum(axis=(1,3)); s=np.nansum(q,axis=(1,3)); gg=(g&v).reshape(sz,f,sz,f).sum(axis=(1,3))
            ok=c*4>=f*f; H[j*sz:(j+1)*sz,i*sz:(i+1)*sz]=np.where(ok,s/np.maximum(c,1),np.nan); G[j*sz:(j+1)*sz,i*sz:(i+1)*sz]=np.where(ok,gg*2>=np.maximum(c,1),0); any_=True
    if not any_: return None
    tiles={}
    for j in range(8):
        for i in range(8):
            hh=H[j*256:(j+1)*256,i*256:(i+1)*256]
            if np.isfinite(hh).sum()>=16: tiles[j*8+i]=enc(hh,G[j*256:(j+1)*256,i*256:(i+1)*256]>0)
    if not tiles: return None
    os.makedirs(f'{OUT}/{z}',exist_ok=True); fo=f'{OUT}/{z}/{X}_{Y}.pak'; open(fo,'wb').write(pack(tiles))
    return {'z':z,'k':f'{X}_{Y}','occ':occ(tiles),'n':len(tiles),'bytes':os.path.getsize(fo)}
if __name__=='__main__':
    t=time.time(); jobs=[]
    for z in (16,15,14,13):
        n=2**(17-z); jobs+=[(z,P) for P in sorted({(x//n,y//n) for (x,y) in Z16})]
    with Pool(6) as p: res=[r for r in p.imap_unordered(one,jobs) if r]
    z17=json.load(open(f'{OUT}/z17.json'))
    idx={'v':1,'minz':13,'maxz':17,'made':time.strftime('%Y-%m-%d'),'note':'Irish LiDAR, 1 m and finer (GSI open data, CC BY 4.0), OD Malin Head; packs of 64 tiles: 512-byte header of 64 x (offset, length) uint32 LE, slot = row*8 + col; occupancy: 16 hex digits, slot s = bit (s & 3) of digit (s >> 2)',
         'p':{str(z):{} for z in range(13,18)}}
    for r in z17: idx['p']['17'][r['k']]=r['occ']
    for r in res: idx['p'][str(r['z'])][r['k']]=r['occ']
    json.dump(idx,open(f'{OUT}/index.json','w'),separators=(',',':'))
    st={z:{'packs':len(idx['p'][z]),'tiles':sum(bin(int(o,16)).count('1') for o in idx['p'][z].values())} for z in idx['p']}
    st['bytes']=sum(r['bytes'] for r in res)+sum(r['bytes'] for r in z17)
    json.dump(st,open(f'{OUT}/pyramid.json','w'),indent=1); print('PYRAMID_DONE',st,'%.0fs'%(time.time()-t),time.strftime('%H:%M:%S'),flush=True)
