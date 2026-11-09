/* LiDAR Lens: live LiDAR visualisation of Terrarium elevation tiles inside a draggable lens.
   WebGL2 (EXT_color_buffer_float) path with a Canvas2D CPU fallback. */
(function(){
'use strict';
const LC=window.LENS_CONFIG;if(!LC)throw new Error('config.js missing (window.LENS_CONFIG)');
// The public Wiltshire worker keeps its own config.js (the county overview at zoom 9, and the long
// "fetched live" note). Fill the keys that file does not have, so a build that copies it still opens
// on Great Ridge, offers the Try links, and searches scheduled-monument names. An explicit tries list,
// a start at zoom 12 or closer, or localSearch:false in config.js is left alone.
if(/^wiltshire$/i.test(LC.areaName||'')){
  if(!LC.tries){LC.tries=[
    {text:'Great Ridge fields',lat:51.1278,lng:-2.1017,z:15},
    {text:'Avebury',lat:51.4286,lng:-1.8543,z:16},
    {text:'Stonehenge',lat:51.1789,lng:-1.8262,z:16},
    {text:'Old Sarum',lat:51.0936,lng:-1.8045,z:16}];
    if(!LC.start||!(LC.start.zoom>=12))LC.start={lat:51.1278,lng:-2.1017,zoom:15}}
  if(LC.localSearch==null)LC.localSearch='nhle_places.json'}
if(typeof LC.linksNote==='string'&&/fetched live|Rest of England/i.test(LC.linksNote))LC.linksNote='Elsewhere:';
// Live mode (LC.live): tiles and records are made on demand from public sources by live-sw.js (a service worker).
// On the first visit the worker isn't in control yet, so register it and reload once it is.
if(LC.live){if(!('serviceWorker' in navigator)){document.addEventListener('DOMContentLoaded',()=>{const m=document.getElementById('msg');if(m){m.textContent='This browser cannot run the live LiDAR (no service workers). Try a current Chrome, Edge, Firefox or Safari.';m.style.display='block'}})}
  else if(!navigator.serviceWorker.controller){navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});navigator.serviceWorker.register('live-sw.js').catch(e=>console.warn('live-sw',e))}
  else navigator.serviceWorker.register('live-sw.js').catch(()=>{})}
const CFG={tiles:LC.tiles.url,minz:LC.tiles.minzoom,maxz:LC.tiles.maxzoom,xo:LC.tiles.crossOrigin||null,bounds:LC.bounds,start:{lat:LC.start.lat,lng:LC.start.lng,z:LC.start.zoom}};
const $=id=>document.getElementById(id);
const DEF={va:false,mode:0,az:315,el:35,ve:2,rad:10,ramp:'grey',auto:true,ct:1,gm:1,op:1,ls:340,fs:false,sm:false,base:'sat'};
const MODE_RAMP={0:'grey',1:'grey',2:'greyinv',3:'rdbu',4:'grey',5:'grey',6:'rdbu',7:'rdbu',8:'grey',9:'grey',10:'grey',11:'grey'};
const MODE_RANGE={0:[0,1],1:[0.2,1],2:[0,35],3:[-0.5,0.5],4:[0.8,1],5:[0,30],6:[-0.5,0.5],7:[-0.5,0.5],8:[65,90],9:[65,90],10:[0,1],11:[-15,15]};
const DIVERGING=m=>m===3||m===6||m===7||m===11;   // centred on zero, symmetric auto-contrast
const isLRM=m=>m===3||m===6||m===7;          // local relief, red relief, LRM×hillshade
const isHeavy=m=>m===4||m===8||m===9||m===10||m===11;   // sky-view, the openness modes, openness difference and CVAT share the horizon search
// Openness difference (mode 11): (positive − negative openness)/2, after Yokoyama, Shirasawa and Pike (2002) for openness and Chiba, Kaneta
// and Suzuki (2008) for the difference (the ridge–valley index of red relief image maps). Both come from the one horizon search used by
// modes 8 and 9 (same radius, directions and steps). Degrees; positive = ridges, banks and rims, negative = ditches and hollows.
const isOD=m=>m===11;
const redRel=()=>isOD(S.mode)&&S.ramp==='redrel';   // optional: openness difference drawn with the red relief colour rule (slope as red, mode 6)
// Combined VAT (visualisation for archaeological topography; Kokalj and Somrak 2019): written here from the paper's recipe and RVT's
// published blend settings (Relief Visualization Toolbox, Apache 2.0); no RVT code is copied. VAT = hillshade, then slope (luminosity 50%), positive openness (overlay 50%),
// sky-view factor (multiply 25%); 'general' and 'flat' terrain settings, then CVAT = 50% general over flat. Fixed sun 315°, true heights.
const isCVAT=m=>m===10;
// Per-mode starting look: Combined VAT opens a touch more contrasty and darker in the mid-tones than RVT's plain 0–1 scale.
// Applied when a mode is chosen while Contrast and Gamma are still at the previous mode's starting values, so a user's own setting is kept.
const MODE_LEGEND={10:'Lighter: level or raised, open ground. Darker: steep slopes, ditches and hollows.',
  11:'Lighter: ridges, banks and rims. Darker: ditches, hollows and valleys. Mid grey: level ground or even slopes.'};
