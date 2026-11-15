// ---- Seabed fallback (live TEST, 15 Nov 2026, Tim pt2228u; added by gb/make_sw.mjs only for a GB config with a `seabed` block).
// Off the coast, where neither LiDAR nor GEM-15 has a pixel, a tile is filled from EMODnet Digital Bathymetry DTM 2024 (about 115 m
// cells, mean-sea-level heights, CC BY 4.0, not for navigation), pre-built as Terrarium WebP under seabed/{z}/{x}/{y}.webp at zoom
// 5-10 (index seabed/index.json, gb/make_seabed.py; only pixels that are at least partly sea, below +8 m MSL). Zoom 11-17 are the zoom
// 10 tile enlarged (bicubic, as GEM-15), so nothing finer than the 115 m source is pretended. Where an open high-resolution survey
// exists (seabed/mb/, zoom 12-15, index seabed/mb/index.json, gb/make_seabed_patch.py: the JNCC/Cefas 2 m Dogger Bank strips; UKHO
// surveys once downloaded) it is used instead of EMODnet. LiDAR and GEM-15 always come first: the seabed only fills empty pixels.
// Markers in the blue channel: EMODnet = 1 mod 4, multibeam patch = 3 mod 4 (LiDAR 0, GEM-15 2), so the page can tint the seabed,
// label it and keep it out of OD heights, profiles and the viewshed.
// Coastline mask (15 Nov 2026, Tim's steer after t2241u: "coastline defined explicitly, no LiDAR beyond it"): the EA and Welsh LiDAR
// blocks ran out over the sea as flat water surfaces and survey flight-line dots. LiDAR and GEM-15 are now kept only on land, as given
// by OS Boundary-Line mean high water (OGL) in Great Britain and the OpenStreetMap land polygons (ODbL) elsewhere (Isle of Man, Channel
// Islands), baked into coastmask2/ (gb/make_coastmask.py, packed by
// gb/pack_coastmask.py): 8-bit land coverage for the tiles the coast crosses, zoom 14 detail (about 6 m), land where coverage >= 50 %. Beyond the
// coastline the seabed is drawn instead (or nothing, where the seabed model has no pixel); inside it, LiDAR holes are left empty.
// Islands (Lundy, Flat Holm, Steep Holm...) are land polygons and keep their LiDAR. Tiles of the open sea do not ask for LiDAR at all.
const SEA = (() => {
const C = 'seabed-tiles-v1', CM = 'seabed-mask-v3', OUT = 'seabed-out-v6', MBZ = 15, SZ = 10;   // CM v3: mask rebuilt 15 Nov 2026 (Isle of Man, then south Cornwall / Beauly Firth fix), older mask copies in C dropped on activate
const inner = typeof GEM !== 'undefined' ? GEM.route : route;
function jload(path) { let v = null, p = null, t = 0;
  return () => { if (v) return Promise.resolve(v);
    if (!p && Date.now() - t > 30000) { t = Date.now();
      p = fetch(new URL(path, self.registration.scope)).then(r => r.ok ? r.json() : null).then(j => {
        if (!j) return null; const s = {}; for (const z in j) if (Array.isArray(j[z])) s[z] = new Set(j[z]); else if (typeof j[z] === 'number') s[z] = j[z]; v = s; return s })
        .catch(() => null).finally(() => { p = null }) }
    return p || Promise.resolve(null) } }
const sIdx = jload('seabed/index.json'), mIdx = jload('seabed/mb/index.json');
let cmV = null, cmP = null, cmT = 0;   // coastline mask index: {b10: Set, m: {z: Set}, l: {z: Set}, top, maxz}
function cIdx() { if (cmV) return Promise.resolve(cmV);
  if (!cmP && Date.now() - cmT > 30000) { cmT = Date.now();
    cmP = fetch(new URL('coastmask2/index.json', self.registration.scope)).then(r => r.ok ? r.json() : null).then(j => { if (!j) return null;
      const S = a => new Set(a || []), o = { b10: S(j.b10), m: {}, l: {}, top: j.top || 5, maxz: j.maxz || 14 };
      for (const z in j.m) o.m[z] = S(j.m[z]); for (const z in j.l) o.l[z] = S(j.l[z]); cmV = o; return o }).catch(() => null).finally(() => { cmP = null }) }
  return cmP || Promise.resolve(null) }
// 'land' | 'sea' | 'mixed' | null (no mask built here: behave as before, seabed only in the LiDAR holes)
function coastClass(C, z, x, y) {
  if (!C) return null;
  if (z >= 10) { const d = z - 10; if (!C.b10.has((x >> d) + '_' + (y >> d))) return null }
  const zz = Math.min(z, C.maxz);
  for (let k = C.top; k <= zz; k++) { const d = z - k, key = (x >> d) + '_' + (y >> d);
    if (C.m[k] && C.m[k].has(key)) continue; if (C.l[k] && C.l[k].has(key)) return 'land'; return z < 10 && k === C.top ? null : 'sea' }
  return 'mixed' }
const cmem = new Map();   // decoded mask tiles: zoom 5-10 single 256 px tiles, zoom 11-14 one 2048 px pack per zoom 11 tile (gb/pack_coastmask.py)
function cget(z, x, y, n) { const k = z + '/' + x + '/' + y; if (cmem.has(k)) return cmem.get(k);
  const p = (async () => { const u = new URL(`coastmask2/${z}/${x}/${y}.png`, self.registration.scope).href, c = await caches.open(CM);
    let r = await c.match(u); if (!r) { r = await fetch(u); if (!r.ok) return null; await c.put(u, r.clone()) }
    const bm = await createImageBitmap(await r.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const cv = new OffscreenCanvas(n, n), g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(bm, 0, 0); if (bm.close) bm.close();
    const d = g.getImageData(0, 0, n, n).data, m = new Uint8Array(n * n); for (let i = 0; i < n * n; i++) m[i] = d[i * 4]; return m })().catch(() => { cmem.delete(k); return null });
  cmem.set(k, p); while (cmem.size > 12) cmem.delete(cmem.keys().next().value); return p }
// land (1) / sea (0) for each pixel of a tile the coast crosses: coverage >= 50 %, box-averaged from the zoom 14 pack at zoom 11-13,
// taken as it is at zoom 14 and bilinear at zoom 15-17
async function landMask(C, z, x, y) {
  const o = new Uint8Array(65536);
  if (z <= 10) { const m = await cget(z, x, y, 256); if (!m) return null; for (let i = 0; i < 65536; i++) o[i] = m[i] >= 128 ? 1 : 0; return o }
  const d = z - 11, A = await cget(11, x >> d, y >> d, 2048); if (!A) return null;
  const sz = 2048 / 2 ** d, f = sz / 256, ox = (x - ((x >> d) << d)) * sz, oy = (y - ((y >> d) << d)) * sz;
  if (f >= 1) { const t = f * f * 127.5;
    for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) { let s = 0; const r0 = (oy + j * f) * 2048 + ox + i * f;
      for (let b = 0; b < f; b++) { const r = r0 + b * 2048; for (let a = 0; a < f; a++) s += A[r + a] } o[j * 256 + i] = s >= t ? 1 : 0 }
    return o }
  for (let j = 0; j < 256; j++) { const v = Math.min(2047, Math.max(0, oy + (j + 0.5) * f - 0.5)), iy = Math.min(2046, Math.floor(v)), ay = v - iy;
    for (let i = 0; i < 256; i++) { const u = Math.min(2047, Math.max(0, ox + (i + 0.5) * f - 0.5)), ix = Math.min(2046, Math.floor(u)), ax = u - ix, q = iy * 2048 + ix;
      o[j * 256 + i] = ((A[q] * (1 - ax) + A[q + 1] * ax) * (1 - ay) + (A[q + 2048] * (1 - ax) + A[q + 2049] * ax) * ay) >= 127.5 ? 1 : 0 } }
  return o }
function hasZ(I, top, z, x, y) { if (!I) return false; if (z <= top) return !!(I[z] && I[z].has(x + '_' + y)); const d = z - top; return !!(I[top] && I[top].has((x >> d) + '_' + (y >> d))) }
function openSea(I, z, x, y) { if (!I || !I.open10) return false; if (z >= SZ) { const d = z - SZ; return I.open10.has((x >> d) + '_' + (y >> d)) }
  const d = SZ - z, n = 1 << d; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (!I.open10.has(((x << d) + i) + '_' + ((y << d) + j))) return false; return true }
async function rgba(blob) {
  const bm = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const cv = new OffscreenCanvas(256, 256), g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(bm, 0, 0); if (bm.close) bm.close();
  return g.getImageData(0, 0, 256, 256).data;
}
async function png(px) { const cv = new OffscreenCanvas(256, 256); cv.getContext('2d').putImageData(new ImageData(px, 256, 256), 0, 0);
  return new Response(await cv.convertToBlob({ type: 'image/png' }), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400', 'X-Seabed': '1' } }) }
const mem = new Map();
function get(dir, z, x, y) {
  const k = dir + z + '/' + x + '/' + y; if (mem.has(k)) return mem.get(k);
  const p = (async () => {
    const u = new URL(`${dir}${z}/${x}/${y}.webp`, self.registration.scope).href, c = await caches.open(C);
    let r = await c.match(u);
    if (!r) { r = await fetch(u); if (!r.ok) return null; await c.put(u, r.clone());
      if (Math.random() < 0.02) { const ks = await c.keys(); if (ks.length > 4000) for (const q of ks.slice(0, ks.length - 4000)) await c.delete(q) } }
    return rgba(await r.blob());
  })().catch(() => { mem.delete(k); return null });
  mem.set(k, p); while (mem.size > 64) mem.delete(mem.keys().next().value);
  return p;
}
// above the top zoom: the top tile enlarged, bicubic Catmull-Rom in height, marker kept. The 8 neighbouring top tiles supply a 2-cell
// border so there is no crease at the top tiles' edges, and no-data cells next to the seabed (land, islands) get the mean of their
// seabed neighbours, three rings out (fix 15 Nov 2026). Pixels next to a real seabed cell get alpha 255; pixels that only reach the
// extrapolated rings get alpha 254, used only beyond the coastline mask (so the seabed meets the coast without gaps).
const CR = t => { const t2 = t * t, t3 = t2 * t; return [(-t3 + 2 * t2 - t) / 2, (3 * t3 - 5 * t2 + 2) / 2, (-3 * t3 + 4 * t2 + t) / 2, (t3 - t2) / 2] };
async function data(dir, top, z, x, y) {
  if (z <= top) return get(dir, z, x, y);
  const d = z - top, s = 2 ** d, X = x >> d, Y = y >> d, P = await get(dir, top, X, Y); if (!P) return null;
  const NB = await Promise.all([-1, 0, 1].flatMap(dy => [-1, 0, 1].map(dx => dx || dy ? get(dir, top, X + dx, Y + dy) : Promise.resolve(P))));
  let MK = 1;
  for (let i = 0; i < 262144; i += 4) if (P[i + 3] >= 128) { MK = P[i + 2] & 3; break }
  const W = 262, B = 3, H = new Float32Array(W * W).fill(NaN), V = new Uint8Array(W * W);
  for (let j = -B; j < 256 + B; j++) for (let i = -B; i < 256 + B; i++) {
    const tx = i < 0 ? 0 : i > 255 ? 2 : 1, ty = j < 0 ? 0 : j > 255 ? 2 : 1, T = NB[ty * 3 + tx]; if (!T) continue;
    const o = (((j + 256) & 255) * 256 + ((i + 256) & 255)) * 4; if (T[o + 3] < 128) continue;
    const k = (j + B) * W + i + B; H[k] = T[o] * 256 + T[o + 1] + (T[o + 2] & 252) / 256 - 32768; V[k] = 1 }
  for (let ring = 0; ring < 3; ring++) { const G = H.slice();
    for (let yy = 0; yy < W; yy++) for (let xx = 0; xx < W; xx++) { const k = yy * W + xx; if (H[k] === H[k]) continue; let sum = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) { const y2 = yy + dy; if (y2 < 0 || y2 >= W) continue; for (let dx = -1; dx <= 1; dx++) { const x2 = xx + dx; if (x2 < 0 || x2 >= W) continue;
        const v = H[y2 * W + x2]; if (v === v) { sum += v; c++ } } }
      if (c) G[k] = sum / c }
    H.set(G) }
  const ox = (x - (X << d)) * 256 / s, oy = (y - (Y << d)) * 256 / s, out = new Uint8ClampedArray(65536 * 4); let any = false;
  const IX = new Int32Array(256), AX = new Float32Array(256), CX = [];
  for (let i = 0; i < 256; i++) { const u = ox + (i + 0.5) / s - 0.5; IX[i] = Math.floor(u); AX[i] = u - IX[i]; CX[i] = CR(AX[i]) }
  for (let j = 0; j < 256; j++) { const v = oy + (j + 0.5) / s - 0.5, iy = Math.floor(v), ay = v - iy, wy = CR(ay), r1 = (iy + B) * W + B;
    for (let i = 0; i < 256; i++) { const ix = IX[i], ax = AX[i], q = r1 + ix;
      const h00 = H[q], h10 = H[q + 1], h01 = H[q + W], h11 = H[q + W + 1]; if (h00 !== h00 && h10 !== h10 && h01 !== h01 && h11 !== h11) continue;
      const real = V[q] || V[q + 1] || V[q + W] || V[q + W + 1], wx = CX[i];
      const row = r => wx[0] * H[r - 1] + wx[1] * H[r] + wx[2] * H[r + 1] + wx[3] * H[r + 2];
      let h = wy[0] * row(q - W) + wy[1] * row(q) + wy[2] * row(q + W) + wy[3] * row(q + 2 * W);
      if (h !== h) h = (h00 * (1 - ax) + h10 * ax) * (1 - ay) + (h01 * (1 - ax) + h11 * ax) * ay;
      if (h !== h) { h = [h00, h10, h01, h11][(ay > 0.5 ? 2 : 0) + (ax > 0.5 ? 1 : 0)]; if (h !== h) continue }
      const vv = Math.round((h + 32768) * 64) / 64, vi = Math.floor(vv), o = (j * 256 + i) * 4;
      out[o] = vi >> 8; out[o + 1] = vi & 255; out[o + 2] = (Math.round((vv - vi) * 256) & 252) + MK; out[o + 3] = real ? 255 : 254; any = true } }
  return any ? out : null;
}
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all([...ks.filter(k => (k.startsWith('seabed-out-') && k !== OUT) || (k.startsWith('seabed-mask-') && k !== CM)).map(k => caches.delete(k)),
  caches.open(C).then(c => c.keys().then(rs => Promise.all(rs.filter(r => r.url.includes('/coastmask')).map(r => c.delete(r)))))])).catch(() => {})));   // drop older finished tiles and mask copies
