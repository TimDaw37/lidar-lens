import { ewInit, ewTile } from "./ew-core.mjs";
import { scotInit, scotHeights, tileEN, terrarium } from "./scot-core.mjs";
// LiDAR Lens - R2 server. Serves the viewer, tiles and layer chunks from one R2 bucket on one origin.
// Private mode: set the Worker secret PASSWORD (Basic auth, any username). Public mode: leave PASSWORD unset.
// Optional vars: PUBLIC_INDEX="1" (allow search engines, public mode only), ALLOW_ORIGIN (one extra origin
// allowed to read tiles cross-origin), CSP_CONNECT / CSP_IMG (extra space-separated hosts for the CSP).
// Optional SITE_PREFIX (e.g. "public/"): serve viewer files from that prefix and only keys matching SHARED
// (regex, e.g. "^(terrain/|layers/(rec|ctx)/)") unprefixed; everything else in the bucket is unreachable.
// Optional HER_API="1": GET /api/her?e=<easting>&n=<northing> returns only {id,n,t,u,d} for HER records within 100 m of
// one point, read from private chunks at HER_PREFIX (default "layers/her/", never served directly). Optional binding
// HER_LIMITER caps it per IP. HER_BBOX="minE,minN,maxE,maxN" rejects points outside the area. No bulk/tile access.
// Optional binding RATE_LIMITER (Workers Rate Limiting API) to cap requests per IP. No secrets in this file.
import { Buffer } from "node:buffer";
const enc = new TextEncoder();
function timingSafeEqual(a, b) {
  const aB = enc.encode(a), bB = enc.encode(b);
  if (aB.byteLength !== bB.byteLength) return !crypto.subtle.timingSafeEqual(aB, aB); // still spend the time
  return crypto.subtle.timingSafeEqual(aB, bB);
}
const TYPES = { webp: "image/webp", json: "application/json", geojson: "application/geo+json", js: "text/javascript; charset=utf-8",
  html: "text/html; charset=utf-8", css: "text/css; charset=utf-8", png: "image/png", txt: "text/plain; charset=utf-8", svg: "image/svg+xml" };

