// LiDAR Lens - England relay: a caching relay for the Environment Agency's LiDAR Composite DTM 1 m WCS, used by the live
// Lens (site/live-sw.js). It only makes the fixed BNG blocks the Lens asks for, so it is not an open proxy:
//   GET /wcs?r=<metres per pixel, 1-64>&bx=<block x>&by=<block y>   -> GeoTIFF, (BLOCK_PX + 2) px square, 1 px margin
// Each block is fetched from the EA once, then served from Cloudflare's edge cache or the R2 bucket (binding BLOCKS),
// so popular places cost the EA nothing after the first visitor. 429/503 from the EA are passed back (with Retry-After)
// and not stored. Optional bindings: RATE_LIMITER (per-IP cap). Vars: ALLOW_ORIGINS (space-separated), CLIENT_ID.
// The bucket should carry a lifecycle rule (e.g. delete after 30 days) to stay inside R2's free 10 GB.
const BLOCK_PX = 512;
const EA = 'https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs?service=WCS&version=2.0.1' +
  '&request=GetCoverage&CoverageId=13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m&format=image/tiff&geotiff:compression=Deflate';
const ENG = { e0: 80000, n0: 0, e1: 660000, n1: 660000 };
const VER = 'v1';

function cors(req, env, h = new Headers()) {
  const o = req.headers.get('Origin'), allow = (env.ALLOW_ORIGINS || '').split(/\s+/).filter(Boolean);
  if (o && allow.includes(o)) { h.set('Access-Control-Allow-Origin', o); h.set('Vary', 'Origin') }
  h.set('Access-Control-Expose-Headers', 'X-Relay, X-Upstream, Retry-After'); h.set('X-Content-Type-Options', 'nosniff'); h.set('Cross-Origin-Resource-Policy', 'cross-origin');
  return h;
}
const err = (req, env, s, msg, extra = {}) => { const h = cors(req, env); h.set('Content-Type', 'text/plain'); h.set('Cache-Control', 'no-store');
  for (const k in extra) h.set(k, extra[k]); return new Response(msg, { status: s, headers: h }) };

// Outside the EA survey (Wales, Scotland, the sea) the WCS returns a valid GeoTIFF with every height 0.0 (about 4.6 KB).
// Such a block is 'empty': it is edge-cached so repeat requests are cheap, but never written to R2.
async function inflate(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()) }
async function isEmpty(buf) {
  const dv = new DataView(buf), le = dv.getUint16(0) === 0x4949, u16 = o => dv.getUint16(o, le), u32 = o => dv.getUint32(o, le);
  const ifd = u32(4), n = u16(ifd), T = {}, size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8, 16: 8 };
  for (let i = 0; i < n; i++) {
    const o = ifd + 2 + i * 12, tag = u16(o), type = u16(o + 2), cnt = u32(o + 4), sz = (size[type] || 1) * cnt, at = sz <= 4 ? o + 8 : u32(o + 8);
    const rd = k => type === 3 ? u16(at + 2 * k) : type === 4 ? u32(at + 4 * k) : dv.getUint8(at + k);
    if ([258, 259, 273, 279, 317, 322, 324, 325].includes(tag)) T[tag] = Array.from({ length: cnt }, (_, k) => rd(k));
  }
  const comp = (T[259] || [1])[0];
  if ((T[258] && T[258][0] !== 32) || (T[317] || [1])[0] !== 1) return false;          // not the layout we know: treat as real data
  const offs = T[322] ? T[324] : T[273], cnts = T[322] ? T[325] : T[279];
  for (let k = 0; k < offs.length; k++) {
    let bytes = new Uint8Array(buf, offs[k], cnts[k]);
    if (comp === 8 || comp === 32946) bytes = await inflate(bytes); else if (comp !== 1) return false;
    const bd = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i + 4 <= bytes.byteLength; i += 4) { const v = bd.getFloat32(i, le); if (v !== 0 && v > -1000) return false }
  }
  return true;
}

