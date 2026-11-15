# Archive: Orkney lens (not live, not wired in)

Copied on 15 Nov 2026 from branch `grok/orkney-lens`, tip `5d99b89cabdab62a09410978a53e0daf93fb68f9` (4 Nov 2026), so the branch can be deleted.

What it was: a stand-alone LiDAR Lens for Orkney, built from the Orkney Islands Council 2023 50 cm DTM (OGL), opening at the Ring of Brodgar, with Historic Environment Scotland designations for the overlays and "What's here?". It was served from its own R2 bucket and Worker (`lidar-lens-orkney`).

Superseded by the GB viewer (`gb/`, lidarlens.sarsen.org), which covers Orkney and the rest of Scotland.

Nothing here is used by the site: no build script, config or Worker in the repo reads `archive/`, and the site build output is unchanged.

Contents:
- `configs/orkney.js` - the lens area config.
- `orkney/` - build, HES layer, overview and upload scripts, the Worker config example and the original README.
- `site-changes.patch` - the branch's edits to `site/` (per-country layer list, HES/NatureScot layers, `#zoom/lat/lng` hashes, start-in-lens), against main at `1a30da4`. Kept for reference only; not applied.
