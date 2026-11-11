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

## Local dominance (mode 12; live from 10 Nov 2026)

Visualisation 12, "Local dominance" (key L), after Hesse (2016). An observer stands `h` m above each point; the value is the mean angle (degrees) down to every sample on rings from the inner to the outer radius, 1 m apart (one data pixel apart when pixels are larger than 1 m), in 24 directions (12 on phones; the tooltip says so). True heights: the vertical exaggeration slider is disabled for this mode, as for Combined VAT. Settings under the menu, saved in share links (`ld0`, `ld1`, `ldh`): inner radius 10 m (2–30), outer 20 m (5–60), observer 1.7 m (0.5–5); RVT's defaults, converted from pixels on 1 m data to metres. Grey, auto-contrast 2–98%. `needPx` widens the live margin to the outer radius. CPU fallback: same method.

Test: open the viewer at Normanton Down (SU 115 413), mode 12. Each barrow, including the low ploughed ones, should be a bright spot. Automated: `node tests/modes.test.mjs <url> 12`.

## Field mode (trial on live-test 11 Nov 2026)

A Field / Lab switch (Lab is the full research view): in the panel header on desktop, floating at the top right on a phone, beside the search box in field mode. The choice is remembered on the device (localStorage `lidarlens.field.v1`) and carried in links: `ui=field`, or `ui=research` / `ui=lab` (`mode` is already the visualisation number). A link without `ui=` follows the device's last choice.

Field mode (`site/field.js`, a separate deferred asset `assets/field.<hash>.js`) hides the research panel and chrome and shows a bottom sheet built for cold fingers and gloves: every control at least 56 px, high contrast, one-handed at 360–420 px wide, also usable on desktop.

- Target: tap ◎ Target then the map, or search for a place or grid reference. It is remembered across reloads and carried in links as `tgt=lat,lng`.
- Done: a labelled ✓ Done button beside the readout clears the target. Within 25 m of it (or the GPS accuracy, up to 50 m) a full-width green "✓ Done: clear target" button is offered instead. Clearing collapses the readout so only the buttons remain, and stops the map re-framing: it stays where it is, with your GPS dot.
- Your position: GPS (`watchPosition`, high accuracy) as a blue dot with its accuracy circle, on the same map as the target (red ring).
- Readout: distance and bearing to the target in large text with an arrow, updated live. The map stays north-up. With a compass (`deviceorientationabsolute` on Android, `webkitCompassHeading` on iOS after a tap on "Use compass", which iOS needs for its permission prompt) the arrow turns with the phone so it points the way to go; without one, or if permission is refused, it points from north on the map and the readout says so. The numeric bearing is shown (true bearing; the compass is magnetic, about 1° different in southern England, deliberately not corrected). On narrow phones (≤390 px), or whenever distance, arrow and direction would not fit on one line, the degrees are dropped so the readout stays on one line.
- Framing: you and the target are kept in view together, clear of the search bar and sheet. If they are too far apart to show both above zoom 12, it centres on you at zoom 15. Panning stops following; Recentre resumes it.
- Views: Hillshade (mode 0, LiDAR full screen), VAT (Combined VAT, mode 10, full screen) and Old map (LiDAR put away, the first old map over the aerial).
- What is it?: the What's here card for the target, or for your position if there is no target.
- GPS blocked, unavailable or no fix: a one-line note ("Location blocked") with Retry and ✕ to hide it; the full advice is its tooltip. The map and target still work.
- Framing centres the target (or you and the target) in the part of the map you can see: below the search bar, above the sheet (beside it on desktop) and clear of the zoom buttons. It re-centres when the sheet changes height. The sheet is kept compact on phones (about a third of a 360×760 screen with the note).
- Zoom: big (56 px) + and − buttons at the right, under the search bar, in field mode on every device.
- Lens: the LiDAR is full screen in field mode; the lens centre (`l=`) is kept on the target, or the centre of the visible map with no target, and recomputed on move and resize, so it is right when you go back to Lab.
- Old map shows the old map and puts the LiDAR away without changing full screen or the visualisation; Hillshade or VAT brings the full-screen LiDAR straight back.
- The compass offer ("Use compass") appears only on a phone or tablet with a GPS fix and a target; only that button asks for permission.
- Home screen: the main manifest (`site.webmanifest`, start_url unchanged) has a "LiDAR Field" / "Field" shortcut to `./?ui=field` with a field icon (96 and 192 px). In field mode the page points at `field.webmanifest` (LiDAR Field app, start_url and id `./?ui=field`), uses a field apple-touch-icon and title, and keeps `?ui=field` in the address, so Add to Home screen opens field mode on Android (manifest) and iOS (which uses the address). Lab mode puts the main manifest, icon and address back. A query is used because a #hash may be dropped.
- Leaving field mode restores the research visualisation, full-screen setting, old map and background that were in use.

