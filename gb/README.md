# LiDAR Lens - Great Britain (production)
Worker `lidar-lens-gb` (https://lidar-lens-gb.tim-daw.workers.dev), viewer files under `gb/` in R2 bucket `lidar-lens-scotland`.
Relay `lidar-lens-gb-relay` (copy of relay/, allows lidar-lens-gb, lidarlens.sarsen.org). One-way tile cache (GET/HEAD only, Worker-built) under `gb-live-test/tc/w1/`, 100 GB cap, cron stats every 6 h.
lidarlens.sarsen.org (GitHub Pages) redirects here; the previous England & Wales site is tag `gh-pages-ew-20261104`.
`lidar-lens-scotland` redirects here (scotland-redirect/; upload route kept).

## Viewer source (live page, 8 Nov 2026)

The viewer that is deployed under `gb/` was recovered from `/workspace/lidar-scotland/live/viewer` (filesystem mtimes 6 Nov 2026, Europe/London; not by themselves proof of what was uploaded). Those non-minified files are now `site/index.html`, `site/lens.js`, `site/tools.js`, `site/ui.js`, `site/layers.js` and `scripts/build_site.mjs`. `site/live-sw.js`, `site/compat.js` and `site/models.js` were already the same bytes. The generated production service worker in that recovery (69,551 bytes, SHA-256 `7405d85b2454a5b1eb0f479ad34c65f426bb8a54626dd72feecf2a2016982a3d`) matches `https://lidarlens.sarsen.org/live-sw.js` and is produced from files already in this tree (`site/live-sw.js`, `gb/make_sw.py` substitutions, `gb/worker/src/scot-core.mjs` without its export line, `gb/scot-shell.js`, `gb/gb-route.js`).

`gb/config.js` is the config that is live on production (`assets/config.93c04c53.js` since 9 Nov 2026; before that the same bytes as `assets/config.198ea3a0.js`).

`gb/config-live-test.js` is the config live on the test Worker `lidar-lens-gb-live-test` (SHA-256 `a02cae18df35d633340bf2b1aa30d298def06752d04c317e75a6c34adc3c7301`; the test page asks for `assets/config.a02cae18.js`, so it was uploaded straight from the build). Checked 8 Nov 2026: `node scripts/build_site.mjs gb/config-live-test.js` reproduces the test site's `index.html`, `app.2cac7a32.js`, `app.6c9e6941.css`, `compat.912d81c4.js` and config byte for byte. It differs from `gb/config.js` only in "(live TEST)" labels and comments, `geographApi:null` (its comment says the test Worker has no Geograph key; that is out of date: null falls back to the same-origin `api/geograph`, and on 8 Nov the test Worker returned photos, so it now has `GEOGRAPH_KEY`) and a "TEST." data note; the test service worker differs only in using the `lidar-lens-gb-relay-test` relay. Use it for test builds only. Never copy it over `gb/config.js`.

Rebuild (esbuild 0.28.2, already pinned in `package-lock.json`; an older ancestor lockfile from `/workspace/lidar-lens-public` pins the same esbuild and was not substituted):

```
npm ci
node scripts/build_site.mjs gb/config.js
```

That writes `dist/assets/app.2cac7a32.js`, `dist/assets/app.6c9e6941.css` and `dist/assets/compat.912d81c4.js`, byte-identical to the live site. `npm run check:gb-viewer` rebuilds in a temp directory and fails if those hashes change, if `gb/config.js` changes, or if `tidyUI`, `measureOnDemand`, `dtmGroundNote` or the Scotland Canmore path disappear. A failing check means this tree would not rebuild the viewer that is deployed. Do not upload that build.

One filename difference: the recipe names the config `assets/config.93c04c53.js` (SHA-256 prefix). The live `index.html` references `assets/config.198ea3a0.js`, the MD5 prefix of the same bytes. Upload helpers were not in the recovery, so the rename step is not in this repo. The config bytes match. (Superseded 9 Nov 2026: production now serves the built page and `config.93c04c53.js`; see "What is live" below.)

Recovered Worker and relay sources matched `gb/worker` and `gb/relay` already on main, so they were not copied again. Wrangler files from that recovery were not added: they are deploy configuration, `wrangler.jsonc` is gitignored, and this sync does not deploy. Wiltshire (`configs/wiltshire.js`, `https://lidar-lens-public.tim-daw.workers.dev/`) is unchanged. The "Look here up" Google link in `site/tools.js` is unchanged.

## 3D view (added 8 Nov 2026)

`site/view3d.js` lifts the ground in the lens out as a block that can be turned, lit and saved (GLB, STL). It is built as a separate deferred script (`assets/view3d.<hash>.js`) and loads three.js (`site/vendor/three3d.js`, rebuilt with `npm run build:three3d`) only when the view opens. It stays out of the main bundle, so `app.2cac7a32.js`, `app.6c9e6941.css` and `compat.912d81c4.js` are unchanged and `npm run check:gb-viewer` still passes; the only page change is one extra script line.

`node scripts/build_site.mjs gb/config-live-test.js` at `90a4789` writes `assets/three3d.b0d9954d.js` and `assets/view3d.594e1593.js`. Those two, then `index.html` last, are what the live-test Worker serves. The built test `index.html` matches the previous test page except the view3d script name, because that page already uses `assets/config.a02cae18.js` (the SHA-256 prefix of `gb/config-live-test.js`).

Production was not the same until 9 Nov 2026 (see "What is live" below). Its page must keep `assets/config.198ea3a0.js`, the MD5 prefix of `gb/config.js`. A rebuild with `gb/config.js` names those same config bytes `assets/config.93c04c53.js`. Do not replace the production page with that built file. Upload the two scripts above, then upload last a copy of the existing production `index.html` whose only addition is `<script defer src="assets/view3d.594e1593.js"></script>` after `app.2cac7a32.js`. Leave the app, CSS, compat, `config.198ea3a0.js` and `live-sw.js` as they are. The new three.js file is required: `view3d` uses `PCFSoftShadowMap`, which `three3d.7b406472.js` does not export.

Sun: the 3D sun sliders start from the lens's sun. With the single-sun hillshade they also move the lens's sun and the draped image relights; with a lit surface the sun lights the block and casts shadows (on by default on desktops, off on phones). Browser checks: `node tests/view3d.test.mjs <site URL>` (opening three times in a row, sun start and relighting, a watertight block, the no-WebGL 2 message).

## Combined VAT view (added 9 Nov 2026)

Visualisation option 10, "Combined VAT" (key V, phone mode bar "V"). It is Kokalj and Somrak's (2019) combined visualisation for archaeological topography, written in the lens's own GLSL from the paper's recipe and RVT's published blend settings (`settings/blender_VAT.json`, `default_terrains_settings.json`). No RVT code is copied.

- Each VAT, rendered bottom up as RVT's blender does: hillshade (sun 315°) normal 100%, then slope (inverted, 0–max°) luminosity 50%, then positive openness (min–max°) overlay 50%, then sky-view factor (min–1) multiply 25%.
- General terrain: sun elevation 35°, slope 0–50°, openness 68–93°, SVF 0.7–1, horizon radius 10 m. Flat terrain: 15°, 0–15°, 85–93°, 0.9–1, 20 m.
- Combined VAT = general at 50% opacity over flat.
- One horizon search out to 20 m. Samples within 10 m also give the general-terrain SVF and openness, so the cost is about one sky-view pass, roughly 1.1× in software GL.
- True heights (no vertical exaggeration; the slider is disabled). Fixed 0–1 display scale as in RVT. The Contrast slider narrows it about the middle. The Auto contrast (2–98%) tick is Combined VAT's own option and is off by default (`va=1` in share links). When it is on, the lens's percentile stretch is used instead of the fixed scale. A one-line legend under the menu says what light and dark mean, and the menu option's tooltip gives the credit.
- Starting look (Tim, 9 Nov): Contrast 1.15× and Gamma 1.15 (`MODE_LOOK` in `site/lens.js`), slightly punchier and darker in the mid-tones than plain RVT. They are set when Combined VAT is chosen while the sliders are still at the previous mode's starting values. Values the user has changed are kept. Leaving Combined VAT goes back to 1 and 1 in the same way.
- Differences from RVT: the lens's sparse horizon sampling (16 directions × 14 steps on desktop, 8 × 6 on phones; RVT reads every pixel along each ray). No SVF noise removal (RVT's flat setting uses noise level 3). Radii are in metres, so at zooms below 17 they span fewer, coarser pixels.
- Computed in the browser from the DTM tiles already fetched and cached. No new Worker route, no new R2 objects, no extra cache use. The mosaic carries neighbouring tiles plus a margin (at least 96 screen px, against a 20 m ≈ 27 px horizon at z17), so tile edges show no seams.

