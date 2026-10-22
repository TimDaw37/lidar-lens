const HL=(window.LENS_CONFIG&&LENS_CONFIG.herShort)||'HER', HLL=(window.LENS_CONFIG&&LENS_CONFIG.herLong)||'local HER (information only)';
/* LiDAR Lens tools: OS grid conversion, Go to, Where am I, GPS, and 'What is it?' (on-click only; no candidate lists). */
(function(){
'use strict';
const LZ=window.__lens,map=LZ.map,$=id=>document.getElementById(id),msg=LZ.msg;
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// ===================== OSGB36 / British National Grid =====================
// 7-parameter Helmert + Transverse Mercator, refined with an OSTN15 correction grid (data/ostn_grid.json) where available.
const D2R=Math.PI/180;
const WGS={a:6378137,b:6356752.314245},AIRY={a:6377563.396,b:6356256.909};
const H_FWD={tx:-446.448,ty:125.157,tz:-542.060,s:20.4894,rx:-0.1502,ry:-0.2470,rz:-0.8421};
function toCart(lat,lng,e){const f=lat*D2R,l=lng*D2R,e2=1-e.b*e.b/(e.a*e.a),nu=e.a/Math.sqrt(1-e2*Math.sin(f)**2);
  return [nu*Math.cos(f)*Math.cos(l),nu*Math.cos(f)*Math.sin(l),nu*(1-e2)*Math.sin(f)]}
function fromCart(x,y,z,e){const e2=1-e.b*e.b/(e.a*e.a),p=Math.hypot(x,y);let f=Math.atan2(z,p*(1-e2));
  for(let i=0;i<10;i++){const nu=e.a/Math.sqrt(1-e2*Math.sin(f)**2);f=Math.atan2(z+e2*nu*Math.sin(f),p)}return [f/D2R,Math.atan2(y,x)/D2R]}
function helm([x,y,z],t,sign){const s=1+sign*t.s*1e-6,k=sign*D2R/3600,rx=t.rx*k,ry=t.ry*k,rz=t.rz*k,tx=sign*t.tx,ty=sign*t.ty,tz=sign*t.tz;
  return [tx+x*s-y*rz+z*ry,ty+x*rz+y*s-z*rx,tz-x*ry+y*rx+z*s]}
const F0=0.9996012717,LAT0=49*D2R,LNG0=-2*D2R,E0=400000,N0=-100000;
function tmM(f,a,b){const n=(a-b)/(a+b),n2=n*n,n3=n2*n;return b*F0*((1+n+1.25*n2+1.25*n3)*(f-LAT0)-(3*n+3*n2+21/8*n3)*Math.sin(f-LAT0)*Math.cos(f+LAT0)+(15/8*n2+15/8*n3)*Math.sin(2*(f-LAT0))*Math.cos(2*(f+LAT0))-35/24*n3*Math.sin(3*(f-LAT0))*Math.cos(3*(f+LAT0)))}
function tmFwd(lat,lng){const {a,b}=AIRY,f=lat*D2R,l=lng*D2R,e2=1-b*b/(a*a),sf=Math.sin(f),cf=Math.cos(f),tf=Math.tan(f);
  const nu=a*F0/Math.sqrt(1-e2*sf*sf),rho=a*F0*(1-e2)/Math.pow(1-e2*sf*sf,1.5),eta2=nu/rho-1,M=tmM(f,a,b);
  const I=M+N0,II=nu/2*sf*cf,III=nu/24*sf*cf**3*(5-tf*tf+9*eta2),IIIA=nu/720*sf*cf**5*(61-58*tf*tf+tf**4),IV=nu*cf,V=nu/6*cf**3*(nu/rho-tf*tf),VI=nu/120*cf**5*(5-18*tf*tf+tf**4+14*eta2-58*tf*tf*eta2);
  const dl=l-LNG0;return [E0+IV*dl+V*dl**3+VI*dl**5,I+II*dl*dl+III*dl**4+IIIA*dl**6]}
function tmInv(E,N){const {a,b}=AIRY,e2=1-b*b/(a*a);let f=LAT0,M=0;do{f=(N-N0-M)/(a*F0)+f;M=tmM(f,a,b)}while(Math.abs(N-N0-M)>=1e-5);
  const sf=Math.sin(f),cf=Math.cos(f),tf=Math.tan(f),nu=a*F0/Math.sqrt(1-e2*sf*sf),rho=a*F0*(1-e2)/Math.pow(1-e2*sf*sf,1.5),eta2=nu/rho-1;
  const VII=tf/(2*rho*nu),VIII=tf/(24*rho*nu**3)*(5+3*tf*tf+eta2-9*tf*tf*eta2),IX=tf/(720*rho*nu**5)*(61+90*tf*tf+45*tf**4),X=1/(cf*nu),XI=1/(cf*6*nu**3)*(nu/rho+2*tf*tf),XII=1/(cf*120*nu**5)*(5+28*tf*tf+24*tf**4),XIIA=1/(cf*5040*nu**7)*(61+662*tf*tf+1320*tf**4+720*tf**6);
  const dE=E-E0;return [(f-VII*dE*dE+VIII*dE**4-IX*dE**6)/D2R,(LNG0+X*dE-XI*dE**3+XII*dE**5-XIIA*dE**7)/D2R]}
const ogDec=g=>{if(g&&g.enc==='cm-delta')for(const k of['de','dn']){let v=0;g[k]=g[k].map(d=>(v+=d)/100)}return g};   // see build_site.mjs
let OG=null;fetch(LZ.LC.osgbGrid||'data/ostn_grid.json').then(r=>r.ok?r.json():null).then(g=>{OG=ogDec(g);g=OG;if(g&&g.test){const t=g.test[0],en=ll2en(t[0],t[1]);LZ.osgbCheck=[en[0]-t[2],en[1]-t[3]]}}).catch(()=>{});
function corr(lat,lng){if(!OG)return [0,0];const fy=(lat-OG.lat0)/OG.step,fx=(lng-OG.lng0)/OG.step;if(fy<0||fx<0||fy>OG.nlat-1||fx>OG.nlng-1)return [0,0];
  const i=Math.min(OG.nlat-2,Math.floor(fy)),j=Math.min(OG.nlng-2,Math.floor(fx)),ty=fy-i,tx=fx-j,k=i*OG.nlng+j,bl=a=>(a[k]*(1-tx)+a[k+1]*tx)*(1-ty)+(a[k+OG.nlng]*(1-tx)+a[k+OG.nlng+1]*tx)*ty;return [bl(OG.de),bl(OG.dn)]}
function ll2en(lat,lng){const c=helm(toCart(lat,lng,WGS),H_FWD,1),[la,lo]=fromCart(c[0],c[1],c[2],AIRY),[E,N]=tmFwd(la,lo),d=corr(lat,lng);return [E+d[0],N+d[1]]}
function en2ll(E,N){let lat,lng,d=[0,0];for(let it=0;it<3;it++){const [la,lo]=tmInv(E-d[0],N-d[1]);const c=helm(toCart(la,lo,AIRY),H_FWD,-1);[lat,lng]=fromCart(c[0],c[1],c[2],WGS);d=corr(lat,lng)}return [lat,lng]}
function gridRef(E,N,digits){digits=digits||10;if(!(E>=0&&N>=0&&E<700000&&N<1300000))return '';const e1=Math.floor(E/1e5),n1=Math.floor(N/1e5);
  let l1=(19-n1)-(19-n1)%5+Math.floor((e1+10)/5),l2=(19-n1)*5%25+e1%5;if(l1>7)l1++;if(l2>7)l2++;const h=digits/2,div=Math.pow(10,5-h);
  const pad=v=>String(Math.floor(((v+0.01)%1e5)/div)).padStart(h,'0');return String.fromCharCode(65+l1)+String.fromCharCode(65+l2)+' '+pad(E)+' '+pad(N)}
function parseGridRef(s){const m=s.toUpperCase().replace(/[^A-Z0-9]/g,' ').trim().match(/^([A-HJ-Z])\s*([A-HJ-Z])\s*([\d ]*)$/);if(!m)return null;
  let l1=m[1].charCodeAt(0)-65,l2=m[2].charCodeAt(0)-65;if(l1>7)l1--;if(l2>7)l2--;
  const e1=((l1-2)%5)*5+l2%5,n1=19-Math.floor(l1/5)*5-Math.floor(l2/5);if(e1<0||e1>6||n1<0||n1>12)return null;
  const groups=m[3].trim().split(/\s+/).filter(Boolean);let de,dn;
  if(groups.length===2&&groups[0].length===groups[1].length){de=groups[0];dn=groups[1]}else{const all=groups.join('');if(all.length%2||all.length>10)return null;de=all.slice(0,all.length/2);dn=all.slice(all.length/2)}
  const h=de.length;if(h>5)return null;const unit=Math.pow(10,5-h),E=e1*1e5+(h?(+de)*unit:0)+unit/2,N=n1*1e5+(h?(+dn)*unit:0)+unit/2;
  return {E,N,prec:unit,label:gridRef(E,N,Math.max(2,h*2))}}
LZ.osgb={ll2en,en2ll,gridRef,parseGridRef};
// ===================== Go to =====================
const gores=$('gores');let lastNom=0,gotoMk=null;const geoCache=new Map();
function showRes(items){gores.innerHTML='';items.forEach(it=>{const d=document.createElement('div');if(it.err){d.className='err';d.textContent=it.err}else{d.textContent=it.label;d.onclick=()=>{goto(it.lat,it.lng,it.z,it.name||it.label);gores.innerHTML=''}}gores.appendChild(d)})}
function goto(lat,lng,z,label){map.setView([lat,lng],Math.max(map.getZoom(),z||16));if(gotoMk)map.removeLayer(gotoMk);
  gotoMk=L.circleMarker([lat,lng],{radius:7,color:'#2563eb',weight:3,fill:false,interactive:false}).addTo(map);setTimeout(()=>{if(gotoMk){map.removeLayer(gotoMk);gotoMk=null}},8000);
  if(label)msg('Go to: '+label,2500)}
function parseLatLng(q){const t=q.trim().toUpperCase().replace(/°/g,' ');const m=t.match(/^(-?\d+(?:\.\d+)?)\s*([NS])?\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*([EW])?$/);if(!m)return null;
  let a=+m[1],b=+m[3];if(m[2]==='S')a=-a;if(m[4]==='W')b=-b;return [a,b,!!(m[2]||m[4])]}
async function doGoto(q){q=q.trim();if(!q)return;gores.innerHTML='';
  const gr=parseGridRef(q);if(gr){const [la,lo]=en2ll(gr.E,gr.N);goto(la,lo,gr.prec<=10?18:gr.prec<=100?17:15,gr.label+' (±'+gr.prec/2+' m)');return}
  const nums=q.replace(/[,;]/g,' ').trim().split(/\s+/);
  if(nums.length===2&&nums.every(x=>/^-?\d+(\.\d+)?$/.test(x))){const a=+nums[0],b=+nums[1];
    if(Math.abs(a)>1000&&Math.abs(b)>1000){if(a>=0&&a<700000&&b>=0&&b<1300000){const [la,lo]=en2ll(a,b);goto(la,lo,18,'E '+a+' N '+b+' ('+gridRef(a,b)+')');return}showRes([{err:'Easting/northing out of range'}]);return}}
  const ll=parseLatLng(q);if(ll){let [a,b]=ll;if(!ll[2]&&Math.abs(a)<=10&&b>=49&&b<=61){[a,b]=[b,a]}if(Math.abs(a)<=90&&Math.abs(b)<=180){goto(a,b,17,a.toFixed(5)+', '+b.toFixed(5));return}}
  const pc=q.toUpperCase().replace(/\s+/g,'');
  if(/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(pc)){try{const r=await fetch('https://api.postcodes.io/postcodes/'+encodeURIComponent(pc));const j=await r.json();
      if(j.status===200&&j.result){goto(j.result.latitude,j.result.longitude,16,j.result.postcode+' (postcode centroid)');return}showRes([{err:'Postcode not found'}]);return}catch(e){showRes([{err:'Postcode lookup failed'}]);return}}
  if(/^[A-Z]{1,2}\d[A-Z\d]?$/.test(pc)){try{const r=await fetch('https://api.postcodes.io/outcodes/'+encodeURIComponent(pc));const j=await r.json();if(j.status===200&&j.result){goto(j.result.latitude,j.result.longitude,13,j.result.outcode+' (postcode district)');return}}catch(e){}}
  // place name: Nominatim, UK-only, biased to the configured viewbox; at most one request per 1.1 s, submit-only (no autocomplete), cached
  const key=q.toLowerCase();if(geoCache.has(key)){showRes(geoCache.get(key));return}
  const wait=lastNom+1100-Date.now();if(wait>0){showRes([{err:'Searching…'}]);await new Promise(r=>setTimeout(r,wait))}lastNom=Date.now();showRes([{err:'Searching…'}]);
  try{const u='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes='+((LZ.LC.geocoder||{}).countrycodes||'gb')+'&accept-language=en&viewbox='+encodeURIComponent((LZ.LC.geocoder||{}).viewbox||'')+'&bounded=0&q='+encodeURIComponent(q);
    const r=await fetch(u,{headers:{'Accept':'application/json'}});const j=await r.json();
    const items=j.map(x=>({lat:+x.lat,lng:+x.lon,label:x.display_name,z:x.type==='house'?18:(x.place_rank>=20?16:13)}));
    // near misses: only when nothing but single buildings matched (e.g. 'Barnstable' finds two houses of that name), ask a fuzzy geocoder
    if(!j.some(x=>x.category!=='building')){const dm=await nearMiss(q);if(dm.length){const all=dm.concat(items);geoCache.set(key,all);showRes(all);return}}
    if(!items.length){showRes([{err:'No match (try a grid ref or postcode)'}]);return}geoCache.set(key,items);if(items.length===1){goto(items[0].lat,items[0].lng,items[0].z,items[0].label);gores.innerHTML=''}else showRes(items)}
  catch(e){showRes([{err:'Place search failed (Nominatim)'}])}}
// 'Did you mean': Photon (OpenStreetMap, typo-tolerant) within Great Britain; keep the 1-2 names closest to what was typed
function lev(a,b){const m=a.length,n=b.length,d=Array.from({length:n+1},(_,j)=>j);for(let i=1;i<=m;i++){let p=d[0];d[0]=i;for(let j=1;j<=n;j++){const t=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,p+(a[i-1]===b[j-1]?0:1));p=t}}return d[n]}
async function nearMiss(q){try{const norm=t=>t.toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim(),nq=norm(q);
  const r=await fetch('https://photon.komoot.io/api/?limit=10&lang=en&bbox=-8.7,49.8,1.9,60.9&q='+encodeURIComponent(q),window.AbortSignal&&AbortSignal.timeout?{signal:AbortSignal.timeout(2500)}:{});   // Photon is a free public service and can be slow: don't hold up Go toif(!r.ok)return [];const j=await r.json(),seen=new Set(),out=[];
  (j.features||[]).map((f,i)=>{const p=f.properties||{},n=p.name||'';return {i,p,n,c:f.geometry&&f.geometry.coordinates,d:lev(nq,norm(n))}})
    .filter(x=>x.c&&x.n&&!['house','street'].includes(x.p.type)&&x.n.toLowerCase()!==q.toLowerCase().trim()&&x.d<=Math.max(2,Math.round(nq.length/4)))
    .sort((a,b)=>a.d-b.d||a.i-b.i).forEach(x=>{const where=x.p.county||x.p.state||'',k=x.n+'|'+where;if(out.length<2&&!seen.has(k)){seen.add(k);
      out.push({lat:x.c[1],lng:x.c[0],z:['city','town','district','county'].includes(x.p.type)?13:16,name:x.n+(where?', '+where:''),label:'Did you mean '+x.n+(where?' ('+where+')':'')+'?'})}});
  return out}catch(e){return []}}
$('goto').addEventListener('submit',e=>{e.preventDefault();if(matchMedia('(pointer:coarse)').matches)$('gotoq').blur();doGoto($('gotoq').value)});   // touch: drop the on-screen keyboard so the map shows
LZ.doGoto=doGoto;
// ===================== Where am I =====================
let wPos=null,wSrc='Centre',wT=null,hoverOK=false;
function fmtPos(ll){const [E,N]=ll2en(ll.lat,ll.lng);return {gr:gridRef(E,N),ll:ll.lat.toFixed(5)+', '+ll.lng.toFixed(5),E,N}}
function updWhere(ll,src){wPos=ll;wSrc=src;const f=fmtPos(ll);$('wlab').textContent=src;$('wgr').textContent=f.gr||'outside GB grid';$('wll').textContent=f.ll;
  clearTimeout(wT);wT=setTimeout(async()=>{const h=await LZ.heightAt(ll);if(wPos===ll)$('wh').textContent=h==null?'':h.toFixed(1)+' m OD'},120)}
// show the cursor position for a real mouse/pen; touch devices show the map centre instead
// Pin: a click on the map (with no tool on) fixes the readout there, so the pointer can go to Copy without moving it.
// Clicking again moves the pin; Esc or clicking the 'Pinned' label releases it.
let pinned=false,pinMk=null;
function pin(ll){pinned=true;updWhere(ll,'Pinned');if(!pinMk)pinMk=L.circleMarker(ll,{radius:6,color:'#d00',weight:2,fill:false,interactive:false}).addTo(map);else pinMk.setLatLng(ll);$('wlab').title='Click to release the pin (or press Esc)';$('wlab').style.cursor='pointer'}
function unpin(){if(!pinned)return;pinned=false;if(pinMk){map.removeLayer(pinMk);pinMk=null}$('wlab').title='';$('wlab').style.cursor='';updWhere(map.getCenter(),'Centre')}
map.on('click',e=>{if(LZ.tool&&LZ.tool()){if(LZ.tool()==='whatis')pin(e.latlng);return}pin(e.latlng)});   // a What's here? click also pins that spot, so Copy copies it
$('wlab').addEventListener('click',unpin);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&pinned&&!(LZ.tool&&LZ.tool()))unpin()});
LZ.pin=pin;LZ.unpin=unpin;
// show the cursor position for a real mouse/pen; touch devices show the map centre instead
map.getContainer().addEventListener('pointermove',e=>{hoverOK=e.pointerType==='mouse'||e.pointerType==='pen';if(!hoverOK||pinned)return;const r=map.getContainer().getBoundingClientRect();updWhere(map.containerPointToLatLng([e.clientX-r.left,e.clientY-r.top]),'Cursor')},true);
map.getContainer().addEventListener('mouseleave',()=>{if(!pinned)updWhere(map.getCenter(),'Centre')});
map.on('move',()=>{if(pinned)return;if(wSrc!=='Cursor'||!hoverOK)updWhere(map.getCenter(),'Centre')});
updWhere(map.getCenter(),'Centre');
$('wcopy').onclick=()=>{if(!wPos)return;const f=fmtPos(wPos),t=f.gr+' ('+f.ll+')';(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>msg('Copied: '+t,2000),()=>prompt('Copy:',t))};
// ===================== GPS =====================
let gpsMk=null,gpsAcc=null;
let covPoly=null;if(window.__outlineP)window.__outlineP.then(g=>{covPoly=g}).catch(()=>{});
function inRing(x,y,r){let c=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const [xi,yi]=r[i],[xj,yj]=r[j];if(((yi>y)!=(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))c=!c}return c}
function inCoverage(ll){const b=LZ.LC.bounds||(window.CFG&&CFG.bounds);if(b&&!(ll.lat>=b[0][0]&&ll.lat<=b[1][0]&&ll.lng>=b[0][1]&&ll.lng<=b[1][1]))return false;
  if(!covPoly)return true;const fs=covPoly.type==='FeatureCollection'?covPoly.features:[covPoly];
  for(const f of fs){const g=f.geometry||f;const polys=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
    for(const P of polys){if(inRing(ll.lng,ll.lat,P[0])&&!P.slice(1).some(h=>inRing(ll.lng,ll.lat,h)))return true}}return false}
