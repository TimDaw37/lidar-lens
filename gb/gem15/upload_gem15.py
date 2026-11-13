"""Upload the GEM-15 fallback tiles to the lidar-lens-scotland bucket under gb-live-test/gem15/ (or GEM_PREFIX, e.g. gb/gem15/ for production;
SITE_PREFIX gb-live-test/) through the existing bulk upload route (scripts/upload_site.py send()); index.json last. Resumable."""
import os,sys,json
ARGS=list(sys.argv)
os.environ.setdefault('UPLOAD_URL','https://lidar-lens-scotland.tim-daw.workers.dev/__bulk_upload')
os.environ.setdefault('UPLOAD_SECRET_FILE','/workspace/lidar-scotland/deploy/.upload_secret')
src=open('/workspace/lidar-scotland/scripts/upload_site.py').read().split("D='/workspace")[0]
os.chdir('/workspace/lidar-scotland'); exec(src)
D='/workspace/lidar-cvat/gem15-fallback-20261113/tiles/gem15'; P=os.environ.get('GEM_PREFIX','gb-live-test/gem15/')
DONE=os.environ.get('GEM_DONE','/workspace/lidar-cvat/gem15-fallback-20261113/build/uploaded.txt')
done=set(open(DONE).read().split()) if os.path.exists(DONE) else set()
L=sorted((P+k,p,'public, max-age=2592000') for k,p in items(D,'',('index.json',)) if P+k not in done)
print('to upload',len(L),flush=True)
for i in range(0,len(L),150):
    b=L[i:i+150]
    for t in range(4):
        try: send(b); break
        except Exception as e:
            print('retry',i,e,flush=True)
            if t==3: raise
    with open(DONE,'a') as f: f.write('\n'.join(k for k,_,_ in b)+'\n')
    if (i//150)%10==0: print(i+len(b),'/',len(L),flush=True)
if len(ARGS)>1 and ARGS[1]=='index':
    send([(P+'index.json',D+'/index.json','no-cache')]); print('index.json uploaded')
