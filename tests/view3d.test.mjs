// 3D view checks in Chromium. Usage (from tests/): npm i && npx playwright install chromium && node view3d.test.mjs <site URL>
// e.g. node view3d.test.mjs https://lidar-lens-gb-live-test.tim-daw.workers.dev/
// Covers the two faults found on 8 Nov 2026: the view failing on its second opening (a context released on close was reused),
// and the sun sliders not starting from the lens's sun. Also: hillshade relights when the 3D sun moves, and the view needs WebGL 2.
import {chromium} from 'playwright';
const BASE=(process.argv[2]||'').replace(/\/?$/,'/');if(!/^https?:/.test(BASE)){console.error('give the site URL');process.exit(2)}
let pass=0,fail=0;const ok=(n,c,i='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(i?' '+i:''))};
const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ctx=await b.newContext({viewport:{width:1200,height:850}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
// Silbury Hill, single-sun hillshade, sun from 300° at 25°
await p.goto(BASE+'#c=51.4153%2C-1.8573%2C16&l=51.4153%2C-1.8573&mode=0&az=300&el=25',{waitUntil:'load'});
await p.waitForTimeout(2500);if(await p.evaluate(()=>!!(navigator.serviceWorker&&navigator.serviceWorker.controller)))await p.reload({waitUntil:'load'});
await p.waitForFunction(()=>window.__lens&&document.getElementById('view3d')&&document.getElementById('loading').hidden,null,{timeout:60000}).catch(()=>{});await p.waitForTimeout(2000);
const built=()=>p.waitForFunction(()=>{const w=document.getElementById('v3dwait');return w&&(w.classList.contains('err')||(w.hidden&&window.__view3d.model()))},null,{timeout:30000}).then(()=>p.evaluate(()=>{const w=document.getElementById('v3dwait');return w.hidden?'':w.textContent})).catch(()=>'timed out');
for(let k=1;k<=3;k++){await p.click('#view3d');const e=await built();ok('opens (time '+k+')',e==='',e);await p.click('#v3dx');await p.waitForTimeout(300)}
await p.click('#view3d');await built();
const s=await p.evaluate(()=>({az:+document.getElementById('v3daz').value,el:+document.getElementById('v3del').value}));
ok('sun sliders start from the lens sun',s.az===300&&s.el===25,JSON.stringify(s));
const tex0=await p.evaluate(()=>window.__view3d._v().texCanvas.toDataURL().length);
await p.evaluate(()=>{const a=document.getElementById('v3daz');a.value='120';a.dispatchEvent(new Event('input'))});await p.waitForTimeout(1500);
const r=await p.evaluate(()=>({lensAz:window.__lens.S.az,tex:window.__view3d._v().texCanvas.toDataURL().length}));
ok('3D sun moves the lens sun (hillshade)',r.lensAz===120,'lens az '+r.lensAz);ok('hillshade drape relit',r.tex!==tex0);
const m=await p.evaluate(()=>{const m=window.__view3d.model(),p=m.pos,ix=m.index,E=new Map();
  const key=q=>p[q*3].toFixed(4)+','+p[q*3+1].toFixed(4)+','+p[q*3+2].toFixed(4);
  for(let k=0;k<ix.length;k+=3)for(const [a,b] of [[ix[k],ix[k+1]],[ix[k+1],ix[k+2]],[ix[k+2],ix[k]]]){const A=key(a),B=key(b);if(A!==B)E.set(A+'>'+B,(E.get(A+'>'+B)||0)+1)}
  let open=0,dup=0;E.forEach((c,f)=>{const [a,b]=f.split('>');if(c>1)dup++;if(!E.has(b+'>'+a))open++});return {open,dup}});
ok('block is watertight',m.open===0&&m.dup===0,JSON.stringify(m));
// red-cyan (trial): the left eye goes to red and the right eye to green-blue, so the channels differ where the relief is; ticking it
// changes the picture, unticking it restores the plain one, and the GLB (screen-only setting) is the same either way
const px=()=>p.evaluate(()=>{const c=document.getElementById('v3dc'),g=document.createElement('canvas');g.width=200;g.height=Math.round(200*c.height/c.width);const x=g.getContext('2d');x.drawImage(c,0,0,g.width,g.height);
  const d=x.getImageData(0,0,g.width,g.height).data;let rg=0,n=0;for(let i=0;i<d.length;i+=4){if(Math.abs(d[i]-d[i+2])>30)rg++;n++}return {rg:100*rg/n,url:g.toDataURL()}});   // % of pixels with red and blue apart (colour fringes)
if(await p.$('#v3dana')){const p0=await px();const t0=Date.now();await p.check('#v3dana');await p.waitForTimeout(800);const p1=await px();
  ok('red-cyan: picture changes',p1.url!==p0.url);ok('red-cyan: red/cyan fringes appear',p1.rg>p0.rg+0.5,'% fringe pixels '+p0.rg.toFixed(2)+' -> '+p1.rg.toFixed(2));
  const tm=await p.evaluate(async()=>{const v=window.__view3d._v(),t=performance.now();for(let k=0;k<5;k++){v.dirty=true;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))}return (performance.now()-t)/5});
  console.log('TIME red-cyan frame (software GL, two rAF):',tm.toFixed(0),'ms');
  await p.uncheck('#v3dana');await p.waitForTimeout(800);const p2=await px();ok('red-cyan: off restores the plain view',Math.abs(p2.rg-p0.rg)<0.3,p2.rg.toFixed(2))}
// soft shading
if(await p.$('#v3dao')){await p.selectOption('#v3ddrape','clay');await p.waitForTimeout(500);const c0=await px();
  await p.check('#v3dao');await p.waitForTimeout(800);const c1=await px();const ao=await p.evaluate(()=>{const v=window.__view3d._v(),c=v.top.geometry.getAttribute('color');let lo=1;if(c)for(let i=0;i<c.count;i++)lo=Math.min(lo,c.getX(i));return {has:!!c,lo,ms:v.aoMs,mat:v.top.material.name}});
  ok('soft shading: picture changes',c1.url!==c0.url);ok('soft shading: darkens some ground',ao.has&&ao.lo<0.95,JSON.stringify(ao));console.log('TIME soft shading build:',(ao.ms||0).toFixed(0),'ms');
  await p.uncheck('#v3dao');await p.selectOption('#v3ddrape','lens');}
ok('no JS errors',!errs.length,errs[0]||'');await ctx.close();
// without WebGL 2: a message, no dialog, no errors
const c2=await b.newContext();await c2.addInitScript(`(()=>{const g=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){if(t==='webgl2')return null;return g.call(this,t,...a)}})()`);
const q=await c2.newPage();const e2=[];q.on('pageerror',e=>e2.push(e.message));await q.goto(BASE,{waitUntil:'load'});await q.waitForTimeout(5000);
if(await q.$('#view3d')){await q.click('#view3d');await q.waitForTimeout(600)}
const n=await q.evaluate(()=>({open:!!document.getElementById('v3d')&&!document.getElementById('v3d').hidden,msg:document.getElementById('msg').textContent}));
ok('no WebGL 2: explains, does not open',!n.open&&/WebGL 2/.test(n.msg),n.msg.slice(0,60));ok('no WebGL 2: no JS errors',!e2.length,e2[0]||'');
await b.close();console.log(pass+'/'+(pass+fail));process.exit(fail?1:0);