function useMyLocation(){const btn=$('myloc');gores.innerHTML='';
  if(!navigator.geolocation||!window.isSecureContext){showRes([{err:'Location is not available on this device/browser.'}]);return}
  msg('Finding your location…');if(btn){btn.disabled=true;btn.textContent='Finding your location…'}
  const done=()=>{if(btn){btn.disabled=false;btn.innerHTML='&#x1F4CD; Use my location'}};
  navigator.geolocation.getCurrentPosition(p=>{done();const ll=L.latLng(p.coords.latitude,p.coords.longitude),acc=p.coords.accuracy;const f=fmtPos(ll);
    if(!inCoverage(ll)){msg('',1);showRes([{err:'You appear to be outside '+(LZ.LC.areaName||'the coverage')+' ('+f.gr+'). This map only covers '+(LZ.LC.areaName||'its own area')+'.'}]);return}
    if(gpsMk){map.removeLayer(gpsMk);map.removeLayer(gpsAcc)}gpsAcc=L.circle(ll,{radius:acc,color:'#2563eb',weight:1,fillOpacity:.12,interactive:false}).addTo(map);
    gpsMk=L.circleMarker(ll,{radius:8,color:'#fff',weight:2,fillColor:'#2563eb',fillOpacity:1,interactive:false}).addTo(map).bindTooltip('You are here: '+f.gr,{permanent:false});
    map.setView(ll,Math.max(map.getZoom(),acc<30?17:15));updWhere(ll,'GPS');msg('You are at '+f.gr+' (±'+Math.round(acc)+' m)',5000);
    const d=document.createElement('div');d.textContent='You are at '+f.gr+' (±'+Math.round(acc)+' m)';d.style.color='#1e3a8a';gores.innerHTML='';gores.appendChild(d);setTimeout(()=>{if(gores.contains(d))gores.innerHTML=''},8000)},
    err=>{done();msg('',1);const t=err.code===1?'Location permission denied. Allow location for this site in your browser settings, then try again.':err.code===3?'Location timed out. Try again outdoors or with better signal.':'Could not get your location ('+(err.message||'unavailable')+').';showRes([{err:t}])},
    {enableHighAccuracy:true,timeout:15000,maximumAge:10000})}
