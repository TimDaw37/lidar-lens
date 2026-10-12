# Build a LiDAR Lens for your own area

This walks through one county end to end. The worked example is Wiltshire + Swindon with a 1 km buffer: about 3,830 km², roughly 142,000 tiles, about 3.2 GB. Expect a day of mostly unattended processing.

## 0. What you need
- A Linux/macOS machine (or WSL) with Python 3.11+, about 30 GB free disk and a decent connection.
- `pip install numpy rasterio geopandas shapely pyproj mercantile pillow requests osmium`
- A free Cloudflare account (R2 + Workers). Node.js 20+ for `npx wrangler`.

## 1. Define the area
Make a single polygon in **EPSG:27700** (British National Grid), already buffered (1 km is good so features on the edge aren't cut). A county boundary from OS Boundary-Line (OGL) works well.
```
ogr2ogr -t_srs EPSG:27700 build/data/area_27700.geojson county.shp -where "NAME='My County'"
# buffer 1 km (e.g. in QGIS, or geopandas: gdf.buffer(1000))
```
Also save a WGS84 copy of the outline as `site/coverage_outline.geojson` for the dashed boundary and the "outside coverage" message.

## 2. Get the terrain model (DTM)
- **England:** Environment Agency *LiDAR Composite DTM 1 m* (OGL). `scripts/build_tiles.py` downloads it directly from the EA WCS, one z12 web-mercator tile at a time, so you never hold the whole county.
- **Wales:** NRW LiDAR on DataMapWales (OGL). **Scotland:** Scottish Remote Sensing Portal. **Northern Ireland and elsewhere:** any 1–2 m DTM GeoTIFF works. Replace `fetch()` in `build_tiles.py` with a read from your local mosaic (a GDAL VRT of the tiles is easiest).
- Use the **DTM** (bare earth), not the DSM.

## 3. Build the terrain tiles
```
LENS_ROOT=build LENS_AREA=build/data/area_27700.geojson WORKERS=4 python scripts/build_tiles.py
```
- Output: `build/tiles/{z}/{x}/{y}.webp`, z8–17, Terrarium encoding (height = R×256 + G + B/256 − 32768 m), heights quantised to 1/64 m, alpha 0 = no data, lossless WebP.
- Resumable: progress is kept in `build/manifest.json`, so just rerun it after an interruption.
- Each tile is read back and checked after writing. Wiltshire took a few hours on 4 workers.
- Then `LENS_ROOT=build LENS_AREA=… python scripts/overview_summary.py` builds the z8–11 overview tiles, the coverage/gaps GeoJSON and a SUMMARY.md. `python scripts/validate.py` spot-checks random tiles against the source.

## 4. Build the "What's here?" layers (open data only)
Download open records for your area's bounding box (EPSG:27700):
```
B="xmin ymin xmax ymax"
NHLE=https://services-eu1.arcgis.com/ZOdPfBS3aqqDYPUQ/arcgis/rest/services/National_Heritage_List_for_England_NHLE_v02_VIEW/FeatureServer
AIM=https://services-eu1.arcgis.com/ZOdPfBS3aqqDYPUQ/arcgis/rest/services/HE_AIM_data/FeatureServer
python scripts/fetch_arcgis.py $NHLE/6 build/raw/nhle_sched.geojson $B        # scheduled monuments
python scripts/fetch_arcgis.py $NHLE/0 build/raw/nhle_listed_pts.geojson $B   # listed buildings
python scripts/fetch_arcgis.py $AIM/0  build/raw/aim_detailed.geojson $B      # HE aerial mapping, detailed
python scripts/fetch_arcgis.py $AIM/1  build/raw/aim_extents.geojson $B       # HE aerial mapping, extents
```
(Check the layer numbers on the service page; they occasionally change.)

Next, OpenStreetMap context and historic features from a Geofabrik extract:
```
python scripts/extract_osm.py england-latest.osm.pbf build/raw/osm/osm_whatis.geojsonl
```
Then OS OpenMap Local shapefiles for your grid squares (OGL), unzipped under `build/raw/os/`.

Finally, package everything into 5 km chunks:
```
python scripts/build_layer_chunks.py build/data/area_27700.geojson build/raw build/site/layers
```
**Local HER data:** HERs generally have no open licence. Don't include HER data in a public site. If your HER gives you permission for a *private* site, add `--include-her` (with `--her-guid` / `--her-prefix` for Heritage Gateway links) and add `'her'` to `layers.names` in the config. Links to HER and Heritage Gateway records are fine anywhere.

## 5. OS grid accuracy (GB only)
```
BBOX="lat0,lat1,lng0,lng1" OSTN_OUT=build/site/data/ostn_grid.json python scripts/build_ostn_grid.py
```
This gives a ~100 KB grid that brings browser grid refs to OSTN15 accuracy (centimetres instead of ~2 m).

## 6. Assemble the site
```
cp -r site/* build/site/ && cp configs/example.js build/site/config.js   # then edit config.js
ln -s ../tiles build/site/terrain     # or copy
```
In `config.js`, set the title, `areaName`, `bounds` (from your tiles), `start`, `outline`, `geocoder.viewbox` and `private`. Test locally with `cd build/site && python -m http.server 8000`.

**Production build (recommended for a public site):** `npm i && node scripts/build_site.mjs configs/your-area.js` writes `dist/`: one minified JS bundle and one CSS file with content-hashed names (`assets/app.<hash>.js`, served with a 1-year immutable cache), deferred scripts, a tiny ES5 `compat` shim (polyfills; explains old or WebP-less browsers) and a preconnect to your first basemap. Copy `dist/*` over `build/site/` before uploading. Transpiled for Safari/iOS 12+, Chrome 64+, Firefox 68+ (ESR), Samsung Internet 9+, Edge 79+. Cloudflare compresses text (Brotli/gzip) at the edge, so don't pre-compress.


## 6b. Background maps and overlays (optional, per area in config.js)
- **`basemaps`**: a list of `{id,name,url,maxNativeZoom,attribution}`. On a public site don't use `tile.openstreetmap.org`: the OSMF tile policy forbids heavy use. OpenTopoMap (CC-BY-SA, shows paths and contours) or a commercial/self-hosted OSM tile provider are safer, but check each provider's usage policy.
- **`historicMaps`**: National Library of Scotland georeferenced OS maps. The default layers cover all of Great Britain: six-inch 1888–1913 and one-inch 1885–1903. The 25-inch 1890s–1920s tiles are per county, e.g. `.../25_inch/wiltshire/{z}/{x}/{y}.png`; find yours in the NLS Georeferenced Maps viewer (Overlay tab). NLS re-use terms: CC-BY. Credit "Reproduced with the permission of the National Library of Scotland" with a link to maps.nls.uk (the viewer does this automatically). For heavy traffic, NLS's supported route is the MapTiler Cloud API (free tier: 100k tiles/month for non-commercial use; needs a key).
- **`prow`**: public rights of way GeoJSON from your council, if it is openly licensed. Many publish under OGL, e.g. Wiltshire's ArcGIS open data. `python scripts/fetch_prow.py …` (see the script header) makes a compact file. Credit the council and OS, and say it's a working copy, not the legal Definitive Map.

- **HER links without hosting HER data (optional).** Many HERs don't allow their data to be republished. You can still help people reach it:
  - **`herLinks`**: outbound links on the *What's here?* card, opened in a new tab (`rel="noopener noreferrer"`). Each is `{label,url,note}` and the url/note can use `{e}` `{n}` (OSGB easting/northing), `{gr}` (grid ref), `{lat}` `{lng}`, and a ~600 m box `{lat1},{lng1}` (top-left) / `{lat2},{lng2}` (bottom-right). Heritage Gateway's map view takes a box: `https://historicengland.org.uk/listing/heritage-gateway/results/?q=&size=n_24_n&filters[0][field]=layoutView&filters[0][values][0]=map&filters[0][type]=all&filters[1][field]=mapZoom&filters[1][values][0]=16&filters[1][type]=all&filters[2][field]=mapBoundsTopLeft&filters[2][values][0]={lat1},{lng1}&filters[2][type]=all&filters[3][field]=mapBoundsBottomRight&filters[3][values][0]={lat2},{lng2}&filters[3][type]=all` (URL-encode the brackets and comma in the config). If your HER's own search has no location deep link (Wiltshire's needs a form POST), link its search page and put the easting/northing in `note`.
  - **`herApi:{url:'api/her'}`** + Worker vars `HER_API=1`, `HER_BBOX`, a `HER_LIMITER` rate-limit binding (e.g. 30/min) and your HER chunks uploaded under `HER_PREFIX` (default `layers/her/`, which the Worker never serves directly). The card then lists HER records within 30 m (+ the rest within 100 m) showing only ID, name, type and a link to the record's own page; the endpoint answers one point at a time, same-origin only, max 60 records, no descriptions, no geometry and no bulk download. Only do this with your HER's agreement, and keep its credit and snapshot date in `recordSources`.

