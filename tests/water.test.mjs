// Water level on the 2D map (trial, 10 Nov 2026): full screen only; cells below the level are shaded blue, the readout gives m OD and
// the share of the view under water, the level is in share links, and it works on a phone-sized screen and on the CPU fallback.
// Also: the 3D view starts its water sheet at the map's level. Usage (from tests/): node water.test.mjs <site URL>
import {chromium} from 'playwright';
const BASE=(process.argv[2]||'').replace(/\/?$/,'/');if(!/^https?:/.test(BASE)){console.error('give the site URL');process.exit(2)}
let pass=0,fail=0;const ok=(n,c,i='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(i?' '+i:''))};
const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const AVON='#c=51.18154%2C-1.78821%2C16&l=51.18154%2C-1.78821&mode=1&fs=1';   // River Avon by Durrington, SU 1490 4250
async function open(p,url){await p.goto('about:blank');await p.goto(url,{waitUntil:'load'});
  await p.waitForFunction(()=>window.__lens&&document.getElementById('loading').hidden&&window.__lens.stretch(),null,{timeout:90000}).catch(()=>{});await p.waitForTimeout(3000)}
async function blue(p){const png=await p.screenshot();return p.evaluate(async s=>{const i=new Image();await new Promise(r=>{i.onload=r;i.src='data:image/png;base64,'+s});const c=document.createElement('canvas');c.width=i.width;c.height=i.height;
  const x=c.getContext('2d');x.drawImage(i,0,0);const W=i.width,H=i.height,d=x.getImageData(Math.round(W*0.3),Math.round(H*0.15),Math.round(W*0.4),Math.round(H*0.7)).data;let n=0,t=0;for(let k=0;k<d.length;k+=4){t++;if(d[k+2]>d[k]+40)n++}return 100*n/t},png.toString('base64'))}
const read=p=>p.evaluate(()=>({wl:window.__lens.S.wl,wat:window.__lens.S.wat,box:!document.getElementById('waterbox').hidden,v:document.getElementById('wlv').textContent,r:document.getElementById('wlread').textContent,min:+document.getElementById('wl').min,max:+document.getElementById('wl').max}));
const setWl=(p,v)=>p.evaluate(v=>{const e=document.getElementById('wl');e.value=String(v);e.dispatchEvent(new Event('input'))},v);
const pct=r=>{const m=(r.r||'').match(/^(under 1|\d+)%/);return m?(m[1]==='under 1'?0.5:+m[1]):NaN};
for(const [tag,opts,q] of [['desktop',{viewport:{width:1200,height:850}},''],['phone',{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2},''],['CPU',{viewport:{width:1200,height:850}},'?cpu=1']]){
  const ctx=await b.newContext(opts);const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(BASE+q,{waitUntil:'load'});await p.waitForTimeout(2500);await open(p,BASE+q+AVON);
  const r0=await read(p);ok(tag+': water control shown in full screen',r0.box);const b0=await blue(p);
  await p.evaluate(()=>{const e=document.getElementById('wat');e.checked=true;e.dispatchEvent(new Event('change'))});await p.waitForTimeout(2500);
  const r1=await read(p);ok(tag+': level starts inside the heights in view, readout in m OD',r1.wl>=r1.min&&r1.wl<=r1.max&&/m OD/.test(r1.v)&&/% of the view under water/.test(r1.r),JSON.stringify(r1));
  const lvA=+(r1.min+0.15*(r1.max-r1.min)).toFixed(1),lvB=+(r1.min+0.45*(r1.max-r1.min)).toFixed(1);
  await setWl(p,lvA);await p.waitForTimeout(1500);const rA=await read(p),bA=await blue(p);
  const t0=Date.now();await setWl(p,lvB);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const ms=Date.now()-t0;await p.waitForTimeout(1500);const rB=await read(p),bB=await blue(p);
  ok(tag+': higher level puts more of the view under water',pct(rB)>pct(rA)&&bB>bA,`${lvA} m OD: ${pct(rA)}% (blue ${bA.toFixed(1)}%) -> ${lvB} m OD: ${pct(rB)}% (blue ${bB.toFixed(1)}%)`);
  ok(tag+': blue appears only with water on',b0<0.5&&bB>1,'blue off '+b0.toFixed(2)+'%');
  console.log(`TIME ${tag} water slider redraw (software GL): ${ms} ms`);ok(tag+': slider move does not freeze',ms<1500,ms+' ms');
  await p.click('#share').catch(()=>{});await p.waitForTimeout(1200);const h=await p.evaluate(()=>location.hash);ok(tag+': share link carries the level',/wat=1/.test(h)&&new RegExp('wl='+lvB.toFixed(1)).test(h),h.slice(0,200));
  await open(p,BASE+q+h);const rC=await read(p),bC=await blue(p);ok(tag+': share link round trip',rC.wat&&Math.abs(rC.wl-lvB)<0.05&&bC>1,JSON.stringify({wl:rC.wl,blue:+bC.toFixed(1)}));
  if(tag==='desktop'){await p.click('#view3d');await p.waitForFunction(()=>{const w=document.getElementById('v3dwait');return w&&w.hidden&&window.__view3d.model()},null,{timeout:60000});await p.waitForTimeout(1200);
    const w3=await p.evaluate(()=>({on:document.getElementById('v3dwat').checked,t:document.getElementById('v3dwatv').textContent,vis:window.__view3d._v().water.visible}));
    const lv3=parseFloat(w3.t);ok('3D: water sheet starts at the map level',w3.on&&w3.vis&&Math.abs(lv3-lvB)<0.3,JSON.stringify(w3));await p.click('#v3dx');await p.waitForTimeout(500)}
  await p.evaluate(()=>{const e=document.getElementById('fs');e.checked=false;e.dispatchEvent(new Event('change'))});await p.waitForTimeout(2500);
  const rD=await read(p);ok(tag+': out of full screen the control hides and the lens shows no water',!rD.box&&(await blue(p))<0.5);
  ok(tag+': no JS errors',!errs.length,errs[0]||'');await ctx.close()}
await b.close();console.log(pass+' passed, '+fail+' failed');process.exit(fail?1:0);