function csp(env) {
  const img = ["'self'", "data:", "blob:", "https:"].concat((env.CSP_IMG || "").split(/\s+/).filter(Boolean));
  const connect = ["'self'", "https://api.postcodes.io", "https://nominatim.openstreetmap.org", "https://cloudflareinsights.com",
    "https://services-eu1.arcgis.com", "https://services.arcgis.com", "https://environment.data.gov.uk", "https://map.bgs.ac.uk"].concat((env.CSP_CONNECT || "").split(/\s+/).filter(Boolean));
  return ["default-src 'self'", "script-src 'self' https://static.cloudflareinsights.com", "style-src 'self' 'unsafe-inline'", "img-src " + img.join(" "),
    "connect-src " + connect.join(" "), "font-src 'self'", "worker-src " + (env.LIVE_SW === "1" ? "'self'" : "'none'"), "object-src 'none'", "base-uri 'none'",
    "form-action 'self'", "frame-ancestors 'none'", "upgrade-insecure-requests"].join("; ");
}
function secure(h, env, isPrivate) {
  h.set("Content-Security-Policy", csp(env));
  h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", "geolocation=(self), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()");
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  if (!env.ALLOW_ORIGIN) h.set("Cross-Origin-Resource-Policy", "same-origin"); // stops other sites hot-linking tiles
  h.set("X-Frame-Options", "DENY");
  if (isPrivate || env.PUBLIC_INDEX !== "1") h.set("X-Robots-Tag", "noindex, nofollow");
  return h;
}
const plain = (env, isPrivate, body, status, extra = {}) =>
  new Response(body, { status, headers: secure(new Headers({ "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...extra }), env, isPrivate) });
const json = (env, isPrivate, body, status) =>
  new Response(JSON.stringify(body), { status, headers: secure(new Headers({ "Content-Type": "application/json", "Cache-Control": "private, max-age=300" }), env, isPrivate) });

// Nearby Geograph photos. The key is the Worker secret GEOGRAPH_KEY, never sent to the browser.
// Geograph's syndicator is for on-demand lookups of a few images, with photographer credit and a link back. Creative Commons.
async function geographNearby(env, url) {
  const key = env.GEOGRAPH_KEY;
  if (!key) return { photos: [], reason: "nokey" };
  const lat = Number(url.searchParams.get("lat")), lng = Number(url.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const q = new URL("https://api.geograph.org.uk/syndicator.php");
  q.searchParams.set("key", key);
  q.searchParams.set("format", "JSON");
  q.searchParams.set("location", lat.toFixed(5) + "," + lng.toFixed(5));
  q.searchParams.set("distance", "1");
  q.searchParams.set("perpage", "6");
  let upstream;
  try { upstream = await fetch(q, { headers: { "Accept": "application/json", "User-Agent": "lidar-lens nearby-photos" } }); }
  catch (e) { return { photos: [], reason: "upstream" }; }
  if (!upstream.ok) return { photos: [], reason: "upstream" };
  let body; try { body = await upstream.json(); } catch (e) { return { photos: [], reason: "upstream" }; }
  const raw = body.items || body.item || (body.channel && (body.channel.item || body.channel.items)) || (Array.isArray(body) ? body : []);
  const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const photos = [];
  for (const it of list) {
    if (!it || typeof it !== "object") continue;
    const link = String(it.link || it.url || "");
    const id = String(it.id || "").match(/(\d+)\s*$/);
    const page = /^https:\/\/www\.geograph\.org\.uk\/photo\/\d+/i.test(link) ? link.split("?")[0] : (id ? "https://www.geograph.org.uk/photo/" + id[1] : "");
    const thumb = String(it.thumbURL || it.thumb || it.thumbnail || "");
    if (!page || !/^https:\/\/([a-z0-9-]+\.)?geograph\.org\.uk\//i.test(thumb)) continue;
    photos.push({ title: String(it.title || "").slice(0, 140), page, thumb, author: String(it.author || it.credit || "photographer").slice(0, 80) });
    if (photos.length === 6) break;
  }
  return { photos };
}


// ---- HER point lookup (links only) ----
const herHits = new Map();
function localLimit(ip, perMin) { const now = Date.now(); let h = herHits.get(ip);
  if (!h || now > h.reset) { h = { n: 0, reset: now + 60000 }; if (herHits.size > 5000) herHits.clear(); herHits.set(ip, h); }
  return ++h.n <= perMin; }
const herCache = new Map(); // chunk key -> parsed features (per isolate)
function segD(px, py, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((px - a[0]) * dx + (py - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy); }
function inRing(px, py, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > py) != (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) c = !c; } return c; }
function geomDist(g, px, py) {
  if (g[0] === "P") return Math.hypot(px - g[1][0], py - g[1][1]);
  let d = 1e9;
  if (g[0] === "L") { for (const l of g[1]) for (let i = 1; i < l.length; i++) d = Math.min(d, segD(px, py, l[i - 1], l[i])); return d; }
  for (const poly of g[1]) { let inside = inRing(px, py, poly[0]); for (let k = 1; k < poly.length; k++) if (inRing(px, py, poly[k])) inside = false; if (inside) return 0;
    for (const r of poly) for (let i = 1; i < r.length; i++) d = Math.min(d, segD(px, py, r[i - 1], r[i])); }
  return d;
}
async function herLookup(env, url) {
  const e = Number(url.searchParams.get("e")), n = Number(url.searchParams.get("n"));
  if (!Number.isFinite(e) || !Number.isFinite(n) || e < 0 || e > 700000 || n < 0 || n > 1300000) return null;
  if (env.HER_BBOX) { const [a, b, c, d] = env.HER_BBOX.split(",").map(Number); if (e < a || e > c || n < b || n > d) return []; }
  const R = 100, cell = Number(env.HER_CELL || 5000), prefix = env.HER_PREFIX || "layers/her/";
  // chunks carry a 200 m buffer, so the click's own cell holds every record within 100 m
  const key = Math.floor(e / cell) + "_" + Math.floor(n / cell);
  let feats = herCache.get(key);
  if (!feats) {
    const obj = await env.LENS_BUCKET.get(prefix + key + ".json");
    feats = obj ? ((await obj.json()).f || []) : [];
    if (herCache.size > 40) herCache.clear();
    herCache.set(key, feats);
  }
  const out = [];
  for (const f of feats) { if (!f.g) continue; const d = geomDist(f.g, e, n); if (d <= R) out.push({ id: f.id, n: f.n || "", t: f.t || "", u: f.u || "", d: Math.round(d) }); }
  out.sort((x, y) => x.d - y.d);
  const seen = new Set();
  return out.filter(r => !seen.has(r.id) && seen.add(r.id)).slice(0, 60);
}


// ---- GB: shared cache of Scottish live LiDAR tiles (z14-17 terrarium PNG, 256 px) in R2 under TC_PREFIX. The first viewer's browser
// builds a tile from the SRSP GeoTIFFs and PUTs it here; later viewers GET it. No expiry; never overwritten; validated before storing.
const TC_W = "gb-live-test/tc/w1/", TC_PREFIX_OLD_BROWSER = "gb-live-test/tc/g1/", TC_STATS = "gb-live-test/tc/_stats.json", TC_W_STATS = "gb-live-test/tc/_w1stats.json", TC_MAX_BYTES = 100e9, TC_MIN = 200, TC_MAXSZ = 400000;
const TC_WPOLY = [[53.36,-3.17],[53.24,-3.0],[53.16,-2.93],[53.08,-2.86],[52.98,-2.73],[52.95,-2.86],[52.91,-3.03],[52.84,-3.03],[52.76,-3.04],[52.70,-3.09],[52.62,-3.12],[52.57,-3.05],[52.50,-3.00],[52.43,-3.04],[52.35,-3.04],[52.27,-3.05],[52.19,-3.07],[52.12,-3.12],[52.06,-3.10],[51.99,-2.98],[51.92,-2.85],[51.85,-2.73],[51.80,-2.67],[51.72,-2.67],[51.64,-2.67],[51.60,-2.68],[51.45,-2.75],[51.30,-3.30],[51.25,-4.80],[51.45,-6.20],[52.10,-6.00],[52.90,-5.20],[53.50,-4.80],[53.55,-3.40],[53.40,-3.20]];
const TC_POLY = [[54.45,-8.9],[54.85,-3.62],[54.97,-3.08],[55.04,-3.03],[55.13,-2.86],[55.23,-2.69],[55.30,-2.56],[55.35,-2.47],[55.42,-2.30],[55.48,-2.18],[55.57,-2.24],[55.64,-2.27],[55.66,-2.17],[55.72,-2.10],[55.78,-2.05],[55.81,-2.04],[55.84,-1.6],[61.6,-0.2],[61.6,-9.5],[54.45,-9.5]];
function tcInScot(lat, lng) { let ins = false; for (let i = 0, j = TC_POLY.length - 1; i < TC_POLY.length; j = i++) { const a = TC_POLY[i], b = TC_POLY[j];
  if (((a[0] > lat) !== (b[0] > lat)) && (lng < (b[1] - a[1]) * (lat - a[0]) / (b[0] - a[0]) + a[1])) ins = !ins } return ins }
function tcPip(P, lat, lng) { let ins = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j];
  if (((a[0] > lat) !== (b[0] > lat)) && (lng < (b[1] - a[1]) * (lat - a[0]) / (b[0] - a[0]) + a[1])) ins = !ins } return ins }
// country of a tile (its centre): 'sco' z14-17 (SRSP), 'wal' / 'eng' z13-17 (EA + Welsh Government via the GB relay test); null: not served
function tcCountry(z, x, y) { const n = 2 ** z; if (x < 0 || y < 0 || x >= n || y >= n) return null;
  const lng = (x + 0.5) / n * 360 - 180, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / n))) * 180 / Math.PI;
  if (lat < 49.8 || lat > 61 || lng < -8.7 || lng > 2) return null;
  if (tcInScot(lat, lng)) return z >= 14 && z <= 17 ? 'sco' : null;
  if (z < 13 || z > 17) return null; return tcPip(TC_WPOLY, lat, lng) ? 'wal' : 'eng' }
function tcTileOk(z, x, y) { return tcCountry(z, x, y) === 'sco' }
const tcHits = new Map();
function tcLimit(ip, perMin) { const now = Date.now(); let h = (tcHits.get(ip) || []).filter(t => now - t < 60000); if (h.length >= perMin) { tcHits.set(ip, h); return false } h.push(now); tcHits.set(ip, h); if (tcHits.size > 5000) tcHits.clear(); return true }
// PNG check: signature, IHDR 256x256 8-bit RGBA, inflate IDAT, unfilter, every opaque pixel a plausible Scottish height
// (-60..1400 m), at least 1% opaque, and mostly smooth (neighbour steps over 150 m on under 1% of pixels), so noise or other images are refused.
async function tcValidate(u8) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10]; for (let i = 0; i < 8; i++) if (u8[i] !== sig[i]) return "not a PNG";
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); let p = 8, idat = [], ihdr = null, tot = 0;
  while (p + 8 <= u8.length) { const len = dv.getUint32(p), type = String.fromCharCode(...u8.subarray(p + 4, p + 8)); if (p + 12 + len > u8.length) return "truncated";
    const d = u8.subarray(p + 8, p + 8 + len); if (type === "IHDR") ihdr = d; else if (type === "IDAT") { idat.push(d); tot += len } else if (type === "IEND") break; p += 12 + len }
  if (!ihdr) return "no IHDR"; const ih = new DataView(ihdr.buffer, ihdr.byteOffset, 13);
  if (ih.getUint32(0) !== 256 || ih.getUint32(4) !== 256 || ihdr[8] !== 8 || ihdr[9] !== 6 || ihdr[12] !== 0) return "not 256x256 RGBA8";
  const z = new Uint8Array(tot); let o = 0; for (const d of idat) { z.set(d, o); o += d.length }
  let raw; try { raw = new Uint8Array(await new Response(new Blob([z]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer()) } catch (e) { return "bad deflate" }
  const W = 256, bpp = 4, st = W * bpp; if (raw.length !== 256 * (st + 1)) return "bad size";
  const px = new Uint8Array(256 * st);
  for (let y = 0; y < 256; y++) { const f = raw[y * (st + 1)], r = raw.subarray(y * (st + 1) + 1, (y + 1) * (st + 1)), cur = px.subarray(y * st, (y + 1) * st), prv = y ? px.subarray((y - 1) * st, y * st) : null;
    for (let i = 0; i < st; i++) { const a = i >= bpp ? cur[i - bpp] : 0, b = prv ? prv[i] : 0, c = (prv && i >= bpp) ? prv[i - bpp] : 0; let v = r[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += (pa <= pb && pa <= pc) ? a : pb <= pc ? b : c } else if (f !== 0) return "bad filter";
      cur[i] = v & 255 } }
  const H = new Float32Array(65536); let op = 0, jumps = 0;
  for (let i = 0; i < 65536; i++) { const k = i * 4; if (px[k + 3] === 0) { H[i] = NaN; continue } if (px[k + 3] !== 255) return "partial alpha";
    const h = px[k] * 256 + px[k + 1] + px[k + 2] / 256 - 32768; if (h < -60 || h > 1400) return "height out of range"; H[i] = h; op++ }
  if (op < 655) return "almost empty";
  for (let i = 0; i < 65536; i++) { if (H[i] !== H[i]) continue; if ((i & 255) < 255 && H[i + 1] === H[i + 1] && Math.abs(H[i + 1] - H[i]) > 150) jumps++; if (i < 65280 && H[i + 256] === H[i + 256] && Math.abs(H[i + 256] - H[i]) > 150) jumps++ }
  if (jumps > op * 0.01) return "not a terrain surface";
  return null;
}
async function tileCache(request, env, url, ctx) {
  // ONE-WAY: browsers only GET. On a miss the Worker builds the tile itself from the SRSP COGs (scot-core.mjs, same code as the browser),
  // stores it in R2 under TC_W (Worker-built only) and serves it. Browser-uploaded tiles under the old g1/ prefix are ignored (kept, not deleted).
  const m = url.pathname.match(/^\/tc\/(\d+)\/(\d+)\/(\d+)\.png$/); if (!m) return null;
  const z = +m[1], x = +m[2], y = +m[3], cc = tcCountry(z, x, y), key = TC_W + cc + "/" + z + "/" + x + "/" + y + ".png", H0 = { "X-Content-Type-Options": "nosniff" };
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { ...H0, Allow: "GET, HEAD" } });
  if (!cc) return new Response("Not a GB tile at a served zoom", { status: 400, headers: H0 });
  const o = await env.LENS_BUCKET.get(key);
  if (o) return new Response(request.method === "HEAD" ? null : o.body, { headers: { ...H0, "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable", "X-TC": "r2" } });
  if (env.TC_BUILD !== "1") return new Response(null, { status: 404, headers: { ...H0, "Cache-Control": "no-store", "X-TC": "miss" } });
  const ip = request.headers.get("CF-Connecting-IP") || "anon";
  if (!tcLimit(ip, Number(env.TC_PER_MIN || 120))) return new Response(null, { status: 429, headers: { ...H0, "Retry-After": "30", "X-TC": "busy" } });
  const t0 = Date.now(), b = await tcBuild(env, cc, z, x, y);
  if (!b) return new Response(null, { status: 404, headers: { ...H0, "Cache-Control": "no-store", "X-TC": "none" } });
  if (b.err) return new Response(null, { status: 503, headers: { ...H0, "Retry-After": "5", "X-TC": "build-error" } });
  const full = await tcFull(env);
  if (!full) ctx.waitUntil(env.LENS_BUCKET.put(key, b.png, { httpMetadata: { contentType: "image/png" }, customMetadata: { by: "worker", at: new Date().toISOString(), bytes: String(b.bytes) }, onlyIf: { etagDoesNotMatch: "*" } }).catch(() => {}));
  return new Response(b.png, { headers: { ...H0, "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable", "X-TC": full ? "built-not-stored-cache-full" : "built", "X-Country": cc, "X-Ms": String(Date.now() - t0) } });
}
let tcReady = null;
async function tcInit(env) {
  if (!tcReady) tcReady = (async () => {
    const io = await env.LENS_BUCKET.get("gb-live-test/live/index.json") || await env.LENS_BUCKET.get("live-test/live/index.json"); if (!io) throw new Error("no index");
    const idx = await io.json(); idx.has = new Set(idx.chunks);
    const pfx = io.key.replace(/index\.json$/, "");
    scotInit({ idx, base: idx.base,
      range: async (u, a, n) => { for (let t = 0; ; t++) { const r = await fetch(u, { headers: { Range: `bytes=${a}-${a + n - 1}` }, cf: { cacheTtl: 2592000, cacheEverything: true } });
          if (r.status === 206 || r.status === 200) return new Uint8Array(await r.arrayBuffer()); if (t >= 2) throw new Error("SRSP " + r.status) } },
      inflate: async u8 => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer()),
      getChunk: async k => { const c = await env.LENS_BUCKET.get(pfx + "chunks/" + k + ".json"); return c ? c.json() : null } });
  })().catch(e => { tcReady = null; throw e });
  return tcReady;
}
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
async function pngRGBA(px) {
  const raw = new Uint8Array(256 * 1025); for (let y = 0; y < 256; y++) { raw[y * 1025] = 0; raw.set(px.subarray(y * 1024, (y + 1) * 1024), y * 1025 + 1) }
  const zd = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  const chunk = (type, d) => { const o = new Uint8Array(12 + d.length), v = new DataView(o.buffer); v.setUint32(0, d.length); o.set(new TextEncoder().encode(type), 4); o.set(d, 8); v.setUint32(8 + d.length, crc32(o.subarray(4, 8 + d.length))); return o };
  const ih = new Uint8Array(13), iv = new DataView(ih.buffer); iv.setUint32(0, 256); iv.setUint32(4, 256); ih[8] = 8; ih[9] = 6;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ih), chunk("IDAT", zd), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length } return out;
}
async function tcBuild(env, cc, z, x, y) {
  if (cc === 'sco') {
    await tcInit(env);
    const { E, N, mpp } = tileEN(z, x, y), st = { bytes: 0, products: 0 }, r = await scotHeights(E, N, mpp, st);
    if (st.err) return { err: true };
    const px = r.any && terrarium(r.h); if (!px) return null;
    return { png: await pngRGBA(new Uint8Array(px.buffer, px.byteOffset, px.byteLength)), bytes: st.bytes };
  }
  ewInit({ grid: () => env.LENS_BUCKET.get("gb-live-test/data/ostn_grid.json").then(o => o ? o.json() : null).catch(() => null),
    relay: path => env.RELAY.fetch(new Request("https://relay" + path, { headers: { "User-Agent": "lidar-lens-gb worker" } })) });
  const st = { bytes: 0 }; let px; try { px = await ewTile(z, x, y, st) } catch (e) { return { err: true } }
  if (!px) return null;
  return { png: await pngRGBA(px), bytes: st.bytes };
}
// size of the Worker-built cache: a scheduled full R2 list of TC_W (resumable across runs), never an in-memory guess
let fullMemo = null;
async function tcFull(env) {
  if (fullMemo && Date.now() - fullMemo.t < 300000) return fullMemo.v;
  let v = false; try { const o = await env.LENS_BUCKET.get(TC_W_STATS); if (o) { const j = await o.json(); v = (j.bytes || 0) >= TC_MAX_BYTES } } catch (e) {}
  fullMemo = { t: Date.now(), v }; return v;
}
async function tcCount(env) {
  let st = {}; try { const o = await env.LENS_BUCKET.get(TC_W_STATS); if (o) st = await o.json() } catch (e) {}
  let run = st.run || { cursor: undefined, n: 0, bytes: 0, by: {}, started: new Date().toISOString() };
  for (let page = 0; page < 400; page++) {
    const l = await env.LENS_BUCKET.list({ prefix: TC_W, cursor: run.cursor, limit: 1000 });
    for (const ob of l.objects) { run.n++; run.bytes += ob.size; const c = ob.key.slice(TC_W.length).split("/")[0]; run.by[c] = (run.by[c] || 0) + ob.size }
    if (!l.truncated) { st = { n: run.n, bytes: run.bytes, byCountry: run.by, cap: TC_MAX_BYTES, countedFrom: run.started, at: new Date().toISOString() };
      await env.LENS_BUCKET.put(TC_W_STATS, JSON.stringify(st), { httpMetadata: { contentType: "application/json" } }); return st }
    run.cursor = l.cursor }
  st.run = run; await env.LENS_BUCKET.put(TC_W_STATS, JSON.stringify(st), { httpMetadata: { contentType: "application/json" } }); return st;
}

