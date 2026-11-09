/* LiDAR Lens UI helpers: help panel, keyboard shortcuts, ramp swatches, lens reset, coverage/zoom status. */
(function(){'use strict';const LZ=window.__lens,map=LZ.map,$=id=>document.getElementById(id),LC=LZ.LC;
// help
const help=$('help'),hb=$('helpbtn');const showHelp=v=>{help.hidden=!v;hb.setAttribute('aria-expanded',String(v));if(v)$('helpx').focus()};
hb.onclick=()=>showHelp(help.hidden);$('helpx').onclick=()=>{showHelp(false);hb.focus()};
// ramp swatches
const sw=$('swatches'),sel=$('ramp');
[...sel.options].forEach(o=>{const st=o.value==='redrel'?['#000000','#8a2b1c','#ffffff']:LZ.RAMPS[o.value]||['#000','#fff'];const b=document.createElement('button');b.type='button';b.dataset.v=o.value;b.title=o.textContent;b.setAttribute('aria-label','Colour ramp: '+o.textContent);
  b.style.background='linear-gradient(90deg,'+st.join(',')+')';b.onclick=()=>{if(sel.disabled)return;sel.value=o.value;sel.dispatchEvent(new Event('change'));mark()};sw.appendChild(b)});
function mark(){[...sw.children].forEach(b=>{b.classList.toggle('sel',b.dataset.v===sel.value);{const o=sel.querySelector('option[value="'+b.dataset.v+'"]');b.hidden=!!(o&&o.hidden)}b.disabled=sel.disabled;b.style.opacity=sel.disabled?.4:1})}
sel.addEventListener('change',mark);const ms=$('mode');ms.addEventListener('change',()=>setTimeout(mark,0));$('reset').addEventListener('click',()=>setTimeout(mark,0));mark();
const modeBar=$('modes');
if(modeBar){const names=['Hillshade','Multi-direction','Slope','Local relief','Sky-view','Aspect','Red relief','Combined','Combined VAT'],vals=[0,1,2,3,4,5,6,7,10],keys=['1','2','3','4','5','6','7','8','V'];
  for(let j=0;j<names.length;j++){const i=vals[j];const b=document.createElement('button');b.type='button';b.textContent=keys[j];b.title=names[j];b.dataset.m=String(i);b.setAttribute('aria-label',names[j]+', key '+keys[j]);
    b.onclick=()=>{ms.value=String(i);ms.dispatchEvent(new Event('change'));paintModes();flashMode(names[j])};modeBar.appendChild(b)}
  function paintModes(){[...modeBar.children].forEach(b=>b.classList.toggle('on',ms.value===b.dataset.m))}
  function flashMode(name){if(!matchMedia('(pointer:coarse)').matches)return;const m=$('msg');
    const up=matchMedia('(max-width:700px) and (pointer:coarse)').matches&&!$('panel').classList.contains('hide');
    m.style.top='auto';m.style.bottom=up?'calc(50vh + 60px)':'72px';LZ.msg(name,1200);
    setTimeout(()=>{if(m.textContent===name){m.style.top='';m.style.bottom=''}},1200)}
  ms.addEventListener('change',paintModes);$('reset').addEventListener('click',()=>setTimeout(paintModes,0));paintModes()}
// lens reset
$('lensreset').onclick=()=>LZ.resetLens();
// status: outside coverage / past useful zoom
const B=LC.bounds;let poly=null;if(window.__outlineP)window.__outlineP.then(g=>{poly=g;upd()}).catch(()=>{});
function inR(x,y,r){let c=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const [xi,yi]=r[i],[xj,yj]=r[j];if(((yi>y)!=(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))c=!c}return c}
function covers(ll){if(B&&!(ll.lat>=B[0][0]&&ll.lat<=B[1][0]&&ll.lng>=B[0][1]&&ll.lng<=B[1][1]))return false;if(!poly)return true;const fs=poly.type==='FeatureCollection'?poly.features:[poly];
  for(const f of fs){const g=f.geometry||f;const P=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];for(const p of P)if(inR(ll.lng,ll.lat,p[0])&&!p.slice(1).some(h=>inR(ll.lng,ll.lat,h)))return true}return false}
const area=LC.areaName||'this area',st=$('status');
function upd(){let t='';const b=map.getBounds();const c=map.getCenter();
  if(!covers(c)&&!covers(b.getNorthWest())&&!covers(b.getSouthEast())&&!covers(b.getNorthEast())&&!covers(b.getSouthWest()))t='Outside the LiDAR coverage: this map only covers '+area+'. Use Go to or zoom out to get back.';
  else if(map.getZoom()>18.5)t='Past the useful zoom: the LiDAR is 1 m data, so beyond this it is only magnified.';
  st.textContent=t;st.hidden=!t}
map.on('moveend zoomend',upd);upd();LZ.coverageStatus=()=>st.hidden?'':st.textContent;
// keyboard shortcuts
document.addEventListener('keydown',e=>{const t=e.target;if(e.ctrlKey||e.metaKey||e.altKey)return;if(t&&(t.tagName==='INPUT'&&t.type!=='checkbox'&&t.type!=='range'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.isContentEditable))return;
  const k=e.key;let done=true;
  if(k==='0'){ms.value='9';ms.dispatchEvent(new Event('change'))}
  else if(k>='1'&&k<='9'){ms.value=String(+k-1);ms.dispatchEvent(new Event('change'))}
  else if(k==='v'||k==='V'){ms.value='10';ms.dispatchEvent(new Event('change'))}
  else if(k==='o'||k==='O'){ms.value='11';ms.dispatchEvent(new Event('change'))}
  else if(k==='l'||k==='L'){ms.value='12';ms.dispatchEvent(new Event('change'))}
  else if(k==='m'||k==='M'){ms.value='13';ms.dispatchEvent(new Event('change'))}
  else if(k==='t'||k==='T'){ms.value='14';ms.dispatchEvent(new Event('change'))}
  else if(k==='w'||k==='W')$('whatis').click();else if(k==='p'||k==='P')$('profile').click();
  else if(k==='f'||k==='F')$('fs').click();else if((k==='s'||k==='S')&&!LC.tidyUI)$('sm').click();
  else if(k==='c'||k==='C')LZ.resetLens();else if(k==='/'){$('gotoq').focus()}
  else if(k==='h'||k==='H'){const h=$('panel').classList.toggle('hide');document.body.classList.toggle('panelhidden',h);if(LZ.placeLens)LZ.placeLens();if(LZ.requestRender)LZ.requestRender()}
  else if(k==='?')showHelp(help.hidden);else if(k==='Escape'&&!help.hidden){showHelp(false)}else done=false;
  if(done&&k!=='Escape')e.preventDefault()});
// ---- tidyUI (GB test): one place per item. 'Background map' section = base map + old OS map (translucent, with opacity);
// 'Data layers' = everything fetched as data (country-switched list, plus rights of way where an area has them). No duplicate
// scheduled-monument tick (it is in Data layers per country) and no map layers button (its choices are all in the panel).
if(LC.tidyUI){const sm=$('sm');if(sm){sm.checked=false;const r=sm.closest('.row');if(r)r.remove()}
  const ov=$('histbox')&&$('histbox').closest('details');if(ov){ov.querySelector('summary').textContent='Background map';ov.open=true}
  const B=LZ.bases,bx=document.createElement('div');bx.innerHTML='<label for="bgsel">Background (outside the lens)</label><select id="bgsel" title="Map or aerial photo shown outside the lens"></select>';
  $('histbox').parentNode.insertBefore(bx,$('histbox'));const bs=$('bgsel');
  B.BASES.forEach(b=>{const o=document.createElement('option');o.value=b.id;o.textContent=b.name;bs.appendChild(o)});bs.value=LZ.S.base;
  bs.onchange=()=>{B.set(bs.value);LZ.saveHashSoon&&LZ.saveHashSoon()};map.on('baselayerchange',()=>{bs.value=LZ.S.base});
  const hl=document.querySelector('label[for="hist"]');if(hl)hl.textContent='Old OS map on top (translucent; None = off)';
  const n=$('ovlnote');if(n)n.textContent='The background and the old OS map show outside the lens; the lens always shows LiDAR. Data layers (designations, records, rights of way) are in Data layers below.';
  const ls=$('laysec');if(ls){ls.querySelector('summary').textContent='Data layers';const pb=$('prowbox'),pk=$('prowkey'),ll=$('laylist');if(pb&&ll){ll.parentNode.insertBefore(pb,ll);ll.parentNode.insertBefore(pk,ll)}}}
// ---- overlays: historic OS maps (NLS) + public rights of way (configurable per area) ----
// Defaults cover all of Great Britain; the NLS 25-inch tiles are per county, so add them in the area config (see configs/wiltshire.js).
const HIST=LC.historicMaps!==undefined?LC.historicMaps:[
  {id:'6in',name:'Six-inch, 1888–1913',url:'https://mapseries-tilesets.s3.amazonaws.com/os/6inchsecond/{z}/{x}/{y}.png',minZoom:11,maxNativeZoom:17},
  {id:'1in',name:'One-inch, 1885–1903',url:'https://mapseries-tilesets.s3.amazonaws.com/1inch_2nd_ed/{z}/{x}/{y}.png',minZoom:8,maxNativeZoom:16}];
const NLS_ATTR='Historic map: <a href="https://maps.nls.uk/" target="_blank" rel="noopener noreferrer">Reproduced with the permission of the National Library of Scotland</a> (CC-BY)';
const hs=$('hist'),hop=$('histop');let histL=null;
if(!HIST.length)$('histbox').hidden=true;
HIST.forEach(h=>{const o=document.createElement('option');o.value=h.id;o.textContent=h.name;hs.appendChild(o)});
// One tile layer per historic map, listed on the map's layers button as well as in the panel; only one shows at a time.
const histLayers={};HIST.forEach(h=>{const l=L.tileLayer(h.url,{maxZoom:20,minZoom:h.minZoom||0,maxNativeZoom:h.maxNativeZoom||17,opacity:+hop.value,attribution:h.attribution||NLS_ATTR,zIndex:5});
  l._histId=h.id;histLayers[h.id]=l;if(LZ.layersCtl)LZ.layersCtl.addOverlay(l,'Old OS map: '+h.name)});
function setHist(id){const h=HIST.find(x=>x.id===id);hop.disabled=!h;hs.value=h?id:'';
  Object.values(histLayers).forEach(l=>{if(l._histId!==id&&map.hasLayer(l))map.removeLayer(l)});
  histL=h?histLayers[id]:null;
  if(histL){histL.setOpacity(+hop.value);if(!map.hasLayer(histL))histL.addTo(map);
    if(h.minZoom&&map.getZoom()<h.minZoom)LZ.msg('Zoom in to see the '+h.name+' map (from zoom '+h.minZoom+')',3500)}}
// Ticking an old map on the layers button does the same as choosing it in the panel.
map.on('overlayadd',e=>{if(e.layer._histId&&e.layer!==histL){setHist(e.layer._histId);LZ.saveHashSoon()}});
map.on('overlayremove',e=>{if(e.layer._histId&&e.layer===histL){histL=null;hs.value='';hop.disabled=true;LZ.saveHashSoon()}});
hs.onchange=()=>{setHist(hs.value);LZ.saveHashSoon()};hop.oninput=()=>{$('histopv').textContent=Math.round(hop.value*100)+'%';if(histL)histL.setOpacity(+hop.value);LZ.saveHashSoon()};
const PROW=LC.prow||null;   // {url, attribution}: per-area rights of way GeoJSON (property t: 1 byway, 2 restricted byway, 3 bridleway, 4 footpath)
const PCOL={1:'#1971c2',2:'#e8590c',3:'#2f9e44',4:'#d6336c'},PNAME={1:'Byway open to all traffic',2:'Restricted byway',3:'Bridleway',4:'Footpath'};let prowL=null,prowP=null;
if(!PROW){$('prowbox').hidden=true;$('prowbox').style.display='none'}   // .row is display:flex, which overrides [hidden]
function setProw(on){$('prowkey').hidden=!on;if(!on){if(prowL)map.removeLayer(prowL);return}
  if(prowL){prowL.addTo(map);return}LZ.msg('Loading rights of way…');
  prowP=prowP||fetch(PROW.url).then(r=>r.json());prowP.then(g=>{prowL=L.geoJSON(g,{renderer:L.canvas({tolerance:6}),attribution:PROW.attribution,style:f=>({color:PCOL[f.properties.t]||'#d6336c',weight:3,opacity:.9,dashArray:f.properties.t===4?'6 4':null}),
    onEachFeature:(f,l)=>l.bindPopup('<b>'+PNAME[f.properties.t]+'</b>'+(f.properties.r?'<br>'+f.properties.r.replace(/[<>&]/g,''):'')+'<br><small>Working copy of the Definitive Map; check the council\'s map before relying on it.</small>')});
    if($('prow').checked)prowL.addTo(map);LZ.msg('',1)}).catch(()=>LZ.msg('Could not load rights of way',3000))}
$('prow').onchange=e=>{setProw(e.target.checked);LZ.saveHashSoon()};
window.__lensHashExtra=p=>{if(hs.value){p.set('hist',hs.value);p.set('histop',hop.value)}if($('prow').checked)p.set('prow',1)};
{const H=LZ.H0||{};if(H.histop)hop.value=H.histop;$('histopv').textContent=Math.round(hop.value*100)+'%';if(H.hist&&HIST.some(x=>x.id===H.hist)){hs.value=H.hist;setHist(H.hist)}else setHist('');if(H.prow==='1'&&PROW){$('prow').checked=true;setProw(true)}}
// public repo link (help, About, map footer)
const REPO=LC.repoUrl||'https://github.com/TimDaw37/lidar-lens';const rl='<a href="'+REPO+'" target="_blank" rel="noopener noreferrer">GitHub</a>';
help.insertAdjacentHTML('beforeend','<p style="margin-top:10px">Open source: the code and a step-by-step protocol to build your own LiDAR Lens for another area are on '+rl+'.</p>');
$('about').insertAdjacentHTML('beforeend','<br><br>Code and replication protocol: '+rl+'.');
if(map.attributionControl)map.attributionControl.addAttribution('<a href="'+REPO+'" target="_blank" rel="noopener noreferrer">LiDAR Lens code</a>');
if(matchMedia('(max-width:700px),(max-height:500px) and (pointer:coarse)').matches){const sheet=matchMedia('(max-width:700px) and (pointer:coarse)').matches;document.querySelectorAll('#panel details.sec').forEach(d=>{const name=d.querySelector('summary').textContent;d.open=sheet?/Visualisation/.test(name):/Tools/.test(name)})}
if(matchMedia('(pointer:coarse)').matches){const p=document.querySelector('#help p');if(p)p.innerHTML=p.innerHTML.replace('Drag its rim or top grip to move it; drag the white dot to resize.','Drag the grip to move the lens and the white dot to resize. Drag a finger around the rim to turn the sun.')}
if(!LC.private){const t=$('privtag');if(t)t.remove()}
{const n=LC.toolName||'What is it?';const a=$('helptn'),k=$('keytn');if(a)a.textContent=n;if(k)k.textContent=n+' on/off';LZ.updateToolButtons&&LZ.updateToolButtons()}
// phone: collapse the credit line to a 'Credits' button
{const ac=document.querySelector('.leaflet-control-attribution');if(ac){const wrap=()=>{if(!ac.querySelector('.credbtn')){const b=document.createElement('button');b.className='credbtn';b.type='button';b.title='Show or hide map credits';b.textContent=ac.classList.contains('short')?'ⓘ Credits':'× hide';b.onclick=e=>{e.stopPropagation();ac.classList.toggle('short');b.textContent=ac.classList.contains('short')?'ⓘ Credits':'× hide'};ac.appendChild(b)}};
  ac.classList.add('short');wrap();new MutationObserver(wrap).observe(ac,{childList:true})}}
LZ.ui={showHelp,mark};})();
// Phone pinch guard: a two-finger pinch that lands on the panel, mode strip or title box (outside the map's touch-action:none) used to zoom the whole page, which pushed the sheet and mode buttons off screen and could leave the page scrolled after zooming back out, so the controls never came back. Pinch now zooms only the map; if the page still ends up zoomed or scrolled (older iOS ignores the viewport lock), snap it back.
(function pinchGuard(){const stop=e=>{if(!(e.target.closest&&e.target.closest('#map')))e.preventDefault()};
  ['gesturestart','gesturechange'].forEach(t=>document.addEventListener(t,e=>e.preventDefault(),{passive:false}));
  document.addEventListener('touchmove',e=>{if(e.touches&&e.touches.length>1)stop(e)},{passive:false});
  const meta=document.querySelector('meta[name=viewport]'),vv=window.visualViewport;let t=null;
  function fix(){t=null;if(vv&&vv.scale>1.01&&meta){const c=meta.content;meta.content=c.replace(/,?\s*maximum-scale=[^,]*/,'')+', maximum-scale=1';setTimeout(()=>{meta.content=c},50)}
    if(window.scrollX||window.scrollY)window.scrollTo(0,0);document.documentElement.scrollTop=document.body.scrollTop=0;document.documentElement.scrollLeft=document.body.scrollLeft=0;
    const Z=window.__lens;if(Z&&Z.map)Z.map.invalidateSize();if(Z&&Z.placeLens)Z.placeLens()}
  const later=()=>{clearTimeout(t);t=setTimeout(fix,250)};
  if(vv){vv.addEventListener('resize',later);vv.addEventListener('scroll',later)}window.addEventListener('scroll',later,{passive:true});document.addEventListener('touchend',e=>{if(!e.touches||!e.touches.length)later()},{passive:true})})();
