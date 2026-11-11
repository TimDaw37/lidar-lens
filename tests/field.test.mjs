// Field mode (trial, 11 Nov 2026): Field/Research switch, remembered target, GPS position with distance and bearing, three views (four from release 6, with Aerial), big buttons; the view buttons are at least 48 px high, the rest 52.
// Usage (from tests/): node field.test.mjs <site URL> [dist folder]
import {openSite} from './open.mjs';
const BASE=(process.argv[2]||'').replace(/\/?$/,'/');if(!/^https?:/.test(BASE)){console.error('give the site URL');process.exit(2)}
const DIST=process.argv[3];let pass=0,fail=0;const ok=(n,c,i='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(i?' '+i:''))};
const SH='#c=51.1789%2C-1.8262%2C16&l=51.1789%2C-1.8262';const STN=[51.17886,-1.82623];
const st=p=>p.evaluate(()=>window.__field.state());
const vis=(p,sel)=>p.evaluate(s=>{const e=document.querySelector(s);if(!e)return false;const c=getComputedStyle(e),r=e.getBoundingClientRect();return c.display!=='none'&&c.visibility!=='hidden'&&r.width>0&&r.height>0},sel);
const minTarget=p=>p.evaluate(()=>{const bad=[];document.querySelectorAll('#fld button,#fieldsw button,#gotoq').forEach(e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);if(c.display==='none'||e.closest('[hidden]')||!r.width)return;if(r.height<(e.closest('#fldviews')?48:52)||r.width<56)bad.push((e.id||e.textContent.trim().slice(0,12))+' '+Math.round(r.width)+'x'+Math.round(r.height))});
  const sw=document.getElementById('fieldsw').getBoundingClientRect(),q=document.getElementById('gotoq').getBoundingClientRect();if(sw.right>innerWidth+0.5||sw.left<q.right-0.5)bad.push('switch overlaps/overflows');
  [...document.querySelectorAll('#fld button')].forEach(e=>{if(e.offsetParent&&e.scrollWidth>e.clientWidth+1)bad.push('text overflows '+e.id)});return bad});