## Openness difference (mode 11, added 9 Nov 2026)

Visualisation 11, "Openness difference" (key O). (positive openness − negative openness) / 2, in degrees: openness after Yokoyama, Shirasawa and Pike (2002), the difference after Chiba, Kaneta and Suzuki (2008), the ridge–valley index of red relief image maps. Written from the papers; no code is ported.

- One horizon search: the loop that modes 8 and 9 use already tracks the highest (`mx`) and lowest (`mn`) angle in each direction, so mode 11 adds `−(mx + mn)/2` per direction instead of running two searches. Same radius slider, 16 directions × 14 steps, 8 × 6 on phones (the menu tooltip says so). The vertical exaggeration applies, as in modes 8 and 9.
- Display: centred on zero with symmetric auto-contrast (2–98%), grey by default (ridges light, hollows dark). The colour ramps work; "Red relief colours (slope in red)" is offered in the ramp list for this mode only and uses the mode 6 colour rule.
- Margin: `needPx()` in `wantMosaic` (live mode) widens the lens margin to the horizon radius when it would pass the usual 96 px (radius capped at 120 data px, 64 on phones). Other modes are unchanged.
- CPU fallback: same method in `makeCPU`.
- Checks: `node tests/modes.test.mjs <site URL> 11` (renders at Stonehenge, Pentre Ifan and Clava, differs from hillshade, share-link round trip, phone size, CPU fallback, timings, no errors). Test site: Clava, NH 757 445, cairn rims light and inner hollows dark.
- `npm run check:gb-viewer` pins the new `app.73ba7c7a.js`: this is an intended release (live-test now, production once Tim approves), so the hashes changed in the same commit.

