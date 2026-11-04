// ---- England & Wales tile builder for the GB TEST Worker (one-way shared cache). Same projection, block decode and drawing as the
// browser's live-sw.js (copied from viewer/site/live-sw.js); blocks come from the GB relay TEST Worker (service binding), which caches them in R2.
const EW = { grid: null, relay: null };
export function ewInit(o) { Object.assign(EW, o) }
async function inflate(u8) { const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate')); return new Uint8Array(await new Response(s).arrayBuffer()) }
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
function loadGrid() { if (!ogP) ogP = EW.grid().then(r => r).then(g => { if (g && g.enc === 'cm-delta') for (const k of ['de', 'dn']) { let v = 0; g[k] = g[k].map(d => (v += d) / 100) } OG = g }).catch(() => {}); return ogP }
function corr(lat, lng) { if (!OG) return [0, 0]; const fy = (lat - OG.lat0) / OG.step, fx = (lng - OG.lng0) / OG.step; if (fy < 0 || fx < 0 || fy > OG.nlat - 1 || fx > OG.nlng - 1) return [0, 0];
  const i = Math.min(OG.nlat - 2, Math.floor(fy)), j = Math.min(OG.nlng - 2, Math.floor(fx)), ty = fy - i, tx = fx - j, k = i * OG.nlng + j, bl = a => (a[k] * (1 - tx) + a[k + 1] * tx) * (1 - ty) + (a[k + OG.nlng] * (1 - tx) + a[k + OG.nlng + 1] * tx) * ty; return [bl(OG.de), bl(OG.dn)] }
function ll2en(lat, lng) { const c = helm(toCart(lat, lng, WGS)), [la, lo] = fromCart(c[0], c[1], c[2], AIRY), [E, N] = tmFwd(la, lo), d = corr(lat, lng); return [E + d[0], N + d[1]] }
const tile2lng = (x, n) => x / n * 360 - 180, tile2lat = (y, n) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) / D2R;
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

// The relay's centimetre blocks (f=cm, 'LLC1', about a fifth of the GeoTIFF): see toCm in relay/src/index.js
async function readCm(buf) {
  const dv = new DataView(buf), W = dv.getUint16(4, true), Hh = dv.getUint16(6, true), N = W * Hh;
  const pl = await inflate(new Uint8Array(buf, 8)), out = new Float32Array(N), c = new Int32Array(N), N2 = 2 * N, N3 = 3 * N;
  if (pl.length < 4 * N) throw new Error('short cm block');
  for (let y = 0, i = 0; y < Hh; y++) for (let x = 0; x < W; x++, i++) {
    const z = pl[i] | pl[N + i] << 8 | pl[N2 + i] << 16 | pl[N3 + i] << 24, d = (z >>> 1) ^ -(z & 1);
    const a = x ? c[i - 1] : 0, b = y ? c[i - W] : 0, v = (x && y ? a + b - c[i - W - 1] : x ? a : b) + d;
    c[i] = v; out[i] = v === -1000000 ? NaN : v / 100;
  }
  return { W, H: Hh, data: out };
}
const isCm = buf => buf.byteLength > 8 && new Uint32Array(buf, 0, 1)[0] === 0x31434c4c;

