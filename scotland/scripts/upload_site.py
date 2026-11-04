"""Upload viewer (dist, config scotland), HES record chunks, OSTN grid, outline to the Scotland bucket; index.html LAST."""
import os,sys
sys.argv=['x']; exec(open('/workspace/lidar-scotland/scripts/build_scot.py').read().split("if __name__=='__main__':")[0])
import hashlib,struct,json
T={'webp':'image/webp','json':'application/json','geojson':'application/geo+json','js':'text/javascript','html':'text/html; charset=utf-8','css':'text/css','png':'image/png','svg':'image/svg+xml','ico':'image/x-icon','webmanifest':'application/manifest+json','txt':'text/plain'}
def items(d,pre,skip=()):
    for dp,_,fs in os.walk(d):
        for f in fs:
            p=os.path.join(dp,f);k=pre+os.path.relpath(p,d)
            if k not in skip: yield k,p
def send(lst):
    sec=open(SECF).read().strip();hdr=[];bodies=[]
    for k,p,cc in lst:
        b=open(p,'rb').read();bodies.append(b);hdr.append(dict(k=k,n=len(b),ct=T.get(k.rsplit('.',1)[-1],'application/octet-stream'),cc=cc,md5=hashlib.md5(b).hexdigest()))
    hj=json.dumps(hdr).encode();r=requests.post(UPLOAD,data=struct.pack('>I',len(hj))+hj+b''.join(bodies),headers={'X-Upload-Secret':sec},timeout=180);r.raise_for_status()
D='/workspace/lidar-orkney/viewer/dist';S='/workspace/lidar-scotland/site'
L=[(k,p,'public, max-age=31536000, immutable' if k.startswith('assets/') else 'no-cache') for k,p in items(D,'',('index.html','nhle_places.json','_headers'))]
L+=[(k,p,'no-cache' if k.endswith(('index.json','outline.geojson')) else 'public, max-age=86400') for k,p in items(S,'')]
for i in range(0,len(L),150): send(L[i:i+150])
send([('index.html',f'{D}/index.html','no-cache')]); print('site uploaded',len(L)+1,'index.html last',flush=True)
