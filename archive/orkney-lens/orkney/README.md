# Orkney lens

Live: https://lidar-lens-orkney.tim-daw.workers.dev (public, no password). It opens at the Ring of Brodgar (HY 29462 13359).

- **Terrain:** Orkney Islands Council 2023 LiDAR DTM, 50 cm, flown 10–14 June 2023 by Field Group AS. It comes from the Scottish Remote Sensing Portal as 1,655 one-km GeoTIFFs (26.5 GB), Open Government Licence v3. Attribution: "Crown copyright Orkney Islands Council © Crown copyright and database right (2023)".
  - List the tiles with `POST https://api.remotesensing.data.gov.scot/search/product {"collections":["scotland-gov/lidar/orkney-islands-council-23/dtm"],"limit":2000}`. Each product has a public S3 URL.
- **Area:** the Orkney Islands boundary (ONS BFC Dec 2023) plus 30 m, clipped to the survey tiles. That's 1,044 km², and the sea is masked out. Tile footprints cover 99.66% of Orkney's land; the gaps are 3.5 km² of coastal slivers and skerries.
- **Tiles:** `scripts/build_tiles.py` is the standard builder, with `fetch()` mosaicking the local 1 km tiles (`LENS_SRC`, index `LENS_INDEX`). Terrarium lossless WebP, z8–17 (z17 ≈ 0.61 m/px at 59°N).
- **Records:** `scripts/build_hes_layers.py` pulls Historic Environment Scotland designations from inspire.hes.scot (OGL): scheduled monuments, listed buildings, the World Heritage Site, Historic MPAs, conservation areas and gardens & designed landscapes. They become the SM overlay and the 5 km "What's here?" chunks. No Canmore or Orkney SMR data is hosted.
- **Hosting:** an R2 bucket plus the standard `worker/` (see `wrangler.example.jsonc`), with secret `GEOGRAPH_KEY` for nearby photos. `scripts/upload_via_worker.py` uses a temporary `/__bulk_upload` route (secret `UPLOAD_SECRET`). The route and secret are removed after upload. index.html goes last.
