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

    const key = `wcs/${VER}/${r}/${bx}_${by}.tif`, edgeKey = new Request('https://relay.invalid/' + key), cache = caches.default;
    const send = (body, src) => { const h = cors(req, env); h.set('Content-Type', 'image/tiff'); h.set('Cache-Control', 'public, max-age=2592000, immutable'); h.set('X-Relay', src);
      return new Response(body, { status: 200, headers: h }) };
    let hit = await cache.match(edgeKey);
    if (hit) return send(hit.body, 'edge');
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
    ctx.waitUntil(Promise.all([env.BLOCKS.put(key, buf, { httpMetadata: { contentType: 'image/tiff' } }),
      cache.put(edgeKey, new Response(buf, { headers: { 'Cache-Control': 'public, max-age=2592000' } }))]));
    return send(buf, 'ea');
  }
};