Tests: `tests/field.test.mjs` (desktop, 360 and 420 px phones with simulated GPS, GPS denied) and `tests/layout-flip.test.mjs`.

## Phone or desktop layout at load (fixed 11 Nov 2026)

The CSS layout follows the viewport live, but the panel (hidden on phones), the open sections and the lens position were set once by JS at load. A page that started while the viewport was wide or not yet final (Chrome prerender, a restored or background tab, rotation, folding screens) kept the desktop state under phone CSS, so a phone sometimes opened with the panel and every section open and the lens off-centre. `ui.js` now re-applies that state whenever the phone or sheet media query changes.

## Clicked-spot ring (changed 11 Nov 2026)

A click on the map (no tool on) pins the position readout there and draws a small red ring. It used to stay until Esc. It is now released, ring and all, as soon as the map is dragged or zoomed, or when the What's here card it marks is closed. A What's here click draws no red ring at all: its yellow ring marks the spot while the card is open; in field mode a tap does not pin at all (the field target ring is separate and stays until Done). Sharing a point is unaffected: `l=` is the lens position, not this ring. `tests/pin.test.mjs`.

## What is live (10 Nov 2026, after the sky dome "inside the dome" release)

Every live viewer is an exact build of this tree, with no hand-edited pages (full-file comparison of every built file against all four hosts, 10 Nov 2026):

- Production (`gb/` in `lidar-lens-scotland`, served at lidarlens.sarsen.org and lidar-lens-gb.tim-daw.workers.dev): `node scripts/build_site.mjs gb/config.js`. `index.html`, `app.4131826f.js`, `app.6c9e6941.css`, `compat.912d81c4.js`, `config.93c04c53.js`, `view3d.457bfd53.js`, `viewshed.192616a0.js`, `sky3d.ed2ba8c8.js` and `three3d.8937def9.js` are byte-identical to the build (before the inside-the-dome release `view3d.71560778.js`, `viewshed.bbbdb346.js`, `sky3d.5ab5d8b8.js`; before the View from here / sky dome release `app.8f528015.js`, `view3d.e10e92f9.js`, `three3d.1b72ca05.js`; before the MSTP / water release `app.8c00751d.js` and `view3d.6b3214ac.js`). The page asks for `config.93c04c53.js`; the old `config.198ea3a0.js` (same bytes) stays in R2 for old cached pages. `live-sw.js` is unchanged (SHA-256 `7405d85b…`, built by `gb/make_sw.mjs`).
- Live-test (`gb-live-test/`): `node scripts/build_site.mjs gb/config-live-test.js`. Byte-identical to main.
- Wiltshire (`public/` in `lidar-lens-wiltshire`, Worker `lidar-lens-public`): `node scripts/build_site.mjs configs/wiltshire.js` (`app.09530eb1.js`, `view3d.457bfd53.js`, `viewshed.192616a0.js`, `sky3d.ed2ba8c8.js`, `three3d.8937def9.js`, `config.11b9b8f9.js`; before the inside-the-dome release `view3d.71560778.js`, `viewshed.bbbdb346.js`, `sky3d.5ab5d8b8.js`; before View from here / sky dome `app.94460541.js`, before MSTP / water `app.34e16d74.js`, before local dominance/MSRM `app.804283e0.js`, before mode 11 `app.468b2020.js`). It once ran a hand-patched bundle (`app.0de74083.js`) that this tree could not rebuild.

- Sky dome: it opens with the camera inside the dome (sky panel button "Inside the dome", on by default; click it for the outside view over the block). Share links add `dome=out` for the outside view; older `dome=in` links still open inside. Checks: `node tests/inside.test.mjs <site URL> [dist]`.
- Rollback for this release: `/workspace/lidar-cvat/rollback-20261110-release4/` (on the box) holds the previous production, Wiltshire and live-test pages. Old assets were left in R2, so re-uploading the old `index.html` is a full rollback. Earlier releases: `rollback-20261110-release3/`, `rollback-20261110-release2/`.
- Root files: the build also writes `live-sw.js` and `nhle_places.json`, so every file the hosts serve comes from this tree (checked by a full-file comparison on 10 Nov 2026; `_headers` is not served). For a config in `gb/`, `scripts/build_site.mjs` builds `live-sw.js` with `gb/make_sw.mjs`. That script replaces the hand-run `gb/make_sw.py`, which read files outside this repository. It takes `site/live-sw.js`, `gb/worker/src/scot-core.mjs` (minus its export line), `gb/scot-shell.js`, `gb/gb-route.js` and the Scotland outline from the config. The live-test config gets the test relay and header. `nhle_places.json` is `gb/places.json` (1.96 MB: `configs/england-places.json` followed by 8,076 Historic Environment Scotland names). No script for the Scotland part was found, so the file is committed as served. Wiltshire keeps `site/live-sw.js` and `site/nhle_places.json`. `tests/gb-viewer-sync.mjs` pins both GB files.