async function seaRoute(z, x, y, ev) {
  if (z < 5 || z > 17) return inner(z, x, y, ev);
  const I = await sIdx(); if (!I || !hasZ(I, SZ, z, x, y)) return inner(z, x, y, ev);
  const ck = `https://seabed-out.invalid/v1/${z}/${x}/${y}.png`, oc = await caches.open(OUT), hit = await oc.match(ck);
  if (hit) return hit;
  const CI = await cIdx(), cls = coastClass(CI, z, x, y), LM = cls === 'mixed' ? await landMask(CI, z, x, y) : null;
  const nocache = cls === 'mixed' && !LM;   // mask tile not loaded (network): this once, seabed only in the LiDAR holes, not cached
  if (cls === 'land') return inner(z, x, y, ev);                          // all land: LiDAR as it is
  const open = openSea(I, z, x, y) || cls === 'sea', r = open ? none() : await inner(z, x, y, ev);   // open sea / beyond the coast: no LiDAR asked for
  if (r.status !== 404 && !r.ok) return r;               // busy (503): the page asks again
  let base = null;
  if (r.ok) { try { base = await rgba(await r.clone().blob()) } catch (e) { return r } }
  if (base && LM) for (let k = 0; k < 65536; k++) if (!LM[k]) base[k * 4 + 3] = 0;   // no LiDAR / GEM-15 beyond the coastline
  const M = z >= 12 ? await mIdx() : null, MZ = (M && M.maxz) || MBZ, m = M && hasZ(M, MZ, z, x, y) ? await data('seabed/mb/', MZ, z, x, y) : null;
  const s = await data('seabed/', SZ, z, x, y);
  if (!base) base = new Uint8ClampedArray(262144);
  let n = 0;
  const ext = !!LM || cls === 'sea' || open;   // beyond the coastline: the extrapolated seabed rings (alpha 254) may be used too
  const ok = (g, i) => g && (g[i + 3] === 255 || (ext && g[i + 3] === 254));
  if (s || m) for (let i = 0; i < 262144; i += 4) if (base[i + 3] < 128 && (!LM || !LM[i >> 2])) { const g = ok(m, i) ? m : ok(s, i) ? s : null;
    if (g) { base[i] = g[i]; base[i + 1] = g[i + 1]; base[i + 2] = g[i + 2]; base[i + 3] = 255; n++ } }
  if (!n && !LM) return r;
  if (!n && LM) { let a = 0; for (let i = 3; i < 262144; i += 4) if (base[i] >= 128) { a = 1; break } if (!a) return none() }
  const res = await png(base);
  if (!nocache && (!r.ok || z <= 10 || open)) { try { await oc.put(ck, res.clone());   // only when the land part cannot change (no land tile, or the static overviews)
    if (Math.random() < 0.02) { const ks = await oc.keys(); if (ks.length > 3000) for (const q of ks.slice(0, ks.length - 3000)) await oc.delete(q) } } catch (e) {} }
  return res;
}
return { route: seaRoute };
})();
