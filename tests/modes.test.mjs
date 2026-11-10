// Checks for each new visualisation mode, as the spec asks: renders at Stonehenge, Pentre Ifan and Clava with no JS errors, differs
// clearly from plain hillshade at the same view, survives a share link round trip, the CPU fallback draws it or shows a message,
// and redraw timing at the default lens size (desktop and phone-sized). Usage (from tests/):
//   npm i && npx playwright install chromium && node modes.test.mjs <site URL> [modes, default 11]
// Timings in headless Chromium use software GL (SwiftShader), so they are much slower than a desktop GPU; they are printed, and
// only the "no freeze" limit (5 s per redraw) fails the run.
import {chromium} from 'playwright';
const BASE=(process.argv[2]||'').replace(/\/?$/,'/');if(!/^https?:/.test(BASE)){console.error('give the site URL');process.exit(2)}
const MODES=(process.argv[3]||'11').split(',').map(Number);
const SITES=[['Stonehenge',51.17886,-1.82622,17],['Pentre Ifan',51.99886,-4.77004,17],['Clava',57.47356,-4.07434,17]];
let pass=0,fail=0;const ok=(n,c,i='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(i?' '+i:''))};
const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
async function page(opts={}){const ctx=await b.newContext(Object.assign({viewport:{width:1200,height:850}},opts));const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(BASE,{waitUntil:'load'});await p.waitForTimeout(2500);if(await p.evaluate(()=>!!(navigator.serviceWorker&&!navigator.serviceWorker.controller)))await p.reload({waitUntil:'load'});await p.waitForTimeout(1500);return {p,ctx,errs}}
async function open(p,url){await p.goto('about:blank');await p.goto(url,{waitUntil:'load'});
  await p.waitForFunction(()=>window.__lens&&document.getElementById('loading').hidden&&window.__lens.stretch(),null,{timeout:90000}).catch(()=>{});await p.waitForTimeout(2500)}
// mean absolute RGB difference inside the lens circle between two screenshots, and the grey-level spread of the second
async function lensShot(p){const r=await p.evaluate(()=>{const l=document.getElementById('lens').getBoundingClientRect();return {x:l.x,y:l.y,w:l.width,h:l.height}});return p.screenshot({clip:{x:r.x+r.w*0.15,y:r.y+r.h*0.15,width:r.w*0.7,height:r.h*0.7}})}
async function cmp(p,a,c){return p.evaluate(async([A,C])=>{const ld=s=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src='data:image/png;base64,'+s});const [ia,ic]=await Promise.all([ld(A),ld(C)]);
  const cv=document.createElement('canvas');cv.width=ia.width;cv.height=ia.height;const x=cv.getContext('2d');const g=i=>{x.clearRect(0,0,cv.width,cv.height);x.drawImage(i,0,0);return x.getImageData(0,0,cv.width,cv.height).data};
  const da=g(ia),dc=g(ic);let s=0,n=0,m=0,q=0;for(let k=0;k<da.length;k+=4){s+=Math.abs(da[k]-dc[k])+Math.abs(da[k+1]-dc[k+1])+Math.abs(da[k+2]-dc[k+2]);const v=(dc[k]+dc[k+1]+dc[k+2])/3;m+=v;q+=v*v;n++}
  m/=n;return {diff:s/n/3,spread:Math.sqrt(q/n-m*m)}},[a.toString('base64'),c.toString('base64')])}
async function redrawMs(p,k=3){return p.evaluate(async k=>{const t=[],L=window.__lens;for(let i=0;i<k;i++){L.S.ve=L.S.ve===2?2.0001:2;const t0=performance.now();L.requestRender();
  await new Promise(r=>requestAnimationFrame(()=>r()));t.push(performance.now()-t0);await new Promise(r=>setTimeout(r,50))}L.S.ve=2;return Math.round(t.sort((a,b)=>a-b)[t.length>>1])},k)}
