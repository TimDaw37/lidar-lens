/* LiDAR Lens: live LiDAR visualisation of Terrarium elevation tiles inside a draggable lens.
   WebGL2 (EXT_color_buffer_float) path with a Canvas2D CPU fallback. */
(function(){
'use strict';
const LC=window.LENS_CONFIG;if(!LC)throw new Error('config.js missing (window.LENS_CONFIG)');
// Live mode (LC.live): tiles and records are made on demand from public sources by live-sw.js (a service worker).
// On the first visit the worker isn't in control yet, so register it and reload once it is.
if(LC.live){if(!('serviceWorker' in navigator)){document.addEventListener('DOMContentLoaded',()=>{const m=document.getElementById('msg');if(m){m.textContent='This browser cannot run the live LiDAR (no service workers). Try a current Chrome, Edge, Firefox or Safari.';m.style.display='block'}})}
  else if(!navigator.serviceWorker.controller){navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});navigator.serviceWorker.register('live-sw.js').catch(e=>console.warn('live-sw',e))}
  else navigator.serviceWorker.register('live-sw.js').catch(()=>{})}
const CFG={tiles:LC.tiles.url,minz:LC.tiles.minzoom,maxz:LC.tiles.maxzoom,xo:LC.tiles.crossOrigin||null,bounds:LC.bounds,start:{lat:LC.start.lat,lng:LC.start.lng,z:LC.start.zoom}};
const $=id=>document.getElementById(id);
const DEF={mode:0,az:315,el:35,ve:2,rad:10,ramp:'grey',auto:true,ct:1,gm:1,op:1,ls:340,fs:false,sm:false,base:'sat'};
const MODE_RAMP={0:'grey',1:'grey',2:'greyinv',3:'rdbu',4:'grey',5:'grey',6:'rdbu',7:'rdbu'};
const MODE_RANGE={0:[0,1],1:[0.2,1],2:[0,35],3:[-0.5,0.5],4:[0.8,1],5:[0,30],6:[-0.5,0.5],7:[-0.5,0.5]};
const DIVERGING=m=>m===3||m===6||m===7;
const S=Object.assign({},DEF);
let lensC=null; // lens centre in container px
// ---------- hash ----------
function readHash(){const h=new URLSearchParams(location.hash.slice(1));const out={};
  for(const [k,v] of h){out[k]=v} return out}
const H0=readHash();
window.addEventListener('hashchange',()=>location.reload());   // a link pasted into an open tab: apply its view (the app's own saveHash uses replaceState, which doesn't fire this)
['mode','az','el','ve','rad','ct','gm','op','ls'].forEach(k=>{if(H0[k]!==undefined&&!isNaN(+H0[k]))S[k]=+H0[k]});
if(H0.ramp)S.ramp=H0.ramp; else S.ramp=MODE_RAMP[S.mode];
if(H0.auto!==undefined)S.auto=H0.auto==='1'; if(H0.fs!==undefined)S.fs=H0.fs==='1'; if(H0.sm!==undefined)S.sm=H0.sm==='1'; if(H0.base)S.base=H0.base;
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
map.attributionControl.addAttribution('LiDAR: EA LiDAR Composite DTM 1 m &copy; Environment Agency (OGL)');if(LC.extraAttribution)map.attributionControl.addAttribution(LC.extraAttribution);
let smLayer=null;
const titleCtl=L.control({position:'topleft'});titleCtl.onAdd=()=>{const d=$('titlebox');L.DomEvent.disableClickPropagation(d);L.DomEvent.disableScrollPropagation(d);return d};titleCtl.addTo(map);
L.control.zoom({position:'topleft'}).addTo(map);
const layersCtl=L.control.layers(baseLayers,{},{position:'topleft'}).addTo(map);   // ui.js adds the historic OS maps to it
map.on('baselayerchange',e=>{S.base=e.layer._lensId;saveHash()});
window.__outlineP=LC.outline?fetch(LC.outline).then(r=>r.json()):null;if(LC.outline){window.__outlineP.then(g=>L.geoJSON(g,{style:{color:'#fff',weight:1.5,dashArray:'4 4',fill:false},interactive:false}).addTo(map)).catch(()=>{})}else L.rectangle(CFG.bounds,{color:'#fff',weight:1,dashArray:'4 4',fill:false,interactive:false}).addTo(map);
// Links to sibling Lenses (config: links:[{text,href}], linksNote), under the title
if(LC.links&&LC.links.length){const tb=$('titlebox'),sub=tb&&tb.querySelector('.sub'),d=document.createElement('div');d.className='xlinks';
  if(LC.linksNote){const n=document.createElement('span');n.className='xn';n.textContent=LC.linksNote+' ';d.appendChild(n)}
  LC.links.forEach((l,i)=>{if(i)d.appendChild(document.createTextNode(' · '));const a=document.createElement('a');a.href=l.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=l.text;d.appendChild(a)});
  if(sub)sub.after(d);else if(tb)tb.querySelector('h1').after(d)}
