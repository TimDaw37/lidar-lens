// Regression gate for the live Great Britain viewer.
// Building site/ with scripts/build_site.mjs and gb/config.js must reproduce the
// assets on https://lidarlens.sarsen.org (checked 8 Nov 2026):
//   assets/app.f072dc8d.js  (field mode, the phone-layout fix, the clicked-spot ring, the home-screen shortcut and the sky dome quote: trial on live-test 11 Nov 2026 (pt2094u), promoted with this commit;
//                            the main bundle changed only for layoutWatch in ui.js, the lensgoto event and the pin release in tools.js and setLensC in lens.js.
//                            Before that: app.4131826f.js, main 183c590 .. 4e5c38d.)
//   assets/app.6c9e6941.css
//   assets/compat.912d81c4.js
// The config file bytes must stay gb/config.js. The build names that copy
// assets/config.93c04c53.js (SHA-256 prefix). The page before 9 Nov 2026 asked for
// assets/config.198ea3a0.js (MD5 prefix of the same bytes). Since 9 Nov 2026 production serves the built config.93c04c53.js.
// Do not replace gb/config.js with configs that hash to a02cae18.
// Changing these expected hashes means the build is no longer the deployed viewer.
// Do not deploy that build unless a new deployment is intended.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const fail = m => { console.error(m); process.exit(1); };

const EXPECT = {
  'assets/app.f072dc8d.js': 'f072dc8d1440b7f13a64c13c41bd665d02a55d5bddd66986a7c2e98ed8749d33',
  'assets/app.6c9e6941.css': '6c9e6941eddcec400c0cd23d302cc71ee01e4e33a46c3416a2b05f7cc8db098f',
  'assets/compat.912d81c4.js': '912d81c41e1699925ff6e4861a318a4d7c89c21decb126ac4fd301da43c3452c',
};
const CONFIG_SHA = '93c04c532fac284fde98bb6853d1b1c0d5adafca5da76b8e3fcf3650f98de5c2';
const REJECTED_CANDIDATE_SHA = 'a02cae18df35d633340bf2b1aa30d298def06752d04c317e75a6c34adc3c7301';

function mustInclude(rel, needles) {
  const text = fs.readFileSync(path.join(root, rel), 'utf8');
  for (const n of needles) if (!text.includes(n)) fail(rel + ' is missing ' + JSON.stringify(n) + ' (older viewer source)');
}

mustInclude('site/tools.js', ['tidyUI', 'measureOnDemand', 'dtmGroundNote', 'loadCanmore', "udm=50", "LZ.country()==='scotland'"]);
mustInclude('site/ui.js', ['tidyUI', 'Background map']);
mustInclude('site/lens.js', ['tidyUI', 'countryText']);
mustInclude('site/layers.js', ['layerCountry', 'Historic Environment Scotland']);
mustInclude('scripts/build_site.mjs', ['noModels:true', "createHash('sha256')"]);
mustInclude('gb/config.js', ['tidyUI:true', 'measureOnDemand:true', 'dtmGroundNote:', 'canmore:', 'links:[]']);

const cfgBytes = fs.readFileSync(path.join(root, 'gb/config.js'));
const cfgSha = sha(cfgBytes);
if (cfgSha !== CONFIG_SHA) fail('gb/config.js sha256 ' + cfgSha + ' is not the live config ' + CONFIG_SHA);
if (cfgSha === REJECTED_CANDIDATE_SHA) fail('gb/config.js is the rejected candidate config');

