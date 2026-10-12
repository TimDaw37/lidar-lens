"""Upload a built site (viewer + terrain tiles + layers) to a Cloudflare R2 bucket via the Cloudflare REST API.
usage: CF_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... R2_BUCKET=... python upload_r2.py SITE_DIR [--only PREFIX]
Resumable (keys done are appended to SITE_DIR/.uploaded). For >100k tiles, rclone or the S3 API is faster:
  rclone copy SITE_DIR r2:BUCKET --transfers 32 --s3-no-check-bucket"""
import os, sys, mimetypes, concurrent.futures as cf, requests
A=os.environ['CF_ACCOUNT_ID']; B=os.environ['R2_BUCKET']; TOK=os.environ['CLOUDFLARE_API_TOKEN']
root=sys.argv[1].rstrip('/'); only=sys.argv[sys.argv.index('--only')+1] if '--only' in sys.argv else ''
T={'.webp':'image/webp','.json':'application/json','.geojson':'application/geo+json','.js':'text/javascript','.html':'text/html; charset=utf-8','.css':'text/css','.png':'image/png'}
done_f=os.path.join(root,'.uploaded'); done=set(open(done_f).read().split()) if os.path.exists(done_f) else set()
keys=[os.path.relpath(os.path.join(d,f),root).replace(os.sep,'/') for d,_,fs in os.walk(root) for f in fs if not f.startswith('.')]
keys=[k for k in keys if k.startswith(only) and k not in done]; print(len(keys),'to upload',flush=True)
S=requests.Session()
def put(k):
    ct=T.get(os.path.splitext(k)[1].lower()) or mimetypes.guess_type(k)[0] or 'application/octet-stream'
    for a in range(5):
        r=S.put(f'https://api.cloudflare.com/client/v4/accounts/{A}/r2/buckets/{B}/objects/{k}',data=open(os.path.join(root,k),'rb').read(),headers={'Authorization':'Bearer '+TOK,'Content-Type':ct},timeout=120)
        if r.ok: return k
    raise RuntimeError(k+' '+r.text[:200])
with open(done_f,'a') as out, cf.ThreadPoolExecutor(int(os.environ.get('CONC',16))) as ex:
    for i,k in enumerate(ex.map(put,keys)):
        out.write(k+'\n')
        if i%500==0: print(i,flush=True)
print('done')