export default {
  async scheduled(ev, env, ctx) { ctx.waitUntil(tcCount(env)) },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const isPrivate = !!env.PASSWORD, indexable = !isPrivate && env.PUBLIC_INDEX === "1";
    if (url.pathname === "/tc/_recount") {   // at most once per 10 min (else the stored figure)
      const o = await env.LENS_BUCKET.get(TC_W_STATS); const j = o ? await o.json() : {};
      if (j.at && Date.now() - Date.parse(j.at) < 600000 && !j.run) return new Response(JSON.stringify(j), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
      return new Response(JSON.stringify(await tcCount(env)), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }) }
    if (url.pathname === "/tc/_stats") { const o = await env.LENS_BUCKET.get(TC_W_STATS); return new Response(o ? o.body : "{}", { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }) }
    if (url.pathname.startsWith("/tc/")) { const r = await tileCache(request, env, url, ctx); if (r) return r }
    if (request.method !== "GET" && request.method !== "HEAD") return plain(env, isPrivate, "Method not allowed", 405, { Allow: "GET, HEAD" });

    if (env.RATE_LIMITER) { // abuse protection: e.g. 1200 requests / 60 s per IP (set in wrangler config)
      const ip = request.headers.get("CF-Connecting-IP") || "anon";
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) return plain(env, isPrivate, "Too many requests, please slow down", 429, { "Retry-After": "60" });
    }
    if (url.pathname === "/api/rc") {   // GB: edge cache (Cache API, 1 day) for the open record services (HES, Canmore, DataMapWales/Cadw/Coflein)
      const sameOrigin = !request.headers.get("Origin") || request.headers.get("Origin") === url.origin;
      if (!sameOrigin) return plain(env, isPrivate, "Forbidden", 403);
      let up; try { up = new URL(url.searchParams.get("u") || ""); } catch (e) { return plain(env, isPrivate, "Bad url", 400); }
      if (up.protocol !== "https:" || !["inspire.hes.scot", "datamap.gov.wales"].includes(up.hostname)) return plain(env, isPrivate, "Host not allowed", 400);
      const ck = new Request("https://rc-cache.invalid/" + encodeURIComponent(up.href)), cache = caches.default;
      let hit = await cache.match(ck);
      if (hit) { const h = new Headers(hit.headers); h.set("X-RC", "hit"); return new Response(hit.body, { status: 200, headers: h }); }
      let r; try { r = await fetch(up.href, { headers: { "User-Agent": "lidar-lens-gb" }, signal: AbortSignal.timeout(20000) }); } catch (e) { return json(env, isPrivate, { error: "upstream " + up.hostname + " unreachable" }, 502); }
      const body = await r.text();
      if (!r.ok || /"error"\s*:/.test(body.slice(0, 200))) return new Response(body, { status: r.ok ? 502 : r.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-RC": "upstream-error" } });
      const resp = new Response(body, { headers: { "Content-Type": r.headers.get("Content-Type") || "application/json", "Cache-Control": "public, max-age=86400", "X-RC": "miss" } });
      ctx.waitUntil(cache.put(ck, resp.clone()));
      return resp;
    }
    if (url.pathname === "/api/geograph") {
      const ip = request.headers.get("CF-Connecting-IP") || "anon";
      if (!localLimit(ip, 20)) return json(env, isPrivate, { photos: [], reason: "busy" }, 429);
      const sameOrigin = !request.headers.get("Origin") || request.headers.get("Origin") === url.origin;
      if (!sameOrigin) return plain(env, isPrivate, "Forbidden", 403);
      const out = await geographNearby(env, url);
      if (out === null) return plain(env, isPrivate, "Bad point", 400);
      return json(env, isPrivate, out, 200);
    }
    if (url.pathname === "/api/her") {
      if (env.HER_API !== "1") return plain(env, isPrivate, "Not found", 404);
      const ip = request.headers.get("CF-Connecting-IP") || "anon";
      let limited = !localLimit(ip, Number(env.HER_PER_MIN || 30)); // per-isolate backstop (the API limiter is approximate)
      if (!limited && env.HER_LIMITER) { const { success } = await env.HER_LIMITER.limit({ key: "her:" + ip }); limited = !success; }
      if (limited) return plain(env, isPrivate, "Too many lookups, please slow down", 429, { "Retry-After": "60" });
      const sameOrigin = !request.headers.get("Origin") || request.headers.get("Origin") === url.origin;
      if (!sameOrigin) return plain(env, isPrivate, "Forbidden", 403);
      const recs = await herLookup(env, url);
      if (recs === null) return plain(env, isPrivate, "Bad point", 400);
      return new Response(JSON.stringify({ r: recs }), { headers: secure(new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" }), env, isPrivate) });
    }
    if (url.pathname === "/robots.txt")
      return plain(env, isPrivate, indexable ? "User-agent: *\nDisallow: /terrain/\nDisallow: /layers/\n" : "User-agent: *\nDisallow: /\n", 200);

    if (isPrivate) {
      const auth = request.headers.get("Authorization") || "";
      const [scheme, encoded] = auth.split(" ");
      let ok = false;
      if (scheme === "Basic" && encoded) {
        let decoded = ""; try { decoded = Buffer.from(encoded, "base64").toString(); } catch (e) {}
        const i = decoded.indexOf(":");
        ok = i !== -1 && timingSafeEqual(env.PASSWORD, decoded.substring(i + 1)); // any username
      }
      if (!ok) return plain(env, isPrivate, "Authentication required", 401, { "WWW-Authenticate": 'Basic realm="LiDAR Lens", charset="UTF-8"' });
    }

    let key; try { key = decodeURIComponent(url.pathname.slice(1)); } catch (e) { return plain(env, isPrivate, "Bad path", 400); }
    if (key === "" || key.endsWith("/")) key += "index.html";
    if (key.includes("..") || key.includes("\\") || key.length > 300) return plain(env, isPrivate, "Bad path", 400);
    // Never serve HER data, tests or key-like files, whatever the bucket holds.
    if (/(^|\/)(her|tests?|private)(\/|$)|\.(key|pem|env|p12)$|(^|\/)\./i.test(key)) return plain(env, isPrivate, "Not found", 404);
    const rel = key; // path as requested, before any SITE_PREFIX mapping (used for cache rules)
    if (env.SITE_PREFIX) { // strict allowlist mode for a public Worker sharing a bucket
      if (env.SHARED && new RegExp(env.SHARED).test(key)) { /* shared tiles / open layers: key unchanged */ }
      else key = env.SITE_PREFIX + key;
    }

    // Public mode: serve repeat requests for long-cached files (tiles, terrain, layer chunks, hashed assets) from the
    // Cloudflare edge cache (caches.default). Cuts R2 reads and absorbs bursts. The cache key includes the R2 object's
    // etag (one cheap head() per request), so re-uploading an object under the same path gets a fresh key at once
    // instead of the old body being served until the 30-day TTL expires.
    const immutable = rel.startsWith("assets/") || rel.startsWith("tiles/") || rel.startsWith("terrain/") || (rel.startsWith("layers/") && !rel.endsWith("index.json"));
    const useEdge = !isPrivate && immutable && request.method === "GET" && !request.headers.get("range");
    const cache = caches.default;
    // terrain/ tiles missing from this lens's bucket fall back to FALLBACK_BUCKET (read-only, e.g. the Orkney lens bucket)
    // LIVE_ONLY (Scotland live test): never serve pre-built terrain; z8-13 from the overview, z14-17 are made in the browser
    if (env.LIVE_ONLY === "1" && rel.startsWith("terrain/")) {
      if (!env.OV_PREFIX || !/^terrain\/(8|9|10|11|12|13)\//.test(rel)) return plain(env, isPrivate, "Not found", 404);
      key = env.OV_PREFIX + rel;
    }
    let bucket = env.LENS_BUCKET;
    let cacheKey = null;
    if (useEdge) {
      let meta = await bucket.head(key);
      if (meta === null && env.LIVE_ONLY !== "1" && env.FALLBACK_BUCKET && rel.startsWith("terrain/")) { bucket = env.FALLBACK_BUCKET; meta = await bucket.head(key); }
      // TEST (Scotland live): z8-13 overview tiles made from the SRSP GeoTIFFs, used only where no pre-built tile exists
      if (meta === null && env.OV_PREFIX && /^terrain\/(8|9|10|11|12|13)\//.test(rel)) { bucket = env.LENS_BUCKET; key = env.OV_PREFIX + rel; meta = await bucket.head(key); }
      if (meta === null) return plain(env, isPrivate, "Not found", 404);
      cacheKey = new Request(url.origin + "/" + key + "?v=" + encodeURIComponent(meta.etag), { method: "GET" });
      const hit = await cache.match(cacheKey);
      if (hit) {
        const inm = request.headers.get("if-none-match");
        if (inm && inm === hit.headers.get("etag")) return new Response(null, { status: 304, headers: hit.headers });
        return hit;
      }
    }

    let object = await bucket.get(key, { onlyIf: request.headers, range: request.headers });
    if (object === null && !useEdge && env.LIVE_ONLY !== "1" && bucket === env.LENS_BUCKET && env.FALLBACK_BUCKET && rel.startsWith("terrain/"))
      object = await env.FALLBACK_BUCKET.get(key, { onlyIf: request.headers, range: request.headers });
    if (object === null) return plain(env, isPrivate, "Not found", 404);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    const ext = key.split(".").pop().toLowerCase();
    if (TYPES[ext]) headers.set("Content-Type", TYPES[ext]);
    const scope = isPrivate ? "private" : "public";
    // assets/ have content-hashed names; tiles and chunks never change in place -> long cache. Everything else revalidates.
    headers.set("Cache-Control", rel.startsWith("assets/") ? scope + ", max-age=31536000, immutable"
      : immutable ? scope + ", max-age=2592000, immutable" : scope + ", no-cache, must-revalidate");
    secure(headers, env, isPrivate);
    const origin = request.headers.get("Origin");
    if (env.ALLOW_ORIGIN) { // only needed if the viewer is hosted on a different origin
      headers.append("Vary", "Origin");
      if (origin === env.ALLOW_ORIGIN) {
        headers.set("Access-Control-Allow-Origin", origin);
        if (isPrivate) headers.set("Access-Control-Allow-Credentials", "true");
      }
    }
    if (!("body" in object)) return new Response(null, { status: 304, headers }); // onlyIf precondition failed
    const res = new Response(request.method === "HEAD" ? null : object.body,
      { status: object.range && request.headers.get("range") ? 206 : 200, headers });
    if (cacheKey && res.status === 200) ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  },
};
