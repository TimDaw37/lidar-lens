/* LiDAR Lens, live mode: a service worker that makes the viewer's tile and record files on demand from public
   sources, so a Lens can cover all of England with nothing built or uploaded. The viewer itself is unchanged: it
   asks for terrain/{z}/{x}/{y}.png and layers/... as usual, and this worker answers.

   terrain/{z}/{x}/{y}.png  Terrarium-encoded elevation for one web-mercator tile, resampled from Environment Agency
                            LiDAR Composite DTM 1 m (OGL) fetched by WCS in British National Grid blocks.
   layers/index.json        index of 5 km cells for 'What's here?' (all of England)
   layers/v2/rec/{cx}_{cy}.json  Historic England NHLE (scheduled monuments, listed buildings) and Aerial
                            Investigation & Mapping for one 5 km cell, queried live from HE's ArcGIS services (OGL).

   Everything fetched is kept in the browser's Cache Storage, so a place seen once comes back instantly.
   Be kind to the sources: blocks are shared between tiles, requests are de-duplicated and at most 4 run at once. */
'use strict';
const VER = 'v6';   // v2: drops v1 'What's here?' cells cached from a failed query; v3: 512 px blocks, size-capped caches; v4: blocks via the relay; v5: zeros are no data (drops black tiles made outside England); v6: Wales (drops LiDAR tiles and record cells made without it)
const BLOCKS = 'lens-live-blocks-' + VER, TILES = 'lens-live-tiles-' + VER, RECS = 'lens-live-recs-' + VER;
const MINZ = 13, MAXZ = 17;          // tiles below MINZ are not made (the EA hillshade map shows instead)
const BLOCK_PX = 512;                  // WCS block size in pixels; block side = BLOCK_PX * r metres (512: about 0.3-1 MB each)
const WCS = 'https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs?service=WCS&version=2.0.1' +
  '&request=GetCoverage&CoverageId=13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m&format=image/tiff&geotiff:compression=Deflate';
// Blocks come through the Lens's caching relay (relay/ in the repo), so a block one visitor has seen costs the EA nothing for
// the next; if the relay is down the worker goes to the EA directly. Both carry a client id so the EA can see who we are.
const RELAY = 'https://lidar-lens-england.tim-daw.workers.dev/wcs', CLIENT = '&client=lidar-lens-england';
// Wales: the Welsh Government LiDAR DTM 1 m (OGL) is one cloud-optimised GeoTIFF with no CORS, so it only comes through the
// relay (/wales, same blocks as /wcs; -9999 = no data). Blocks touching this box get both and are merged, Welsh data first:
// near the border the EA composite also covers parts of Wales, and preferring the Welsh survey puts the join at the border.
const RELAY_WALES = 'https://lidar-lens-england.tim-daw.workers.dev/wales', WALES = { e0: 164993, n0: 164000, e1: 356007, n1: 397000 };
const HE = 'https://services-eu1.arcgis.com/ZOdPfBS3aqqDYPUQ/arcgis/rest/services/';
const NHLE = HE + 'National_Heritage_List_for_England_NHLE_v02_VIEW/FeatureServer/', AIM = HE + 'HE_AIM_data/FeatureServer/';
// Wales: Cadw (scheduled monuments, listed buildings) and the RCAHMW's National Monuments Record of Wales (Coflein), all OGL,
// from the DataMapWales WFS, which answers bounding-box queries in British National Grid with open CORS
const DMW = 'https://datamap.gov.wales/geoserver/ows', CADW_REPORT = 'https://cadwpublic-api.azurewebsites.net/reports/';
const ENG = { e0: 80000, n0: 0, e1: 660000, n1: 660000 }, CELL = 5000, BUF = 200;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('lens-live-') && !k.endsWith(VER)) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  let m;
  if ((m = u.pathname.match(/\/terrain\/(\d+)\/(\d+)\/(\d+)\.(png|webp)$/))) e.respondWith(tile(+m[1], +m[2], +m[3]));
  else if (u.pathname.endsWith('/layers/index.json')) e.respondWith(json(index()));
  else if ((m = u.pathname.match(/\/layers\/v2\/rec\/(-?\d+)_(-?\d+)\.json$/))) e.respondWith(recCell(+m[1], +m[2]));
});
const json = o => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } });
const none = () => new Response(null, { status: 404 });