Worker sources, checked against the source maps in the deployed scripts on 9 Nov 2026:

- `lidar-lens-gb` = `gb/worker/src/` (`index.js`, `ew-core.mjs`, `scot-core.mjs`).
- `lidar-lens-gb-live-test` = `gb/worker/src/index.live-test.js` (deploy it as `index.js` next to the same two `.mjs` files). It differs from `index.js` only in "GB TEST" comments and two User-Agent strings.
- `lidar-lens-public` (Wiltshire) = `worker/wiltshire/src/index.js`. That is an older form of `worker/src/index.js`: it has no Geograph route, fewer CSP hosts and User-Agent `lidar-lens-public`. Its vars are `PUBLIC_INDEX=1`, `HER_API=1`, `HER_BBOX=360000,110000,450000,200000`, `SITE_PREFIX=public/` and the `SHARED` terrain/rec/ctx regex, with the `RATE_LIMITER` (1200/60 s) and `HER_LIMITER` (30/60 s) bindings. As before, wrangler files are not committed.

Local dominance (12), MSRM (13), red–cyan 3D and 3D soft shading were promoted to production and Wiltshire on the morning of 10 Nov 2026 (before that: `app.73ba7c7a.js` / `app.804283e0.js`, main `0a224a5`). Mode 11 was promoted at about 22:20 GMT on 9 Nov 2026 (before that: `app.836b5ebc.js` / `app.468b2020.js`, main `5058fe4`).

Rollback: the previous production, Wiltshire and live-test pages, with upload payloads, are on the box under `/workspace/lidar-cvat/rollback-20261110-release/` (this release), `/workspace/lidar-cvat/rollback-20261109-mode11-promotion/` (mode 11) and `/workspace/lidar-cvat/rollback-20261109-promotion/` (Combined VAT). The old app files are still in R2, so restoring an `index.html` is enough.

### Multi-scale relief model (mode 13; live from 10 Nov 2026)

After Orengo & Petrie (2018), ESPL 43, 1361–1369. Because the printed sum of successive differences cancels term by term, the result is (LP(i^x) − LP(n^x)) / (n − i), using two box (mean) filters. i and n are taken from the paper with rr = metres per pixel, and fmin is raised to rr as RVT does. Parameters: smallest feature mf0 (default 0 m), largest feature mf1 (default 20 m) and scaling mx (default 2). There is an option to draw it at 70% over the multi-direction hillshade (msh). The display uses a ±2.5 σ standard-deviation stretch. On phones the larger filter is capped at 64 px (120 px on desktop). Key M.

**Test method.** Stonehenge Cursus (51.18698, −1.81537, z16) and Normanton Down (z17). Compare with LRM (mode 3): the Cursus banks and ditches and the barrows should read clearly at 0–20 m, without LRM's broad halos. Changing the largest feature to 60 m should bring in broader relief. Automated: `node tests/modes.test.mjs <url> 13`. Renders are in /workspace/lidar-cvat/msrm/.

### View from here and the sky dome (trial, branch `feature/view-from-here`, not deployed)

**View from here** (`site/viewshed.js`, key E, a separate deferred script like `view3d.js`; the main bundle is unchanged). Click a spot. The tool fetches the lens's own height tiles in four rings (zoom 17 to 200 m, 15 to 1 km, 14 to 3 km, 13 to 10 km: about 110 tiles, 30 or so LiDAR blocks), then sweeps 1,440 bearings from 1.5 m above the ground. The angle to a point at distance d and height h is atan((h − eye − d²(1 − k)/2R)/d), with R = 6,371 km and k = 0.13; a point is in view if nothing nearer on its bearing stands higher in angle. Ground in view is tinted (or hidden ground shaded), the skyline is drawn on the map, and a chart gives its height round the compass. Bearings whose skyline lies in the last tenth of the range, or where the LiDAR stops short, are amber: higher ground beyond 10 km is not in the model, and the readout gives the height it would need to show. Share links carry `vp=lat,lng`. The swept skyline is on `window.__viewshed.state()`.

