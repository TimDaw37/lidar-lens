// LiDAR Lens: field mode. A stripped-down screen for taking out when looking for a monument: three views (hillshade,
// Combined VAT, the old OS map), a big What is it? button, a target you are looking for (tap the map or search for it),
// your GPS position, and the distance and direction from you to the target in large text, kept in view together.
// Field / Research is a flip-flop switch, remembered on the device (localStorage) and carried in links (ui=field, tgt=).
// Built as a separate deferred script (assets/field.<hash>.js), so research mode is unchanged.
(function(){
const LZ=window.__lens;if(!LZ||!LZ.map||!LZ.S)return;
const map=LZ.map,S=LZ.S,$=id=>document.getElementById(id),KEY='lidarlens.field.v1',D2R=Math.PI/180;
const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(e){return {}}};
const store=o=>{try{localStorage.setItem(KEY,JSON.stringify(Object.assign(load(),o)))}catch(e){}};
const histIds=[...($('hist')?$('hist').options:[])].map(o=>o.value).filter(Boolean);
const VIEWS={hs:{label:'Hillshade',title:'Hillshade (single sun), the LiDAR over the whole screen',mode:0},
  vat:{label:'VAT',title:'Combined VAT (Kokalj and Somrak), the LiDAR over the whole screen',mode:10},
  old:{label:'Old map',title:'The old Ordnance Survey map (six-inch, 1888–1913) over the aerial photo',old:true}};
if(!histIds.length)delete VIEWS.old;
const PTS=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];

