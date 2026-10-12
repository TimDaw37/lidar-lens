/* Example area config: Wiltshire + Swindon (+1 km). Copy to site/config.js when you deploy.
   Public version: no HER layer (the local HER has no open licence). The HER lines are left as commented stubs
   to show where a PRIVATE deployment with permission from its HER would plug them in. */
window.LENS_CONFIG={
  title:'LiDAR Lens - Wiltshire',
  pageTitle:'LiDAR Lens - Wiltshire',
  link:{text:'lidarlens.sarsen.org',href:'https://lidarlens.sarsen.org'},
  areaName:'Wiltshire',
  private:false,                                   // true shows "(private)" on the controls
  repoUrl:'https://github.com/TimDaw37/lidar-lens',
  tiles:{url:'terrain/{z}/{x}/{y}.webp',minzoom:8,maxzoom:17,crossOrigin:null},
  // herShort:'HER (2022 snapshot)',               // PRIVATE deployments only, with your HER's permission
  // herLong:'Wiltshire & Swindon HER (2022 snapshot, information only)',
  herShort:'local HER', herLong:'local HER (not included in this public version)',
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
