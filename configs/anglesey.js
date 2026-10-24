/* Area config: Ynys Môn (Anglesey) + 1 km buffer (covers the Menai Strait / Afon Menai and Ynys Gybi / Holy Island). 911 km2 buffered.
   Terrain: Welsh Government national LiDAR DTM 1 m (DataMapWales COG), OGL. Public: open data only, no HER data hosted (Coflein queried live on click only). */
window.LENS_CONFIG={
  title:'LiDAR Lens Ynys Môn (Anglesey)',
  pageTitle:'LiDAR Lens Ynys Môn (Anglesey)',
  link:{text:'More lenses: lidarlens.sarsen.org',href:'https://lidarlens.sarsen.org/'},
  areaName:'Ynys Môn (Anglesey)',
  private:false,
  // analyticsToken: not set yet (needs a Cloudflare Web Analytics site for lidar-lens-anglesey.tim-daw.workers.dev)
  repoUrl:'https://github.com/TimDaw37/lidar-lens',
  elevationNote:'Elevation: Welsh Government national LiDAR DTM 1 m (DataMapWales, cloud-optimised GeoTIFF, OGL v3; survey programme 2020-2023), ',
  lidarAttribution:'LiDAR: Welsh Government national LiDAR DTM 1 m (DataMapWales) &copy; Welsh Government, <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank" rel="noopener noreferrer">OGL v3</a> &middot; Place names: <a href="https://www.welshlanguagecommissioner.wales/standard-welsh-place-names" target="_blank" rel="noopener noreferrer">Welsh Language Commissioner, List of Standardised Welsh Place-names</a> (OGL)',
  basemaps:[
    {id:'sat',name:'Aerial (Esri World Imagery)',url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',maxNativeZoom:19,attribution:'Imagery &copy; Esri, Maxar, Earthstar Geographics, GIS User Community'},
    {id:'otm',name:'OpenTopoMap (paths, contours)',url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',maxNativeZoom:17,attribution:'Map: &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener noreferrer">OpenTopoMap</a> (CC-BY-SA), data &copy; OpenStreetMap contributors, SRTM'}],
  historicMaps:[
    {id:'6in',name:'Six-inch, 1888–1913',url:'https://mapseries-tilesets.s3.amazonaws.com/os/6inchsecond/{z}/{x}/{y}.png',minZoom:11,maxNativeZoom:17},
    {id:'1in',name:'One-inch, 1885–1903',url:'https://mapseries-tilesets.s3.amazonaws.com/1inch_2nd_ed/{z}/{x}/{y}.png',minZoom:8,maxNativeZoom:16}],
  toolName:'What\'s here?',
  showGuess:false,
  recordSources:'Scheduled monuments: Designated Historic Asset GIS Data, The Welsh Historic Environment Service (Cadw), received 24 Oct 2026, licensed under the Open Government Licence v3.0. Place names: Welsh Language Commissioner, List of Standardised Welsh Place-names (DataMapWales, OGL), shown Welsh first with the English form in brackets. Coflein: National Monuments Record of Wales (NMRW), produced by the Royal Commission on the Ancient and Historical Monuments of Wales (RCAHMW), Crown Database Right: RCAHMW, queried live from DataMapWales on click and never stored here, Open Government Licence v3.0. No HER data hosted.',
  tiles:{url:'terrain/{z}/{x}/{y}.webp',minzoom:8,maxzoom:17,crossOrigin:null},
  liveNmrw:true,
  recordsLine:'Records (information only): Cadw scheduled monuments and Coflein (NMRW), via DataMapWales',
  recordsNone:'Cadw scheduled monuments or Coflein (NMRW) records',
  dtmName:'Welsh Government 1 m LiDAR DTM',
  scheduledOverlay:'cadw_sam.geojson',
  smLinkLabel:'Cadw report',
  placeNames:'placenames.geojson',
  bounds:[[53.1174,-4.7155],[53.4447,-4.0052]],
  outline:'coverage_outline.geojson',
  start:{lat:53.27,lng:-4.36,zoom:11},
  minZoom:8,
  layers:{index:'layers/index.json',url:'layers/v2/{layer}/{key}.json',names:['rec']},
  osgbGrid:'data/ostn_grid.json',
  geocoder:{countrycodes:'gb',viewbox:'-4.75,53.45,-4.0,53.11'},
  dataNote:'Ynys Môn (Anglesey) with Ynys Gybi (Holy Island) and the Menai Strait, 1 km buffer (911 km2), zoom 8-17. Welsh Government LiDAR 1 m DTM.'
};
