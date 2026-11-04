// ---- LiDAR Lens Scotland, live: core (shared by the service worker and the Node tests). Scotland only.
// Reads the Scottish Remote Sensing Portal DTM GeoTIFFs (public S3, open CORS) by HTTP range requests and makes a
// 256 px web-mercator tile of heights: best survey first (data/index.json priority order), blended over 30 m where surveys meet, sea-masked by a smoothly sampled land + 30 m mask.
const SCOT = { range: null, base: '', idx: null, chunks: new Map(), metas: new Map(), tiles: new Map(), TILE_CAP: 260 };
function scotInit(o) { Object.assign(SCOT, o) }

// TIFF LZW (MSB-first, 9-12 bit codes, early change)
function lzw(src, outLen) {
  const out = new Uint8Array(outLen); let op = 0, bitPos = 0, nbits = 9, next = 258, prev = -1;
  const pre = new Int32Array(4096), suf = new Uint8Array(4096), len = new Uint16Array(4096), first = new Uint8Array(4096);
  for (let i = 0; i < 256; i++) { pre[i] = -1; suf[i] = i; len[i] = 1; first[i] = i }
  const total = src.length * 8;
  const write = c => { const L = len[c]; if (op + L > outLen) { let k = c, l = L; while (l > 0) { if (op + l - 1 < outLen) out[op + l - 1] = suf[k]; k = pre[k]; l-- } op += L; return }
    let k = c; for (let i = L - 1; i >= 0; i--) { out[op + i] = suf[k]; k = pre[k] } op += L };
  while (bitPos + nbits <= total && op < outLen) {
    const bp = bitPos >> 3, sh = bitPos & 7;
    const w = (src[bp] << 16) | ((src[bp + 1] || 0) << 8) | (src[bp + 2] || 0);
    const code = (w >> (24 - sh - nbits)) & ((1 << nbits) - 1); bitPos += nbits;
    if (code === 257) break;
    if (code === 256) { nbits = 9; next = 258; prev = -1; continue }
    if (prev < 0) { write(code); prev = code; continue }
    let fc;
    if (code < next) { fc = first[code]; write(code) }
    else { fc = first[prev]; const L = len[prev]; let k = prev; const s = op; for (let i = L - 1; i >= 0; i--) { if (s + i < outLen) out[s + i] = suf[k]; k = pre[k] } op += L; if (op < outLen) out[op] = fc; op++ }
    if (next < 4096) { pre[next] = prev; suf[next] = fc; len[next] = len[prev] + 1; first[next] = first[prev]; next++ }
    if (next + 1 >= (1 << nbits) && nbits < 12) nbits++;
    prev = code;
  }
  return out;
}

