/* Area config: Orkney Islands (all 1,655 1 km tiles of the OIC 2023 survey), sea-masked to land + 30 m (1,044 km2). Starts at the Ring of Brodgar.
   Terrain: Orkney Islands Council 2023 LiDAR DTM 50 cm (Scottish Remote Sensing Portal), OGL v3. Records: HES designations (OGL). No HER/SMR data hosted. */
window.LENS_CONFIG={
  title:'LiDAR Lens Orkney',
  pageTitle:'LiDAR Lens Orkney',
  link:{text:'More lenses: lidarlens.sarsen.org',href:'https://lidarlens.sarsen.org/'},
  areaName:'Orkney',
  private:false,
  repoUrl:'https://github.com/TimDaw37/lidar-lens',
  elevationNote:'Elevation: Orkney Islands Council 2023 LiDAR DTM 50 cm (flown 10-14 June 2023, Scottish Remote Sensing Portal, OGL v3), ',
  lidarAttribution:'LiDAR: Orkney Islands Council 2023 DTM 50 cm, Crown copyright Orkney Islands Council &copy; Crown copyright and database right (2023), via the <a href="https://remotesensingdata.gov.scot/" target="_blank" rel="noopener noreferrer">Scottish Remote Sensing Portal</a>, <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank" rel="noopener noreferrer">OGL v3</a> &middot; Designations &copy; Historic Environment Scotland (OGL)',
  basemaps:[
    {id:'sat',name:'Aerial (Esri World Imagery)',url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',maxNativeZoom:19,attribution:'Imagery &copy; Esri, Maxar, Earthstar Geographics, GIS User Community'},
    {id:'otm',name:'OpenTopoMap (paths, contours)',url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',maxNativeZoom:17,attribution:'Map: &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener noreferrer">OpenTopoMap</a> (CC-BY-SA), data &copy; OpenStreetMap contributors, SRTM'}],
  historicMaps:[
    {id:'1in',name:'One-inch, 1885–1903',url:'https://mapseries-tilesets.s3.amazonaws.com/1inch_2nd_ed/{z}/{x}/{y}.png',minZoom:8,maxNativeZoom:16}],
  toolName:'What\'s here?',
  showGuess:false,
  recordSources:'Historic Environment Scotland designations (scheduled monuments, listed buildings, Heart of Neolithic Orkney World Heritage Site) from inspire.hes.scot, Open Government Licence v3.0. Canmore and the Orkney SMR are not hosted here; follow the HES portal links for full records. No HER data hosted.',
  tiles:{url:'terrain/{z}/{x}/{y}.webp',minzoom:8,maxzoom:17,crossOrigin:null},
  recordsLine:'Records (information only): HES scheduled monuments, listed buildings and World Heritage Site',
  recordsNone:'HES designated sites',
  dtmName:'Orkney 2023 50 cm LiDAR DTM',
  layerCountry:'scotland',
  scheduledOverlay:'hes_sm.geojson',
  smLinkLabel:'HES designation record',
  bounds:[[58.72,-3.45],[59.41,-2.36]],
  outline:'coverage_outline.geojson',
  start:{lat:59.00148,lng:-3.22956,zoom:16},
  minZoom:8,
  layers:{index:'layers/index.json',url:'layers/v2/{layer}/{key}.json',names:['rec']},
  osgbGrid:'data/ostn_grid.json',
  geocoder:{countrycodes:'gb',viewbox:'-3.45,59.41,-2.36,58.72'},
  dataNote:'Orkney Islands, land only (1,044 km2; 99.7% of Orkney land surveyed), zoom 8-17. Orkney Islands Council 2023 LiDAR DTM 50 cm, flown June 2023.'
};