document.title=LC.pageTitle||LC.title;{const h=document.querySelector('#titlebox h1'),a=document.querySelector('#titlebox .sub a');if(h)h.textContent=LC.title;if(a&&LC.link){a.textContent=LC.link.text;a.href=LC.link.href}else if(a)a.parentNode.style.display='none'}
L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
const whereCtl=L.control({position:'bottomleft'});whereCtl.onAdd=()=>{const d=$('where');L.DomEvent.disableClickPropagation(d);return d};whereCtl.addTo(map);
function setSM(on){if(on&&!smLayer){fetch(LC.scheduledOverlay||'scheduled_monuments.geojson').then(r=>r.json()).then(g=>{smLayer=L.geoJSON(g,{style:{color:'#ef4444',weight:2,fill:false},onEachFeature:(f,l)=>l.bindPopup('<b>'+(f.properties.Name||'')+'</b><br>List entry '+(f.properties.ListEntry||'')+(f.properties.hyperlink?'<br><a href="'+f.properties.hyperlink+'" target="_blank" rel="noopener noreferrer">NHLE entry</a>':''))});if(S.sm)smLayer.addTo(map)})}
  else if(smLayer){on?smLayer.addTo(map):map.removeLayer(smLayer)}}
// ---------- lens element ----------
const lensEl=$('lens'), cv=$('gl');
function mapSize(){const s=map.getSize();return [s.x,s.y]}
function defaultLensC(){const [w,h]=mapSize();if(w>=700)return [w*0.42,h*0.5];
  // phone: sit the lens just below the title box, not under it, while keeping it clear of the readout at the bottom
  const tb=$('titlebox'),top=tb?tb.getBoundingClientRect().bottom-map.getContainer().getBoundingClientRect().top+8:60;
  return [w/2,Math.max(S.ls/2+8,Math.min(h-S.ls/2-56,Math.max(top+S.ls/2,h*0.35)))]}
function placeLens(){const r=S.ls/2;const [mw,mh]=mapSize();if(!S.fs){const cl=(v,m)=>Math.max(Math.min(r,m/2),Math.min(Math.max(m-r,m/2),v));lensC=[cl(lensC[0],mw),cl(lensC[1],mh)]}lensEl.style.width=lensEl.style.height=S.ls+'px';lensEl.style.left=(lensC[0]-r)+'px';lensEl.style.top=(lensC[1]-r)+'px';lensEl.classList.toggle('fs',S.fs);if(LC.live&&window.__lensMos)scheduleMosaic()}
(function initLens(){const [w,h]=mapSize();
  if(H0.l){const p=H0.l.split(',').map(Number);if(p.length>=2&&p.every(isFinite)){const cp=map.latLngToContainerPoint([p[0],p[1]]);lensC=[cp.x,cp.y]}}
  S.ls=Math.min(S.ls,Math.max(150,Math.min(w,h)-40));if(!lensC||lensC[0]<0||lensC[1]<0||lensC[0]>w||lensC[1]>h)lensC=defaultLensC();placeLens()})();
let drag=null,justDragged=0;
function startDrag(e,resize){if(S.fs)return false;e.preventDefault();e.stopPropagation();try{e.target.setPointerCapture(e.pointerId)}catch(_){}
  drag={resize,x:e.clientX,y:e.clientY,c:lensC.slice(),id:e.pointerId};lensEl.classList.add('dragging');return true}
function moveDrag(e){if(!drag||e.pointerId!==drag.id)return;const rect=map.getContainer().getBoundingClientRect();
  if(drag.resize){const d=Math.hypot(e.clientX-rect.left-lensC[0],e.clientY-rect.top-lensC[1]);S.ls=Math.round(Math.max(150,Math.min(600,d*2)));$('ls').value=S.ls;$('lsv').textContent=S.ls+' px'}
  else{lensC=[Math.max(0,Math.min(rect.width,drag.c[0]+e.clientX-drag.x)),Math.max(0,Math.min(rect.height,drag.c[1]+e.clientY-drag.y))]}
  placeLens();requestRender(true)}
function endDrag(e){if(drag&&(!e||e.pointerId===drag.id)){const moved=Math.hypot(e?e.clientX-drag.x:0,e?e.clientY-drag.y:0)>2;drag=null;lensEl.classList.remove('dragging');if(moved)justDragged=Date.now();saveHash()}}
// rim, grip and resize handle are the only parts of the lens that take pointer events
lensEl.querySelector('svg.rim circle').addEventListener('pointerdown',e=>startDrag(e,false));
lensEl.querySelector('.g').addEventListener('pointerdown',e=>startDrag(e,false));
lensEl.querySelector('.h').addEventListener('pointerdown',e=>startDrag(e,true));
['pointermove'].forEach(t=>document.addEventListener(t,moveDrag,true));
['pointerup','pointercancel'].forEach(t=>document.addEventListener(t,endDrag,true));
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
  img.onload=()=>{t.ok=true;t.cbs.forEach(f=>f());t.cbs=[]};img.onerror=()=>{t.failed=true;const c=t.cbs;t.cbs=[];c.forEach(f=>f())};   // a failed tile also triggers a rebuild, so the loading count clears
  img.src=CFG.tiles.replace('{z}',z).replace('{x}',x).replace('{y}',y);return null}