// ---------------------------------------------------------------- WGS84 -> British National Grid
// 7-parameter Helmert + Transverse Mercator, refined by the OSTN15 correction grid (data/ostn_grid.json) as in tools.js.
const D2R = Math.PI / 180, WGS = { a: 6378137, b: 6356752.314245 }, AIRY = { a: 6377563.396, b: 6356256.909 };
const H = { tx: -446.448, ty: 125.157, tz: -542.060, s: 20.4894, rx: -0.1502, ry: -0.2470, rz: -0.8421 };
const F0 = 0.9996012717, LAT0 = 49 * D2R, LNG0 = -2 * D2R, E0 = 400000, N0 = -100000;
function toCart(lat, lng, e) { const f = lat * D2R, l = lng * D2R, e2 = 1 - e.b * e.b / (e.a * e.a), nu = e.a / Math.sqrt(1 - e2 * Math.sin(f) ** 2);
  return [nu * Math.cos(f) * Math.cos(l), nu * Math.cos(f) * Math.sin(l), nu * (1 - e2) * Math.sin(f)] }
function fromCart(x, y, z, e) { const e2 = 1 - e.b * e.b / (e.a * e.a), p = Math.hypot(x, y); let f = Math.atan2(z, p * (1 - e2));
  for (let i = 0; i < 6; i++) { const nu = e.a / Math.sqrt(1 - e2 * Math.sin(f) ** 2); f = Math.atan2(z + e2 * nu * Math.sin(f), p) } return [f / D2R, Math.atan2(y, x) / D2R] }
function helm([x, y, z]) { const s = 1 + H.s * 1e-6, k = D2R / 3600, rx = H.rx * k, ry = H.ry * k, rz = H.rz * k;
  return [H.tx + x * s - y * rz + z * ry, H.ty + x * rz + y * s - z * rx, H.tz - x * ry + y * rx + z * s] }
function tmM(f, a, b) { const n = (a - b) / (a + b), n2 = n * n, n3 = n2 * n; return b * F0 * ((1 + n + 1.25 * n2 + 1.25 * n3) * (f - LAT0) - (3 * n + 3 * n2 + 21 / 8 * n3) * Math.sin(f - LAT0) * Math.cos(f + LAT0) + (15 / 8 * n2 + 15 / 8 * n3) * Math.sin(2 * (f - LAT0)) * Math.cos(2 * (f + LAT0)) - 35 / 24 * n3 * Math.sin(3 * (f - LAT0)) * Math.cos(3 * (f + LAT0))) }
function tmFwd(lat, lng) { const { a, b } = AIRY, f = lat * D2R, l = lng * D2R, e2 = 1 - b * b / (a * a), sf = Math.sin(f), cf = Math.cos(f), tf = Math.tan(f);
  const nu = a * F0 / Math.sqrt(1 - e2 * sf * sf), rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * sf * sf, 1.5), eta2 = nu / rho - 1, M = tmM(f, a, b);
  const I = M + N0, II = nu / 2 * sf * cf, III = nu / 24 * sf * cf ** 3 * (5 - tf * tf + 9 * eta2), IIIA = nu / 720 * sf * cf ** 5 * (61 - 58 * tf * tf + tf ** 4), IV = nu * cf, V = nu / 6 * cf ** 3 * (nu / rho - tf * tf), VI = nu / 120 * cf ** 5 * (5 - 18 * tf * tf + tf ** 4 + 14 * eta2 - 58 * tf * tf * eta2);
  const dl = l - LNG0; return [E0 + IV * dl + V * dl ** 3 + VI * dl ** 5, I + II * dl * dl + III * dl ** 4 + IIIA * dl ** 6] }