const CSS=
'body.field #panel,body.field #toggle,body.field #modes,body.field #where,body.field #prof,body.field #mcard,body.field #vfh,body.field #titlebox h1,body.field #titlebox .sub,body.field #titlebox .xlinks,'+
'body.field #myloc,body.field #gps,body.field #goto button[type=submit],body.field .leaflet-control-layers,body.field #lens .g,body.field #lens .h,body.field #fieldgo{display:none!important}'+
'body.field.fold #lens,body.field.fold #gl{display:none!important}'+
'body.field #titlebox{width:min(460px,calc(100vw - 20px));box-sizing:border-box;padding:8px;border-radius:12px}'+
'body.field #goto{display:flex!important;gap:8px;align-items:stretch;margin:0;width:100%}'+
'body.field #gotoq{flex:1;min-width:0;width:auto!important;font-size:18px!important;min-height:56px!important;height:56px;box-sizing:border-box;padding:0 12px!important;border:2px solid #111!important;border-radius:10px!important;background:#fff;color:#111}'+
'body.field #gores{font-size:17px}body.field #gores>div{min-height:48px;display:flex;align-items:center;padding:4px 6px;border-bottom:1px solid #ddd}'+
'body.field #card{font-size:16px}body.field #card .x{display:flex;align-items:center;justify-content:center;width:56px;height:56px;font-size:34px;top:0;right:0}'+
'#fieldsw{display:inline-flex;border:2px solid #111;border-radius:10px;overflow:hidden;flex:none;background:#fff}'+
'#fieldsw button{margin:0;width:auto;min-width:70px;padding:0 10px;border:0;border-radius:0;background:#fff;color:#111;font:700 15px system-ui,sans-serif;cursor:pointer;min-height:40px}'+
'#fieldsw button[aria-pressed=true]{background:#111;color:#fff}'+
'body.field #fieldsw button{min-height:52px;font-size:16px;min-width:76px}'+
'#fldbig{flex-wrap:wrap;row-gap:0}'+
'#fldbig.nodeg #flddir small{display:none}@media (max-width:440px){#fldbig{font-size:34px}#fld #fldclr{min-width:92px;padding:0 10px}}'+
'@media (max-width:390px){#flddir small{display:none}#fldbig{font-size:32px;gap:8px}#fldbig small{font-size:18px}#fldarr{width:34px;height:34px}#fld #fldclr{min-width:84px;padding:0 8px}#fld button{font-size:16px;padding:0 4px;white-space:nowrap}#fld .row button svg,#fld .ico{display:none}}'+
'body.field #fieldsw{flex:0 0 auto!important}body.field #goto #fieldsw button{position:static!important;top:auto!important;height:auto!important;min-height:52px!important;border-radius:0!important;padding:0 10px!important;font-size:16px!important}'+
'.ph #fieldsw{margin-left:auto;margin-right:8px}'+
'#fieldgo{display:none;position:absolute;z-index:1001;right:10px;top:var(--fgtop,100px)}#fieldgo #fieldsw{box-shadow:0 2px 6px rgba(0,0,0,.4)}#fieldgo #fieldsw button{min-height:48px}'+
'@media (max-width:700px),(max-height:500px) and (pointer:coarse){#fieldgo{display:block}}'+
'#fld{position:absolute;z-index:1500;left:0;right:0;bottom:0;padding:10px 10px calc(10px + env(safe-area-inset-bottom));box-sizing:border-box;background:rgba(17,17,17,.95);color:#fff;font:16px system-ui,sans-serif;border-radius:14px 14px 0 0;box-shadow:0 -2px 12px rgba(0,0,0,.5)}'+
'#fld[hidden]{display:none}'+
'@media (min-width:701px){#fld{left:10px;right:auto;bottom:10px;width:440px;border-radius:14px}}'+
'#fld .row{display:flex;gap:8px;margin-top:8px}#fld button{flex:1;margin:0;width:auto;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:56px;font:700 18px system-ui,sans-serif;border:2px solid #fff;border-radius:10px;background:#fff;color:#111;cursor:pointer;padding:0 6px}'+
'#fld button.on,#fld button[aria-pressed=true]{background:#f59e0b;border-color:#f59e0b;color:#111}'+
'#fld #fldwi{flex:1.6;background:#facc15;border-color:#facc15;font-size:20px}#fld #fldwi.on{background:#f59e0b;border-color:#f59e0b}'+
'#fldread{display:flex;align-items:center;gap:10px;min-height:64px}#fldread .t{flex:1;min-width:0}'+
'#fldbig{display:flex;align-items:center;gap:10px;font-weight:800;font-size:38px;line-height:1.05;font-variant-numeric:tabular-nums;white-space:nowrap}'+
'#fldbig small{font-size:22px;font-weight:700}#fldarr{width:40px;height:40px;flex:none;transition:transform .3s}#fldarr.cmp{transition:none}'+
'#fldsub{font-size:15px;color:#e5e7eb;margin-top:3px;line-height:1.3}#fldsub b{color:#fff}'+
'#fld #fldclr{flex:none;width:auto;min-width:104px;padding:0 12px;background:transparent;color:#fff;border:2px solid #fff;font-size:18px}'+
'#fld #flddone{display:flex;width:100%;margin-top:8px;min-height:64px;font-size:20px;background:#16a34a;border-color:#16a34a;color:#fff}'+
'#fld [hidden],#fld[hidden]{display:none!important}'+
'#fldcmp{display:flex;align-items:center;gap:10px;margin-top:8px;font-size:15px;line-height:1.3}#fldcmp span{flex:1}#fld #fldcmpb{flex:none;width:auto;padding:0 14px}'+
'#fldgps{margin-top:8px;padding:8px 10px;border:2px solid #f59e0b;border-radius:10px;font-size:15px;line-height:1.35;display:flex;gap:10px;align-items:center}#fldgps[hidden]{display:none}#fldgps span{flex:1}#fld #fldretry{flex:none;width:96px}'+
'.fldtgt{width:44px!important;height:44px!important;margin:-22px 0 0 -22px!important;border-radius:50%;border:4px solid #dc2626;box-shadow:0 0 0 3px #fff,0 0 8px rgba(0,0,0,.6);box-sizing:border-box;background:transparent}'+
'.fldtgt::before,.fldtgt::after{content:"";position:absolute;background:#dc2626;left:50%;top:50%;transform:translate(-50%,-50%)}.fldtgt::before{width:4px;height:60px}.fldtgt::after{width:60px;height:4px}'+
'.fldme{width:22px!important;height:22px!important;margin:-11px 0 0 -11px!important;border-radius:50%;background:#2563eb;border:4px solid #fff;box-shadow:0 0 6px rgba(0,0,0,.6);box-sizing:border-box}';
if(!$('fieldcss')){const st=document.createElement('style');st.id='fieldcss';st.textContent=CSS;document.head.appendChild(st)}

