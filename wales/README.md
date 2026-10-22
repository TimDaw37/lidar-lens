# LiDAR Lens Wales

**Status: built into the live Lens, which now covers England and Wales** (`configs/england.js`, published at https://timdaw37.github.io/lidar-lens/). Wales is not a separate Lens.

- LiDAR: the Welsh Government LiDAR DTM 1 m (OGL), one cloud-optimised GeoTIFF on DataMapWales's Azure storage with no CORS. The relay's `/wales` route (`relay/src/wales.js`) range-reads only the tiles a block needs, using the file's 2-64 m overviews when zoomed out, and returns the same blocks as the EA route. `site/live-sw.js` fetches both sources for blocks near Wales and prefers the Welsh survey where it has data.
- Records in "What's here?": Cadw scheduled monuments and listed buildings, and the RCAHMW's National Monuments Record of Wales (Coflein), queried live from the DataMapWales WFS (open CORS, bounding boxes in British National Grid). Nothing is copied or stored except in the visitor's browser cache.
- Not included: the Welsh HERs (Archwilio / Heneb), whose terms bar republishing. Interface in English only for now; Cadw and Coflein record names are shown as published.

[PROPOSAL.md](PROPOSAL.md) is Grok's original plan, kept for the record; the records came out simpler than planned (live queries, not an imported snapshot).
