// ---- Seabed fallback (live TEST, 15 Nov 2026, Tim pt2228u; added by gb/make_sw.mjs only for a GB config with a `seabed` block).
// Off the coast, where neither LiDAR nor GEM-15 has a pixel, a tile is filled from EMODnet Digital Bathymetry DTM 2024 (about 115 m
// cells, mean-sea-level heights, CC BY 4.0, not for navigation), pre-built as Terrarium WebP under seabed/{z}/{x}/{y}.webp at zoom
// 5-10 (index seabed/index.json, gb/make_seabed.py; only pixels that are at least partly sea, below +8 m MSL). Zoom 11-17 are the zoom
// 10 tile enlarged (bicubic, as GEM-15), so nothing finer than the 115 m source is pretended. Where an open high-resolution survey
// exists (seabed/mb/, zoom 12-15, index seabed/mb/index.json, gb/make_seabed_patch.py: the JNCC/Cefas 2 m Dogger Bank strips; UKHO
// surveys once downloaded) it is used instead of EMODnet. LiDAR and GEM-15 always come first: the seabed only fills empty pixels.
// Markers in the blue channel: EMODnet = 1 mod 4, multibeam patch = 3 mod 4 (LiDAR 0, GEM-15 2), so the page can tint the seabed,
// label it and keep it out of OD heights, profiles and the viewshed.
const SEA = (() => {
const C = 'seabed-tiles-v1', OUT = 'seabed-out-v1', MBZ = 15, SZ = 10;
const inner = typeof GEM !== 'undefined' ? GEM.route : route;
function jload(path) { let v = null, p = null, t = 0;
  return () => { if (v) return Promise.resolve(v);
    if (!p && Date.now() - t > 30000) { t = Date.now();
      p = fetch(new URL(path, self.registration.scope)).then(r => r.ok ? r.json() : null).then(j => {
        if (!j) return null; const s = {}; for (const z in j) if (Array.isArray(j[z])) s[z] = new Set(j[z]); else if (typeof j[z] === 'number') s[z] = j[z]; v = s; return s })
        .catch(() => null).finally(() => { p = null }) }
    return p || Promise.resolve(null) } }
const sIdx = jload('seabed/index.json'), mIdx = jload('seabed/mb/index.json');
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
  mem.set(k, p); while (mem.size > 32) mem.delete(mem.keys().next().value);
  return p;
}
// above the top zoom: the top tile enlarged, bicubic Catmull-Rom in height (bilinear next to no-data, nearest at a no-data edge), marker kept
const CR = t => { const t2 = t * t, t3 = t2 * t; return [(-t3 + 2 * t2 - t) / 2, (3 * t3 - 5 * t2 + 2) / 2, (-3 * t3 + 4 * t2 + t) / 2, (t3 - t2) / 2] };
async function data(dir, top, z, x, y) {
  if (z <= top) return get(dir, z, x, y);
  const d = z - top, s = 2 ** d, P = await get(dir, top, x >> d, y >> d); if (!P) return null;
  let MK = 1;
  for (let i = 0; i < 262144; i += 4) if (P[i + 3] >= 128) { MK = P[i + 2] & 3; break }
  const H = new Float32Array(65536); for (let i = 0; i < 65536; i++) H[i] = P[i * 4 + 3] < 128 ? NaN : P[i * 4] * 256 + P[i * 4 + 1] + (P[i * 4 + 2] & 252) / 256 - 32768;
  const ox = (x - ((x >> d) << d)) * 256 / s, oy = (y - ((y >> d) << d)) * 256 / s, out = new Uint8ClampedArray(65536 * 4); let any = false;
  const cl = k => k < 0 ? 0 : k > 255 ? 255 : k, CX = [], IX = new Int32Array(256), AX = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const u = Math.min(255, Math.max(0, ox + (i + 0.5) / s - 0.5)); IX[i] = Math.min(254, Math.floor(u)); AX[i] = u - IX[i]; CX[i] = CR(AX[i]) }
  for (let j = 0; j < 256; j++) { const v = Math.min(255, Math.max(0, oy + (j + 0.5) / s - 0.5)), iy = Math.min(254, Math.floor(v)), ay = v - iy, wy = CR(ay),
      r0 = cl(iy - 1) * 256, r1 = iy * 256, r2 = (iy + 1) * 256, r3 = cl(iy + 2) * 256;
    for (let i = 0; i < 256; i++) { const ix = IX[i], ax = AX[i], q = iy * 256 + ix;
      const h00 = H[q], h10 = H[q + 1], h01 = H[q + 256], h11 = H[q + 257];
      const wx = CX[i], c0 = cl(ix - 1), c3 = cl(ix + 2);
      const row = r => wx[0] * H[r + c0] + wx[1] * H[r + ix] + wx[2] * H[r + ix + 1] + wx[3] * H[r + c3];
      let h = wy[0] * row(r0) + wy[1] * row(r1) + wy[2] * row(r2) + wy[3] * row(r3);
      if (h !== h) h = (h00 * (1 - ax) + h10 * ax) * (1 - ay) + (h01 * (1 - ax) + h11 * ax) * ay;
      if (h !== h) { h = [h00, h10, h01, h11][(ay > 0.5 ? 2 : 0) + (ax > 0.5 ? 1 : 0)]; if (h !== h) continue }
      const vv = Math.round((h + 32768) * 64) / 64, vi = Math.floor(vv), o = (j * 256 + i) * 4;
      out[o] = vi >> 8; out[o + 1] = vi & 255; out[o + 2] = (Math.round((vv - vi) * 256) & 252) + MK; out[o + 3] = 255; any = true } }
  return any ? out : null;
}
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('seabed-out-') && k !== OUT).map(k => caches.delete(k)))).catch(() => {})));
async function seaRoute(z, x, y, ev) {
  if (z < 5 || z > 17) return inner(z, x, y, ev);
  const I = await sIdx(); if (!I || !hasZ(I, SZ, z, x, y)) return inner(z, x, y, ev);
  const ck = `https://seabed-out.invalid/v1/${z}/${x}/${y}.png`, oc = await caches.open(OUT), hit = await oc.match(ck);
  if (hit) return hit;
  const open = openSea(I, z, x, y), r = open ? none() : await inner(z, x, y, ev);   // open sea (no land within a zoom 10 tile): no LiDAR / GEM-15 to ask for
  if (r.status !== 404 && !r.ok) return r;               // busy (503): the page asks again
  let base = null, holes = 65536;
  if (r.ok) { try { base = await rgba(await r.clone().blob()) } catch (e) { return r }
    holes = 0; for (let i = 3; i < 262144; i += 4) if (base[i] < 128) holes++; if (!holes) return r }
  const M = z >= 12 ? await mIdx() : null, MZ = (M && M.maxz) || MBZ, m = M && hasZ(M, MZ, z, x, y) ? await data('seabed/mb/', MZ, z, x, y) : null;
  const s = await data('seabed/', SZ, z, x, y); if (!s && !m) return r;
  let n = 0; if (!base) base = new Uint8ClampedArray(262144);
  for (let i = 0; i < 262144; i += 4) if (base[i + 3] < 128) { const g = m && m[i + 3] >= 128 ? m : s && s[i + 3] >= 128 ? s : null;
    if (g) { base[i] = g[i]; base[i + 1] = g[i + 1]; base[i + 2] = g[i + 2]; base[i + 3] = 255; n++ } }
  if (!n) return r;
  const res = await png(base);
  if (!r.ok || z <= 10 || open) { try { await oc.put(ck, res.clone());   // only when the land part cannot change (no land tile, or the static overviews)
    if (Math.random() < 0.02) { const ks = await oc.keys(); if (ks.length > 3000) for (const q of ks.slice(0, ks.length - 3000)) await oc.delete(q) } } catch (e) {} }
  return res;
}
return { route: seaRoute };
})();