export default {
  async fetch(req, env, ctx) {
    const u = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req, env, new Headers({ 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' })) });
    if (u.pathname === '/') return err(req, env, 200, 'LiDAR Lens England relay: caches Environment Agency LiDAR Composite DTM 1 m (OGL) blocks for https://timdaw37.github.io/lidar-lens/');
    if (u.pathname !== '/wcs' || req.method !== 'GET') return err(req, env, 404, 'not found');
    const o = req.headers.get('Origin'), allow = (env.ALLOW_ORIGINS || '').split(/\s+/).filter(Boolean);
    if (o && allow.length && !allow.includes(o)) return err(req, env, 403, 'origin not allowed');
    const r = +u.searchParams.get('r'), bx = +u.searchParams.get('bx'), by = +u.searchParams.get('by');
    if (![1, 2, 4, 8, 16, 32, 64].includes(r) || !Number.isInteger(bx) || !Number.isInteger(by)) return err(req, env, 400, 'bad block');
    const S = BLOCK_PX * r, x0 = bx * S - r, x1 = bx * S + S + r, y0 = by * S - r, y1 = by * S + S + r;
    if (x1 < ENG.e0 || x0 > ENG.e1 || y1 < ENG.n0 || y0 > ENG.n1) return err(req, env, 400, 'outside England');
    if (env.RATE_LIMITER) { const { success } = await env.RATE_LIMITER.limit({ key: req.headers.get('CF-Connecting-IP') || 'x' }); if (!success) return err(req, env, 429, 'slow down', { 'Retry-After': '10' }) }

    // edge key e2/: edge copies made before empty-block detection are left behind
    const key = `wcs/${VER}/${r}/${bx}_${by}.tif`, edgeKey = new Request('https://relay.invalid/e2/' + key), cache = caches.default;
    const send = (body, src) => { const h = cors(req, env); h.set('Content-Type', 'image/tiff'); h.set('Cache-Control', 'public, max-age=2592000, immutable'); h.set('X-Relay', src);
      return new Response(body, { status: 200, headers: h }) };
    let hit = await cache.match(edgeKey);
    if (hit) return send(hit.body, hit.headers.get('X-Empty') ? 'empty' : 'edge');
    const obj = await env.BLOCKS.get(key);
    if (obj) { const buf = await obj.arrayBuffer(); ctx.waitUntil(cache.put(edgeKey, new Response(buf, { headers: { 'Cache-Control': 'public, max-age=2592000' } }))); return send(buf, 'r2') }

    const url = EA + `&subset=E(${x0},${x1})&subset=N(${y0},${y1})` + (r > 1 ? `&SCALEFACTOR=${1 / r}` : '') + '&client=' + encodeURIComponent(env.CLIENT_ID || 'lidar-lens-england');
    let up;
    try { up = await fetch(url, { headers: { 'User-Agent': 'LiDAR-Lens-England-relay (+https://github.com/TimDaw37/lidar-lens)' }, cf: { cacheTtl: 0 } }) }
    catch (e) { return err(req, env, 502, 'EA unreachable') }
    if (up.status === 429 || up.status === 503) return err(req, env, up.status, 'EA busy', { 'Retry-After': up.headers.get('Retry-After') || '5', 'X-Upstream': String(up.status) });
    if (!up.ok) return err(req, env, 502, 'EA ' + up.status, { 'X-Upstream': String(up.status) });
    const buf = await up.arrayBuffer(), b = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
    const tiff = buf.byteLength > 8 && ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 42) || (b[0] === 0x4d && b[1] === 0x4d && b[3] === 42));
    if (!tiff) return err(req, env, 502, 'EA sent something other than a GeoTIFF', { 'X-Upstream': String(up.status) });
    let empty = false; try { empty = await isEmpty(buf) } catch (e) { empty = false }
    if (empty) { ctx.waitUntil(cache.put(edgeKey, new Response(buf, { headers: { 'Cache-Control': 'public, max-age=2592000', 'X-Empty': '1' } }))); return send(buf, 'empty') }
    ctx.waitUntil(Promise.all([env.BLOCKS.put(key, buf, { httpMetadata: { contentType: 'image/tiff' } }),
      cache.put(edgeKey, new Response(buf, { headers: { 'Cache-Control': 'public, max-age=2592000' } }))]));
    return send(buf, 'ea');
  }
};
