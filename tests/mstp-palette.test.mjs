// MSTP (mode 14) colour choice (10 Nov 2026): the three-size colour composite is the default; any other colour ramp shows one
// value (the strongest of the three sizes, or one size) on that ramp, with an honest legend; checked on WebGL and the CPU fallback.
// Usage (from tests/): node mstp-palette.test.mjs <site URL>
import {chromium} from 'playwright';
const BASE=(process.argv[2]||'').replace(/\/?$/,'/');if(!/^https?:/.test(BASE)){console.error('give the site URL');process.exit(2)}
let pass=0,fail=0;const ok=(n,c,i='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(i?' '+i:''))};
const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const SIL='#c=51.41543%2C-1.85759%2C16&l=51.41543%2C-1.85759&mode=14';
async function open(p,url){await p.goto('about:blank');await p.goto(url,{waitUntil:'load'});
  await p.waitForFunction(()=>window.__lens&&document.getElementById('loading').hidden&&window.__lens.stretch(),null,{timeout:90000}).catch(()=>{});await p.waitForTimeout(3000)}
async function shot(p){const r=await p.evaluate(()=>{const l=document.getElementById('lens').getBoundingClientRect();return {x:l.x,y:l.y,w:l.width,h:l.height}});
  const png=await p.screenshot({clip:{x:r.x+r.w*0.2,y:r.y+r.h*0.2,width:r.w*0.6,height:r.h*0.6}});
  return p.evaluate(async s=>{const i=new Image();await new Promise(r=>{i.onload=r;i.src='data:image/png;base64,'+s});const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);
    const d=x.getImageData(0,0,c.width,c.height).data;let sat=0,n=0;const sig=[];for(let k=0;k<d.length;k+=4){sat+=Math.max(d[k],d[k+1],d[k+2])-Math.min(d[k],d[k+1],d[k+2]);n++;if(k%400===0)sig.push(d[k],d[k+1],d[k+2])}return {sat:sat/n,sig}},png.toString('base64'))}
const diff=(a,b)=>{let s=0;for(let i=0;i<a.sig.length;i++)s+=Math.abs(a.sig[i]-b.sig[i]);return s/a.sig.length};
for(const cpu of [false,true]){const tag=cpu?' (CPU)':'';
  const ctx=await b.newContext({viewport:{width:1200,height:850}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(BASE+(cpu?'?cpu=1':''),{waitUntil:'load'});await p.waitForTimeout(2500);
  await open(p,BASE+(cpu?'?cpu=1':'')+SIL);
  const d0=await p.evaluate(()=>({ramp:window.__lens.S.ramp,mts:document.getElementById('mts').disabled,opt:!document.querySelector('#ramp option[value="scales"]').hidden,lg:document.getElementById('modelegend').textContent}));
  ok('default is the three-size colour composite'+tag,d0.ramp==='scales'&&d0.mts&&d0.opt&&/^Red: stands out at the broad/.test(d0.lg),JSON.stringify(d0).slice(0,140));
  const rgb=await shot(p);ok('composite is in colour'+tag,rgb.sat>25,'mean saturation '+rgb.sat.toFixed(1));
  await p.selectOption('#ramp','grey');await p.waitForTimeout(2500);const g=await shot(p);
  const d1=await p.evaluate(()=>({mts:document.getElementById('mts').disabled,lg:document.getElementById('modelegend').textContent}));
  ok('grey ramp: one value, no colour'+tag,g.sat<3,'mean saturation '+g.sat.toFixed(1));ok('grey ramp: size choice enabled, legend says what it shows'+tag,!d1.mts&&/strongest of the three sizes/.test(d1.lg)&&/raised or sunken/.test(d1.lg),d1.lg.slice(0,90));
  await p.selectOption('#ramp','viridis');await p.waitForTimeout(2500);const v=await shot(p);ok('viridis ramp differs from grey'+tag,diff(v,g)>15,diff(v,g).toFixed(1));
  await p.selectOption('#mts','3');await p.waitForTimeout(2500);const vb=await shot(p);const lg3=await p.evaluate(()=>document.getElementById('modelegend').textContent);
  ok('broad size alone differs from strongest'+tag,diff(vb,v)>5,diff(vb,v).toFixed(1));ok('legend names the broad size'+tag,/the broad size \(50–500 m\)/.test(lg3));
  await p.click('#share').catch(()=>{});await p.waitForTimeout(1200);const h=await p.evaluate(()=>location.hash);
  ok('share link carries ramp and size'+tag,/ramp=viridis/.test(h)&&/mts=3/.test(h),h.slice(0,160));
  await open(p,BASE+(cpu?'?cpu=1':'')+h);const r=await p.evaluate(()=>({ramp:window.__lens.S.ramp,mts:window.__lens.S.mts}));ok('share link round trip'+tag,r.ramp==='viridis'&&r.mts===3,JSON.stringify(r));
  await p.selectOption('#mode','3');await p.waitForTimeout(1500);const o=await p.evaluate(()=>!!document.querySelector('#ramp option[value="scales"]').hidden);ok('three-size option hidden for other modes'+tag,o);
  ok('no JS errors'+tag,!errs.length,errs[0]||'');await ctx.close()}
await b.close();console.log(pass+' passed, '+fail+' failed');process.exit(fail?1:0);
