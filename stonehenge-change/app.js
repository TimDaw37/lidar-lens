// Stonehenge LiDAR change map (public). Images are WGS84-aligned overlays for the bounds below.
var B=[[51.11409228659323,-1.85850983714518],[51.20412094271993,-1.7866660967481365]];
var map=L.map('map',{minZoom:11,maxZoom:20,maxBounds:L.latLngBounds(B).pad(0.3)});
var EA='LiDAR &copy; Environment Agency, OGL v3';
var ESRI='Imagery &copy; Esri, Maxar, Earthstar Geographics, GIS User Community';
var NLS='Historic map: <a href="https://maps.nls.uk/" target="_blank" rel="noopener noreferrer">Reproduced with the permission of the National Library of Scotland</a> (CC-BY)';
var base={'LiDAR hillshade, 2021':L.imageOverlay('hillshade_2021.jpg',B,{attribution:EA}),
 'Aerial photos, current (Esri)':L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:20,maxNativeZoom:19,attribution:ESRI})};
[['2021',6863,'2021-04-08'],['2018',13161,'2018-01-08'],['2014',10,'2014-02-20']].forEach(function(w){
 base['Aerial photos, Esri Wayback '+w[0]]=L.tileLayer('https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/'+w[1]+'/{z}/{y}/{x}',{maxZoom:20,maxNativeZoom:19,attribution:ESRI+' | Wayback release '+w[2]});});
base['OS 25-inch map, 1890s–1920s (NLS)']=L.tileLayer('https://mapseries-tilesets.s3.amazonaws.com/25_inch/wiltshire/{z}/{x}/{y}.png',{maxZoom:20,minZoom:14,maxNativeZoom:18,attribution:NLS});
base['OS six-inch map, 1888–1913 (NLS)']=L.tileLayer('https://mapseries-tilesets.s3.amazonaws.com/os/6inchsecond/{z}/{x}/{y}.png',{maxZoom:20,maxNativeZoom:17,attribution:NLS});
base['LiDAR hillshade, 2021'].addTo(map);
var diff=L.imageOverlay('diff_2021_2001.webp',B,{opacity:0.6,attribution:EA}).addTo(map);
var mon=L.layerGroup(),monLoaded=false;
mon.getAttribution=function(){return 'Scheduled monuments &copy; Historic England (NHLE), OGL v3'};
function loadMon(){if(monLoaded)return;monLoaded=true;fetch('monuments.json').then(function(r){return r.json()}).then(function(F){F.forEach(function(f){L.polygon(f.r,{color:'#000',weight:1.5,fill:false,opacity:.85}).bindTooltip(f.n||'').addTo(mon)})})}
L.control.layers(base,null,{position:'topleft',collapsed:window.innerWidth<600}).addTo(map);
map.on('baselayerchange',function(){diff.bringToFront()});
map.fitBounds(B);
var op=document.getElementById('op');op.addEventListener('input',function(){diff.setOpacity(op.value/100);document.getElementById('ov').textContent=op.value});
document.getElementById('mon').addEventListener('change',function(e){if(e.target.checked){loadMon();mon.addTo(map)}else map.removeLayer(mon)});
map.on('mousemove',function(e){document.getElementById('xy').textContent='Cursor: '+e.latlng.lat.toFixed(5)+', '+e.latlng.lng.toFixed(5)});
var p=document.getElementById('panel'),t=document.getElementById('tog');
if(window.innerWidth<600){p.classList.add('closed');t.setAttribute('aria-expanded','false')}
t.addEventListener('click',function(){var c=p.classList.toggle('closed');t.setAttribute('aria-expanded',String(!c))});