let OG = null, ogP = null;
function loadGrid() { if (!ogP) ogP = fetch(new URL('data/ostn_grid.json', self.registration.scope)).then(r => r.ok ? r.json() : null).then(g => { if (g && g.enc === 'cm-delta') for (const k of ['de', 'dn']) { let v = 0; g[k] = g[k].map(d => (v += d) / 100) } OG = g }).catch(() => {}); return ogP }
function corr(lat, lng) { if (!OG) return [0, 0]; const fy = (lat - OG.lat0) / OG.step, fx = (lng - OG.lng0) / OG.step; if (fy < 0 || fx < 0 || fy > OG.nlat - 1 || fx > OG.nlng - 1) return [0, 0];
  const i = Math.min(OG.nlat - 2, Math.floor(fy)), j = Math.min(OG.nlng - 2, Math.floor(fx)), ty = fy - i, tx = fx - j, k = i * OG.nlng + j, bl = a => (a[k] * (1 - tx) + a[k + 1] * tx) * (1 - ty) + (a[k + OG.nlng] * (1 - tx) + a[k + OG.nlng + 1] * tx) * ty; return [bl(OG.de), bl(OG.dn)] }
function ll2en(lat, lng) { const c = helm(toCart(lat, lng, WGS)), [la, lo] = fromCart(c[0], c[1], c[2], AIRY), [E, N] = tmFwd(la, lo), d = corr(lat, lng); return [E + d[0], N + d[1]] }
const tile2lng = (x, n) => x / n * 360 - 180, tile2lat = (y, n) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) / D2R;

// ---------------------------------------------------------------- fetching, with a small queue
// At most 4 requests at once. A 429 or 503 (the source is busy) pauses the whole queue for Retry-After (or 2, 4, 8 s)
// and retries that request up to 3 times, so a busy EA or HE service is not hammered.
// Two lanes, LiDAR blocks and Historic England records, so a 'What's here?' click never waits behind a lens full of LiDAR.
const LANES = { lidar: { active: 0, pauseUntil: 0, queue: [] }, rec: { active: 0, pauseUntil: 0, queue: [] } };
function limited(fn, lane = 'lidar') { return new Promise((res, rej) => { LANES[lane].queue.push([fn, res, rej, 0]); pump(lane) }) }
function pump(lane) {
  const Q = LANES[lane], queue = Q.queue;
  const wait = Q.pauseUntil - Date.now(); if (wait > 0) { setTimeout(() => pump(lane), wait); return }
  while (Q.active < 4 && queue.length) { const job = queue.shift(), [fn, res, rej, tries] = job; Q.active++;
    fn().then(r => {
      if (r && (r.status === 429 || r.status === 503) && tries < 3) {
        const ra = +(r.headers.get('Retry-After') || 0), ms = Math.min(30000, ra > 0 ? ra * 1000 : 2000 * 2 ** tries);
        Q.pauseUntil = Math.max(Q.pauseUntil, Date.now() + ms); job[3] = tries + 1; queue.unshift(job);
      } else res(r);
    }, rej).finally(() => { Q.active--; pump(lane) }) }
}
async function cached(cacheName, url, init) {
  const c = await caches.open(cacheName), hit = await c.match(url);
  if (hit) { touch(c, url, hit.clone()); return hit }
  const r = await limited(() => fetch(url, init));
  if (r.ok) await putSized(cacheName, c, url, r.clone());
  return r;
}

