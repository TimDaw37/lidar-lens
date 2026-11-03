"""Bulk upload the Orkney lens to R2 through the lidar-lens-orkney Worker's TEMPORARY /__bulk_upload route (secret UPLOAD_SECRET; route + secret removed afterwards).
Resumable (upload_done.txt). Order: viewer assets + layers, Brodgar/Stenness tiles, the rest, index.html LAST."""
import os, json, time, struct, hashlib, threading, requests, mercantile
from concurrent.futures import ThreadPoolExecutor, as_completed
ROOT='/workspace/lidar-orkney'; U='https://lidar-lens-orkney.tim-daw.workers.dev/__bulk_upload'
SEC=open(f'{ROOT}/deploy-full/.upload_secret').read().strip(); DONE=f'{ROOT}/upload_done.txt'; CONC=int(os.environ.get('CONC',8))
TYPES={'webp':'image/webp','json':'application/json','geojson':'application/geo+json','js':'text/javascript','html':'text/html; charset=utf-8','css':'text/css','png':'image/png','svg':'image/svg+xml','ico':'image/x-icon','webmanifest':'application/manifest+json','txt':'text/plain'}
IMM='public, max-age=31536000, immutable'; DAY='public, max-age=86400'
done=set(l.split()[0] for l in open(DONE)) if os.path.exists(DONE) else set()
def walk(d,prefix):
    for dp,_,fs in os.walk(d):
        for f in sorted(fs): p=os.path.join(dp,f); yield prefix+os.path.relpath(p,d), p
items=[]
for k,p in walk(f'{ROOT}/viewer/dist',''):
    if k in ('index.html','nhle_places.json','_headers'): continue
    items.append((0,k,p,IMM if k.startswith('assets/') else 'no-cache'))
for k,p in walk(f'{ROOT}/site/layers','layers/'): items.append((0,k,p,'no-cache' if k.endswith('index.json') else DAY))
items+= [(0,'hes_sm.geojson',f'{ROOT}/site/hes_sm.geojson','no-cache'),(0,'coverage_outline.geojson',f'{ROOT}/viewer/site/coverage_outline.geojson','no-cache'),
         (0,'data/ostn_grid.json',f'{ROOT}/viewer/site/data/ostn_grid.json',DAY),(0,'models.json',f'{ROOT}/deploy-full/models.json','no-cache')]
boxes=[(-3.36,58.98,-3.15,59.06)]  # Heart of Neolithic Orkney first
def pri(z,x,y):
    b=mercantile.bounds(x,y,z); return 1 if any(b.east>w and b.west<e and b.north>s and b.south<n for w,s,e,n in boxes) else 2
for k,p in [(k,p) for k,p in walk(f'{ROOT}/full/tiles','terrain/') if k.endswith('.webp')]:
    z,x,y=k.split('/')[1:]; items.append((pri(int(z),int(x),int(y[:-5])),k,p,IMM))
items=[i for i in items if i[1] not in done]; items.sort(key=lambda i:(i[0],i[1])); print('to send',len(items),flush=True)
batches=[];cur=[];sz=0
for it in items:
    n=os.path.getsize(it[2])
    if cur and (len(cur)>=200 or sz+n>8e6 or cur[0][0]!=it[0]): batches.append(cur);cur=[];sz=0
    cur.append(it);sz+=n
if cur: batches.append(cur)
lock=threading.Lock(); out=open(DONE,'a'); st={'ok':0,'fail':0,'bytes':0,'retry':0}; t0=time.time(); tot=len(items)
def send(b):
    hdr=[];bodies=[]
    for _,k,p,cc in b:
        d=open(p,'rb').read(); bodies.append(d)
        hdr.append(dict(k=k,n=len(d),ct=TYPES.get(k.rsplit('.',1)[-1],'application/octet-stream'),cc=cc,md5=hashlib.md5(d).hexdigest()))
    hj=json.dumps(hdr).encode(); payload=struct.pack('>I',len(hj))+hj+b''.join(bodies); last=''
    for a in range(8):
        try:
            r=requests.post(U,data=payload,headers={'X-Upload-Secret':SEC},timeout=180)
            if r.status_code==200: return hdr
            with lock: st['retry']+=1
            last=f'{r.status_code} {r.text[:200]}'
        except requests.RequestException as e: last=repr(e)
        time.sleep(min(60,2**a))
    raise RuntimeError(last)
with ThreadPoolExecutor(CONC) as ex:
    fs=[ex.submit(send,b) for b in batches]
    for i,f in enumerate(as_completed(fs)):
        try:
            h=f.result()
            with lock:
                for it in h: out.write(f"{it['k']} {it['md5']}\n")
                out.flush(); st['ok']+=len(h); st['bytes']+=sum(it['n'] for it in h)
        except Exception as e: st['fail']+=1; print('FAIL batch',e,flush=True)
        if i%20==0: print(time.strftime('%H:%M:%S'),st,flush=True)
if st['fail']==0 and os.environ.get('FINAL')=='1': send([(0,'index.html',f'{ROOT}/viewer/dist/index.html','no-cache')]); print('index.html sent last',flush=True)
print('finished',st,round(time.time()-t0),flush=True)
