// Release 6 (11 Nov 2026): field mode's fourth view button "Aerial" (the aerial photo with no LiDAR over it), the four view
// buttons sharing one row, a clear gap between "Controls" and the Field / Lab switch in every layout, and the phone search
// results sitting over the big zoom buttons. Usage (from tests/): node field3.test.mjs <site URL> [dist folder]
import {openSite} from './open.mjs';
const BASE=(process.argv[2]||'').replace(/\/?$/,'/');if(!/^https?:/.test(BASE)){console.error('give the site URL');process.exit(2)}
const DIST=process.argv[3];let pass=0,fail=0;const ok=(n,c,i='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(i?' '+i:''))};
const LINK='#c=51.17886%2C-1.82623%2C16&l=51.17886%2C-1.82623&ui=field&tgt=51.178860,-1.826230';
const DENY=()=>{const deny=(ok,err)=>{setTimeout(()=>err&&err({code:1,message:'denied'}),300);return 1};navigator.geolocation.watchPosition=deny;navigator.geolocation.getCurrentPosition=deny;navigator.geolocation.clearWatch=()=>{}};
async function page(w,h,touch){const s=await openSite(BASE,DIST,{width:w,height:h},touch?{isMobile:true,hasTouch:true,deviceScaleFactor:2}:{});await s.ctx.addInitScript(DENY);return s}
const box=(p,sel)=>p.evaluate(s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return r.width?{l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height}:null},sel);
const apart=(a,b,m)=>!a||!b||a.r+m<=b.l||b.r+m<=a.l||a.b+m<=b.t||b.b+m<=a.t;
const st=p=>p.evaluate(()=>({fold:document.body.classList.contains('fold'),gl:getComputedStyle(document.getElementById('gl')).display,hist:document.getElementById('hist').value,
  mode:document.getElementById('mode').value,fs:document.getElementById('fs').checked,on:[...document.querySelectorAll('#fldviews button[aria-pressed=true]')].map(b=>b.dataset.v)}));

// ---- 1. four view buttons, Aerial among them
for(const [w,h,touch] of [[360,760,1],[375,812,1],[1280,800,0]]){const {b,p,errs,open}=await page(w,h,touch);await open(LINK);await p.waitForTimeout(1500);
  const g=await p.evaluate(()=>[...document.querySelectorAll('#fldviews button')].map(e=>{const r=e.getBoundingClientRect();return {v:e.dataset.v,t:e.textContent.trim(),top:Math.round(r.top),h:r.height,w:r.width,fits:e.scrollWidth<=e.clientWidth+1}}));
  ok(w+'x'+h+': four view buttons, Aerial last',g.map(x=>x.t).join(',')==='Hillshade,VAT,Old map,Aerial',g.map(x=>x.t).join(','));
  ok(w+'x'+h+': all four in one row',new Set(g.map(x=>x.top)).size===1);
  ok(w+'x'+h+': each at least 48 px tall and 70 px wide',g.every(x=>x.h>=48&&x.w>=70),g.map(x=>Math.round(x.w)+'x'+Math.round(x.h)).join(' '));
  ok(w+'x'+h+': no label clipped',g.every(x=>x.fits));
  ok(w+'x'+h+': the row stays inside the sheet',await p.evaluate(()=>{const r=document.getElementById('fldviews').getBoundingClientRect(),f=document.getElementById('fld').getBoundingClientRect();return r.left>=f.left&&r.right<=f.right+0.5}));
  await p.click('#fldviews button[data-v=air]');await p.waitForTimeout(700);let s=await st(p);
  ok(w+'x'+h+': Aerial puts the LiDAR away and shows no old map',s.fold&&s.gl==='none'&&s.hist===''&&s.on.join()==='air',JSON.stringify(s));
  ok(w+'x'+h+': Aerial shows the aerial base layer',await p.evaluate(()=>[...document.querySelectorAll('.leaflet-tile-pane img.leaflet-tile-loaded')].some(i=>/arcgis|World_Imagery|esri/i.test(i.src))));
  ok(w+'x'+h+': Aerial keeps full screen and the visualisation for coming back',s.fs&&s.mode==='0');
  if(w===375){await p.reload();await p.waitForTimeout(1800);s=await st(p);ok('Aerial is remembered on reload',s.fold&&s.hist===''&&s.on.join()==='air',JSON.stringify(s))}
  await p.click('#fldviews button[data-v=old]');await p.waitForTimeout(700);s=await st(p);ok(w+'x'+h+': Old map after Aerial shows the old map',s.fold&&s.hist!=='');
  await p.click('#fldviews button[data-v=air]');await p.waitForTimeout(700);s=await st(p);ok(w+'x'+h+': Aerial after Old map clears the old map',s.fold&&s.hist==='');
  await p.click('#fldviews button[data-v=vat]');await p.waitForTimeout(900);s=await st(p);ok(w+'x'+h+': VAT after Aerial brings the LiDAR back',!s.fold&&s.gl!=='none'&&s.mode==='10'&&s.fs,JSON.stringify(s));
  await p.click('#fldviews button[data-v=hs]');await p.waitForTimeout(600);
  if(w===375){await p.screenshot({path:'/tmp/field3_375.png'})}
  ok(w+'x'+h+': no JS errors',errs.length===0,errs.join(' | ').slice(0,200));await b.close()}