// ---------------------------------------------------------------- size cap (least recently used goes first)
// Cache Storage has no size limit of its own, so each entry carries its size (x-bytes) and the caches are trimmed
// to about 300 MB in all. Cache keys come back oldest first; a hit is re-stored to make it the newest.
const CAP = { [BLOCKS]: 240e6, [TILES]: 50e6, [RECS]: 10e6 };
async function putSized(name, c, key, res) {
  const buf = await res.arrayBuffer(), h = new Headers(res.headers); h.set('x-bytes', String(buf.byteLength));
  await c.put(key, new Response(buf, { status: res.status, headers: h })); trimSoon(name);
}
function touch(c, key, res) { c.delete(key).then(() => c.put(key, res)).catch(() => {}) }
const trimT = {};
function trimSoon(name) { clearTimeout(trimT[name]); trimT[name] = setTimeout(() => trim(name).catch(() => {}), 2000) }
async function trim(name) {
  const c = await caches.open(name), keys = await c.keys(), sz = [];
  let total = 0;
  for (const k of keys) { const r = await c.match(k), n = r ? +(r.headers.get('x-bytes') || 0) : 0; sz.push(n); total += n }
  for (let i = 0; i < keys.length && total > CAP[name]; i++) { await c.delete(keys[i]); total -= sz[i] }
}

// ---------------------------------------------------------------- GeoTIFF (as the EA serves it) -> Float32Array
async function inflate(u8) { const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate')); return new Uint8Array(await new Response(s).arrayBuffer()) }
async function readTiff(buf) {
  const dv = new DataView(buf), le = dv.getUint16(0) === 0x4949, u16 = o => dv.getUint16(o, le), u32 = o => dv.getUint32(o, le);
  if (u16(2) !== 42) throw new Error('not a classic TIFF');
  const ifd = u32(4), n = u16(ifd), T = {}, size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8, 16: 8 };
  for (let i = 0; i < n; i++) {
    const o = ifd + 2 + i * 12, tag = u16(o), type = u16(o + 2), cnt = u32(o + 4), sz = (size[type] || 1) * cnt, at = sz <= 4 ? o + 8 : u32(o + 8);
    const rd = k => type === 3 ? u16(at + 2 * k) : type === 4 ? u32(at + 4 * k) : type === 12 ? dv.getFloat64(at + 8 * k, le) : dv.getUint8(at + k);
    if ([256, 257, 258, 259, 273, 277, 278, 279, 317, 322, 323, 324, 325, 339].includes(tag)) T[tag] = Array.from({ length: cnt }, (_, k) => rd(k));
  }
  const W = T[256][0], Hh = T[257][0], comp = (T[259] || [1])[0], pred = (T[317] || [1])[0];
  if (T[258] && T[258][0] !== 32) throw new Error('expected 32-bit samples');
  if (pred !== 1) throw new Error('predictor not supported');
  const out = new Float32Array(W * Hh).fill(NaN);
  const tiled = !!T[322], tw = tiled ? T[322][0] : W, th = tiled ? T[323][0] : (T[278] || [Hh])[0];
  const offs = tiled ? T[324] : T[273], cnts = tiled ? T[325] : T[279], across = Math.ceil(W / tw);
  for (let k = 0; k < offs.length; k++) {
    let bytes = new Uint8Array(buf, offs[k], cnts[k]);
    if (comp === 8 || comp === 32946) bytes = await inflate(bytes); else if (comp !== 1) throw new Error('compression ' + comp);
    const bd = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), tx = (k % across) * tw, ty = Math.floor(k / across) * th;
    const rows = Math.min(th, bytes.byteLength / 4 / tw);
    for (let y = 0; y < rows; y++) { const Y = ty + y; if (Y >= Hh) break;
      for (let x = 0; x < tw; x++) { const X = tx + x; if (X >= W) break; out[Y * W + X] = bd.getFloat32((y * tw + x) * 4, le) } }
  }
  return { W, H: Hh, data: out };
}