for(const m of MODES){
  const {p,ctx,errs}=await page();
  for(const [name,la,lo,z] of SITES){
    await open(p,`${BASE}#c=${la}%2C${lo}%2C${z}&l=${la}%2C${lo}&mode=0`);const hs=await lensShot(p);
    await p.selectOption('#mode',String(m));await p.waitForTimeout(3500);const md=await lensShot(p);
    const st=await p.evaluate(()=>window.__lens.stretch());const c=await cmp(p,hs,md);
    ok(`mode ${m} renders at ${name}`,!!st&&c.spread>4,'range '+(st||[]).map(v=>v.toFixed(2)).join('…')+' grey spread '+c.spread.toFixed(1));
    ok(`mode ${m} differs from hillshade at ${name}`,c.diff>8,'mean |Δ| '+c.diff.toFixed(1)+' of 255');
    if(name==='Stonehenge')console.log(`TIME mode ${m} desktop redraw (software GL, lens ${await p.evaluate(()=>window.__lens.S.ls)} px): ${await redrawMs(p)} ms; hillshade for comparison: ${await (async()=>{await p.selectOption('#mode','0');await p.waitForTimeout(800);const t=await redrawMs(p);await p.selectOption('#mode',String(m));await p.waitForTimeout(1500);return t})()} ms`);
  }
  // share link round trip with non-default settings
  // non-default settings for this mode (sliders by id, plus a ramp), then a share link round trip
  const TW={11:{ramp:'redrel',set:{rad:15}},12:{set:{ld0:6,ld1:25,ldh:2.5}},13:{ramp:'rdbu',set:{mf1:40,mx:1}},14:{set:{mtl:1.4}}}[m]||{set:{}};
  if(TW.ramp)await p.selectOption('#ramp',TW.ramp);
  await p.evaluate(set=>{for(const [k,v] of Object.entries(set)){const r=document.getElementById(k);r.value=String(v);r.dispatchEvent(new Event('input'))}},TW.set);await p.waitForTimeout(1500);
  const keys=['mode','ramp','ct','gm'].concat(Object.keys(TW.set));
  const want=await p.evaluate(keys=>{const s=window.__lens.S;return Object.fromEntries(keys.map(k=>[k,s[k]]))},keys);
  await p.evaluate(()=>window.__lens.saveHashSoon());await p.waitForTimeout(600);const url=p.url();
  await open(p,url);const got=await p.evaluate(keys=>{const s=window.__lens.S;return Object.fromEntries(keys.map(k=>[k,s[k]]))},keys);
  ok(`mode ${m} share link round trip`,JSON.stringify(want)===JSON.stringify(got),JSON.stringify(got));
  ok(`mode ${m} no JS errors (desktop)`,!errs.length,errs[0]||'');await ctx.close();
  // phone-sized
  {const {p,ctx,errs}=await page({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});const [n,la,lo,z]=SITES[0];
    await open(p,`${BASE}#c=${la}%2C${lo}%2C${z}&l=${la}%2C${lo}&mode=${m}`);const t=await redrawMs(p);
    console.log(`TIME mode ${m} phone-sized redraw (software GL, phone settings): ${t} ms`);ok(`mode ${m} phone redraw does not freeze`,t<5000,t+' ms');ok(`mode ${m} no JS errors (phone)`,!errs.length,errs[0]||'');await ctx.close()}
  // CPU fallback
  {const {p,ctx,errs}=await page();const [n,la,lo,z]=SITES[0];await open(p,`${BASE}?cpu=1#c=${la}%2C${lo}%2C${z}&l=${la}%2C${lo}&mode=0`);const hs=await lensShot(p);
    await p.selectOption('#mode',String(m));await p.waitForTimeout(6000);const md=await lensShot(p);const c=await cmp(p,hs,md);
    const info=await p.evaluate(()=>({kind:window.__lens.renderer(),msg:document.getElementById('msg').textContent}));
    ok(`mode ${m} CPU fallback draws it`,/Canvas/.test(info.kind)&&c.diff>8&&c.spread>4,info.kind+'; mean |Δ| from hillshade '+c.diff.toFixed(1));
    console.log(`TIME mode ${m} CPU fallback redraw: ${await redrawMs(p,1)} ms`);ok(`mode ${m} no JS errors (CPU)`,!errs.length,errs[0]||'');await ctx.close()}
}
await b.close();console.log(`${pass} passed, ${fail} failed`);process.exit(fail?1:0);
