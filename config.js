/* Area config: ALL OF ENGLAND, live. Nothing is built or uploaded: live-sw.js (a service worker) makes the LiDAR tiles
   on demand from the Environment Agency's WCS and the 'What's here?' records from Historic England's ArcGIS services,
   and caches them in the visitor's browser. Host the built dist/ on any static host (GitHub Pages, Cloudflare Pages).
   Build: node scripts/build_site.mjs configs/england.js, then add data/ostn_grid.json (national grid, see PROTOCOL).
   Trade-offs vs a county build: 1-3 s to fill the lens on new ground, more data per view, and it depends on the EA's service. */
window.LENS_CONFIG={
  title:'LiDAR Lens - England (live)',
  pageTitle:'LiDAR Lens - England (live)',
  link:null,
  areaName:'England',
  private:false,
  repoUrl:'https://github.com/TimDaw37/lidar-lens',
  live:{minzoom:13},                              // the worker makes tiles from zoom 13 (keep in step with MINZ in live-sw.js)
  basemaps:[
    {id:'eahs',name:'EA LiDAR hillshade (all England)',url:'https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wms',wms:'Lidar_Composite_Hillshade_DTM_1m',attribution:'LiDAR hillshade &copy; Environment Agency (OGL)'},
    {id:'otm',name:'OpenTopoMap (paths, contours)',url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',maxNativeZoom:17,attribution:'Map: &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener noreferrer">OpenTopoMap</a> (CC-BY-SA), data &copy; OpenStreetMap contributors, SRTM'},
    {id:'sat',name:'Aerial (Esri World Imagery)',url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',maxNativeZoom:19,attribution:'Imagery &copy; Esri, Maxar, Earthstar Geographics, GIS User Community'}],
  models:false,
  toolName:'What\'s here?',
  showGuess:false,
  recordsLine:'Records from Historic England (NHLE and aerial mapping), queried live',
  recordSources:'Historic England NHLE (scheduled monuments, listed buildings) and Aerial Investigation & Mapping, queried live (OGL)',
  tiles:{url:'terrain/{z}/{x}/{y}.png',minzoom:8,maxzoom:17,crossOrigin:null},
  herLinks:[
    {label:'Heritage Gateway',url:'https://historicengland.org.uk/listing/heritage-gateway/results/?q=&size=n_24_n&filters%5B0%5D%5Bfield%5D=layoutView&filters%5B0%5D%5Bvalues%5D%5B0%5D=map&filters%5B0%5D%5Btype%5D=all&filters%5B1%5D%5Bfield%5D=mapZoom&filters%5B1%5D%5Bvalues%5D%5B0%5D=16&filters%5B1%5D%5Btype%5D=all&filters%5B2%5D%5Bfield%5D=mapBoundsTopLeft&filters%5B2%5D%5Bvalues%5D%5B0%5D={lat1}%2C{lng1}&filters%5B2%5D%5Btype%5D=all&filters%5B3%5D%5Bfield%5D=mapBoundsBottomRight&filters%5B3%5D%5Bvalues%5D%5B0%5D={lat2}%2C{lng2}&filters%5B3%5D%5Btype%5D=all'}],
  scheduledOverlay:null,
  bounds:[[49.85,-6.45],[55.82,1.80]],
  outline:null,
  start:{lat:51.1789,lng:-1.8262,zoom:15},
  minZoom:6,
  layers:{index:'layers/index.json',url:'layers/v2/{layer}/{key}.json',names:['rec']},
  osgbGrid:'data/ostn_grid.json',
  geocoder:{countrycodes:'gb',viewbox:'-6.5,55.9,1.9,49.8'},
  dataNote:'All of England, fetched live from the Environment Agency as you look (zoom 13-17).'
};
