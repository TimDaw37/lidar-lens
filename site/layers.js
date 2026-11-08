/* Optional map layers. Nothing is fetched until its box is ticked, and then only the area on screen.
   Open data only. Historic England AIM is included; its HER number and HER link fields are not requested.
   No Wiltshire HER layer, here or anywhere else. */
(function(){
'use strict';
const LZ=window.__lens,map=LZ.map,$=id=>document.getElementById(id);
if(!$('laylist'))return;
const phone=()=>matchMedia('(pointer:coarse)').matches||matchMedia('(max-width:700px)').matches;
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const alink=(href,text)=>'<a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">'+esc(text)+'</a>';
const titleCase=s=>String(s||'').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
function aimBits(s){return String(s||'').split('\\').map(x=>x.replace(/\d{4,}$/,'').trim()).filter(Boolean).map(titleCase)}
const HE='https://services-eu1.arcgis.com/ZOdPfBS3aqqDYPUQ/arcgis/rest/services/';
const NHLE=HE+'National_Heritage_List_for_England_NHLE_v02_VIEW/FeatureServer/';
const NE='https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/services/';
const OGL='Open Government Licence';
const NHLE_C='© Historic England (National Heritage List). Contains OS data © Crown copyright and database right. '+OGL+'.';
const HES='https://inspire.hes.scot/arcgis/rest/services/HES/HES_Designations/MapServer/';
const HES_C='© Historic Environment Scotland. Contains OS data © Crown copyright and database right. '+OGL+'.';
const NS='https://services1.arcgis.com/LM9GyVFsughzHdbO/arcgis/rest/services/';
const NS_C=n=>n+' © NatureScot. Contains OS data © Crown copyright and database right. '+OGL+'.';
function hesPopup(kind){return p=>{let h='<b>'+esc(p.DES_TITLE||kind)+'</b><br>'+esc(kind);const sub=[];if(p.CATEGORY&&String(p.CATEGORY).trim())sub.push('Category '+String(p.CATEGORY).trim());if(p.DES_REF)sub.push(p.DES_REF);
  if(sub.length)h+='<br>'+esc(sub.join(' · '));if(p.LINK&&/^https?:\/\//i.test(p.LINK))h+='<br>'+alink(p.LINK,'HES designation record');return h}}
function nsPopup(kind){return p=>{let h='<b>'+esc(p.NAME||kind)+'</b><br>'+esc(kind);if(p.PA_CODE)h+='<br>'+alink('https://sitelink.nature.scot/site/'+encodeURIComponent(p.PA_CODE),'NatureScot SiteLink');return h}}
const canvasR=L.canvas({padding:0.5});
let ate=false;
function nhlePopup(kind){return p=>{
  const name=p.Name||kind;let h='<b>'+esc(name)+'</b><br>'+esc(kind);
  const sub=[];if(p.Grade)sub.push('Grade '+p.Grade);if(p.ListEntry)sub.push('List entry '+p.ListEntry);
  if(sub.length)h+='<br>'+esc(sub.join(' · '));
  if(p.hyperlink&&/^https?:\/\//i.test(p.hyperlink))h+='<br>'+alink(p.hyperlink,'List entry');
  return h}}
function aimPopup(p){
  const types=aimBits(p.MONUMENT_TYPE),pers=aimBits(p.PERIOD),layers=aimBits(p.LAYER),evs=aimBits(p.EVIDENCE_1);
  let h='<b>'+esc(types[0]||'Mapped feature')+'</b>';
  if(types.length>1)h+='<br>'+esc(types.slice(1).join(', '));
  if(pers.length)h+='<br>Period: '+esc(pers.join(', '));
  const extra=[layers.join(', '),evs.join(', ')].filter(Boolean).join(' · ');
  if(extra)h+='<br>'+esc(extra);
  if(p.project)h+='<br>'+esc(p.project);
  if(p.HE_URL1&&/^https?:\/\//i.test(p.HE_URL1))h+='<br>'+alink(p.HE_URL1,'Historic England record');
  return h}
function aimStyle(f){
  const ev=String((f.properties||{}).EVIDENCE_1||'').toUpperCase();
  const earth=ev.indexOf('EARTHWORK')>=0,crop=ev.indexOf('CROPMARK')>=0;
  const color=earth?'#c2410c':crop?'#6d28d9':'#0f766e';
  return {color,weight:1.6,opacity:.95,fillColor:color,fillOpacity:.12,dashArray:crop&&!earth?'3 3':null}}
const bgs625={Bedrock:'Geology_625k_Bedrock13265',Superficial:'Geology_625k_Superficial11094'};
let bgs625P=null;
function bgs625Names(){if(!bgs625P)bgs625P=fetch('https://map.bgs.ac.uk/arcgis/services/SDDS/Geology_625k/MapServer/WMSServer?service=WMS&request=GetCapabilities&version=1.3.0')
  .then(r=>r.ok?r.text():'').then(xml=>{const re=/<Name>([^<]+)<\/Name>[\s\S]{0,400}?<Title>(?:<!\[CDATA\[)?([^\]<]+)/g;let m;
    while((m=re.exec(xml))){if(/Bedrock/i.test(m[2])&&!/Dyke/i.test(m[2])&&!bgs625.BedrockDone){bgs625.Bedrock=m[1];bgs625.BedrockDone=1}if(/Superficial/i.test(m[2])&&!bgs625.SuperficialDone){bgs625.Superficial=m[1];bgs625.SuperficialDone=1}}
    return bgs625}).catch(()=>bgs625);return bgs625P}
const CATALOG=[
 {id:'nhle-sm',group:'Historic England',c:'E',name:'Scheduled monuments',kind:'fs',url:NHLE+'6',minZoom:12,cap:[400,200],
  fields:'ListEntry,Name,hyperlink',credit:NHLE_C,popup:nhlePopup('Scheduled monument'),
  style:()=>({color:'#dc2626',weight:2,fill:false})},
 {id:'nhle-lb',group:'Historic England',c:'E',name:'Listed buildings',kind:'fs',url:NHLE+'0',minZoom:15,cap:[300,150],points:true,color:'#b45309',
  fields:'ListEntry,Name,Grade,hyperlink',credit:NHLE_C,popup:nhlePopup('Listed building')},
 {id:'nhle-pg',group:'Historic England',c:'E',name:'Parks and gardens',kind:'fs',url:NHLE+'7',minZoom:11,cap:[200,100],
  fields:'ListEntry,Name,Grade,hyperlink',credit:NHLE_C,popup:nhlePopup('Registered park or garden'),
  style:()=>({color:'#15803d',weight:2,fillColor:'#15803d',fillOpacity:.08})},
 {id:'nhle-bf',group:'Historic England',c:'E',name:'Battlefields',kind:'fs',url:NHLE+'8',minZoom:10,cap:[40,40],
  fields:'ListEntry,Name,hyperlink',credit:NHLE_C,popup:nhlePopup('Registered battlefield'),
  style:()=>({color:'#7c3aed',weight:2,fillColor:'#7c3aed',fillOpacity:.1})},
 {id:'nhle-whs',group:'Historic England',c:'E',name:'World Heritage Sites',kind:'fs',url:NHLE+'10',minZoom:9,cap:[20,20],
  fields:'ListEntry,Name,hyperlink',credit:NHLE_C,popup:nhlePopup('World Heritage Site'),
  style:()=>({color:'#1d4ed8',weight:3,fillColor:'#1d4ed8',fillOpacity:.05})},
 {id:'aim',group:'Historic England',c:'E',name:'Aerial mapping (cropmarks and earthworks)',kind:'fs',
  url:HE+'HE_AIM_data/FeatureServer/0',minZoom:15,cap:[320,160],
  fields:'MONUMENT_TYPE,PERIOD,LAYER,EVIDENCE_1,project,HE_UID,HE_URL1',
  credit:'Aerial Archaeology Mapping © Historic England 2026. '+OGL+'.',
  popup:aimPopup,style:aimStyle},
 {id:'sssi',group:'Natural England',c:'E',name:'SSSI',kind:'fs',url:NE+'SSSI_England/FeatureServer/0',minZoom:12,cap:[200,100],
  fields:'NAME,REF_CODE',credit:'Sites of Special Scientific Interest © Natural England. Contains OS data © Crown copyright and database right. '+OGL+'.',
  popup:p=>'<b>'+esc(p.NAME||'SSSI')+'</b>'+(p.REF_CODE?'<br>Ref '+esc(p.REF_CODE):''),
  style:()=>({color:'#0f766e',weight:2,fillColor:'#0f766e',fillOpacity:.12})},
 {id:'wood',group:'Natural England',c:'E',name:'Ancient woodland',kind:'fs',url:NE+'Ancient_Woodland_England/FeatureServer/0',minZoom:13,cap:[300,150],
  fields:'NAME,THEME,THEMNAME',credit:'Ancient Woodland © Natural England. Contains OS data © Crown copyright and database right. © Woodland Trust. © Forestry Commission. © Getmapping plc and Bluesky International Ltd. '+OGL+'.',
  popup:p=>{const n=(p.NAME||'').trim();return '<b>'+esc(p.THEMNAME||'Ancient woodland')+'</b>'+(n?'<br>'+esc(n):'')},
  style:()=>({color:'#166534',weight:1,fillColor:'#166534',fillOpacity:.28})},
 {id:'crow',group:'Natural England',c:'E',name:'CRoW access land',kind:'fs',url:NE+'CRoW_Act_2000_Access_Layer/FeatureServer/0',minZoom:12,cap:[200,100],
  fields:'Descrip,OC,RCL,S16',credit:'CRoW access land © Natural England. Contains OS data © Crown copyright and database right. '+OGL+'.',
  popup:p=>{const bits=[];if(p.OC==='Yes')bits.push('open country');if(p.RCL==='Yes')bits.push('registered common');if(p.S16==='Yes')bits.push('section 16 dedication');return '<b>CRoW access land</b>'+(bits.length?'<br>'+esc(bits.join(', ')):'')},
  style:()=>({color:'#a16207',weight:1,fillColor:'#ca8a04',fillOpacity:.18})},
 {id:'nl',group:'Natural England',c:'E',name:'National Landscapes (AONB)',kind:'fs',url:NE+'Areas_of_Outstanding_Natural_Beauty_England/FeatureServer/0',minZoom:8,cap:[30,30],
  fields:'NAME,CODE,HOTLINK,DESIG_DATE',credit:'National Landscapes (Areas of Outstanding Natural Beauty) © Natural England. Contains OS data © Crown copyright and database right. '+OGL+'.',
  popup:p=>{let h='<b>'+esc(p.NAME||'National Landscape')+'</b><br>National Landscape (AONB)';if(p.DESIG_DATE)h+='<br>Designated '+esc(p.DESIG_DATE);if(p.HOTLINK&&/^https?:\/\//i.test(p.HOTLINK))h+='<br>'+alink(p.HOTLINK,'Landscape partnership');return h},
  style:()=>({color:'#0369a1',weight:2,dashArray:'6 4',fillColor:'#0369a1',fillOpacity:.05})},
 {id:'fz3',group:'Environment Agency',c:'E',name:'Flood Zone 3 (rivers and sea)',kind:'wms',minZoom:11,
  wms:'https://environment.data.gov.uk/spatialdata/flood-map-for-planning-flood-zones/wms',
  wmsLayers:'Flood_Zones_2_3_Rivers_and_Sea',styles:'Flood_Zones_2_3_Rivers_and_Sea_21_10_2026',cql:"flood_zone='FZ3'",opacity:.55,z:3,
  credit:'Flood Zone 3 (rivers and sea) © Environment Agency. '+OGL+'. The current WMS draws Zones 2 and 3 together; this tick asks only for Zone 3.'},
 {id:'bgs50b',group:'British Geological Survey',c:'GB',name:'Bedrock, 1:50 000',kind:'wms',minZoom:12,wmsKind:'50k',which:'Bedrock',
  wms:'https://map.bgs.ac.uk/arcgis/services/BGS_Detailed_Geology/MapServer/WMSServer',wmsLayers:'BGS.50k.Bedrock',opacity:.62,z:6,
  credit:'Contains British Geological Survey materials © UKRI. 1:50 000 bedrock. '+OGL+'. Tap the map for the unit name.'},
 {id:'bgs50s',group:'British Geological Survey',c:'GB',name:'Superficial deposits, 1:50 000',kind:'wms',minZoom:12,wmsKind:'50k',which:'Superficial',
  wms:'https://map.bgs.ac.uk/arcgis/services/BGS_Detailed_Geology/MapServer/WMSServer',wmsLayers:'BGS.50k.Superficial.deposits',opacity:.62,z:5,
  credit:'Contains British Geological Survey materials © UKRI. 1:50 000 superficial deposits. '+OGL+'. Tap the map for the unit name.'},
 {id:'bgs625b',group:'British Geological Survey',c:'GB',name:'Bedrock, 1:625 000 (overview)',kind:'wms',maxZoom:12,wmsKind:'625k',which:'Bedrock',
  wms:'https://map.bgs.ac.uk/arcgis/services/SDDS/Geology_625k/MapServer/WMSServer',wmsLayers:bgs625.Bedrock,opacity:.5,z:4,
  credit:'Contains NERC materials © NERC. BGS Geology 625k bedrock, for when you are zoomed out. '+OGL+'. Tap the map for the unit name.'},
 {id:'bgs625s',group:'British Geological Survey',c:'GB',name:'Superficial, 1:625 000 (overview)',kind:'wms',maxZoom:12,wmsKind:'625k',which:'Superficial',
  wms:'https://map.bgs.ac.uk/arcgis/services/SDDS/Geology_625k/MapServer/WMSServer',wmsLayers:bgs625.Superficial,opacity:.5,z:4,
  credit:'Contains NERC materials © NERC. BGS Geology 625k superficial deposits, for when you are zoomed out. '+OGL+'.'},
 ...((LZ.LC&&LZ.LC.tidyUI)?[{id:'hes-sm',group:'Historic Environment Scotland',c:'S',noPage:true,name:'Scheduled monuments',kind:'fs',url:HES+'5',minZoom:11,cap:[150,80],   // tidyUI lenses: SMs live here (no separate overlay tick)
  fields:'DES_REF,DES_TITLE,LINK',credit:HES_C,popup:hesPopup('Scheduled monument'),style:()=>({color:'#ef4444',weight:2,fillColor:'#ef4444',fillOpacity:.08})}]:[]),
 {id:'hes-lb',group:'Historic Environment Scotland',c:'S',noPage:true,name:'Listed buildings',kind:'fs',url:HES+'0',minZoom:15,cap:[300,150],points:true,color:'#b45309',
  fields:'DES_REF,DES_TITLE,CATEGORY,LINK',credit:HES_C,popup:hesPopup('Listed building')},
 {id:'hes-gdl',group:'Historic Environment Scotland',c:'S',noPage:true,name:'Gardens and designed landscapes',kind:'fs',url:HES+'4',minZoom:11,cap:[100,60],
  fields:'DES_REF,DES_TITLE,LINK',credit:HES_C,popup:hesPopup('Garden and designed landscape'),style:()=>({color:'#15803d',weight:2,fillColor:'#15803d',fillOpacity:.08})},
 {id:'hes-whs',group:'Historic Environment Scotland',c:'S',noPage:true,name:'World Heritage Sites',kind:'fs',url:HES+'6',minZoom:9,cap:[20,20],
  fields:'DES_REF,DES_TITLE,LINK',credit:HES_C,popup:hesPopup('World Heritage Site'),style:()=>({color:'#1d4ed8',weight:3,fillColor:'#1d4ed8',fillOpacity:.05})},
 {id:'hes-hmpa',group:'Historic Environment Scotland',c:'S',noPage:true,name:'Historic Marine Protected Areas',kind:'fs',url:HES+'1',minZoom:9,cap:[40,40],
  fields:'DES_REF,DES_TITLE,LINK',credit:HES_C,popup:hesPopup('Historic Marine Protected Area'),style:()=>({color:'#0e7490',weight:2,dashArray:'5 4',fillColor:'#0e7490',fillOpacity:.06})},
 {id:'ns-sssi',group:'NatureScot',c:'S',name:'SSSI',kind:'fs',url:NS+'Sites_of_Special_Scientific_Interest/FeatureServer/0',minZoom:11,cap:[200,100],
  fields:'NAME,PA_CODE',credit:NS_C('Sites of Special Scientific Interest'),popup:nsPopup('Site of Special Scientific Interest'),style:()=>({color:'#16a34a',weight:2,fillColor:'#16a34a',fillOpacity:.08})},
 {id:'ns-sac',group:'NatureScot',c:'S',name:'Special Areas of Conservation (SAC)',kind:'fs',url:NS+'Special_Areas_of_Conservation/FeatureServer/0',minZoom:10,cap:[100,60],
  fields:'NAME,PA_CODE',credit:NS_C('Special Areas of Conservation'),popup:nsPopup('Special Area of Conservation'),style:()=>({color:'#ca8a04',weight:2,dashArray:'6 4',fillColor:'#ca8a04',fillOpacity:.05})},
 {id:'ns-spa',group:'NatureScot',c:'S',name:'Special Protection Areas (SPA, birds)',kind:'fs',url:NS+'Special_Protection_Areas/FeatureServer/0',minZoom:10,cap:[100,60],
  fields:'NAME,PA_CODE',credit:NS_C('Special Protection Areas'),popup:nsPopup('Special Protection Area'),style:()=>({color:'#9333ea',weight:2,dashArray:'2 4',fillColor:'#9333ea',fillOpacity:.04})},
// Wales (layerCountry 'auto' lenses only; 'england' lists drop them): DataMapWales WMS, all Open Government Licence v3.0
 {id:'cadw-sam',group:'Cadw',c:'W',name:'Scheduled monuments',kind:'wms',minZoom:10,wms:'https://datamap.gov.wales/geoserver/ows',wmsLayers:'inspire-wg:Cadw_SAM',opacity:.8,z:6,
  credit:'Scheduled monuments: Designated Historic Asset GIS Data, The Welsh Historic Environment Service (Cadw), DataMapWales. '+OGL+'.'},
 {id:'cadw-lb',group:'Cadw',c:'W',name:'Listed buildings',kind:'wms',minZoom:13,wms:'https://datamap.gov.wales/geoserver/ows',wmsLayers:'inspire-wg:Cadw_ListedBuildings',opacity:.9,z:7,
  credit:'Listed buildings: Cadw, DataMapWales. '+OGL+'.'},
 {id:'cadw-pg',group:'Cadw',c:'W',name:'Registered historic parks and gardens',kind:'wms',minZoom:10,wms:'https://datamap.gov.wales/geoserver/ows',wmsLayers:'geonode:cadw_rhpg_registeredareas',opacity:.6,z:5,
  credit:'Registered historic parks and gardens: Cadw, DataMapWales. '+OGL+'.'},
 {id:'cadw-hl',group:'Cadw',c:'W',name:'Registered historic landscapes',kind:'wms',minZoom:8,wms:'https://datamap.gov.wales/geoserver/ows',wmsLayers:'inspire-wg:Cadw_HistoricLandscapes',opacity:.45,z:4,
  credit:'Registered historic landscapes: Cadw, DataMapWales. '+OGL+'.'},
 {id:'nmrw',group:'Historic Wales (RCAHMW, Coflein)',c:'W',name:'National Monuments Record of Wales sites',kind:'wms',minZoom:12,wms:'https://datamap.gov.wales/geoserver/ows',wmsLayers:'geonode:rcahmw_nmrw_terrestrialsites_rcahmw_bng',opacity:.85,z:6,
  credit:'NMRW sites: produced by the Royal Commission on the Ancient and Historical Monuments of Wales (RCAHMW), Crown Database Right: RCAHMW, DataMapWales. '+OGL+'. Click with What\'s here? for Coflein links.'},
 {id:'nrw-sssi',group:'Natural Resources Wales',c:'W',name:'Sites of Special Scientific Interest (SSSI)',kind:'wms',minZoom:9,wms:'https://datamap.gov.wales/geoserver/ows',wmsLayers:'inspire-nrw:NRW_SSSI',opacity:.5,z:3,
  credit:'SSSI: Natural Resources Wales, DataMapWales. '+OGL+'.'},
 {id:'nrw-sac',group:'Natural Resources Wales',c:'W',name:'Special Areas of Conservation (SAC)',kind:'wms',minZoom:9,wms:'https://datamap.gov.wales/geoserver/ows',wmsLayers:'inspire-nrw:NRW_SAC',opacity:.45,z:3,
  credit:'SAC: Natural Resources Wales, DataMapWales. '+OGL+'.'},
 {id:'nrw-aw',group:'Natural Resources Wales',c:'W',name:'Ancient woodland inventory',kind:'wms',minZoom:11,wms:'https://datamap.gov.wales/geoserver/ows',wmsLayers:'inspire-nrw:NRW_ANCIENT_WOODLAND_INVENTORY_2021',opacity:.5,z:3,
  credit:'Ancient woodland inventory 2021: Natural Resources Wales, DataMapWales. '+OGL+'.'},
 {id:'nrw-fz',group:'Natural Resources Wales',c:'W',name:'Flood Map for Planning, zones 2 and 3',kind:'wms',minZoom:11,wms:'https://datamap.gov.wales/geoserver/ows',wmsLayers:'inspire-nrw:FloodMapforPlanningFloodZones2and3',opacity:.5,z:3,
  credit:'Flood Map for Planning: Natural Resources Wales, DataMapWales. '+OGL+'.'}
];
// Per-country layer list. layerCountry: 'england' (default, unchanged) | 'scotland' | 'auto'.
// 'auto' (multi-country lens): the list shows the layers of the country under the map centre (+ GB-wide ones) and switches as you pan.
// Country = first LC.countryRegions entry ({c:'scotland',poly:[[lat,lng],...]}) containing the centre, else LC.defaultCountry||'england'.
const LCC=(LZ.LC&&LZ.LC.layerCountry)||'england', AUTO=LCC==='auto', CCODE={england:'E',scotland:'S',wales:(LZ.LC&&LZ.LC.walesLayers)?'W':'E'};
function inPoly(lat,lng,P){let ins=false;for(let i=0,j=P.length-1;i<P.length;j=i++){const a=P[i],b=P[j];
  if(((a[0]>lat)!==(b[0]>lat))&&(lng<(b[1]-a[1])*(lat-a[0])/(b[0]-a[0])+a[1]))ins=!ins}return ins}
function countryAt(ll){for(const r of (LZ.LC.countryRegions||[]))if(inPoly(ll.lat,ll.lng,r.poly))return r.c;return LZ.LC.defaultCountry||'england'}
if(!AUTO)for(let i=CATALOG.length-1;i>=0;i--){const c=CATALOG[i].c||'E';if(!(c==='GB'||(LCC==='scotland'?c==='S':c==='E')))CATALOG.splice(i,1)}
if(LCC!=='england')CATALOG.sort((a,b)=>(a.c==='GB')-(b.c==='GB'));
const byId={};CATALOG.forEach(d=>{byId[d.id]=d;d.on=false});
function setStatus(d,t){if(!d.meta)return;d.meta.textContent=d.credit+(t?(' '+t):'')}
function explode(feats){const out=[];for(const f of feats){const g=f&&f.geometry;if(!g)continue;
  if(g.type==='MultiPoint'){for(const c of g.coordinates)out.push({type:'Feature',properties:f.properties,geometry:{type:'Point',coordinates:c}})}
  else out.push(f)}return out}
function drawFeats(d,feats){if(d.layer){map.removeLayer(d.layer);d.layer=null}
  const opt={renderer:canvasR,attribution:d.credit,style:d.style,onEachFeature:(f,l)=>{const html=d.popup&&d.popup(f.properties||{});if(html)l.bindPopup(html,{maxWidth:280});l.on('click',()=>{ate=true})}};
  if(d.points)opt.pointToLayer=(f,ll)=>L.circleMarker(ll,{radius:6,color:d.color,weight:2,fillColor:d.color,fillOpacity:.9});
  d.layer=L.geoJSON({type:'FeatureCollection',features:explode(feats)},opt);if(d.on)d.layer.addTo(map)}
async function loadFs(d){if(!d.on)return;const z=map.getZoom();
  if(z+0.01<(d.minZoom||0)){if(d.layer){map.removeLayer(d.layer);d.layer=null;d.have=null}setStatus(d,'Zoom to '+d.minZoom+'+ to load.');return}
  const view=map.getBounds(),pad=view.pad(0.25);
  if(d.have&&d.have.contains(view)&&Math.abs((d.z||0)-z)<0.75&&d.layer)return;
  if(d.abort)d.abort.abort();const ac=new AbortController();d.abort=ac;setStatus(d,'Loading…');
  const lat=map.getCenter().lat,mpp=156543.03392*Math.cos(lat*Math.PI/180)/Math.pow(2,z),mdeg=111320*Math.cos(lat*Math.PI/180);
  const cap=(phone()?d.cap[1]:d.cap[0]);
  const q=new URLSearchParams({where:'1=1',geometry:[pad.getWest(),pad.getSouth(),pad.getEast(),pad.getNorth()].join(','),
    geometryType:'esriGeometryEnvelope',inSR:'4326',outSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:d.fields,
    returnGeometry:'true',f:'geojson',resultRecordCount:String(cap),maxAllowableOffset:String(Math.max(1e-5,(mpp*2)/mdeg))});
  if(d.noPage)q.delete('resultRecordCount');   // HES MapServer rejects pagination params
  try{const r=await fetch(d.url+'/query?'+q,{signal:ac.signal});if(!r.ok)throw new Error('HTTP '+r.status);const j=await r.json();
    if(ac.signal.aborted||!d.on)return;if(j.error)throw new Error(j.error.message||'query failed');
    const feats=j.features||[];drawFeats(d,feats);d.have=pad;d.z=z;
    const trunc=feats.length>=cap||j.exceededTransferLimit||(j.properties&&j.properties.exceededTransferLimit);
    setStatus(d,trunc?('Showing '+feats.length+' in view. Zoom in for the rest.'):(feats.length?feats.length+' in view':'Nothing in this view.'))}
  catch(e){if(e.name==='AbortError')return;setStatus(d,'Could not load.');LZ.msg('Could not load '+d.name,4000)}}
function ensureWms(d){if(d.layer)return d.layer;
  const layer=L.tileLayer.wms(d.wms,{layers:d.wmsLayers,styles:d.styles||'',format:'image/png',transparent:true,version:'1.1.1',
    opacity:d.opacity==null?0.6:d.opacity,minZoom:d.minZoom||0,maxZoom:d.maxZoom==null?22:d.maxZoom,attribution:d.credit,zIndex:d.z||4});
  if(d.cql)layer.wmsParams.CQL_FILTER=d.cql;d.layer=layer;return layer}
function wmsNote(d){const z=map.getZoom();
  if(d.minZoom&&z<d.minZoom-0.01)return 'Zoom to '+d.minZoom+'+ to see it.';
  if(d.maxZoom!=null&&z>d.maxZoom+0.01)return 'Overview scale: zoom out to '+d.maxZoom+' or less, or use the 1:50 000 layers.';
  return ''}
async function setOn(d,on){d.on=on;if(!on){if(d.abort)d.abort.abort();if(d.layer)map.removeLayer(d.layer);d.have=null;setStatus(d,'');save();return}
  if(d.kind==='wms'){if(d.wmsKind==='625k'){setStatus(d,'Loading…');await bgs625Names();if(!d.on)return;d.wmsLayers=bgs625[d.which]||d.wmsLayers;if(d.layer){map.removeLayer(d.layer);d.layer=null}}
    ensureWms(d);if(d.on)d.layer.addTo(map);setStatus(d,wmsNote(d))}
  else loadFs(d);save()}
function save(){LZ.saveHashSoon&&LZ.saveHashSoon()}
const host=$('laylist');let group='',curH=null;
CATALOG.forEach(d=>{if(d.group!==group){group=d.group;const h=document.createElement('div');h.className='lg';h.textContent=group;host.appendChild(h);curH=h}
  const lab=document.createElement('label'),cb=document.createElement('input');cb.type='checkbox';cb.id='ly_'+d.id;
  cb.addEventListener('change',()=>setOn(d,cb.checked));const span=document.createElement('span');span.textContent=d.name;lab.appendChild(cb);lab.appendChild(span);host.appendChild(lab);
  const meta=document.createElement('div');meta.className='laymeta';meta.textContent=d.credit;host.appendChild(meta);d.meta=meta;d.cb=cb;d.els=[lab,meta];;d.gh=curH});
const sug=$('laysuggest');function sugText(cc){if(sug)sug.textContent=cc==='wales'&&CCODE.wales==='W'?'Welsh layers: Cadw designations, RCAHMW (Coflein) sites and Natural Resources Wales protected areas and flood zones, all from DataMapWales under the Open Government Licence.':cc==='scotland'?'Scottish layers: Historic Environment Scotland designations and NatureScot protected areas, all Open Government Licence. Canmore and local HER/SMR records are not shown.':'Not added: Environment Agency historic landfill is Open Government Licence and can explain modern mounds. National soil maps (NATMAP and Soilscapes, Cranfield) are not published under the Open Government Licence, so they are left out.';}
let CUR=null;function applyCountry(){const cc=AUTO?countryAt(map.getCenter()):LCC;if(cc===CUR)return;CUR=cc;sugText(cc);if(!AUTO)return;const k=CCODE[cc]||'E';
  host.querySelectorAll('.lg').forEach(h=>h.style.display='none');
  CATALOG.forEach(d=>{const show=d.on||(d.c||'E')==='GB'||(d.c||'E')===k;d.els.forEach(e=>e.style.display=show?'':'none');if(show&&d.gh)d.gh.style.display=''})}
applyCountry();if(AUTO)map.on('moveend',applyCountry);
let mvT=null;map.on('moveend',()=>{clearTimeout(mvT);mvT=setTimeout(()=>{CATALOG.forEach(d=>{if(!d.on)return;if(d.kind==='fs')loadFs(d);else setStatus(d,wmsNote(d))})},350)});
function parseFields(xml){const m=String(xml).match(/<FIELDS\b([^>]*)\/?>/i);if(!m)return null;const o={},re=/([\w:.-]+)="([^"]*)"/g;let a;
  const dec=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
  while((a=re.exec(m[1])))o[a[1]]=dec(a[2]);return o}
function geoHtml(title,attrs){const name=attrs.LEX_D||attrs.LEX_RCS_D||attrs.RCS_D||attrs.LEX||'';if(!name)return '';
  let h='<b>'+esc(title)+'</b><br>'+esc(name);const lith=attrs.RCS_D&&attrs.RCS_D!==name?attrs.RCS_D:'';if(lith)h+='<br>'+esc(lith);
  const age=attrs.MAX_TIME_D||attrs.MAX_PERIOD||'';if(age)h+='<br>'+esc(age);
  if(attrs.LEX_WEB&&/^https?:\/\//i.test(attrs.LEX_WEB))h+='<br>'+alink(attrs.LEX_WEB,'BGS Lexicon');return h}
map.on('click',async e=>{if(ate){ate=false;return}if(LZ.tool&&LZ.tool())return;
  const z=map.getZoom(),targets=[];
  if(z>=12){if(byId.bgs50s.on)targets.push(byId.bgs50s);if(byId.bgs50b.on)targets.push(byId.bgs50b)}
  if(!targets.length){if(byId.bgs625s.on)targets.push(byId.bgs625s);if(byId.bgs625b.on)targets.push(byId.bgs625b)}
  if(!targets.length)return;const size=map.getSize(),b=map.getBounds(),crs=map.options.crs,sw=crs.project(b.getSouthWest()),ne=crs.project(b.getNorthEast()),pt=map.latLngToContainerPoint(e.latlng);
  const parts=[];await Promise.all(targets.map(async d=>{if(!d.wmsLayers)return;
    const q=new URLSearchParams({service:'WMS',version:'1.1.1',request:'GetFeatureInfo',layers:d.wmsLayers,query_layers:d.wmsLayers,styles:d.styles||'',
      srs:'EPSG:3857',bbox:[sw.x,sw.y,ne.x,ne.y].join(','),width:String(size.x),height:String(size.y),x:String(Math.round(pt.x)),y:String(Math.round(pt.y)),info_format:'text/xml',feature_count:'1'});
    try{const r=await fetch(d.wms+'?'+q);if(!r.ok)return;const attrs=parseFields(await r.text());const html=attrs&&geoHtml(d.name,attrs);if(html)parts.push(html)}catch(_){}}));
  if(parts.length)L.popup({maxWidth:320}).setLatLng(e.latlng).setContent(parts.join('<hr style="border:0;border-top:1px solid #e5e7eb;margin:6px 0">')+'<div class="m" style="font-size:11px;margin-top:4px">'+esc(targets[0].credit)+'</div>').openOn(map)});
const prev=window.__lensHashExtra;window.__lensHashExtra=function(p){if(prev)prev(p);const ids=CATALOG.filter(d=>d.on).map(d=>d.id);if(ids.length)p.set('ly',ids.join(','))};
const want=new Set(String((LZ.H0&&LZ.H0.ly)||'').split(',').filter(Boolean));
CATALOG.forEach(d=>{if(want.has(d.id)){d.cb.checked=true;setOn(d,true)}});
})();
