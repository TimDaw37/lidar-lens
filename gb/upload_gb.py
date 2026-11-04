"""Upload the GB production site under gb/ in the lidar-lens-scotland bucket via the existing bulk upload route (index.html last)."""
src=open('/workspace/lidar-scotland/scripts/upload_site.py').read().split("D='/workspace")[0]
exec(src)
P='gb/'
D='/workspace/lidar-scotland/gb-prod/dist'
L=[(P+k,p,'public, max-age=31536000, immutable' if k.startswith('assets/') else 'no-cache') for k,p in items(D,'',('index.html','_headers'))]
L+=[(P+'live/'+k,p,'no-cache' if k=='index.json' else 'public, max-age=86400') for k,p in items('/workspace/lidar-scotland/live/data','')]
for i in range(0,len(L),150): send(L[i:i+150])
send([(P+'index.html',f'{D}/index.html','no-cache')]); print('gb production site uploaded',len(L)+1)