// ---------- mosaic state ----------
let MZ=null; // {zt,x0,y0,nx,ny,w,h,key}
function wantMosaic(){const z=map.getZoom();const zt=Math.max(CFG.minz,Math.min(CFG.maxz,Math.round(z)));
  const sc=Math.pow(2,z-zt),tl=map.containerPointToLayerPoint([0,0]).add(map.getPixelOrigin());const [w,h]=mapSize();
  let ax0=tl.x/sc-128,ay0=tl.y/sc-128,ax1=(tl.x+w)/sc+128,ay1=(tl.y+h)/sc+128;const R=tileRange(zt);
  // live mode: every tile costs a fetch from the EA, so only cover the lens (plus a margin), not the whole screen
  if(LC.live&&!S.fs&&lensC){const r=S.ls/2+96;ax0=Math.max(ax0,(tl.x+lensC[0]-r)/sc);ay0=Math.max(ay0,(tl.y+lensC[1]-r)/sc);ax1=Math.min(ax1,(tl.x+lensC[0]+r)/sc);ay1=Math.min(ay1,(tl.y+lensC[1]+r)/sc)}
  const x0=Math.max(R.x0,Math.floor(ax0/256)),x1=Math.min(R.x1,Math.floor(ax1/256)),y0=Math.max(R.y0,Math.floor(ay0/256)),y1=Math.min(R.y1,Math.floor(ay1/256));
  if(x1<x0||y1<y0)return null;
  return {zt,x0,y0,nx:x1-x0+1,ny:y1-y0+1,w:(x1-x0+1)*256,h:(y1-y0+1)*256,key:[zt,x0,y0,x1,y1].join(',')}}
function view(){const z=map.getZoom();const sc=Math.pow(2,z-MZ.zt);const tl=map.containerPointToLayerPoint([0,0]).add(map.getPixelOrigin());
  const lat=map.getCenter().lat;return {sc,tl:[tl.x,tl.y],org:[MZ.x0*256,MZ.y0*256],mpp:156543.03392*Math.cos(lat*Math.PI/180)/Math.pow(2,MZ.zt)}}
// ---------- colour ramps ----------
const RAMPS={grey:['#000000','#ffffff'],greyinv:['#ffffff','#000000'],viridis:['#440154','#414487','#2a788e','#22a884','#7ad151','#fde725'],
 magma:['#000004','#3b0f70','#8c2981','#de4968','#fe9f6d','#fcfdbf'],rdbu:['#2166ac','#67a9cf','#d1e5f0','#f7f7f7','#fddbc7','#ef8a62','#b2182b'],
 terrain:['#1a4d2e','#4f7942','#a3b86c','#e8d8a0','#b08b5a','#7a5c3e','#ffffff'],cividis:['#00224e','#35456c','#666970','#948e77','#c8b866','#fee838']};