// ---- GeoTIFF layout from the first 64 KB (more if an IFD lies beyond)
async function meta(url) {
  if (SCOT.metas.has(url)) return SCOT.metas.get(url);
  const p = (async () => {
    let buf = await SCOT.range(url, 0, 65536);
    const need = async (o, n) => { if (o + n > buf.length) { const more = await SCOT.range(url, buf.length, Math.max(o + n - buf.length, 65536)); const b = new Uint8Array(buf.length + more.length); b.set(buf); b.set(more, buf.length); buf = b } };
    const dv0 = () => new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let dv = dv0(); const le = dv.getUint16(0) === 0x4949;
    if (dv.getUint16(2, le) !== 42) throw new Error('not a classic TIFF');
    const SZ = { 1: 1, 2: 1, 3: 2, 4: 4, 11: 4, 12: 8, 16: 8 };
    let off = dv.getUint32(4, le), geo = null; const levels = [];
    while (off) {
      await need(off, 2); dv = dv0(); const n = dv.getUint16(off, le); await need(off, 2 + n * 12 + 4); dv = dv0();
      const T = {};
      for (let i = 0; i < n; i++) {
        const e = off + 2 + i * 12, tag = dv.getUint16(e, le), typ = dv.getUint16(e + 2, le), cnt = dv.getUint32(e + 4, le);
        const inline = (SZ[typ] || 1) * cnt <= 4, at = inline ? e + 8 : dv.getUint32(e + 8, le);
        T[tag] = { typ, cnt, at };
      }
      const v = (tag, k = 0) => { const t = T[tag]; if (!t) return undefined; return t.typ === 3 ? dv.getUint16(t.at + 2 * k, le) : t.typ === 4 ? dv.getUint32(t.at + 4 * k, le) : t.typ === 12 ? dv.getFloat64(t.at + 8 * k, le) : dv.getUint8(t.at + k) };
      const sub = v(254) || 0;
      if (!geo) {
        for (const tg of [33550, 33922, 42113]) if (T[tg] && !((SZ[T[tg].typ] || 1) * T[tg].cnt <= 4)) await need(T[tg].at, (SZ[T[tg].typ] || 1) * T[tg].cnt);
        dv = dv0();
        let nd = null; if (T[42113]) { let s = ''; for (let k = 0; k < T[42113].cnt; k++) { const c = dv.getUint8(T[42113].at + k); if (c) s += String.fromCharCode(c) } nd = parseFloat(s) }
        geo = { sx: v(33550, 0), sy: v(33550, 1), X0: v(33922, 3), Y0: v(33922, 4), nd, le };
      }
      if (!(sub & 4)) {
        const tiled = !!T[322], L = { W: v(256), H: v(257), comp: v(259) || 1, pred: v(317) || 1, bits: v(258) || 32, tiled };
        L.tw = tiled ? v(322) : L.W; L.th = tiled ? v(323) : (v(278) || L.H);
        L.offs = T[tiled ? 324 : 273]; L.cnts = T[tiled ? 325 : 279]; L.across = Math.ceil(L.W / L.tw);
        if (L.bits === 32 && L.pred === 1 && (L.comp === 1 || L.comp === 5)) levels.push(L);
      }
      await need(off + 2 + n * 12, 4); dv = dv0(); off = dv.getUint32(off + 2 + n * 12, le);
    }
    const L0 = levels[0], extW = L0.W * geo.sx, extH = L0.H * geo.sy;
    for (const L of levels) { L.px = extW / L.W; L.py = extH / L.H }
    return { url, le: geo.le, nd: geo.nd, X0: geo.X0, Y0: geo.Y0, X1: geo.X0 + extW, Y1: geo.Y0 - extH, levels, head: buf };
  })();
  SCOT.metas.set(url, p); p.catch(() => SCOT.metas.delete(url));
  if (SCOT.metas.size > 400) SCOT.metas.delete(SCOT.metas.keys().next().value);
  return p;
}
async function entries(M, arr, i0, n) {
  const w = arr.typ === 3 ? 2 : 4, a = arr.at + i0 * w, len = n * w;
  const b = a + len <= M.head.length ? M.head.subarray(a, a + len) : await SCOT.range(M.url, a, len);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return Array.from({ length: n }, (_, k) => w === 2 ? dv.getUint16(k * 2, M.le) : dv.getUint32(k * 4, M.le));
}
// one internal tile (or a run of strip rows) as Float32Array, NaN = no data; cached
function cleanF32(u8, M, n) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), out = new Float32Array(n), nd = M.nd;
  const m = Math.min(n, u8.byteLength >> 2);
  for (let i = 0; i < m; i++) { const v = dv.getFloat32(i * 4, M.le); out[i] = (v === nd || !(v > -1000) || v > 5000) ? NaN : v }
  for (let i = m; i < n; i++) out[i] = NaN;
  return out;
}
function tcacheGet(k) { const v = SCOT.tiles.get(k); if (v) { SCOT.tiles.delete(k); SCOT.tiles.set(k, v) } return v }
function tcacheSet(k, v) { SCOT.tiles.set(k, v); while (SCOT.tiles.size > SCOT.TILE_CAP) SCOT.tiles.delete(SCOT.tiles.keys().next().value) }
// window [c0,c1) x [r0,r1) of level L -> { get(c, r) } reading only the internal tiles needed
async function window_(M, li, c0, r0, c1, r1, stats) {
  const L = M.levels[li], parts = new Map();
  if (L.tiled) {
    const tc0 = Math.floor(c0 / L.tw), tc1 = Math.floor((c1 - 1) / L.tw), tr0 = Math.floor(r0 / L.th), tr1 = Math.floor((r1 - 1) / L.th), nc = tc1 - tc0 + 1;
    await Promise.all(Array.from({ length: tr1 - tr0 + 1 }, async (_, q) => {
      const tr = tr0 + q, want = [];
      for (let tc = tc0; tc <= tc1; tc++) { const k = M.url + '|' + li + '|' + tr + '|' + tc, hit = tcacheGet(k); if (hit) parts.set(tr + '/' + tc, hit); else want.push(tc) }
      if (!want.length) return;
      const i0 = tr * L.across + want[0], n = want[want.length - 1] - want[0] + 1;
      const [offs, cnts] = await Promise.all([entries(M, L.offs, i0, n), entries(M, L.cnts, i0, n)]);
      const have = want.map(tc => ({ tc, o: offs[tc - want[0]], n: cnts[tc - want[0]] })).filter(t => t.o && t.n);
      if (!have.length) return;
      const a = Math.min(...have.map(t => t.o)), z = Math.max(...have.map(t => t.o + t.n)), sum = have.reduce((s, t) => s + t.n, 0);
      const spans = z - a <= sum * 1.5 + 65536 ? [[a, z, have]] : have.map(t => [t.o, t.o + t.n, [t]]);
      await Promise.all(spans.map(async ([s, e, ts]) => {
        const buf = await SCOT.range(M.url, s, e - s); if (stats) stats.bytes += e - s;
        for (const t of ts) {
          let u = buf.subarray(t.o - s, t.o - s + t.n);
          if (L.comp === 5) u = lzw(u, L.tw * L.th * 4);
          const f = cleanF32(u, M, L.tw * L.th); parts.set(tr + '/' + t.tc, f); tcacheSet(M.url + '|' + li + '|' + tr + '|' + t.tc, f);
        }
      }));
    }));
    return { get(c, r) { const tc = Math.floor(c / L.tw), tr = Math.floor(r / L.th), t = parts.get(tr + '/' + tc); return t ? t[(r - tr * L.th) * L.tw + (c - tc * L.tw)] : NaN } };
  }
  // strips (uncompressed, as the HES 2017 and OIC files): rows r0..r1, one read
  if (L.comp !== 1) return null;
  const rps = L.th, s0 = Math.floor(r0 / rps), s1 = Math.floor((r1 - 1) / rps);
  const offs = await entries(M, L.offs, s0, s1 - s0 + 1), cnts = await entries(M, L.cnts, s0, s1 - s0 + 1);
  // strips need not be stored in order (some OIC files are not): read the span once and place each strip by its row
  let a = Infinity, z = 0; for (let k = 0; k < offs.length; k++) { a = Math.min(a, offs[k]); z = Math.max(z, offs[k] + cnts[k]) }
  if (!(z > a) || z - a > 24e6) return null;               // too much for one tile: skip this survey here
  const k = M.url + '|s|' + s0 + '|' + s1; let f = tcacheGet(k);
  if (!f) { const buf = await SCOT.range(M.url, a, z - a); if (stats) stats.bytes += z - a; const per = rps * L.W;
    f = new Float32Array(offs.length * per).fill(NaN);
    for (let q = 0; q < offs.length; q++) { const n = Math.min(per, cnts[q] >> 2); if (n > 0) f.set(cleanF32(buf.subarray(offs[q] - a, offs[q] - a + n * 4), M, n), q * per) }
    tcacheSet(k, f) }
  const rowBase = s0 * rps, W = L.W;
  return { get(c, r) { const i = (r - rowBase) * W + c; return i >= 0 && i < f.length ? f[i] : NaN } };
}