**Sky** (tick box in the 3D view; `scripts/sky3d/` built into `site/vendor/sky3d.js` by `npm run build:sky3d`, fetched only when ticked). A dome centred on the eye at the viewpoint (the View from here spot if it is in the lens, otherwise the lens centre): the swept skyline as its rim, the Sun and Moon at true size, about 1,600 stars, the Sun's solstice and equinox paths and the Moon's major and minor standstill limits for the year shown, and today's paths. Year (4500 BC to the present), day and time controls; Sunrise, Sunset, Moonrise and Moonset find the moment the chosen edge of the disc, as seen, meets the real skyline. "Stand at the viewpoint" puts the camera at the eye, heights at 1×.

**Sky calculations** (`scripts/sky3d/astro.js`). astronomy-engine 2.1.19 (MIT) gives the Sun's and Moon's positions. Its own places of date are not used for ancient years: its precession polynomials and truncated planetary series put the midsummer Sun of 2500 BC at declination 23.86°, where the obliquity was 23.97° (Laskar 1986), about 0.2° of bearing at sunrise at this latitude. `astro.js` takes the Sun's longitude of date with latitude zero, the Moon's longitude and latitude of date from the lunar theory, Laskar's obliquity, mean sidereal time (Meeus), parallax and Saemundsson refraction. For 2026 it agrees with astronomy-engine to 0.01° (Sun) and 0.02° (Moon). Stars have no proper motion. Ancient clock times are nominal.

**Tests.** `node tests/astro.test.mjs` (Node: the calculations, 19 checks); from `tests/`, `node viewshed.test.mjs <url> [dist]` (sweep against known answers, then Stonehenge: north-east skyline 0.58° at 2.7 km) and `node sky.test.mjs <url> [dist]` (dome, 2500 BC midsummer first gleam at 49.3° from the centre of Stonehenge, standing view, clean removal). With a `dist` folder the build is tested on the live site's tiles before deployment.

**Ways in (10 Nov 2026).** The sky dome has its own button at the top of Tools, "★ Sky: Sun, Moon and stars from a spot" (key K). With a viewpoint set it opens the 3D view with the dome; without one it asks "click a spot to stand at", works out the view from that spot and then opens the dome. In the 3D view a "★ Sky dome" button in the header turns the dome on and off (it ticks the Sky box; with no viewpoint in the block the dome stands at its centre). The older routes still work: View from here, then "3D view with sky", or the Sky tick box. While the dome is open the page link carries `sky=1`; a link with `sky=1` (and `vp=`, or none for the lens centre) opens straight into the dome. Checks: `node tests/sky-entry.test.mjs <url> [dist] [screenshot folder]`.

**Press-and-hold pop-up removed (10 Nov 2026).** Holding a point on the map (or right-clicking it) used to open a small pop-up with the grid reference and nearby Geograph photos. Tim found it annoying, so it is gone (`site/tools.js`). This changes the main bundle (`app.4131826f.js` on this branch; production stays on `app.8f528015.js`). What's here? (W), the tool you switch on, is unchanged. Checks: `node tests/hold.test.mjs <url> [dist]`.

**Star data.** `scripts/sky3d/bright_stars.json` is the 1,630 stars to V ≤ 5 from the Yale Bright Star Catalogue, 5th revised edition (Hoffleit & Warren 1991, CDS VizieR V/50). It is the magnitude-5 cut of the 2,887-star (V ≤ 5.5) list in stonehenge-block-3d `data/bright_stars.js`, and was checked row by row against VizieR V/50 on 10 Nov 2026 (positions within 0.001°, magnitudes equal). The About / data credit is added by `viewshed.js`.

**Limits.** Bare ground only; 10 km range; sea and gaps in the LiDAR are empty; the far skyline in Scotland is often outside the surveyed strips. The three.js subset (`three3d.js`) gained ten exports for the dome, so its hash and `view3d.js`'s change with this branch.

### Red–cyan 3D in the 3D view (live from 10 Nov 2026)

This adds a "Red–cyan 3D" tick box in the 3D view. It uses three.js AnaglyphEffect with Dubois (2001) colour matrices. `scripts/build_three3d.mjs` exposes its StereoCamera so the eye gap can be set to 1/30 of the viewing distance, with the eyes converging on the orbit target. The tick box is screen only: GLB and STL saves are unchanged. `site/vendor/three3d.js` has been rebuilt, which gives a new three3d hash.