$('gps').onclick=useMyLocation;if($('myloc'))$('myloc').onclick=useMyLocation;LZ.useMyLocation=useMyLocation;
// ===================== What is it? =====================
// ---- 'What is it?' layers: 5 km OSGB chunks, loaded only around the click ----
const LCF=LZ.LC.layers;let IDX=null,idxP=null;const chunkP=new Map();
function loadIndex(){if(!idxP)idxP=fetch(LCF.index).then(r=>r.ok?r.json():null).then(j=>{IDX=j;if(j)for(const k in j.layers)j.layers[k]=new Set(j.layers[k]);return j}).catch(()=>null);return idxP}
function loadChunk(layer,key){const id=layer+'/'+key;if(!chunkP.has(id))chunkP.set(id,fetch(LCF.url.replace('{layer}',layer).replace('{key}',key)).then(r=>r.ok?r.json():(r.status>=500&&(LZ.recErr=r.status),null)).then(j=>{if(!j){chunkP.delete(id);return null}   // not remembered, so a later click retries
    if(j.missing&&j.missing.length){LZ.recMissing=[...new Set([...(LZ.recMissing||[]),...j.missing])];chunkP.delete(id)}   // one source down: show the rest, retry next time
    if(j.f)prep(j.f);if(j.L){const o={};for(const k in j.L)o[k]=prep(j.L[k].map(g=>({g})));j.L=o}return j}).catch(()=>{chunkP.delete(id);return null}));return chunkP.get(id)}
async function dataNear(E,N,R){await loadIndex();if(!IDX)return {recs:[],ctx:{}};const c=IDX.cell,keys=[];
  for(let cx=Math.floor((E-R)/c);cx<=Math.floor((E+R)/c);cx++)for(let cy=Math.floor((N-R)/c);cy<=Math.floor((N+R)/c);cy++)keys.push(cx+'_'+cy);
  const jobs=[];for(const layer of LCF.names)for(const k of keys)if(IDX.layers[layer]&&IDX.layers[layer].has(k))jobs.push(loadChunk(layer,k).then(j=>[layer,j]));
  const res=await Promise.all(jobs),recs=[],ctx={};for(const [layer,j] of res){if(!j)continue;if(j.f)for(const f of j.f)recs.push(f);if(j.L)for(const k in j.L)(ctx[k]=ctx[k]||[]).push(...j.L[k])}
  return {recs,ctx}}
function loadData(){return loadIndex()}
function bboxOf(g){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;const add=p=>{if(p[0]<x0)x0=p[0];if(p[0]>x1)x1=p[0];if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1]};
  if(g[0]==='P')add(g[1]);else if(g[0]==='L')g[1].forEach(l=>l.forEach(add));else g[1].forEach(poly=>poly[0].forEach(add));return [x0,y0,x1,y1]}
function prep(arr){arr.forEach(f=>{f.bb=bboxOf(f.g)});return arr}
function segD(px,py,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy;let t=l?((px-a[0])*dx+(py-a[1])*dy)/l:0;t=Math.max(0,Math.min(1,t));return Math.hypot(px-a[0]-t*dx,py-a[1]-t*dy)}
function inRing(px,py,r){let c=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>py)!==(b[1]>py)&&px<(b[0]-a[0])*(py-a[1])/(b[1]-a[1])+a[0])c=!c}return c}
function geomDist(g,px,py){if(g[0]==='P')return Math.hypot(px-g[1][0],py-g[1][1]);let d=1e9;
  if(g[0]==='L'){for(const l of g[1])for(let i=1;i<l.length;i++)d=Math.min(d,segD(px,py,l[i-1],l[i]));return d}
  for(const poly of g[1]){let inside=inRing(px,py,poly[0]);for(let k=1;k<poly.length;k++)if(inRing(px,py,poly[k]))inside=false;if(inside)return 0;for(const r of poly)for(let i=1;i<r.length;i++)d=Math.min(d,segD(px,py,r[i-1],r[i]))}return d}
function nearest(list,px,py,maxd){let best=null,bd=maxd;for(const f of list){const b=f.bb;if(px<b[0]-bd||px>b[2]+bd||py<b[1]-bd||py>b[3]+bd)continue;const d=geomDist(f.g,px,py);if(d<bd){bd=d;best=f}}return best?{f:best,d:bd}:null}
function recordsNear(list,px,py,R){const by=new Map();for(const f of list){const b=f.bb;if(px<b[0]-R||px>b[2]+R||py<b[1]-R||py>b[3]+R)continue;const d=geomDist(f.g,px,py);if(d>R)continue;
    const k=f.s+':'+f.id;const o=by.get(k);if(!o||d<o.d)by.set(k,{f,d})}
  return [...by.values()].sort((a,b)=>a.d-b.d)}
// ---- DTM window from z17 Terrarium tiles ----
async function dtmWindow(ll,Rm){const z=LZ.CFG.maxz,mpp=156543.03392*Math.cos(ll.lat*D2R)/Math.pow(2,z),r=Math.ceil(Rm/mpp),p=map.project(ll,z);
  const gx0=Math.round(p.x)-r,gy0=Math.round(p.y)-r,n=2*r+1,H=new Float32Array(n*n).fill(NaN);
  const tx0=Math.floor(gx0/256),tx1=Math.floor((gx0+n-1)/256),ty0=Math.floor(gy0/256),ty1=Math.floor((gy0+n-1)/256);const jobs=[];
  for(let ty=ty0;ty<=ty1;ty++)for(let tx=tx0;tx<=tx1;tx++)jobs.push(LZ.tileData(z,tx,ty).then(d=>{if(!d)return;for(let j=0;j<256;j++){const y=ty*256+j-gy0;if(y<0||y>=n)continue;for(let i=0;i<256;i++){const x=tx*256+i-gx0;if(x<0||x>=n)continue;const o=(j*256+i)*4;if(d[o+3]<128)continue;H[y*n+x]=d[o]*256+d[o+1]+d[o+2]/256-32768}}}));
  await Promise.all(jobs);return {H,n,r,mpp,gx0,gy0,z}}
