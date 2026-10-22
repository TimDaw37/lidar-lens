/* Example area config: Wiltshire + Swindon (+1 km). Copy to site/config.js when you deploy.
   Public version: no HER layer (the local HER has no open licence). The HER lines are left as commented stubs
   to show where a PRIVATE deployment with permission from its HER would plug them in. */
window.LENS_CONFIG={
  title:'LiDAR Lens - Wiltshire',
  pageTitle:'LiDAR Lens - Wiltshire',
  link:{text:'lidar-lens-public.tim-daw.workers.dev',href:'https://lidar-lens-public.tim-daw.workers.dev/'},
  areaName:'Wiltshire',
  private:false,                                   // true shows "(private)" on the controls
  repoUrl:'https://github.com/TimDaw37/lidar-lens',
  basemaps:[   // no tile.openstreetmap.org on a public site (OSMF tile policy); OpenTopoMap for paths/contours
    {id:'sat',name:'Aerial (Esri World Imagery)',url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',maxNativeZoom:19,attribution:'Imagery &copy; Esri, Maxar, Earthstar Geographics, GIS User Community'},
    {id:'otm',name:'OpenTopoMap (paths, contours)',url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',maxNativeZoom:17,attribution:'Map: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA), data &copy; OpenStreetMap contributors, SRTM'}],
  historicMaps:[
    {id:'25in',name:'25-inch, 1890s–1920s',url:'https://mapseries-tilesets.s3.amazonaws.com/25_inch/wiltshire/{z}/{x}/{y}.png',minZoom:14,maxNativeZoom:18},
    {id:'6in',name:'Six-inch, 1888–1913',url:'https://mapseries-tilesets.s3.amazonaws.com/os/6inchsecond/{z}/{x}/{y}.png',minZoom:11,maxNativeZoom:17},
    {id:'1in',name:'One-inch, 1885–1903',url:'https://mapseries-tilesets.s3.amazonaws.com/1inch_2nd_ed/{z}/{x}/{y}.png',minZoom:8,maxNativeZoom:16}],
  prow:{url:'prow.geojson',attribution:'Rights of way: Wiltshire Council (OGL v3.0), contains OS data &copy; Crown copyright 2026; working copy, not the legal Definitive Map'},
  models:{countyLabel:'Wiltshire-wide'},          // site/models.json; set models:false for an area with none
  toolName:'What\'s here?',                     // public: facts only
  showGuess:false,                                 // no heuristic best guess in the public build
  recordSources:'Wiltshire & Swindon HER (Wiltshire Council, 2022 snapshot; IDs and links only, information only); NHLE scheduled + listed and HE Aerial Investigation & Mapping (Historic England, OGL; retrieved Oct 2026); OSM (ODbL, Oct 2026)',
  tiles:{url:'terrain/{z}/{x}/{y}.webp',minzoom:8,maxzoom:17,crossOrigin:null},
  // herShort:'HER (2022 snapshot)',               // PRIVATE deployments only, with your HER's permission
  // herLong:'Wiltshire & Swindon HER (2022 snapshot, information only)',
  herShort:'HER', herLong:'Wiltshire & Swindon HER (Wiltshire Council; IDs and links only)',
  // HER: no HER data is hosted. The Worker's /api/her returns only ID, name, type and record link for records within
  // 100 m of a click (rate limited); herLinks open outside searches at the clicked spot. Placeholders: {e} {n} {gr}
  // {lat} {lng} and a ~600 m box {lat1},{lng1} (top-left) / {lat2},{lng2} (bottom-right).
  herApi:{url:'api/her'},
  herLinks:[
    {label:'Search Wiltshire HER here',url:'https://services.wiltshire.gov.uk/HistoryEnvRecord/Home/Index',note:'enter Easting {e}, Northing {n}'},
    {label:'Heritage Gateway',url:'https://historicengland.org.uk/listing/heritage-gateway/results/?q=&size=n_24_n&filters%5B0%5D%5Bfield%5D=layoutView&filters%5B0%5D%5Bvalues%5D%5B0%5D=map&filters%5B0%5D%5Btype%5D=all&filters%5B1%5D%5Bfield%5D=mapZoom&filters%5B1%5D%5Bvalues%5D%5B0%5D=16&filters%5B1%5D%5Btype%5D=all&filters%5B2%5D%5Bfield%5D=mapBoundsTopLeft&filters%5B2%5D%5Bvalues%5D%5B0%5D={lat1}%2C{lng1}&filters%5B2%5D%5Btype%5D=all&filters%5B3%5D%5Bfield%5D=mapBoundsBottomRight&filters%5B3%5D%5Bvalues%5D%5B0%5D={lat2}%2C{lng2}&filters%5B3%5D%5Btype%5D=all'}],

  scheduledOverlay:'scheduled_monuments.geojson',  // NHLE scheduled monuments (OGL), clipped to the area
  bounds:[[50.9360,-2.3799],[51.7121,-1.4712]],
  outline:'coverage_outline.geojson',
  start:{lat:51.32,lng:-1.92,zoom:9},
  minZoom:8,
  layers:{index:'layers/index.json',url:'layers/{layer}/{key}.json',names:['rec','ctx']},   // add 'her' only in a private build
  osgbGrid:'data/ostn_grid.json',
  geocoder:{countrycodes:'gb',viewbox:'-2.40,51.75,-1.45,50.90'},
  dataNote:'Wiltshire + Swindon buffered 1 km (about 3,830 km2), zoom 8-17 (z17 is ~0.75 m per pixel).'
};