// ---- chunks (10 km): needed product ids (best survey first) and the land + 30 m mask at 10 m
async function chunk(cx, cy) {
  const key = cx + '_' + cy;
  if (!SCOT.idx.has.has(key)) return null;
  if (SCOT.chunks.has(key)) return SCOT.chunks.get(key);
  const p = SCOT.getChunk(key).then(async j => {
    const dec = async m => m === 1 ? null : await SCOT.inflate(Uint8Array.from(atob(m), c => c.charCodeAt(0)));
    // m: land + 300 m (outer limit); c: land + 30 m (core). Between the two only ground above 0 m OD is kept (beaches, not the sea surface)
    return { p: j.p, mask: await dec(j.m), core: j.c === 0 ? 'none' : await dec(j.c === undefined ? j.m : j.c) };
  });
  SCOT.chunks.set(key, p); p.catch(() => SCOT.chunks.delete(key));
  if (SCOT.chunks.size > 64) SCOT.chunks.delete(SCOT.chunks.keys().next().value);
  return p;
}

// ---- land mask, sampled smoothly: bilinear over the 10 m cells (across chunk edges), so the coast is a smooth curve at z16-17
// instead of 10 m steps. Kept where the value is >= MASK_T (< 0.5 = grown a few metres seaward, so beaches are not trimmed).
// Chunks without a mask (m:1) are all land; chunks not in the index are sea. The DTMs' own no-data does the rest.
const MASK_T = 0.2, SEA_Z = 0; let CORE = false;
function maskCell(CH, C, MR, MN, gx, gy) {        // gx, gy: global 10 m cell (gy counts down from the top of chunk row)
  const cx = Math.floor(gx / MN), cyTop = Math.floor(gy / MN), c = CH.get(cx + '_' + (-cyTop - 1));
  if (c === undefined || c === null) return 0; const mk = CORE ? c.core : c.mask; if (mk === 'none') return 0; if (!mk) return 1;
  const col = gx - cx * MN, row = gy - cyTop * MN, b = row * MN + col; return (mk[b >> 3] & (128 >> (b & 7))) ? 1 : 0;
}
// mask values on the 10 m cell grid covering the tile (+3 cells), then sampled blurred + bilinear from that array (fast)
function maskGrid(CH, C, MR, MN, e0, e1, n0, n1) {
  const gx0 = Math.floor(e0 / MR) - 3, gx1 = Math.ceil(e1 / MR) + 3, gy0 = Math.floor(-n1 / MR) - 3, gy1 = Math.ceil(-n0 / MR) + 3, W = gx1 - gx0 + 1, H = gy1 - gy0 + 1;
  const A = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) A[y * W + x] = maskCell(CH, C, MR, MN, gx0 + x, gy0 + y);
  // 3x3 blur (centre weighted): rounds the 10 m cell corners into a smooth coast line
  const B = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x;
    B[i] = (4 * A[i] + 2 * (A[i - 1] + A[i + 1] + A[i - W] + A[i + W]) + A[i - W - 1] + A[i - W + 1] + A[i + W - 1] + A[i + W + 1]) / 16 }
  return (e, n) => { const fx = e / MR - 0.5 - gx0, fy = -n / MR - 0.5 - gy0, ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy, i = iy * W + ix;
    return (B[i] * (1 - ax) + B[i + 1] * ax) * (1 - ay) + (B[i + W] * (1 - ax) + B[i + W + 1] * ax) * ay };
}
// ---- one tile of heights. E, N: Float64Array(65536) of BNG coordinates of the pixel centres; mpp: ground metres a pixel.
// Surveys are blended, not cut: each survey's weight ramps 0 -> 1 over FEATHER metres in from its own data edge (its no-data or the
// edge of its coverage), and the best survey fills its weight first, the next survey the remainder, and so on. So where a better survey
// starts, the change is a 30 m ramp, not a step, and inside a survey nothing changes.
const FEATHER = 30;
async function scotHeights(E, N, mpp, stats = { bytes: 0, products: 0 }) {
  const I = SCOT.idx, C = I.chunk, MR = I.maskRes, MN = C / MR, n = E.length, F = Math.max(FEATHER, mpp * 2);
  let e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity;
  for (let i = 0; i < n; i++) { if (E[i] < e0) e0 = E[i]; if (E[i] > e1) e1 = E[i]; if (N[i] < n0) n0 = N[i]; if (N[i] > n1) n1 = N[i] }
  const ck = new Map();
  for (let cx = Math.floor((e0 - MR) / C); cx <= Math.floor((e1 + MR) / C); cx++) for (let cy = Math.floor((n0 - MR) / C); cy <= Math.floor((n1 + MR) / C); cy++) ck.set(cx + '_' + cy, chunk(cx, cy));
  const CH = new Map(); for (const [k, p] of ck) CH.set(k, await p);
  const num = new Float64Array(n), wsum = new Float32Array(n), want = new Uint8Array(n); let todo = 0;
  const mOuter = maskGrid(CH, C, MR, MN, e0, e1, n0, n1); CORE = true; const mCore = maskGrid(CH, C, MR, MN, e0, e1, n0, n1); CORE = false;
  const outer = new Uint8Array(n), coreV = new Float32Array(n);
  for (let i = 0; i < n; i++) { if (mOuter(E[i], N[i]) < MASK_T) continue; want[i] = 1; todo++; const c = mCore(E[i], N[i]); coreV[i] = c; if (c < MASK_T) outer[i] = 1 }
  const out = new Float32Array(n).fill(NaN);
  if (!todo) return { h: out, any: false, stats };
  const ids = new Set(); for (const c of CH.values()) if (c) for (const id of c.p) ids.add(id);
  const pe0 = e0 - F, pe1 = e1 + F, pn0 = n0 - F, pn1 = n1 + F;      // read a FEATHER margin round the tile: the ramps match across tiles
  const prods = [...ids].map(id => ({ id, p: I.products[id] })).filter(({ p }) => p[2][0] < pe1 && p[2][2] > pe0 && p[2][1] < pn1 && p[2][3] > pn0).sort((a, b) => a.p[0] - b.p[0] || a.id - b.id);
  const bands = []; for (const q of prods) { const last = bands[bands.length - 1]; if (last && last[0].p[0] === q.p[0]) last.push(q); else bands.push([q]) }
  // probe directions for the data-edge distance (8 directions x 3 radii)
  const PR = []; for (const r of [F / 6, F / 3, F / 2, 2 * F / 3, 5 * F / 6, F]) for (let k = 0; k < 8; k++) PR.push([r, Math.cos(k * Math.PI / 4) * r, Math.sin(k * Math.PI / 4) * r]);
  for (let bi = 0; bi < bands.length; bi++) {
    const band = bands[bi]; if (!todo) break;
    const wins = (await Promise.all(band.map(async ({ p }) => {
      const url = I.base + p[1]; let M; try { M = await meta(url) } catch (e) { stats.err = (stats.err || 0) + 1; (stats.msgs = stats.msgs || []).push(String(e && e.stack || e).slice(0, 300)); return null }
      let li = 0; for (let k = 0; k < M.levels.length; k++) if (M.levels[k].px <= mpp * 1.01) li = k;
      const L = M.levels[li], x0 = Math.max(pe0, M.X0), x1 = Math.min(pe1, M.X1), y0 = Math.max(pn0, M.Y1), y1 = Math.min(pn1, M.Y0);
      if (x0 >= x1 || y0 >= y1) return null;
      const c0 = Math.max(0, Math.floor((x0 - M.X0) / L.px) - 1), c1 = Math.min(L.W, Math.ceil((x1 - M.X0) / L.px) + 1);
      const r0 = Math.max(0, Math.floor((M.Y0 - y1) / L.py) - 1), r1 = Math.min(L.H, Math.ceil((M.Y0 - y0) / L.py) + 1);
      let w; try { w = await window_(M, li, c0, r0, c1, r1, stats) } catch (e) { stats.err = (stats.err || 0) + 1; (stats.msgs = stats.msgs || []).push(String(e && e.stack || e).slice(0, 300)); return null }
      stats.products++;
      return w && { M, L, w, c0, r0, c1, r1 };
    }))).filter(Boolean);
    if (!wins.length) continue;
    const lastBand = bi === bands.length - 1;
    // weight = distance to this band's data edge, from a coarse validity grid (cell F/6) and a chamfer distance transform
    let wAt = () => 1;
    if (!lastBand) {
      const cs = F / 6, gx0 = pe0, gy1 = pn1, GW = Math.ceil((pe1 - pe0) / cs) + 1, GH = Math.ceil((pn1 - pn0) / cs) + 1, D = new Float32Array(GW * GH);
      let anyBad = false;
      for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
        const e = gx0 + gx * cs, nn = gy1 - gy * cs; let ok = false;
        for (const { M, L, w, c0, r0, c1, r1 } of wins) { const c = Math.floor((e - M.X0) / L.px), r = Math.floor((M.Y0 - nn) / L.py);
          if (c < c0 || r < r0 || c >= c1 || r >= r1) continue; const v = w.get(c, r); if (v === v) { ok = true; break } }
        D[gy * GW + gx] = ok ? 1e9 : 0; if (!ok) anyBad = true;
      }
      if (anyBad) {
        const s2 = Math.SQRT2;
        for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { const i = y * GW + x; let d = D[i]; if (!d) continue;
          if (x) d = Math.min(d, D[i - 1] + 1); if (y) { d = Math.min(d, D[i - GW] + 1); if (x) d = Math.min(d, D[i - GW - 1] + s2); if (x < GW - 1) d = Math.min(d, D[i - GW + 1] + s2) } D[i] = d }
        for (let y = GH - 1; y >= 0; y--) for (let x = GW - 1; x >= 0; x--) { const i = y * GW + x; let d = D[i]; if (!d) continue;
          if (x < GW - 1) d = Math.min(d, D[i + 1] + 1); if (y < GH - 1) { d = Math.min(d, D[i + GW] + 1); if (x < GW - 1) d = Math.min(d, D[i + GW + 1] + s2); if (x) d = Math.min(d, D[i + GW - 1] + s2) } D[i] = d }
        wAt = (e, nn) => { const fx = (e - gx0) / cs, fy = (gy1 - nn) / cs, ix = Math.min(GW - 2, Math.max(0, Math.floor(fx))), iy = Math.min(GH - 2, Math.max(0, Math.floor(fy))), ax = fx - ix, ay = fy - iy, i = iy * GW + ix;
          let d = ((D[i] * (1 - ax) + D[i + 1] * ax) * (1 - ay) + (D[i + GW] * (1 - ax) + D[i + GW + 1] * ax) * ay) * cs / F - 1 / 6;
          d = Math.min(1, Math.max(0, d * 1.2)); return Math.max(0.02, d * d * (3 - 2 * d)) };
      }
    }
    for (let i = 0; i < n; i++) {
      if (!want[i] || wsum[i] >= 0.999) continue;
      let h = NaN;
      for (const W of wins) {
        const { M, L, w, c0, r0, c1, r1 } = W;
        const fx = (E[i] - M.X0) / L.px - 0.5, fy = (M.Y0 - N[i]) / L.py - 0.5, ix = Math.floor(fx), iy = Math.floor(fy);
        if (ix < c0 - 1 || iy < r0 - 1 || ix >= c1 || iy >= r1) continue;
        const ax = fx - ix, ay = fy - iy, g = (c, r) => (c < c0 || r < r0 || c >= c1 || r >= r1) ? NaN : w.get(c, r);
        const h00 = g(ix, iy), h10 = g(ix + 1, iy), h01 = g(ix, iy + 1), h11 = g(ix + 1, iy + 1);
        if (h00 === h00 && h10 === h10 && h01 === h01 && h11 === h11) h = (h00 * (1 - ax) + h10 * ax) * (1 - ay) + (h01 * (1 - ax) + h11 * ax) * ay;
        else h = [h00, h10, h01, h11][(ay > 0.5 ? 2 : 0) + (ax > 0.5 ? 1 : 0)];
        if (h === h) break;
      }
      if (h !== h) continue;
      // weight: distance to this band's data edge, from the nearest failed probe (the last band takes everything that is left)
      const wt = wAt(E[i], N[i]);
      const a = Math.min(wt, 1 - wsum[i]); num[i] += h * a; wsum[i] += a;
      if (wsum[i] >= 0.999) todo--;
    }
  }
  let any = false; for (let i = 0; i < n; i++) if (wsum[i] > 0) { const h = num[i] / wsum[i]; if (outer[i] && h < SEA_Z) continue; out[i] = h; any = true }
  return { h: out, any, stats };
}

