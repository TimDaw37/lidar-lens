/* Template: copy to site/config.js and fill in for your area. See PROTOCOL.md. */
window.LENS_CONFIG={
  title:'LiDAR Lens - My County', pageTitle:'LiDAR Lens - My County', areaName:'My County',
  link:null, private:true, repoUrl:'https://github.com/TimDaw37/lidar-lens',
  toolName:'Shape & records', showGuess:false,     // showGuess:true adds a collapsed heuristic pointer (private builds)
  recordSources:'NHLE and HE Aerial Investigation & Mapping (retrieved <date>); OSM (<date>)',
  tiles:{url:'terrain/{z}/{x}/{y}.webp',minzoom:8,maxzoom:17,crossOrigin:null},
  herShort:'local HER', herLong:'local HER (information only)',
  scheduledOverlay:null,
  bounds:[[51.0,-2.0],[51.5,-1.5]],                // [[south,west],[north,east]] of your tiles
  outline:null,                                    // or a WGS84 GeoJSON outline of the coverage
  start:{lat:51.25,lng:-1.75,zoom:10}, minZoom:8,
  layers:{index:'layers/index.json',url:'layers/{layer}/{key}.json',names:['rec','ctx']},
  osgbGrid:'data/ostn_grid.json',                  // GB only; built by scripts/build_ostn_grid.py
  geocoder:{countrycodes:'gb',viewbox:'-2.1,51.6,-1.4,50.9'},
  dataNote:''
};