function fillNaN(H,n){let c=0,s=0;for(const v of H)if(v===v){c++;s+=v}const m=c?s/c:0;const o=new Float32Array(H);for(let k=0;k<o.length;k++)if(o[k]!==o[k])o[k]=m;return {A:o,valid:c/(n*n)}}
function blur(A,n,sig){const rad=Math.min(n-1,Math.ceil(sig*3)),k=new Float32Array(2*rad+1);let ks=0;for(let i=-rad;i<=rad;i++){k[i+rad]=Math.exp(-i*i/(2*sig*sig))}
  const T=new Float32Array(n*n),O=new Float32Array(n*n);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){let s=0,w=0;for(let i=-rad;i<=rad;i++){const xx=x+i;if(xx<0||xx>=n)continue;s+=k[i+rad]*A[y*n+xx];w+=k[i+rad]}T[y*n+x]=s/w}
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){let s=0,w=0;for(let i=-rad;i<=rad;i++){const yy=y+i;if(yy<0||yy>=n)continue;s+=k[i+rad]*T[yy*n+x];w+=k[i+rad]}O[y*n+x]=s/w}return O}
function planeFit(A,n,mask){// least squares z=a+bx+cy over masked pixels, one robust re-fit
  let fit=null;for(let pass=0;pass<2;pass++){let S=[0,0,0,0,0,0,0,0,0,0],cnt=0;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){const k=y*n+x;if(!mask[k])continue;const z=A[k];if(fit&&Math.abs(z-(fit[0]+fit[1]*x+fit[2]*y))>2.5*fit[3])continue;
      S[0]++;S[1]+=x;S[2]+=y;S[3]+=x*x;S[4]+=x*y;S[5]+=y*y;S[6]+=z;S[7]+=x*z;S[8]+=y*z;cnt++}
    if(cnt<10)return fit;const M=[[S[0],S[1],S[2]],[S[1],S[3],S[4]],[S[2],S[4],S[5]]],v=[S[6],S[7],S[8]];const sol=solve3(M,v);if(!sol)return fit;
    let ss=0,c2=0;for(let y=0;y<n;y++)for(let x=0;x<n;x++){const k=y*n+x;if(!mask[k])continue;const e=A[k]-(sol[0]+sol[1]*x+sol[2]*y);ss+=e*e;c2++}fit=[sol[0],sol[1],sol[2],Math.max(0.05,Math.sqrt(ss/c2))]}return fit}
function solve3(M,v){const d=m=>m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);const D=d(M);if(Math.abs(D)<1e-9)return null;
  return [0,1,2].map(c=>d(M.map((row,i)=>row.map((x,j)=>j===c?v[i]:x)))/D)}