function rampBytes(name){const st=(RAMPS[name]||RAMPS.grey).map(h=>[1,3,5].map(i=>parseInt(h.substr(i,2),16)));const a=new Uint8Array(256*4);
  for(let i=0;i<256;i++){const t=i/255*(st.length-1),k=Math.min(st.length-2,Math.floor(t)),f=t-k;for(let c=0;c<3;c++)a[i*4+c]=Math.round(st[k][c]*(1-f)+st[k+1][c]*f);a[i*4+3]=255}return a}
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
  const VAL=HEAD+`uniform sampler2D H;uniform sampler2D B;uniform int mode;uniform float mpp,ve,az,el,radpx;
ivec2 SZ;float hh(ivec2 q){return texelFetch(H,clamp(q,ivec2(0),SZ-1),0).r;}
float shade(vec3 n,float a,float e){return max(0.0,dot(n,vec3(sin(a)*cos(e),cos(a)*cos(e),sin(e))));}
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
else if(mode==4){float sv=0.0;const int ND=16;const int NS=14;for(int k=0;k<ND;k++){float t=float(k)*6.2831853/float(ND);vec2 dv=vec2(cos(t),sin(t));float mx=0.0;
 for(int s=1;s<=NS;s++){float dist=max(1.0,radpx*pow(float(s)/float(NS),1.6));ivec2 q=p+ivec2(round(dv*dist));float hq=hh(q);if(hq<-9000.0)continue;
 mx=max(mx,atan((hq-h0)*ve,dist*mpp));}sv+=sin(mx);}r=1.0-sv/float(ND);}
else if(mode==5){r=mod(degrees(atan(-gx,-gn))+360.0,360.0);Bc=mh;}
o=vec4(r,G,Bc,1.0);}`;
  const FIN=HEAD+`uniform sampler2D V;uniform sampler2D RP;uniform vec2 tl,org,lc;uniform float sc,dpr,ch,lr,lo,hi,gm,op;uniform int fs,mode;
vec3 hsv(float h,float s,float v){vec3 k=mod(vec3(5.0,3.0,1.0)+h*6.0,6.0);return v-v*s*clamp(min(k,4.0-k),0.0,1.0);}
void main(){vec2 css=vec2(gl_FragCoord.x,ch-gl_FragCoord.y)/dpr;float ea=1.0;
if(fs==0){float dd=distance(css,lc);if(dd>lr)discard;ea=clamp((lr-dd)/1.5,0.0,1.0);}
vec2 m=(tl+css)/sc-org-0.5;ivec2 sz=textureSize(V,0);ivec2 i0=ivec2(floor(m));vec2 fr=m-floor(m);
vec4 v00=texelFetch(V,clamp(i0,ivec2(0),sz-1),0),v10=texelFetch(V,clamp(i0+ivec2(1,0),ivec2(0),sz-1),0),v01=texelFetch(V,clamp(i0+ivec2(0,1),ivec2(0),sz-1),0),v11=texelFetch(V,clamp(i0+ivec2(1,1),ivec2(0),sz-1),0);
vec4 v;if(v00.a*v10.a*v01.a*v11.a>0.5){v=mix(mix(v00,v10,fr.x),mix(v01,v11,fr.x),fr.y);if(mode==5){vec4 vn=fr.x<0.5?(fr.y<0.5?v00:v01):(fr.y<0.5?v10:v11);v.r=vn.r;}}
else{v=fr.x<0.5?(fr.y<0.5?v00:v01):(fr.y<0.5?v10:v11);if(v.a<0.5)discard;}
float sv=mode==5?v.g:v.r;float t=clamp((sv-lo)/max(hi-lo,1e-6),0.0,1.0);t=pow(t,gm);vec3 col;
if(mode==5){col=hsv(v.r/360.0,t,0.35+0.65*v.b);}
else if(mode==6){float s=clamp(v.g/40.0,0.0,1.0);col=vec3(t,t*(1.0-0.8*s),t*(1.0-0.95*s));}
else{col=texture(RP,vec2(t*0.996+0.002,0.5)).rgb;if(mode==7)col*=0.3+0.7*v.b;}
o=vec4(col,op*ea);}`;
  function sh(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s}
  const vs=sh(gl.VERTEX_SHADER,VS);
  function prog(fs){const p=gl.createProgram();gl.attachShader(p,vs);gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
    const u={};const n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);for(let k=0;k<n;k++){const a=gl.getActiveUniform(p,k);u[a.name]=gl.getUniformLocation(p,a.name)}return {p,u}}
  const P={dec:prog(DEC),blur:prog(BLUR),val:prog(VAL),fin:prog(FIN)};
  gl.bindVertexArray(gl.createVertexArray());
  function tex(w,h,fmt,data){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
    if(fmt==='rgba8')gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,data||null);
    else if(fmt==='r32f')gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,w,h,0,gl.RED,gl.FLOAT,null);
    else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,w,h,0,gl.RGBA,gl.FLOAT,null);
    const f=fmt==='ramp'?gl.LINEAR:gl.NEAREST;gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,f);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,f);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t}
  function fbo(t){const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);return f}
  let T={},rampTex=null,rampName=null,blurKey=null,haveBlur=false;
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
      if(S.mode===3||S.mode>=6){if(blurKey!==key){const rad=Math.min(200,Math.ceil(sig*3));gl.useProgram(P.blur.p);gl.uniform1f(P.blur.u.sig,sig);gl.uniform1i(P.blur.u.rad,rad);
        gl.uniform2i(P.blur.u.dir,1,0);bindT(0,T.H.tex,P.blur,'H');quad(P.blur,T.B1.fb,mz.w,mz.h);
        gl.useProgram(P.blur.p);gl.uniform2i(P.blur.u.dir,0,1);bindT(0,T.B1.tex,P.blur,'H');quad(P.blur,T.B2.fb,mz.w,mz.h);blurKey=key}}
      const p=P.val;gl.useProgram(p.p);bindT(0,T.H.tex,p,'H');bindT(1,T.B2.tex,p,'B');gl.uniform1i(p.u.mode,S.mode);gl.uniform1f(p.u.mpp,vw.mpp);gl.uniform1f(p.u.ve,S.ve);
      gl.uniform1f(p.u.az,S.az);gl.uniform1f(p.u.el,S.el);gl.uniform1f(p.u.radpx,Math.max(2,Math.min(120,S.rad/vw.mpp)));
      gl.bindFramebuffer(gl.FRAMEBUFFER,T.V.fb);gl.disable(gl.SCISSOR_TEST);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
      quad(p,T.V.fb,mz.w,mz.h,[box.x,box.y,box.w,box.h])},
    readBox(box){gl.bindFramebuffer(gl.FRAMEBUFFER,T.V.fb);const a=new Float32Array(box.w*box.h*4);gl.readPixels(box.x,box.y,box.w,box.h,gl.RGBA,gl.FLOAT,a);return a},
    draw(vw,lo,hi){if(rampName!==S.ramp){if(rampTex)gl.deleteTexture(rampTex);rampTex=tex(256,1,'rgba8',rampBytes(S.ramp));gl.bindTexture(gl.TEXTURE_2D,rampTex);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);rampName=S.ramp}
      const p=P.fin;gl.useProgram(p.p);bindT(0,T.V.tex,p,'V');bindT(1,rampTex,p,'RP');const dpr=cvDpr;
      gl.uniform2f(p.u.tl,vw.tl[0],vw.tl[1]);gl.uniform2f(p.u.org,vw.org[0],vw.org[1]);gl.uniform2f(p.u.lc,lensC[0],lensC[1]);gl.uniform1f(p.u.sc,vw.sc);gl.uniform1f(p.u.dpr,dpr);
      gl.uniform1f(p.u.ch,cv.height);gl.uniform1f(p.u.lr,S.ls/2);gl.uniform1f(p.u.lo,lo);gl.uniform1f(p.u.hi,hi);gl.uniform1f(p.u.gm,S.gm);gl.uniform1f(p.u.op,S.op);
      gl.uniform1i(p.u.fs,S.fs?1:0);gl.uniform1i(p.u.mode,S.mode);
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
      let BL=null;if(S.mode===3||S.mode>=6){const sig=Math.max(0.6,S.rad/mpp),m=Math.ceil(sig*3),x0=Math.max(0,bx.x-m),y0=Math.max(0,bx.y-m),x1=Math.min(W,bx.x+w+m),y1=Math.min(Hgt,bx.y+h+m),ww=x1-x0,hw=y1-y0;
        const sub=new Float32Array(ww*hw);for(let y=0;y<hw;y++)for(let x=0;x<ww;x++)sub[y*ww+x]=Hh[(y+y0)*W+x+x0];const t1=new Float32Array(ww*hw),t2=new Float32Array(ww*hw);blur1(sub,t1,ww,hw,sig,true);blur1(t1,t2,ww,hw,sig,false);BL=(x,y)=>t2[(y-y0)*ww+(x-x0)]}
      const sh=(nx,ny,nz,a)=>Math.max(0,nx*Math.sin(a)*Math.cos(E)+ny*Math.cos(a)*Math.cos(E)+nz*Math.sin(E));const radpx=Math.max(2,Math.min(120,S.rad/mpp));
      for(let j=0;j<h;j++)for(let i=0;i<w;i++){const x=bx.x+i,y=bx.y+j,o=(j*w+i)*4;
        const a=hh(x-1,y-1),b=hh(x,y-1),c=hh(x+1,y-1),d=hh(x-1,y),h0=hh(x,y),f=hh(x+1,y),g=hh(x-1,y+1),hb=hh(x,y+1),ii=hh(x+1,y+1);
        if(Math.min(a,b,c,d,h0,f,g,hb,ii)<-9000)continue;
        const gx=((c+2*f+ii)-(a+2*d+g))/(8*mpp),gn=-((g+2*hb+ii)-(a+2*b+c))/(8*mpp);let nx=-gx*ve,ny=-gn*ve,nz=1;const L=Math.hypot(nx,ny,nz);nx/=L;ny/=L;nz/=L;
        const slope=Math.atan(Math.hypot(gx,gn)*ve)*180/Math.PI,hs=sh(nx,ny,nz,A);let mh=0;for(let k=0;k<8;k++)mh+=sh(nx,ny,nz,A+k*Math.PI/4);mh/=8;
        let r=0,G=slope,B=hs;const m=S.mode;
        if(m===0)r=hs;else if(m===1){r=mh;B=mh}else if(m===2)r=slope;else if(m===3||m>=6){const bl=BL(x,y);r=bl>-9000?h0-bl:0;B=mh}
        else if(m===4){let sv=0;for(let k=0;k<12;k++){const t=k*Math.PI/6,dx=Math.cos(t),dy=Math.sin(t);let mxa=0;for(let s=1;s<=10;s++){const dist=Math.max(1,radpx*Math.pow(s/10,1.6));const hq=hh(Math.round(x+dx*dist),Math.round(y+dy*dist));if(hq<-9000)continue;mxa=Math.max(mxa,Math.atan2((hq-h0)*ve,dist*mpp))}sv+=Math.sin(mxa)}r=1-sv/12}
        else if(m===5){r=(Math.atan2(-gx,-gn)*180/Math.PI+360)%360;B=mh}
        Vv[o]=r;Vv[o+1]=G;Vv[o+2]=B;Vv[o+3]=1}},
    readBox(bx){return Vv},
    draw(vw,lo,hi){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,cv.width,cv.height);if(!Vv)return;const w=box.w,h=box.h;oc.width=w;oc.height=h;const im=ox.createImageData(w,h),q=im.data,rb=rampBytes(S.ramp);
      for(let k=0;k<w*h;k++){if(!Vv[k*4+3])continue;const m=S.mode,sv=m===5?Vv[k*4+1]:Vv[k*4];let t=Math.min(1,Math.max(0,(sv-lo)/Math.max(hi-lo,1e-6)));t=Math.pow(t,S.gm);let R,G,B;
        if(m===5){const hh=Vv[k*4]/360,v=0.35+0.65*Vv[k*4+2],kk=n=>{const x=(n+hh*6)%6;return v-v*t*Math.max(0,Math.min(1,Math.min(x,4-x)))};R=kk(5)*255;G=kk(3)*255;B=kk(1)*255}
        else if(m===6){const s=Math.min(1,Vv[k*4+1]/40);R=t*255;G=t*(1-0.8*s)*255;B=t*(1-0.95*s)*255}
        else{const ix=Math.round(t*255)*4,f=m===7?0.3+0.7*Vv[k*4+2]:1;R=rb[ix]*f;G=rb[ix+1]*f;B=rb[ix+2]*f}
        q[k*4]=R;q[k*4+1]=G;q[k*4+2]=B;q[k*4+3]=255}
      ox.putImageData(im,0,0);ctx.save();ctx.scale(cvDpr,cvDpr);if(!S.fs){ctx.beginPath();ctx.arc(lensC[0],lensC[1],S.ls/2,0,Math.PI*2);ctx.clip()}
      ctx.globalAlpha=S.op;ctx.imageSmoothingEnabled=vw.sc<1;ctx.translate(-vw.tl[0],-vw.tl[1]);ctx.scale(vw.sc,vw.sc);ctx.drawImage(oc,vw.org[0]+box.x,vw.org[1]+box.y);ctx.restore()},
    clear(){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,cv.width,cv.height)}}}