**Test method.** Silbury Hill at z16 in hillshade, and Normanton Down at z17 in local dominance. Open 3D, tick the box and view with red–cyan glasses (red over the left eye). The mound and barrows should stand forward of the screen, and turning or zooming should stay comfortable. Automated: `node tests/view3d.test.mjs <url>` checks that colour fringes appear when ticked and go when unticked, with no errors. Renders are in /workspace/lidar-cvat/anaglyph/.

### Soft shading in the 3D view (live from 10 Nov 2026)

This is a tick box in the 3D view. It computes a sky-view factor per top vertex (Zakšek et al. 2011), using 16 directions within 10 m (8 on phones) at true heights. That is turned into a vertex-colour darkening of 0.55 + 0.45·clamp((SVF − 0.7)/0.3) on the lit and plain surfaces. The "Lens view, as shown" surface is left as drawn. It is computed once per block.
**Test method.** At Old Sarum (51.09345, −1.80575, z16), use the plain surface: ditches should darken and banks should stay light. Automated: `node tests/view3d.test.mjs <url>`.

### Multi-scale topographic position (mode 14, live from 10 Nov 2026)

After Lindsay, Cockburn & Russell (2015), Geomorphology 245, 51–61, with the colour composite of Guyot, Hubert-Moy & Lorho (2018), Remote Sensing 10, 225. DEV = (z − mean) / sd in square windows, computed from float64 summed-area tables on the CPU; that happens on both renderers, with the GL renderer reading the decoded heights back once per mosaic. Three scales follow RVT's defaults: local 1–5 m (blue), meso 5–50 m (green) and broad 50–500 m (red). Each colour is 1 − exp(−lightness·|DEVmax|), with lightness `mtl` defaulting to 1.2 as in RVT. Phones use three radii per scale. Areas over 250k px (90k on phones) are computed on every second pixel. Key T.
**Limitation:** windows are cut at the loaded area, which is 120 px beyond the view, or 64 on phones. That means the broad scale reaches the full 500 m only from about zoom 14 outwards, and the legend says so at closer zooms.

**Test method.** Silbury Hill (51.41543, −1.85759) at z14 and z16, compared with hillshade and LRM. The mound should read white or orange, standing out at all scales. Valleys and ridges should show as red bands, and banks and tracks in green and blue. Automated: `node tests/modes.test.mjs <url> 14`. Renders are in /workspace/lidar-cvat/mstp/.
**Colours (10 Nov 2026).** The ramp list for this mode adds "Three sizes in colour", which is the default and the RGB composite above. Choosing any other ramp (grey, viridis, magma and so on) shows a single value on that ramp. A new "On a colour ramp, show" choice sets which value: the strongest of the three sizes, i.e. max(local, meso, broad) of 1 − exp(−lightness·|DEVmax|) (the default), or one size on its own. The usual 2–98% auto contrast applies. The legend says what the ramp shows, and that it shows neither raised versus sunken ground nor, for "strongest", which size. The choice is saved in share links (`ramp`, `mts`). Checks: `node tests/mstp-palette.test.mjs <url>`, covering WebGL and the CPU fallback. Renders are in /workspace/lidar-cvat/mstp-palette/.

### Water level (live from 10 Nov 2026)

**2D map, full screen only.** Under "LiDAR full screen" there is a "Water level" tick box with a slider. Every LiDAR cell below the chosen level is shaded blue; deeper cells, over the first 3 m, get a darker blue. This happens in the final shader on WebGL, and in the draw loop on the CPU fallback. Moving the slider redraws without recomputing the visualisation. The slider spans the heights in view, sampled on a 56 × 56 grid (40 × 40 on phones). The readout gives the level in m OD, the share of the view under water and the range of ground heights. Share links carry `wat=1&wl=<m OD>`.
This is a level, not a flood model: any cell below the level fills, including hollows that are not connected to the river.

**3D view.** The water sheet from the 3D extras is kept. It starts at the map's level when water is on, is saved in GLB as "water level N m OD" only when shown, and is never in STL.

**Test method.** River Avon by Durrington (SU 1490 4250, 51.18154, −1.78821, z16), in full screen. Raise the level from about 72 to 82 m OD: the floodplain should fill first and the readout should rise. Automated: `node tests/water.test.mjs <url>` (desktop, phone and CPU fallback, share-link round trip, 3D start level) and `node tests/view3d.test.mjs <url>`. Renders are in /workspace/lidar-cvat/water-2d/.
