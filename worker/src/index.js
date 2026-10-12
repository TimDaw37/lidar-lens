// LiDAR Lens - R2 server. Serves the viewer, tiles and layer chunks from one R2 bucket on one origin.
// Private mode: set the Worker secret PASSWORD (Basic auth, any username). Public mode: leave PASSWORD unset.
// Optional vars: PUBLIC_INDEX="1" (allow search engines, public mode only), ALLOW_ORIGIN (one extra origin
// allowed to read tiles cross-origin), CSP_CONNECT / CSP_IMG (extra space-separated hosts for the CSP).
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
  const connect = ["'self'", "https://api.postcodes.io", "https://nominatim.openstreetmap.org"].concat((env.CSP_CONNECT || "").split(/\s+/).filter(Boolean));
  return ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src " + img.join(" "),
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

    // Public mode: serve repeat requests for never-changing files from the Cloudflare edge cache (custom domains only;
    // the Cache API is a no-op on workers.dev). Cuts R2 reads and absorbs bursts.
    const immutable = key.startsWith("assets/") || key.startsWith("tiles/") || key.startsWith("terrain/") || (key.startsWith("layers/") && !key.endsWith("index.json"));
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
    headers.set("Cache-Control", key.startsWith("assets/") ? scope + ", max-age=31536000, immutable"
      : immutable ? scope + ", max-age=2592000, immutable" : scope + ", no-cache");
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
