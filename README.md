# LiDAR Lens

A lightweight web viewer for 1 m LiDAR terrain models, built for spotting and checking earthworks (barrows, lynchets, enclosures, dew ponds, pits, hollow ways). It's a "lens" you drag over an aerial photo. Inside it you see the ground model in a choice of visualisations: hillshade, multi-direction hillshade, slope, local relief model, sky-view factor, red relief and more. It also has:

- **Go to**: grid ref, easting/northing, lat/long, postcode or place, plus *Use my location*.
- **What is it?**: click a spot to see nearby open records (Historic England scheduled monuments, listed buildings, aerial mapping, OpenStreetMap), measurements of the feature from the terrain model, and a cautious automatic best guess.
- **Elevation profile**, share links, keyboard shortcuts, and a mobile-friendly layout.

Everything is static files: the viewer, terrain tiles as lossless WebP (Terrarium encoding) and small JSON layer chunks. They can be hosted on a Cloudflare R2 bucket behind a tiny Worker, which can password-protect the site or serve it publicly. A county-sized site (~3,800 km², ~142k tiles, ~3.2 GB) fits inside Cloudflare's free tier.

Example: Wiltshire (public version planned at lidarlens.sarsen.org).

## Repository layout
| Path | What |
|---|---|
| `site/` | Viewer: `index.html`, `lens.js` (WebGL renderer, lens, profile), `tools.js` (OS grid, Go to, What is it?), `ui.js` (help, shortcuts, status), `vendor/` (Leaflet) |
| `configs/` | One config per area. `wiltshire.js` is a worked example; `example.js` is a template. Copy one to `site/config.js` |
| `scripts/build_tiles.py` | EA LiDAR Composite DTM 1 m (WCS) → Terrarium WebP XYZ tiles z8–17 for an area polygon; resumable |
| `scripts/build_layer_chunks.py` | Open records + context → 5 km chunks for *What is it?* |
| `scripts/fetch_arcgis.py`, `scripts/extract_osm.py` | Download ArcGIS REST layers (NHLE, HE aerial mapping) and OSM features |
| `scripts/build_ostn_grid.py` | Small OSTN15 correction grid for accurate OS grid refs in the browser |
| `scripts/upload_r2.py` | Upload the built site to R2 (or use rclone) |
| `worker/` | Cloudflare Worker serving the bucket, with optional password |
| `PROTOCOL.md` | Step-by-step guide to building one for your own county |
| `LESSONS.md` | What we learnt tuning *What is it?* against recorded features |

## Quick start
See **[PROTOCOL.md](PROTOCOL.md)**. In short: build tiles, build layers, copy a config, upload to R2, deploy the Worker.

## Data and licences
- Code: MIT (see LICENSE). Leaflet: BSD-2-Clause.
- Terrain: Environment Agency LiDAR Composite DTM, Open Government Licence. Historic England NHLE and Aerial Investigation & Mapping data: OGL. OpenStreetMap: ODbL. OS OpenMap Local: OGL.
- **Local Historic Environment Records (HERs) are not included and generally have no open licence.** Linking to HER and Heritage Gateway records is fine; republishing HER data is not without permission. Ask your HER.
- The analysis lessons credit the Wiltshire and Swindon Historic Environment Record (© Wiltshire Council). No HER data is in this repository.

## Responsible use
LiDAR reveals unrecorded sites. Please don't publish lists or maps of possible new sites. Report them to your HER instead. Nighthawking (illegal metal detecting) is a real risk. Most land is private, and scheduled monuments are protected by law.

By Tim Daw. Issues and pull requests welcome.
