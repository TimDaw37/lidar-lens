// ---- GEM-15 fallback (added by gb/make_sw.mjs only for a GB config with a `fallback` block: production and live-test since 13 Nov 2026).
// Where no open LiDAR covers the ground (Scottish gaps, the Isle of Man, the Channel Islands) a tile is filled from Google's GEM-15
// bare-earth DTM (15 m, EGM96 heights, CC BY 4.0, experimental), pre-built as Terrarium WebP under gem15/{z}/{x}/{y}.webp at
// zoom 8-13 (index gem15/index.json). LiDAR always comes first: GEM-15 only fills a missing tile, or the empty pixels of a LiDAR
// tile with a sizeable hole (>= 1% of the tile); it never replaces a LiDAR pixel. Zoom 14-17 are the zoom 13 GEM-15 tile
// enlarged (bilinear), so nothing finer than the 15 m source is pretended. Every GEM-15 pixel carries a marker the page can read:
// blue channel = 2 mod 4 (LiDAR tiles are always 0 mod 4: 1/64 m steps); the 2/256 m (8 mm) it adds is far below GEM-15's error.
// The page is told ({fb:'z/x/y'}) when a tile holds GEM-15, so it can label the lens and keep GEM-15 out of height readings.
const GEM = (() => {
const C = 'gem15-tiles-v1', HOLE = 655;
const BOX = [[54.02, -4.88, 54.45, -4.28], [48.85, -2.80, 49.77, -1.85]];   // Isle of Man, Channel Islands: no open LiDAR at all
let idx = null, idxP = null, idxT = 0;
function load() {
  if (idx) return Promise.resolve(idx);
  if (!idxP && Date.now() - idxT > 30000) { idxT = Date.now();
    idxP = fetch(new URL('gem15/index.json', self.registration.scope)).then(r => r.ok ? r.json() : null).then(j => {
      if (!j) return null; const s = {}; for (const z in j) if (Array.isArray(j[z])) s[z] = new Set(j[z]); idx = s; return s })
      .catch(() => null).finally(() => { idxP = null }) }
  return idxP || Promise.resolve(null);
}
// Where GEM-15 may show (13 Nov 2026, Tim pt2180u / pt2182u): Scotland, the Isle of Man and the Channel Islands with their 12-nautical-
// mile territorial sea, split at the median line where Northern Ireland, Ireland, France, England or Wales is nearer (so none on those),
// plus the RAF Fylingdales gap in the EA LiDAR. gem15/mask-v1.json (gb/make_gem_mask.py, Natural Earth 10 m): a 0.004 x 0.006 degree
// lat/lng grid as run-length rows. Each tile is first classed from the grid (all in / all out / partial) and the class is remembered;
// only a partial tile is masked pixel by pixel (a table lookup). No mask, no GEM-15.
let MK = null, mkP = null; const tcls = new Map();
function mask() {
  if (MK) return Promise.resolve(MK);
  if (!mkP) mkP = fetch(new URL('gem15/mask-v1.json', self.registration.scope)).then(r => r.ok ? r.json() : null).then(j => {
    if (!j) { mkP = null; return null } const a = new Uint8Array(j.nr * j.nc);
    j.rows.forEach((r, i) => { for (let k = 0; k < r.length; k += 2) a.fill(1, i * j.nc + r[k], i * j.nc + r[k + 1]) });
    MK = { a, nr: j.nr, nc: j.nc, lat1: j.lat1, lng0: j.lng0, dlat: j.dlat, dlng: j.dlng }; return MK }).catch(() => { mkP = null; return null });
  return mkP;
}
const mRow = (M, la) => Math.floor((M.lat1 - la) / M.dlat), mCol = (M, lo) => Math.floor((lo - M.lng0) / M.dlng);
function tileClass(M, z, x, y) {   // 0 none, 1 all, 2 partial
  const k = z + '/' + x + '/' + y; let c = tcls.get(k); if (c !== undefined) return c;
  const n = 2 ** z, r0 = Math.max(0, mRow(M, tile2lat(y, n))), r1 = Math.min(M.nr - 1, mRow(M, tile2lat(y + 1, n))),
    c0 = Math.max(0, mCol(M, tile2lng(x, n))), c1 = Math.min(M.nc - 1, mCol(M, tile2lng(x + 1, n)));
  let on = 0, all = 0;
  if (r1 >= r0 && c1 >= c0) for (let r = r0; r <= r1; r++) { const o = r * M.nc; for (let q = c0; q <= c1; q++) { all++; on += M.a[o + q] } }
  c = !on ? 0 : on === all && mRow(M, tile2lat(y, n)) >= 0 && mRow(M, tile2lat(y + 1, n)) < M.nr ? 1 : 2;
  tcls.set(k, c); if (tcls.size > 20000) tcls.clear(); return c;
}
function clip(M, z, x, y, g) {
  const c = tileClass(M, z, x, y); if (c === 0) return null; if (c === 1) return g;
  const n = 2 ** z, out = new Uint8ClampedArray(g), ci = new Int32Array(256); let n2 = 0;
  for (let i = 0; i < 256; i++) { const q = mCol(M, tile2lng(x + (i + 0.5) / 256, n)); ci[i] = q >= 0 && q < M.nc ? q : -1 }
  for (let j = 0; j < 256; j++) { const r = mRow(M, tile2lat(y + (j + 0.5) / 256, n)), o = r * M.nc, ok = r >= 0 && r < M.nr;
    for (let i = 0; i < 256; i++) { const p = (j * 256 + i) * 4; if (out[p + 3] < 128) continue; if (ok && ci[i] >= 0 && M.a[o + ci[i]]) n2++; else out[p + 3] = 0 } }
  return n2 ? out : null;
}
function has(I, z, x, y) { if (z <= 13) return !!(I[z] && I[z].has(x + '_' + y)); const d = z - 13; return !!(I[13] && I[13].has((x >> d) + '_' + (y >> d))) }
function inBox(z, x, y) { const n = 2 ** z, la1 = tile2lat(y, n), la0 = tile2lat(y + 1, n), lo0 = tile2lng(x, n), lo1 = tile2lng(x + 1, n);
  return BOX.some(b => la0 >= b[0] && la1 <= b[2] && lo0 >= b[1] && lo1 <= b[3]) }
async function rgba(blob) {
  const bm = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const cv = new OffscreenCanvas(256, 256), g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(bm, 0, 0); if (bm.close) bm.close();
  return g.getImageData(0, 0, 256, 256).data;
}
async function png(px) { const cv = new OffscreenCanvas(256, 256); cv.getContext('2d').putImageData(new ImageData(px, 256, 256), 0, 0);
  return new Response(await cv.convertToBlob({ type: 'image/png' }), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400' } }) }
// one pre-built GEM-15 tile (zoom 8-13) as RGBA, kept in Cache Storage
const mem = new Map();
async function get(z, x, y) {
  const k = z + '/' + x + '/' + y; if (mem.has(k)) return mem.get(k);
  const p = (async () => {
    const u = new URL(`gem15/${z}/${x}/${y}.webp`, self.registration.scope).href, c = await caches.open(C);
    let r = await c.match(u);
    if (!r) { r = await fetch(u); if (!r.ok) return null; await c.put(u, r.clone());
      if (Math.random() < 0.02) { const ks = await c.keys(); if (ks.length > 4000) for (const q of ks.slice(0, ks.length - 4000)) await c.delete(q) } }
    return rgba(await r.blob());
  })().catch(() => { mem.delete(k); return null });
  mem.set(k, p); while (mem.size > 24) mem.delete(mem.keys().next().value);
  return p;
}
// zoom 14-17: the zoom 13 tile enlarged (bicubic Catmull-Rom in height, so the hillshade has no 11 m cell grid of creases as it had with
// bilinear; bilinear next to no-data, nearest at a no-data edge), re-encoded with the marker. Catmull-Rom passes through every zoom 13
// height, so GEM-15 estimates at the cell centres are unchanged (13 Nov 2026, after Bert Temme's bilinear hillshade post, Tim pt2197u)
const CR = t => { const t2 = t * t, t3 = t2 * t; return [(-t3 + 2 * t2 - t) / 2, (3 * t3 - 5 * t2 + 2) / 2, (-3 * t3 + 4 * t2 + t) / 2, (t3 - t2) / 2] };
async function tileData(z, x, y) {
  if (z <= 13) return get(z, x, y);
  const d = z - 13, s = 2 ** d, P = await get(13, x >> d, y >> d); if (!P) return null;
  const H = new Float32Array(65536); for (let i = 0; i < 65536; i++) H[i] = P[i * 4 + 3] < 128 ? NaN : P[i * 4] * 256 + P[i * 4 + 1] + P[i * 4 + 2] / 256 - 32768;
  const ox = (x - ((x >> d) << d)) * 256 / s, oy = (y - ((y >> d) << d)) * 256 / s, out = new Uint8ClampedArray(65536 * 4); let any = false;
  const cl = k => k < 0 ? 0 : k > 255 ? 255 : k, CX = [], IX = new Int32Array(256), AX = new Float32Array(256);   // per-column weights, once per tile
  for (let i = 0; i < 256; i++) { const u = Math.min(255, Math.max(0, ox + (i + 0.5) / s - 0.5)); IX[i] = Math.min(254, Math.floor(u)); AX[i] = u - IX[i]; CX[i] = CR(AX[i]) }
  for (let j = 0; j < 256; j++) { const v = Math.min(255, Math.max(0, oy + (j + 0.5) / s - 0.5)), iy = Math.min(254, Math.floor(v)), ay = v - iy, wy = CR(ay),
      r0 = cl(iy - 1) * 256, r1 = iy * 256, r2 = (iy + 1) * 256, r3 = cl(iy + 2) * 256;
    for (let i = 0; i < 256; i++) { const ix = IX[i], ax = AX[i], q = iy * 256 + ix;
      const h00 = H[q], h10 = H[q + 1], h01 = H[q + 256], h11 = H[q + 257];
      const wx = CX[i], c0 = cl(ix - 1), c3 = cl(ix + 2);
      const row = r => wx[0] * H[r + c0] + wx[1] * H[r + ix] + wx[2] * H[r + ix + 1] + wx[3] * H[r + c3];
      let h = wy[0] * row(r0) + wy[1] * row(r1) + wy[2] * row(r2) + wy[3] * row(r3);   // NaN if any of the 16 cells is no-data
      if (h !== h) h = (h00 * (1 - ax) + h10 * ax) * (1 - ay) + (h01 * (1 - ax) + h11 * ax) * ay;
      if (h !== h) { h = [h00, h10, h01, h11][(ay > 0.5 ? 2 : 0) + (ax > 0.5 ? 1 : 0)]; if (h !== h) continue }
      const vv = Math.round((h + 32768) * 64) / 64, vi = Math.floor(vv), o = (j * 256 + i) * 4;
      out[o] = vi >> 8; out[o + 1] = vi & 255; out[o + 2] = (Math.round((vv - vi) * 256) & 252) + 2; out[o + 3] = 255; any = true } }
  return any ? out : null;
}
// finished GEM-15 tiles are kept (Cache Storage, per mask version) when their LiDAR part cannot change: no LiDAR at all, a zoom 8-10
// overview, or the static Scottish overview (zoom 8-13, not a border tile with live England/Wales in it); so a second look costs a cache read, not a decode, mask and PNG encode
const OUT = 'gem15-out-v3';   // v3: bicubic zoom 14-17 (v2 tiles were bilinear)
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('gem15-out-') && k !== OUT).map(k => caches.delete(k)))).catch(() => {})));   // drop older finished-tile caches
async function fbRoute(z, x, y, ev) {
  if (z < 8 || z > 17) return route(z, x, y, ev);
  const [I, M] = await Promise.all([load(), mask()]); if (!I || !M || !has(I, z, x, y) || !tileClass(M, z, x, y)) return route(z, x, y, ev);
  const ck = `https://gem15-out.invalid/m1/${z}/${x}/${y}.png`, oc = await caches.open(OUT), hit = await oc.match(ck);
  if (hit) { tell({ fb: z + '/' + x + '/' + y }); return hit }
  const nob = inBox(z, x, y), r = nob ? none() : await route(z, x, y, ev);
  if (r.status !== 404 && !r.ok) return r;               // busy (503): the page asks again
  let base = null;
  if (r.ok) { try { base = await rgba(await r.clone().blob()) } catch (e) { return r }
    let holes = 0; for (let i = 3; i < 262144; i += 4) if (base[i] < 128) holes++; if (holes < HOLE) return r }
  const g0 = await tileData(z, x, y), g = g0 && clip(M, z, x, y, g0); if (!g) return r;
  let n = 0;
  if (base) { for (let i = 0; i < 262144; i += 4) if (base[i + 3] < 128 && g[i + 3] >= 128) { base[i] = g[i]; base[i + 1] = g[i + 1]; base[i + 2] = g[i + 2]; base[i + 3] = 255; n++ }
    if (n < HOLE) return r }
  else { for (let i = 3; i < 262144; i += 4) if (g[i] >= 128) n++; if (!n) return r; base = g }
  tell({ fb: z + '/' + x + '/' + y });
  const res = await png(base);
  const n2 = 2 ** z, still = !r.ok || z <= 10 || (z <= 13 && inScot(tile2lat(y + 0.5, n2), tile2lng(x + 0.5, n2)) && !(z >= 11 && typeof straddles === 'function' && straddles(z, x, y)));   // Scottish overview tiles (z8-13) are static too
  if (still) { try { await oc.put(ck, res.clone());
    if (Math.random() < 0.02) { const ks = await oc.keys(); if (ks.length > 3000) for (const q of ks.slice(0, ks.length - 3000)) await oc.delete(q) } } catch (e) {} }
  return res;
}
return { route: fbRoute };
})();
