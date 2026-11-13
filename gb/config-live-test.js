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
  ewLow:{minzoom:11},   // TEST (t2178u): England and Wales LiDAR zoomed out: live from zoom 11 (32 m blocks), zoom 8-10 from a small overview built once from 64 m blocks (gb/ewov/)
  live:{minzoom:6},   // TEST: per-country below (all of GB from zoom 6: overview tiles at 6-10, England/Wales live from 11, Scotland live 14-17)                              // the worker makes tiles from zoom 13 (keep in step with MINZ in live-sw.js)
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
    gb:{dtmName:'1 m open LiDAR DTM',minzoom:6,zoomHint:'',lidarAttribution:'LiDAR: Environment Agency (England), Welsh Government DataMapWales (Wales), Scottish Remote Sensing Portal (Scotland); OGL',
      noLidarText:'No open LiDAR covers this spot yet (off the coast of Great Britain, or outside England, Wales and Scotland).'},
    england:{dtmName:'1 m EA LiDAR DTM (Environment Agency)',minzoom:6,zoomHint:'',lidarAttribution:'LiDAR: EA LiDAR Composite DTM 1 m &copy; Environment Agency (OGL)',
      noLidarText:'Little or no LiDAR here: England\'s Environment Agency LiDAR survey does not cover this spot, or it is sea.'},
    wales:{dtmName:'1 m Welsh Government LiDAR DTM (DataMapWales)',minzoom:6,zoomHint:'',lidarAttribution:'LiDAR: Welsh Government LiDAR DTM 1 m (DataMapWales, OGL); records Cadw, RCAHMW (OGL)',
      noLidarText:'Little or no LiDAR here: the Welsh Government LiDAR (DataMapWales) does not cover this spot, or it is sea.'},
    scotland:{dtmName:'Scottish public LiDAR DTM (Scottish Remote Sensing Portal)',minzoom:6,zoomHint:'',lidarAttribution:'LiDAR &copy; Scottish Government, SEPA, HES, OIC (OGL) via the Scottish Remote Sensing Portal',
      noLidarText:'Little or no LiDAR here: the Scottish public LiDAR surveys (Scottish Remote Sensing Portal) do not cover this spot, or it is sea.'}},
  canmore:{url:'https://inspire.hes.scot/arcgis/rest/services/CANMORE/Canmore_Points/MapServer/0',radius:150,max:30},
  tiles:{url:'terrain/{z}/{x}/{y}.png',minzoom:6,maxzoom:17,crossOrigin:null},
  // TEST: GEM-15 fallback where there is no open LiDAR (gaps in Scotland, Isle of Man, Channel Islands). gb/make_sw.mjs adds
  // gb/gem15-route.js to the service worker for a config with this block; tiles under gem15/ (gb-live-test/gem15/ in R2).
  fallback:{
    label:'<b>Not LiDAR here:</b> the sepia-toned ground is GEM-15, a coarse 15 m terrain model from satellite images (Google, experimental), shown only where there is no open LiDAR. Heights there are estimates only.',
    short:'<b>Not LiDAR:</b> sepia ground is GEM-15, coarse 15 m terrain (Google, experimental). Heights are estimates.',
    estLabel:'\u2248 {h} m (GEM-15 estimate, \u00b1{e} m, EGM96, not OD)',
    estShort:'\u2248 {h} m GEM-15 est. (\u00b1{e} m, not OD)',
    estWarn:'Steep ground or next to a gap in GEM-15: this estimate can be tens of metres out, or more.',   // \u00b12 m below 20\u00b0, \u00b14 m 20-35\u00b0, 10+ m steeper or within ~30 m of masked cells (68% bands from the Scottish LiDAR check)
    noMeasure:'No LiDAR here, so no feature is measured: GEM-15 (15 m cells) is too coarse for earthworks. Any height shown is a GEM-15 estimate, not Ordnance Datum.',
    // coverage notes on the islands (old maps, data layers, grid refs, postcodes): shown in the app where they apply
    noGrid:'Grid refs not available here (off the British National Grid), lat/long shown',
    noGridCard:'Grid refs not available here ({r} is off the British National Grid), lat/long shown',
    noGridShort:'no grid ref here, lat/long shown',
    oldNone:'Old map not available here: the National Library of Scotland old OS maps do not cover {r}.',
    oldSome:'Old map: on {r} only the one-inch (1885\u20131903) is available; the six-inch is not.',
    layersGB:'{r}: only the British Geological Survey layers cover it. The English, Welsh and Scottish designation and record layers stop at their own borders.',
    layersNone:'{r}: no data layers are available here. The English, Welsh and Scottish bodies and the British Geological Survey do not map the Channel Islands.',
    pcNone:'{pc}: no open location for this island postcode (postcodes.io has none for the Isle of Man or the Channel Islands, and OpenStreetMap does not have this one). Try a place name.',
    pcDistrict:'{pc}: island postcode districts cannot be located from open data. Try a full postcode or a place name.',
    // What's here? on the islands: no English, Welsh or Scottish record service covers them; link each island's own record where one is online
    regions:[
      {name:'Isle of Man',box:[54.02,-4.88,54.45,-4.28],oldMaps:['1in'],grid:true,layers:'GB',records:'The Isle of Man is not covered by Historic England, Cadw or HES, and its own record is not open data, so no records are listed here. Search the <a href="https://isleofmanher.im/" target="_blank" rel="noopener noreferrer">Isle of Man Historic Environment Record</a> (Manx National Heritage) &#x2197;.'},
      {name:'Jersey',ci:true,oldMaps:[],layers:'none',box:[48.88,-2.30,49.31,-1.88],records:'Jersey is not covered by Historic England, Cadw or HES, and its own record is not open data, so no records are listed here. Search <a href="https://her.jerseyheritage.org/" target="_blank" rel="noopener noreferrer">Jersey\'s Historic Environment Record</a> (Jersey Heritage) &#x2197; or the <a href="https://www.gov.je/PlanningBuilding/ListedBuildingPlaces/pages/index.aspx" target="_blank" rel="noopener noreferrer">listed buildings and places</a> (Government of Jersey) &#x2197;.'},
      {name:'Guernsey',ci:true,oldMaps:[],layers:'none',look:'Guernsey',box:[49.40,-2.71,49.53,-2.49],records:'Guernsey is not covered by Historic England, Cadw or HES, and has no open heritage record service, so no records are listed here. See the <a href="https://gov.gg/built_natural_historic_environment" target="_blank" rel="noopener noreferrer">protected monuments and buildings</a> (States of Guernsey) &#x2197;.'},
      {name:'Herm and Jethou',ci:true,oldMaps:[],layers:'none',look:'Herm',box:[49.42,-2.485,49.50,-2.42],records:'No online heritage record service for Herm or Jethou was found, so no records are listed here. The <a href="https://gov.gg/built_natural_historic_environment" target="_blank" rel="noopener noreferrer">States of Guernsey protected lists</a> &#x2197; may help.'},
      {name:'Sark',ci:true,oldMaps:[],layers:'none',box:[49.39,-2.42,49.46,-2.32],records:'No online heritage record service for Sark was found, so no records are listed here.'},
      {name:'Alderney',ci:true,oldMaps:[],layers:'none',box:[49.67,-2.27,49.75,-2.12],records:'No online heritage record service for Alderney was found, so no records are listed here.'}],
    attribution:'Gaps: GEM-15 &copy; Google, CC BY 4.0, experimental. This dataset is produced by Google',
    about:'<b>Fallback terrain (not LiDAR).</b> Where no open LiDAR exists (gaps in Scotland, mainly Highland and Shetland; the Isle of Man; the Channel Islands, each with its 12-nautical-mile territorial sea, cut at the median line where Northern Ireland, Ireland, France, England or Wales is nearer; and the gap the Environment Agency leaves in its LiDAR around RAF Fylingdales on the North York Moors) the lens shows <a href="https://developers.google.com/earth-engine/datasets/catalog/projects_climate-and-sustainability_assets_gem-15_v1" target="_blank" rel="noopener noreferrer">GEM-15</a> v1, bare-earth DTM band (Batchu et al. 2026, <a href="https://doi.org/10.31223/X55N75" target="_blank" rel="noopener noreferrer">doi:10.31223/X55N75</a>), CC BY 4.0. This dataset is produced by Google. It is experimental. 15 m cells, resampled to zoom 13 and only enlarged above that, so it shows hills and glens, not earthworks. Heights are on the EGM96 geoid, not Ordnance Datum Newlyn, and can be several metres out (the authors report regional offsets of about &minus;4.8 to +1.9 m against airborne lidar). It is used only where the LiDAR has no data, never over it, and is shown in sepia tones in the lens. Where only GEM-15 covers a spot, What\'s here? and the cursor readout give its height as an estimate (&asymp; metres, EGM96, not OD): against the Scottish LiDAR (600 tiles, 4.6 million points) half the GEM-15 heights were within 1.1 m and about two thirds within 2 m, but one in ten was more than 4 m out (RMSE 3.8 m). Errors grow with slope (two thirds within 2 m below 20&deg;, 3&ndash;4 m on 20&ndash;45&deg; slopes, 8 m or more on steeper ground), so the estimate says &plusmn;2, &plusmn;4 or &plusmn;10+ m from the local slope, and warns next to cliffs, snow or water that GEM-15 has masked: on the summit of Ben Nevis it is about 165 m too low. Nothing is measured from it, and the elevation profile, View from here, the 3D block and the water level leave it out. GEM-15 masks water, snow and some featureless ground, and has no tiles for a few remote islands (for example Foula and North Rona): those stay blank. Town and village search in Scotland, the Isle of Man and the Channel Islands uses <a href="https://www.geonames.org" target="_blank" rel="noopener noreferrer">GeoNames</a> (CC BY 4.0). No paid or restricted LiDAR is used (the Isle of Man, Jersey and Guernsey surveys are not open). On the islands the Aerial and OpenTopoMap backgrounds work, the old OS maps (National Library of Scotland) reach the Isle of Man only at one inch and not the Channel Islands, the data layers are only BGS geology on the Isle of Man and none in the Channel Islands, British grid refs do not reach the Channel Islands (lat/long is shown), and island postcodes are found only where OpenStreetMap has them; the app says so where each applies.'},
  herLinks:[
    {label:'Heritage Gateway',url:'https://historicengland.org.uk/listing/heritage-gateway/results/?q=&size=n_24_n&filters%5B0%5D%5Bfield%5D=layoutView&filters%5B0%5D%5Bvalues%5D%5B0%5D=map&filters%5B0%5D%5Btype%5D=all&filters%5B1%5D%5Bfield%5D=mapZoom&filters%5B1%5D%5Bvalues%5D%5B0%5D=16&filters%5B1%5D%5Btype%5D=all&filters%5B2%5D%5Bfield%5D=mapBoundsTopLeft&filters%5B2%5D%5Bvalues%5D%5B0%5D={lat1}%2C{lng1}&filters%5B2%5D%5Btype%5D=all&filters%5B3%5D%5Bfield%5D=mapBoundsBottomRight&filters%5B3%5D%5Bvalues%5D%5B0%5D={lat2}%2C{lng2}&filters%5B3%5D%5Btype%5D=all'}],
  scheduledOverlay:null,
  bounds:[[48.85,-8.8],[61.0,1.80]],              // TEST: south to the Channel Islands (GEM-15 fallback)
  outline:null,
  start:{lat:51.1789,lng:-1.8262,zoom:15},
  minZoom:6,
  layers:{index:'layers/index.json',url:'layers/v2/{layer}/{key}.json',names:['rec']},
  osgbGrid:'data/ostn_grid.json',
  geocoder:{countrycodes:'gb,im,je,gg',viewbox:'-8.8,61.0,1.9,48.8'},
  townSearch:'towns.json',   // TEST (t2182u): towns, villages and islands of Scotland, the Isle of Man and the Channel Islands (GeoNames, CC BY 4.0)
  localSearch:'nhle_places.json',                 // type-ahead: Historic England and Cadw scheduled monuments (configs/england-places.json, OGL)
  dataNote:'TEST. All of Great Britain, fetched live as you look: England from the Environment Agency LiDAR Composite DTM 1 m and Wales from the Welsh Government LiDAR DTM 1 m (DataMapWales), live from zoom 11 (zoom 8-10 a light overview built from the same data), Scotland from the Scottish Remote Sensing Portal GeoTIFFs (made in your browser at zoom 14-17; zoom 8-13 a light overview from the same files); zoomed right out (zoom 6-7) one small overview of all of Great Britain. All Open Government Licence. Where there is no open LiDAR (Scottish gaps, Isle of Man, Channel Islands) a coarse GEM-15 terrain model fills in, shown in sepia tones: see Fallback terrain below.'
};
