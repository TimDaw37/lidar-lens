// Release 7 (11 Nov 2026, Tim pt2121u): what field mode puts in the middle lands in the middle of the visible map (below the
// search bar, above the sheet, the middle of the screen across), measured from the drawn ring and blue dot on screen: on opening,
// Go to target (tap the readout), the + / − buttons, the URL bar or a rotation changing the viewport, the sheet changing height,
// GPS updates while following, and Recentre; near target (both framed, midpoint centred) and far target (you centred).
// Also the control sizes on wide phones. Usage (from tests/): node field-centre.test.mjs <site URL> [dist folder] [screenshot prefix]
import {openSite} from './open.mjs';
const BASE=(process.argv[2]||'').replace(/\/?$/,'/');if(!/^https?:/.test(BASE)){console.error('give the site URL');process.exit(2)}
const DIST=process.argv[3]&&process.argv[3]!=='-'?process.argv[3]:null,SHOT=process.argv[4];let pass=0,fail=0;const ok=(n,c,i='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(i?' '+i:''))};
const ME={latitude:51.3555,longitude:-1.8990},TGT=[51.3517,-1.9050],PERTH=[56.395,-3.437],TOL=6;   // All Cannings, target ~590 m SW (Tim's case)
const PROF=[[360,680,3],[375,812,3],[412,790,2.625],[460,880,3.13],[480,920,3.5]];
for(const [w,h,dpr] of PROF){const tag=w+'x'+h+'@'+dpr;
  const {b,p,ctx,errs,open}=await openSite(BASE,DIST,{width:w,height:h},{isMobile:true,hasTouch:true,deviceScaleFactor:dpr,geolocation:ME,permissions:['geolocation']});
  await open(`?ui=field#c=${ME.latitude}%2C${ME.longitude}%2C15&ui=field&tgt=${TGT.join(',')}`);await p.waitForTimeout(2500);
  const where=()=>p.evaluate(()=>{const q=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]};
    const tb=document.getElementById('titlebox').getBoundingClientRect().bottom,ft=document.getElementById('fld').getBoundingClientRect().top;return {ring:q('.fldtgt'),dot:q('.fldme'),vc:[innerWidth/2,(tb+ft)/2]}});
  const off=(a,c)=>a?Math.round(Math.hypot(a[0]-c[0],a[1]-c[1])):1e9,R=a=>a&&a.map(Math.round);
  const chk=async(name,which)=>{const x=await where();const pt=which==='ring'?x.ring:which==='dot'?x.dot:(x.ring&&x.dot?[(x.ring[0]+x.dot[0])/2,(x.ring[1]+x.dot[1])/2]:null);
    ok(`${tag}: ${name}: ${which==='mid'?'midpoint of you and the target':which==='ring'?'target ring':'your dot'} in the middle of the visible map`,off(pt,x.vc)<=TOL,`at ${R(pt)} vs ${R(x.vc)}`);
    if(SHOT)await p.screenshot({path:`${SHOT}_${w}_${name.replace(/\W+/g,'_')}.png`})};
  const sz=await p.evaluate(()=>{const g=s=>[...document.querySelectorAll(s)].filter(e=>e.offsetWidth).map(e=>{const r=e.getBoundingClientRect();return {s,h:r.height,w:r.width,f:parseFloat(getComputedStyle(e).fontSize)}});
    return [...g('#fld button'),...g('#gotoq'),...g('#goto #fieldsw button'),...g('#fldread .t.go')]});
  const small=sz.filter(e=>e.h<48||e.w<44);ok(tag+': every field control at least 48 px high and 44 px wide',!small.length,JSON.stringify(small).slice(0,200));
  const tiny=sz.filter(e=>e.s!=='#fldread .t.go'&&e.f<15);ok(tag+': button and search text at least 15 px',!tiny.length,JSON.stringify(tiny).slice(0,200));
  const sheet=await p.evaluate(()=>document.getElementById('fld').offsetHeight/innerHeight);ok(tag+': the sheet stays compact (under 45% of the screen)',sheet<0.45,Math.round(sheet*100)+'%');
  if(w>=460){const f=await p.evaluate(()=>parseFloat(getComputedStyle(document.getElementById('fldwi')).fontSize));ok(tag+': wide phone: text scaled up',f>=21,f+' px')}
  await chk('open (near)','mid');
  await p.tap('#fldread .t');await p.waitForTimeout(700);await chk('go to target','ring');
  await p.tap('.leaflet-control-zoom-in');await p.waitForTimeout(700);await chk('zoom +','ring');
  await p.tap('.leaflet-control-zoom-out');await p.waitForTimeout(700);await chk('zoom −','ring');
  await p.setViewportSize({width:w,height:h-56});await p.waitForTimeout(800);await chk('URL bar shown (56 px shorter)','ring');
  await p.setViewportSize({width:w,height:h});await p.waitForTimeout(800);await chk('URL bar hidden','ring');
  await p.evaluate(()=>{const d=document.createElement('div');d.id='tmpgrow';d.style.height='60px';document.getElementById('fld').prepend(d)});await p.waitForTimeout(700);await chk('sheet grew 60 px','ring');
  await p.evaluate(()=>document.getElementById('tmpgrow').remove());await p.waitForTimeout(700);await chk('sheet shrank back','ring');
  const LW=Math.max(h,740),LH=w-30;await p.setViewportSize({width:LW,height:LH});await p.waitForTimeout(900);   // a phone on its side (wider than 700 px: the sheet becomes a side card)
  {const x=await where(),s=await p.evaluate(()=>{const f=document.getElementById('fld').getBoundingClientRect(),t=document.getElementById('titlebox').getBoundingClientRect();return {f:[f.left,f.top,f.right,f.bottom],tb:t.bottom}});
   const r=x.ring,inF=r&&r[0]>=s.f[0]&&r[0]<=s.f[2]&&r[1]>=s.f[1]&&r[1]<=s.f[3];ok(`${tag}: rotated to landscape: target ring visible, not under the sheet or search bar`,r&&r[0]>0&&r[0]<LW&&r[1]>s.tb&&r[1]<LH&&!inF,JSON.stringify(R(r)))}
  await p.setViewportSize({width:w,height:h});await p.waitForTimeout(900);await chk('rotated back to portrait','ring');
  await p.tap('#fldfit');await p.waitForTimeout(700);await chk('Recentre (near: both)','mid');
  await ctx.setGeolocation({latitude:ME.latitude-0.0006,longitude:ME.longitude-0.0004});await p.waitForTimeout(1500);await chk('GPS update while following (near)','mid');
  await p.setViewportSize({width:w,height:h-56});await p.waitForTimeout(800);await chk('URL bar shown while following (near)','mid');
  await p.setViewportSize({width:w,height:h});await p.waitForTimeout(800);
  await p.evaluate(t=>window.__field.setTarget(t[0],t[1],''),PERTH);await p.waitForTimeout(900);await chk('far target set','dot');
  await p.tap('#fldread .t');await p.waitForTimeout(700);await chk('far: go to target','ring');
  await p.tap('#fldfit');await p.waitForTimeout(700);await chk('far: Recentre','dot');
  await ctx.setGeolocation({latitude:ME.latitude+0.002,longitude:ME.longitude+0.002});await p.waitForTimeout(1500);await chk('far: GPS update while following','dot');
  await p.tap('.leaflet-control-zoom-in');await p.waitForTimeout(700);await chk('far: zoom + while following','dot');
  await p.evaluate(()=>{const m=window.__lens.map;m.fire('dragstart');m.panBy([80,60],{animate:false});m.fire('dragend')});await p.waitForTimeout(400);
  const before=await where();await p.evaluate(()=>{const d=document.createElement('div');d.id='tmpgrow';d.style.height='60px';document.getElementById('fld').prepend(d)});await p.waitForTimeout(800);const after=await where();
  ok(`${tag}: after a drag, the sheet changing height does not re-centre`,Math.abs(after.dot[1]-before.dot[1])<4&&Math.abs(after.dot[0]-before.dot[0])<4,`${R(before.dot)} -> ${R(after.dot)}`);
  ok(tag+': no JS errors',errs.length===0,errs.join(' | ').slice(0,200));await b.close()}
console.log(pass+' passed, '+fail+' failed');process.exit(fail?1:0);
