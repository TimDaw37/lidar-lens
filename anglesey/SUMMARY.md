# LiDAR Lens tiles: summary
Built 2026-10-24 14:01 BST. Source: Welsh Government national LiDAR DTM 1 m (DataMapWales COG wales_dtm_32bit_cog.tif, range reads), OGL v3 (c) Welsh Government.
Area: data/area_buf1km_27700.geojson, buffered = 911 km2. Pixels outside the buffer are transparent.
Format: Terrarium (h = R*256 + G + B/256 - 32768 m), 1/64 m steps, alpha 0 = nodata, lossless WebP (exact, every tile verified by decoding), XYZ web-mercator {z}/{x}/{y}.webp, average resampling z<16, bilinear z16-17; z8-11 are 2x2 means of the level below.

## Tiles
| zoom | tiles | MB |
|---|---|---|
| 8 | 3 | 0.0 |
| 9 | 3 | 0.0 |
| 10 | 6 | 0.1 |
| 11 | 13 | 0.4 |
| 12 | 36 | 1.5 |
| 13 | 126 | 5.2 |
| 14 | 444 | 17.2 |
| 15 | 1,634 | 54.8 |
| 16 | 6,211 | 165.7 |
| 17 | 24,177 | 505.3 |
| **total** | **32,653** | **750** |

Work units: 40/40 done. Failed/not done: none.

## Coverage gaps (inside the buffered county, at z12 resolution, about 24 m pixels)
Total gap area: 126.074 km2 in 87 pieces (13.838% of the area). Largest (BNG centroid, hectares):
| centroid E,N | ha |
|---|---|
| 239813,391413 | 5232.97 |
| 228360,374991 | 5143.75 |
| 262146,382058 | 1392.83 |
| 226838,394882 | 499.17 |
| 242586,361334 | 183.24 |
| 227513,379387 | 140.13 |
| 228106,380561 | 3.08 |
| 240008,363264 | 2.74 |
| 254100,381839 | 1.15 |
| 229686,375018 | 0.94 |
| 229089,387314 | 0.57 |
| 225277,378344 | 0.42 |
| 253861,381959 | 0.42 |
| 228348,379830 | 0.26 |
| 227956,380279 | 0.26 |
| 225178,378302 | 0.21 |
| 227564,378375 | 0.21 |
| 220740,381730 | 0.21 |
| 250324,387321 | 0.21 |
| 226680,394784 | 0.21 |
| 229569,374937 | 0.16 |
| 229604,388271 | 0.16 |
| 245066,393539 | 0.16 |
| 239618,363358 | 0.11 |
| 238338,362541 | 0.11 |

Files: tiles/, coverage.geojson (where there is data), coverage_gaps.geojson (no LiDAR inside the buffer, mostly sea), manifest.json (per-unit log), area polygon geojson (boundary).
