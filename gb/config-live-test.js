/* Area config: GREAT BRITAIN live TEST (England & Wales lens + Scotland live), separate Worker lidar-lens-gb-live-test. Based on england.js:
   ALL OF ENGLAND AND WALES, live (the file keeps its name so existing builds and links carry on).
   Wales: LiDAR from the Welsh Government DTM through the relay's /wales route; records from Cadw and the RCAHMW (Coflein).
   Originally: ALL OF ENGLAND, live. Nothing is built or uploaded: live-sw.js (a service worker) makes the LiDAR tiles
   on demand from the Environment Agency's WCS and the 'What's here?' records from Historic England's ArcGIS services,
   and caches them in the visitor's browser. Host the built dist/ on any static host (GitHub Pages, Cloudflare Pages).
   Build: node scripts/build_site.mjs configs/england.js, then add data/ostn_grid.json (national grid, see PROTOCOL).
   Trade-offs vs a county build: 1-3 s to fill the lens on new ground, more data per view, and it depends on the EA's service. */
window.LENS_CONFIG={
  title:'LiDAR Lens - Great Britain (live TEST)',
  pageTitle:'LiDAR Lens - Great Britain (live TEST)',
  link:null,
  linksNote:null,
  links:[],                                        // GB test: slim title box (title + search only)
  tries:[],
  areaName:'Great Britain',
  private:false,
  repoUrl:'https://github.com/TimDaw37/lidar-lens',
  geographApi:null,   // GB TEST: same-origin api/geograph (this test Worker has no GEOGRAPH_KEY, so no nearby photos); the production relay does not allow this origin
  live:{minzoom:8},   // TEST: per-country below (England/Wales live from 13, Scotland overview from 8, live 14-17)                              // the worker makes tiles from zoom 13 (keep in step with MINZ in live-sw.js)
  basemaps:[
    {id:'eahs',name:'EA LiDAR hillshade (England only)',url:'https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wms',wms:'Lidar_Composite_Hillshade_DTM_1m',attribution:'LiDAR hillshade &copy; Environment Agency (OGL)'},
    {id:'otm',name:'OpenTopoMap (paths, contours)',url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',maxNativeZoom:17,attribution:'Map: &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener noreferrer">OpenTopoMap</a> (CC-BY-SA), data &copy; OpenStreetMap contributors, SRTM'},
    {id:'sat',name:'Aerial (Esri World Imagery)',url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',maxNativeZoom:19,attribution:'Imagery &copy; Esri, Maxar, Earthstar Geographics, GIS User Community'}],
  models:false,
  noModels:true,
  tidyUI:true,                                     // GB test: Background map section (base + old OS map) and Data layers; no map layers button, no duplicate SM tick                                   // GB test: the Models section is removed from the page (models stay on Tim's blog)
  toolName:'What\'s here?',
  showGuess:false,
  recordsLine:'Records from Historic England (NHLE, aerial mapping), in Wales Cadw and Coflein, queried live, and in Scotland HES designations and Canmore',
  recordsNone:'Historic England, Cadw, Coflein or HES records',
  recordSources:'In Scotland: Historic Environment Scotland designations from inspire.hes.scot and Canmore points read live (OGL). In England and Wales: Historic England NHLE (scheduled monuments, listed buildings) and Aerial Investigation & Mapping; in Wales, Designated Historic Asset GIS Data, The Welsh Historic Environment Service (Cadw), and the National Monuments Record of Wales (NMRW), produced by the Royal Commission on the Ancient and Historical Monuments of Wales (RCAHMW), Crown Database Right: RCAHMW; all queried live from Historic England and DataMapWales, Open Government Licence v3.0',
  walesLayers:true,
  layerCountry:'auto',
  defaultCountry:'gb',
  measureOnDemand:true,   // DTM measurements only when the button is pressed
  recordCache:'api/rc',   // TEST Worker edge cache for HES / Canmore / DataMapWales lookups
  dtmGroundNote:'A terrain model (DTM) filters out standing stones, buildings and trees, so these heights are the ground shape, not the height of the monument itself.',
  dtmName:'1 m open LiDAR DTM',
  countryRegions:[{c:'scotland',poly:[[54.45,-8.9],[54.85,-3.62],[54.97,-3.08],[55.04,-3.03],[55.13,-2.86],[55.23,-2.69],[55.30,-2.56],[55.35,-2.47],[55.42,-2.30],[55.48,-2.18],[55.57,-2.24],[55.64,-2.27],[55.66,-2.17],[55.72,-2.10],[55.78,-2.05],[55.81,-2.04],[55.84,-1.6],[61.6,-0.2],[61.6,-9.5],[54.45,-9.5]]},{c:'wales',poly:[[53.36,-3.17],[53.24,-3.0],[53.16,-2.93],[53.08,-2.86],[52.98,-2.73],[52.95,-2.86],[52.91,-3.03],[52.84,-3.03],[52.76,-3.04],[52.70,-3.09],[52.62,-3.12],[52.57,-3.05],[52.50,-3.00],[52.43,-3.04],[52.35,-3.04],[52.27,-3.05],[52.19,-3.07],[52.12,-3.12],[52.06,-3.10],[51.99,-2.98],[51.92,-2.85],[51.85,-2.73],[51.80,-2.67],[51.72,-2.67],[51.64,-2.67],[51.60,-2.68],[51.45,-2.75],[51.30,-3.30],[51.25,-4.80],[51.45,-6.20],[52.10,-6.00],[52.90,-5.20],[53.50,-4.80],[53.55,-3.40],[53.40,-3.20]]},{c:'england',poly:[[54.97,-3.08],[55.04,-3.03],[55.13,-2.86],[55.23,-2.69],[55.30,-2.56],[55.35,-2.47],[55.42,-2.30],[55.48,-2.18],[55.57,-2.24],[55.64,-2.27],[55.66,-2.17],[55.72,-2.10],[55.78,-2.05],[55.81,-2.04],[55.84,-1.6],[55.0,-1.2],[54.5,-0.4],[53.6,0.4],[52.95,1.9],[52.4,1.95],[51.9,1.7],[51.35,1.55],[51.05,1.25],[50.7,0.4],[50.55,-1.1],[50.5,-2.0],[50.15,-3.6],[49.85,-5.3],[49.85,-6.5],[50.15,-5.9],[50.65,-4.9],[51.2,-4.35],[51.35,-3.3],[51.45,-2.75],[51.60,-2.68],[51.64,-2.67],[51.72,-2.67],[51.80,-2.67],[51.85,-2.73],[51.92,-2.85],[51.99,-2.98],[52.06,-3.10],[52.12,-3.12],[52.19,-3.07],[52.27,-3.05],[52.35,-3.04],[52.43,-3.04],[52.50,-3.00],[52.57,-3.05],[52.62,-3.12],[52.70,-3.09],[52.76,-3.04],[52.84,-3.03],[52.91,-3.03],[52.95,-2.86],[52.98,-2.73],[53.08,-2.86],[53.16,-2.93],[53.24,-3.0],[53.36,-3.17],[53.45,-3.15],[53.75,-3.1],[54.05,-3.25],[54.45,-3.7],[54.85,-3.62]]}],
  countryText:{
    gb:{dtmName:'1 m open LiDAR DTM',minzoom:13,zoomHint:'',lidarAttribution:'LiDAR: Environment Agency (England), Welsh Government DataMapWales (Wales), Scottish Remote Sensing Portal (Scotland); OGL',
      noLidarText:'No open LiDAR covers this spot yet (off the coast of Great Britain, or outside England, Wales and Scotland).'},
    england:{dtmName:'1 m EA LiDAR DTM (Environment Agency)',minzoom:13,zoomHint:' Zoomed out, choose "EA LiDAR hillshade" under Background map.',lidarAttribution:'LiDAR: EA LiDAR Composite DTM 1 m &copy; Environment Agency (OGL)',
      noLidarText:'Little or no LiDAR here: England\'s Environment Agency LiDAR survey does not cover this spot, or it is sea.'},
    wales:{dtmName:'1 m Welsh Government LiDAR DTM (DataMapWales)',minzoom:13,zoomHint:'',lidarAttribution:'LiDAR: Welsh Government LiDAR DTM 1 m (DataMapWales, OGL); records Cadw, RCAHMW (OGL)',
      noLidarText:'Little or no LiDAR here: the Welsh Government LiDAR (DataMapWales) does not cover this spot, or it is sea.'},
    scotland:{dtmName:'Scottish public LiDAR DTM (Scottish Remote Sensing Portal)',minzoom:8,zoomHint:'',lidarAttribution:'LiDAR &copy; Scottish Government, SEPA, HES, OIC (OGL) via the Scottish Remote Sensing Portal',
      noLidarText:'Little or no LiDAR here: the Scottish public LiDAR surveys (Scottish Remote Sensing Portal) do not cover this spot, or it is sea.'}},
  canmore:{url:'https://inspire.hes.scot/arcgis/rest/services/CANMORE/Canmore_Points/MapServer/0',radius:150,max:30},
  tiles:{url:'terrain/{z}/{x}/{y}.png',minzoom:8,maxzoom:17,crossOrigin:null},
  herLinks:[
    {label:'Heritage Gateway',url:'https://historicengland.org.uk/listing/heritage-gateway/results/?q=&size=n_24_n&filters%5B0%5D%5Bfield%5D=layoutView&filters%5B0%5D%5Bvalues%5D%5B0%5D=map&filters%5B0%5D%5Btype%5D=all&filters%5B1%5D%5Bfield%5D=mapZoom&filters%5B1%5D%5Bvalues%5D%5B0%5D=16&filters%5B1%5D%5Btype%5D=all&filters%5B2%5D%5Bfield%5D=mapBoundsTopLeft&filters%5B2%5D%5Bvalues%5D%5B0%5D={lat1}%2C{lng1}&filters%5B2%5D%5Btype%5D=all&filters%5B3%5D%5Bfield%5D=mapBoundsBottomRight&filters%5B3%5D%5Bvalues%5D%5B0%5D={lat2}%2C{lng2}&filters%5B3%5D%5Btype%5D=all'}],
  scheduledOverlay:null,
  bounds:[[49.85,-8.8],[61.0,1.80]],
  outline:null,
  start:{lat:51.1789,lng:-1.8262,zoom:15},
  minZoom:6,
  layers:{index:'layers/index.json',url:'layers/v2/{layer}/{key}.json',names:['rec']},
  osgbGrid:'data/ostn_grid.json',
  geocoder:{countrycodes:'gb',viewbox:'-8.8,61.0,1.9,49.8'},
  localSearch:'nhle_places.json',                 // type-ahead: Historic England and Cadw scheduled monuments (configs/england-places.json, OGL)
  dataNote:'TEST. All of Great Britain, fetched live as you look: England from the Environment Agency LiDAR Composite DTM 1 m (zoom 13-17), Wales from the Welsh Government LiDAR DTM 1 m (DataMapWales, zoom 13-17), Scotland from the Scottish Remote Sensing Portal GeoTIFFs (made in your browser at zoom 14-17; zoom 8-13 a light overview from the same files). All Open Government Licence.'
};