try{if(!forceCPU)R=makeGL()}catch(e){console.error(e);R=null}
if(!R){try{R=makeCPU();if(!cv.getContext('2d'))throw new Error('no 2d')}catch(e){R=null}
  if(R)msg('This browser has no WebGL2 float support: using the basic (slower) renderer. All modes still work.',6000);
  else{const nop=()=>{};R={kind:'none',newMosaic:nop,putTile:nop,decode:nop,compute:nop,readBox:()=>null,draw:nop,clear:nop};
    msg('This browser cannot draw the LiDAR (no WebGL or canvas). The background map, Go to and records still work; try an up-to-date Chrome, Firefox, Safari or Samsung Internet.',0)}}
window.__lens={layersCtl,renderer:()=>R.kind,stretch:()=>lastStretch,S,map,CFG,LC,msg,lensState:()=>({c:lensC.slice(),ls:S.ls,fs:S.fs})};
// ---------- render loop ----------
let cvDpr=1,mosaicReady=false,pending=false,lastStretch=null;
function resizeCanvas(){cvDpr=Math.min(2,window.devicePixelRatio||1);const [w,h]=mapSize();cv.style.width=w+'px';cv.style.height=h+'px';cv.width=Math.round(w*cvDpr);cv.height=Math.round(h*cvDpr)}
function buildMosaic(){const want=wantMosaic();if(!want){MZ=null;mosaicReady=false;R.clear();return}
  const need=[];for(let j=0;j<want.ny;j++)for(let i=0;i<want.nx;i++)need.push([want.x0+i,want.y0+j,i*256,j*256]);
  let missing=0;const imgs=need.map(([x,y,px,py])=>{const im=getTile(want.zt,x,y,scheduleMosaic);if(!im){const t=tileCache.get(want.zt+'/'+x+'/'+y);if(!t||!t.failed)missing++}return im});
  MZ=want;R.newMosaic(want);need.forEach(([x,y,px,py],k)=>{if(imgs[k])R.putTile(imgs[k],px,py)});R.decode(want);mosaicReady=true;
  if(LC.live&&!SW_WAIT&&map.getZoom()>=(LC.live.minzoom||13)-0.25){const failed=need.filter(([x,y])=>{const t=tileCache.get(want.zt+'/'+x+'/'+y);return t&&t.failed}).length;   // (nearly) every tile empty: say why, not a blank lens
    if(failed&&failed>=need.length*0.75)msg(NO_LIDAR);else if($('msg').textContent===NO_LIDAR)msg('',1)}
  {const ld=document.getElementById('loading');if(SW_WAIT)missing=need.length;if(ld){ld.hidden=!missing;if(missing)document.getElementById('loadt').textContent='Loading LiDAR… ('+missing+' tiles)'}}requestRender(true)}