function slopeDeg(A,n,mpp,x,y){const g=(i,j)=>A[Math.max(0,Math.min(n-1,j))*n+Math.max(0,Math.min(n-1,i))];const gx=((g(x+1,y-1)+2*g(x+1,y)+g(x+1,y+1))-(g(x-1,y-1)+2*g(x-1,y)+g(x-1,y+1)))/(8*mpp),gy=((g(x-1,y+1)+2*g(x,y+1)+g(x+1,y+1))-(g(x-1,y-1)+2*g(x,y-1)+g(x+1,y-1)))/(8*mpp);return Math.atan(Math.hypot(gx,gy))/D2R}
function dilate(m,n,it){let a=m;for(let t=0;t<it;t++){const b=new Uint8Array(a);for(let y=1;y<n-1;y++)for(let x=1;x<n-1;x++){const k=y*n+x;if(a[k])continue;if(a[k-1]||a[k+1]||a[k-n]||a[k+n]||a[k-n-1]||a[k-n+1]||a[k+n-1]||a[k+n+1])b[k]=1}a=b}return a}
function analyse(W){const {n,r,mpp}=W;const {A,valid}=fillNaN(W.H,n);if(valid<0.6)return {nodata:true,valid};
  const As=blur(A,n,0.8);const c=r;const px=m=>m/mpp;
  // regional context: plane over annulus 45-75 m
  const ann=new Uint8Array(n*n);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const d=Math.hypot(x-c,y-c)*mpp;if(d>=45&&d<=75)ann[y*n+x]=1}
  const reg=planeFit(As,n,ann);const regSlope=reg?Math.atan(Math.hypot(reg[1],reg[2])/mpp)/D2R:0;const regAspect=reg?((Math.atan2(-reg[1],reg[2])/D2R)+360)%360:0;// downslope direction (y down = south)
  // depression test: is the click enclosed by higher ground on (nearly) all sides? (fixes pits/marl pits read as mounds via their rims)
  let forceSign=0,depth0=0,dDep=-9,dUp=0,dSec=0;{const cm=[];for(let y=0;y<n;y++)for(let x=0;x<n;x++){if(Math.hypot(x-c,y-c)*mpp<=4)cm.push(As[y*n+x])}cm.sort((p,q)=>p-q);const cz=cm[Math.floor(cm.length/2)];
    for(const [r1,r2] of [[8,13],[14,22],[24,36],[38,55]]){const rm=new Uint8Array(n*n);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const d=Math.hypot(x-c,y-c)*mpp;if(d>=r1&&d<=r2)rm[y*n+x]=1}
      const pf=planeFit(As,n,rm);if(!pf)continue;const dep=pf[0]+pf[1]*c+pf[2]*c-cz;let up=0,tot=0;const sec=new Array(8).fill(0),secT=new Array(8).fill(0);
      for(let y=0;y<n;y++)for(let x=0;x<n;x++){if(!rm[y*n+x])continue;tot++;const s8=Math.floor(((Math.atan2(y-c,x-c)+Math.PI)/(2*Math.PI))*8)%8;secT[s8]++;if(As[y*n+x]>cz+0.1){up++;sec[s8]++}}
      const secOK=sec.filter((v,i)=>secT[i]&&v/secT[i]>0.6).length;if(dep>dDep){dDep=dep;dUp=up/tot;dSec=secOK}
      if(dep>Math.max(0.3,depth0)&&up/tot>0.55&&secOK>=4){forceSign=-1;depth0=dep}}}
  const cL={};for(const sg of [12,24,40]){const Bq=blur(A,n,px(sg));let t=0,q=0;for(let y=0;y<n;y++)for(let x=0;x<n;x++){if(Math.hypot(x-c,y-c)*mpp<=6){t+=As[y*n+x]-Bq[y*n+x];q++}}cL[sg]=t/q}
  if(!forceSign&&cL[12]<-0.25&&cL[24]<-0.3)forceSign=-1;
  let best=null;
  for(const sigm of [6,12,24]){const B=blur(A,n,px(sigm));const Lr=new Float32Array(n*n);for(let k=0;k<n*n;k++)Lr[k]=As[k]-B[k];
    // seed: strongest relief within 6 m of the click
    // seed: strongest relief near the click (distance-weighted), then climb to the local extremum
    let sk=-1,sv=0,sc=0;const s8=Math.ceil(px(8));for(let y=c-s8;y<=c+s8;y++)for(let x=c-s8;x<=c+s8;x++){const d=Math.hypot(x-c,y-c)*mpp;if(d>8)continue;const v=Lr[y*n+x];if(forceSign&&v*forceSign<=0)continue;const w=Math.abs(v)*Math.exp(-(d/4)*(d/4));if(w>sc){sc=w;sv=v;sk=y*n+x}}
    if(sk<0)continue;{const sg=sv>=0?1:-1;for(let it=0;it<60;it++){let bk=sk;const x=sk%n,y=(sk/n)|0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<1||yy<1||xx>=n-1||yy>=n-1||Math.hypot(xx-c,yy-c)*mpp>15)continue;const kk=yy*n+xx;if(sg*Lr[kk]>sg*Lr[bk])bk=kk}if(bk===sk)break;sk=bk}sv=Lr[sk]}const sign=sv>=0?1:-1,thr=0.5*Math.abs(sv),lim=px(60);
    const comp=new Uint8Array(n*n),q=[sk];comp[sk]=1;let touches=false,cnt=0;
    while(q.length){const k=q.pop();cnt++;const x=k%n,y=(k/n)|0;if(Math.hypot(x-c,y-c)>=lim||x<=1||y<=1||x>=n-2||y>=n-2){touches=true;continue}
      for(const kk of [k-1,k+1,k-n,k+n]){if(!comp[kk]&&sign*Lr[kk]>thr){comp[kk]=1;q.push(kk)}}}
    const cur={sigm,Lr,sk,sv,sign,comp,cnt,touches,B},curD=2*Math.sqrt(cnt/Math.PI)*mpp;
    // if the larger scale merges the feature into a bigger landform, keep the previous (smaller) scale
    if(best&&!best.touches&&(touches||curD>2.5*best.eqDm||cur.sign!==best.sign)){if(LZ.debugScales)LZ.debugScales.push({sigm,rejected:true,eqD:+curD.toFixed(1),touches});break}
    if(best&&best.touches&&touches){if(LZ.debugScales)LZ.debugScales.push({sigm,rejected:'both touch'});break}
    cur.eqDm=curD;best=cur;
    if(LZ.debugScales)LZ.debugScales.push({sigm,sv:+sv.toFixed(3),sd:+(Math.hypot(sk%n-c,((sk/n)|0)-c)*mpp).toFixed(1),eqD:+(2*Math.sqrt(cnt/Math.PI)*mpp).toFixed(1),touches});
    // scale selection: stop at the first scale where the feature is comfortably smaller than the filter
    const eqD=2*Math.sqrt(cnt/Math.PI)*mpp;if(eqD<1.3*sigm&&!touches)break}
  if(!best)return {nodata:true,valid};
  const {comp,sign,sk,touches,sigm}=best;let cnt=best.cnt;
  // shape (PCA over component pixels)
  let sx=0,sy=0;for(let k=0;k<n*n;k++)if(comp[k]){sx+=k%n;sy+=(k/n)|0}let mx=sx/cnt,my=sy/cnt;let cxx=0,cyy=0,cxy=0;
  for(let k=0;k<n*n;k++)if(comp[k]){const dx=k%n-mx,dy=((k/n)|0)-my;cxx+=dx*dx;cyy+=dy*dy;cxy+=dx*dy}cxx/=cnt;cyy/=cnt;cxy/=cnt;
  const tr=cxx+cyy,det=cxx*cyy-cxy*cxy,l1=tr/2+Math.sqrt(Math.max(0,tr*tr/4-det)),l2=Math.max(1e-6,tr/2-Math.sqrt(Math.max(0,tr*tr/4-det)));let ang=0.5*Math.atan2(2*cxy,cxx-cyy);let footM=comp;
  let ux=Math.cos(ang),uy=Math.sin(ang);let a0=1e9,a1=-1e9,b0=1e9,b1=-1e9;for(let k=0;k<n*n;k++)if(comp[k]){const dx=k%n-mx,dy=((k/n)|0)-my,a=dx*ux+dy*uy,b=-dx*uy+dy*ux;a0=Math.min(a0,a);a1=Math.max(a1,a);b0=Math.min(b0,b);b1=Math.max(b1,b)}
  let len=(a1-a0+1)*mpp,wid=(b1-b0+1)*mpp,area=cnt*mpp*mpp,eqD=2*Math.sqrt(area/Math.PI),elong=Math.sqrt(l1/l2),rectness=area/(len*wid);
  // local base plane from a ring 2-10 m outside the feature
  const d2=dilate(comp,n,Math.max(1,Math.round(px(2)))),d10=dilate(d2,n,Math.max(2,Math.round(px(8))));const ring=new Uint8Array(n*n);for(let k=0;k<n*n;k++)if(d10[k]&&!d2[k])ring[k]=1;
  let lp=planeFit(As,n,ring)||reg;let rel=k=>As[k]-(lp[0]+lp[1]*(k%n)+lp[2]*((k/n)|0));
  let ext=0,ek=sk;for(let k=0;k<n*n;k++)if(comp[k]){const v=sign*rel(k);if(v>ext){ext=v;ek=k}}
  // footprint: grow out from the half-height core to ~20% of the height (limited reach), then re-fit the base outside it
  {const reach=dilate(comp,n,Math.max(2,Math.round(px(Math.max(3,0.6*eqD0())))));const foot=new Uint8Array(comp),q=[];for(let k=0;k<n*n;k++)if(comp[k])q.push(k);
    while(q.length){const k=q.pop();for(const kk of [k-1,k+1,k-n,k+n]){if(kk<0||kk>=n*n||foot[kk]||!reach[kk])continue;if(sign*rel(kk)>0.2*ext){foot[kk]=1;q.push(kk)}}}
    const f2=dilate(foot,n,Math.max(1,Math.round(px(2)))),f10=dilate(f2,n,Math.max(2,Math.round(px(8))));const ring2=new Uint8Array(n*n);for(let k=0;k<n*n;k++)if(f10[k]&&!f2[k])ring2[k]=1;
    const lp2=planeFit(As,n,ring2);if(lp2){lp=lp2;rel=k=>As[k]-(lp[0]+lp[1]*(k%n)+lp[2]*((k/n)|0));ext=0;for(let k=0;k<n*n;k++)if(foot[k]){const v=sign*rel(k);if(v>ext){ext=v;ek=k}}}
    footM=foot}
  function eqD0(){return 2*Math.sqrt(cnt/Math.PI)*mpp}
  const H=ext;// height (mound) or depth (hollow), metres
  const coreD=eqD;{const fm=footM;let fc=0,fx=0,fy=0;for(let k=0;k<n*n;k++)if(fm[k]){fc++;fx+=k%n;fy+=(k/n)|0}const fmx=fx/fc,fmy=fy/fc;let qxx=0,qyy=0,qxy=0;
    for(let k=0;k<n*n;k++)if(fm[k]){const dx=k%n-fmx,dy=((k/n)|0)-fmy;qxx+=dx*dx;qyy+=dy*dy;qxy+=dx*dy}qxx/=fc;qyy/=fc;qxy/=fc;const T=qxx+qyy,Dt=qxx*qyy-qxy*qxy,m1=T/2+Math.sqrt(Math.max(0,T*T/4-Dt)),m2=Math.max(1e-6,T/2-Math.sqrt(Math.max(0,T*T/4-Dt))),an=0.5*Math.atan2(2*qxy,qxx-qyy);
    const vx=Math.cos(an),vy=Math.sin(an);let p0=1e9,p1=-1e9,r0=1e9,r1=-1e9;for(let k=0;k<n*n;k++)if(fm[k]){const dx=k%n-fmx,dy=((k/n)|0)-fmy,aa=dx*vx+dy*vy,bb=-dx*vy+dy*vx;p0=Math.min(p0,aa);p1=Math.max(p1,aa);r0=Math.min(r0,bb);r1=Math.max(r1,bb)}
    len=(p1-p0+1)*mpp;wid=(r1-r0+1)*mpp;area=fc*mpp*mpp;eqD=2*Math.sqrt(area/Math.PI);elong=Math.sqrt(m1/m2);rectness=area/(len*wid);ang=an;mx=fmx;my=fmy;a0=p0;a1=p1;ux=vx;uy=vy}
  const fd2=dilate(footM,n,Math.max(1,Math.round(px(1.5))));let a50=0,a80=0;for(let k=0;k<n*n;k++)if(fd2[k]){const v=sign*rel(k);if(v>0.5*H)a50++;if(v>0.8*H)a80++}const plateau=a50?a80/a50:0;
  // edge steepness: 90th percentile of slope over the feature and its margin
  const sl=[];for(let k=0;k<n*n;k++)if(fd2[k])sl.push(slopeDeg(As,n,mpp,k%n,(k/n)|0));sl.sort((a,b)=>a-b);const sl90=sl.length?sl[Math.floor(0.9*(sl.length-1))]:0;
  // rim (hollows): ring just outside the hollow, relative to a plane fitted further out
  // rim (hollows): 16 radial profiles relative to a plane fitted on an outer annulus; rim = highest point just beyond the hollow edge
  let rim=0,rimFrac=0;if(sign<0){const R=Math.max(2,coreD/2)/mpp;const oa=new Uint8Array(n*n);const r1=2.2*R+px(4),r2=Math.min(n/2-2,3.2*R+px(12));
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){const d=Math.hypot(x-mx,y-my);if(d>=r1&&d<=r2)oa[y*n+x]=1}const op=planeFit(As,n,oa);
    if(op){const vals=[];let pos=0;for(let i=0;i<16;i++){const t=i*Math.PI/8;let mxv=-1e9;for(let rr=0.9*R;rr<=2.1*R+px(2);rr+=0.5){const x=Math.round(mx+Math.cos(t)*rr),y=Math.round(my+Math.sin(t)*rr);if(x<0||y<0||x>=n||y>=n)continue;const v=As[y*n+x]-(op[0]+op[1]*x+op[2]*y);if(v>mxv)mxv=v}
      vals.push(mxv);if(mxv>0.08)pos++}vals.sort((a,b)=>a-b);rim=vals[8];rimFrac=pos/16}}
  // lynchet test for linear features: height step across the axis
  let step=0;if(elong>2.2||touches){const off=px(area/len/2+6);const sideMean=s=>{let t=0,c2=0;for(let a=a0;a<=a1;a+=2){const x=Math.round(mx+a*ux-s*off*uy),y=Math.round(my+a*uy+s*off*ux);if(x>=0&&y>=0&&x<n&&y<n){t+=As[y*n+x];c2++}}return c2?t/c2:NaN};step=Math.abs(sideMean(1)-sideMean(-1))}
  const axisDeg=((90+ang/D2R)%180+180)%180;// bearing of long axis (0-180, from north)
  const contourDeg=(regAspect+90)%180;const alongContour=Math.min(Math.abs(axisDeg-contourDeg),180-Math.abs(axisDeg-contourDeg))<30;
  const cxl=W.gx0+mx,cyl=W.gy0+my;const centreLL=map.unproject([cxl,cyl],W.z);
  return {cL12:cL[12],cL24:cL[24],cL40:cL[40],forceSign,depth0,dDep,dUp,dSec,sign,H,eqD,len,wid,area,elong,rectness,plateau,sl90,regSlope,regAspect,rim,rimFrac,step,alongContour,touches,sigm,centreLL,comp,foot:footM,ek,As,n,mpp,mx,my,peakAbs:As[ek],axisDeg}}
