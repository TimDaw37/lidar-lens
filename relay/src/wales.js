// Welsh Government LiDAR DTM 1 m (OGL), for the live Lens's Welsh blocks.
// Source: one cloud-optimised BigTIFF on Azure (DataMapWales), EPSG:27700, 1 m, float32, deflate, 256 px tiles,
// no-data -9999, with overviews at 2, 4 ... 64 m. The blob has no CORS, so browsers cannot read it: the relay range-reads
// only the tiles a block needs and hands back the same block the EA route does (BNG-aligned, (BLOCK_PX + 2) px square,
// 1 px margin, a small classic TIFF), so the Lens's service worker reads both alike.
export const WALES_COG = 'https://dmwproductionblob.blob.core.windows.net/cogs/lidar/wales_dtm_32bit_cog.tif';
const UA = { 'User-Agent': 'LiDAR-Lens-relay (+https://github.com/TimDaw37/lidar-lens)' };

// Azure storage occasionally fails a single read (a 5xx or a dropped connection): try twice more, after 0.3 s and 1 s
async function range(a, n) {
  for (let t = 0; ; t++) {
    let r = null;
    try { r = await fetch(WALES_COG, { headers: { ...UA, Range: `bytes=${a}-${a + n - 1}` } }) } catch (e) { if (t >= 2) throw e }
    if (r && (r.status === 206 || r.status === 200)) return new Uint8Array(await r.arrayBuffer());
    if (r && (r.status < 500 || t >= 2)) { const e = new Error('COG ' + r.status); e.status = r.status; throw e }
    await new Promise(res => setTimeout(res, t ? 1000 : 300));
  }
}
async function inflate(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()) }
async function deflate(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()) }

// ---- the file's layout, read once per Worker instance from its first 64 KB (all IFDs sit there)
let metaP = null;
function meta() {
  if (!metaP) metaP = (async () => {
    const b = await range(0, 65536), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (dv.getUint16(0, true) !== 0x4949 || dv.getUint16(2, true) !== 43) throw new Error('COG: not a little-endian BigTIFF');
    const SZ = { 1: 1, 2: 1, 3: 2, 4: 4, 11: 4, 12: 8, 16: 8 };
    const val = (typ, at, k) => typ === 3 ? dv.getUint16(at + 2 * k, true) : typ === 4 ? dv.getUint32(at + 4 * k, true) : typ === 16 ? Number(dv.getBigUint64(at + 8 * k, true)) : typ === 12 ? dv.getFloat64(at + 8 * k, true) : dv.getUint8(at + k);
    const levels = []; let off = Number(dv.getBigUint64(8, true)), X0, Y0, sx, sy;
    while (off) {
      if (off + 8 > b.length) throw new Error('COG: IFD beyond the first 64 KB');
      const n = Number(dv.getBigUint64(off, true)), T = {};
      for (let i = 0; i < n; i++) {
        const e = off + 8 + i * 20, tag = dv.getUint16(e, true), typ = dv.getUint16(e + 2, true), cnt = Number(dv.getBigUint64(e + 4, true));
        const inline = (SZ[typ] || 1) * cnt <= 8, at = inline ? e + 12 : Number(dv.getBigUint64(e + 12, true));
        if (tag === 324 || tag === 325) T[tag] = { at, typ, cnt };                    // tile offsets / byte counts: read per block
        else if ([256, 257, 258, 259, 317, 322, 323, 339].includes(tag)) T[tag] = val(typ, at, 0);
        else if (tag === 33550) { sx = val(typ, at, 0); sy = val(typ, at, 1) }          // pixel scale
        else if (tag === 33922) { X0 = val(typ, at, 3); Y0 = val(typ, at, 4) }          // tie point: top-left corner
      }
      if (T[258] !== 32 || (T[317] || 1) !== 1 || ![1, 8, 32946].includes(T[259] || 1)) throw new Error('COG: unexpected sample layout');
      levels.push({ W: T[256], H: T[257], tw: T[322], th: T[323], comp: T[259] || 1, offs: T[324], cnts: T[325] });
      off = Number(dv.getBigUint64(off + 8 + n * 20, true));
    }
    const L0 = levels[0], extW = L0.W * sx, extH = L0.H * sy;
    for (const L of levels) { L.px = extW / L.W; L.py = extH / L.H; L.across = Math.ceil(L.W / L.tw) }  // GDAL overviews: same extent, ~2^k m pixels
    return { X0, Y0, X1: X0 + extW, Y1: Y0 - extH, levels };
  })().catch(e => { metaP = null; throw e });
  return metaP;
}

// read entries [i0, i0 + n) of an offsets (LONG8) or byte-counts (LONG/LONG8) array
async function entries(arr, i0, n) {
  const w = arr.typ === 16 ? 8 : 4, b = await range(arr.at + i0 * w, n * w), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return Array.from({ length: n }, (_, k) => w === 8 ? Number(dv.getBigUint64(k * w, true)) : dv.getUint32(k * w, true));
}

