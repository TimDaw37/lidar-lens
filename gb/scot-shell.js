// ---- Scotland pipeline (GB lens). z14-17: made here, live, from the SRSP GeoTIFFs (core above, same as the Scotland live test).
const SVER = 'g1', STILES = 'scot-live-tiles-' + SVER;
let active = 0; const q = [];
function slot() { return new Promise(r => { if (active < 8) { active++; r() } else q.push(r) }) }
function free() { const n = q.pop(); if (n) n(); else active-- }
async function range(url, a, n) {
  await slot();
  try { for (let t = 0; ; t++) { let r = null; try { r = await fetch(url, { headers: { Range: `bytes=${a}-${a + n - 1}` }, mode: 'cors', credentials: 'omit' }) } catch (e) { if (t >= 2) throw e }
      if (r && (r.status === 206 || r.status === 200)) return new Uint8Array(await r.arrayBuffer());
      if (r && (r.status < 500 || t >= 2)) throw new Error('SRSP ' + r.status);
      await new Promise(res => setTimeout(res, 400 * (t + 1))) } }
  finally { free() }
}
async function inflate(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()) }
let ready = null;
function init() {
  if (!ready) ready = fetch(new URL('live/index.json', self.registration.scope)).then(r => { if (!r.ok) throw new Error('index ' + r.status); return r.json() }).then(idx => {
    idx.has = new Set(idx.chunks);
    scotInit({ idx, base: idx.base, range, inflate, getChunk: k => fetch(new URL('live/chunks/' + k + '.json', self.registration.scope)).then(r => r.json()) });
  }).catch(e => { ready = null; throw e });
  return ready;
}
const sbusy = () => new Response(null, { status: 503, headers: { 'Retry-After': '2' } }), snone = () => new Response(null, { status: 404 });
const making = new Map();
async function stile(z, x, y, isPre, localFn) {   // localFn: the England/Wales in-browser builder (display only); none = Scotland's
  if (!isPre) ring(z, x, y);
  const c = await caches.open(STILES), key = `https://scot-live.invalid/${SVER}/${z}/${x}/${y}.png`, hit = await c.match(key);
  if (hit) return hit;
  const tk = z + '/' + x + '/' + y;
  if (!making.has(tk)) making.set(tk, (async () => {
    const t0 = Date.now();
    // ONE-WAY shared cache: ask the Worker (R2 hit, or it builds the tile from SRSP itself and stores it). If it has not answered
    // in 4 s or fails, also build here for display; whichever is first is shown. The browser never uploads.
    const wk = fetch(new URL(`tc/${z}/${x}/${y}.png`, self.registration.scope)).then(async sr => { if (sr.status === 404 && sr.headers.get('X-TC') === 'none') return 'none'; if (!sr.ok) throw sr.status;
      const res = new Response(await sr.blob(), { headers: { 'Content-Type': 'image/png', 'X-Live': sr.headers.get('X-TC') === 'built' ? 'worker-built' : 'shared', 'X-Ms': String(Date.now() - t0) } }); await c.put(key, res.clone()); return res });
    const first = await Promise.race([wk.catch(() => null), new Promise(r => setTimeout(() => r('slow'), 6000))]);
    if (first && first !== 'slow') return first;   // a Response, or 'none' (no data here)
    const local = localFn ? localFn().then(r => r && r.ok && r.status === 200 ? r : 'none') : (async () => { await init();
    const { E, N, mpp } = tileEN(z, x, y), st = { bytes: 0, products: 0 }, r = await scotHeights(E, N, mpp, st);
    const px = r.any && terrarium(r.h); if (!px) return st.err ? 'busy' : 'none';
    const cv = new OffscreenCanvas(256, 256); cv.getContext('2d').putImageData(new ImageData(px, 256, 256), 0, 0);
    const blob = await cv.convertToBlob({ type: 'image/png' });
    const res = new Response(blob, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400', 'X-Live': 'srsp', 'X-Bytes': String(st.bytes), 'X-Ms': String(Date.now() - t0) } });
    if (!st.err) await c.put(key, res.clone());
    return res; })();
    if (first === 'slow') { const w = await Promise.any([wk.then(r => r === 'none' ? Promise.reject(r) : r), local.then(r => (r instanceof Response) ? r : Promise.reject(r))]).catch(() => null); return w || local }
    return local;
  })().finally(() => setTimeout(() => making.delete(tk), 0)));
  try { const r = await making.get(tk); return r === 'busy' ? sbusy() : r === 'none' ? snone() : r.clone() } catch (e) { return sbusy() }
}

// prefetch: after a tile is asked for, its 8 neighbours are made (or fetched from the shared cache) at low priority, one at a time,
// only when nothing in the foreground is building; newest view first; a duplicate is skipped (local cache / in-flight check).
const pre = []; let preBusy = false;
function ring(z, x, y) { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (dx || dy) { const k = z + '/' + (x + dx) + '/' + (y + dy); const i = pre.indexOf(k); if (i >= 0) pre.splice(i, 1); pre.push(k) }
  while (pre.length > 48) pre.shift(); setTimeout(preRun, 1500) }
async function preRun() {
  if (preBusy) return; preBusy = true;
  try { while (pre.length) { if (making.size || active) { await new Promise(r => setTimeout(r, 700)); continue }
      const k = pre.pop(), [z, x, y] = k.split('/').map(Number); const c = await caches.open(STILES);
      if (await c.match(`https://scot-live.invalid/${SVER}/${z}/${x}/${y}.png`)) continue;
      await preTile(z, x, y).catch(() => {}) } } finally { preBusy = false } }