// leaving field mode from Aerial gives the Lab back with its LiDAR
{const {b,p,errs,open}=await page(1280,800,0);await open(LINK);await p.waitForTimeout(1500);await p.click('#fldviews button[data-v=air]');await p.waitForTimeout(500);
  await p.click('#fieldsw button[data-ui=research]');await p.waitForTimeout(900);
  ok('Lab after Aerial: LiDAR back, no fold',await p.evaluate(()=>!document.body.classList.contains('fold')&&getComputedStyle(document.getElementById('gl')).display!=='none'));
  ok('no JS errors (Lab after Aerial)',errs.length===0,errs.join(' | ').slice(0,200));await b.close()}

// ---- 2. the gap after "Controls"
for(const [w,h,touch,opn] of [[1280,800,0],[1000,700,0],[1440,900,0],[1024,768,1],[768,1024,1],[812,375,1,1],[740,360,1],[667,375,1],[375,812,1],[360,760,1],[375,812,1,1]]){
  const {b,p,errs,open}=await page(w,h,touch);await open('#c=51.17886%2C-1.82623%2C16&ui=research');await p.waitForTimeout(1500);
  if(opn&&await p.evaluate(()=>document.getElementById('panel').classList.contains('hide'))){await p.click('#toggle');await p.waitForTimeout(700)}
  const sw=await box(p,'#fieldsw'),h1=await box(p,'#panel .ph h1'),tg=await box(p,'#toggle'),hp=await box(p,'#helpbtn'),inPh=await p.evaluate(()=>!!document.querySelector('#panel .ph #fieldsw'));
  const tag=w+'x'+h+(opn?' panel open':'');
  if(inPh){ok(tag+': at least 12 px between "Controls" and the switch',sw.l-h1.r>=12,'gap '+Math.round(sw.l-h1.r));ok(tag+': switch clear of the ? button',sw.r<=hp.l)}
  else ok(tag+': floating switch at least 8 px clear of the Controls button',apart(sw,tg,8),JSON.stringify({sw,tg}));
  if(!inPh&&opn)ok(tag+': floating switch not over the open panel',apart(sw,await box(p,'#panel'),0));
  ok(tag+': switch inside the screen',sw&&sw.l>=0&&sw.r<=w&&sw.b<=h);
  ok(tag+': no JS errors',errs.length===0,errs.join(' | ').slice(0,200));await b.close()}

// ---- 3. phone search results over the zoom buttons
for(const [w,h] of [[360,760],[375,812]]){const {b,p,errs,open}=await page(w,h,1);await open(LINK);await p.waitForTimeout(1500);
  await p.evaluate(()=>{const g=document.getElementById('gores');g.innerHTML='';for(const t of ['County Durham, North East, England, United Kingdom','Durham, County Durham, North East, England, DH1 3NG, United Kingdom','Durham Street, Eastcott, South Swindon, Swindon, England'])
    {const d=document.createElement('div');d.textContent=t;g.appendChild(d)}});await p.waitForTimeout(200);
  const zr=await box(p,'.leaflet-control-zoom');
  const r=await p.evaluate(()=>[...document.querySelectorAll('#gores div')].map(d=>{const r=d.getBoundingClientRect(),e=document.elementFromPoint(r.right-12,r.top+r.height/2);return d.contains(e)}));
  ok(w+'x'+h+': the results list overlaps where the zoom buttons are (the case being tested)',await p.evaluate(z=>{const g=document.getElementById('gores').getBoundingClientRect();return g.bottom>z.t&&g.right>z.l},zr));
  ok(w+'x'+h+': every result is on top and tappable at its right-hand end',r.length===3&&r.every(Boolean),JSON.stringify(r));
  await p.evaluate(()=>{document.getElementById('gores').innerHTML=''});await p.waitForTimeout(200);
  ok(w+'x'+h+': with the list closed the zoom buttons are tappable',await p.evaluate(()=>{const a=document.querySelector('.leaflet-control-zoom-in'),r=a.getBoundingClientRect();return a.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))}));
  ok(w+'x'+h+': no JS errors (search)',errs.length===0,errs.join(' | ').slice(0,200));await b.close()}
console.log(pass+' passed, '+fail+' failed');process.exit(fail?1:0);
