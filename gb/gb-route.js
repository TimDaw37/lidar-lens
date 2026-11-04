// ---- GB router (lidar-lens-gb-live-test): each terrain tile goes to the pipeline of the country under its centre.
// Scotland (the countryRegions polygon in the config): z14-17 live from SRSP (SCOTLAND above), z8-13 the light SRSP overview the
// Worker serves (OV_PREFIX). England and Wales: the EA / Welsh Government pipeline above, unchanged (z13-17).
const SC_POLY = __SC_POLY__;
// TEST: Cadw / Coflein (DataMapWales WFS) lookups go through the Worker's edge cache (api/rc, 1 day), so a repeat lookup in Wales skips DataMapWales
const _rcFetch = self.fetch.bind(self);
self.fetch = (u, o) => { if (typeof u === 'string' && u.startsWith('https://datamap.gov.wales/geoserver/ows?') && u.includes('GetFeature')) u = new URL('api/rc?u=' + encodeURIComponent(u), self.registration.scope).href; return _rcFetch(u, o) };
// Scottish HES cell records: keep only those within R of the click (a 5 km cell holds records up to ~5 km away)
function gDist(g, E, N) { let best = Infinity, inside = false; const pts = [];
  (function walk(a) { if (Array.isArray(a) && typeof a[0] === 'number') pts.push(a); else if (Array.isArray(a)) a.forEach(walk) })(g && g[1]);
  (function rings(a) { if (!Array.isArray(a)) return; if (Array.isArray(a[0]) && typeof a[0][0] === 'number') { if (g[0] === 'A') { let ins = false; for (let i = 0, j = a.length - 1; i < a.length; j = i++) { const p = a[i], q = a[j]; if (((p[1] > N) !== (q[1] > N)) && (E < (q[0] - p[0]) * (N - p[1]) / (q[1] - p[1]) + p[0])) ins = !ins } if (ins) inside = !inside } return } a.forEach(rings) })(g && g[1]);
  if (inside) return 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i]; best = Math.min(best, Math.hypot(p[0] - E, p[1] - N)); const q = pts[i + 1]; if (q && g[0] !== 'P') { const dx = q[0] - p[0], dy = q[1] - p[1], L2 = dx * dx + dy * dy; if (L2) { const t = Math.max(0, Math.min(1, ((E - p[0]) * dx + (N - p[1]) * dy) / L2)); best = Math.min(best, Math.hypot(p[0] + t * dx - E, p[1] + t * dy - N)) } } }
  return best }
function inScot(lat, lng) { let ins = false; for (let i = 0, j = SC_POLY.length - 1; i < SC_POLY.length; j = i++) { const a = SC_POLY[i], b = SC_POLY[j];
  if (((a[0] > lat) !== (b[0] > lat)) && (lng < (b[1] - a[1]) * (lat - a[0]) / (b[0] - a[0]) + a[1])) ins = !ins } return ins }
async function route(z, x, y, ev) {
  const n = 2 ** z;
  if (inScot(tile2lat(y + 0.5, n), tile2lng(x + 0.5, n))) {
    if (z >= 14 && z <= 17) return SCOTLAND.tile(z, x, y, false);
    if (z >= 8 && z <= 13) { try { const r = await fetch(new URL(`terrain/${z}/${x}/${y}.webp`, self.registration.scope)); return r.ok ? r : none() } catch (e) { return busy() } }
    return none();
  }
  // England / Wales: the same one-way shared cache (Worker builds from EA / Welsh Government via the GB relay test); local build after 6 s, display only
  if (z >= 13 && z <= 17) return SCOTLAND.tile(z, x, y, false, () => tile(z, x, y, ev));
  return tile(z, x, y, ev);
}
function preTile(z, x, y) { const n = 2 ** z; return inScot(tile2lat(y + 0.5, n), tile2lng(x + 0.5, n)) ? (z >= 14 ? SCOTLAND.tile(z, x, y, true) : Promise.resolve()) : SCOTLAND.tile(z, x, y, true, () => tile(z, x, y)) }
// 'What's here?' records: England/Wales 5 km cells live (above); Scotland cells are the HES files on the Worker (same 5 km BNG grid).
let SIDX = null, sidxP = null;
function sIdx() { if (!sidxP) sidxP = fetch(new URL('layers/index.json', self.registration.scope)).then(r => r.ok ? r.json() : null).then(j => { SIDX = j; return j }).catch(() => { sidxP = null; return null }); return sidxP }
const SK = () => (SIDX && SIDX.layers && SIDX.layers.rec) ? (SIDX._set || (SIDX._set = new Set(SIDX.layers.rec))) : new Set();
async function indexAll() {
  const e = index(), s = await sIdx();
  if (s && s.layers && s.layers.rec) { const set = new Set(e.layers.rec); for (const k of s.layers.rec) set.add(k); e.layers.rec = [...set]; Object.assign(e.sources, s.sources || {}) }
  return json(e);
}
const scell = new Map();
function scotCell(k) {
  if (!scell.has(k)) scell.set(k, fetch(new URL('layers/v2/rec/' + k + '.json', self.registration.scope)).then(r => r.ok ? r.json() : { f: [] }).then(j => j.f || []).catch(() => { scell.delete(k); return [] }));
  return scell.get(k);
}
const SCOT_ONLY_N = 600000;   // north of this, cells only in the Scotland list skip the Historic England / Cadw queries
async function recCellAll(cx, cy) {
  await sIdx(); const k = cx + '_' + cy, inS = SK().has(k);
  if (!inS) return recCell(cx, cy);
  const sf = await scotCell(k);
  if (cy * CELL >= SCOT_ONLY_N || cy * CELL > ENG.n1) return json({ f: sf });
  const r = await recCell(cx, cy); let j = {}; try { j = await r.json() } catch (e) {}
  return json({ ...j, f: [...(j.f || []), ...sf] });
}
async function recNearAll(E, N, R, ev) {
  await sIdx(); const set = SK(), keys = [], x0 = E - R - 20, y0 = N - R - 20, x1 = E + R + 20, y1 = N + R + 20;
  for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) keys.push(cx + '_' + cy);
  const sk = keys.filter(k => set.has(k)), doE = !(sk.length === keys.length && N >= SCOT_ONLY_N) && N <= ENG.n1 + R;
  if (!sk.length) return recNear(E, N, R, ev);
  const [eRes, sf] = await Promise.all([doE ? recNear(E, N, R, ev).then(r => r.json()).catch(() => ({})) : {}, Promise.all(sk.map(scotCell))]);
  const out = { f: [...(eRes.f || []), ...sf.flat().filter((r, i, a) => (!r.g || gDist(r.g, E, N) <= R + 20) && a.findIndex(o => o.s === r.s && o.id === r.id) === i)] }; if (eRes.missing) out.missing = eRes.missing; if (eRes.error) out.missing = [...(out.missing || []), 'Historic England'];
  return json(out);
}