const esbuildPkg = path.join(root, 'node_modules', 'esbuild', 'package.json');
if (!fs.existsSync(esbuildPkg)) fail('esbuild is not installed. From the repo root run: npm ci');
const esVer = JSON.parse(fs.readFileSync(esbuildPkg, 'utf8')).version;
if (esVer !== '0.28.2') fail('esbuild ' + esVer + ' is not 0.28.2, the version that reproduces the live bundle');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-viewer-'));
try {
  fs.cpSync(path.join(root, 'site'), path.join(tmp, 'site'), { recursive: true });
  fs.cpSync(path.join(root, 'scripts'), path.join(tmp, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'gb'));   // gb/config.js with what the build takes from gb/: make_sw.mjs (live-sw.js) and places.json
  for (const f of ['config.js', 'make_sw.mjs', 'places.json', 'scot-shell.js', 'gb-route.js']) fs.copyFileSync(path.join(root, 'gb', f), path.join(tmp, 'gb', f));
  fs.cpSync(path.join(root, 'gb', 'worker', 'src'), path.join(tmp, 'gb', 'worker', 'src'), { recursive: true });
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(tmp, 'node_modules'));
  const run = spawnSync(process.execPath, ['scripts/build_site.mjs', 'gb/config.js'], { cwd: tmp, encoding: 'utf8' });
  if (run.status !== 0) fail('build failed\n' + (run.stdout || '') + (run.stderr || ''));
  for (const [rel, expect] of Object.entries(EXPECT)) {
    const got = sha(fs.readFileSync(path.join(tmp, 'dist', rel)));
    if (got !== expect) fail(rel + ' sha256 ' + got + ' != live ' + expect);
  }
  const builtCfg = fs.readFileSync(path.join(tmp, 'dist', 'assets', 'config.93c04c53.js'));
  if (!builtCfg.equals(cfgBytes)) fail('built config bytes differ from gb/config.js');
  const html = fs.readFileSync(path.join(tmp, 'dist', 'index.html'), 'utf8');
  for (const name of ['assets/compat.912d81c4.js', 'assets/config.93c04c53.js', 'assets/app.f072dc8d.js', 'assets/app.6c9e6941.css']) {
    if (!html.includes(name)) fail('built index.html does not reference ' + name);
  }
  // 3D view: must stay a separate, additive script (the main bundle above must not change because of it)
  if (fs.existsSync(path.join(root, 'site', 'view3d.js'))) {
    const v = (html.match(/assets\/view3d\.[0-9a-f]{8}\.js/) || [])[0];
    if (!v) fail('built index.html does not load the 3D view (assets/view3d.*.js)');
    const vjs = fs.readFileSync(path.join(tmp, 'dist', v), 'utf8'), t = (vjs.match(/assets\/three3d\.[0-9a-f]{8}\.js/) || [])[0];
    if (!t || !fs.existsSync(path.join(tmp, 'dist', t))) fail('3D view does not point at a built assets/three3d.*.js');
    console.log('3D view is additive: ' + v + ' -> ' + t);
  }
  // Field mode: also a separate, additive script
  if (fs.existsSync(path.join(root, 'site', 'field.js'))) {
    const f = (html.match(/assets\/field\.[0-9a-f]{8}\.js/) || [])[0];
    if (!f || !fs.existsSync(path.join(tmp, 'dist', f))) fail('built index.html does not load field mode (assets/field.*.js)');
    console.log('field mode is additive: ' + f);
  }
  // the live-mode service worker and the monument names production serves at the site root (checked against the live files 10 Nov 2026)
  for (const [rel, expect] of [['live-sw.js', '7405d85b2454a5b1eb0f479ad34c65f426bb8a54626dd72feecf2a2016982a3d'], ['nhle_places.json', '5fdbbbbb43410fdbc3c44be935ce77d03e039f1e782cc0fc178884fe442d2911']]) {
    const got = sha(fs.readFileSync(path.join(tmp, 'dist', rel)));
    if (got !== expect) fail(rel + ' sha256 ' + got + ' != live ' + expect);
  }
  console.log('live-sw.js (gb/make_sw.mjs) and nhle_places.json (gb/places.json) match production');
  if (html.includes('config.198ea3a0.js')) fail('build renamed the config to the live MD5 filename; that step is not in this source');
  console.log('gb viewer source reproduces live app.f072dc8d.js, app.6c9e6941.css and compat.912d81c4.js');
  console.log('config bytes match gb/config.js; build filename is config.93c04c53.js (SHA-256), production serves this build as-is since 9 Nov 2026');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