const BLOCK_PX = 512, ENG = { e0: 80000, n0: 0, e1: 660000, n1: 660000 }, WALES = { e0: 164993, n0: 164000, e1: 356007, n1: 397000 };
async function block(r, bx, by, st) {
  const S = BLOCK_PX * r, x0 = bx * S - r, x1 = bx * S + S + r, y0 = by * S - r, y1 = by * S + S + r;
  const get = async path => { for (let t = 0; t < 3; t++) { const res = await EW.relay(`${path}?r=${r}&bx=${bx}&by=${by}&f=cm`);
      if (res.ok) { const ab = await res.arrayBuffer(); st.bytes += ab.byteLength; return ab } if (res.status !== 429 && res.status < 500) return null;
      await new Promise(q => setTimeout(q, 800 * (t + 1))) } throw new Error('relay busy') };
  const dec = async (ab, zeroIsNoData) => { if (!ab) return null; const t = isCm(ab) ? await readCm(ab) : await readTiff(ab); let any = false;
    for (let i = 0; i < t.data.length; i++) { const v = t.data[i]; if (!(v > -1000) || (zeroIsNoData && v === 0)) t.data[i] = NaN; else any = true }
    return any ? { ...t, x0, yTop: y1, r } : null };
  const inWales = x1 > WALES.e0 && x0 < WALES.e1 && y1 > WALES.n0 && y0 < WALES.n1;
  const [e, w] = await Promise.all([get('/wcs').then(a => dec(a, true)), inWales ? get('/wales').then(a => dec(a, false)) : null]);
  if (w && e) { for (let i = 0; i < w.data.length; i++) if (w.data[i] === w.data[i]) e.data[i] = w.data[i]; return e }
  return w || e;
}
// RGBA terrarium pixels for tile z/x/y (null: no data), exactly as draw() in live-sw.js
export async function ewTile(z, x, y, st = { bytes: 0 }) {
  await loadGrid();
  const n = 2 ** z, G = 16, LE = new Float64Array((G + 1) ** 2), LN = new Float64Array((G + 1) ** 2);
  for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) { const [E, N] = ll2en(tile2lat(y + j / G, n), tile2lng(x + i / G, n)); LE[j * (G + 1) + i] = E; LN[j * (G + 1) + i] = N }
  const lat = tile2lat(y + 0.5, n), mpp = 156543.03392 * Math.cos(lat * D2R) / n, r = Math.max(1, Math.min(64, 2 ** Math.round(Math.log2(mpp))));
  const eMin = Math.min(...LE), eMax = Math.max(...LE), nMin = Math.min(...LN), nMax = Math.max(...LN);
  if (eMax < ENG.e0 || eMin > ENG.e1 || nMax < ENG.n0 || nMin > ENG.n1) return null;
  const S = BLOCK_PX * r, blocks = new Map(), list = [];
  for (let bx = Math.floor(eMin / S); bx <= Math.floor(eMax / S); bx++) for (let by = Math.floor(nMin / S); by <= Math.floor(nMax / S); by++) list.push([bx, by]);
  await Promise.all(list.map(([bx, by]) => block(r, bx, by, st).then(b => blocks.set(bx + '/' + by, b))));
  const px = new Uint8Array(256 * 256 * 4); let any = false;
  for (let py = 0; py < 256; py++) { const gy = (py + 0.5) / 256 * G, j = Math.min(G - 1, Math.floor(gy)), ty = gy - j;
    for (let pxl = 0; pxl < 256; pxl++) { const gx = (pxl + 0.5) / 256 * G, i = Math.min(G - 1, Math.floor(gx)), tx = gx - i, k = j * (G + 1) + i;
      const bl = A => (A[k] * (1 - tx) + A[k + 1] * tx) * (1 - ty) + (A[k + G + 1] * (1 - tx) + A[k + G + 2] * tx) * ty;
      const E = bl(LE), N = bl(LN), b = blocks.get(Math.floor(E / S) + '/' + Math.floor(N / S)), o = (py * 256 + pxl) * 4; if (!b) continue;
      const fx = (E - b.x0) / r - 0.5, fy = (b.yTop - N) / r - 0.5, ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy;
      if (ix < 0 || iy < 0 || ix + 1 >= b.W || iy + 1 >= b.H) continue;
      const d = b.data, q = iy * b.W + ix, h00 = d[q], h10 = d[q + 1], h01 = d[q + b.W], h11 = d[q + b.W + 1]; let h;
      if (h00 === h00 && h10 === h10 && h01 === h01 && h11 === h11) h = (h00 * (1 - ax) + h10 * ax) * (1 - ay) + (h01 * (1 - ax) + h11 * ax) * ay;
      else { h = [h00, h10, h01, h11][(ay > 0.5 ? 2 : 0) + (ax > 0.5 ? 1 : 0)]; if (h !== h) continue }
      const v = Math.round((h + 32768) * 64) / 64, vi = Math.floor(v);
      px[o] = vi >> 8; px[o + 1] = vi & 255; px[o + 2] = Math.round((v - vi) * 256) & 255; px[o + 3] = 255; any = true } }
  return any ? px : null;
}