const MODE_LOOK={10:{ct:1.15,gm:1.15}};const lookOf=m=>MODE_LOOK[m]||{ct:1,gm:1};
const CVAT_R1=10,CVAT_R2=20;   // horizon radii in metres: RVT general 10 px, flat 20 px on a 1 m DTM
function phoneLike(){return matchMedia('(pointer:coarse)').matches||matchMedia('(max-width:700px)').matches}
function horizonN(){const p=phoneLike();if(R&&String(R.kind).indexOf('Canvas')===0)return p?{nd:8,ns:6}:{nd:12,ns:10};return p?{nd:8,ns:6}:{nd:16,ns:14}}
const S=Object.assign({},DEF);
let lensC=null; // lens centre in container px
// ---------- hash ----------
function readHash(){const raw=location.hash.slice(1);const out={};
  const m=raw.match(/^(?:map=)?(\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/);   // also accept #zoom/lat/lng (OSM/Leaflet-hash style links)
  if(m){out.c=m[2]+','+m[3]+','+m[1];return out}
  const h=new URLSearchParams(raw);for(const [k,v] of h){out[k]=v}
  if(!out.c&&out.lat&&(out.lng||out.lon))out.c=out.lat+','+(out.lng||out.lon)+','+(out.z||out.zoom||15);   // #lat=..&lng=..&z=..
  return out}
const H0=readHash();
window.addEventListener('hashchange',()=>location.reload());   // a link pasted into an open tab: apply its view (the app's own saveHash uses replaceState, which doesn't fire this)
['mode','az','el','ve','rad','ct','gm','op','ls'].forEach(k=>{if(H0[k]!==undefined&&!isNaN(+H0[k]))S[k]=+H0[k]});
if(H0.ct===undefined&&H0.gm===undefined){const L0=lookOf(S.mode);S.ct=L0.ct;S.gm=L0.gm}
if(H0.ramp)S.ramp=H0.ramp; else S.ramp=MODE_RAMP[S.mode];
if(H0.auto!==undefined)S.auto=H0.auto==='1'; if(H0.va!==undefined)S.va=H0.va==='1'; if(H0.fs!==undefined)S.fs=H0.fs==='1'; if(H0.sm!==undefined)S.sm=H0.sm==='1'; if(H0.base)S.base=H0.base;
const manual={}; // per-mode display range when auto contrast is off
if(H0.mlo!==undefined&&H0.mhi!==undefined&&isFinite(+H0.mlo)&&isFinite(+H0.mhi))manual[S.mode]=[+H0.mlo,+H0.mhi];
let start=CFG.start; if(H0.c){const p=H0.c.split(',').map(Number); if(p.length===3&&p.every(isFinite))start={lat:p[0],lng:p[1],z:p[2]}}
// ---------- map ----------
const map=L.map('map',{zoomControl:false,maxZoom:20,minZoom:LC.minZoom||8,zoomSnap:0.25,wheelPxPerZoomLevel:90}).setView([start.lat,start.lng],start.z);
const BASES=(LC.basemaps||[
  {id:'sat',name:'Aerial (Esri World Imagery)',url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',maxNativeZoom:19,attribution:'Imagery &copy; Esri, Maxar, Earthstar Geographics, GIS User Community'},
  {id:'otm',name:'OpenTopoMap (paths, contours)',url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',maxNativeZoom:17,attribution:'Map: &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener noreferrer">OpenTopoMap</a> (CC-BY-SA), data &copy; OpenStreetMap contributors, SRTM'},
  {id:'osm',name:'OpenStreetMap',url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',maxNativeZoom:19,attribution:'&copy; OpenStreetMap contributors'}]);
const baseLayers={},baseById={};BASES.forEach(b=>{const l=b.wms?L.tileLayer.wms(b.url,{layers:b.wms,format:'image/png',version:'1.3.0',maxZoom:20,attribution:b.attribution}):L.tileLayer(b.url,{maxZoom:20,maxNativeZoom:b.maxNativeZoom||19,attribution:b.attribution,subdomains:b.subdomains||'abc'});baseLayers[b.name]=l;baseById[b.id]=l;l._lensId=b.id});
if(!baseById[S.base])S.base=BASES[0].id;baseById[S.base].addTo(map);
map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer" title="A JavaScript library for interactive maps">Leaflet</a>');
let CUR_ATT=LC.lidarAttribution||'LiDAR: EA LiDAR Composite DTM 1 m &copy; Environment Agency (OGL)';map.attributionControl.addAttribution(CUR_ATT);
// Multi-country lens (LC.countryText {england|wales|scotland: {lidarAttribution, noLidarText, minzoom, zoomHint}}): the LiDAR credit, the
// 'no LiDAR' text and the live zoom follow the country under the map centre (LC.countryRegions, as the Layers list does)
const CT=LC.countryText||null;
function ctryPip(lat,lng,P){let ins=false;for(let i=0,j=P.length-1;i<P.length;j=i++){const a=P[i],b=P[j];if(((a[0]>lat)!==(b[0]>lat))&&(lng<(b[1]-a[1])*(lat-a[0])/(b[0]-a[0])+a[1]))ins=!ins}return ins}
function ctryName(){const ll=map.getCenter();for(const r of (LC.countryRegions||[]))if(ctryPip(ll.lat,ll.lng,r.poly))return r.c;return LC.defaultCountry||'england'}
function ctry(){return CT?(CT[ctryName()]||{}):{}}
function liveMz(){const c=ctry();return c.minzoom||(LC.live&&LC.live.minzoom)||13}
function applyCtryText(){if(!CT)return;const c=ctry(),a=c.lidarAttribution||LC.lidarAttribution;if(a&&a!==CUR_ATT){map.attributionControl.removeAttribution(CUR_ATT);map.attributionControl.addAttribution(a);CUR_ATT=a}
  const was=NO_LIDAR;NO_LIDAR=c.noLidarText||LC.noLidarText||NO_LIDAR;if(was!==NO_LIDAR&&$('msg')&&$('msg').textContent===was)msg(NO_LIDAR);document.documentElement.dataset.country=ctryName()}
if(CT){map.on('moveend',applyCtryText);setTimeout(applyCtryText,0)}if(LC.extraAttribution)map.attributionControl.addAttribution(LC.extraAttribution);
let smLayer=null;
const titleCtl=L.control({position:'topleft'});titleCtl.onAdd=()=>{const d=$('titlebox');
  // like disableClickPropagation, except a two-finger touchstart reaches the map, so a pinch on the title box zooms the map (it sits inside the map, whose touch-action:none rules out page zoom)
  L.DomEvent.on(d,'mousedown dblclick contextmenu',L.DomEvent.stopPropagation);d._leaflet_disable_click=true;
  d.addEventListener('touchstart',e=>{if(!e.touches||e.touches.length<2)e.stopPropagation()});
  L.DomEvent.disableScrollPropagation(d);return d};titleCtl.addTo(map);
L.control.zoom({position:'topleft'}).addTo(map);
const layersCtl=LC.tidyUI?null:L.control.layers(baseLayers,{},{position:'topleft'}).addTo(map);   // tidyUI: the background choice lives in the panel only (ui.js)   // ui.js adds the historic OS maps to it
map.on('baselayerchange',e=>{S.base=e.layer._lensId;saveHash()});
window.__outlineP=LC.outline?fetch(LC.outline).then(r=>r.json()):null;if(LC.outline){window.__outlineP.then(g=>L.geoJSON(g,{style:{color:'#fff',weight:1.5,dashArray:'4 4',fill:false},interactive:false}).addTo(map)).catch(()=>{})}else L.rectangle(CFG.bounds,{color:'#fff',weight:1,dashArray:'4 4',fill:false,interactive:false}).addTo(map);
// Links to sibling Lenses (config: links:[{text,href}], linksNote), under the title
if(LC.links&&LC.links.length){const tb=$('titlebox'),sub=tb&&tb.querySelector('.sub'),d=document.createElement('div');d.className='xlinks';
  if(LC.linksNote){const n=document.createElement('span');n.className='xn';n.textContent=LC.linksNote+' ';d.appendChild(n)}
  LC.links.forEach((l,i)=>{if(i)d.appendChild(document.createTextNode(' · '));const a=document.createElement('a');a.href=l.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=l.text;d.appendChild(a)});
  if(sub)sub.after(d);else if(tb)tb.querySelector('h1').after(d)}
if(LC.tries&&LC.tries.length){const tb=$('titlebox'),host=tb&&(tb.querySelector('.xlinks')||tb.querySelector('.sub')||tb.querySelector('h1')),d=document.createElement('div');d.className='tries';
  d.appendChild(document.createTextNode('Try: '));LC.tries.forEach((t,i)=>{if(i)d.appendChild(document.createTextNode(' · '));const a=document.createElement('a');a.href='#';a.textContent=t.text;a.onclick=e=>{e.preventDefault();map.setView([t.lat,t.lng],t.z||15)};d.appendChild(a)});
  if(host)host.after(d)}
document.title=LC.pageTitle||LC.title;{const h=document.querySelector('#titlebox h1'),a=document.querySelector('#titlebox .sub a');if(h)h.textContent=LC.title;if(a&&LC.link){a.textContent=LC.link.text;a.href=LC.link.href}else if(a)a.parentNode.style.display='none'}
L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
const whereCtl=L.control({position:'bottomleft'});whereCtl.onAdd=()=>{const d=$('where');L.DomEvent.disableClickPropagation(d);return d};whereCtl.addTo(map);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// LC.smLive {url,minZoom,fields}: scheduled monuments read live per view from an ArcGIS layer (e.g. HES, all of Scotland) instead of a static file
let smAb=null,smHave=null;function smLoad(){if(!S.sm||!smLayer)return;const z=map.getZoom(),mz=LC.smLive.minZoom||11;if(z<mz){smLayer.clearLayers();smHave=null;return}
  const v=map.getBounds();if(smHave&&smHave.contains(v))return;const p=v.pad(0.3);if(smAb)smAb.abort();smAb=new AbortController();const ac=smAb;
  const q=new URLSearchParams({where:'1=1',geometry:[p.getWest(),p.getSouth(),p.getEast(),p.getNorth()].join(','),geometryType:'esriGeometryEnvelope',inSR:'4326',outSR:'4326',
    spatialRel:'esriSpatialRelIntersects',outFields:LC.smLive.fields||'DES_REF,DES_TITLE,LINK',returnGeometry:'true',f:'geojson',maxAllowableOffset:String(Math.max(1e-5,40/Math.pow(2,z)))});
  fetch(LC.smLive.url+'/query?'+q,{signal:ac.signal}).then(r=>r.json()).then(g=>{if(ac.signal.aborted)return;smLayer.clearLayers();
    (g.features||[]).forEach(f=>{const pr=f.properties||{};f.properties={Name:pr.DES_TITLE||'',ListEntry:pr.DES_REF||'',hyperlink:/^https?:\/\//.test(pr.LINK||'')?pr.LINK:''}});smLayer.addData(g);smHave=p}).catch(()=>{})}
function setSM(on){if(LC.smLive){if(!smLayer){smLayer=L.geoJSON(null,{style:{color:'#ef4444',weight:2,fill:false},onEachFeature:(f,l)=>l.bindPopup('<b>'+esc(f.properties.Name)+'</b><br>'+esc(f.properties.ListEntry)+(f.properties.hyperlink?'<br><a href="'+f.properties.hyperlink+'" target="_blank" rel="noopener noreferrer">'+(LC.smLinkLabel||'Record')+'</a>':''))});map.on('moveend',smLoad)}
  if(on){smLayer.addTo(map);smLoad()}else map.removeLayer(smLayer);return}
  if(on&&!smLayer){fetch(LC.scheduledOverlay||'scheduled_monuments.geojson').then(r=>r.json()).then(g=>{smLayer=L.geoJSON(g,{style:{color:'#ef4444',weight:2,fill:false},onEachFeature:(f,l)=>l.bindPopup('<b>'+(f.properties.Name||'')+'</b><br>List entry '+(f.properties.ListEntry||'')+(f.properties.hyperlink?'<br><a href="'+f.properties.hyperlink+'" target="_blank" rel="noopener noreferrer">'+(LC.smLinkLabel||'NHLE entry')+'</a>':''))});if(S.sm)smLayer.addTo(map)})}
  else if(smLayer){on?smLayer.addTo(map):map.removeLayer(smLayer)}}
// optional place-name labels (LC.placeNames: GeoJSON points with properties.n = label, te = type); settlements from z12, other names from z14
if(LC.placeNames){const pnG=L.layerGroup().addTo(map);let pnF=[];
  const pnDraw=()=>{pnG.clearLayers();const z=map.getZoom(),b=map.getBounds().pad(0.2);if(z<12)return;
    for(const f of pnF){const p=f.properties,c=f.geometry.coordinates;if(p.te!=='Settlement'&&z<14)continue;if(!b.contains([c[1],c[0]]))continue;
      L.marker([c[1],c[0]],{interactive:false,keyboard:false,icon:L.divIcon({className:'pn'+(p.te==='Settlement'?' pns':''),html:'<span></span>',iconSize:[6,6]})})
       .bindTooltip(p.n.replace(/&/g,'&amp;').replace(/</g,'&lt;'),{permanent:true,direction:'right',offset:[4,0],className:'pnl'}).addTo(pnG)}};
  fetch(LC.placeNames).then(r=>r.json()).then(g=>{pnF=g.features;window.__placeNames=pnF;pnDraw()}).catch(()=>{});map.on('zoomend moveend',pnDraw)}
// ---------- lens element ----------
const lensEl=$('lens'), cv=$('gl');
function mapSize(){const s=map.getSize();return [s.x,s.y]}
function defaultLensC(){const [w,h]=mapSize();const tb0=$('titlebox');
  // phone held sideways: put the lens beside the title box, centred top to bottom
  if(h<=500&&matchMedia('(pointer:coarse)').matches&&tb0){const r=tb0.getBoundingClientRect().right-map.getContainer().getBoundingClientRect().left;return [Math.min(w-S.ls/2-8,Math.max(w*0.5,r+S.ls/2+8)),h/2]}
  if(w>=700)return [w*0.42,h*0.5];
  // phone: below the title and the layers button, and above the readout / mode strip
  const top=topClear();
  return [w/2,Math.max(S.ls/2+8,Math.min(h-S.ls/2-108,Math.max(top+S.ls/2,h*0.42)))]}
function topClear(){const mapR=map.getContainer().getBoundingClientRect(),stack=document.querySelector('.leaflet-top.leaflet-left');
  if(stack)return stack.getBoundingClientRect().bottom-mapR.top+8;return titleClear()}
function titleClear(){const mapR=map.getContainer().getBoundingClientRect(),tb=$('titlebox');return (tb?tb.getBoundingClientRect().bottom-mapR.top:56)+8}
function sheetOpen(){return matchMedia('(max-width:700px) and (pointer:coarse)').matches&&$('panel')&&!$('panel').classList.contains('hide')}
// Phone sheet: the lens sits between the title and the mode strip. It is narrower than the screen, so it clears the layers button by being centred.
let sheetSaved=null,sheetCap=null;
function sheetBand(){const mh=mapSize()[1],top=titleClear(),bot=mh*0.5-58;return {top,bot,cap:Math.max(150,Math.min(600,Math.floor(bot-top)-4))}}
function syncLs(){const e=$('ls');if(e)e.value=S.ls;const v=$('lsv');if(v)v.textContent=S.ls+' px'}
function placeLens(){const [mw,mh]=mapSize();if(!S.fs){if(sheetOpen()){const b=sheetBand();if(sheetSaved==null)sheetSaved=S.ls;sheetCap=b.cap;if(S.ls>b.cap){S.ls=b.cap;syncLs()}
    const r=S.ls/2,top=b.top+r,bot=b.bot-r;lensC[0]=Math.max(r,Math.min(mw-r,lensC[0]));lensC[1]=bot>=top?Math.max(top,Math.min(bot,lensC[1])):top}
  else{if(sheetSaved!=null){if(sheetCap!=null&&S.ls===sheetCap){S.ls=sheetSaved;syncLs()}sheetSaved=sheetCap=null}
    const r=S.ls/2,cl=(v,m)=>Math.max(Math.min(r,m/2),Math.min(Math.max(m-r,m/2),v));lensC=[cl(lensC[0],mw),cl(lensC[1],mh)];
    if(matchMedia('(max-width:700px) and (pointer:coarse)').matches){const edge=topClear()+r,low=mh-r-108;if(low>edge)lensC[1]=Math.max(edge,Math.min(low,lensC[1]))}}}
  const r=S.ls/2;lensEl.style.width=lensEl.style.height=S.ls+'px';lensEl.style.left=(lensC[0]-r)+'px';lensEl.style.top=(lensC[1]-r)+'px';lensEl.classList.toggle('fs',S.fs);if(window.__placeInfoCard)window.__placeInfoCard();if(LC.live&&window.__lensMos)scheduleMosaic()}
if(matchMedia('(max-width:700px),(max-height:500px) and (pointer:coarse)').matches)$('panel').classList.add('hide');
(function initLens(){const [w,h]=mapSize();
  if(H0.l){const p=H0.l.split(',').map(Number);if(p.length>=2&&p.every(isFinite)){const cp=map.latLngToContainerPoint([p[0],p[1]]);lensC=[cp.x,cp.y]}}
  S.ls=Math.min(S.ls,Math.max(150,Math.min(w,h)-40));if(!lensC||lensC[0]<0||lensC[1]<0||lensC[0]>w||lensC[1]>h)lensC=defaultLensC();placeLens()})();
// config startInLens: on first load (no #c in the link) pan so the start point sits at the lens centre, not the map centre
if(LC.startInLens&&!H0.c&&!H0.l&&lensC){const cp=map.latLngToContainerPoint([start.lat,start.lng]);map.panBy([cp.x-lensC[0],cp.y-lensC[1]],{animate:false})}
let drag=null,justDragged=0;
function startDrag(e,resize){if(S.fs)return false;e.preventDefault();e.stopPropagation();try{e.target.setPointerCapture(e.pointerId)}catch(_){}
  drag={resize,x:e.clientX,y:e.clientY,c:lensC.slice(),id:e.pointerId};lensEl.classList.add('dragging');return true}
function moveDrag(e){if(!drag||e.pointerId!==drag.id)return;const rect=map.getContainer().getBoundingClientRect();
  if(drag.resize){const d=Math.hypot(e.clientX-rect.left-lensC[0],e.clientY-rect.top-lensC[1]);S.ls=Math.round(Math.max(150,Math.min(600,d*2)));$('ls').value=S.ls;$('lsv').textContent=S.ls+' px'}
  else{lensC=[Math.max(0,Math.min(rect.width,drag.c[0]+e.clientX-drag.x)),Math.max(0,Math.min(rect.height,drag.c[1]+e.clientY-drag.y))]}
  bumpShade();placeLens();requestRender(true)}
function endDrag(e){if(drag&&(!e||e.pointerId===drag.id)){const moved=Math.hypot(e?e.clientX-drag.x:0,e?e.clientY-drag.y:0)>2;drag=null;lensEl.classList.remove('dragging');if(moved)justDragged=Date.now();saveHash();requestRender()}}
// rim, grip and resize handle are the only parts of the lens that take pointer events
let sunDrag=null;
function setSunFrom(e){const rect=map.getContainer().getBoundingClientRect();const x=e.clientX-rect.left-lensC[0],y=e.clientY-rect.top-lensC[1];S.az=Math.round((Math.atan2(x,-y)*180/Math.PI+360)%360);bumpShade();syncUI();requestRender()}
lensEl.querySelector('svg.rim circle').addEventListener('pointerdown',e=>{if(matchMedia('(pointer:coarse)').matches){e.preventDefault();e.stopPropagation();try{e.target.setPointerCapture(e.pointerId)}catch(_){}sunDrag=e.pointerId;setSunFrom(e)}else startDrag(e,false)});
lensEl.querySelector('.g').addEventListener('pointerdown',e=>startDrag(e,false));
lensEl.querySelector('.h').addEventListener('pointerdown',e=>startDrag(e,true));
['pointermove'].forEach(t=>document.addEventListener(t,e=>{if(sunDrag!=null&&e.pointerId===sunDrag){setSunFrom(e);return}moveDrag(e)},true));
['pointerup','pointercancel'].forEach(t=>document.addEventListener(t,e=>{if(sunDrag!=null&&e.pointerId===sunDrag){sunDrag=null;bumpShade();saveHash();return}endDrag(e)},true));
function inLens(cx,cy){if(S.fs||!lensC)return false;const r=map.getContainer().getBoundingClientRect();return Math.hypot(cx-r.left-lensC[0],cy-r.top-lensC[1])<=S.ls/2}
// Shift/Alt + drag inside the lens moves it (desktop); capture phase so Leaflet never sees it
const mc=map.getContainer();
mc.addEventListener('pointerdown',e=>{if((e.shiftKey||e.altKey)&&e.isPrimary&&inLens(e.clientX,e.clientY)&&!e.target.closest('.leaflet-control')){startDrag(e,false)}},true);
['mousedown','touchstart'].forEach(t=>mc.addEventListener(t,e=>{if(drag){e.stopPropagation();if(e.cancelable)e.preventDefault()}},{capture:true,passive:false}));
mc.addEventListener('click',e=>{if(Date.now()-justDragged<350){e.stopPropagation();e.preventDefault()}},true);
// ---------- tiles ----------
const tileCache=new Map();
// live mode, first visit: tiles asked for before the service worker controls the page would go to the static host and 404,
// so hold them back; the page reloads as soon as the worker takes over (see above)
const SW_WAIT=!!(LC.live&&('serviceWorker' in navigator)&&!navigator.serviceWorker.controller);
function tileRange(z){const p1=map.project(CFG.bounds[1],z),p0=map.project(CFG.bounds[0],z);
  return {x0:Math.floor(Math.min(p0.x,p1.x)/256),x1:Math.floor(Math.max(p0.x,p1.x)/256),y0:Math.floor(Math.min(p0.y,p1.y)/256),y1:Math.floor(Math.max(p0.y,p1.y)/256)}}
function getTile(z,x,y,cb){if(SW_WAIT)return null;const k=z+'/'+x+'/'+y;let t=tileCache.get(k);
  if(t){if(t.ok)return t.img; if(!t.failed&&cb)t.cbs.push(cb); return null}
  const img=new Image();if(CFG.xo)img.crossOrigin=CFG.xo;t={img,ok:false,failed:false,cbs:cb?[cb]:[]};tileCache.set(k,t);img.decoding='async';
  img.onload=()=>{t.ok=true;t.cbs.forEach(f=>f());t.cbs=[];pokeLens()};img.onerror=()=>{t.failed=true;const c=t.cbs;t.cbs=[];c.forEach(f=>f());pokeLens()};   // a failed tile also triggers a rebuild, so the loading count clears
  img.src=CFG.tiles.replace('{z}',z).replace('{x}',x).replace('{y}',y);return null}
// ---------- mosaic state ----------
let MZ=null; // {zt,x0,y0,nx,ny,w,h,key}
// Extra data px a mode looks beyond the lens (the 96 px margin already covers it unless the radius is large). Capped so a phone does not fetch many more tiles.
function needPx(zt){if(!isOD(S.mode))return 0;const c=map.getCenter(),mpp=156543.03392*Math.cos(c.lat*Math.PI/180)/Math.pow(2,zt);return Math.min(phoneLike()?64:120,Math.max(2,S.rad/mpp))}
function wantMosaic(){const z=map.getZoom();const zt=Math.max(CFG.minz,Math.min(CFG.maxz,Math.round(z)));
  const sc=Math.pow(2,z-zt),tl=map.containerPointToLayerPoint([0,0]).add(map.getPixelOrigin());const [w,h]=mapSize();
  let ax0=tl.x/sc-128,ay0=tl.y/sc-128,ax1=(tl.x+w)/sc+128,ay1=(tl.y+h)/sc+128;const R=tileRange(zt);
  // live mode: every tile costs a fetch from the EA, so only cover the lens (plus a margin), not the whole screen
  if(LC.live&&!S.fs&&lensC){const r=S.ls/2+Math.max(96,needPx(zt)*sc+8);ax0=Math.max(ax0,(tl.x+lensC[0]-r)/sc);ay0=Math.max(ay0,(tl.y+lensC[1]-r)/sc);ax1=Math.min(ax1,(tl.x+lensC[0]+r)/sc);ay1=Math.min(ay1,(tl.y+lensC[1]+r)/sc)}
  const x0=Math.max(R.x0,Math.floor(ax0/256)),x1=Math.min(R.x1,Math.floor(ax1/256)),y0=Math.max(R.y0,Math.floor(ay0/256)),y1=Math.min(R.y1,Math.floor(ay1/256));
  if(x1<x0||y1<y0)return null;
  return {zt,x0,y0,nx:x1-x0+1,ny:y1-y0+1,w:(x1-x0+1)*256,h:(y1-y0+1)*256,key:[zt,x0,y0,x1,y1].join(',')}}
function view(){const z=map.getZoom();const sc=Math.pow(2,z-MZ.zt);const tl=map.containerPointToLayerPoint([0,0]).add(map.getPixelOrigin());
  const lat=map.getCenter().lat;return {sc,tl:[tl.x,tl.y],org:[MZ.x0*256,MZ.y0*256],mpp:156543.03392*Math.cos(lat*Math.PI/180)/Math.pow(2,MZ.zt)}}
// ---------- colour ramps ----------
// Stops are interpolated in Oklab so equal steps in the data look even. rdbu is ColorBrewer RdBu (11), pinned so the middle is neutral grey: relief modes map zero there.
const RAMPS={grey:['#000000','#ffffff'],greyinv:['#ffffff','#000000'],
 viridis:['#440154','#482878','#3e4989','#31688e','#26828e','#1f9e89','#35b779','#6ece58','#b5de2b','#fde725'],
 magma:['#000004','#1b1044','#3b0f70','#641a80','#8c2981','#b5367a','#de4968','#f66e5b','#fe9f6d','#fecf92','#fcfdbf'],
 rdbu:['#053061','#2166ac','#4393c3','#92c5de','#d1e5f0','#f7f7f7','#fddbc7','#f4a582','#d6604d','#b2182b','#67001f'],
 terrain:['#1a4d2e','#4f7942','#a3b86c','#e8d8a0','#b08b5a','#7a5c3e','#ffffff'],
 cividis:['#00224e','#0d2e6b','#2a4068','#48546a','#666970','#847f71','#a3976c','#c2b15e','#e1cc4e','#fee838']};
function s2lin(c){c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4)}
function lin2s(c){c=c<=0.0031308?12.92*c:1.055*Math.pow(Math.max(0,c),1/2.4)-0.055;return Math.round(Math.min(255,Math.max(0,c*255)))}
function rgbToOklab(r,g,b){const R=s2lin(r),G=s2lin(g),B=s2lin(b);
  const l=Math.cbrt(0.4122214708*R+0.5363325363*G+0.0514459929*B),m=Math.cbrt(0.2119034982*R+0.6806995451*G+0.1073969566*B),s=Math.cbrt(0.0883024619*R+0.2817188376*G+0.6299787005*B);
  return [0.2104542553*l+0.7936177850*m-0.0040720468*s,1.9779984951*l-2.4285922050*m+0.4505937099*s,0.0259040371*l+0.7827717662*m-0.8086757660*s]}
function oklabToRgb(L,a,b){const l=L+0.3963377774*a+0.2158037573*b,m=L-0.1055613458*a-0.0638541728*b,s=L-0.0894841775*a-1.2914855480*b,l3=l*l*l,m3=m*m*m,s3=s*s*s;
  return [lin2s(4.0767416621*l3-3.3077115913*m3+0.2309699292*s3),lin2s(-1.2684380046*l3+2.6097574011*m3-0.3413193965*s3),lin2s(-0.0041960863*l3-0.7034186147*m3+1.7076147010*s3)]}
function rampBytes(name){const hex=(RAMPS[name]||RAMPS.grey);const st=hex.map(h=>rgbToOklab(parseInt(h.substr(1,2),16),parseInt(h.substr(3,2),16),parseInt(h.substr(5,2),16)));
  const mid=name==='rdbu'?[parseInt('f7',16),parseInt('f7',16),parseInt('f7',16)]:null;const a=new Uint8Array(256*4);
  for(let i=0;i<256;i++){let R,G,B;if(mid&&(i===127||i===128)){R=mid[0];G=mid[1];B=mid[2]}
    else{const t=i/255*(st.length-1),k=Math.min(st.length-2,Math.floor(t)),f=t-k;const c=oklabToRgb(st[k][0]*(1-f)+st[k+1][0]*f,st[k][1]*(1-f)+st[k+1][1]*f,st[k][2]*(1-f)+st[k+1][2]*f);R=c[0];G=c[1];B=c[2]}
    a[i*4]=R;a[i*4+1]=G;a[i*4+2]=B;a[i*4+3]=255}return a}
// ---------- renderer ----------
let R=null; const forceCPU=/[?&]cpu=1/.test(location.search);
function msg(t,ms){const m=$('msg');m.textContent=t;m.style.display=t?'block':'none';if(ms)setTimeout(()=>{if(m.textContent===t)m.style.display='none'},ms)}
// ===== WebGL2 =====
function glOK(){try{const t=document.createElement('canvas').getContext('webgl2');return !!(t&&t.getExtension('EXT_color_buffer_float'))}catch(e){return false}}
function makeGL(){if(!glOK())return null;const gl=cv.getContext('webgl2',{premultipliedAlpha:false,preserveDrawingBuffer:true,antialias:false,alpha:true});
  if(!gl)return null; if(!gl.getExtension('EXT_color_buffer_float'))return null;
  const VS=`#version 300 es
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;
  const HEAD=`#version 300 es
precision highp float;precision highp int;out vec4 o;`;
  const DEC=HEAD+`uniform sampler2D T;void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec4 c=texelFetch(T,p,0);
float h=c.a<0.5?-9999.0:(round(c.r*255.0)*256.0+round(c.g*255.0)+round(c.b*255.0)/256.0-32768.0);o=vec4(h,0.0,0.0,1.0);}`;
  const BLUR=HEAD+`uniform sampler2D H;uniform ivec2 dir;uniform float sig;uniform int rad;void main(){ivec2 p=ivec2(gl_FragCoord.xy);ivec2 sz=textureSize(H,0);
float s=0.0,w=0.0;for(int k=-rad;k<=rad;k++){ivec2 q=clamp(p+dir*k,ivec2(0),sz-1);float h=texelFetch(H,q,0).r;if(h>-9000.0){float g=exp(-float(k*k)/(2.0*sig*sig));s+=g*h;w+=g;}}
o=vec4(w>0.0?s/w:-9999.0,0.0,0.0,1.0);}`;
  const VAL=HEAD+`uniform sampler2D H;uniform sampler2D B;uniform int mode,hnd,hns;uniform float mpp,ve,az,el,radpx,cr1,cr2;
ivec2 SZ;float hh(ivec2 q){return texelFetch(H,clamp(q,ivec2(0),SZ-1),0).r;}
float shade(vec3 n,float a,float e){return max(0.0,dot(n,vec3(sin(a)*cos(e),cos(a)*cos(e),sin(e))));}
// One horizon search (Zaksek, Ostir, Kokalj 2011; Yokoyama, Shirasawa, Pike 2002). hnd/hns are smaller on a phone.
float horizon(ivec2 p,float h0){float acc=0.0;float nd=float(max(hnd,1));float ns=float(max(hns,1));
 for(int k=0;k<16;k++){if(k>=hnd) break;float t=float(k)*6.2831853/nd;vec2 dv=vec2(cos(t),sin(t));
  float mx=-1.5707963;float mn=1.5707963;bool hit=false;
  for(int s=1;s<=14;s++){if(s>hns) break;float dist=max(1.0,radpx*pow(float(s)/ns,1.6));
   ivec2 q=p+ivec2(round(dv*dist));float hq=hh(q);if(hq<-9000.0) continue;
   float ang=atan((hq-h0)*ve,dist*mpp);mx=max(mx,ang);mn=min(mn,ang);hit=true;}
  if(!hit){mx=0.0;mn=0.0;}
  if(mode==4) acc+=sin(max(mx,0.0));
  else if(mode==8) acc+=1.5707963-mx;
  else if(mode==11) acc+=-0.5*(mx+mn);   // ((pi/2 - mx) - (pi/2 + mn))/2: positive minus negative openness, halved
  else acc+=1.5707963+mn;}
 if(mode==4) return 1.0-acc/nd;
 return degrees(acc/nd);}
// CVAT: one search out to the flat radius (cr2 px); samples within cr1 px also give the general-terrain horizon.
// Returns svf (general), positive openness (general, degrees), svf (flat), openness (flat).
vec4 horizon2(ivec2 p,float h0){float nd=float(max(hnd,1));float ns=float(max(hns,1));vec4 acc=vec4(0.0);
 for(int k=0;k<16;k++){if(k>=hnd) break;float t=float(k)*6.2831853/nd;vec2 dv=vec2(cos(t),sin(t));
  float m1=-1.5707963,m2=-1.5707963;bool h1=false,h2=false;
  for(int s=1;s<=14;s++){if(s>hns) break;float dist=max(1.0,cr2*pow(float(s)/ns,1.6));
   ivec2 q=p+ivec2(round(dv*dist));float hq=hh(q);if(hq<-9000.0) continue;
   float ang=atan(hq-h0,dist*mpp);m2=max(m2,ang);h2=true;if(dist<=cr1+0.5){m1=max(m1,ang);h1=true;}}
  if(!h1)m1=0.0;if(!h2)m2=0.0;
  acc+=vec4(sin(max(m1,0.0)),1.5707963-m1,sin(max(m2,0.0)),1.5707963-m2);}
 acc/=nd;return vec4(1.0-acc.x,degrees(acc.y),1.0-acc.z,degrees(acc.w));}
// One VAT (RVT blend: layers rendered bottom up, each 'top' mixed over the result by its opacity)
float vat(float hs,float slp,float op,float svf,float smax,float omin,float omax,float vmin){
 float b=clamp(hs,0.0,1.0);
 b=0.5*(1.0-clamp(slp/smax,0.0,1.0))+0.5*b;
 float a=clamp((op-omin)/(omax-omin),0.0,1.0);float t=b>0.5?1.0-(1.0-2.0*(b-0.5))*(1.0-a):2.0*b*a;b=0.5*t+0.5*b;
 float v=clamp((svf-vmin)/(1.0-vmin),0.0,1.0);return 0.25*(v*b)+0.75*b;}
void main(){SZ=textureSize(H,0);ivec2 p=ivec2(gl_FragCoord.xy);
float a=hh(p+ivec2(-1,-1)),b=hh(p+ivec2(0,-1)),c=hh(p+ivec2(1,-1)),d=hh(p+ivec2(-1,0)),h0=hh(p),f=hh(p+ivec2(1,0)),g=hh(p+ivec2(-1,1)),h=hh(p+ivec2(0,1)),i=hh(p+ivec2(1,1));
if(min(min(min(a,b),min(c,d)),min(min(h0,f),min(min(g,h),i)))<-9000.0){o=vec4(0.0);return;}
float gx=((c+2.0*f+i)-(a+2.0*d+g))/(8.0*mpp);float gs=((g+2.0*h+i)-(a+2.0*b+c))/(8.0*mpp);float gn=-gs;
vec3 n=normalize(vec3(-gx*ve,-gn*ve,1.0));float slope=degrees(atan(length(vec2(gx,gn))*ve));
float A=radians(az),E=radians(el);float hs=shade(n,A,E);
float mh=0.0;for(int k=0;k<8;k++){mh+=shade(n,A+float(k)*0.785398,E);}mh/=8.0;
float r=0.0,G=slope,Bc=hs;
if(mode==0)r=hs;else if(mode==1){r=mh;Bc=mh;}else if(mode==2)r=slope;
else if(mode==3||mode==6||mode==7){float bl=texelFetch(B,p,0).r;r=bl>-9000.0?h0-bl:0.0;Bc=mh;}
else if(mode==4||mode==8||mode==9||mode==11) r=horizon(p,h0);
else if(mode==5){r=mod(degrees(atan(-gx,-gn))+360.0,360.0);Bc=mh;}
else if(mode==10){vec3 n1=normalize(vec3(-gx,-gn,1.0));float s1=degrees(atan(length(vec2(gx,gn))));float A1=radians(315.0);vec4 hz=horizon2(p,h0);
 float vg=vat(shade(n1,A1,radians(35.0)),s1,hz.y,hz.x,50.0,68.0,93.0,0.7);float vf=vat(shade(n1,A1,radians(15.0)),s1,hz.w,hz.z,15.0,85.0,93.0,0.9);
 r=0.5*vg+0.5*vf;G=s1;}
o=vec4(r,G,Bc,1.0);}`;
  const SAMP=HEAD+`uniform sampler2D V;uniform vec2 b0,bs,lc;uniform int mode,fs,n;uniform float rad;
void main(){vec2 mp=b0+(gl_FragCoord.xy/float(max(n,1)))*bs;if(fs==0&&distance(mp,lc)>rad){o=vec4(0.0);return;}
ivec2 sz=textureSize(V,0);ivec2 ip=ivec2(floor(mp));if(ip.x<0||ip.y<0||ip.x>=sz.x||ip.y>=sz.y){o=vec4(0.0);return;}
vec4 v=texelFetch(V,ip,0);if(v.a<0.5){o=vec4(0.0);return;}o=vec4(mode==5?v.g:v.r,0.0,0.0,1.0);}`;
  const FIN=HEAD+`uniform sampler2D V;uniform sampler2D RP;uniform vec2 tl,org,lc;uniform float sc,dpr,ch,lr,lo,hi,gm,op;uniform int fs,mode,dvg,rrc;
vec3 hsv(float h,float s,float v){vec3 k=mod(vec3(5.0,3.0,1.0)+h*6.0,6.0);return v-v*s*clamp(min(k,4.0-k),0.0,1.0);}
void main(){vec2 css=vec2(gl_FragCoord.x,ch-gl_FragCoord.y)/dpr;float ea=1.0;
if(fs==0){float dd=distance(css,lc);if(dd>lr)discard;ea=clamp((lr-dd)/1.5,0.0,1.0);}
vec2 m=(tl+css)/sc-org-0.5;ivec2 sz=textureSize(V,0);ivec2 i0=ivec2(floor(m));vec2 fr=m-floor(m);
vec4 v00=texelFetch(V,clamp(i0,ivec2(0),sz-1),0),v10=texelFetch(V,clamp(i0+ivec2(1,0),ivec2(0),sz-1),0),v01=texelFetch(V,clamp(i0+ivec2(0,1),ivec2(0),sz-1),0),v11=texelFetch(V,clamp(i0+ivec2(1,1),ivec2(0),sz-1),0);
vec4 v;if(v00.a*v10.a*v01.a*v11.a>0.5){v=mix(mix(v00,v10,fr.x),mix(v01,v11,fr.x),fr.y);if(mode==5){vec4 vn=fr.x<0.5?(fr.y<0.5?v00:v01):(fr.y<0.5?v10:v11);v.r=vn.r;}}
else{v=fr.x<0.5?(fr.y<0.5?v00:v01):(fr.y<0.5?v10:v11);if(v.a<0.5)discard;}
float sv=mode==5?v.g:v.r;float t;if(dvg==1){float posv=max(hi,1e-6);float negv=min(lo,-1e-6);
 t=sv>=0.0?0.5+0.5*clamp(sv/posv,0.0,1.0):0.5-0.5*clamp(sv/negv,0.0,1.0);}else t=clamp((sv-lo)/max(hi-lo,1e-6),0.0,1.0);t=pow(clamp(t,0.0,1.0),gm);vec3 col;
if(mode==5){col=hsv(v.r/360.0,t,0.35+0.65*v.b);}
else if(mode==6||rrc==1){float s=clamp(v.g/40.0,0.0,1.0);col=vec3(t,t*(1.0-0.8*s),t*(1.0-0.95*s));}
else{col=texture(RP,vec2(t*0.996+0.002,0.5)).rgb;if(mode==7)col*=0.3+0.7*v.b;}
o=vec4(col,op*ea);}`;
  function sh(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s}
  const vs=sh(gl.VERTEX_SHADER,VS);
  function prog(fs){const p=gl.createProgram();gl.attachShader(p,vs);gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
    const u={};const n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);for(let k=0;k<n;k++){const a=gl.getActiveUniform(p,k);u[a.name]=gl.getUniformLocation(p,a.name)}return {p,u}}
  const P={dec:prog(DEC),blur:prog(BLUR),val:prog(VAL),fin:prog(FIN),samp:prog(SAMP)};
  gl.bindVertexArray(gl.createVertexArray());
  function tex(w,h,fmt,data){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
    if(fmt==='rgba8')gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,data||null);
    else if(fmt==='r32f')gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,w,h,0,gl.RED,gl.FLOAT,null);
    else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,w,h,0,gl.RGBA,gl.FLOAT,null);
    const f=fmt==='ramp'?gl.LINEAR:gl.NEAREST;gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,f);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,f);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t}
  function fbo(t){const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);return f}
  let T={},rampTex=null,rampName=null,blurKey=null,haveBlur=false,sampTex=null,sampFb=null,sampN=0;
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  function allocate(w,h){for(const k in T){if(T[k].tex)gl.deleteTexture(T[k].tex);if(T[k].fb)gl.deleteFramebuffer(T[k].fb)}
    T={rgb:{tex:tex(w,h,'rgba8')}};['H','B1','B2'].forEach(k=>{const t=tex(w,h,'r32f');T[k]={tex:t,fb:fbo(t)}});const t=tex(w,h,'rgba32f');T.V={tex:t,fb:fbo(t)};blurKey=null}
  function quad(prog,fb,w,h,sc){gl.useProgram(prog.p);gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.viewport(0,0,w,h);
    if(sc){gl.enable(gl.SCISSOR_TEST);gl.scissor(sc[0],sc[1],sc[2],sc[3])}else gl.disable(gl.SCISSOR_TEST);gl.drawArrays(gl.TRIANGLES,0,3)}
  function bindT(unit,t,prog,name){gl.useProgram(prog.p);gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(prog.u[name],unit)}
  return {
    kind:'WebGL2',
    newMosaic(mz){allocate(mz.w,mz.h)},
    putTile(img,x,y){gl.bindTexture(gl.TEXTURE_2D,T.rgb.tex);gl.texSubImage2D(gl.TEXTURE_2D,0,x,y,gl.RGBA,gl.UNSIGNED_BYTE,img)},
    decode(mz){bindT(0,T.rgb.tex,P.dec,'T');quad(P.dec,T.H.fb,mz.w,mz.h);blurKey=null},
    compute(mz,vw,box){const sig=Math.max(0.6,S.rad/vw.mpp),key=sig.toFixed(3);
      if(isLRM(S.mode)){if(blurKey!==key){const rad=Math.min(200,Math.ceil(sig*3));gl.useProgram(P.blur.p);gl.uniform1f(P.blur.u.sig,sig);gl.uniform1i(P.blur.u.rad,rad);
        gl.uniform2i(P.blur.u.dir,1,0);bindT(0,T.H.tex,P.blur,'H');quad(P.blur,T.B1.fb,mz.w,mz.h);
        gl.useProgram(P.blur.p);gl.uniform2i(P.blur.u.dir,0,1);bindT(0,T.B1.tex,P.blur,'H');quad(P.blur,T.B2.fb,mz.w,mz.h);blurKey=key}}
      const p=P.val;gl.useProgram(p.p);bindT(0,T.H.tex,p,'H');bindT(1,T.B2.tex,p,'B');gl.uniform1i(p.u.mode,S.mode);gl.uniform1f(p.u.mpp,vw.mpp);gl.uniform1f(p.u.ve,S.ve);
      gl.uniform1f(p.u.az,S.az);gl.uniform1f(p.u.el,S.el);gl.uniform1f(p.u.radpx,Math.max(2,Math.min(120,S.rad/vw.mpp)));
      gl.uniform1f(p.u.cr1,Math.max(1.5,Math.min(120,CVAT_R1/vw.mpp)));gl.uniform1f(p.u.cr2,Math.max(2,Math.min(120,CVAT_R2/vw.mpp)));
      const hn=horizonN();gl.uniform1i(p.u.hnd,hn.nd);gl.uniform1i(p.u.hns,hn.ns);
      gl.bindFramebuffer(gl.FRAMEBUFFER,T.V.fb);gl.disable(gl.SCISSOR_TEST);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
      quad(p,T.V.fb,mz.w,mz.h,[box.x,box.y,box.w,box.h])},
    readBox(box){gl.bindFramebuffer(gl.FRAMEBUFFER,T.V.fb);const a=new Float32Array(box.w*box.h*4);gl.readPixels(box.x,box.y,box.w,box.h,gl.RGBA,gl.FLOAT,a);return a},
    sample(box,n,cx,cy,rad){if(sampN!==n){if(sampTex){gl.deleteTexture(sampTex);gl.deleteFramebuffer(sampFb)}sampTex=tex(n,n,'rgba32f');sampFb=fbo(sampTex);sampN=n}
      const p=P.samp;gl.useProgram(p.p);bindT(0,T.V.tex,p,'V');gl.uniform2f(p.u.b0,box.x,box.y);gl.uniform2f(p.u.bs,box.w,box.h);gl.uniform2f(p.u.lc,cx,cy);
      gl.uniform1i(p.u.mode,S.mode);gl.uniform1i(p.u.fs,S.fs?1:0);gl.uniform1i(p.u.n,n);gl.uniform1f(p.u.rad,rad);quad(p,sampFb,n,n);
      const a=new Float32Array(n*n*4);gl.bindFramebuffer(gl.FRAMEBUFFER,sampFb);gl.readPixels(0,0,n,n,gl.RGBA,gl.FLOAT,a);return a},
    draw(vw,lo,hi){if(rampName!==S.ramp){if(rampTex)gl.deleteTexture(rampTex);rampTex=tex(256,1,'rgba8',rampBytes(S.ramp));gl.bindTexture(gl.TEXTURE_2D,rampTex);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);rampName=S.ramp}
      const p=P.fin;gl.useProgram(p.p);bindT(0,T.V.tex,p,'V');bindT(1,rampTex,p,'RP');const dpr=cvDpr;
      gl.uniform2f(p.u.tl,vw.tl[0],vw.tl[1]);gl.uniform2f(p.u.org,vw.org[0],vw.org[1]);gl.uniform2f(p.u.lc,lensC[0],lensC[1]);gl.uniform1f(p.u.sc,vw.sc);gl.uniform1f(p.u.dpr,dpr);
      gl.uniform1f(p.u.ch,cv.height);gl.uniform1f(p.u.lr,S.ls/2);gl.uniform1f(p.u.lo,lo);gl.uniform1f(p.u.hi,hi);gl.uniform1f(p.u.gm,S.gm);gl.uniform1f(p.u.op,S.op);
      gl.uniform1i(p.u.fs,S.fs?1:0);gl.uniform1i(p.u.mode,S.mode);gl.uniform1i(p.u.dvg,DIVERGING(S.mode)?1:0);gl.uniform1i(p.u.rrc,redRel()?1:0);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,cv.width,cv.height);gl.disable(gl.SCISSOR_TEST);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,3)},
    clear(){gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,cv.width,cv.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT)}
  }}
// ===== Canvas2D CPU fallback =====
function makeCPU(){const ctx=cv.getContext('2d');const mc=document.createElement('canvas');const mx=mc.getContext('2d',{willReadFrequently:true});
  let Hh=null,Bb=null,Vv=null,W=0,Hgt=0,blurKey=null,box=null;const oc=document.createElement('canvas'),ox=oc.getContext('2d');
  function blur1(src,dst,w,h,sig,dx){const rad=Math.min(150,Math.ceil(sig*3)),k=new Float32Array(2*rad+1);for(let i=-rad;i<=rad;i++)k[i+rad]=Math.exp(-i*i/(2*sig*sig));
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){let s=0,ws=0;for(let i=-rad;i<=rad;i++){const xx=dx?Math.min(w-1,Math.max(0,x+i)):x,yy=dx?y:Math.min(h-1,Math.max(0,y+i));const v=src[yy*w+xx];if(v>-9000){s+=k[i+rad]*v;ws+=k[i+rad]}}dst[y*w+x]=ws?s/ws:-9999}}
  return {kind:'Canvas2D (CPU fallback)',
    newMosaic(mz){mc.width=mz.w;mc.height=mz.h;mx.clearRect(0,0,mz.w,mz.h);W=mz.w;Hgt=mz.h},
    putTile(img,x,y){mx.drawImage(img,x,y)},
    decode(mz){const d=mx.getImageData(0,0,W,Hgt).data;Hh=new Float32Array(W*Hgt);for(let i=0;i<W*Hgt;i++)Hh[i]=d[i*4+3]<128?-9999:d[i*4]*256+d[i*4+1]+d[i*4+2]/256-32768;blurKey=null},
    compute(mz,vw,bx){box=bx;const w=bx.w,h=bx.h,mpp=vw.mpp,ve=S.ve,A=S.az*Math.PI/180,E=S.el*Math.PI/180;Vv=new Float32Array(w*h*4);
      const hh=(x,y)=>Hh[Math.min(Hgt-1,Math.max(0,y))*W+Math.min(W-1,Math.max(0,x))];
      let BL=null;if(isLRM(S.mode)){const sig=Math.max(0.6,S.rad/mpp),m=Math.ceil(sig*3),x0=Math.max(0,bx.x-m),y0=Math.max(0,bx.y-m),x1=Math.min(W,bx.x+w+m),y1=Math.min(Hgt,bx.y+h+m),ww=x1-x0,hw=y1-y0;
        const sub=new Float32Array(ww*hw);for(let y=0;y<hw;y++)for(let x=0;x<ww;x++)sub[y*ww+x]=Hh[(y+y0)*W+x+x0];const t1=new Float32Array(ww*hw),t2=new Float32Array(ww*hw);blur1(sub,t1,ww,hw,sig,true);blur1(t1,t2,ww,hw,sig,false);BL=(x,y)=>t2[(y-y0)*ww+(x-x0)]}
      const sh=(nx,ny,nz,a)=>Math.max(0,nx*Math.sin(a)*Math.cos(E)+ny*Math.cos(a)*Math.cos(E)+nz*Math.sin(E));const radpx=Math.max(2,Math.min(120,S.rad/mpp));const hsamp=horizonN(),ND=hsamp.nd,NS=hsamp.ns;
      for(let j=0;j<h;j++)for(let i=0;i<w;i++){const x=bx.x+i,y=bx.y+j,o=(j*w+i)*4;
        const a=hh(x-1,y-1),b=hh(x,y-1),c=hh(x+1,y-1),d=hh(x-1,y),h0=hh(x,y),f=hh(x+1,y),g=hh(x-1,y+1),hb=hh(x,y+1),ii=hh(x+1,y+1);
        if(Math.min(a,b,c,d,h0,f,g,hb,ii)<-9000)continue;
        const gx=((c+2*f+ii)-(a+2*d+g))/(8*mpp),gn=-((g+2*hb+ii)-(a+2*b+c))/(8*mpp);let nx=-gx*ve,ny=-gn*ve,nz=1;const L=Math.hypot(nx,ny,nz);nx/=L;ny/=L;nz/=L;
        const slope=Math.atan(Math.hypot(gx,gn)*ve)*180/Math.PI,hs=sh(nx,ny,nz,A);let mh=0;for(let k=0;k<8;k++)mh+=sh(nx,ny,nz,A+k*Math.PI/4);mh/=8;
        let r=0,G=slope,B=hs;const m=S.mode;
        if(m===0)r=hs;else if(m===1){r=mh;B=mh}else if(m===2)r=slope;else if(isLRM(m)){const bl=BL(x,y);r=bl>-9000?h0-bl:0;B=mh}
        else if(m===4||m===8||m===9||m===11){let acc=0;for(let k=0;k<ND;k++){const t=k*2*Math.PI/ND,dx=Math.cos(t),dy=Math.sin(t);let mx=-Math.PI/2,mn=Math.PI/2,hit=false;for(let s=1;s<=NS;s++){const dist=Math.max(1,radpx*Math.pow(s/NS,1.6));const hq=hh(Math.round(x+dx*dist),Math.round(y+dy*dist));if(hq<-9000)continue;const ang=Math.atan2((hq-h0)*ve,dist*mpp);if(ang>mx)mx=ang;if(ang<mn)mn=ang;hit=true}if(!hit){mx=0;mn=0}if(m===4)acc+=Math.sin(Math.max(mx,0));else if(m===8)acc+=Math.PI/2-mx;else if(m===11)acc+=-0.5*(mx+mn);else acc+=Math.PI/2+mn}r=m===4?1-acc/ND:acc/ND*180/Math.PI}
        else if(m===5){r=(Math.atan2(-gx,-gn)*180/Math.PI+360)%360;B=mh}
        else if(m===10){const c1=Math.max(1.5,Math.min(120,CVAT_R1/mpp)),c2=Math.max(2,Math.min(120,CVAT_R2/mpp));let a1=0,o1=0,a2=0,o2=0;
          for(let k=0;k<ND;k++){const t=k*2*Math.PI/ND,dx=Math.cos(t),dy=Math.sin(t);let m1=-Math.PI/2,m2=-Math.PI/2,h1=false,h2=false;
            for(let s=1;s<=NS;s++){const dist=Math.max(1,c2*Math.pow(s/NS,1.6));const hq=hh(Math.round(x+dx*dist),Math.round(y+dy*dist));if(hq<-9000)continue;const ang=Math.atan2(hq-h0,dist*mpp);if(ang>m2)m2=ang;h2=true;if(dist<=c1+0.5){if(ang>m1)m1=ang;h1=true}}
            if(!h1)m1=0;if(!h2)m2=0;a1+=Math.sin(Math.max(m1,0));o1+=Math.PI/2-m1;a2+=Math.sin(Math.max(m2,0));o2+=Math.PI/2-m2}
          const D=180/Math.PI,g1=Math.hypot(gx,gn),q=Math.hypot(gx,gn,1),n1x=-gx/q,n1y=-gn/q,n1z=1/q,s1=Math.atan(g1)*D,A1=315*Math.PI/180;
          const shE=(e)=>Math.max(0,n1x*Math.sin(A1)*Math.cos(e)+n1y*Math.cos(A1)*Math.cos(e)+n1z*Math.sin(e));
          const vat=(hs,slp,op,svf,smax,omin,omax,vmin)=>{const cl=v=>Math.min(1,Math.max(0,v));let b=cl(hs);b=0.5*(1-cl(slp/smax))+0.5*b;const a=cl((op-omin)/(omax-omin)),tt=b>0.5?1-(1-2*(b-0.5))*(1-a):2*b*a;b=0.5*tt+0.5*b;const v=cl((svf-vmin)/(1-vmin));return 0.25*v*b+0.75*b};
          r=0.5*vat(shE(35*Math.PI/180),s1,o1/ND*D,1-a1/ND,50,68,93,0.7)+0.5*vat(shE(15*Math.PI/180),s1,o2/ND*D,1-a2/ND,15,85,93,0.9);G=s1}
        Vv[o]=r;Vv[o+1]=G;Vv[o+2]=B;Vv[o+3]=1}},
    readBox(bx){return Vv},
    draw(vw,lo,hi){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,cv.width,cv.height);if(!Vv)return;const w=box.w,h=box.h;oc.width=w;oc.height=h;const im=ox.createImageData(w,h),q=im.data,rb=rampBytes(S.ramp),rrc=redRel();
      for(let k=0;k<w*h;k++){if(!Vv[k*4+3])continue;const m=S.mode,sv=m===5?Vv[k*4+1]:Vv[k*4];let t;if(DIVERGING(m)){const pos=Math.max(hi,1e-6),neg=Math.min(lo,-1e-6);t=sv>=0?0.5+0.5*Math.min(1,Math.max(0,sv/pos)):0.5-0.5*Math.min(1,Math.max(0,sv/neg))}else t=Math.min(1,Math.max(0,(sv-lo)/Math.max(hi-lo,1e-6)));t=Math.pow(Math.min(1,Math.max(0,t)),S.gm);let R,G,B;
        if(m===5){const hh=Vv[k*4]/360,v=0.35+0.65*Vv[k*4+2],kk=n=>{const x=(n+hh*6)%6;return v-v*t*Math.max(0,Math.min(1,Math.min(x,4-x)))};R=kk(5)*255;G=kk(3)*255;B=kk(1)*255}
        else if(m===6||rrc){const s=Math.min(1,Vv[k*4+1]/40);R=t*255;G=t*(1-0.8*s)*255;B=t*(1-0.95*s)*255}
        else{const ix=Math.round(t*255)*4,f=m===7?0.3+0.7*Vv[k*4+2]:1;R=rb[ix]*f;G=rb[ix+1]*f;B=rb[ix+2]*f}
        q[k*4]=R;q[k*4+1]=G;q[k*4+2]=B;q[k*4+3]=255}
      ox.putImageData(im,0,0);ctx.save();ctx.scale(cvDpr,cvDpr);if(!S.fs){ctx.beginPath();ctx.arc(lensC[0],lensC[1],S.ls/2,0,Math.PI*2);ctx.clip()}
      ctx.globalAlpha=S.op;ctx.imageSmoothingEnabled=vw.sc<1;ctx.translate(-vw.tl[0],-vw.tl[1]);ctx.scale(vw.sc,vw.sc);ctx.drawImage(oc,vw.org[0]+box.x,vw.org[1]+box.y);ctx.restore()},
    clear(){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,cv.width,cv.height)}}}
try{if(!forceCPU)R=makeGL()}catch(e){console.error(e);R=null}
if(!R){try{R=makeCPU();if(!cv.getContext('2d'))throw new Error('no 2d')}catch(e){R=null}
  if(R)msg('This browser has no WebGL2 float support: using the basic (slower) renderer. All modes still work.',6000);
  else{const nop=()=>{};R={kind:'none',newMosaic:nop,putTile:nop,decode:nop,compute:nop,readBox:()=>null,sample:()=>null,draw:nop,clear:nop};
    msg('This browser cannot draw the LiDAR (no WebGL or canvas). The background map, Go to and records still work; try an up-to-date Chrome, Firefox, Safari or Samsung Internet.',0)}}
window.__lens={layersCtl,bases:{BASES,baseById,set:id=>{if(!baseById[id]||id===S.base)return;map.removeLayer(baseById[S.base]);S.base=id;baseById[id].addTo(map);map.fire('baselayerchange',{layer:baseById[id]})}},country:()=>CT?ctryName():(LC.layerCountry||'england'),renderer:()=>R.kind,stretch:()=>lastStretch,S,map,CFG,LC,msg,lensState:()=>({c:lensC.slice(),ls:S.ls,fs:S.fs})};
// ---------- render loop ----------
let cvDpr=1,mosaicReady=false,pending=false,lastStretch=null;
function resizeCanvas(){cvDpr=Math.min(2,window.devicePixelRatio||1);const [w,h]=mapSize();cv.style.width=w+'px';cv.style.height=h+'px';cv.width=Math.round(w*cvDpr);cv.height=Math.round(h*cvDpr)}
function tileInLens(zt,x,y){if(S.fs||!lensC)return true;const sc=Math.pow(2,map.getZoom()-zt),tl=map.containerPointToLayerPoint([0,0]).add(map.getPixelOrigin()),r=S.ls/2+48;
  const x0=(x*256-tl.x)*sc,x1=((x+1)*256-tl.x)*sc,y0=(y*256-tl.y)*sc,y1=((y+1)*256-tl.y)*sc;
  const nx=Math.max(x0,Math.min(lensC[0],x1)),ny=Math.max(y0,Math.min(lensC[1],y1));return Math.hypot(nx-lensC[0],ny-lensC[1])<=r}
let lensWait=null;
function tileSettled(z,x,y){const t=tileCache.get(z+'/'+x+'/'+y);return !!(t&&(t.ok||t.failed))}
function pokeLens(){const w=lensWait;if(!w)return;for(const [z,x,y] of w.tiles)if(!tileSettled(z,x,y))return;lensWait=null;w.rest.forEach(([x,y])=>getTile(w.zt,x,y,scheduleMosaic))}
// live worker: {refine:'z/x/y'} a finer tile is ready (swap it in once loaded, no blank in between); {drop:'z/x/y'} the tile
// was given up because the lens moved away (forget it, so it is asked for again if the lens comes back)
let lastFocus='';
if(LC.live&&navigator.serviceWorker)navigator.serviceWorker.addEventListener('message',e=>{const d=e.data||{};
  if(d.drop){const t=tileCache.get(d.drop);if(t&&!t.ok){tileCache.delete(d.drop);scheduleMosaic()}}
  if(d.refine){const t=tileCache.get(d.refine);if(!t)return;const [z,x,y]=d.refine.split('/'),im=new Image();if(CFG.xo)im.crossOrigin=CFG.xo;im.decoding='async';
    im.onload=()=>{t.img=im;t.ok=true;t.failed=false;scheduleMosaic()};im.src=CFG.tiles.replace('{z}',z).replace('{x}',x).replace('{y}',y)+'?fine=1'}});
function buildMosaic(){const want=wantMosaic();if(!want){MZ=null;mosaicReady=false;R.clear();lensWait=null;return}
  const all=[];for(let j=0;j<want.ny;j++)for(let i=0;i<want.nx;i++)all.push([want.x0+i,want.y0+j,i*256,j*256]);
  const lens=[],rest=[];if(!LC.live&&!S.fs)all.forEach(t=>(tileInLens(want.zt,t[0],t[1])?lens:rest).push(t));else lens.push(...all);
  const defer=lens.length&&rest.length,use=defer?lens:all;
  let missing=0;const imgs=use.map(([x,y])=>{const im=getTile(want.zt,x,y,scheduleMosaic);if(!im){const t=tileCache.get(want.zt+'/'+x+'/'+y);if(!t||!t.failed)missing++}return im});
  if(defer)rest.forEach(([x,y])=>{const t=tileCache.get(want.zt+'/'+x+'/'+y);if(!t||(!t.ok&&!t.failed))missing++});
  if(LC.live&&!S.fs&&lensC&&want.key!==lastFocus){lastFocus=want.key;const sw=navigator.serviceWorker&&navigator.serviceWorker.controller;   // tell the live worker where the lens is: it fetches nearest first, drops what the lens left
    if(sw){const c=map.containerPointToLatLng(lensC),mpp=156543.03392*Math.cos(c.lat*Math.PI/180)/Math.pow(2,map.getZoom());sw.postMessage({focus:[c.lat,c.lng,(S.ls/2+Math.max(96,needPx(want.zt)*Math.pow(2,map.getZoom()-want.zt)+8))*mpp]})}}
  MZ=want;R.newMosaic(want);use.forEach(([x,y,px,py],k)=>{if(imgs[k])R.putTile(imgs[k],px,py)});
  if(defer)rest.forEach(([x,y,px,py])=>{const t=tileCache.get(want.zt+'/'+x+'/'+y);if(t&&t.ok)R.putTile(t.img,px,py)});
  R.decode(want);mosaicReady=true;
  if(defer){lensWait={key:want.key,zt:want.zt,tiles:lens.map(([x,y])=>[want.zt,x,y]),rest};pokeLens()}else lensWait=null;
  if(LC.live&&!SW_WAIT&&map.getZoom()>=liveMz()-0.25){const failed=all.filter(([x,y])=>{const t=tileCache.get(want.zt+'/'+x+'/'+y);return t&&t.failed}).length;   // (nearly) every tile empty: say why, not a blank lens
    if(failed&&failed>=all.length*0.75)msg(NO_LIDAR);else if($('msg').textContent===NO_LIDAR)msg('',1)}
  {const ld=document.getElementById('loading');if(SW_WAIT)missing=all.length;if(ld){ld.hidden=!missing;if(missing)document.getElementById('loadt').textContent='Loading LiDAR… ('+missing+' tiles)'}}requestRender(true)}
// tiles arrive in bursts: coalesce rebuilds (each one re-decodes the whole mosaic)
let mosT=null,mosFirst=0;function scheduleMosaic(){clearTimeout(mosT);const now=performance.now();if(!mosFirst)mosFirst=now;
  mosT=setTimeout(()=>{mosFirst=0;buildMosaic()},now-mosFirst>600?0:150)}
window.__lensMos=true;   // from here on, moving or resizing the lens may rebuild the (live, lens-only) mosaic
function lensBox(vw){if(S.fs)return {x:0,y:0,w:MZ.w,h:MZ.h};const r=S.ls/2,m=3;
  const x0=Math.floor((vw.tl[0]+lensC[0]-r)/vw.sc-vw.org[0])-m,y0=Math.floor((vw.tl[1]+lensC[1]-r)/vw.sc-vw.org[1])-m,x1=Math.ceil((vw.tl[0]+lensC[0]+r)/vw.sc-vw.org[0])+m,y1=Math.ceil((vw.tl[1]+lensC[1]+r)/vw.sc-vw.org[1])+m;
  const X0=Math.max(0,x0),Y0=Math.max(0,y0),X1=Math.min(MZ.w,x1),Y1=Math.min(MZ.h,y1);return {x:X0,y:Y0,w:Math.max(1,X1-X0),h:Math.max(1,Y1-Y0)}}
function fmtN(v){const a=Math.abs(v);return (a>=100?v.toFixed(1):a>=1?v.toFixed(2):v.toFixed(3))}
// 2nd/98th percentile via a 512-bin histogram. No sort, and the step is ceil so a ~300 px lens is not scanned pixel by pixel.
function histPct(n,visit){if(n<21)return null;let lo=Infinity,hi=-Infinity;visit(v=>{if(v<lo)lo=v;if(v>hi)hi=v});if(!(hi>lo))return [lo,lo+1e-3];
  const bins=new Uint32Array(512),sc=511/(hi-lo);visit(v=>{bins[Math.min(511,((v-lo)*sc)|0)]++});
  const at=target=>{let c=0;for(let i=0;i<512;i++){const next=c+bins[i];if(next>target){const f=bins[i]?(target-c)/bins[i]:0;return lo+(i+f)*(hi-lo)/511}c=next}return hi};
  return [at(0.02*(n-1)),at(0.98*(n-1))]}
let shadeBusy=false,shadeT=null;
function bumpShade(){shadeBusy=true;clearTimeout(shadeT);shadeT=setTimeout(()=>{shadeBusy=false;requestRender()},150)}
function stretch(vw,box){const base=MODE_RANGE[S.mode]||[0,1];let lo,hi;
  if(!S.auto&&!isCVAT(S.mode)){const m=manual[S.mode]||base;lo=m[0];hi=m[1];if(!(hi>lo))hi=lo+1e-3;lastStretch=[lo,hi];return lastStretch}
  if(isCVAT(S.mode)&&!S.va){const hw=0.5/Math.max(S.ct,0.05);lastStretch=[0.5-hw,0.5+hw];return lastStretch}   // Combined VAT: the published fixed 0–1 scale unless its own auto-contrast option (S.va) is on; Contrast narrows it about the middle
  if(shadeBusy&&lastStretch)return lastStretch; // lens drag and sun turn: keep the last range, no readback
  const nSamp=phoneLike()?40:56;const cx=(vw.tl[0]+lensC[0])/vw.sc-vw.org[0],cy=(vw.tl[1]+lensC[1])/vw.sc-vw.org[1],rad=S.ls/2/vw.sc;
  let pr=null;
  if(R.sample){const a=R.sample(box,nSamp,cx,cy,rad);if(a){let n=0;for(let i=3;i<a.length;i+=4)if(a[i]>0.5)n++;pr=histPct(n,fn=>{for(let i=0;i<a.length;i+=4)if(a[i+3]>0.5)fn(a[i])})}}
  else if(R.readBox){const a=R.readBox(box);if(a){const ch=S.mode===5?1:0,step=Math.max(1,Math.ceil(Math.sqrt(box.w*box.h/40000)));const ix=[];
    for(let j=0;j<box.h;j+=step)for(let i=0;i<box.w;i+=step){const k=(j*box.w+i)*4;if(a[k+3]<0.5)continue;if(!S.fs&&Math.hypot(box.x+i+0.5-cx,box.y+j+0.5-cy)>rad)continue;ix.push(k+ch)}
    pr=histPct(ix.length,fn=>{for(const k of ix)fn(a[k])})}}
  if(pr){lo=pr[0];hi=pr[1];if(DIVERGING(S.mode)){const m=Math.max(Math.abs(lo),Math.abs(hi),1e-3);lo=-m;hi=m}if(!(hi>lo))hi=lo+1e-3}
  else{lo=base[0];hi=base[1]}
  const c=(lo+hi)/2,hw=(hi-lo)/2/Math.max(S.ct,0.05);lastStretch=[c-hw,c+hw];return lastStretch}
let viewBusy=false,busyT=null,computedMode=null,lastLo=null,lastHi=null;
function render(){pending=false;if(R.kind==='none')return;if(!mosaicReady||!MZ){R.clear();return}const vw=view();const box=lensBox(vw);
  const defer=isHeavy(S.mode)&&(viewBusy||drag)&&computedMode===S.mode&&lastLo!=null;
  if(!defer){R.compute(MZ,vw,box);const sh=stretch(vw,box);lastLo=sh[0];lastHi=sh[1];computedMode=S.mode}
  if(lastLo==null)return;R.draw(vw,lastLo,lastHi);
  $('about').dataset.range=lastLo.toFixed(3)+' … '+lastHi.toFixed(3);
  const rr=$('rangeread');if(rr)rr.textContent=isCVAT(S.mode)&&!S.va?('Fixed scale, as published: '+fmtN(lastLo)+' … '+fmtN(lastHi)):S.auto||isCVAT(S.mode)?('On screen, 2–98%: '+fmtN(lastLo)+' … '+fmtN(lastHi)):(DIVERGING(S.mode)?'Manual range. Colours still meet at zero.':'Manual range for this view.')}
function requestRender(){if(!pending){pending=true;requestAnimationFrame(render)}}
map.on('movestart',()=>{viewBusy=true});
map.on('move',requestRender);map.on('moveend',()=>{scheduleMosaic();saveHash();liveHint();clearTimeout(busyT);busyT=setTimeout(()=>{viewBusy=false;requestRender()},220)});
// live mode: below the worker's first zoom the lens is empty, so say why
map.whenReady(()=>setTimeout(()=>liveHint(),300));
let NO_LIDAR=LC.noLidarText||(CT?'No open LiDAR covers this spot yet.':'Little or no LiDAR here: the Environment Agency survey covers England only, and stops at the coast.');
map.on('baselayerchange',()=>liveHint());
function liveHint(){if(!LC.live)return;const mz=liveMz(),zh=CT&&ctry().zoomHint!=null?ctry().zoomHint:LC.live.zoomHint;if(map.getZoom()<mz-0.25)msg('Zoom in to see live LiDAR in the lens (zoom '+mz+'+).'+(zh!=null?zh:S.base==='eahs'?' The background is the EA LiDAR hillshade.':' Zoomed out, choose the EA LiDAR hillshade background on the layers button.'));else if($('msg').textContent.startsWith('Zoom in to see live'))msg('',1)}
map.on('zoomstart',()=>{cv.style.visibility='hidden'});map.on('zoomend',()=>{cv.style.visibility='visible';scheduleMosaic()});
map.on('resize',()=>{resizeCanvas();placeLens();scheduleMosaic()});
// ---------- controls ----------
const ctl=[['mode','',v=>+v],['el','°',v=>+v],['ve','x',v=>+v],['rad',' m',v=>+v],['ct','x',v=>+v],['gm','',v=>+v],['op','',v=>+v],['ls',' px',v=>+v]];
function syncUI(){ctl.forEach(([k,u])=>{const e=$(k);if(e)e.value=S[k];const o=$(k+'v');if(o)o.textContent=(k==='op'?Math.round(S[k]*100)+'%':S[k]+u)});
  const sv=(id,p,v)=>{const e=$(id);if(e)e[p]=v};sv('ramp','value',S.ramp);sv('auto','checked',isCVAT(S.mode)?S.va:S.auto);sv('fs','checked',S.fs);sv('sm','checked',S.sm);sv('azv','textContent',Math.round(S.az)+'°');drawDial();
  $('sunbox').style.display=(S.mode===0||S.mode===1||S.mode===5||S.mode===7)?'':'none';$('radbox').style.display=(isLRM(S.mode)||isHeavy(S.mode))&&!isCVAT(S.mode)?'':'none';if($('ve'))$('ve').disabled=isCVAT(S.mode);
  $('ramp').disabled=S.mode===5||S.mode===6;{const ro=document.querySelector('#ramp option[value="redrel"]');if(ro){ro.hidden=ro.disabled=!isOD(S.mode)}}if($('ct'))$('ct').disabled=!S.auto&&!isCVAT(S.mode);const man=$('manrange');if(man)man.hidden=!!S.auto||isCVAT(S.mode);
  const lg=$('modelegend');if(lg){const t=MODE_LEGEND[S.mode];lg.textContent=t||'';lg.hidden=!t}
  if(!S.auto&&!isCVAT(S.mode)&&$('rlo')&&document.activeElement!==$('rlo')&&document.activeElement!==$('rhi')){const b=manual[S.mode]||MODE_RANGE[S.mode]||[0,1];$('rlo').value=b[0];$('rhi').value=b[1]}}
ctl.forEach(([k,u,f])=>{const e=$(k);const on=()=>{const pm=S.mode;S[k]=f(e.value);if(k==='mode'){S.ramp=MODE_RAMP[S.mode];const a=lookOf(pm),b=lookOf(S.mode);if(S.mode!==pm&&Math.abs(S.ct-a.ct)<1e-6&&Math.abs(S.gm-a.gm)<1e-6){S.ct=b.ct;S.gm=b.gm}}if(k==='ls')placeLens();syncUI();requestRender();saveHashSoon()};e.addEventListener('input',on);e.addEventListener('change',on)});
$('ramp').onchange=e=>{S.ramp=e.target.value;requestRender();saveHashSoon()};
$('auto').onchange=e=>{if(isCVAT(S.mode)){S.va=e.target.checked;syncUI();requestRender();saveHashSoon();return}S.auto=e.target.checked;if(!S.auto){const b=lastStretch||MODE_RANGE[S.mode]||[0,1];manual[S.mode]=[b[0],b[1]]}syncUI();requestRender();saveHashSoon()};
function readManual(){const lo=parseFloat($('rlo').value),hi=parseFloat($('rhi').value);if(!isFinite(lo)||!isFinite(hi)||!(hi>lo))return;manual[S.mode]=[lo,hi];requestRender();saveHashSoon()}
if($('rlo')){$('rlo').addEventListener('change',readManual);$('rhi').addEventListener('change',readManual)}
$('fs').onchange=e=>{S.fs=e.target.checked;placeLens();requestRender();saveHashSoon()};
$('sm').onchange=e=>{S.sm=e.target.checked;setSM(S.sm);saveHashSoon()};
function resetDefaults(){clearTimeout(hT);const keep={base:S.base,sm:S.sm};Object.assign(S,DEF,keep);S.ramp=MODE_RAMP[S.mode];for(const k of Object.keys(manual))delete manual[k];
  const [w,h]=mapSize();S.ls=Math.min(DEF.ls,Math.max(150,Math.min(w,h)-40));lensC=defaultLensC();placeLens();syncUI();requestRender();
  try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}suppressHash=true;setTimeout(()=>{suppressHash=false},400);msg('Settings reset to defaults',1800)}
$('reset').onclick=resetDefaults;window.__lens.reset=resetDefaults;
$('toggle').onclick=()=>{$('panel').classList.toggle('hide');placeLens();requestRender()};
// sun dial
const dial=$('dial'),dx=dial.getContext('2d')||new Proxy({},{get:()=>()=>{},set:()=>true});
function drawDial(){const w=dial.width,c=w/2,r=c-14;dx.clearRect(0,0,w,w);dx.lineWidth=3;dx.strokeStyle='#888';dx.beginPath();dx.arc(c,c,r,0,7);dx.stroke();
  dx.fillStyle='#333';dx.font='bold 20px system-ui';dx.textAlign='center';dx.textBaseline='middle';[['N',0],['E',90],['S',180],['W',270]].forEach(([t,a])=>{const q=a*Math.PI/180;dx.fillText(t,c+Math.sin(q)*(r-20),c-Math.cos(q)*(r-20))});
  const q=S.az*Math.PI/180;dx.strokeStyle='#f59e0b';dx.lineWidth=6;dx.beginPath();dx.moveTo(c,c);dx.lineTo(c+Math.sin(q)*r,c-Math.cos(q)*r);dx.stroke();
  dx.fillStyle='#f59e0b';dx.beginPath();dx.arc(c+Math.sin(q)*r,c-Math.cos(q)*r,11,0,7);dx.fill()}
let dd=false;const dialSet=e=>{const b=dial.getBoundingClientRect();S.az=Math.round((Math.atan2(e.clientX-b.left-b.width/2,-(e.clientY-b.top-b.height/2))*180/Math.PI+360)%360);bumpShade();syncUI();requestRender();saveHashSoon()};
dial.addEventListener('pointerdown',e=>{dd=true;dial.setPointerCapture(e.pointerId);dialSet(e)});dial.addEventListener('pointermove',e=>{if(dd)dialSet(e)});dial.addEventListener('pointerup',()=>dd=false);
// ---------- share hash ----------
function hashStr(){const c=map.getCenter(),ll=map.containerPointToLatLng(lensC);const p=new URLSearchParams();
  p.set('c',c.lat.toFixed(5)+','+c.lng.toFixed(5)+','+map.getZoom());p.set('l',ll.lat.toFixed(5)+','+ll.lng.toFixed(5));
  ['mode','az','el','ve','rad','ct','gm','op','ls'].forEach(k=>p.set(k,S[k]));p.set('ramp',S.ramp);p.set('auto',S.auto?1:0);if(S.va)p.set('va',1);if(!S.auto&&manual[S.mode]){p.set('mlo',fmtN(manual[S.mode][0]));p.set('mhi',fmtN(manual[S.mode][1]))}p.set('fs',S.fs?1:0);p.set('sm',S.sm?1:0);p.set('base',S.base);if(window.__lensHashExtra)window.__lensHashExtra(p);return p.toString()}
let suppressHash=false;function saveHash(){if(suppressHash)return;try{history.replaceState(null,'','#'+hashStr())}catch(e){}}
let hT=null;function saveHashSoon(){clearTimeout(hT);hT=setTimeout(saveHash,300)}
$('share').onclick=()=>{saveHash();const u=location.href;(navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(()=>msg(LC.private===true?'Link copied (the site still needs the password)':'Link copied',2500),()=>{prompt('Copy this link:',u)})};
// ---------- elevation profile ----------
const ptile=new Map();
function tileData(z,x,y){const k=z+'/'+x+'/'+y;if(ptile.has(k))return ptile.get(k);
  const pr=new Promise(res=>{const im=new Image();if(CFG.xo)im.crossOrigin=CFG.xo;im.onload=()=>{const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d',{willReadFrequently:true});if(!g)return res(null);g.drawImage(im,0,0);res(g.getImageData(0,0,256,256).data)};im.onerror=()=>res(null);im.src=CFG.tiles.replace('{z}',z).replace('{x}',x).replace('{y}',y)});ptile.set(k,pr);return pr}
async function heightAt(ll){const z=CFG.maxz,p=map.project(ll,z),x=Math.floor(p.x/256),y=Math.floor(p.y/256),d=await tileData(z,x,y);if(!d)return null;
  const i=Math.min(255,Math.floor(p.x-x*256)),j=Math.min(255,Math.floor(p.y-y*256)),o=(j*256+i)*4;if(d[o+3]<128)return null;return d[o]*256+d[o+1]+d[o+2]/256-32768}
let tool=null,profPts=[],profLine=null,profMk=[];const toolHooks={};
function setTool(t){if(t===tool)t=null;const prev=tool;tool=t;
  if(prev==='profile'&&t!=='profile'){clearProfile(true)}
  if(toolHooks[prev]&&toolHooks[prev].off)toolHooks[prev].off();
  if(toolHooks[t]&&toolHooks[t].on)toolHooks[t].on();
  document.body.classList.toggle('tool-on',!!t);updateToolButtons();
  if(t==='profile')msg('Profile ON: click a start point, then an end point (anywhere, including inside the lens). Esc or the button turns it off.',4000);
  else if(prev==='profile'&&!t)msg('Elevation profile off',1200)}
function updateToolButtons(){const pb=$('profile'),on=tool==='profile';pb.classList.toggle('on',on);pb.setAttribute('aria-pressed',on);
  pb.textContent=on?(profPts.length===1?'Elevation profile ON: click end point':'Elevation profile ON: click start point'):'Elevation profile (off)';
  const wb=$('whatis');if(wb){const w=tool==='whatis';wb.classList.toggle('on',w);wb.setAttribute('aria-pressed',w);{const n=LC.toolName||'What is it?';wb.textContent=w?n+' ON: click a spot':n+' (off)'}}}
function clearProfile(hideChart){profPts=[];profMk.forEach(m=>map.removeLayer(m));profMk=[];if(profLine){map.removeLayer(profLine);profLine=null}if(hideChart)$('prof').style.display='none'}
$('profile').onclick=()=>setTool('profile');
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&tool){if(tool==='profile'&&profPts.length===1){/* cancel the half-drawn line and switch off */}setTool(null)}});
map.on('click',async e=>{if(window.__lensEatClick&&Date.now()<window.__lensEatClick)return;if(tool==='whatis'){toolHooks.whatis.click(e.latlng);return}if(tool!=='profile')return;
  if(profPts.length!==1){clearProfile(false);profPts=[e.latlng];profMk=[L.circleMarker(e.latlng,{radius:5,color:'#f59e0b',weight:3,interactive:false}).addTo(map)];updateToolButtons();return}
  profPts.push(e.latlng);const [a,b]=profPts;profMk.push(L.circleMarker(b,{radius:5,color:'#f59e0b',weight:3,interactive:false}).addTo(map));
  profLine=L.polyline([a,b],{color:'#f59e0b',weight:3,interactive:false}).addTo(map);updateToolButtons();const dist=map.distance(a,b),n=Math.max(2,Math.min(800,Math.round(dist/0.75)));
  const hs=await Promise.all(Array.from({length:n+1},(_,k)=>heightAt(L.latLng(a.lat+(b.lat-a.lat)*k/n,a.lng+(b.lng-a.lng)*k/n))));if(profPts.length===2&&profPts[1]===b)drawProfile(hs,dist)});
function drawProfile(hs,dist){const box=$('prof');box.style.display='block';const c=$('profc'),dpr=Math.min(2,devicePixelRatio||1);c.width=c.clientWidth*dpr;c.height=c.clientHeight*dpr;
  const g=c.getContext('2d');g.scale(dpr,dpr);const W=c.clientWidth,H=c.clientHeight,m={l:54,r:14,t:24,b:30};const v=hs.filter(x=>x!==null);
  g.clearRect(0,0,W,H);g.font='13px system-ui';g.fillStyle='#333';if(!v.length){g.fillText('No elevation data along this line',m.l,H/2);return}
  let lo=Math.min(...v),hi=Math.max(...v);if(hi-lo<1){const c0=(hi+lo)/2;lo=c0-0.5;hi=c0+0.5}const X=k=>m.l+(W-m.l-m.r)*k/(hs.length-1),Y=h=>m.t+(H-m.t-m.b)*(1-(h-lo)/(hi-lo));
  g.strokeStyle='#ddd';g.beginPath();for(let k=0;k<=4;k++){const yy=m.t+(H-m.t-m.b)*k/4;g.moveTo(m.l,yy);g.lineTo(W-m.r,yy);g.fillText((hi-(hi-lo)*k/4).toFixed(1),4,yy+4)}g.stroke();
  g.fillStyle='rgba(245,158,11,.25)';g.strokeStyle='#b45309';g.lineWidth=2.5;g.beginPath();let st=false;hs.forEach((h,k)=>{if(h===null)return;st?g.lineTo(X(k),Y(h)):(g.moveTo(X(k),Y(h)),st=true)});g.lineTo(X(hs.length-1),H-m.b);g.lineTo(X(0),H-m.b);g.closePath();g.fill();g.beginPath();st=false;hs.forEach((h,k)=>{if(h===null)return;st?g.lineTo(X(k),Y(h)):(g.moveTo(X(k),Y(h)),st=true)});g.stroke();
  g.strokeStyle='#eee';g.lineWidth=1;g.beginPath();for(let k=1;k<4;k++){const xx=m.l+(W-m.l-m.r)*k/4;g.moveTo(xx,m.t);g.lineTo(xx,H-m.b)}g.stroke();for(let k=1;k<4;k++){g.fillStyle='#555';g.textAlign='center';g.fillText((dist*k/4).toFixed(0)+' m',m.l+(W-m.l-m.r)*k/4,H-10)}g.textAlign='left';
  g.fillStyle='#333';g.fillText('0 m',m.l,H-10);g.textAlign='right';g.fillText(dist.toFixed(0)+' m',W-m.r,H-10);g.textAlign='left';
  g.fillText('Elevation (m OD), relief '+(Math.max(...v)-Math.min(...v)).toFixed(2)+' m over '+dist.toFixed(0)+' m (not exaggerated to scale)',m.l,12)}
document.querySelector('#prof .x').onclick=()=>{clearProfile(true);if(tool==='profile')setTool(null)};
// ---------- go ----------
$('about').innerHTML=(LC.elevationNote||'Elevation: Environment Agency LiDAR Composite DTM 1 m (OGL), ')+(LC.dataNote||'')+' Terrarium-encoded lossless WebP tiles. Beyond z17 the lens magnifies the z17 data. Heights quantised to 1/64 m. Renderer: <b>'+R.kind+'</b>. Hillshade uses Horn gradients; multi-direction = 8 suns 45° apart; LRM = DTM minus a Gaussian blur (σ = radius; Hesse 2010); sky-view factor and positive and negative openness share one horizon search (Zakšek, Oštir and Kokalj 2011; Yokoyama, Shirasawa and Pike 2002; the same method as the Relief Visualization Toolbox, Apache 2.0). The search uses 16 directions and 14 steps, or 8 and 6 on a phone, and runs again when panning stops. Combined VAT visualisation after Kokalj, Ž. &amp; Somrak, M. (2019) Why Not a Single Image? Combining Visualizations to Facilitate Fieldwork and On-Screen Mapping. Remote Sensing 11(7), 747. doi:<a href="https://doi.org/10.3390/rs11070747" target="_blank" rel="noopener noreferrer">10.3390/rs11070747</a>. Relief Visualization Toolbox (RVT), Apache 2.0. Here: general- and flat-terrain settings (horizon radii 10 m and 20 m, sun 315°), computed in the browser from the same DTM tiles, without vertical exaggeration. Openness difference = (positive − negative openness) / 2 from the same horizon search and radius: openness after Yokoyama, R., Shirasawa, M. &amp; Pike, R.J. (2002) Visualizing topography by openness. Photogrammetric Engineering &amp; Remote Sensing 68(3), 257–265; difference after Chiba, T., Kaneta, S. &amp; Suzuki, Y. (2008) Red relief image map: new visualization method for three dimensional data. ISPRS Archives 37(B2), 1071–1076. Centred on zero (ridges light, hollows dark); it can also use the red relief colours (slope in red). Red relief = LRM lightness with slope as red. Colour ramps are spaced evenly in Oklab; the relief ramp is blue–grey–red with grey on zero. Auto contrast reads a small downsampled copy of the on-screen values and uses the 2nd–98th percentile (relief stays centred on zero). Untick it to type a range.<br><br><b>What is it?</b> On click only (no candidate lists): measures the shape around the spot from the z17 tiles (multi-scale local relief, footprint at ~20% height, height above a plane fitted just outside, length/width, plateau fraction for domed vs flat, 90th-percentile slope for edge sharpness, radial rim test for hollows, cross-axis step for lynchets) and adds OS OpenMap / OSM context. Records within 100 m: '+(LC.herLong||'local HER (information only)').replace(/&/g,'&amp;')+', NHLE scheduled monuments and listed buildings, HE Aerial Investigation &amp; Mapping, OSM historic features (community map). Grid refs use OSTN15 (correction grid) on top of a Helmert transform. Place search: Nominatim (submit only, max 1 request/s) and postcodes.io.';
// config creditsFull: the full credit text lives in About / data; a .credlink in the short attribution opens it
if(LC.creditsFull){const c=document.createElement('div');c.className='credits';c.style.marginTop='6px';c.innerHTML='<b>Credits.</b> '+LC.creditsFull;$('about').appendChild(c)}
document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a.credlink');if(!a)return;e.preventDefault();$('panel').classList.remove('hide');const d=$('about').closest('details');if(d)d.open=true;placeLens();requestRender();setTimeout(()=>$('about').scrollIntoView({block:'nearest',behavior:'smooth'}),50)});
Object.assign(window.__lens,{H0,saveHashSoon,RAMPS,syncUI,placeLens,requestRender,resetLens:()=>{lensC=defaultLensC();placeLens();requestRender()},tileData,heightAt,setTool,tool:()=>tool,toolHooks,profPts:()=>profPts.length,profShown:()=>$('prof').style.display==='block'&&!!profLine,updateToolButtons});
resizeCanvas();syncUI();if(S.sm)setSM(true);buildMosaic();
})();