// ---- the Field / Research switch: in the panel header on a desktop, floating under the search bar on a phone,
// and in the search bar while in field mode ----
const sw=document.createElement('div');sw.id='fieldsw';sw.setAttribute('role','group');sw.setAttribute('aria-label','Field or Lab mode');
sw.innerHTML='<button type="button" data-ui="field" title="Field mode: a simple screen for finding a monument outdoors, with your GPS position and a target">Field</button><button type="button" data-ui="research" title="Lab: the full research view, with all the visualisations and tools">Lab</button>';
const go=document.createElement('div');go.id='fieldgo';document.body.appendChild(go);
const ph=document.querySelector('#panel .ph');
function placeSwitch(){const f=on;if(f){const g=$('goto');if(g&&sw.parentNode!==g)g.appendChild(sw)}
  else if(matchMedia('(max-width:700px),(max-height:500px) and (pointer:coarse)').matches||!ph){if(sw.parentNode!==go)go.appendChild(sw);const tb=$('titlebox');if(tb){const r=tb.getBoundingClientRect();go.style.setProperty('--fgtop',Math.round(r.bottom+10)+'px')}}
  else if(sw.parentNode!==ph)ph.insertBefore(sw,$('helpbtn'));
  sw.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.ui==='field')===f)))}
sw.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;setField(b.dataset.ui==='field',true)});

// ---- the bottom sheet ----
const fld=document.createElement('div');fld.id='fld';fld.hidden=true;fld.setAttribute('role','region');fld.setAttribute('aria-label','Field mode');
fld.innerHTML='<div id="fldread"><div class="t" aria-live="polite"><div id="fldbig"></div><div id="fldsub"></div></div><button id="fldclr" type="button" title="Done: clear the target and leave the map as it is, to look at the LiDAR" hidden>&#x2713; Done</button></div>'+
  '<button id="flddone" type="button" title="Clear the target and leave the map as it is, to look at the LiDAR" hidden>&#x2713; Done: clear target</button>'+
  '<div id="fldcmp" hidden><span>Turn the arrow with your phone, so it points the way to go.</span><button id="fldcmpb" type="button">Use compass</button></div><div id="fldgps" hidden><span id="fldgpst"></span><button id="fldretry" type="button">Retry</button></div>'+
  '<div class="row" id="fldviews" role="group" aria-label="View">'+Object.entries(VIEWS).map(([k,v])=>'<button type="button" data-v="'+k+'" title="'+v.title+'">'+v.label+'</button>').join('')+'</div>'+
  '<div class="row"><button id="fldtgt" type="button" title="Set the target: tap this, then tap the map (or search for a place above)"><span class="ico">&#x25CE;</span> Target</button>'+
  '<button id="fldfit" type="button" title="Recentre: show you and the target together, and keep following"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" style="vertical-align:-4px"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5" stroke="currentColor" stroke-width="2.5"/></svg> Recentre</button>'+
  '<button id="fldwi" type="button" title="What is it? Records and a best guess for the target (or where you are)">What is it?</button></div>';
document.body.appendChild(fld);
L.DomEvent.disableClickPropagation(fld);L.DomEvent.disableScrollPropagation(fld);

// ---- state ----
let on=false,view='hs',target=null,me=null,acc=null,gpsState='off',watch=null,follow=true,picking=false,tgtMk=null,meMk=null,accMk=null,prog=0;
{const s=load();if(s.view&&VIEWS[s.view])view=s.view;if(s.target&&isFinite(s.target.lat)&&isFinite(s.target.lng))target=s.target}
const H0=LZ.H0||{};
if(H0.tgt){const m=String(H0.tgt).match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);if(m){target={lat:+m[1],lng:+m[2],label:''};store({target})}}

// ---- maths ----
function distBear(a,b){const R=6371008.8,p1=a.lat*D2R,p2=b.lat*D2R,dp=p2-p1,dl=(b.lng-a.lng)*D2R;
  const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2,d=2*R*Math.asin(Math.min(1,Math.sqrt(h)));
  const y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);return {d,b:(Math.atan2(y,x)/D2R+360)%360}}