## 7. Host on Cloudflare R2 + a Worker
1. Create a **private** R2 bucket (don't enable public access). The Worker is the only way in.
2. Upload: `CF_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=… R2_BUCKET=… python scripts/upload_r2.py build/site`. The token needs R2 edit rights only. For >100k files, `rclone` with R2's S3 API is faster.
3. Worker: `cp worker/wrangler.example.jsonc worker/wrangler.jsonc`, fill in the account ID and bucket, then `cd worker && npx wrangler deploy`.
4. **Private site:** `npx wrangler secret put PASSWORD` (Basic auth, any username; the password is never in code). **Public site:** leave PASSWORD unset. Set the var `PUBLIC_INDEX=1` if you want search engines to index the viewer.
5. Optional custom domain (e.g. `lidarlens.example.org`): add it as a Worker custom domain in the Cloudflare dashboard. On a custom domain the Worker also serves repeat tile/asset requests from Cloudflare's edge cache (public mode).
6. **Security headers** are set by the Worker on every response: a Content-Security-Policy (scripts from your own origin only; no inline script or eval; images from https; fetches only to your origin, postcodes.io and Nominatim; add hosts with the vars `CSP_CONNECT` / `CSP_IMG` if your config uses others), HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (geolocation for your own page only), `X-Frame-Options: DENY`, COOP, and `Cross-Origin-Resource-Policy: same-origin` (other sites can't hot-link your tiles). CORS is off unless you set `ALLOW_ORIGIN` to one origin.
7. **Abuse protection (public):** keep the `ratelimits` block in `wrangler.jsonc` (default 1,200 requests per IP per minute, which is generous for normal panning); over the limit gets HTTP 429. Also consider a Cloudflare budget alert.

## 8. Costs (Cloudflare, 2026 free tier)
- **R2:** 10 GB storage free (a county is ~3–4 GB), no egress fees, 1M writes/month free (one full upload ≈ 150k writes) and 10M reads/month free.
- **Workers:** 100k requests/day free. One busy viewing session is a few hundred to a few thousand tile requests, and browsers cache tiles for 30 days.
- A small group will almost certainly pay nothing. A popular public site might need Workers Paid (about $5/month).

## 9. Check it
- Test Go to with a grid ref, a postcode and *Use my location* on a phone.
- Try *What's here?* on a few known features (a scheduled barrow, a dew pond, a quarry) and a flat field; check the description reads sensibly and quiet spots say the relief is too subtle to show.
- Browser check: `cd tests && npm i && npx playwright install chromium firefox && node compat.test.mjs http://localhost:8000/` (desktop, phone, no-WebGL2, no-canvas and old-browser runs in Chromium and Firefox).
- Keep `showGuess:false` for any public build: the measurements and records are facts; an automatic guess is not.
- Check the "outside coverage" message and the private/public behaviour (401 without the password when private).

## 10. Please
- Don't publish lists or maps of *possible new sites*. Report them to your HER (nighthawking risk).
- Credit the data providers (see README). Credit your HER if you use its records for anything, even summaries.
