# Stonehenge LiDAR change map (2001 → 2021)

Static Leaflet page served at `/stonehenge-change/` on the public LiDAR Lens site.
Shows the 2021 minus 2001 Environment Agency LiDAR DTM difference (co-registered on hard surfaces, 5 m smoothed, ±0.10 m colour stretch)
over a 2021 hillshade, Esri aerial/Wayback imagery or NLS historic OS maps, with optional Historic England scheduled monument outlines.

The raster files (`hillshade_2021.jpg`, `diff_2021_2001.webp`) are not in the repo; they are uploaded to R2 under `public/stonehenge-change/`.
Deploy: `python scripts/upload_r2.py <dir>` with the files placed under `<dir>/public/stonehenge-change/`.
