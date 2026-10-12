/* LiDAR Lens UI helpers: help panel, keyboard shortcuts, ramp swatches, lens reset, coverage/zoom status. */
(function(){'use strict';const LZ=window.__lens,map=LZ.map,$=id=>document.getElementById(id),LC=LZ.LC;
// help
const help=$('help'),hb=$('helpbtn');const showHelp=v=>{help.hidden=!v;hb.setAttribute('aria-expanded',String(v));if(v)$('helpx').focus()};
hb.onclick=()=>showHelp(help.hidden);$('helpx').onclick=()=>{showHelp(false);hb.focus()};
// ramp swatches
const sw=$('swatches'),sel=$('ramp');
[...sel.options].forEach(o=>{const st=LZ.RAMPS[o.value]||['#000','#fff'];const b=document.createElement('button');b.type='button';b.dataset.v=o.value;b.title=o.textContent;b.setAttribute('aria-label','Colour ramp: '+o.textContent);
  b.style.background='linear-gradient(90deg,'+st.join(',')+')';b.onclick=()=>{if(sel.disabled)return;sel.value=o.value;sel.dispatchEvent(new Event('change'));mark()};sw.appendChild(b)});
function mark(){[...sw.children].forEach(b=>{b.classList.toggle('sel',b.dataset.v===sel.value);b.disabled=sel.disabled;b.style.opacity=sel.disabled?.4:1})}
sel.addEventListener('change',mark);const ms=$('mode');ms.addEventListener('change',()=>setTimeout(mark,0));$('reset').addEventListener('click',()=>setTimeout(mark,0));mark();
// lens reset
$('lensreset').onclick=()=>LZ.resetLens();
// status: outside coverage / past useful zoom
const B=LC.bounds;let poly=null;if(LC.outline)fetch(LC.outline).then(r=>r.json()).then(g=>{poly=g;upd()}).catch(()=>{});
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
  if(k>='1'&&k<='8'){ms.value=String(+k-1);ms.dispatchEvent(new Event('change'))}
  else if(k==='w'||k==='W')$('whatis').click();else if(k==='p'||k==='P')$('profile').click();
  else if(k==='f'||k==='F')$('fs').click();else if(k==='s'||k==='S')$('sm').click();
  else if(k==='c'||k==='C')LZ.resetLens();else if(k==='/'){$('gotoq').focus()}
  else if(k==='h'||k==='H'){const h=$('panel').classList.toggle('hide');document.body.classList.toggle('panelhidden',h)}
  else if(k==='?')showHelp(help.hidden);else if(k==='Escape'&&!help.hidden){showHelp(false)}else done=false;
  if(done&&k!=='Escape')e.preventDefault()});
// public repo link (help, About, map footer)
const REPO=LC.repoUrl||'https://github.com/TimDaw37/lidar-lens';const rl='<a href="'+REPO+'" target="_blank" rel="noopener noreferrer">GitHub</a>';
help.insertAdjacentHTML('beforeend','<p style="margin-top:10px">Open source: the code and a step-by-step protocol to build your own LiDAR Lens for another area are on '+rl+'.</p>');
$('about').insertAdjacentHTML('beforeend','<br><br>Code and replication protocol: '+rl+'.');
if(map.attributionControl)map.attributionControl.addAttribution('<a href="'+REPO+'" target="_blank" rel="noopener noreferrer">LiDAR Lens code</a>');
if(innerWidth<700)document.querySelectorAll('#panel details.sec').forEach(d=>{d.open=/Tools/.test(d.querySelector('summary').textContent)});
if(!LC.private){const t=$('privtag');if(t)t.remove()}
LZ.ui={showHelp,mark};})();