## Local dominance (mode 12, trial, 9 Nov 2026; not yet on production)

Visualisation 12, "Local dominance (trial)" (key L), after Hesse (2016). An observer stands `h` m above each point; the value is the mean angle (degrees) down to every sample on rings from the inner to the outer radius, 1 m apart (one data pixel apart when pixels are larger than 1 m), in 24 directions (12 on phones; the tooltip says so). True heights: the vertical exaggeration slider is disabled for this mode, as for Combined VAT. Settings under the menu, saved in share links (`ld0`, `ld1`, `ldh`): inner radius 10 m (2–30), outer 20 m (5–60), observer 1.7 m (0.5–5); RVT's defaults, converted from pixels on 1 m data to metres. Grey, auto-contrast 2–98%. `needPx` widens the live margin to the outer radius. CPU fallback: same method.

Test (Tim): open live-test at Normanton Down (SU 115 413), mode 12. Each barrow, including the low ploughed ones, should be a bright spot. Automated: `node tests/modes.test.mjs <url> 12`. Promotion: remove "(trial)" from the menu label in `site/index.html` and the About text, rebuild, then deploy as for mode 11.

## What is live (9 Nov 2026, after the Openness difference promotion)

Every live viewer is now an exact build of this tree, with no hand-edited pages:

- Production (`gb/` in `lidar-lens-scotland`, lidarlens.sarsen.org): `node scripts/build_site.mjs gb/config.js`. `index.html`, `app.73ba7c7a.js`, `app.6c9e6941.css`, `compat.912d81c4.js`, `config.93c04c53.js`, `view3d.594e1593.js` and `three3d.b0d9954d.js` are byte-identical to the build. The page now asks for `config.93c04c53.js`. The old `config.198ea3a0.js` (same bytes) stays in R2 for old cached pages. `live-sw.js` is unchanged (SHA-256 `7405d85b…`, from `gb/make_sw.py`). This replaces the "keep `config.198ea3a0.js`" step above.
- Live-test (`gb-live-test/`): `node scripts/build_site.mjs gb/config-live-test.js`, byte-identical.
- Wiltshire (`public/` in `lidar-lens-wiltshire`, Worker `lidar-lens-public`): `node scripts/build_site.mjs configs/wiltshire.js` (`app.804283e0.js`, `config.11b9b8f9.js`; before mode 11, `app.468b2020.js`). It previously ran a hand-patched bundle (`app.0de74083.js`) that this tree could not rebuild. The main build also brought in what `configs/wiltshire.js` already had on main: the Cloudflare analytics beacon, the Great Ridge start view, links to lidarlens.sarsen.org, the "What's here?" label and the 3D view. The other modes render pixel-identical to the old page.

