// Phone layout must not depend on the viewport at load time (fix 11 Nov 2026): a page that starts wide (prerender, restored tab,
// background tab, rotation, fold) and then becomes a phone must end up exactly like a phone that loaded normally, and vice versa.
// Usage (from tests/): node layout-flip.test.mjs <site URL> [dist folder]
import {openSite} from './open.mjs';
const BASE=(process.argv[2]||'').replace(/\/?$/,'/');if(!/^https?:/.test(BASE)){console.error('give the site URL');process.exit(2)}
let pass=0,fail=0;const ok=(n,c,i='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(i?' '+i:''))};
const SH='#c=51.1789%2C-1.8262%2C16&ui=research';
const state=p=>p.evaluate(()=>({hid:document.getElementById('panel').classList.contains('hide'),open:[...document.querySelectorAll('#panel details.sec')].filter(d=>d.open).map(d=>d.querySelector('summary').textContent.trim()).join('|'),lens:window.__lens.lensState().c.map(Math.round)}));
async function at(first,then){const {b,p,errs}=await openSite(BASE,process.argv[3],first,{isMobile:true,hasTouch:true,deviceScaleFactor:2});
  await p.goto(BASE+SH,{waitUntil:'domcontentloaded'});
  if(then){await p.waitForTimeout(400);await p.setViewportSize(then)}
  await p.waitForFunction(()=>window.__lens&&document.getElementById('loading').hidden,null,{timeout:60000}).catch(()=>{});await p.waitForTimeout(3000);
  const s=await state(p);await b.close();return {s,errs}}
const P={width:390,height:844},Lw={width:844,height:390};
const ref=(await at(P)).s,refL=(await at(Lw)).s;
console.log('portrait load',JSON.stringify(ref),'landscape load',JSON.stringify(refL));
ok('portrait phone: panel hidden, only Visualisation open',ref.hid&&ref.open==='Visualisation');
ok('landscape phone: panel hidden, only Tools open',refL.hid&&refL.open==='Tools');
const same=(a,b)=>a.hid===b.hid&&a.open===b.open&&Math.abs(a.lens[0]-b.lens[0])<=2&&Math.abs(a.lens[1]-b.lens[1])<=2;
for(const [n,f,t,r] of [['loaded 980 wide, then a 390 phone',{width:980,height:1800},P,ref],['loaded landscape, then rotated to portrait',Lw,P,ref],['loaded portrait, then rotated to landscape',P,Lw,refL]]){
  const {s,errs}=await at(f,t);ok(n+': same layout as a normal load',same(s,r),JSON.stringify(s));ok(n+': no JS errors',errs.length===0,errs.join(' | ').slice(0,200))}
// desktop to desktop resize changes nothing
{const {b,p}=await openSite(BASE,process.argv[3],{width:1300,height:900});await p.goto(BASE+SH);await p.waitForFunction(()=>window.__lens&&document.getElementById('loading').hidden,null,{timeout:60000}).catch(()=>{});await p.waitForTimeout(2000);
  const a=await state(p);await p.setViewportSize({width:1100,height:850});await p.waitForTimeout(1200);const c=await state(p);
  ok('desktop resize (both wide) leaves the panel and sections alone',!a.hid&&!c.hid&&a.open===c.open,JSON.stringify([a.open,c.open]));await b.close()}
console.log(pass+' passed, '+fail+' failed');process.exit(fail?1:0);
