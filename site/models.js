// Models index: Tim's detailed Wiltshire models, from models.json. Outlines for area models, pins for point models,
// a card listing every model at a spot, a Wiltshire-wide list, and a searchable list that flies to each.
(function(){'use strict';
const LZ=window.__lens;if(!LZ)return;const map=LZ.map,$=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const box=$('models');if(!box)return;
let M=[],layer=L.layerGroup(),on=true;const card=$('mcard');
const open=m=>'<a href="'+esc(m.url)+'" target="_blank" rel="noopener noreferrer">Open</a>';
const row=m=>'<li><b>'+esc(m.title)+'</b>'+(m.approx?' <span class="ap" title="location set by hand">≈</span>':'')+'<br><span class="j">'+esc(m.job)+'</span> · '+open(m)+'</li>';
const PT_R=300; // metres: point models closer than this share one pin
function at(ll){ // all site-scope models at this spot (inside a box, or a point within PT_R)
  return M.filter(m=>m.scope!=='county').filter(m=>{const g=m.geometry;
    if(g.latlngBounds)return L.latLngBounds(g.latlngBounds).contains(ll);
    return map.distance(ll,g.latlng)<=PT_R}).sort((a,b)=>area(a)-area(b))}
function area(m){const b=m.geometry.bbox;return b?(b[2]-b[0])*(b[3]-b[1]):0}
function showCard(ll,list){
  if(!list.length){card.hidden=true;return}
  card.innerHTML='<button class="x" aria-label="Close">&times;</button><h3>'+list.length+' model'+(list.length>1?'s':'')+' here</h3><ul>'+list.map(row).join('')+'</ul>';
  card.hidden=false;card.querySelector('.x').onclick=()=>{card.hidden=true}}
function build(){
  layer.clearLayers();
  const site=M.filter(m=>m.scope!=='county');
  site.filter(m=>m.geometry.latlngBounds).sort((a,b)=>area(b)-area(a)).forEach(m=>{
    const r=L.rectangle(m.geometry.latlngBounds,{color:'#ffd23f',weight:2,dashArray:m.approx?'4 6':null,fill:true,fillOpacity:0.03,className:'mbox'});
    r.bindTooltip(esc(m.title)+(m.approx?' (approx. area)':''),{sticky:true});
    r.on('click',e=>{L.DomEvent.stop(e);showCard(e.latlng,at(e.latlng))});layer.addLayer(r)});
  const pins=[];site.filter(m=>m.geometry.latlng).forEach(m=>{const p=pins.find(q=>map.distance(q.ll,m.geometry.latlng)<=PT_R);if(p)p.ms.push(m);else pins.push({ll:L.latLng(m.geometry.latlng),ms:[m]})});
  pins.forEach(p=>{const n=p.ms.length;const mk=L.marker(p.ll,{icon:L.divIcon({className:'mpin',html:'<span>'+(n>1?n:'')+'</span>',iconSize:[22,22],iconAnchor:[11,11]}),riseOnHover:true});
    mk.bindTooltip(p.ms.map(m=>esc(m.title)).join('<br>'),{direction:'top',offset:[0,-10]});
    mk.on('click',e=>{L.DomEvent.stop(e);showCard(p.ll,at(p.ll))});layer.addLayer(mk)});
  if(on)layer.addTo(map)}
function lists(){
  const cw=M.filter(m=>m.scope==='county');
  $('mcounty').innerHTML=cw.map(row).join('');
  const q=($('mq').value||'').toLowerCase().trim();
  const all=M.filter(m=>!q||(m.title+' '+m.job+' '+m.description).toLowerCase().includes(q));
  $('mlist').innerHTML=all.map((m,i)=>'<li><a href="#" data-i="'+M.indexOf(m)+'" class="fly">'+esc(m.title)+'</a>'+(m.scope==='county'?' <span class="j">(Wiltshire-wide)</span>':'')+'<br><span class="j">'+esc(m.job)+'</span> · '+open(m)+'</li>').join('')||'<li class="j">No match</li>';
  $('mcount').textContent=M.length;
}
$('mlist').addEventListener('click',e=>{const a=e.target.closest('a.fly');if(!a)return;e.preventDefault();const m=M[+a.dataset.i],g=m.geometry;
  if(!on){on=true;$('mshow').checked=true;layer.addTo(map)}
  if(g.latlng){map.flyTo(g.latlng,16);map.once('moveend',()=>showCard(L.latLng(g.latlng),at(L.latLng(g.latlng))))}
  else{map.flyToBounds(g.latlngBounds,{padding:[30,30],maxZoom:15});map.once('moveend',()=>{const c=L.latLngBounds(g.latlngBounds).getCenter();showCard(c,m.scope==='county'?[m]:at(c).filter(x=>x===m||x.geometry.latlng||L.latLngBounds(x.geometry.latlngBounds).contains(c)))})}
  if(window.innerWidth<=700){const p=$('panel');if(p)p.classList.add('hide')}});
$('mq').addEventListener('input',lists);
$('mshow').addEventListener('change',e=>{on=e.target.checked;on?layer.addTo(map):(map.removeLayer(layer),card.hidden=true)});
fetch('models.json').then(r=>r.json()).then(d=>{M=d.models||[];build();lists()}).catch(()=>{$('mcount').textContent='?'});
window.__models={get list(){return M},showAt:ll=>showCard(L.latLng(ll),at(L.latLng(ll)))};
})();
