import {chromium,firefox} from 'playwright';
const BASE=process.argv[2];let pass=0,fail=0;const ok=(n,c,i='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+' '+i)};
const NOGL2=`(()=>{const g=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){if(t==='webgl2')return null;return g.call(this,t,...a)}})()`;
const NOGL=`(()=>{const g=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){if(/webgl|2d/.test(t))return null;return g.call(this,t,...a)}})()`;
const OLD=`delete window.fetch;window.fetch=undefined`;
for(const [bn,bt] of [['chromium',chromium],['firefox',firefox]]){
  const b=await bt.launch(bn==='chromium'?{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{});
  for(const [cn,init,vp] of [['desktop',null,{width:1280,height:800}],['mobile',null,{width:390,height:844}],['noWebGL2',NOGL2,{width:1280,height:800}],['noCanvas',NOGL,{width:1280,height:800}],['oldBrowser',OLD,{width:1280,height:800}]]){
    const ctx=await b.newContext({viewport:vp,hasTouch:cn==='mobile',isMobile:cn==='mobile'&&bn==='chromium'});if(init)await ctx.addInitScript(init);
    const p=await ctx.newPage();const errs=[],csp=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(/Content.Security|Refused/i.test(m.text()))csp.push(m.text())});
    await p.goto(BASE,{waitUntil:'load'});await p.waitForTimeout(4000);
    const st=await p.evaluate(()=>({r:window.__lens&&__lens.renderer(),msg:document.getElementById('msg').style.display!=='none'?document.getElementById('msg').textContent:'',compat:(document.querySelector('.compat')||{}).textContent||'',webp:window.__lensCompat&&__lensCompat.webp}));
    const t=bn+' '+cn+': ';
    if(cn==='oldBrowser'){ok(t+'explains too-old browser',/too old/.test(st.compat),st.compat.slice(0,60));await ctx.close();continue}
    ok(t+'no CSP violations',!csp.length,csp[0]||'');
    if(cn==='noCanvas'){ok(t+'graceful no-render message',st.r==='none'&&/cannot draw the LiDAR/.test(st.msg),st.r);ok(t+'map still usable',await p.evaluate(()=>document.querySelectorAll('.leaflet-tile-loaded').length>0));ok(t+'no JS errors',!errs.length,errs[0]||'');await ctx.close();continue}
    ok(t+'renderer',cn==='noWebGL2'?/Canvas2D/.test(st.r):!!st.r,st.r);ok(t+'webp ok',st.webp===true);
    const px=await p.evaluate(()=>{const c=document.querySelector('canvas#cv')||document.querySelector('canvas');return c?c.width:0});ok(t+'lens canvas',px>0);
    await p.evaluate(()=>document.getElementById('whatis').click());const box=await p.locator('#map').boundingBox();await p.mouse.click(box.x+box.width*0.5,box.y+box.height*0.5);
    await p.waitForSelector('#card .desc',{timeout:20000}).catch(()=>{});const card=await p.evaluate(()=>({n:(document.querySelector('#card .hd b')||{}).textContent,d:(document.querySelector('#card .desc')||{}).textContent,g:!!document.querySelector('#card details.heur')}));
    ok(t+'What's here? card',card.n==='What's here?'&&!!card.d&&!card.g,JSON.stringify(card).slice(0,140));
    ok(t+'no JS errors',!errs.length,errs[0]||'');await ctx.close()}
  await b.close()}
console.log(pass+'/'+(pass+fail));
