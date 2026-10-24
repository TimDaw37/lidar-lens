"""Bulk upload to R2 through the lidar-lens-ure Worker's temporary /__bulk_upload route (avoids Cloudflare API rate limits).
Resumable: done keys in upload_done.txt. Order: viewer + layers, then All Cannings + Stonehenge tiles, then the rest."""
import os, json, time, struct, hashlib, base64, threading, requests, mercantile
from concurrent.futures import ThreadPoolExecutor, as_completed
ROOT=os.environ.get('LENS_ROOT','build'); U='https://lidar-lens-anglesey.tim-daw.workers.dev/__bulk_upload'
# UPLOAD_SECRET: temporary Worker secret set in the shell for the initial upload only; never committed.
SEC=os.environ['UPLOAD_SECRET']; DONE=f'{ROOT}/upload_done.txt'; CONC=int(os.environ.get('CONC',8))
TYPES={'webp':'image/webp','json':'application/json','geojson':'application/geo+json','js':'text/javascript','html':'text/html; charset=utf-8','css':'text/css','png':'image/png','txt':'text/plain'}
IMM='public, max-age=31536000, immutable'
done=set(l.split()[0] for l in open(DONE)) if os.path.exists(DONE) else set()
def walk(d,prefix):
    for dp,_,fs in os.walk(d):
        for f in sorted(fs): p=os.path.join(dp,f); yield prefix+os.path.relpath(p,d), p
items=[]
for k,p in walk(f'{ROOT}/dist',''):
    if k!='index.html': items.append((0,k,p,IMM if k.startswith('assets/') else 'no-cache'))
for k,p in walk(f'{ROOT}/site/layers','layers/'): items.append((0,k,p,'no-cache' if k.endswith('index.json') else IMM))
boxes=[(-4.22,53.19,-4.19,53.22),(-4.51,53.20,-4.48,53.22),(-4.66,53.29,-4.60,53.33)]  # Bryn Celli Ddu, Barclodiad y Gawres, Caergybi
def pri(z,x,y):
    b=mercantile.bounds(x,y,z)
    return 1 if any(b.east>w and b.west<e and b.north>s and b.south<n for w,s,e,n in boxes) else 2
for k,p in walk(f'{ROOT}/tiles','terrain/'):
    z,x,y=k.split('/')[1:]; items.append((pri(int(z),int(x),int(y[:-5])),k,p,IMM))
items=[i for i in items if i[1] not in done]; items.sort(key=lambda i:(i[0],i[1]))
# stage files always re-sent (small) even if done earlier
print('to send',len(items),flush=True)
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
    hj=json.dumps(hdr).encode(); payload=struct.pack('>I',len(hj))+hj+b''.join(bodies)
    for a in range(8):
        try:
            r=requests.post(U,data=payload,headers={'X-Upload-Secret':SEC},timeout=180)
            if r.status_code==200: return hdr
            with lock: st['retry']+=1
            last=f'{r.status_code} {r.text[:200]}'
        except requests.RequestException as e: last=repr(e)
        time.sleep(min(60,2**a))
    raise RuntimeError(last)
def status(final=False):
    el=time.time()-t0; r=st['ok']/max(el,1)
    open(f'{ROOT}/UPLOAD.md','w').write(f"""# R2 upload status
Updated {time.strftime('%Y-%m-%d %H:%M:%S %Z')}{' (FINISHED)' if final else ''}. Bucket lidar-lens-anglesey (private). Route: batches of <=200 objects POSTed to the lidar-lens-ure Worker's temporary bulk-upload endpoint (R2 binding put with MD5 check), {CONC} parallel.
Order: viewer + layers, then Bryn Celli Ddu, Barclodiad y Gawres, Caergybi tiles, then the rest.
- Earlier (REST API, before switch): {len(done):,} objects done.
- This run: {st['ok']:,} / {tot:,} objects ({st['bytes']/1e9:.2f} GB), failed {st['fail']}, batch retries {st['retry']}
- Rate {r:.0f} obj/s; ETA {(tot-st['ok'])/max(r,0.01)/60:.0f} min
""")
with ThreadPoolExecutor(CONC) as ex:
    fs=[ex.submit(send,b) for b in batches]
    for i,f in enumerate(as_completed(fs)):
        try:
            h=f.result()
            with lock:
                for it in h: out.write(f"{it['k']} {it['md5']}\n")
                out.flush(); st['ok']+=len(h); st['bytes']+=sum(it['n'] for it in h)
        except Exception as e: st['fail']+=1; print('FAIL batch',e,flush=True)
        if i%10==0: status(); print(time.strftime('%H:%M:%S'),st,flush=True)
if st['fail']==0: send([(0,'index.html',f'{ROOT}/dist/index.html','no-cache')]); print('index.html sent last',flush=True)
status(True); print('finished',st,time.time()-t0,flush=True)
