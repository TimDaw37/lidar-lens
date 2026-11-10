// View from here checks in Chromium. Usage (from tests/): node viewshed.test.mjs <site URL> [path to a local site/viewshed.js to inject]
// e.g. node viewshed.test.mjs https://lidar-lens-gb-live-test.tim-daw.workers.dev/
// The second argument tests a viewshed.js that is not deployed yet against the live site's tiles (the page's CSP is bypassed to inject it).
// Part 1 checks the sweep against cases with known answers; part 2 runs the tool at Stonehenge on real LiDAR.
import {chromium} from 'playwright';import fs from 'node:fs';
const BASE=(process.argv[2]||'').replace(/\/?$/,'/'),INJECT=process.argv[3];if(!/^https?:/.test(BASE)){console.error('give the site URL');process.exit(2)}
let pass=0,fail=0;const ok=(n,c,i='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(i?' '+i:''))};
const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'],proxy:process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY}:undefined});
const ctx=await b.newContext({viewport:{width:1300,height:900},bypassCSP:!!INJECT});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
const open=async hash=>{await p.goto(BASE+hash,{waitUntil:'load'});await p.waitForTimeout(2500);
  if(await p.evaluate(()=>!!(navigator.serviceWorker&&navigator.serviceWorker.controller))){await p.goto('about:blank');await p.goto(BASE+hash,{waitUntil:'load'})}
  await p.waitForFunction(()=>window.__lens&&document.getElementById('loading').hidden,null,{timeout:60000}).catch(()=>{});await p.waitForTimeout(1500);
  if(INJECT)await p.addScriptTag({content:fs.readFileSync(INJECT,'utf8')});
  await p.waitForFunction(()=>window.__viewshed,null,{timeout:10000})};
await open('#c=51.1789%2C-1.8262%2C15&l=51.1789%2C-1.8262');
ok('button and key row added',await p.evaluate(()=>!!document.getElementById('viewfrom')&&/View from here/.test(document.querySelector('#help table.keys').textContent)));

// ---------- part 1: known answers ----------
const syn=await p.evaluate(()=>{const V=window.__viewshed,R=6371000,out={};
  const ring=(mpp,n,to,step,f)=>{const H=new Float32Array(n*n);for(let j=0;j<n;j++)for(let i=0;i<n;i++)H[j*n+i]=f((i+0.5-n/2)*mpp,(n/2-(j+0.5))*mpp);return {H,W:n,Hh:n,ox:0,oy:0,vx:n/2,vy:n/2,mpp,z:0,from:0,to,step}};
  // level plain at 100 m out to 10 km: the skyline is the curve of the Earth
  let S=V.sweep([ring(16,1300,10000,16,()=>100)]);out.plainDist=S.dist[0];out.plainAlt=S.alt[0];out.cf20=S.cf*4e8;
  let r=V.raster(S,0);out.plainSeen=r.seen/r.all;
  // 30 m bank running north-south, 500 to 520 m east of the viewpoint, on a level plain
  S=V.sweep([ring(2,1200,1000,2,(x)=>x>=500&&x<520?130:100)]);out.bankAlt=S.alt[360];out.bankDist=S.dist[360];out.westAlt=S.alt[1080];
  r=V.raster(S,0);const at=(x,y)=>r.m[Math.floor((r.h/2)-y/2)*r.w+Math.floor(r.w/2+x/2)];
  out.behind=at(700,0);out.front=at(300,0);out.crest=at(501,0);out.top=at(511,0);out.west=at(-700,0);out.farNE=at(650,650);
  // cone: ground rising 1 in 10 away from the viewpoint in every direction is all in view; falling 1 in 10 beyond a 100 m level top is all hidden
  S=V.sweep([ring(2,1200,1000,2,(x,y)=>100+Math.hypot(x,y)/10)]);r=V.raster(S,0);out.bowl=r.seen/r.all;
  S=V.sweep([ring(2,1200,1000,2,(x,y)=>100-Math.max(0,Math.hypot(x,y)-100)/10)]);r=V.raster(S,0);let hid=0,n=0;
  for(let j=0;j<r.h;j++)for(let i=0;i<r.w;i++){const d=Math.hypot((i+0.5-r.w/2)*2,(j+0.5-r.h/2)*2);if(d>140&&d<990){n++;if(r.m[j*r.w+i]===2)hid++}}out.domeHidden=hid/n;out.domeAlt=S.alt[0];
  return out});
const near=(a,b,t)=>Math.abs(a-b)<=t;
ok('level plain: skyline 4.69 km off',near(syn.plainDist,4687,40),syn.plainDist.toFixed(0)+' m');
ok('level plain: dip 0.037°',near(syn.plainAlt,-0.0367,0.002),syn.plainAlt.toFixed(4));
ok('level plain: in view to the skyline, hidden beyond it',syn.plainSeen>0.2&&syn.plainSeen<0.33,syn.plainSeen.toFixed(3));
ok('curvature and refraction at 20 km is 27 m',near(syn.cf20,27.3,0.2),syn.cf20.toFixed(2));
ok('bank: skyline on the bank at 3.26°',near(syn.bankAlt,3.26,0.06)&&near(syn.bankDist,510,14),syn.bankAlt.toFixed(3)+'° at '+syn.bankDist+' m');
ok('bank: face seen, flat top and ground behind hidden, in front and west seen',syn.behind===2&&syn.front===1&&syn.west===1&&syn.crest===1&&syn.top===2&&syn.farNE===2,JSON.stringify([syn.behind,syn.front,syn.crest,syn.top,syn.west,syn.farNE]));
ok('bank: open side is the plain',near(syn.westAlt,-0.09,0.02),syn.westAlt.toFixed(3));
ok('rising ground all in view',syn.bowl>0.999,syn.bowl.toFixed(4));
ok('ground falling away beyond a level top is hidden',syn.domeHidden>0.999&&near(syn.domeAlt,-0.86,0.05),syn.domeHidden.toFixed(4)+' '+syn.domeAlt.toFixed(3));

// ---------- part 2: Stonehenge, real LiDAR ----------
await p.keyboard.press('e');ok('E turns the tool on',await p.evaluate(()=>window.__lens.tool()==='viewfrom'&&document.getElementById('viewfrom').getAttribute('aria-pressed')==='true'));
await p.keyboard.press('Escape');
const t0=Date.now();const st=await p.evaluate(async()=>{const s=await window.__viewshed.run([51.17882,-1.82622]);if(!s)return null;
  const a=b=>s.alt[Math.round(b/s.step)],d=b=>s.dist[Math.round(b/s.step)];let open=0;for(const f of s.flag)if(f)open++;
  return {z0:s.z0,seen:s.seenKm2,ground:s.groundKm2,ne:a(49.6),neD:d(49.6),sw:a(229.6),swD:d(229.6),se:a(130),nw:a(310),open:open*s.step,
    imgs:document.querySelectorAll('img.vfh-img').length,box:!document.getElementById('vfh').hidden,sum:document.getElementById('vfhsum').textContent,warn:document.getElementById('vfhwarn').textContent}});
console.log('  ran in',((Date.now()-t0)/1000).toFixed(1),'s',JSON.stringify(st));
ok('Stonehenge: runs',!!st);
if(st){ok('ground height about 101-103 m',st.z0>100&&st.z0<104,st.z0.toFixed(2));
  ok('four overlays and the panel shown',st.imgs===4&&st.box);
  ok('LiDAR covers most of the 10 km circle',st.ground>250,st.ground.toFixed(0)+' km²');
  ok('north-east skyline between 0.3° and 1.0°',st.ne>0.3&&st.ne<1.0,st.ne.toFixed(2)+'° at '+Math.round(st.neD)+' m');
  ok('south-west skyline between 0.2° and 1.2°',st.sw>0.2&&st.sw<1.2,st.sw.toFixed(2)+'° at '+Math.round(st.swD)+' m');
  await p.mouse.move(500,300);await p.waitForTimeout(200);
  ok('moving over the map gives a bearing readout',/^Bearing \d{3}\.\d° \([NESW]+\): skyline/.test(await p.evaluate(()=>document.getElementById('vfhread').textContent)),await p.evaluate(()=>document.getElementById('vfhread').textContent));
  await p.evaluate(()=>{const c=document.getElementById('vfhshade');c.checked=true;c.dispatchEvent(new Event('change'))});
  ok('shading hidden ground redraws the overlays',await p.evaluate(()=>document.querySelectorAll('img.vfh-img').length)===4);
  await p.waitForTimeout(900);const h=await p.evaluate(()=>location.hash);ok('share link carries the viewpoint',/vp=51\.17882(%2C|,)-1\.82622/.test(h),h.slice(-40));
  await p.click('#vfhx');ok('close clears it',await p.evaluate(()=>!window.__viewshed.state()&&!document.querySelectorAll('img.vfh-img').length&&document.getElementById('vfh').hidden));
  await p.waitForTimeout(900);ok('and the link',!/vp=/.test(await p.evaluate(()=>location.hash)));}
// a spot with no LiDAR (mid Channel) says so
const none=await p.evaluate(async()=>{const s=await window.__viewshed.run([50.2,-1.8]);return {s:!!s,msg:document.getElementById('msg').textContent}});
ok('no LiDAR at the spot: explains',!none.s&&/no LiDAR/.test(none.msg),none.msg);
ok('no JS errors',!errs.length,errs[0]||'');
await b.close();console.log(pass+'/'+(pass+fail));process.exit(fail?1:0);
