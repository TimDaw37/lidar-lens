import json,sys,time,base64,subprocess,urllib.request,websocket,os
w,h,out,url=int(sys.argv[1]),int(sys.argv[2]),sys.argv[3],sys.argv[4]
p=subprocess.Popen(['google-chrome','--headless=new','--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--remote-debugging-port=9333','--user-data-dir=/tmp/cdp-angl',f'--window-size={w},{h}','about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(3)
t=[x for x in json.load(urllib.request.urlopen('http://127.0.0.1:9333/json')) if x['type']=='page'][0]
ws=websocket.create_connection(t['webSocketDebuggerUrl'],suppress_origin=True,timeout=60);i=[0]
def send(m,pp=None):
    i[0]+=1; ws.send(json.dumps({'id':i[0],'method':m,'params':pp or {}}))
    while True:
        r=json.loads(ws.recv())
        if r.get('id')==i[0]: return r
send('Emulation.setDeviceMetricsOverride',{'width':w,'height':h,'deviceScaleFactor':1,'mobile':w<700})
send('Page.navigate',{'url':url}); time.sleep(25)
r=send('Page.captureScreenshot',{'format':'png'}); open(out,'wb').write(base64.b64decode(r['result']['data'])); print('ok',out)
p.kill()
