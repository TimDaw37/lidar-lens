// LiDAR Lens - R2 server. Serves the viewer, tiles and layer chunks from one R2 bucket on one origin.
// Private mode: set the Worker secret PASSWORD (Basic auth, any username). Public mode: leave PASSWORD unset.
// Set PUBLIC_INDEX=1 to allow search engines (public mode only). No secrets in this file.
import { Buffer } from "node:buffer";
const enc = new TextEncoder();
function timingSafeEqual(a, b) {
  const aB = enc.encode(a), bB = enc.encode(b);
  if (aB.byteLength !== bB.byteLength) return !crypto.subtle.timingSafeEqual(aB, aB); // still spend the time
  return crypto.subtle.timingSafeEqual(aB, bB);
}
const TYPES = { webp: "image/webp", json: "application/json", geojson: "application/geo+json", js: "text/javascript",
  html: "text/html; charset=utf-8", css: "text/css", png: "image/png", txt: "text/plain" };
const unauthorized = () => new Response("Authentication required", { status: 401,
  headers: { "WWW-Authenticate": 'Basic realm="LiDAR Lens", charset="UTF-8"', "X-Robots-Tag": "noindex, nofollow" } });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const isPrivate = !!env.PASSWORD, indexable = !isPrivate && env.PUBLIC_INDEX === "1";
    if (url.pathname === "/robots.txt")
      return new Response(indexable ? "User-agent: *\nDisallow: /terrain/\nDisallow: /layers/\n" : "User-agent: *\nDisallow: /\n", { headers: { "Content-Type": "text/plain" } });
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });

    if (isPrivate) {
    const auth = request.headers.get("Authorization") || "";
    const [scheme, encoded] = auth.split(" ");
    if (scheme !== "Basic" || !encoded) return unauthorized();
    const decoded = Buffer.from(encoded, "base64").toString();
    const i = decoded.indexOf(":");
    if (i === -1 || !timingSafeEqual(env.PASSWORD, decoded.substring(i + 1))) return unauthorized(); // any username
    }

    let key = decodeURIComponent(url.pathname.slice(1));
    if (key === "" || key.endsWith("/")) key += "index.html";
    if (key.includes("..")) return new Response("Bad path", { status: 400 });

    const object = await env.LENS_BUCKET.get(key, { onlyIf: request.headers, range: request.headers });
    if (object === null) return new Response("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex" } });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    const ext = key.split(".").pop().toLowerCase();
    if (!headers.get("Content-Type") && TYPES[ext]) headers.set("Content-Type", TYPES[ext]);
    // Tiles and chunks never change in place -> long private browser cache (cuts R2 reads and Worker requests).
    const immutable = key.startsWith("tiles/") || key.startsWith("terrain/") || (key.startsWith("layers/") && !key.endsWith("index.json"));
    const scope = isPrivate ? "private" : "public";
    headers.set("Cache-Control", immutable ? scope + ", max-age=2592000, immutable" : scope + ", no-cache");
    if (!indexable) headers.set("X-Robots-Tag", "noindex, nofollow");
    if (env.ALLOW_ORIGIN) { // only needed if the viewer is hosted on a different origin
      headers.set("Access-Control-Allow-Origin", env.ALLOW_ORIGIN);
      headers.set("Access-Control-Allow-Credentials", "true");
    }
    if (!("body" in object)) return new Response(null, { status: 304, headers }); // onlyIf precondition failed
    return new Response(request.method === "HEAD" ? null : object.body,
      { status: object.range && request.headers.get("range") ? 206 : 200, headers });
  },
};
