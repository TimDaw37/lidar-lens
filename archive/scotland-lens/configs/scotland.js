/* Area config: Scotland (one product; pilot = Fife + Lothians, plus Orkney served from the Orkney lens bucket as a read-only fallback).
   Terrain: Scottish Government / SEPA / HES / OIC LiDAR DTMs from the Scottish Remote Sensing Portal, all OGL v3 (the four HES
   non-commercial surveys are excluded). Priority mosaic (newest/best first) with 30 m feathered seams, sea-masked to land + 30 m.
   Layers: layerCountry 'auto' = the Layers list follows the country under the map centre (countryRegions), so this lens can later be merged
   with the England and Wales one. Start view: set `start` (pilot: Arthur's Seat; final: Kilmartin Glen, see START_FINAL below). */
const START_PILOT={lat:55.9441,lng:-3.1618,zoom:15};    // Arthur's Seat, Edinburgh (phase 5, 2019-20)
const START_FINAL={lat:56.1330,lng:-5.4870,zoom:15};    // Kilmartin Glen (HES 2016) - switch to this once Argyll is built
window.LENS_CONFIG={
  title:'LiDAR Lens Scotland',
  pageTitle:'LiDAR Lens Scotland',
  link:{text:'More lenses: lidarlens.sarsen.org',href:'https://lidarlens.sarsen.org/'},
  areaName:'Scotland',
  private:false,
  repoUrl:'https://github.com/TimDaw37/lidar-lens',
  elevationNote:'Elevation: Scottish public LiDAR DTMs, 50 cm and 1 m (Scottish Remote Sensing Portal, OGL v3), ',
  lidarAttribution:'LiDAR &copy; Scottish Government, SEPA, HES, OIC (OGL) &middot; <a href="#about" class="credlink">Credits</a>',
  creditsFull:'LiDAR via the <a href="https://remotesensingdata.gov.scot/" target="_blank" rel="noopener noreferrer">Scottish Remote Sensing Portal</a>, all under the <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank" rel="noopener noreferrer">Open Government Licence v3</a>, in order of preference where surveys overlap: '+
    'National LiDAR Programme 2025 (Crown copyright Scottish Government &copy; Crown copyright and database right (2025)); '+
    'Coastal 2025-26 (Crown copyright Scottish Government); Orkney Islands Council 2023 (&copy; Orkney Islands Council); '+
    'Outer Hebrides 2019 (&copy; SEPA (2019)); Phases 4-6, 2017-2021 (Scottish Government); '+
    'HES 2016 and 2017 surveys (&copy; HES; Contains Historic Environment Scotland data &copy; Historic Environment Scotland - Scottish Charity No. SC045925 &copy; Crown copyright and database right); '+
    'Phases 2-3, 2012-2014 (Copyright Scottish Government and SEPA (2014); Fugro retain the commercial copyright); '+
    'Phase 1, 2011-2012 (Crown copyright Scottish Government, SEPA and Scottish Water (2012)). '+
    'Designations and Canmore points &copy; Historic Environment Scotland (OGL). Protected areas &copy; NatureScot (OGL). Geology: British Geological Survey (OGL). Old maps: National Library of Scotland. Base maps as credited on the map. Contains OS data &copy; Crown copyright and database right.',
  basemaps:[
    {id:'sat',name:'Aerial (Esri World Imagery)',url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',maxNativeZoom:19,attribution:'Imagery &copy; Esri, Maxar, Earthstar Geographics, GIS User Community'},
    {id:'otm',name:'OpenTopoMap (paths, contours)',url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',maxNativeZoom:17,attribution:'Map: &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener noreferrer">OpenTopoMap</a> (CC-BY-SA), data &copy; OpenStreetMap contributors, SRTM'}],
  historicMaps:[
    {id:'6in1',name:'Six-inch first edition, 1843–1882',url:'https://mapseries-tilesets.s3.amazonaws.com/os/6inchfirst/{z}/{x}/{y}.png',minZoom:11,maxNativeZoom:17},
    {id:'6in',name:'Six-inch second edition, 1888–1913',url:'https://mapseries-tilesets.s3.amazonaws.com/os/6inchsecond/{z}/{x}/{y}.png',minZoom:11,maxNativeZoom:17},
    {id:'1in',name:'One-inch, 1885–1903',url:'https://mapseries-tilesets.s3.amazonaws.com/1inch_2nd_ed/{z}/{x}/{y}.png',minZoom:8,maxNativeZoom:16}],
  toolName:'What\'s here?',
  showGuess:false,
  recordSources:'Historic Environment Scotland designations (scheduled monuments, listed buildings, World Heritage Sites, gardens and designed landscapes, battlefields, conservation areas, Historic MPAs) from inspire.hes.scot, Open Government Licence v3.0. Canmore points near a click are read live from HES (OGL) and link to trove.scot. Local HER/SMR data are not hosted',
  tiles:{url:'terrain/{z}/{x}/{y}.webp',minzoom:8,maxzoom:17,crossOrigin:null},
  recordsLine:'Records (information only): HES designations',
  recordsNone:'HES designated sites',
  dtmName:'Scottish public LiDAR DTM (50 cm / 1 m)',
  canmore:{url:'https://inspire.hes.scot/arcgis/rest/services/CANMORE/Canmore_Points/MapServer/0',radius:150,max:8},
  herLinks:[
    {label:'HES Designations Map Search',url:'https://hesportal.maps.arcgis.com/apps/instant/sidebar/index.html?appid=2059ed04c56b402e8b5197c661bec594',note:'search {gr}'},
    {label:'PastMap',url:'https://www.pastmap.org.uk/map',note:'search {gr}'}],
  layerCountry:'auto',
  defaultCountry:'england',
  countryRegions:[{c:'scotland',poly:[[54.45,-8.9],[54.85,-3.62],[54.97,-3.08],[55.04,-3.03],[55.13,-2.86],[55.23,-2.69],[55.30,-2.56],[55.35,-2.47],[55.42,-2.30],[55.48,-2.18],[55.57,-2.24],[55.64,-2.27],[55.66,-2.17],[55.72,-2.10],[55.78,-2.05],[55.81,-2.04],[55.84,-1.6],[61.6,-0.2],[61.6,-9.5],[54.45,-9.5]]}],
  smLive:{url:'https://inspire.hes.scot/arcgis/rest/services/HES/HES_Designations/MapServer/5',minZoom:11},
  smLinkLabel:'HES designation record',
  bounds:[[54.5,-8.8],[61.0,-0.6]],
  outline:'coverage_outline.geojson',
  startInLens:true,
  start:START_PILOT,
  minZoom:8,
  layers:{index:'layers/index.json',url:'layers/v2/{layer}/{key}.json',names:['rec']},
  osgbGrid:'data/ostn_grid.json',
  geocoder:{countrycodes:'gb',viewbox:'-8.8,61.0,-0.6,54.5'},
  dataNote:'Pilot: Fife, City of Edinburgh, East Lothian, Midlothian and West Lothian (land + 30 m, 3,072 km2), plus Orkney (2023 survey). Zoom 8-17. Where surveys overlap the newest/best is used, blended over 30 m at the edges.'
};