// ---- WGS84 -> BNG: 7-parameter Helmert + TM (the same transform rasterio/PROJ used for the pre-built tiles; no OSTN15 grid)
const D2R = Math.PI / 180, WGS = { a: 6378137, b: 6356752.314245 }, AIRY = { a: 6377563.396, b: 6356256.909 };
const HP = { tx: -446.448, ty: 125.157, tz: -542.060, s: 20.4894, rx: -0.1502, ry: -0.2470, rz: -0.8421 };
const F0 = 0.9996012717, LAT0 = 49 * D2R, LNG0 = -2 * D2R, E0 = 400000, N0 = -100000;
function toCart(lat, lng, e) { const f = lat * D2R, l = lng * D2R, e2 = 1 - e.b * e.b / (e.a * e.a), nu = e.a / Math.sqrt(1 - e2 * Math.sin(f) ** 2);
  return [nu * Math.cos(f) * Math.cos(l), nu * Math.cos(f) * Math.sin(l), nu * (1 - e2) * Math.sin(f)] }
function fromCart(x, y, z, e) { const e2 = 1 - e.b * e.b / (e.a * e.a), p = Math.hypot(x, y); let f = Math.atan2(z, p * (1 - e2));
  for (let i = 0; i < 6; i++) { const nu = e.a / Math.sqrt(1 - e2 * Math.sin(f) ** 2); f = Math.atan2(z + e2 * nu * Math.sin(f), p) } return [f / D2R, Math.atan2(y, x) / D2R] }