const fmtD=d=>d<1000?Math.round(d)+' m':d<10000?(d/1000).toFixed(2)+' km':Math.round(d/1000)+' km';
const gr=ll=>{try{const o=LZ.osgb;if(!o)return '';const en=o.ll2en(ll.lat,ll.lng);return o.gridRef(en[0],en[1],10)}catch(e){return ''}};
const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// ---- view: hillshade / VAT over the whole screen, or the old map with the LiDAR put away ----
function selVal(id,v,ev){const e=$(id);if(!e)return;if(String(e.value)!==String(v)){e.value=String(v);e.dispatchEvent(new Event(ev||'change',{bubbles:true}))}}
function setChk(id,v){const e=$(id);if(e&&e.checked!==v){e.checked=v;e.dispatchEvent(new Event('change',{bubbles:true}))}}
function applyView(){const v=VIEWS[view]||VIEWS.hs;document.body.classList.toggle('fold',!!v.old);
  if(v.old){setChk('fs',false);selVal('hist',histIds[0])}else{selVal('hist','');setChk('fs',true);selVal('mode',v.mode);selVal('mode',v.mode,'input')}
  fld.querySelectorAll('#fldviews button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===view)));LZ.requestRender&&LZ.requestRender()}
function setView(k){if(!VIEWS[k])return;view=k;store({view});applyView();LZ.saveHashSoon&&LZ.saveHashSoon()}

// ---- research state kept while in field mode, put back on the way out ----
function snap(){return {mode:S.mode,fs:!!S.fs,hist:$('hist')?$('hist').value:'',base:S.base}}
function restore(r){r=r||{mode:0,fs:false,hist:''};selVal('hist',r.hist||'');setChk('fs',!!r.fs);selVal('mode',r.mode);selVal('mode',r.mode,'input')}

// ---- markers, in a pane above the LiDAR canvas (which sits over the map's own panes), as View from here does ----
const PANE='fieldPane';let pane=null,svgR=null;
function ensurePane(){if(pane)return;pane=map.createPane(PANE);const mapPane=map.getPane('mapPane');document.body.appendChild(pane);
  Object.assign(pane.style,{zIndex:'480',pointerEvents:'none',position:'fixed',margin:'0',width:'0',height:'0',overflow:'visible'});
  const sync=()=>{const r=map.getContainer().getBoundingClientRect();pane.style.left=r.left+'px';pane.style.top=r.top+'px';pane.style.transform=mapPane.style.transform||'none';pane.style.transformOrigin=mapPane.style.transformOrigin||'0 0'};
  sync();map.on('move zoom resize moveend zoomend zoomanim viewreset',sync);map.on('move zoom',()=>requestAnimationFrame(sync));svgR=L.svg({pane:PANE,padding:0.5})}
function drawMarks(){ensurePane();if(!on){[tgtMk,meMk,accMk].forEach(m=>m&&map.hasLayer(m)&&map.removeLayer(m));return}
  if(target){if(!tgtMk)tgtMk=L.marker([target.lat,target.lng],{icon:L.divIcon({className:'fldtgt',iconSize:[44,44]}),interactive:false,keyboard:false,pane:PANE});tgtMk.setLatLng([target.lat,target.lng]);if(!map.hasLayer(tgtMk))tgtMk.addTo(map)}
  else if(tgtMk&&map.hasLayer(tgtMk))map.removeLayer(tgtMk);
  if(me){if(!accMk)accMk=L.circle(me,{radius:acc||10,color:'#2563eb',weight:2,fillOpacity:.12,interactive:false,pane:PANE,renderer:svgR});accMk.setLatLng(me);accMk.setRadius(acc||10);if(!map.hasLayer(accMk))accMk.addTo(map);
    if(!meMk)meMk=L.marker(me,{icon:L.divIcon({className:'fldme',iconSize:[22,22]}),interactive:false,keyboard:false,pane:PANE});meMk.setLatLng(me);if(!map.hasLayer(meMk))meMk.addTo(map)}}

// ---- readout ----
const ARROW='<svg id="fldarr" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 3 L33 35 L20 27 L7 35 Z" fill="#facc15" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>';
const NEAR=25;   // metres: within this (or the GPS accuracy, up to 50 m) you are on target and Done is offered big and green
// ---- compass: the arrow turns with the phone (the map stays north-up); without one it points from north on the map ----
let heading=null,compass='off',curB=null,cmpT=null,cmpRaf=0,cmpL=null;
function scrAngle(){return (screen.orientation&&typeof screen.orientation.angle==='number')?screen.orientation.angle:(+window.orientation||0)}
function turnArrow(){const a=$('fldarr');if(!a||curB==null)return;const rot=heading!=null?curB-heading:curB;a.style.transform='rotate('+rot.toFixed(1)+'deg)';a.dataset.rot=(((rot%360)+360)%360).toFixed(1);a.classList.toggle('cmp',heading!=null)}
function onOri(e){let h=null;if(e.webkitCompassHeading!=null&&isFinite(e.webkitCompassHeading))h=e.webkitCompassHeading+scrAngle();   // iOS
  else if(e.alpha!=null&&(e.type==='deviceorientationabsolute'||e.absolute===true))h=360-e.alpha+scrAngle();   // Android, absolute
  if(h==null)return;h=((h%360)+360)%360;const was=heading;heading=h;if(compass!=='ok'){compass='ok';clearTimeout(cmpT)}
  if(was==null)readout();else if(!cmpRaf)cmpRaf=requestAnimationFrame(()=>{cmpRaf=0;turnArrow()})}
function cmpListen(){if(cmpL)return;cmpL=1;window.addEventListener('deviceorientationabsolute',onOri);window.addEventListener('deviceorientation',onOri);   // onOri keeps only absolute readings
  compass='wait';clearTimeout(cmpT);cmpT=setTimeout(()=>{if(compass==='wait'){compass=needAsk?'needperm':'none';needAsk=false;readout()}},3000)}
function cmpStop(){if(cmpL){window.removeEventListener('deviceorientationabsolute',onOri);window.removeEventListener('deviceorientation',onOri);cmpL=null}clearTimeout(cmpT);heading=null;if(compass!=='denied'&&compass!=='needperm')compass='off'}
// Listen first (Android sends readings straight away). If nothing comes and the browser has requestPermission (iOS), offer a button:
// iOS only shows its permission prompt from a tap.
let needAsk=false;
function cmpStart(){if(compass==='denied')return;if(typeof DeviceOrientationEvent==='undefined'){compass='none';return}
  needAsk=typeof DeviceOrientationEvent.requestPermission==='function';cmpListen()}
function cmpAsk(){if(compass!=='needperm')return;DeviceOrientationEvent.requestPermission().then(r=>{if(r==='granted'){cmpStop();needAsk=false;cmpListen()}else{compass='denied'}readout()},()=>{compass='denied';readout()})}
// keep the readout on one line: if distance, arrow and direction would wrap, drop the degrees (always on narrow phones, via CSS)
function fitDeg(big){big.classList.remove('nodeg');const k=[...big.children].filter(e=>e.offsetWidth);if(k.length>1&&k[k.length-1].offsetTop>k[0].offsetTop+4)big.classList.add('nodeg')}
function readout(){const big=$('fldbig'),sub=$('fldsub');let near=false;
  if(target&&me){const d=distBear(me,target).d;near=d<=Math.max(NEAR,Math.min(50,acc||0))}
  $('fldread').hidden=!target&&!picking;   // no target: the sheet collapses to the buttons, so the map is uncluttered
  $('fldclr').hidden=!target||near;$('flddone').hidden=!near;$('fldcmp').hidden=!(compass==='needperm'&&target);
  const gpsTxt=gpsState==='ok'?'GPS ±'+Math.round(acc)+' m':gpsState==='wait'?'Finding your position…':gpsState==='denied'?'Location blocked':gpsState==='off'?'':'No GPS fix';
  if(target&&me){const r=distBear(me,target);const pt=PTS[Math.round(r.b/22.5)%16];
    big.innerHTML='<span id="flddist">'+fmtD(r.d)+'</span>'+ARROW+'<span id="flddir">'+pt+' <small>'+String(Math.round(r.b)%360).padStart(3,'0')+'°</small></span>';curB=r.b;turnArrow();fitDeg(big);
    sub.innerHTML='to the target'+(target.label?' <b>'+esc(target.label)+'</b>':'')+' · '+gpsTxt+(near?' · <b>you are there</b>':'')+' · '+(heading!=null?'arrow follows your phone':'arrow: north-up map'+(compass==='none'||compass==='denied'?' (no compass)':''));big.dataset.d=r.d.toFixed(1);big.dataset.b=r.b.toFixed(1)}
  else if(target){big.innerHTML='<span>Target set</span>';delete big.dataset.d;
    sub.innerHTML=(target.label?'<b>'+esc(target.label)+'</b> · ':'')+esc(gr(target))+(gpsTxt?' · '+gpsTxt:'')}
  else{big.innerHTML='<span>'+(picking?'Tap the map':'No target')+'</span>';delete big.dataset.d;
    sub.innerHTML=picking?'Tap where the monument is to set the target.':'Tap <b>&#x25CE; Target</b> then the map, or search above.'+(gpsTxt?' · '+gpsTxt:'')}
  const g=$('fldgps'),gt=$('fldgpst');
  if(gpsState==='denied'||gpsState==='unavail'||gpsState==='insecure'||gpsState==='timeout'){g.hidden=false;
    gt.textContent=gpsState==='denied'?'Location is blocked, so your position can’t be shown. Allow location for this site in your browser’s site settings, then tap Retry. The map and target still work.':
      gpsState==='insecure'?'Location needs a secure (https) page or a device that supports it. The map and target still work.':
      gpsState==='timeout'?'No GPS fix yet. Try in the open with a clear view of the sky, then tap Retry.':'Your position isn’t available on this device just now. Tap Retry to try again.';
    $('fldretry').hidden=gpsState==='insecure'}else g.hidden=true;
  $('fldtgt').classList.toggle('on',picking);$('fldtgt').innerHTML=picking?'Tap map…':'<span class="ico">&#x25CE;</span> Target';$('fldfit').classList.toggle('on',!follow&&!!target);sheetH()}
function sheetH(){document.documentElement.style.setProperty('--fldh',(on?fld.offsetHeight:0)+'px')}

// ---- framing: you and the target together where sensible, following you until you move the map ----
function pad(){const mr=map.getContainer().getBoundingClientRect(),tb=$('titlebox'),fr=fld.getBoundingClientRect(),desk=fr.left>5;
  const top=(tb?tb.getBoundingClientRect().bottom-mr.top:10)+24,bot=desk?24:mr.bottom-fr.top+24,left=desk?fr.right-mr.left+24:28;return {tl:[left,top],br:[28,bot]}}
function inView(ll){const p=pad(),pt=map.latLngToContainerPoint(ll),s=map.getSize();return pt.x>=p.tl[0]&&pt.y>=p.tl[1]&&pt.x<=s.x-p.br[0]&&pt.y<=s.y-p.br[1]}
function frame(force){if(!on)return;const pts=[me,target&&L.latLng(target.lat,target.lng)].filter(Boolean);if(!pts.length)return;const p=pad();prog++;
  try{if(pts.length===2){const b=L.latLngBounds(pts),z=map.getBoundsZoom(b,false,L.point(p.tl[0]+p.br[0],p.tl[1]+p.br[1]));
      if(z<12){if(force||!inView(me))map.setView(me,15,{animate:false})}   // too far apart to see both: stay with you; the readout points the way
      else if(force||!inView(pts[0])||!inView(pts[1])||Math.min(18,z)>map.getZoom()+1)map.fitBounds(b,{paddingTopLeft:p.tl,paddingBottomRight:p.br,maxZoom:18,animate:false})}
    else if(force||!inView(pts[0]))map.setView(pts[0],Math.max(map.getZoom(),16),{animate:false})}
  finally{setTimeout(()=>prog--,50)}}
map.on('dragstart',()=>{if(on&&follow){follow=false;readout()}});

// ---- GPS ----
function gpsStart(){if(!on)return;if(watch!=null)return;if(!navigator.geolocation||!window.isSecureContext){gpsState='insecure';readout();return}
  gpsState=me?'ok':'wait';readout();
  watch=navigator.geolocation.watchPosition(p=>{const first=!me;me=L.latLng(p.coords.latitude,p.coords.longitude);acc=p.coords.accuracy;gpsState='ok';drawMarks();readout();if(follow||first)frame(first)},
    e=>{gpsState=e.code===1?'denied':e.code===3?(me?'ok':'timeout'):'unavail';if(e.code===1){gpsStop()}readout()},{enableHighAccuracy:true,maximumAge:5000,timeout:20000})}
function gpsStop(){if(watch!=null){try{navigator.geolocation.clearWatch(watch)}catch(e){}watch=null}}
$('fldretry').onclick=()=>{gpsStop();gpsState='wait';readout();gpsStart()};

// ---- target ----
function setTarget(ll,label){target={lat:+(+ll.lat).toFixed(6),lng:+(+ll.lng).toFixed(6),label:label||''};store({target});picking=false;drawMarks();readout();follow=true;frame(true);LZ.saveHashSoon&&LZ.saveHashSoon()}
$('fldtgt').onclick=()=>{picking=!picking;if(picking&&LZ.tool&&LZ.tool())LZ.setTool(null);readout()};
function clearTarget(){target=null;follow=false;picking=false;store({target:null});drawMarks();readout();LZ.saveHashSoon&&LZ.saveHashSoon()}   // and stop re-framing: the map stays where it is, with your GPS dot
$('fldcmpb').onclick=cmpAsk;fld.addEventListener('click',e=>{if(compass==='needperm'&&e.target.id!=='fldcmpb')cmpAsk()},true);   // any tap on the sheet may ask (iOS needs a tap)
$('fldclr').onclick=clearTarget;$('flddone').onclick=clearTarget;
map.on('click',e=>{if(!on||!picking)return;setTarget(e.latlng,'')});
document.addEventListener('lensgoto',e=>{if(!on||!e.detail)return;setTarget(L.latLng(e.detail.lat,e.detail.lng),e.detail.label||'')});
$('fldfit').onclick=()=>{follow=true;frame(true);readout()};
$('fldwi').onclick=()=>{picking=false;const ll=target?L.latLng(target.lat,target.lng):me;
  if(ll&&LZ.whatIs){if(LZ.tool&&LZ.tool())LZ.setTool(null);LZ.whatIs(ll)}else if(LZ.setTool){LZ.setTool(LZ.tool&&LZ.tool()==='whatis'?null:'whatis')}readout()};
fld.querySelector('#fldviews').addEventListener('click',e=>{const b=e.target.closest('button');if(b)setView(b.dataset.v)});

// ---- switching ----
function setField(f,user){f=!!f;if(f===on){if(user)store({on:f});return}
  if(f){if(user)store({research:snap()});else if(!load().research)store({research:{mode:S.mode===VIEWS.hs.mode||S.mode===10?0:S.mode,fs:false,hist:''}})}
  on=f;if(user)store({on:f});
  document.body.classList.toggle('field',on);fld.hidden=!on;picking=false;
  if(LZ.tool&&LZ.tool()&&LZ.tool()!=='whatis')LZ.setTool(null);
  if(on){const p=$('panel');if(p)p.classList.add('hide');applyView();follow=true;drawMarks();placeSwitch();cmpStart();readout();gpsStart();setTimeout(()=>{map.invalidateSize();frame(true)},60)}
  else{gpsStop();cmpStop();document.body.classList.remove('fold');drawMarks();restore(load().research);placeSwitch();sheetH();
    if(!matchMedia('(max-width:700px),(max-height:500px) and (pointer:coarse)').matches){const p=$('panel');if(p)p.classList.remove('hide')}
    setTimeout(()=>{map.invalidateSize();LZ.resetLens&&LZ.resetLens()},60)}
  LZ.saveHashSoon&&LZ.saveHashSoon();document.dispatchEvent(new CustomEvent('fieldmode',{detail:{on}}))}
window.addEventListener('resize',()=>{placeSwitch();if(on){sheetH();if(follow)frame(false)}});

// ---- links: ui=field (and tgt=lat,lng) while in field mode ----
{const prev=window.__lensHashExtra;window.__lensHashExtra=function(p){if(prev)prev(p);if(on){p.set('ui','field');if(target)p.set('tgt',target.lat.toFixed(6)+','+target.lng.toFixed(6))}}}

window.__field={on:()=>on,set:f=>setField(f,true),state:()=>({on,view,target,me:me&&{lat:me.lat,lng:me.lng},acc,gpsState,follow,picking,compass,heading}),setTarget:(lat,lng,label)=>setTarget(L.latLng(lat,lng),label),clearTarget:()=>clearTarget(),setView,frame:()=>frame(true),distBear};
const want=H0.ui==='field'?true:(H0.ui==='research'||H0.ui==='lab')?false:!!load().on;
placeSwitch();if(want)setField(true,false);
})();
