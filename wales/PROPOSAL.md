> **Proposal, not built.** A starter plan for a possible LiDAR Lens Wales. Nothing here is deployed; it is not to be built until LiDAR Lens England is finished.

# LiDAR Lens Wales — plan (not to be built until LiDAR Lens England is finished)
Checked 22 Oct 2026 (read-only).

## Checked facts
- DTM: https://dmwproductionblob.blob.core.windows.net/cogs/lidar/wales_dtm_32bit_cog.tif
  - 48.6 GB (48,611,310,928 bytes), last modified 4 Oct 2024, Azure Blob, byte ranges work.
  - Valid cloud-optimised GeoTIFF (COG), EPSG:27700, 1 m, 191,007 × 233,000 px.
  - Origin (164993, 397000); about 49% of pixels hold data (the rest is sea or England).
  - Float32, DEFLATE, 256×256 tiles, no-data −9999.
  - Six overviews (2 m to 64 m).
- **No CORS.** The GET has no Access-Control-Allow-Origin, and the OPTIONS preflight returns 403 "CORS not enabled". Browsers can't read it directly, so a relay is required.
- Licence: OGL. Source: https://datamap.gov.wales/maps/lidar-data-download/metadata_detail. The tile-catalogue page says "Not Specified", so ask data@gov.wales to confirm. No rate limits are published.

## Architecture
- Reuse TimDaw37/lidar-lens with `configs/wales.js`, using the same viewer and the build_site.mjs pipeline.
- Relay: a copy of the England Worker, adapted for COG reads.
  - The Worker range-reads 256² tiles from the blob and assembles 512² blocks in the existing readTiff format.
  - It applies the same rules: empty-block skip, edge cache plus R2 with 30-day expiry, and a polite request rate.
  - Fetching the tile index once costs about a few MB per overview, so cache it in R2/KV.
- Not chosen:
  - Direct browser COG reads are ruled out by the missing CORS.
  - Converting all 48 GB into R2 isn't needed for a first version.
- CRS: EPSG:27700 natively, the same grid as the EA data, so block maths carries over. Re-base the block origin to (164993, 397000) or snap to the 1 km grid.
- No-data: treat −9999 as empty, and keep the 0.0 check too.
- Overviews: use them for low zooms instead of the zoom-13 floor (optional improvement).

## "What's here?" layers (all OGL, from the DataMapWales WFS, imported as a snapshot)
| Layer | Features | Attribution |
|---|---|---|
| inspire-wg:Cadw_SAM (scheduled monuments) | ~4,000 | "Designated Historic Asset GIS Data, The Welsh Historic Environment Service (Cadw), [DATE RECEIVED], licensed under the Open Government Licence v3.0" |
| inspire-wg:Cadw_ListedBuildings | 30,110 | same Cadw statement, with the date the data was received |
| geonode:rcahmw_nmrw_terrestrialsites_rcahmw_bng (Coflein sites) | 112,894 | "This site data is from the National Monuments Record of Wales (NMRW), produced by the Royal Commission on the Ancient and Historical Monuments of Wales (RCAHMW). © Crown Database Right: RCAHMW, licensed under the Open Government Licence 3.0." |
| optional: geonode:nmrw_maritimesites_rcahmw_wgs84 | 8,612 | same as above |

- Optional extras: Cadw_HistoricLandscapes, Cadw_DesignatedWrecks, and the RCAHMW historic place names.
- Record the download date in the build config and show it in the attribution panel.
- Coflein archive images and text are NOT covered by OGL (they're Non-commercial Government Licence), so link out to coflein.gov.uk, never copy.
- Archwilio / Heneb HER: link only (e.g. "Search Archwilio near here", opening archwilio.org.uk at the location). Never scrape, copy, cache or store any data from it. Its terms bar passing data to third parties and publishing it without written consent.

## Welsh-language UI (optional)
- Add an EN/CY toggle with a strings file. Cadw records carry Welsh names, and Coflein has some.
- The interface needs translating. Use a human translator or reviewer rather than machine translation alone.

## Open questions for Tim
1. Separate lens, or Wales added into the England lens as one England+Wales viewer?
2. Include listed buildings (30k points, clutter) or just monuments + Coflein?
3. Is the Welsh UI wanted? If so, who checks the translation?
4. Should we email data@gov.wales to confirm the LiDAR licence and an acceptable request rate?
5. Should we ask Heneb about a display licence for the HER, or keep it links only?
6. Domain or path name for the lens?

## Rough effort (once England is done)
- Relay COG adapter + test: 1–2 days
- Config, build and gazetteer for Wales: 0.5 day
- Heritage import + attribution: 0.5–1 day
- Welsh UI: 1 day + translation review
- Total: about 3–5 working days of agent time, plus Tim's review.