// tiles arrive in bursts: coalesce rebuilds (each one re-decodes the whole mosaic)
let mosT=null,mosFirst=0;function scheduleMosaic(){clearTimeout(mosT);const now=performance.now();if(!mosFirst)mosFirst=now;
  mosT=setTimeout(()=>{mosFirst=0;buildMosaic()},now-mosFirst>600?0:150)}
window.__lensMos=true;   // from here on, moving or resizing the lens may rebuild the (live, lens-only) mosaic
function lensBox(vw){if(S.fs)return {x:0,y:0,w:MZ.w,h:MZ.h};const r=S.ls/2,m=3;
  const x0=Math.floor((vw.tl[0]+lensC[0]-r)/vw.sc-vw.org[0])-m,y0=Math.floor((vw.tl[1]+lensC[1]-r)/vw.sc-vw.org[1])-m,x1=Math.ceil((vw.tl[0]+lensC[0]+r)/vw.sc-vw.org[0])+m,y1=Math.ceil((vw.tl[1]+lensC[1]+r)/vw.sc-vw.org[1])+m;
  const X0=Math.max(0,x0),Y0=Math.max(0,y0),X1=Math.min(MZ.w,x1),Y1=Math.min(MZ.h,y1);return {x:X0,y:Y0,w:Math.max(1,X1-X0),h:Math.max(1,Y1-Y0)}}
