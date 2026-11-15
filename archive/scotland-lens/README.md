# Archive: Scotland lens pilot (not live, not wired in)

Copied on 15 Nov 2026 from branch `grok/scotland-lens`, tip `297f916d4149f80e64e645ceb091ccfffdae2ec5` (4 Nov 2026), so the branch can be deleted. That branch was built on top of `grok/orkney-lens`; the Orkney files are in `archive/orkney-lens/`.

What it was: a pilot Scotland lens (Fife and the Lothians) made from the Scottish Remote Sensing Portal LiDAR DTMs (OGL) as a priority mosaic with 30 m feathered seams, with live HES scheduled monuments, a Layers list that follows the country under the map centre, and its own Worker that fell back to the Orkney bucket.

Superseded by the GB viewer (`gb/`, lidarlens.sarsen.org), which covers all of Scotland.

Nothing here is used by the site: no build script, config or Worker in the repo reads `archive/`, and the site build output is unchanged.

Contents:
- `configs/scotland.js` - the lens area config.
- `scotland/` - the mosaic build, HES records, area/index/overview and upload scripts, run loops and the Worker (`scotland/worker/index.js`).
- `site-changes.patch` - the branch's extra edits to `site/` on top of the Orkney branch (country-aware Layers list). Kept for reference only; not applied.