// One block: BLOCK_PX x BLOCK_PX at r metres a pixel plus a 1 px margin, origin (bx*S - r, by*S + S + r), S = BLOCK_PX*r.
// Returns { tiff } (a small deflated classic TIFF, -9999 = no data) or { empty: true } when Wales has no data there.
export async function walesBlock(r, bx, by, BLOCK_PX) {
  const M = await meta(), k = Math.round(Math.log2(r)), L = M.levels[k];
  if (!L) throw new Error('COG: no overview for r=' + r);
  const N = BLOCK_PX + 2, S = BLOCK_PX * r, x0 = bx * S - r, yTop = by * S + S + r;
  if (x0 + N * r <= M.X0 || x0 >= M.X1 || yTop <= M.Y1 || yTop - N * r >= M.Y0) return { empty: true };
  // nearest source pixel for each output column / row (exact copy at r = 1, where the grids coincide)
  const col = new Int32Array(N), row = new Int32Array(N);
  for (let i = 0; i < N; i++) col[i] = Math.floor((x0 + (i + 0.5) * r - M.X0) / L.px);
  for (let j = 0; j < N; j++) row[j] = Math.floor((M.Y0 - (yTop - (j + 0.5) * r)) / L.py);
  const clampC = c => Math.max(0, Math.min(L.W - 1, c)), clampR = c => Math.max(0, Math.min(L.H - 1, c));
  const tc0 = Math.floor(clampC(col[0]) / L.tw), tc1 = Math.floor(clampC(col[N - 1]) / L.tw);
  const tr0 = Math.floor(clampR(row[0]) / L.th), tr1 = Math.floor(clampR(row[N - 1]) / L.th), nc = tc1 - tc0 + 1;
  const tiles = new Map();   // 'tr/tc' -> Float32Array (tw*th)
  await Promise.all(Array.from({ length: tr1 - tr0 + 1 }, async (_, q) => {
    const tr = tr0 + q, i0 = tr * L.across + tc0;
    const [offs, cnts] = await Promise.all([entries(L.offs, i0, nc), entries(L.cnts, i0, nc)]);
    const have = offs.map((o, c) => ({ o, n: cnts[c], tc: tc0 + c })).filter(t => t.o && t.n);   // sparse COG: empty tiles have no bytes
    if (!have.length) return;
    const a = Math.min(...have.map(t => t.o)), z = Math.max(...have.map(t => t.o + t.n)), sum = have.reduce((s, t) => s + t.n, 0);
    // tiles of a row are normally stored together: one read for the row, unless they are scattered
    const spans = z - a <= sum * 1.5 + 65536 ? [[a, z, have]] : have.map(t => [t.o, t.o + t.n, [t]]);
    for (const [s, e, ts] of spans) {
      const buf = await range(s, e - s);
      for (const t of ts) {
        let u = buf.subarray(t.o - s, t.o - s + t.n);
        if (L.comp !== 1) u = await inflate(u);
        tiles.set(tr + '/' + t.tc, new Float32Array(u.buffer.slice(u.byteOffset, u.byteOffset + L.tw * L.th * 4)));   // little-endian, as the host
      }
    }
  }));
  const out = new Float32Array(N * N).fill(-9999); let any = false;
  for (let j = 0; j < N; j++) {
    const R = row[j]; if (R < 0 || R >= L.H) continue;
    const tr = Math.floor(R / L.th), ry = R - tr * L.th;
    for (let i = 0; i < N; i++) {
      const C = col[i]; if (C < 0 || C >= L.W) continue;
      const tc = Math.floor(C / L.tw), t = tiles.get(tr + '/' + tc); if (!t) continue;
      const v = t[ry * L.tw + (C - tc * L.tw)];
      if (v > -1000 && v === v) { out[j * N + i] = v; any = true }
    }
  }
  if (!any) return { empty: true };
  return { tiff: await tiff(out, N) };
}

// a minimal classic little-endian TIFF: one deflated strip of float32
export async function tiff(data, N) {
  const z = await deflate(new Uint8Array(data.buffer));
  const tags = [[256, 3, N], [257, 3, N], [258, 3, 32], [259, 3, 8], [262, 3, 1], [273, 4, 0], [277, 3, 1], [278, 3, N], [279, 4, z.length], [284, 3, 1], [339, 3, 3]];
  const ifd = 8, head = ifd + 2 + tags.length * 12 + 4, buf = new Uint8Array(head + z.length), dv = new DataView(buf.buffer);
  dv.setUint16(0, 0x4949, true); dv.setUint16(2, 42, true); dv.setUint32(4, ifd, true); dv.setUint16(ifd, tags.length, true);
  tags.forEach(([tag, typ, v], i) => { const o = ifd + 2 + i * 12; dv.setUint16(o, tag, true); dv.setUint16(o + 2, typ, true); dv.setUint32(o + 4, 1, true);
    if (tag === 273) v = head; if (typ === 3) dv.setUint16(o + 8, v, true); else dv.setUint32(o + 8, v, true) });
  buf.set(z, head);
  return buf.buffer;
}
