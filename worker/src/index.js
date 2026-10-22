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
  const connect = ["'self'", "https://api.postcodes.io", "https://nominatim.openstreetmap.org", "https://cloudflareinsights.com"].concat((env.CSP_CONNECT || "").split(/\s+/).filter(Boolean));
  return ["default-src 'self'", "script-src 'self' https://static.cloudflareinsights.com", "style-src 'self' 'unsafe-inline'", "img-src " + img.join(" "),
    "connect-src " + connect.join(" "), "font-src 'self'", "worker-src 'none'", "object-src 'none'", "base-uri 'none'",
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const isPrivate = !!env.PASSWORD, indexable = !isPrivate && env.PUBLIC_INDEX === "1";
    if (request.method !== "GET" && request.method !== "HEAD") return plain(env, isPrivate, "Method not allowed", 405, { Allow: "GET, HEAD" });

    if (env.RATE_LIMITER) { // abuse protection: e.g. 1200 requests / 60 s per IP (set in wrangler config)
      const ip = request.headers.get("CF-Connecting-IP") || "anon";
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) return plain(env, isPrivate, "Too many requests, please slow down", 429, { "Retry-After": "60" });
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

    // Public mode: serve repeat requests for never-changing files from the Cloudflare edge cache (custom domains only;
    // the Cache API is a no-op on workers.dev). Cuts R2 reads and absorbs bursts.
    const immutable = rel.startsWith("assets/") || rel.startsWith("tiles/") || rel.startsWith("terrain/") || (rel.startsWith("layers/") && !rel.endsWith("index.json"));
    const useEdge = !isPrivate && immutable && request.method === "GET" && !request.headers.get("range");
    const cache = caches.default, cacheKey = new Request(url.origin + "/" + key, { method: "GET" });
    if (useEdge) { const hit = await cache.match(cacheKey); if (hit) return hit; }

    const object = await env.LENS_BUCKET.get(key, { onlyIf: request.headers, range: request.headers });
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
    if (useEdge && res.status === 200) ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  },
};
