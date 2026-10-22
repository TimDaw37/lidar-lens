/* Area config (live at lidar-lens-ure.tim-daw.workers.dev; built by Grok, 21 Oct 2026): Ure-Swale henges, North Yorkshire (Thornborough, Nunwick, Hutton Moor, Cana, Devil's Arrows; north to Catterick/Scorton).
   OSGB box E 422000-441000, N 465000-502000 (703 km2). Public: open data only, no HER data hosted. */
window.LENS_CONFIG={
  title:'LiDAR Lens - Ure henges',
  pageTitle:'LiDAR Lens - Thornborough to the Devil\'s Arrows',
  link:{text:'lidar-lens-ure.tim-daw.workers.dev',href:'https://lidar-lens-ure.tim-daw.workers.dev/'},
  linksNote:'All of England and Wales, fetched live (slower than this Lens, whose LiDAR is held locally):',
  links:[{text:'LiDAR Lens England & Wales',href:'https://timdaw37.github.io/lidar-lens/'}],
  areaName:'the Ure-Swale henges area',
  private:false,
  repoUrl:'https://github.com/TimDaw37/lidar-lens',
  basemaps:[
    {id:'sat',name:'Aerial (Esri World Imagery)',url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',maxNativeZoom:19,attribution:'Imagery &copy; Esri, Maxar, Earthstar Geographics, GIS User Community'},
    {id:'otm',name:'OpenTopoMap (paths, contours)',url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',maxNativeZoom:17,attribution:'Map: &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener noreferrer">OpenTopoMap</a> (CC-BY-SA), data &copy; OpenStreetMap contributors, SRTM'}],
  historicMaps:[
    {id:'6in',name:'Six-inch, 1888–1913',url:'https://mapseries-tilesets.s3.amazonaws.com/os/6inchsecond/{z}/{x}/{y}.png',minZoom:11,maxNativeZoom:17},
    {id:'1in',name:'One-inch, 1885–1903',url:'https://mapseries-tilesets.s3.amazonaws.com/1inch_2nd_ed/{z}/{x}/{y}.png',minZoom:8,maxNativeZoom:16}],
  models:false,                                    // no detailed models for this area: hides the Models section
  toolName:'What\'s here?',
  showGuess:false,
  recordSources:'NHLE scheduled + listed and HE Aerial Investigation & Mapping (Historic England, OGL; retrieved Oct 2026); site gazetteer compiled from NHLE and HE Research Records (Oct 2026); OSM (ODbL, Oct 2026). No HER data hosted.',
  tiles:{url:'terrain/{z}/{x}/{y}.webp',minzoom:8,maxzoom:17,crossOrigin:null},
  herLinks:[
    {label:'Heritage Gateway',url:'https://historicengland.org.uk/listing/heritage-gateway/results/?q=&size=n_24_n&filters%5B0%5D%5Bfield%5D=layoutView&filters%5B0%5D%5Bvalues%5D%5B0%5D=map&filters%5B0%5D%5Btype%5D=all&filters%5B1%5D%5Bfield%5D=mapZoom&filters%5B1%5D%5Bvalues%5D%5B0%5D=16&filters%5B1%5D%5Btype%5D=all&filters%5B2%5D%5Bfield%5D=mapBoundsTopLeft&filters%5B2%5D%5Bvalues%5D%5B0%5D={lat1}%2C{lng1}&filters%5B2%5D%5Btype%5D=all&filters%5B3%5D%5Bfield%5D=mapBoundsBottomRight&filters%5B3%5D%5Bvalues%5D%5B0%5D={lat2}%2C{lng2}&filters%5B3%5D%5Btype%5D=all'}],
  scheduledOverlay:'scheduled_monuments.geojson',
  bounds:[[54.0793,-1.6652],[54.4130,-1.3698]],
  outline:'coverage_outline.geojson',
  start:{lat:54.17,lng:-1.50,zoom:11},
  minZoom:8,
  layers:{index:'layers/index.json',url:'layers/v2/{layer}/{key}.json',names:['rec','ctx']},
  osgbGrid:'data/ostn_grid.json',
  geocoder:{countrycodes:'gb',viewbox:'-1.70,54.43,-1.33,54.06'},
  dataNote:'Thornborough to the Devil\'s Arrows, north to Catterick/Scorton: OSGB E 422000-441000, N 465000-502000 (703 km2), zoom 8-17.'
};