function classify(a,ctx,elev){const out={};const m=v=>v<10?v.toFixed(1):Math.round(v).toString();const hh=v=>v<1?v.toFixed(2):v.toFixed(1);
  if(a.nodata){return {text:'No LiDAR data here (outside the tile coverage or a data gap).',conf:'na',kind:'nodata'}}
  const near=(k,d)=>ctx[k]&&ctx[k].d<=d;
  if(a.H<0.1||a.eqD<3){return {text:'No clear earthwork at this spot: relief under ~0.1 m at this scale. Flat ground, or something too subtle for the 1 m DTM.',conf:'na',kind:'flat'}}
  const linear=a.elong>3.2||(a.touches&&a.elong>1.8);
  const prof=a.sign>0?(a.plateau>0.6?'flat-topped':a.plateau<0.22?'peaked':'domed'):(a.plateau>0.6?'flat-floored':a.plateau<0.22?'funnel-shaped':'bowl-shaped');const edges=a.sl90>20?'steep, crisp':a.sl90>9?'moderate':'gentle, spread';
  const wm=a.area/a.len;if(a.touches&&wm>30){return {text:'Part of a larger landform here (slope, spur, valley or broad terrace), '+hh(a.H)+' m of relief over '+m(wm)+'+ m: no discrete earthwork isolated at this spot; can\'t tell. Try clicking nearer the centre of a feature.',conf:'na',kind:'landform',prof,edges}}
  let shape,guess,conf='low',kind;
  if(linear){const lenTxt=a.touches?'over '+m(a.len)+' m (runs on beyond the analysis window)':m(a.len)+' m long';
    if(a.sign>0){shape='Linear bank '+lenTxt+', ~'+m(wm)+' m wide, '+hh(a.H)+' m high';
      if((a.step>Math.max(0.5,1.2*a.H)||a.regSlope>3&&a.alongContour&&a.step>0.4)){guess='likely a lynchet / cultivation terrace (step of '+hh(a.step)+' m across it)';conf=a.alongContour?'moderate':'low';kind='lynchet'}
      else if(near('fieldedge',8)){guess='likely a field boundary bank (follows a mapped field edge)';conf='moderate';kind='boundary'}
      else if(near('track',8)||near('road',8)){guess='a bank beside a track/road: a terrace or embankment for the track, or an older bank it follows (can\'t tell)';conf='low';kind='track'}
      else{guess='field boundary, lynchet, or other linear earthwork (can\'t tell which)';kind='linear'}}
    else{shape='Linear hollow '+lenTxt+', ~'+m(wm)+' m wide, '+hh(a.H)+' m deep';
      if(near('track',8)||near('road',8)){guess='likely a track or hollow way';conf='moderate';kind='hollowway'}else if(near('stream',8)||near('water',8)){guess='likely a watercourse or drain';conf='moderate';kind='drain'}
      else{guess='ditch, hollow way or old track (can\'t tell which)';kind='ditch'}}
    return {text:shape+': '+guess+'.',conf,kind,prof,edges}}
  const round=a.elong<1.5,veryRound=a.elong<1.25,square=a.rectness>0.86&&a.elong<1.6;
  const sizeTxt=round?'~'+m(a.eqD)+' m across':m(a.len)+' x '+m(a.wid)+' m';
  if(a.sign>0){
    const nm=(round?(square?'Squarish':'Round'):a.elong<4.5?'Elongated':'Long')+' mound '+sizeTxt+', '+hh(a.H)+' m high, '+prof;
    if(near('building',6)){guess='probably a building, structure or made ground (mapped building within 6 m)';conf='moderate';kind='building'}
    else if(a.regSlope>5&&a.elong>1.6&&a.len>=30&&(a.alongContour||a.step>0.5)){guess='likely a lynchet / cultivation terrace or hillside scarp (long, along the slope)';kind='lynchet'}
    else if(a.elong>=1.8&&a.elong<4.5&&a.len>=10&&a.len<45&&a.H>=0.2&&a.H<1.3&&a.regSlope>3){guess='possible pillow mound (rabbit warren) or small elongated mound';kind='pillow'}
    else if(!round&&a.len>=25&&a.len<=140&&a.elong>=1.6&&a.H>=0.5){
      if(a.sl90>18&&a.H>1.2){guess='large elongated mound with steep, crisp sides: looks modern or very well preserved; a possible long barrow, or a modern mound/spoil bank (check records)';kind='longmound_crisp'}
      else{guess='possible long barrow, or a natural/agricultural or spoil mound (can\'t tell from shape alone)';kind='longmound'}}
    else if(round&&a.H>1.0&&a.sl90>22&&a.H/(a.eqD/2)>0.22){guess='steep-sided heap: a spoil heap or modern dump is more likely than a barrow (a well-preserved barrow is possible)';kind='spoil';conf='low'}
    else if((square||prof==='flat-topped')&&(a.H>1.2||a.sl90>18)){guess='likely spoil heap, modern dump or platform (flat top and steep sides)';conf=a.H>1.5?'moderate':'low';kind='spoil'}
    else if(square&&prof==='flat-topped'){guess='possible platform or spoil (flat-topped, squarish); can\'t tell';kind='platform'}
    else if((round||(a.elong<1.75&&a.rectness>0.6))&&a.eqD>=5&&a.eqD<=45&&a.H>=0.15&&a.H<=4){
      if(prof==='flat-topped'){guess='flat-topped round mound: possible spoil heap or modern mound; a barrow is possible but less likely';kind='flatmound'}
      else{guess='possible round barrow';kind='barrow';const clean=!near('track',10)&&!near('road',10)&&!near('wood',2)&&!near('settled',10);
        if(veryRound&&a.H>=0.4&&a.H<=3&&a.sl90<22&&clean)conf='moderate';
        if(a.H<0.25)guess+=' (very slight: could equally be a plough-spread barrow or a natural rise)';if(a.regSlope>=6){guess+=' (but it sits on a steep slope, where lynchet ends, spoil and natural knolls are just as likely)';conf='low'}}}
    else if(a.eqD<5){guess='small hump: could be a spoil dump, tree-throw, or DTM noise (can\'t tell)';kind='small'}
    else{guess='irregular mound: natural knoll, spoil, or plough-spread earthwork (can\'t tell)';kind='irregular'}
    if(near('wood',2)&&kind!=='building')guess+='; in woodland, so the DTM is less reliable';
    return {text:nm+': '+guess+'.',conf,kind,prof,edges}}
  // hollows
  const rimmed=a.rim>Math.max(0.12,0.2*a.H)&&a.rimFrac>=0.55;
  const nm=(round?'Circular':'Irregular')+' hollow '+sizeTxt+', '+hh(a.H)+' m deep'+(rimmed?', with a raised rim (~'+hh(a.rim)+' m)':'');
  if(near('water',4)){guess='mapped pond / water';conf='moderate';kind='pond'}
  else if(a.elong<1.6&&a.eqD>=8&&a.eqD<=45&&elev>=120&&(rimmed||(a.H>=0.8&&a.sl90>8))){guess='likely dew pond';conf=veryRound&&rimmed?'moderate':'low';kind='dewpond'}
  else if(a.eqD>45||(a.regSlope>4&&a.elong>1.3)||(a.elong>1.8&&a.eqD>15)){guess='quarry or chalk/gravel pit (large or irregular extraction hollow, often cut into a slope); natural hollow possible';kind='quarry'}
  else if(elev<120&&a.eqD>=8&&a.eqD<=60){guess='likely a marl/clay pit or pond (extraction hollow on low ground)'+(rimmed?'; the rim may be spoil':'');kind='marlpit'}
  else if(rimmed&&a.eqD<8){guess='small rimmed pit: pond barrow, robbed mound, shell/bomb crater, or pit (can\'t tell)';kind='rimpit'}
  else if(round&&a.eqD<=60){guess=prof==='flat-floored'?'pond or flat-floored pit (flat bottom)':'pit or hollow: quarry/chalk/marl pit, pond, or natural (can\'t tell)';kind='pit'}
  else{guess='extraction hollow or natural hollow (can\'t tell)';kind='hollow'}
  return {text:nm+': '+guess+'.',conf,kind,prof,edges}}