// ---------------------------------------------------------------- BNG blocks: BLOCK_PX x BLOCK_PX at r metres, 1-px margin
const mem = new Map();   // decoded blocks, least recently used first
const FAIL = { fail: true };   // a block whose source could not be fetched (as opposed to null: fetched, and no data there)
function block(r, bx, by) {
  const key = r + '/' + bx + '/' + by;
  if (mem.has(key)) { const p = mem.get(key); mem.delete(key); mem.set(key, p); return p }
  const S = BLOCK_PX * r, x0 = bx * S - r, x1 = bx * S + S + r, y0 = by * S - r, y1 = by * S + S + r;
  const url = `${RELAY}?r=${r}&bx=${bx}&by=${by}`, direct = WCS + `&subset=E(${x0},${x1})&subset=N(${y0},${y1})` + (r > 1 ? `&SCALEFACTOR=${1 / r}` : '') + CLIENT;
  const viaRelay = cached(BLOCKS, url).then(res => res.ok || res.status === 429 || res.headers.get('X-Upstream') ? res : Promise.reject(new Error('relay ' + res.status)));
  const decode = zeroIsNoData => async res => {
    if (!res.ok) return FAIL;
    const t = await readTiff(await res.arrayBuffer());
    // EA nodata is -3.4e38 inside its survey, but outside it (Wales, Scotland, the sea) the WCS sends 0.0: treat both as no data
    let any = false;
    for (let i = 0; i < t.data.length; i++) { const v = t.data[i]; if (!(v > -1000) || (zeroIsNoData && v === 0)) t.data[i] = NaN; else any = true }
    return any ? { ...t, x0, yTop: y1, r } : null;
  };
  const ea = viaRelay.catch(() => cached(BLOCKS, direct)).then(decode(true)).catch(() => FAIL);
  const inWales = x1 > WALES.e0 && x0 < WALES.e1 && y1 > WALES.n0 && y0 < WALES.n1;
  const both = !inWales ? ea : Promise.all([ea, cached(BLOCKS, `${RELAY_WALES}?r=${r}&bx=${bx}&by=${by}`).then(decode(false)).catch(() => FAIL)]).then(([e, w]) => {
    const failed = e === FAIL || w === FAIL; if (e === FAIL) e = null; if (w === FAIL) w = null;
    if (w && e) for (let i = 0; i < w.data.length; i++) if (w.data[i] === w.data[i]) e.data[i] = w.data[i];
    const b = w && e ? e : w || e;
    return failed ? { partial: true, b } : b;
  });
  // a source that failed (busy, down) must not be remembered: drop it here, and tile() will not store a tile made without it
  const p = both.then(v => { if (v === FAIL || (v && v.partial)) { if (mem.get(key) === p) mem.delete(key) } return v });
  mem.set(key, p);
  while (mem.size > 10) mem.delete(mem.keys().next().value);
  return p;
}