// ---- 1. desktop research → field and back
{const {b,p,errs,open}=await openSite(BASE,DIST,{width:1280,height:800});await open(SH);
  ok('opens in Research mode by default',!(await st(p)).on&&!(await p.evaluate(()=>document.body.classList.contains('field'))));
  ok('desktop: Field/Research switch sits in the panel header',await p.evaluate(()=>!!document.querySelector('#panel .ph #fieldsw')));
  const before=await p.evaluate(()=>({mode:document.getElementById('mode').value,fs:document.getElementById('fs').checked}));
  await p.click('#fieldsw button[data-ui=field]');await p.waitForTimeout(1200);
  ok('switch turns Field mode on',(await st(p)).on&&await p.evaluate(()=>document.body.classList.contains('field')));
  ok('panel and research chrome are hidden',!(await vis(p,'#panel'))&&!(await vis(p,'#modestrip'))&&!(await vis(p,'#titlebox h1')));
  ok('field sheet shown with readout and four views (Aerial added in release 6)',await vis(p,'#fld')&&(await p.evaluate(()=>document.querySelectorAll('#fldviews button').length))===4);
  ok('Hillshade view: mode 0, LiDAR full screen',await p.evaluate(()=>document.getElementById('mode').value==='0'&&document.getElementById('fs').checked));
  ok('the link carries ui=field',/[#&]ui=field/.test(await p.evaluate(()=>{window.__lens.saveHashSoon&&window.__lens.saveHashSoon();return new Promise(r=>setTimeout(()=>r(location.hash),900))})));
  await p.click('#fldviews button[data-v=vat]');await p.waitForTimeout(800);
  ok('VAT view: Combined VAT (mode 10), full screen',await p.evaluate(()=>document.getElementById('mode').value==='10'&&document.getElementById('fs').checked));
  await p.click('#fldviews button[data-v=old]');await p.waitForTimeout(800);
  ok('Old map view: LiDAR put away, an old map chosen',await p.evaluate(()=>document.getElementById('hist').value!==''&&document.body.classList.contains('fold')));
  await p.click('#fldviews button[data-v=hs]');await p.waitForTimeout(600);
  ok('no target yet: the readout is collapsed so the map is uncluttered',!(await vis(p,'#fldread'))&&await vis(p,'#fldtgt'));
  // target by tapping the map
  await p.click('#fldtgt');ok('Target button enters pick mode',(await st(p)).picking);
  const pt=await p.evaluate(ll=>{const m=window.__lens.map,r=m.getContainer().getBoundingClientRect(),q=m.latLngToContainerPoint(ll);return [r.left+q.x,r.top+q.y]},STN);
  await p.mouse.click(pt[0],pt[1]);await p.waitForTimeout(600);
  {const s=await st(p);ok('tapping the map sets the target there',s.target&&Math.abs(s.target.lat-STN[0])<3e-4&&Math.abs(s.target.lng-STN[1])<3e-4&&!s.picking,JSON.stringify(s.target))}
  ok('target marker drawn above the LiDAR (its pane stacks over the #gl canvas and lens)',await p.evaluate(()=>{const e=document.querySelector('.fldtgt');if(!e)return false;const pane=e.closest('#fldclip')||e.closest('.leaflet-pane,[class*=pane]')||e.parentElement,z=+getComputedStyle(pane).zIndex,r=e.getBoundingClientRect();return z>460&&r.width>=40&&getComputedStyle(e).display!=='none'}));
  ok('link carries tgt=',/[#&]tgt=51\.17/.test(await p.evaluate(()=>{window.__lens.saveHashSoon();return new Promise(r=>setTimeout(()=>r(location.hash),900))})));
  // search sets the target
  await p.fill('#gotoq','SU 1224 4219');await p.press('#gotoq','Enter');await p.waitForTimeout(1500);
  {const s=await st(p);const en=await p.evaluate(t=>window.__lens.osgb.ll2en(t.lat,t.lng),s.target);ok('a search result becomes the target',Math.abs(en[0]-412245)<40&&Math.abs(en[1]-142195)<40,JSON.stringify(en.map(Math.round)))}
  // reload keeps field + target
  const tgt=(await st(p)).target;await p.goto(BASE+SH);await p.waitForTimeout(500);await open(SH);
  {const s=await st(p);ok('reload (link without ui=) keeps Field mode, remembered on the device',s.on);ok('reload keeps the target',s.target&&Math.abs(s.target.lat-tgt.lat)<1e-6,JSON.stringify(s.target))}
  ok('GPS-less desktop: readout still shows the target grid ref',/SU|target|Target/.test(await p.textContent('#fld')));
  // What is it? with a target → card for the target
  await p.click('#fldwi');const card=await p.waitForFunction(()=>{const c=document.getElementById('card');return getComputedStyle(c).display!=='none'&&c.textContent.length>80},null,{timeout:45000}).then(()=>true,()=>false);
  ok('What is it? opens the What\'s here card for the target',card,(await p.evaluate(()=>document.getElementById('card').textContent.replace(/\s+/g,' ').slice(0,80))));
  // back to research restores the snapshot
  await p.evaluate(()=>{const x=document.querySelector('#card .x');x&&x.click()});
  await p.click('#fieldsw button[data-ui=research]');await p.waitForTimeout(1200);
  ok('switching back to Research shows the panel again',(await vis(p,'#panel'))&&!(await st(p)).on);
  ok('Research restores the visualisation it had',await p.evaluate(b=>document.getElementById('mode').value===b.mode&&document.getElementById('fs').checked===b.fs,before));
  ok('no field markers left in Research',!(await vis(p,'.fldtgt')));
  await p.goto(BASE+SH);await open(SH);ok('Research choice is remembered on reload',!(await st(p)).on);
  await open(SH+'&ui=field');ok('a ui=field link opens Field mode',(await st(p)).on);
  await open(SH+'&ui=research');ok('a ui=research link opens Research mode',!(await st(p)).on);
  await p.setViewportSize({width:1280,height:800});await open(SH+'&ui=field');
  {const bad=await minTarget(p);ok('desktop: every field control is at least 56 px wide, 52 px high and fits',bad.length===0,bad.join('; '))}
  ok('no JS errors (desktop)',errs.length===0,errs.join(' | ').slice(0,300));await b.close()}

// ---- 2. phone with simulated GPS
for(const w of [360,420]){const {b,ctx,p,errs,open}=await openSite(BASE,DIST,{width:w,height:800},{isMobile:true,hasTouch:true,deviceScaleFactor:2,geolocation:{latitude:51.1755,longitude:-1.8318,accuracy:6},permissions:['geolocation']});
  await open(SH);
  ok(w+': phone research view has a floating Field switch',await vis(p,'#fieldgo #fieldsw'));
  await open(SH+'&ui=field&tgt=51.178860,-1.826230');await p.waitForTimeout(2500);
  const s=await st(p);ok(w+': link opens Field with the target',s.on&&s.target&&Math.abs(s.target.lat-51.17886)<1e-6);
  ok(w+': GPS position used',s.gpsState==='ok'&&s.me&&Math.abs(s.me.lat-51.1755)<1e-6,JSON.stringify(s.me));
  const big=await p.textContent('#fldbig');const exp=await p.evaluate(()=>window.__field.distBear({lat:51.1755,lng:-1.8318},{lat:51.17886,lng:-1.82623}));
  ok(w+': distance and bearing in large text',/539\s*m/.test(big)&&/NE/.test(big)&&/04[56]°/.test(big),big.replace(/\s+/g,' ')+' expect '+JSON.stringify(exp));
  {const r=await p.evaluate(()=>{const b=document.getElementById('fldbig'),d=document.querySelector('#flddir small'),k=[...b.children].map(e=>e.getBoundingClientRect()).filter(r=>r.width);return {deg:d?getComputedStyle(d).display!=='none':false,lines:k[k.length-1].top>k[0].bottom-4?2:1}});
   ok(w+(w<=390?': narrow screen: degrees hidden, readout on one line':': degrees shown, readout on one line'),r.lines===1&&r.deg===(w>390),JSON.stringify(r))}
  ok(w+': readout text is big (≥32 px)',await p.evaluate(()=>parseFloat(getComputedStyle(document.getElementById('fldbig')).fontSize)>=32));
  const both=()=>p.evaluate(()=>{const m=window.__lens.map,s=window.__field.state(),r=m.getContainer().getBoundingClientRect(),fld=document.getElementById('fld').getBoundingClientRect(),tb=document.getElementById('titlebox').getBoundingClientRect();
    const inv=ll=>{const q=m.latLngToContainerPoint([ll.lat,ll.lng]);return q.x>=0&&q.x<=r.width&&q.y>=tb.bottom-r.top-2&&q.y<=fld.top-r.top+2};return inv(s.me)&&inv(s.target)});
  ok(w+': you and the target both in view, clear of the bars',await both());
  ok(w+': you-are-here dot drawn',await vis(p,'.fldme'));
  // live update as you walk
  await ctx.setGeolocation({latitude:51.1784,longitude:-1.8270,accuracy:5});await p.waitForTimeout(2500);
  {const t=(await p.textContent('#fldbig')).replace(/\s+/g,' ');ok(w+': distance updates live as you move',/7[0-9]\s*m/.test(t),t)}
  // pan away → Recentre
  await p.evaluate(()=>{window.__lens.map.fire('dragstart');window.__lens.map.setView([51.20,-1.90],15,{animate:false})});await p.waitForTimeout(800);
  ok(w+': panning away turns following off',!(await st(p)).follow&&!(await both()));
  await p.click('#fldfit');await p.waitForTimeout(1500);ok(w+': Recentre brings you and the target back into view',(await st(p)).follow&&await both());
  {const bad=await minTarget(p);ok(w+': every field control ≥56 px wide and ≥52 px high, switch fits beside the search box',bad.length===0,bad.join('; '))}
  ok(w+': page does not scroll sideways',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  // target ✕ clears
  ok(w+': far from the target: a labelled Done button (≥56 px) beside the readout, no big green one yet',await vis(p,'#fldclr')&&!(await vis(p,'#flddone'))&&/Done/.test(await p.textContent('#fldclr')));
  // arrive on target (within 25 m): Done is offered big and green
  await ctx.setGeolocation({latitude:51.17880,longitude:-1.82610,accuracy:5});await p.waitForTimeout(2500);
  {const r=await p.evaluate(()=>{const e=document.getElementById('flddone'),b=e.getBoundingClientRect();return {w:b.width,h:b.height,bg:getComputedStyle(e).backgroundColor,t:e.textContent}});
   ok(w+': within 25 m: big green "Done: clear target" button',(await vis(p,'#flddone'))&&r.h>=56&&r.w>=w*0.8&&/clear target/i.test(r.t)&&/you are there/.test(await p.textContent('#fldsub')),JSON.stringify(r))}
  ok(w+': on target the small Done gives way to the big one',!(await vis(p,'#fldclr')));
  const c0=await p.evaluate(()=>{const c=window.__lens.map.getCenter(),z=window.__lens.map.getZoom();return [c.lat,c.lng,z]});
  await p.click('#flddone');await p.waitForTimeout(600);
  {const s2=await st(p);ok(w+': Done clears the target and the readout collapses',!s2.target&&!(await vis(p,'#fldread'))&&!(await vis(p,'.fldtgt'))&&!(await vis(p,'#flddone')))}
  ok(w+': the GPS dot stays',await vis(p,'.fldme'));
  await ctx.setGeolocation({latitude:51.17900,longitude:-1.82680,accuracy:5});await p.waitForTimeout(2500);
  {const c1=await p.evaluate(()=>{const c=window.__lens.map.getCenter(),z=window.__lens.map.getZoom();return [c.lat,c.lng,z]});
   ok(w+': after Done the map stays where it is as you move (no re-framing)',Math.abs(c1[0]-c0[0])<1e-7&&Math.abs(c1[1]-c0[1])<1e-7&&c1[2]===c0[2],JSON.stringify([c0,c1]))}
  ok(w+': link no longer carries tgt=',!/[#&]tgt=/.test(await p.evaluate(()=>{window.__lens.saveHashSoon();return new Promise(r=>setTimeout(()=>r(location.hash),900))})));
  // the small Done beside the readout also clears
  await p.evaluate(()=>window.__field.setTarget(51.17886,-1.82623,'Stonehenge'));await ctx.setGeolocation({latitude:51.1755,longitude:-1.8318,accuracy:6});await p.waitForTimeout(2000);
  await p.click('#fldclr');await p.waitForTimeout(500);ok(w+': the Done button beside the readout clears the target too',!(await st(p)).target&&!(await vis(p,'#fldread')));
  await p.click('#fldtgt');ok(w+': Target opens the readout again to say "Tap the map"',(await vis(p,'#fldread'))&&/Tap the map/.test(await p.textContent('#fldbig')));await p.click('#fldtgt');
  ok(w+': no JS errors',errs.length===0,errs.join(' | ').slice(0,300));await b.close()}

// ---- 3. GPS denied
{const {b,p,errs,open}=await openSite(BASE,DIST,{width:420,height:800},{isMobile:true,hasTouch:true,deviceScaleFactor:2});
  await p.addInitScript(()=>{const deny=(ok,err)=>{setTimeout(()=>err&&err({code:1,message:'User denied Geolocation',PERMISSION_DENIED:1}),50);return 1};
    navigator.geolocation.watchPosition=deny;navigator.geolocation.getCurrentPosition=deny;navigator.geolocation.clearWatch=()=>{}});
  await open(SH+'&ui=field&tgt=51.178860,-1.826230');await p.waitForTimeout(1500);
  const s=await st(p);ok('denied: state is "denied" and the banner explains what to do',s.gpsState==='denied'&&await vis(p,'#fldgps')&&/blocked/i.test(await p.textContent('#fldgps')));
  ok('denied: Retry button offered',await vis(p,'#fldretry'));
  ok('denied: target still shown and What is it? still works',s.target&&await vis(p,'.fldtgt')&&await vis(p,'#fldwi'));
  ok('denied: no JS errors',errs.length===0,errs.join(' | ').slice(0,300));await b.close()}
// ---- 4. compass (simulated orientation events)
const CT='#c=51.1789%2C-1.8262%2C16&ui=field&tgt=51.178860,-1.826230',GEO={isMobile:true,hasTouch:true,deviceScaleFactor:2,geolocation:{latitude:51.1755,longitude:-1.8318,accuracy:6},permissions:['geolocation']};
const rot=p=>p.evaluate(()=>{const a=document.getElementById('fldarr');return a?+a.dataset.rot:null});
const near=(a,b)=>Math.abs(((a-b+540)%360)-180)<1.5;
{const {b,ctx,p,errs,open}=await openSite(BASE,DIST,{width:420,height:800},GEO);await ctx.addInitScript(()=>{if(typeof DeviceOrientationEvent!=='undefined')delete DeviceOrientationEvent.requestPermission});await open(CT);await p.waitForTimeout(3800);
  ok('no compass events: arrow stays north-up (46°) with a note',near(await rot(p),46)&&/north-up map \(no compass\)/.test(await p.textContent('#fldsub'))&&(await st(p)).compass==='none',String(await rot(p)));
  ok('no compass: numeric bearing still shown',/046°/.test(await p.textContent('#fldbig')));await b.close()}
{const {b,p,errs,open}=await openSite(BASE,DIST,{width:420,height:800},GEO);await open(CT);await p.waitForTimeout(1000);
  const fire=a=>p.evaluate(a=>window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute',{alpha:a,beta:10,gamma:0,absolute:true})),a);
  await fire(270);await p.waitForTimeout(300);   // alpha 270 = phone facing east (heading 90): target at 46° is 44° to the left
  ok('Android compass: phone facing east, arrow turns 44° left (316°)',near(await rot(p),316)&&/arrow follows your phone/.test(await p.textContent('#fldsub')),String(await rot(p)));
  await fire(314);await p.waitForTimeout(300);ok('Android compass: phone facing the target, arrow points straight ahead',near(await rot(p),0),String(await rot(p)));
  ok('compass: map stays north-up and the numeric bearing is unchanged',/046°/.test(await p.textContent('#fldbig'))&&await p.evaluate(()=>!/rotate/.test(getComputedStyle(document.querySelector('.leaflet-map-pane')).transform+'')));
  ok('compass: no JS errors',errs.length===0,errs.join(' | ').slice(0,300));await b.close()}
{const {b,ctx,p,errs,open}=await openSite(BASE,DIST,{width:420,height:800},GEO);
  await ctx.addInitScript(()=>{if(typeof DeviceOrientationEvent==='undefined')return;window.__asked=0;DeviceOrientationEvent.requestPermission=()=>{window.__asked++;return Promise.resolve(window.__deny?'denied':'granted')}});
  await open(CT);await p.waitForTimeout(3800);
  ok('iOS: no readings without permission, so it offers a Use compass button (no prompt before a tap)',(await vis(p,'#fldcmpb'))&&await p.evaluate(()=>window.__asked===0)&&(await st(p)).compass==='needperm');
  await p.click('#fldcmpb');await p.waitForTimeout(300);
  await p.evaluate(()=>{const e=new DeviceOrientationEvent('deviceorientation',{alpha:0,beta:10,gamma:0,absolute:false});Object.defineProperty(e,'webkitCompassHeading',{value:180});window.dispatchEvent(e)});await p.waitForTimeout(300);
  ok('iOS: after the tap, webkitCompassHeading turns the arrow (facing south: 226°)',await p.evaluate(()=>window.__asked===1)&&near(await rot(p),226)&&!(await vis(p,'#fldcmp')),String(await rot(p)));
  await open(CT+'&x=1');await p.evaluate(()=>{window.__deny=1});await p.waitForTimeout(3800);await p.click('#fldcmpb');await p.waitForTimeout(400);
  ok('iOS: permission refused falls back to the north-up arrow with a note',near(await rot(p),46)&&/no compass/.test(await p.textContent('#fldsub'))&&(await st(p)).compass==='denied');
  ok('iOS compass: no JS errors',errs.length===0,errs.join(' | ').slice(0,300));await b.close()}
// Lab label
{const {b,p,open}=await openSite(BASE,DIST,{width:360,height:760},{isMobile:true,hasTouch:true,deviceScaleFactor:2});await open(SH+'&ui=lab');
  ok('the switch reads Field | Lab, and a ui=lab link opens Lab',(await p.textContent('#fieldsw')).replace(/\s/g,'')==='FieldLab'&&!(await st(p)).on);await b.close()}
console.log(pass+' passed, '+fail+' failed');process.exit(fail?1:0);