const RDBU=['#2166ac','#67a9cf','#d1e5f0','#f7f7f7','#fddbc7','#ef8a62','#b2182b'].map(h=>[1,3,5].map(i=>parseInt(h.substr(i,2),16)));
function ramp(t){t=Math.max(0,Math.min(1,t))*(RDBU.length-1);const k=Math.min(RDBU.length-2,Math.floor(t)),f=t-k;return RDBU[k].map((v,i)=>v*(1-f)+RDBU[k+1][i]*f)}
function thumb(cv,W,a){const n=W.n,mpp=W.mpp,span=Math.min(n,Math.round(120/mpp)),off=Math.floor((n-span)/2),S=cv.width=cv.height=240;const g=cv.getContext('2d');const im=g.createImageData(S,S);
  const {A}=fillNaN(W.H,n);const B=blur(A,n,10/mpp);const vals=[];for(let j=0;j<span;j++)for(let i=0;i<span;i++){const k=(j+off)*n+i+off;vals.push(Math.abs(A[k]-B[k]))}vals.sort((x,y)=>x-y);const sc=Math.max(0.15,vals[Math.floor(0.98*(vals.length-1))]||0.3);
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){const i=off+Math.floor(x*span/S),j=off+Math.floor(y*span/S),k=j*n+i;const v=W.H[k]!==W.H[k]?null:(A[k]-B[k]);const c=v===null?[200,200,200]:ramp(0.5+v/(2*sc));const o=(y*S+x)*4;im.data[o]=c[0];im.data[o+1]=c[1];im.data[o+2]=c[2];im.data[o+3]=255;
    const F=a&&!a.nodata&&a.foot;if(F&&F[k]){const e=Math.max(1,Math.round(span/S*2));const kk=[k-e,k+e,k-e*n,k+e*n];if(kk.some(q=>!F[q])){im.data[o]=255;im.data[o+1]=215;im.data[o+2]=0}}}
  g.putImageData(im,0,0);g.strokeStyle='#111';g.lineWidth=2;const c=S/2;g.beginPath();g.moveTo(c-9,c);g.lineTo(c-3,c);g.moveTo(c+3,c);g.lineTo(c+9,c);g.moveTo(c,c-9);g.lineTo(c,c-3);g.moveTo(c,c+3);g.lineTo(c,c+9);g.stroke();
  g.fillStyle='rgba(255,255,255,.85)';g.fillRect(4,S-20,92,16);g.fillStyle='#111';g.font='12px system-ui';g.fillText('LRM, 120 m wide',8,S-8);if(a&&!a.nodata&&a.foot){g.fillStyle='rgba(255,255,255,.85)';g.fillRect(S-112,S-20,108,16);g.fillStyle='#111';g.fillText('yellow = outline',S-108,S-8)}}
let wiMk=null,wiSeq=0;const card=$('card');const TN=LZ.LC.toolName||'What is it?',SHOWG=LZ.LC.showGuess!==false;
const SRC=LZ.LC.recordSources||'NHLE (Historic England, scheduled + listed), HE Aerial Investigation & Mapping, OSM (community map)';
function compass8(b){return ['N–S','NNE–SSW','NE–SW','ENE–WSW','E–W','ESE–WNW','SE–NW','SSE–NNW'][Math.round(((b%180)+180)%180/22.5)%8]}
function q05(v){return Math.max(0.05,Math.round(v*20)/20)}
function describe(a){if(a.nodata)return 'No LiDAR data here (outside the tile coverage or a data gap).';
  if(a.H<0.1||a.eqD<3)return 'Relief under ~0.1 m: too subtle for a 1 m DTM to show; absence here does not mean nothing is there.';
  const lo=q05(a.H*0.75),hi=q05(a.H*1.25),hs=v=>v<1?v.toFixed(2).replace(/0$/,''):v.toFixed(1);
  const kind=a.sign>0?'raised':'sunken';const size=a.touches?'over more than ~60 m':(a.elong<1.5?'over ~'+Math.round(a.eqD)+' m':'over ~'+Math.round(a.len)+' × '+Math.round(a.wid)+' m');
  const parts=['Local relief '+hs(lo)+'–'+hs(hi)+' m ('+kind+') '+size];
  parts.push(a.elong<1.25?'roughly circular':a.elong<1.5?'slightly oval':(a.elong>3.2?'linear':'elongated')+' '+compass8(a.axisDeg));
  parts.push(a.sl90>20?'steep, crisp edges':a.sl90>9?'moderate edges':'gentle, spread edges');
  if(a.step>Math.max(0.3,0.8*a.H))parts.push('ground '+hs(a.step)+' m higher on one side (terrace-like step)');
  if(a.sign<0&&a.rim>Math.max(0.12,0.2*a.H)&&a.rimFrac>=0.55)parts.push('raised rim on '+Math.round(a.rimFrac*100)+'% of sides');
  if(a.regSlope>=3)parts.push('on ground sloping '+a.regSlope.toFixed(0)+'° to the '+compass(a.regAspect));
  return parts.join('; ')+'.'}
function closeCard(){card.style.display='none';if(wiMk){map.removeLayer(wiMk);wiMk=null}}
const CTX_NAMES={building:'a building',wood:'woodland',water:'mapped water',stream:'a stream/drain',road:'a road',track:'a track/path',fieldedge:'a field edge',settled:'a settlement/farmyard',rail:'railway',embankment:'a mapped embankment'};
async function whatIs(ll){const seq=++wiSeq;if(wiMk)map.removeLayer(wiMk);wiMk=L.circleMarker(ll,{radius:6,color:'#facc15',weight:3,fill:false,interactive:false}).addTo(map);
  const [E,N]=ll2en(ll.lat,ll.lng);card.style.display='block';card.innerHTML='<div class="hd"><span class="x" title="close">&times;</span><b>'+esc(TN)+'</b><br><small>'+esc(gridRef(E,N))+' &middot; '+ll.lat.toFixed(5)+', '+ll.lng.toFixed(5)+'</small></div><div class="bd">Looking at the LiDAR and records…</div>';
  card.querySelector('.x').onclick=closeCard;
  const HA=LZ.LC.herApi;const herP=HA?fetch(HA.url+'?e='+Math.round(E)+'&n='+Math.round(N),{credentials:'same-origin'}).then(r=>r.ok?r.json():{r:[],err:r.status}).catch(()=>({r:[],err:1})):Promise.resolve(null);
  LZ.recErr=0;LZ.recMissing=null;const both=Promise.all([dataNear(E,N,180),herP]);const W=await dtmWindow(ll,100);if(seq!==wiSeq)return;
  // records can take seconds (live Historic England queries): show the LiDAR measurements at once, then fill the records in
  const early=await Promise.race([both,new Promise(r=>setTimeout(()=>r(null),400))]);if(seq!==wiSeq)return;
  if(early)return wiRender(ll,E,N,W,early[0],early[1],false,seq);
  await wiRender(ll,E,N,W,{recs:[],ctx:{}},null,true,seq);
  let D,HJ;try{[D,HJ]=await both}catch(e){D={recs:[],ctx:{}};HJ=null}if(seq!==wiSeq)return;return wiRender(ll,E,N,W,D,HJ,false,seq)}