function helm([x, y, z]) { const s = 1 + HP.s * 1e-6, k = D2R / 3600, rx = HP.rx * k, ry = HP.ry * k, rz = HP.rz * k;
  return [HP.tx + x * s - y * rz + z * ry, HP.ty + x * rz + y * s - z * rx, HP.tz - x * ry + y * rx + z * s] }
function tmM(f, a, b) { const n = (a - b) / (a + b), n2 = n * n, n3 = n2 * n; return b * F0 * ((1 + n + 1.25 * n2 + 1.25 * n3) * (f - LAT0) - (3 * n + 3 * n2 + 21 / 8 * n3) * Math.sin(f - LAT0) * Math.cos(f + LAT0) + (15 / 8 * n2 + 15 / 8 * n3) * Math.sin(2 * (f - LAT0)) * Math.cos(2 * (f + LAT0)) - 35 / 24 * n3 * Math.sin(3 * (f - LAT0)) * Math.cos(3 * (f + LAT0))) }
function tmFwd(lat, lng) { const { a, b } = AIRY, f = lat * D2R, l = lng * D2R, e2 = 1 - b * b / (a * a), sf = Math.sin(f), cf = Math.cos(f), tf = Math.tan(f);
  const nu = a * F0 / Math.sqrt(1 - e2 * sf * sf), rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * sf * sf, 1.5), eta2 = nu / rho - 1, M = tmM(f, a, b);
  const I = M + N0, II = nu / 2 * sf * cf, III = nu / 24 * sf * cf ** 3 * (5 - tf * tf + 9 * eta2), IIIA = nu / 720 * sf * cf ** 5 * (61 - 58 * tf * tf + tf ** 4), IV = nu * cf, V = nu / 6 * cf ** 3 * (nu / rho - tf * tf), VI = nu / 120 * cf ** 5 * (5 - 18 * tf * tf + tf ** 4 + 14 * eta2 - 58 * tf * tf * eta2);
  const dl = l - LNG0; return [E0 + IV * dl + V * dl ** 3 + VI * dl ** 5, I + II * dl * dl + III * dl ** 4 + IIIA * dl ** 6] }