function stretch(vw,box){const base=MODE_RANGE[S.mode];let lo=base[0],hi=base[1];
  if(S.auto){const a=R.readBox(box),ch=S.mode===5?1:0,vals=[];const r=S.ls/2/vw.sc,cx=(vw.tl[0]+lensC[0])/vw.sc-vw.org[0],cy=(vw.tl[1]+lensC[1])/vw.sc-vw.org[1];
    const step=Math.max(1,Math.floor(Math.sqrt(box.w*box.h/40000)));
    for(let j=0;j<box.h;j+=step)for(let i=0;i<box.w;i+=step){const k=(j*box.w+i)*4;if(a[k+3]<0.5)continue;if(!S.fs&&Math.hypot(box.x+i+0.5-cx,box.y+j+0.5-cy)>r)continue;vals.push(a[k+ch])}
    if(vals.length>20){vals.sort((x,y)=>x-y);const q=p=>vals[Math.min(vals.length-1,Math.floor(p*vals.length))];lo=q(0.02);hi=q(0.98);
      if(DIVERGING(S.mode)){const m=Math.max(Math.abs(lo),Math.abs(hi),1e-3);lo=-m;hi=m}if(hi-lo<1e-6)hi=lo+1e-3}}
  const c=(lo+hi)/2,hw=(hi-lo)/2/S.ct;lastStretch=[c-hw,c+hw];return lastStretch}
function render(){pending=false;if(R.kind==='none')return;if(!mosaicReady||!MZ){R.clear();return}const vw=view();const box=lensBox(vw);R.compute(MZ,vw,box);const [lo,hi]=stretch(vw,box);R.draw(vw,lo,hi);
  $('about').dataset.range=lo.toFixed(3)+' … '+hi.toFixed(3)}
function requestRender(){if(!pending){pending=true;requestAnimationFrame(render)}}
map.on('move',requestRender);map.on('moveend',()=>{scheduleMosaic();saveHash();liveHint()});
// live mode: below the worker's first zoom the lens is empty, so say why
map.whenReady(()=>setTimeout(()=>liveHint(),300));
const NO_LIDAR=LC.noLidarText||'Little or no LiDAR here: the Environment Agency survey covers England only, and stops at the coast.';
map.on('baselayerchange',()=>liveHint());
function liveHint(){if(!LC.live)return;const mz=LC.live.minzoom||13;if(map.getZoom()<mz-0.25)msg('Zoom in to see live LiDAR in the lens (zoom '+mz+'+).'+(S.base==='eahs'?' The background is the EA LiDAR hillshade.':' Zoomed out, choose the EA LiDAR hillshade background on the layers button.'));else if($('msg').textContent.startsWith('Zoom in to see live'))msg('',1)}
map.on('zoomstart',()=>{cv.style.visibility='hidden'});map.on('zoomend',()=>{cv.style.visibility='visible';scheduleMosaic()});
map.on('resize',()=>{resizeCanvas();placeLens();scheduleMosaic()});
// ---------- controls ----------
const ctl=[['mode','',v=>+v],['el','°',v=>+v],['ve','x',v=>+v],['rad',' m',v=>+v],['ct','x',v=>+v],['gm','',v=>+v],['op','',v=>+v],['ls',' px',v=>+v]];
function syncUI(){ctl.forEach(([k,u])=>{const e=$(k);if(e)e.value=S[k];const o=$(k+'v');if(o)o.textContent=(k==='op'?Math.round(S[k]*100)+'%':S[k]+u)});
  $('ramp').value=S.ramp;$('auto').checked=S.auto;$('fs').checked=S.fs;$('sm').checked=S.sm;$('azv').textContent=Math.round(S.az)+'°';drawDial();
  $('sunbox').style.display=(S.mode===0||S.mode===1||S.mode===5||S.mode===7)?'':'none';$('radbox').style.display=(S.mode===3||S.mode===4||S.mode>=6)?'':'none';
  $('ramp').disabled=S.mode===5||S.mode===6}
ctl.forEach(([k,u,f])=>{const e=$(k);e.addEventListener('input',()=>{S[k]=f(e.value);if(k==='mode'){S.ramp=MODE_RAMP[S.mode]}if(k==='ls')placeLens();syncUI();requestRender();saveHashSoon()})});
$('ramp').onchange=e=>{S.ramp=e.target.value;requestRender();saveHashSoon()};
$('auto').onchange=e=>{S.auto=e.target.checked;requestRender();saveHashSoon()};
$('fs').onchange=e=>{S.fs=e.target.checked;placeLens();requestRender();saveHashSoon()};
$('sm').onchange=e=>{S.sm=e.target.checked;setSM(S.sm);saveHashSoon()};
function resetDefaults(){clearTimeout(hT);const keep={base:S.base,sm:S.sm};Object.assign(S,DEF,keep);S.ramp=MODE_RAMP[S.mode];
  const [w,h]=mapSize();S.ls=Math.min(DEF.ls,Math.max(150,Math.min(w,h)-40));lensC=defaultLensC();placeLens();syncUI();requestRender();
  try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}suppressHash=true;setTimeout(()=>{suppressHash=false},400);msg('Settings reset to defaults',1800)}