async function wiRender(ll,E,N,W,D,HJ,pending,seq){const CTX=D.ctx;
  const a=analyse(W);const elev=await LZ.heightAt(ll);if(seq!==wiSeq)return;
  const ref=a.nodata?[E,N]:ll2en(a.centreLL.lat,a.centreLL.lng);
  const ctx={};for(const k in CTX){const r=nearest(CTX[k],ref[0],ref[1],150);if(r)ctx[k]=r}
  const cls=classify(a,ctx,elev==null?0:elev);
  const recs=recordsNear(D.recs,E,N,100);if(HJ&&HJ.r){for(const r of HJ.r)recs.push({f:{s:'HER',id:r.id,n:r.n,t:r.t,u:r.u},d:r.d});recs.sort((x,y)=>x.d-y.d)}const featR=a.nodata||cls.kind==='flat'?12:Math.max(12,(a.len||0)/2);
  const atSpot=recs.filter(r=>r.d<=featR);
  let recLine;const official=atSpot.filter(r=>r.f.s!=='OSM');
  if(official.length){const r=official[0].f;recLine='Recorded here: '+esc(r.n||r.t)+' ('+r.s+' '+esc(r.id)+')'}
  else if(atSpot.length){const r=atSpot[0].f;recLine='Only on OpenStreetMap: '+esc(r.n||r.t)+' ('+esc(r.t)+'); not in the '+esc(HL)+', NHLE or HE mapping'}
  else recLine=recs.length?'Not recorded at this spot (nearest record '+Math.round(recs[0].d)+' m away)':'Not recorded (nothing within 100 m)';
  const ctxList=Object.entries(ctx).filter(([k,v])=>v.d<=100).sort((x,y)=>x[1].d-y[1].d).slice(0,4).map(([k,v])=>v.d<1?(k==='wood'||k==='settled'||k==='water'?'in '+CTX_NAMES[k]:'on '+CTX_NAMES[k]):Math.round(v.d)+' m from '+CTX_NAMES[k]);
  const confTxt={low:'low confidence',moderate:'moderate confidence',na:''}[cls.conf];
  let h='<div class="hd"><span class="x" title="close">&times;</span><b>'+esc(TN)+'</b><br><small>'+esc(gridRef(E,N))+' &middot; '+ll.lat.toFixed(5)+', '+ll.lng.toFixed(5)+(elev!=null?' &middot; '+elev.toFixed(1)+' m OD':'')+'</small></div><div class="bd">';
  // Heritage Gateway retired its Results_Single.aspx pages; go straight to the new search for that HE research record (saves a redirect)
  const hgLink=u=>{const m=/^https?:\/\/(?:www\.)?heritagegateway\.org\.uk\/Gateway\/Results_Single\.aspx\?uid=([^&#]+)&resourceID=19191\b/i.exec(u);return m?'https://historicengland.org.uk/listing/heritage-gateway/results?q='+encodeURIComponent(decodeURIComponent(m[1]))+'&filters%5B0%5D%5Bfield%5D=dataset&filters%5B0%5D%5Bvalues%5D%5B0%5D=Historic%20England%20research%20records&filters%5B1%5D%5Bfield%5D=layoutView&filters%5B1%5D%5Bvalues%5D%5B0%5D=list':u};
  const BADGE={CADW:'Cadw',CADWLB:'Cadw',NMRW:'Coflein'};
  const recRow=({f,d})=>{let h='';h+='<div class="rec"><span class="b '+f.s+'">'+(BADGE[f.s]||f.s)+'</span><b>'+esc(f.n||f.t||'(unnamed)')+'</b> <span class="m">&middot; '+(d<0.5?'here':Math.round(d)+' m')+'</span><div class="m">'+esc([f.t&&f.t!==f.n?f.t:'',f.p,f.s==='OSM'?'OSM '+f.id:f.s==='NHLE'||f.s==='LB'?'List entry '+f.id:f.s==='AIM'?(f.id&&!/none/i.test(f.id)?'HE UID '+f.id:''):f.s==='GAZ'?(/^\d+$/.test(f.id||'')?'NHLE '+f.id:''):f.s==='CADW'?'Cadw '+f.id:f.s==='CADWLB'?'Cadw listed building '+f.id:f.s==='NMRW'?'NPRN '+f.id:f.id].filter(Boolean).join(' · '))+
    (f.u?' &middot; <a href="'+esc(hgLink(f.u))+'" target="_blank" rel="noopener noreferrer">'+(f.s==='HER'?'Heritage Gateway':f.s==='NHLE'||f.s==='LB'?'NHLE list entry':f.s==='AIM'?'HE record':f.s==='GAZ'?'Source record':f.s==='CADW'||f.s==='CADWLB'?'Cadw report':f.s==='NMRW'?'Coflein':'OSM')+' &#x2197;</a>':'')+'</div></div>';return h};const near30=recs.filter(r=>r.d<=30),far=recs.filter(r=>r.d>30);
  h+='<h3>Recorded within 30 m</h3><div class="m snap" style="font-size:11px;margin:-2px 0 4px">'+esc(LZ.LC.recordsLine||('Records from the '+HLL+', NHLE, HE aerial mapping and OSM'))+'</div>';
  if(pending)h+='<div class="m wiwait">Fetching records…</div>';
  if(!pending&&LZ.recMissing&&LZ.recMissing.length)h+='<div class="m" style="font-size:12px;color:#b45309">'+esc(LZ.recMissing.join(' and '))+' records could not be fetched just now, so they are not listed. Click again in a minute.</div>';
  else if(LZ.recErr&&!recs.length)h+='<div class="m">The records could not be fetched just now. Click again in a minute.</div>';
  else if(!near30.length)h+='<div class="m">Nothing in '+(LZ.LC.recordsNone?esc(LZ.LC.recordsNone):LZ.LC.live?'Historic England\'s records (NHLE, aerial mapping)':'the '+esc(HL)+', NHLE, HE aerial mapping or OSM')+' within 30 m'+(far.length?'':' (or within 100 m)')+'.</div>';
  near30.forEach(r=>{h+=recRow(r)});
  if(far.length)h+='<details class="more"><summary>+ '+far.length+' more within 100 m</summary>'+far.map(recRow).join('')+'</details>';
  if(HJ&&HJ.err)h+='<div class="m" style="font-size:11px">HER lookup unavailable just now'+(HJ.err===429?' (too many lookups; wait a minute)':'')+'.</div>';
  if(LZ.LC.herLinks&&LZ.LC.herLinks.length){const gr=gridRef(E,N).replace(/\s+/g,''),dl=0.0027,dg=0.0043,v={e:Math.round(E),n:Math.round(N),gr,lat:ll.lat.toFixed(5),lng:ll.lng.toFixed(5),lat1:(ll.lat+dl).toFixed(5),lng1:(ll.lng-dg).toFixed(5),lat2:(ll.lat-dl).toFixed(5),lng2:(ll.lng+dg).toFixed(5)};
    const fill=t=>t.replace(/\{(\w+)\}/g,(m,k)=>k in v?encodeURIComponent(v[k]):m);
    h+='<div class="herlinks" style="margin-top:6px;font-size:13px">'+LZ.LC.herLinks.map(L=>'<a href="'+esc(fill(L.url))+'" target="_blank" rel="noopener noreferrer">'+esc(L.label)+' &#x2197;</a>'+(L.note?' <span class="m" style="font-size:11px">('+esc(fill(L.note).replace(/%20/g,' '))+')</span>':'')).join(' &middot; ')+'</div>'}
  h+='<h3>Measured from the DTM</h3><div class="desc">'+esc(describe(a))+'</div><div class="meas">'+(a.nodata?'':'<canvas></canvas>');
  if(!a.nodata&&cls.kind!=='flat'){const rows=[['Form',(a.sign>0?'Mound / bank':'Hollow / ditch')+(a.touches?' (extends beyond 60 m)':'')],['Size',a.elong<1.5&&!a.touches?'~'+a.eqD.toFixed(0)+' m across (area '+Math.round(a.area)+' m²)':a.len.toFixed(0)+' x '+a.wid.toFixed(0)+' m, long axis '+Math.round(a.axisDeg)+'°'],
      [a.sign>0?'Height':'Depth',a.H.toFixed(2)+' m (vs. ground just outside)'],['Roundness','length/width '+a.elong.toFixed(2)+(a.rectness>0.86?', squarish':'')],['Profile',cls.prof+(a.sign<0&&a.rim>0.05?'; rim '+a.rim.toFixed(2)+' m on '+Math.round(a.rimFrac*100)+'% of sides':'')],
      ['Edges',cls.edges+' (90th pct slope '+a.sl90.toFixed(0)+'°)'],['Setting','ground slopes '+a.regSlope.toFixed(1)+'°'+(a.regSlope>1?' to the '+compass(a.regAspect):'')+(elev!=null?', '+elev.toFixed(0)+' m OD':'')],['Scale used','relief model σ '+a.sigm+' m']];
    h+='<table>'+rows.map(r=>'<tr><td>'+r[0]+'</td><td>'+esc(r[1])+'</td></tr>').join('')+'</table>'}
  h+='</div>';
  if(SHOWG)h+='<details class="heur"><summary>Heuristic pointer (not an identification)</summary><div class="gt">'+esc(cls.text)+'</div>'+(confTxt?'<span class="conf '+cls.conf+'">'+confTxt+'</span>':'')+'<div class="m" style="margin-top:6px;font-size:12px">'+recLine+(ctxList.length?'; '+esc(ctxList.join('; ')):'')+'.</div><div class="m" style="font-size:11px;margin-top:4px">Rule-of-thumb from shape and mapped context; often wrong. Use it as a prompt to check records and the ground.</div></details>';
  h+='<div class="ft">Measurements from the 1 m EA LiDAR DTM at the spot you clicked; '+(SHOWG?'the pointer is automatic and ':'')+'not a field identification. Records: '+esc(SRC)+'.</div></div>';
  const st=card.scrollTop;card.innerHTML=h;card.scrollTop=st;card.querySelector('.x').onclick=closeCard;{const cv=card.querySelector('.meas canvas');if(cv)thumb(cv,W,a)}
  LZ.lastWhatIs={desc:describe(a),cls,a:a.nodata?a:Object.fromEntries(Object.entries(a).filter(([k,v])=>typeof v!=='object')),recs:recs.map(r=>({s:r.f.s,id:r.f.id,n:r.f.n,t:r.f.t,d:Math.round(r.d)})),ctx:Object.fromEntries(Object.entries(ctx).map(([k,v])=>[k,Math.round(v.d)])),recLine,gr:gridRef(E,N),elev}}
function compass(d){return ['north','north-east','east','south-east','south','south-west','west','north-west'][Math.round(d/45)%8]}
// live mode: while What's here? is on, fetch what a click at the lens centre needs ahead of the click (5 km cells, kept in the browser)
let preT=null;function prefetchRecs(){clearTimeout(preT);if(!LZ.LC.live||!(LZ.tool&&LZ.tool()==='whatis'))return;preT=setTimeout(()=>{if(map.getZoom()<(LZ.LC.live.minzoom||13))return;const lp=document.getElementById('lens').getBoundingClientRect(),mp=map.getContainer().getBoundingClientRect(),c=map.containerPointToLatLng([lp.left+lp.width/2-mp.left,lp.top+lp.height/2-mp.top]),[E,N]=ll2en(c.lat,c.lng);
  dataNear(E,N,180).catch(()=>{});dtmWindow(c,100).catch(()=>{})},800)}   // the lens centre's records and close-up LiDAR, the likeliest next click
map.on('moveend',prefetchRecs);
LZ.toolHooks.whatis={click:whatIs,on(){loadData();prefetchRecs();msg(TN+' ON: click any spot (inside or outside the lens). Esc or the button turns it off.',3500)},off(){closeCard()}};
$('whatis').onclick=()=>LZ.setTool('whatis');LZ.whatIs=whatIs;
// ---- evaluation hook (used by the offline training harness; no UI effect) ----
LZ.evalAt=async function(E,N,opts){const [la,lo]=en2ll(E,N);const ll=L.latLng(la,lo);const [W,D]=await Promise.all([dtmWindow(ll,100),dataNear(E,N,180)]);
  const a=analyse(W);const elev=await LZ.heightAt(ll);const ref=a.nodata?[E,N]:ll2en(a.centreLL.lat,a.centreLL.lng);const ctx={};for(const k in D.ctx){const r=nearest(D.ctx[k],ref[0],ref[1],150);if(r)ctx[k]=r}
  const cls=classify(a,ctx,elev==null?0:elev);const sc=a.nodata?{nodata:true}:Object.fromEntries(Object.entries(a).filter(([k,v])=>typeof v==='number'||typeof v==='boolean'));
  return {kind:cls.kind,a:sc,ctx:Object.fromEntries(Object.entries(ctx).map(([k,v])=>[k,Math.round(v.d)])),elev}};
})();