Worker sources, checked against the source maps in the deployed scripts on 9 Nov 2026:

- `lidar-lens-gb` = `gb/worker/src/` (`index.js`, `ew-core.mjs`, `scot-core.mjs`).
- `lidar-lens-gb-live-test` = `gb/worker/src/index.live-test.js` (deploy it as `index.js` next to the same two `.mjs` files). It differs from `index.js` only in "GB TEST" comments and two User-Agent strings.
- `lidar-lens-public` (Wiltshire) = `worker/wiltshire/src/index.js`. That is an older form of `worker/src/index.js`: it has no Geograph route, fewer CSP hosts and User-Agent `lidar-lens-public`. Its vars are `PUBLIC_INDEX=1`, `HER_API=1`, `HER_BBOX=360000,110000,450000,200000`, `SITE_PREFIX=public/` and the `SHARED` terrain/rec/ctx regex, with the `RATE_LIMITER` (1200/60 s) and `HER_LIMITER` (30/60 s) bindings. As before, wrangler files are not committed.

Mode 11 was promoted to production and Wiltshire at about 22:20 GMT on 9 Nov 2026 (before that: `app.836b5ebc.js` / `app.468b2020.js`, main `5058fe4`).

Rollback: the previous production, Wiltshire and live-test pages, with upload payloads, are on the box under `/workspace/lidar-cvat/rollback-20261109-mode11-promotion/` (mode 11) and `/workspace/lidar-cvat/rollback-20261109-promotion/` (Combined VAT). The old app files are still in R2, so restoring an `index.html` is enough.

### Multi-scale relief model (mode 13, trial, 9 Nov 2026; not yet on production)

After Orengo & Petrie (2018), ESPL 43, 1361–1369. Because the printed sum of successive differences cancels term by term, the result is (LP(i^x) − LP(n^x)) / (n − i), using two box (mean) filters. i and n are taken from the paper with rr = metres per pixel, and fmin is raised to rr as RVT does. Parameters: smallest feature mf0 (default 0 m), largest feature mf1 (default 20 m) and scaling mx (default 2). There is an option to draw it at 70% over the multi-direction hillshade (msh). The display uses a ±2.5 σ standard-deviation stretch. On phones the larger filter is capped at 64 px (120 px on desktop). Key M.

**Test method.** Stonehenge Cursus (51.18698, −1.81537, z16) and Normanton Down (z17). Compare with LRM (mode 3): the Cursus banks and ditches and the barrows should read clearly at 0–20 m, without LRM's broad halos. Changing the largest feature to 60 m should bring in broader relief. Automated: `node tests/modes.test.mjs <url> 13`. Renders are in /workspace/lidar-cvat/msrm/.
**Promote:** remove "(trial)" from the index.html option and the About text, rebuild, update the gate, and deploy as for mode 11.

### Multi-scale topographic position (mode 14, trial, 9 Nov 2026; not yet on production)

After Lindsay, Cockburn & Russell (2015), Geomorphology 245, 51–61, with the colour composite of Guyot, Hubert-Moy & Lorho (2018), Remote Sensing 10, 225. DEV = (z − mean) / sd in square windows, computed from float64 summed-area tables on the CPU; that happens on both renderers, with the GL renderer reading the decoded heights back once per mosaic. Three scales follow RVT's defaults: local 1–5 m (blue), meso 5–50 m (green) and broad 50–500 m (red). Each colour is 1 − exp(−lightness·|DEVmax|), with lightness `mtl` defaulting to 1.2 as in RVT. Phones use three radii per scale. Areas over 250k px (90k on phones) are computed on every second pixel. Key T.
**Limitation:** windows are cut at the loaded area, which is 120 px beyond the view, or 64 on phones. That means the broad scale reaches the full 500 m only from about zoom 14 outwards, and the legend says so at closer zooms.

**Test method.** Silbury Hill (51.41543, −1.85759) at z14 and z16, compared with hillshade and LRM. The mound should read white or orange, standing out at all scales. Valleys and ridges should show as red bands, and banks and tracks in green and blue. Automated: `node tests/modes.test.mjs <url> 14`. Renders are in /workspace/lidar-cvat/mstp/.
**Promote:** remove "(trial)" from the index.html option and the About text, rebuild, update the gate, and deploy as for mode 11.