// ---------------------------------------------------------------- one web-mercator tile, Terrarium PNG
async function tile(z, x, y) {
  if (z < MINZ || z > MAXZ) return none();
  const c = await caches.open(TILES), key = new Request(`https://lens-live.invalid/${VER}/${z}/${x}/${y}.png`), hit = await c.match(key);
  if (hit) { touch(c, key, hit.clone()); return hit }
  await loadGrid();
  const n = 2 ** z, G = 16;                       // exact transform on a 17x17 lattice, bilinear between
  const LE = new Float64Array((G + 1) ** 2), LN = new Float64Array((G + 1) ** 2);
  for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) { const [E, N] = ll2en(tile2lat(y + j / G, n), tile2lng(x + i / G, n)); LE[j * (G + 1) + i] = E; LN[j * (G + 1) + i] = N }
  const lat = tile2lat(y + 0.5, n), mpp = 156543.03392 * Math.cos(lat * D2R) / n;
  const r = Math.max(1, Math.min(64, 2 ** Math.round(Math.log2(mpp)))), S = BLOCK_PX * r;
  const eMin = Math.min(...LE), eMax = Math.max(...LE), nMin = Math.min(...LN), nMax = Math.max(...LN);
  if (eMax < ENG.e0 || eMin > ENG.e1 || nMax < ENG.n0 || nMin > ENG.n1) return none();
  const blocks = new Map(), jobs = [];
  for (let bx = Math.floor(eMin / S); bx <= Math.floor(eMax / S); bx++) for (let by = Math.floor(nMin / S); by <= Math.floor(nMax / S); by++)
    jobs.push(block(r, bx, by).then(b => blocks.set(bx + '/' + by, b)));
  await Promise.all(jobs);
  let partial = false;
  for (const [k, b] of blocks) if (b === FAIL || (b && b.partial)) { partial = true; blocks.set(k, b === FAIL ? null : b.b) }
  if (![...blocks.values()].some(Boolean)) return none();
  const img = new ImageData(256, 256), px = img.data; let any = false;
  for (let py = 0; py < 256; py++) {
    const gy = (py + 0.5) / 256 * G, j = Math.min(G - 1, Math.floor(gy)), ty = gy - j;
    for (let pxl = 0; pxl < 256; pxl++) {
      const gx = (pxl + 0.5) / 256 * G, i = Math.min(G - 1, Math.floor(gx)), tx = gx - i, k = j * (G + 1) + i;
      const bl = A => (A[k] * (1 - tx) + A[k + 1] * tx) * (1 - ty) + (A[k + G + 1] * (1 - tx) + A[k + G + 2] * tx) * ty;
      const E = bl(LE), N = bl(LN), b = blocks.get(Math.floor(E / S) + '/' + Math.floor(N / S));
      const o = (py * 256 + pxl) * 4; if (!b) continue;
      const fx = (E - b.x0) / r - 0.5, fy = (b.yTop - N) / r - 0.5, ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy;
      if (ix < 0 || iy < 0 || ix + 1 >= b.W || iy + 1 >= b.H) continue;
      const d = b.data, q = iy * b.W + ix, h00 = d[q], h10 = d[q + 1], h01 = d[q + b.W], h11 = d[q + b.W + 1];
      let h;
      if (h00 === h00 && h10 === h10 && h01 === h01 && h11 === h11) h = (h00 * (1 - ax) + h10 * ax) * (1 - ay) + (h01 * (1 - ax) + h11 * ax) * ay;
      else { h = [h00, h10, h01, h11][(ay > 0.5 ? 2 : 0) + (ax > 0.5 ? 1 : 0)]; if (h !== h) continue }
      const v = Math.round((h + 32768) * 64) / 64, vi = Math.floor(v);
      px[o] = vi >> 8; px[o + 1] = vi & 255; px[o + 2] = Math.round((v - vi) * 256) & 255; px[o + 3] = 255; any = true;
    }
  }
  if (!any) return none();
  const cv = new OffscreenCanvas(256, 256); cv.getContext('2d').putImageData(img, 0, 0);
  const res = new Response(await cv.convertToBlob({ type: 'image/png' }), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400' } });
  if (!partial) await putSized(TILES, c, key, res.clone());   // incomplete: show it, but make it afresh next time
  return res;
}