function ll2en(lat, lng) { const c = helm(toCart(lat, lng, WGS)), [la, lo] = fromCart(c[0], c[1], c[2], AIRY); return tmFwd(la, lo) }
const tile2lng = (x, n) => x / n * 360 - 180, tile2lat = (y, n) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) / D2R;
// pixel-centre BNG coordinates for tile z/x/y (exact on a 17x17 lattice, bilinear between)
function tileEN(z, x, y) {
  const n = 2 ** z, G = 16, LE = new Float64Array((G + 1) ** 2), LN = new Float64Array((G + 1) ** 2);
  for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) { const [e, nn] = ll2en(tile2lat(y + j / G, n), tile2lng(x + i / G, n)); LE[j * (G + 1) + i] = e; LN[j * (G + 1) + i] = nn }
  const E = new Float64Array(65536), N = new Float64Array(65536);
  for (let py = 0; py < 256; py++) { const gy = (py + 0.5) / 256 * G, j = Math.min(G - 1, Math.floor(gy)), ty = gy - j;
    for (let px = 0; px < 256; px++) { const gx = (px + 0.5) / 256 * G, i = Math.min(G - 1, Math.floor(gx)), tx = gx - i, k = j * (G + 1) + i;
      const bl = A => (A[k] * (1 - tx) + A[k + 1] * tx) * (1 - ty) + (A[k + G + 1] * (1 - tx) + A[k + G + 2] * tx) * ty;
      E[py * 256 + px] = bl(LE); N[py * 256 + px] = bl(LN) } }
  const lat = tile2lat(y + 0.5, n), mpp = 156543.03392 * Math.cos(lat * D2R) / n;
  return { E, N, mpp };
}
// Terrarium RGBA (1/64 m, alpha 0 = no data), as the pre-built tiles
function terrarium(h) {
  const px = new Uint8ClampedArray(h.length * 4); let any = false;
  for (let i = 0; i < h.length; i++) { const v0 = h[i]; if (v0 !== v0) continue; const v = Math.round(v0 * 64) / 64 + 32768, vi = Math.floor(v);
    px[i * 4] = vi >> 8; px[i * 4 + 1] = vi & 255; px[i * 4 + 2] = Math.round((v - vi) * 256) & 255; px[i * 4 + 3] = 255; any = true }
  return any ? px : null;
}
export { scotInit, scotHeights, tileEN, terrarium, SCOT };