$('reset').onclick=resetDefaults;window.__lens.reset=resetDefaults;
$('toggle').onclick=()=>$('panel').classList.toggle('hide');
if(window.innerWidth<700)$('panel').classList.add('hide');
// sun dial
const dial=$('dial'),dx=dial.getContext('2d')||new Proxy({},{get:()=>()=>{},set:()=>true});
function drawDial(){const w=dial.width,c=w/2,r=c-14;dx.clearRect(0,0,w,w);dx.lineWidth=3;dx.strokeStyle='#888';dx.beginPath();dx.arc(c,c,r,0,7);dx.stroke();
  dx.fillStyle='#333';dx.font='bold 20px system-ui';dx.textAlign='center';dx.textBaseline='middle';[['N',0],['E',90],['S',180],['W',270]].forEach(([t,a])=>{const q=a*Math.PI/180;dx.fillText(t,c+Math.sin(q)*(r-20),c-Math.cos(q)*(r-20))});
  const q=S.az*Math.PI/180;dx.strokeStyle='#f59e0b';dx.lineWidth=6;dx.beginPath();dx.moveTo(c,c);dx.lineTo(c+Math.sin(q)*r,c-Math.cos(q)*r);dx.stroke();
  dx.fillStyle='#f59e0b';dx.beginPath();dx.arc(c+Math.sin(q)*r,c-Math.cos(q)*r,11,0,7);dx.fill()}
let dd=false;const dialSet=e=>{const b=dial.getBoundingClientRect();S.az=Math.round((Math.atan2(e.clientX-b.left-b.width/2,-(e.clientY-b.top-b.height/2))*180/Math.PI+360)%360);syncUI();requestRender();saveHashSoon()};
dial.addEventListener('pointerdown',e=>{dd=true;dial.setPointerCapture(e.pointerId);dialSet(e)});dial.addEventListener('pointermove',e=>{if(dd)dialSet(e)});dial.addEventListener('pointerup',()=>dd=false);
// ---------- share hash ----------
function hashStr(){const c=map.getCenter(),ll=map.containerPointToLatLng(lensC);const p=new URLSearchParams();
  p.set('c',c.lat.toFixed(5)+','+c.lng.toFixed(5)+','+map.getZoom());p.set('l',ll.lat.toFixed(5)+','+ll.lng.toFixed(5));
  ['mode','az','el','ve','rad','ct','gm','op','ls'].forEach(k=>p.set(k,S[k]));p.set('ramp',S.ramp);p.set('auto',S.auto?1:0);p.set('fs',S.fs?1:0);p.set('sm',S.sm?1:0);p.set('base',S.base);if(window.__lensHashExtra)window.__lensHashExtra(p);return p.toString()}
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
map.on('click',async e=>{if(tool==='whatis'){toolHooks.whatis.click(e.latlng);return}if(tool!=='profile')return;
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
$('about').innerHTML='Elevation: Environment Agency LiDAR Composite DTM 1 m (OGL), '+(LC.dataNote||'')+' Terrarium-encoded lossless WebP tiles. Beyond z17 the lens magnifies the z17 data. Heights quantised to 1/64 m. Renderer: <b>'+R.kind+'</b>. Hillshade uses Horn gradients; multi-direction = 8 suns 45° apart; LRM = DTM minus Gaussian blur (σ = radius); sky-view factor = 16 directions, horizon search out to the radius; red relief = LRM lightness with slope as red. Auto-stretch uses the 2-98% range inside the lens (symmetric for relief modes).<br><br><b>What is it?</b> On click only (no candidate lists): measures the shape around the spot from the z17 tiles (multi-scale local relief, footprint at ~20% height, height above a plane fitted just outside, length/width, plateau fraction for domed vs flat, 90th-percentile slope for edge sharpness, radial rim test for hollows, cross-axis step for lynchets) and adds OS OpenMap / OSM context. Records within 100 m: '+(LC.herLong||'local HER (information only)').replace(/&/g,'&amp;')+', NHLE scheduled monuments and listed buildings, HE Aerial Investigation &amp; Mapping, OSM historic features (community map). Grid refs use OSTN15 (correction grid) on top of a Helmert transform. Place search: Nominatim (submit only, max 1 request/s) and postcodes.io.';
Object.assign(window.__lens,{H0,saveHashSoon,RAMPS,syncUI,resetLens:()=>{lensC=defaultLensC();placeLens();requestRender()},tileData,heightAt,setTool,tool:()=>tool,toolHooks,profPts:()=>profPts.length,profShown:()=>$('prof').style.display==='block'&&!!profLine,updateToolButtons});
resizeCanvas();syncUI();if(S.sm)setSM(true);buildMosaic();
})();
