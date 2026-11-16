"""Phase B step 1: download every tile of the 1 m-or-finer bare-earth GSI layers (not NYU Dublin: DSM only). Resumable."""
import json,os,requests,time,concurrent.futures as cf
L=['WH_CoCo','GSI_Phase2','GSI_DCHG_DP','OPW_Cork']
H=[h for h in json.load(open('../s2/heads.json')) if h[0] in L and h[3]==200]
print(len(H),'files',sum(h[4] for h in H)/1e9,'GB',time.strftime('%H:%M:%S'),flush=True)
S=requests.Session();S.headers['User-Agent']='lidar-lens (Tim Daw)'
def get(h):
    lay,u,name,_,size,_=h;d=f'dl/{lay}';os.makedirs(d,exist_ok=True);f=f'{d}/{os.path.basename(u)}'
    if os.path.exists(f) and os.path.getsize(f)==size: return 0
    for a in range(6):
        try:
            with S.get(u,stream=True,timeout=300) as r:
                r.raise_for_status()
                with open(f+'.part','wb') as o:
                    for c in r.iter_content(1<<20): o.write(c)
            if os.path.getsize(f+'.part')==size: os.replace(f+'.part',f); return size
        except Exception as e: print('retry',u,e,flush=True); time.sleep(10*(a+1))
    print('FAILED',u,flush=True); return 0
t=time.time();n=0
with cf.ThreadPoolExecutor(6) as ex:
    for i,b in enumerate(ex.map(get,H)):
        n+=b
        if i%50==0: print(i,'%.2f GB'%(n/1e9),'%.0fs'%(time.time()-t),flush=True)
print('DL_DONE','%.2f GB'%(n/1e9),'%.0fs'%(time.time()-t),time.strftime('%H:%M:%S'),flush=True)
