// Field mode, round 4 (11 Nov 2026): target opens in the visible map above the sheet, compact sheet with a one-line GPS note,
// compass offer only with a fix, big zoom buttons, lens kept on the target, clean Old map switch, and the home-screen shortcut.
// Usage (from tests/): node field2.test.mjs <site URL> [dist folder]
import {openSite} from './open.mjs';import fs from 'node:fs';import path from 'node:path';
const BASE=(process.argv[2]||'').replace(/\/?$/,'/');if(!/^https?:/.test(BASE)){console.error('give the site URL');process.exit(2)}
const DIST=process.argv[3];let pass=0,fail=0;const ok=(n,c,i='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(i?' '+i:''))};
const T=[51.17886,-1.82623],LINK='#c=51.17886%2C-1.82623%2C16&l=51.17886%2C-1.82623&ui=field&tgt=51.178860,-1.826230';
const DENY=()=>{const deny=(ok,err)=>{setTimeout(()=>err&&err({code:1,message:'denied'}),300);return 1};navigator.geolocation.watchPosition=deny;navigator.geolocation.getCurrentPosition=deny;navigator.geolocation.clearWatch=()=>{}};
const geom=p=>p.evaluate(()=>{const m=window.__lens.map,t=document.querySelector('.fldtgt'),f=document.getElementById('fld').getBoundingClientRect(),tb=document.getElementById('titlebox').getBoundingClientRect(),tr=t?t.getBoundingClientRect():null;
  const lc=window.__lens.lensState().c,ll=m.containerPointToLatLng(lc),hl=(location.hash.match(/[#&]l=([-\d.]+)%2C([-\d.]+)/)||[]).slice(1).map(Number);
  return {ty:tr&&tr.top+tr.height/2,tx:tr&&tr.left+tr.width/2,top:tb.bottom,sheet:f.top,sh:f.height,W:innerWidth,H:innerHeight,lens:[ll.lat,ll.lng],hl}});
const dm=(a,b)=>{const R=6371000,r=Math.PI/180;return R*Math.hypot((a[0]-b[0])*r,(a[1]-b[1])*r*Math.cos(a[0]*r))};
async function phone(w,h,o={}){const ctx={isMobile:!!o.touch,hasTouch:!!o.touch,deviceScaleFactor:o.touch?2:1};if(o.geo){ctx.geolocation=o.geo;ctx.permissions=['geolocation']}
  const s=await openSite(BASE,DIST,{width:w,height:h},ctx);if(!o.geo)await s.ctx.addInitScript(DENY);return s}

// ---- 1-3. first load on a 375x812 phone (location blocked, as Tim tested) and with a GPS fix
for(const [w,h,touch] of [[375,812,false],[375,812,true],[360,760,true]]){const {b,p,errs,open}=await phone(w,h,{touch});await open(LINK);await p.waitForTimeout(1500);
  const g=await geom(p),mid=(g.top+24+g.sheet-24)/2;
  ok(`${w}x${h}${touch?' touch':''}: first load, the target is in the visible map, centred between the search bar and the sheet`,g.ty>g.top+20&&g.ty<g.sheet-20&&Math.abs(g.ty-mid)<12,JSON.stringify({ty:Math.round(g.ty),top:Math.round(g.top),sheet:Math.round(g.sheet),mid:Math.round(mid)}));
  ok(`${w}x${h}: the sheet stays compact (≤280 px, about a third of the screen) even with the location note`,g.sh<=280&&g.sh/g.H<=0.37,Math.round(g.sh)+' px, '+Math.round(100*g.sh/g.H)+'%');
  const note=await p.evaluate(()=>{const e=document.getElementById('fldgps'),t=document.getElementById('fldgpst'),r=e.getBoundingClientRect();return {vis:!e.hidden&&r.height>0,h:r.height,txt:t.textContent,one:t.scrollHeight<=t.clientHeight+2&&r.height<=64}});
  ok(`${w}x${h}: the location note is one short line`,note.vis&&note.one&&note.txt.length<=24,JSON.stringify(note));
  ok(`${w}x${h}: no compass offer without a location fix`,await p.evaluate(()=>document.getElementById('fldcmp').hidden));
  const z=await p.evaluate(()=>{const c=document.querySelector('.leaflet-control-zoom'),a=c&&c.querySelectorAll('a'),r=c&&c.getBoundingClientRect(),tb=document.getElementById('titlebox').getBoundingClientRect(),f=document.getElementById('fld').getBoundingClientRect();
    return c?{vis:getComputedStyle(c).display!=='none'&&r.width>0,bw:a[0].getBoundingClientRect().width,bh:a[0].getBoundingClientRect().height,clearTop:r.top>=tb.bottom,clearSheet:r.bottom<=f.top,right:r.right<=innerWidth}:null});
  ok(`${w}x${h}: zoom buttons visible, 56 px, clear of the search bar and the sheet`,!!z&&z.vis&&z.bw>=56&&z.bh>=56&&z.clearTop&&z.clearSheet&&z.right,JSON.stringify(z));
  ok(`${w}x${h}: the target is not under the zoom buttons`,await p.evaluate(()=>{const z=document.querySelector('.leaflet-control-zoom').getBoundingClientRect(),t=document.querySelector('.fldtgt').getBoundingClientRect();return t.right<z.left||t.left>z.right||t.bottom<z.top||t.top>z.bottom}));
  const z0=await p.evaluate(()=>window.__lens.map.getZoom());await p.click('.leaflet-control-zoom-in');await p.waitForTimeout(700);
  ok(`${w}x${h}: + zooms in`,(await p.evaluate(()=>window.__lens.map.getZoom()))>z0);
  await p.click('#fldgpsx');await p.waitForTimeout(400);{const g2=await geom(p);ok(`${w}x${h}: ✕ hides the note, the sheet shrinks and the target stays centred`,await p.evaluate(()=>document.getElementById('fldgps').hidden)&&g2.sh<g.sh&&Math.abs(g2.ty-(g2.top+24+g2.sheet-24)/2)<12,JSON.stringify([Math.round(g.sh),Math.round(g2.sh)]))}
  ok(`${w}x${h}: lens centre (l=) is on the target`,dm(g.lens,T)<5&&g.hl.length===2&&dm(g.hl,T)<5,JSON.stringify(g.hl));
  ok(`${w}x${h}: no JS errors`,errs.length===0,errs.join(' | ').slice(0,200));await b.close()}
{const {b,p,errs,open}=await phone(375,812,{touch:true,geo:{latitude:51.1755,longitude:-1.8318,accuracy:6}});await open(LINK);await p.waitForTimeout(2500);
  ok('375x812 with GPS: the target ring is clear of the zoom buttons',await p.evaluate(()=>{const z=document.querySelector('.leaflet-control-zoom').getBoundingClientRect(),t=document.querySelector('.fldtgt').getBoundingClientRect();return t.right<z.left||t.left>z.right||t.bottom<z.top||t.top>z.bottom}));
  const g=await geom(p),me=await p.evaluate(()=>{const r=document.querySelector('.fldme').getBoundingClientRect();return r.top+r.height/2});
  ok('375x812 with GPS: you and the target both in the visible map above the sheet',g.ty>g.top&&g.ty<g.sheet&&me>g.top&&me<g.sheet,JSON.stringify({ty:Math.round(g.ty),me:Math.round(me),sheet:Math.round(g.sheet)}));
  // compass state survives What is it? (only the Use compass button asks)
  const c0=await p.evaluate(()=>window.__field.state().compass);await p.click('#fldwi');await p.waitForTimeout(2500);await p.evaluate(()=>{const x=document.querySelector('#card .x');x&&x.click()});await p.waitForTimeout(500);
  const c1=await p.evaluate(()=>window.__field.state().compass);ok('compass state unchanged by opening and closing What is it?',c0===c1,c0+' -> '+c1);
  ok('no JS errors (GPS)',errs.length===0,errs.join(' | ').slice(0,200));await b.close()}

// ---- 5. lens centre stays on the target through resizes; without a target it is the centre of the visible map
{const {b,p,errs,open}=await openSite(BASE,DIST,{width:1280,height:800});await p.addInitScript(DENY);await open(LINK);await p.waitForTimeout(1200);
  let g=await geom(p);ok('desktop first load: lens centre and l= on the target',dm(g.lens,T)<5&&dm(g.hl,T)<5,JSON.stringify([g.lens,g.hl]));
  for(const [w,h] of [[900,700],[375,812],[1280,800]]){await p.setViewportSize({width:w,height:h});await p.waitForTimeout(1500);g=await geom(p);
    ok(`resized to ${w}x${h}: lens centre and l= still on the target`,dm(g.lens,T)<5&&dm(g.hl,T)<5,JSON.stringify([Math.round(dm(g.lens,T)),Math.round(dm(g.hl,T))]))}
  await p.evaluate(()=>window.__field.clearTarget());await p.evaluate(()=>window.__lens.map.panBy([200,100],{animate:false}));await p.waitForTimeout(800);
  {const r=await p.evaluate(()=>{const lc=window.__lens.lensState().c,q=window.__field.pad(),s=window.__lens.map.getSize();return {lc,cx:(q.tl[0]+s.x-q.br[0])/2,cy:(q.tl[1]+s.y-q.br[1])/2}});
   ok('no target: the lens follows the centre of the visible map',Math.abs(r.lc[0]-r.cx)<3&&Math.abs(r.lc[1]-r.cy)<3,JSON.stringify(r))}
  // ---- 6. view switch
  const st=()=>p.evaluate(()=>new Promise(r=>{window.__lens.saveHashSoon();setTimeout(()=>r({mode:document.getElementById('mode').value,fs:document.getElementById('fs').checked,hist:document.getElementById('hist').value,fold:document.body.classList.contains('fold'),
    h:Object.fromEntries((location.hash.slice(1).split('&')).map(kv=>kv.split('=')).filter(a=>['mode','fs','hist'].includes(a[0])))}),1200)}));
  await p.click('#fldviews button[data-v=vat]');let s=await st();ok('VAT: mode 10, full screen, no old map',s.mode==='10'&&s.fs&&!s.hist&&!s.fold&&s.h.fs==='1',JSON.stringify(s));
  await p.click('#fldviews button[data-v=old]');s=await st();ok('Old map: shows the old map and puts the LiDAR away, without turning full screen off or changing the visualisation',s.hist&&s.fold&&s.fs&&s.mode==='10'&&s.h.fs==='1'&&s.h.hist===s.hist,JSON.stringify(s));
  ok('Old map: LiDAR canvas and lens hidden',await p.evaluate(()=>getComputedStyle(document.getElementById('gl')).display==='none'));
  await p.click('#fldviews button[data-v=hs]');s=await st();ok('back to Hillshade: full-screen LiDAR, old map off, link updated',s.mode==='0'&&s.fs&&!s.hist&&!s.fold&&s.h.mode==='0'&&s.h.fs==='1'&&!s.h.hist,JSON.stringify(s));
  await p.click('#fldviews button[data-v=old]');await p.click('#fldviews button[data-v=vat]');s=await st();ok('Old map then VAT: full-screen VAT again',s.mode==='10'&&s.fs&&!s.hist&&!s.fold,JSON.stringify(s));
  ok('no JS errors (desktop)',errs.length===0,errs.join(' | ').slice(0,200));await b.close()}

// ---- home screen: manifest shortcut and the field app
if(DIST){const rd=f=>JSON.parse(fs.readFileSync(path.join(DIST,f),'utf8'));let m,fm;try{m=rd('site.webmanifest');fm=rd('field.webmanifest')}catch(e){}
  ok('site.webmanifest is valid JSON, start_url unchanged (./)',!!m&&m.start_url==='./'&&m.display==='standalone');
  const sc=m&&m.shortcuts&&m.shortcuts[0];
  ok('it has a "LiDAR Field" / "Field" shortcut to ./?ui=field',!!sc&&sc.name==='LiDAR Field'&&sc.short_name==='Field'&&sc.url==='./?ui=field',JSON.stringify(sc));
  const png=f=>{try{const b=fs.readFileSync(path.join(DIST,f));return b.readUInt32BE(16)+'x'+b.readUInt32BE(20)}catch(e){return 'missing'}};
  ok('shortcut icons exist at 96 and 192 px',!!sc&&sc.icons.every(i=>png(i.src)===i.sizes)&&sc.icons.map(i=>i.sizes).join()==='96x96,192x192',sc&&sc.icons.map(i=>i.src+' '+png(i.src)).join());
  ok('field.webmanifest: LiDAR Field app, start_url ./?ui=field, its own id, icons present',!!fm&&fm.name==='LiDAR Field'&&fm.short_name==='Field'&&fm.start_url==='./?ui=field'&&fm.id==='./?ui=field'&&fm.icons.every(i=>png(i.src)===i.sizes));
  ok('field apple-touch-icon is 180 px',png('field-apple-touch-icon.png')==='180x180')}
{const {b,p,errs,open}=await openSite(BASE,DIST,{width:390,height:844},{isMobile:true,hasTouch:true});await p.addInitScript(DENY);
  await p.goto(BASE+'?ui=field',{waitUntil:'load'});await p.waitForFunction(()=>window.__field&&document.getElementById('loading').hidden,null,{timeout:60000}).catch(()=>{});await p.waitForTimeout(1500);
  ok('the shortcut URL ./?ui=field (no hash, fresh device) opens field mode',await p.evaluate(()=>window.__field.on()));
  const hs=await p.evaluate(()=>({man:document.querySelector('link[rel=manifest]').getAttribute('href'),ati:document.querySelector('link[rel=apple-touch-icon]').getAttribute('href'),title:(document.querySelector('meta[name=apple-mobile-web-app-title]')||{}).content,url:location.search}));
  ok('in field mode the page offers the field app: field.webmanifest, field icon, title, ?ui=field kept in the address (iOS uses the address)',hs.man==='field.webmanifest'&&hs.ati==='field-apple-touch-icon.png'&&hs.title==='LiDAR Field'&&/[?&]ui=field/.test(hs.url),JSON.stringify(hs));
  const mf=await p.evaluate(async()=>{const r=await fetch(document.querySelector('link[rel=manifest]').href);return {ok:r.ok,ct:r.headers.get('content-type'),j:await r.json().then(j=>j.start_url,()=>null)}});
  ok('the field manifest is served and parses',mf.ok&&mf.j==='./?ui=field',JSON.stringify(mf));
  await p.click('#fieldsw button[data-ui=research]');await p.waitForTimeout(800);
  const hs2=await p.evaluate(()=>({man:document.querySelector('link[rel=manifest]').getAttribute('href'),ati:document.querySelector('link[rel=apple-touch-icon]').getAttribute('href'),title:!!document.querySelector('meta[name=apple-mobile-web-app-title]'),url:location.search}));
  ok('switching to Lab puts back the main manifest and icon, and drops ?ui=field',hs2.man==='site.webmanifest'&&hs2.ati==='apple-touch-icon.png'&&!hs2.title&&!/ui=field/.test(hs2.url),JSON.stringify(hs2));
  await p.reload();await p.waitForFunction(()=>window.__field&&document.getElementById('loading').hidden,null,{timeout:60000}).catch(()=>{});await p.waitForTimeout(1000);
  ok('and stays in Lab on reload',!(await p.evaluate(()=>window.__field.on())));
  ok('no JS errors (home screen)',errs.length===0,errs.join(' | ').slice(0,200));await b.close()}
{const {b,p,open}=await openSite(BASE,DIST,{width:1300,height:900});await open('#c=51.1789%2C-1.8262%2C16');
  ok('Lab page (main app) keeps site.webmanifest and its own address',await p.evaluate(()=>document.querySelector('link[rel=manifest]').getAttribute('href')==='site.webmanifest'&&!location.search));await b.close()}
console.log(pass+' passed, '+fail+' failed');process.exit(fail?1:0);
