# LiDAR Lens Ynys Môn (Anglesey)

Live: https://lidar-lens-anglesey.tim-daw.workers.dev (Cloudflare Worker `lidar-lens-anglesey`, private R2 bucket `lidar-lens-anglesey`).
Self-hosted tiles like the Wiltshire and Ure lenses. Viewer config: [`configs/anglesey.js`](../configs/anglesey.js).

- **Terrain:** Welsh Government national LiDAR DTM 1 m (DataMapWales COG `wales_dtm_32bit_cog.tif`, OGL v3), range-read over Ynys Môn + 1 km buffer (911 km², takes in Ynys Gybi and the Menai Strait). Zoom 8-17 Terrarium lossless WebP: 32,653 tiles, 750 MB. See [SUMMARY.md](SUMMARY.md).
- **Gaps on the island (715 km²):** 0.0056 km² in 20 slivers, none over 1 ha, all on the Ynys Gybi sea cliffs. The no-data in the wider buffer is sea.
- **Place names:** Welsh Language Commissioner, List of Standardised Welsh Place-names (DataMapWales `geonode:wg_placenames`, OGL), shown Welsh first with the English form in brackets, e.g. "Biwmares (Beaumaris)". The Go to box searches them in Welsh or English.
- **Records:** Cadw scheduled monuments (OGL). No HER data is copied: Archwilio and Coflein are linked only.

## Rebuild
```
export LENS_ROOT=build                                           # tiles, manifest, coverage (git-ignored)
LENS_AREA=anglesey/data/area_buf1km_27700.geojson WORKERS=6 python anglesey/scripts/build_tiles_wales_cog.py   # ~30 min
LENS_AREA=anglesey/data/area_buf1km_27700.geojson python anglesey/scripts/overview_summary.py                  # z8-11, coverage, SUMMARY.md
python anglesey/scripts/gap_check_island.py build island_27700.geojson   # ONS LAD W06000001 boundary
python anglesey/scripts/build_names_and_records.py build/site            # place names, Cadw SAM, What's here? chunks
node scripts/build_site.mjs configs/anglesey.js                          # -> dist/; add configs/anglesey-ostn_grid.json as dist/data/ostn_grid.json
```
Upload: `anglesey/scripts/upload_via_worker.py` posts batches to a temporary `/__bulk_upload` Worker route (secret `UPLOAD_SECRET`, set only for the upload, then the route and secret are removed). index.html goes last. Worker code: [`worker/`](../worker); `anglesey/wrangler.example.jsonc` shows the bindings.
