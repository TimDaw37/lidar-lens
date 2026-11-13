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
// zoom 14-17: the zoom 13 tile enlarged (bilinear in height; nearest at a no-data edge), re-encoded with the marker
async function tileData(z, x, y) {
  if (z <= 13) return get(z, x, y);
  const d = z - 13, s = 2 ** d, P = await get(13, x >> d, y >> d); if (!P) return null;
  const H = new Float32Array(65536); for (let i = 0; i < 65536; i++) H[i] = P[i * 4 + 3] < 128 ? NaN : P[i * 4] * 256 + P[i * 4 + 1] + P[i * 4 + 2] / 256 - 32768;
  const ox = (x - ((x >> d) << d)) * 256 / s, oy = (y - ((y >> d) << d)) * 256 / s, out = new Uint8ClampedArray(65536 * 4); let any = false;
  for (let j = 0; j < 256; j++) { const v = Math.min(255, Math.max(0, oy + (j + 0.5) / s - 0.5)), iy = Math.min(254, Math.floor(v)), ay = v - iy;
    for (let i = 0; i < 256; i++) { const u = Math.min(255, Math.max(0, ox + (i + 0.5) / s - 0.5)), ix = Math.min(254, Math.floor(u)), ax = u - ix, q = iy * 256 + ix;
      const h00 = H[q], h10 = H[q + 1], h01 = H[q + 256], h11 = H[q + 257];
      let h = (h00 * (1 - ax) + h10 * ax) * (1 - ay) + (h01 * (1 - ax) + h11 * ax) * ay;
      if (h !== h) { h = [h00, h10, h01, h11][(ay > 0.5 ? 2 : 0) + (ax > 0.5 ? 1 : 0)]; if (h !== h) continue }
      const vv = Math.round((h + 32768) * 64) / 64, vi = Math.floor(vv), o = (j * 256 + i) * 4;
      out[o] = vi >> 8; out[o + 1] = vi & 255; out[o + 2] = (Math.round((vv - vi) * 256) & 252) + 2; out[o + 3] = 255; any = true } }
  return any ? out : null;
}
async function fbRoute(z, x, y, ev) {
  if (z < 8 || z > 17) return route(z, x, y, ev);
  const I = await load(); if (!I || !has(I, z, x, y)) return route(z, x, y, ev);
  const r = inBox(z, x, y) ? none() : await route(z, x, y, ev);
  if (r.status !== 404 && !r.ok) return r;               // busy (503): the page asks again
  let base = null;
  if (r.ok) { try { base = await rgba(await r.clone().blob()) } catch (e) { return r }
    let holes = 0; for (let i = 3; i < 262144; i += 4) if (base[i] < 128) holes++; if (holes < HOLE) return r }
  const g = await tileData(z, x, y); if (!g) return r;
  let n = 0;
  if (base) { for (let i = 0; i < 262144; i += 4) if (base[i + 3] < 128 && g[i + 3] >= 128) { base[i] = g[i]; base[i + 1] = g[i + 1]; base[i + 2] = g[i + 2]; base[i + 3] = 255; n++ }
    if (n < HOLE) return r }
  else { for (let i = 3; i < 262144; i += 4) if (g[i] >= 128) n++; if (!n) return r; base = g }
  tell({ fb: z + '/' + x + '/' + y });
  return png(base);
}
return { route: fbRoute };
})();