// ---------------------------------------------------------------- 'What's here?' records, live from Historic England
function index() {
  const keys = [];
  for (let cx = Math.floor(ENG.e0 / CELL); cx <= Math.floor(ENG.e1 / CELL); cx++) for (let cy = Math.floor(ENG.n0 / CELL); cy <= Math.floor(ENG.n1 / CELL); cy++) keys.push(cx + '_' + cy);
  return { crs: 'EPSG:27700', cell: CELL, buf: BUF, layers: { rec: keys }, built: 'live',
    sources: { NHLE: 'Historic England NHLE, queried live (OGL)', LB: 'Historic England NHLE listed buildings, queried live (OGL)', AIM: 'Historic England Aerial Investigation & Mapping, queried live (OGL)',
      CADW: 'Cadw scheduled monuments, queried live (OGL)', CADWLB: 'Cadw listed buildings, queried live (OGL)', NMRW: 'National Monuments Record of Wales (RCAHMW, Coflein), queried live (OGL)' } };
}
const rd1 = v => Math.round(v * 10) / 10, ring = cs => cs.map(p => [rd1(p[0]), rd1(p[1])]);
function enc(g) {
  if (!g) return null;
  if (g.type === 'Point') return ['P', [rd1(g.coordinates[0]), rd1(g.coordinates[1])]];
  if (g.type === 'MultiPoint') return ['P', [rd1(g.coordinates[0][0]), rd1(g.coordinates[0][1])]];
  if (g.type === 'LineString') return ['L', [ring(g.coordinates)]];
  if (g.type === 'MultiLineString') return ['L', g.coordinates.map(ring)];
  if (g.type === 'Polygon') return ['A', [g.coordinates.map(ring)]];
  if (g.type === 'MultiPolygon') return ['A', g.coordinates.map(p => p.map(ring))];
  return null;
}
async function query(layerUrl, fields, x0, y0, x1, y1) {
  const out = []; let off = 0;
  for (let page = 0; page < 10; page++) {
    const q = new URLSearchParams({ where: '1=1', geometry: `${x0},${y0},${x1},${y1}`, geometryType: 'esriGeometryEnvelope', inSR: 27700, outSR: 27700,
      spatialRel: 'esriSpatialRelIntersects', outFields: fields, returnGeometry: true, maxAllowableOffset: 0.5, f: 'geojson', resultOffset: off, resultRecordCount: 2000 });
    const r = await limited(() => fetch(layerUrl + '/query?' + q), 'rec');
    if (!r.ok) throw new Error('HE ' + r.status);
    const j = await r.json(), fs = j.features || [];
    if (j.error) throw new Error('HE ' + (j.error.code || 'error'));
    out.push(...fs); off += fs.length;
    if (fs.length < 2000) break;
  }
  return out;
}
const clean = s => (s == null ? '' : String(s)).trim(), title = s => clean(s).replace(/\\/g, ', ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
// Only a complete answer is cached: if any of the queries fails, say so (503) and try again next time
async function recCell(cx, cy) {
  try { return await recCell1(cx, cy) } catch (e) {
    return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '30' } });
  }
}
async function wfs(typeName, x0, y0, x1, y1) {
  const q = new URLSearchParams({ service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: typeName, outputFormat: 'application/json',
    srsName: 'EPSG:27700', bbox: `${x0},${y0},${x1},${y1},EPSG:27700`, count: 10000 });
  const r = await limited(() => fetch(DMW + '?' + q), 'rec');
  if (!r.ok) throw new Error('DataMapWales ' + r.status);
  const j = await r.json();
  return j.features || [];
}
async function recCell1(cx, cy) {
  const url = `https://lens-live.invalid/${VER}/rec/${cx}_${cy}.json`, c = await caches.open(RECS), hit = await c.match(url);
  if (hit) return hit;
  const x0 = cx * CELL - BUF, y0 = cy * CELL - BUF, x1 = cx * CELL + CELL + BUF, y1 = cy * CELL + CELL + BUF;
  const inWales = x1 > WALES.e0 && x0 < WALES.e1 && y1 > WALES.n0 && y0 < WALES.n1;
  const walesP = inWales ? Promise.all([wfs('inspire-wg:Cadw_SAM', x0, y0, x1, y1), wfs('inspire-wg:Cadw_ListedBuildings', x0, y0, x1, y1),
    wfs('geonode:rcahmw_nmrw_terrestrialsites_rcahmw_bng', x0, y0, x1, y1)]) : Promise.resolve([[], [], []]);
  walesP.catch(() => {});   // awaited below; this only stops an early failure being reported as unhandled
  const [sched, listed, aimD, aimE] = await Promise.all([
    query(NHLE + 6, 'ListEntry,Name,hyperlink', x0, y0, x1, y1),
    query(NHLE + 0, 'ListEntry,Name,Grade,hyperlink', x0, y0, x1, y1),
    query(AIM + 0, 'HE_UID,MONUMENT_TYPE,PERIOD,HE_URL1,project,LAYER', x0, y0, x1, y1),
    query(AIM + 1, 'HE_UID,HE_URL1,project', x0, y0, x1, y1)]);
  const [wSam, wLb, wNmr] = await walesP;
  const f = [], add = (g, p) => { const e = enc(g); if (e) f.push({ ...p, g: e }) };
  for (const x of wSam) { const p = x.properties; add(x.geometry, { s: 'CADW', id: clean(p.SAMNumber), n: clean(p.Name), t: 'Scheduled monument' + (clean(p.SiteType) ? ': ' + clean(p.SiteType).toLowerCase() : ''), p: clean(p.Period), d: '', u: p.RecordNumber ? CADW_REPORT + 'sam/FullReport?lang=en&id=' + encodeURIComponent(clean(p.RecordNumber)) : '' }) }
  for (const x of wLb) { const p = x.properties; add(x.geometry, { s: 'CADWLB', id: clean(p.RecordNumber), n: clean(p.Name), t: 'Listed building, grade ' + clean(p.Grade), p: '', d: '', u: p.RecordNumber ? CADW_REPORT + 'listedbuilding/FullReport?lang=en&id=' + encodeURIComponent(clean(p.RecordNumber)) : '' }) }
  for (const x of wNmr) { const p = x.properties, ty = title(p.site_type); const nm = clean(p.name).split(';').map(s => s.trim()).filter(Boolean);   // Coflein lists alternative names with ';'
    add(x.geometry, { s: 'NMRW', id: clean(p.nprn), n: nm[0] || ty, t: ty + (nm.length > 1 ? ' (also ' + nm.slice(1).join('; ') + ')' : ''), p: clean(p.period), d: '', u: clean(p.url) || (p.nprn ? 'https://coflein.gov.uk/en/site/' + clean(p.nprn) : '') }) }
  for (const x of sched) { const p = x.properties; add(x.geometry, { s: 'NHLE', id: String(p.ListEntry), n: clean(p.Name), t: 'Scheduled monument', p: '', d: '', u: clean(p.hyperlink) }) }
  for (const x of listed) { const p = x.properties; add(x.geometry, { s: 'LB', id: String(p.ListEntry), n: clean(p.Name), t: 'Listed building, grade ' + clean(p.Grade), p: '', d: '', u: clean(p.hyperlink) }) }
  const meta = {};
  for (const x of aimD) { const p = x.properties, uid = clean(p.HE_UID); if (uid && !meta[uid]) meta[uid] = [title(p.MONUMENT_TYPE), title(p.PERIOD), clean(p.HE_URL1), clean(p.project)];
    const m = meta[uid] || ['', '', '', ''];
    add(x.geometry, { s: 'AIM', id: uid, n: m[0] ? m[0].split(',')[0] : 'AIM feature', t: m[0], p: m[1], d: 'Mapped ' + clean(p.LAYER).toLowerCase() + ' (' + m[3] + ' NMP project)', u: m[2] }) }
  for (const x of aimE) { const p = x.properties, uid = clean(p.HE_UID), m = meta[uid] || ['', '', '', ''];
    add(x.geometry, { s: 'AIM', id: uid, n: m[0] ? m[0].split(',')[0] : 'AIM monument extent', t: m[0], p: m[1], d: 'Monument extent (' + clean(p.project) + ')', u: clean(p.HE_URL1) || m[2] }) }
  const res = json({ f });
  await putSized(RECS, c, url, res.clone());
  return res;
}
