# LiDAR Lens - Great Britain (production)
Worker `lidar-lens-gb` (https://lidar-lens-gb.tim-daw.workers.dev), viewer files under `gb/` in R2 bucket `lidar-lens-scotland`.
Relay `lidar-lens-gb-relay` (copy of relay/, allows lidar-lens-gb, lidarlens.sarsen.org). One-way tile cache (GET/HEAD only, Worker-built) under `gb-live-test/tc/w1/`, 100 GB cap, cron stats every 6 h.
lidarlens.sarsen.org (GitHub Pages) redirects here; the previous England & Wales site is tag `gh-pages-ew-20261104`.
`lidar-lens-scotland` redirects here (scotland-redirect/; upload route kept).

## Viewer source (live page, 8 Nov 2026)

The viewer that is deployed under `gb/` was recovered from `/workspace/lidar-scotland/live/viewer` (filesystem mtimes 6 Nov 2026, Europe/London; not by themselves proof of what was uploaded). Those non-minified files are now `site/index.html`, `site/lens.js`, `site/tools.js`, `site/ui.js`, `site/layers.js` and `scripts/build_site.mjs`. `site/live-sw.js`, `site/compat.js` and `site/models.js` were already the same bytes. The generated production service worker in that recovery (69,551 bytes, SHA-256 `7405d85b2454a5b1eb0f479ad34c65f426bb8a54626dd72feecf2a2016982a3d`) matches `https://lidarlens.sarsen.org/live-sw.js` and is produced from files already in this tree (`site/live-sw.js`, `gb/make_sw.py` substitutions, `gb/worker/src/scot-core.mjs` without its export line, `gb/scot-shell.js`, `gb/gb-route.js`).

`gb/config.js` is the config that is live (`assets/config.198ea3a0.js`). A candidate `gb-live-test.js` from the same recovery (SHA-256 `a02cae18df35d633340bf2b1aa30d298def06752d04c317e75a6c34adc3c7301`) was not used. Do not swap it in.

Rebuild (esbuild 0.28.2, already pinned in `package-lock.json`; an older ancestor lockfile from `/workspace/lidar-lens-public` pins the same esbuild and was not substituted):

```
npm ci
node scripts/build_site.mjs gb/config.js
```

That writes `dist/assets/app.2cac7a32.js`, `dist/assets/app.6c9e6941.css` and `dist/assets/compat.912d81c4.js`, byte-identical to the live site. `npm run check:gb-viewer` rebuilds in a temp directory and fails if those hashes change, if `gb/config.js` changes, or if `tidyUI`, `measureOnDemand`, `dtmGroundNote` or the Scotland Canmore path disappear. A failing check means this tree would not rebuild the viewer that is deployed. Do not upload that build.

One filename difference: the recipe names the config `assets/config.93c04c53.js` (SHA-256 prefix). The live `index.html` references `assets/config.198ea3a0.js`, the MD5 prefix of the same bytes. Upload helpers were not in the recovery, so the rename step is not in this repo. The config bytes match.

Recovered Worker and relay sources matched `gb/worker` and `gb/relay` already on main, so they were not copied again. Wrangler files from that recovery were not added: they are deploy configuration, `wrangler.jsonc` is gitignored, and this sync does not deploy. Wiltshire (`configs/wiltshire.js`, `https://lidar-lens-public.tim-daw.workers.dev/`) is unchanged. The "Look here up" Google link in `site/tools.js` is unchanged.
