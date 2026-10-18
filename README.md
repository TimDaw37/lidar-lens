# LiDAR Lens

A lightweight web viewer for 1 m LiDAR terrain models, built for spotting and checking earthworks (barrows, lynchets, enclosures, dew ponds, pits, hollow ways). It's a "lens" you drag over an aerial photo. Inside it you see the ground model in a choice of visualisations: hillshade, multi-direction hillshade, slope, local relief model, sky-view factor, red relief and more. It also has:

- **Go to**: grid ref, easting/northing, lat/long, postcode or place, plus *Use my location*.
- **What's here?**: click a spot to see measurements of the ground there from the 1 m DTM (relief, size, roundness, orientation, edge steepness, slope), a short neutral description generated from those numbers, and nearby open records (Historic England scheduled monuments, listed buildings, aerial mapping, OpenStreetMap) with source and date. It does not guess what a feature is. Config: `toolName`, `showGuess` (default `false`; a private build can set `true` to add a collapsed heuristic pointer), `recordSources`.
- **Backgrounds and overlays**: aerial photo, OpenTopoMap, historic OS maps (National Library of Scotland: 25-inch, six-inch, one-inch) with opacity, and public rights of way where the council's data is open. All configured per area.
- **Elevation profile**, share links, keyboard shortcuts, and a mobile-friendly layout.

Everything is static files: the viewer, terrain tiles as lossless WebP (Terrarium encoding) and small JSON layer chunks. They can be hosted on a Cloudflare R2 bucket behind a tiny Worker, which can password-protect the site or serve it publicly. A county-sized site (~3,800 km², ~142k tiles, ~3.2 GB) fits inside Cloudflare's free tier.

Example: Wiltshire, live at https://lidar-lens-public.tim-daw.workers.dev/

## Repository layout
| Path | What |
|---|---|
| `site/` | Viewer: `index.html`, `lens.js` (WebGL renderer, lens, profile), `tools.js` (OS grid, Go to, What's here?), `ui.js` (help, shortcuts, status), `vendor/` (Leaflet) |
| `configs/` | One config per area. `wiltshire.js` is a worked example; `example.js` is a template. Copy one to `site/config.js` |
| `scripts/build_tiles.py` | EA LiDAR Composite DTM 1 m (WCS) → Terrarium WebP XYZ tiles z8–17 for an area polygon; resumable |
| `scripts/build_site.mjs` | Production build: minified, hashed, long-cached bundle in `dist/` |
| `tests/compat.test.mjs` | Playwright checks in Chromium + Firefox (fallbacks, CSP, What's here?) |
| `scripts/build_layer_chunks.py` | Open records + context → 5 km chunks for *What's here?* |
| `scripts/fetch_arcgis.py`, `scripts/extract_osm.py` | Download ArcGIS REST layers (NHLE, HE aerial mapping) and OSM features |
| `scripts/build_ostn_grid.py` | Small OSTN15 correction grid for accurate OS grid refs in the browser |
| `scripts/upload_r2.py` | Upload the built site to R2 (or use rclone) |
| `worker/` | Cloudflare Worker serving the bucket, with optional password |
| `PROTOCOL.md` | Step-by-step guide to building one for your own county |
| `LESSONS.md` | What we learnt testing shape heuristics against recorded features |

## Quick start
See **[PROTOCOL.md](PROTOCOL.md)**. In short: build tiles, build layers, copy a config, upload to R2, deploy the Worker.

## Browser support

Current Chrome, Edge, Firefox (incl. ESR), Safari and Samsung Internet. Rendering uses WebGL2 with float textures; without it the viewer switches to a slower canvas renderer (all modes still work), and if a device can't draw at all it says so and keeps the background maps, Go to and records working. LiDAR tiles are lossless WebP, so Safari before 14 (iOS 12–13) shows the maps but not the LiDAR, with a message.

## Data and licences
- Code: MIT (see LICENSE). Leaflet: BSD-2-Clause.
- Terrain: Environment Agency LiDAR Composite DTM, Open Government Licence. Historic England NHLE and Aerial Investigation & Mapping data: OGL. OpenStreetMap: ODbL. OS OpenMap Local: OGL. Historic OS maps: National Library of Scotland, CC-BY. OpenTopoMap: CC-BY-SA. Wiltshire rights of way (example): Wiltshire Council, OGL v3.0, contains OS data © Crown copyright.
- **Local Historic Environment Records (HERs) are not included and generally have no open licence.** Linking to HER and Heritage Gateway records is fine; republishing HER data is not without permission. Ask your HER.
- The analysis lessons credit the Wiltshire and Swindon Historic Environment Record (© Wiltshire Council). No HER data is in this repository.

## Responsible use
LiDAR reveals unrecorded sites. Please don't publish lists or maps of possible new sites. Report them to your HER instead. Nighthawking (illegal metal detecting) is a real risk. Most land is private, and scheduled monuments are protected by law.

By Tim Daw. Issues and pull requests welcome.

## Models index (Tim's detailed Wiltshire models)
`site/models.json` lists each model: `title`, `url`, `job`, `description`, `geometry` (OSGB `point` [E,N] or `bbox` [W,S,E,N], plus WGS84 `latlng`/`latlngBounds`), `scope` (`site` = drawn on the map, `county` = "Wiltshire-wide" list), `approx` (location set by hand) and optional `group`.
- **Add a model:** add one entry with its OSGB point or bbox, then run `python scripts/models_wgs84.py` to fill the WGS84 fields.
- **Combine models:** models at the same spot are grouped automatically: one card lists every box that contains the click, plus point models within 300 m (point models that close share one numbered pin).
- `site/models.js` draws the layer, the card and the searchable list; `scripts/build_site.mjs` bundles it and copies `models.json` into `dist/`.
