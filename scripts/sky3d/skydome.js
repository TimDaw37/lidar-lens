// LiDAR Lens: sky dome for the 3D view. Built with astro.js and astronomy-engine into site/vendor/sky3d.js (global LLSKY)
// by scripts/build_sky3d.mjs, and fetched only when Sky is ticked. three.js comes from the 3D view (ctx.T).
// The dome is centred on the eye at the viewpoint: the skyline swept by View from here is its rim, so the Sun, the Moon
// and the stars meet the ground where they would be seen to from that spot.
import * as A from './astro.js';
import STARS from './bright_stars.json';
export { A as astro };

const D2R = Math.PI / 180, lin = c => Math.pow(c, 2.2), mix = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const dir = (az, alt) => { const a = az * D2R, e = alt * D2R; return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)]; };   // x east, y up, z south
const PTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const sgn = (v, d) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d == null ? 2 : d) + '°';
const hhmm = m => { m = Math.round(m) % 1440; if (m < 0) m += 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const yearName = y => y > 0 ? y + ' AD' : (1 - y) + ' BC';

const CSS = '#v3dsky{display:flex;flex-direction:column;gap:4px;padding:6px 12px;border-top:1px solid #e5e7eb;background:#f8fafc}#v3dsky[hidden]{display:none}' +
  '#v3dsky .grp{display:flex;flex-wrap:wrap;align-items:center;gap:4px 14px}#v3dsky .gl{font-size:11px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:.04em;min-width:54px}' +
  '#v3dsky .seg{display:inline-flex;gap:4px}#v3dsky .sp{flex:1}' +
  '#v3dsky label{display:flex;align-items:center;gap:5px;margin:0;white-space:nowrap}#v3dsky input[type=number]{width:58px;font-size:13px}#v3dsky input[type=range]{width:150px}#v3dsky select{font-size:13px}' +
  '#skydv,#skytv{display:inline-block;min-width:44px;font-variant-numeric:tabular-nums;font-weight:600}' +
  '#v3dsky button{font-size:13px;padding:4px 9px;margin:0;width:auto;cursor:pointer;border:1px solid #bbb;border-radius:4px;background:#f3f4f6;color:#111}#v3dsky button:hover{background:#e5e7eb}#v3dsky button.on{background:#f59e0b;border-color:#b45309;font-weight:600}' +
  '#skyplay{min-width:62px}#skystand{font-weight:600}' +
  '#skyread{margin:0;color:#111;font-size:12px;font-variant-numeric:tabular-nums;line-height:1.4}' +
  '#v3dsky details{font-size:12px;color:#555}#v3dsky details summary{padding:0;min-height:0;color:#1d4ed8;font-size:12px}#v3dsky details[open] summary{margin-bottom:4px}#v3dsky details .grp{gap:4px 14px}' +
  '#skykey{margin:4px 0 0;color:#555;font-size:12px;line-height:1.5}#skykey i{display:inline-block;width:14px;height:3px;vertical-align:middle;margin:0 3px 0 8px}#skykey i:first-child{margin-left:0}' +
  '#skylook{position:absolute;left:50%;top:10px;transform:translateX(-50%);background:rgba(17,24,39,.72);color:#fff;padding:4px 10px;border-radius:6px;font-size:13px;pointer-events:none;white-space:nowrap}#skylook[hidden]{display:none}' +
  '@media (max-width:700px){#v3dsky{max-height:34vh;overflow:auto;padding:6px 8px}#v3dsky .gl{display:none}#v3dsky .grp{gap:6px 10px}#v3dsky input[type=range]{width:120px}#v3dsky button{min-height:36px}#v3dsky .sp{display:none}}';
const HTML = '<div class="grp" role="group" aria-label="When"><span class="gl">When</span>' +
  '<label title="Year: 4500 BC to 4500 AD">Year <input type="number" id="skyyr" min="1" max="4500" step="1"><select id="skyera" aria-label="Era"><option value="AD">AD</option><option value="BC">BC</option></select></label>' +
  '<label title="Day of the year">Day <span id="skydv"></span><input type="range" id="skyday" min="1" max="365" step="1" aria-label="Day of the year"></label>' +
  '<label title="Time of day, Universal Time (GMT)">UT <span id="skytv"></span><input type="range" id="skytime" min="0" max="1439.5" step="0.5" aria-label="Time of day (UT)"></label>' +
  '<button id="skyplay" title="Let the sky turn">Play</button>' +
  '<select id="skygo" aria-label="Go to a day" title="Jump to a solstice, an equinox or today"><option value="">Go to…</option><option value="midsummer">Midsummer solstice</option><option value="midwinter">Midwinter solstice</option><option value="spring">Spring equinox</option><option value="autumn">Autumn equinox</option><option value="today">Today</option></select></div>' +
  '<div class="grp" role="group" aria-label="Find a rising or setting"><span class="gl">Find</span><span class="seg">' +
  '<button id="skysr" title="Seek the Sun rising over the skyline on this day">Sunrise</button><button id="skyss" title="Seek the Sun setting behind the skyline on this day">Sunset</button>' +
  '<button id="skymr" title="Seek the Moon rising over the skyline">Moonrise</button><button id="skyms" title="Seek the Moon setting behind the skyline">Moonset</button></span>' +
  '<span class="sp"></span><span class="seg"><button id="skyinside" aria-pressed="false" title="Inside the dome (the usual view): the ground sits at the foot of the screen and the sky fills the view. Drag to look round, scroll to move in or out. Click to see the dome from outside, over the whole block.">Inside the dome</button><button id="skystand" title="Stand at the viewpoint, eyes 1.5 m above the ground. Drag to look round, scroll to zoom.">Stand at the viewpoint</button></span></div>' +
  '<p id="skyread" aria-live="off"></p>' +
  '<details id="skymore"><summary>Paths, key and options</summary><div class="grp">' +
  '<label title="Paths of the Sun at the solstices and equinoxes, and of the Moon at its major and minor standstill limits, for the year shown"><input type="checkbox" id="skyarcs" checked> Solstice and standstill paths</label>' +
  '<label title="Which part of the disc meets the skyline when seeking a rising or setting">Seek to <select id="skylimb"><option value="first_gleam">First gleam (top edge)</option><option value="half">Half orb (centre)</option><option value="full_orb">Full orb (bottom edge)</option></select></label></div>' +
  '<p id="skykey"></p></details>';

/**
 * ctx: {T, scene, camera, controls, canvas, stage, host (element the controls go in), vs (View from here result), diam (block width, m),
 *       eyeAt(ve) -> [x,y,z] of the eye in the block's frame, setSun(az, altOrNull, day 0-1), setVE(1|null), dirty(), resetCam()}
 */
export function create(ctx) {
  const T = ctx.T, vs = ctx.vs, obs = A.makeObserver(vs.ll.lat, vs.ll.lng), Rd = ctx.diam * 1.6, $ = id => document.getElementById(id);
  if (!$('skycss')) { const st = document.createElement('style'); st.id = 'skycss'; st.textContent = CSS; document.head.appendChild(st); }
  const host = ctx.host; host.innerHTML = HTML; host.hidden = false;
  let look = $('skylook'); if (!look) { look = document.createElement('div'); look.id = 'skylook'; ctx.stage.appendChild(look); } look.hidden = true;
  const root = new T.Group(); root.name = 'sky dome'; ctx.scene.add(root);
  const disposables = [], keep = o => { disposables.push(o); return o; };
  const now = new Date(), d0 = A.doyOf(now);
  const st = { year: now.getUTCFullYear(), doy: d0.doy, minute: Math.round(d0.minute), playing: false, standing: false, inside: false, wasInside: false, yaw: 50, pitch: 2, fov: 50, sun: null, moon: null };

  // ---- sky: a sphere seen from inside, coloured by the Sun's height ----
  const skyGeo = keep(new T.SphereGeometry(Rd, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.72)), skyCol = new Float32Array(skyGeo.attributes.position.count * 3);
  skyGeo.setAttribute('color', new T.BufferAttribute(skyCol, 3));
  const sky = new T.Mesh(skyGeo, keep(new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, depthWrite: false }))); sky.renderOrder = -3; root.add(sky);
  function paintSky(sunAz, sunAlt) {
    const day = smooth(-12, 3, sunAlt), tw = smooth(-14, -4, sunAlt) * (1 - smooth(2, 12, sunAlt)), p = skyGeo.attributes.position.array, sd = dir(sunAz, 0);
    for (let i = 0, o = 0; i < p.length; i += 3, o += 3) {
      const alt = Math.asin(clamp(p[i + 1] / Rd, -1, 1)) / D2R, up = Math.pow(clamp(alt / 70, 0, 1), 0.55), h = Math.hypot(p[i], p[i + 2]) || 1;
      const toward = Math.pow(Math.max(0, (p[i] * sd[0] + p[i + 2] * sd[2]) / h), 3) * tw * (1 - clamp(alt / 25, 0, 1));
      let r = mix(mix(0.05, 0.74, day), mix(0.015, 0.22, day), up), g = mix(mix(0.07, 0.84, day), mix(0.02, 0.45, day), up), b = mix(mix(0.14, 0.95, day), mix(0.06, 0.80, day), up);
      r = mix(r, 0.98, toward * 0.75); g = mix(g, 0.62, toward * 0.6); b = mix(b, 0.32, toward * 0.5);
      skyCol[o] = lin(r); skyCol[o + 1] = lin(g); skyCol[o + 2] = lin(b);
    }
    skyGeo.attributes.color.needsUpdate = true; return day;
  }

  // ---- the ground beyond the block: the swept skyline as the rim of the dome, paler with distance ----
  const N = vs.alt.length, landPos = new Float32Array((N + 1) * 6), landBase = new Float32Array((N + 1) * 6), landCol = new Float32Array((N + 1) * 6), landIdx = [];
  // the rim's colour by bearing: green near, hazy blue far, grey-blue where there is no ground data; blurred round the
  // compass (a Gaussian of about 1.5°) so it shades smoothly instead of stepping where the skyline jumps in distance
  const raw = [];
  for (let i = 0; i < N; i++) { const none = vs.flag[i] === 2, t = none ? 1 : clamp(Math.log(Math.max(vs.dist[i], 150) / 150) / Math.log(10000 / 150), 0, 1); raw.push(none ? [0.52, 0.62, 0.72] : [mix(0.30, 0.62, t), mix(0.37, 0.69, t), mix(0.22, 0.74, t)]); }
  const sig = Math.max(1, 1.5 / vs.step), W = Math.ceil(sig * 2.5), wts = []; for (let k = -W; k <= W; k++) wts.push(Math.exp(-k * k / (2 * sig * sig)));
  const rim = raw.map((_, i) => { let r = 0, g = 0, b = 0, w = 0; for (let k = -W; k <= W; k++) { const c = raw[((i + k) % N + N) % N], q = wts[k + W]; r += c[0] * q; g += c[1] * q; b += c[2] * q; w += q; } return [r / w, g / w, b / w]; });
  for (let a = 0; a <= N; a++) {
    const i = a % N, az = i * vs.step, top = dir(az, vs.alt[i]), bot = dir(az, -38), o = a * 6, R1 = Rd * 0.975;
    landPos.set([top[0] * R1, top[1] * R1, top[2] * R1, bot[0] * R1, bot[1] * R1, bot[2] * R1], o);
    const c = rim[i];
    landBase.set([c[0], c[1], c[2], 0.27, 0.33, 0.20], o);
    if (a < N) { const k = a * 2; landIdx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const landGeo = keep(new T.BufferGeometry()); landGeo.setAttribute('position', new T.BufferAttribute(landPos, 3)); landGeo.setAttribute('color', new T.BufferAttribute(landCol, 3)); landGeo.setIndex(landIdx);
  const land = new T.Mesh(landGeo, keep(new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide }))); land.name = 'skyline'; land.renderOrder = -1; root.add(land);
  let landDay = -1;
  function paintLand(day) { const f = mix(0.10, 1, day); if (Math.abs(f - landDay) < 0.004) return; landDay = f; for (let i = 0; i < landCol.length; i++) landCol[i] = lin(landBase[i] * f); landGeo.attributes.color.needsUpdate = true; }

  // ---- Sun and Moon: discs at their true size, set just outside the skyline so the ground hides them ----
  const discGeo = keep(new T.CircleGeometry(1, 48));
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 2, 64, 64, 64); gr.addColorStop(0, 'rgba(255,244,214,.9)'); gr.addColorStop(0.18, 'rgba(255,226,160,.45)'); gr.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return keep(new T.CanvasTexture(c)); })();
  const Rb = Rd * 0.99;
  const sunMat = keep(new T.MeshBasicMaterial({ color: 0xfff6d8 })), sun = new T.Mesh(discGeo, sunMat); sun.scale.setScalar(Rb * Math.tan(A.SOLAR_SD * D2R)); sun.name = 'Sun'; root.add(sun);
  const glow = new T.Sprite(keep(new T.SpriteMaterial({ map: glowTex, blending: T.AdditiveBlending, depthWrite: false, transparent: true }))); glow.scale.setScalar(Rb * Math.tan(4 * D2R) * 2); root.add(glow);
  const moonMat = keep(new T.MeshBasicMaterial({ color: 0xe9e7dc })), moon = new T.Mesh(discGeo, moonMat); moon.scale.setScalar(Rb * Math.tan(A.LUNAR_SD * D2R)); moon.name = 'Moon'; root.add(moon);
  const put = (m, az, alt, r) => { const d = dir(az, alt); m.position.set(d[0] * r, d[1] * r, d[2] * r); if (m.isMesh) m.lookAt(root.position); };

  // ---- paths: lines on the dome ----
  function line(points, color, opacity) {   // points: [{az, alt}] ; segments below -1.5° are left out
    const v = []; for (let i = 1; i < points.length; i++) { const a = points[i - 1], b = points[i]; if (a.alt < -1.5 || b.alt < -1.5) continue; let da = Math.abs(a.az - b.az); if (da > 180) da = 360 - da; if (da > 20) continue; const p = dir(a.az, a.alt), q = dir(b.az, b.alt); v.push(p[0] * Rb, p[1] * Rb, p[2] * Rb, q[0] * Rb, q[1] * Rb, q[2] * Rb); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(v), 3));
    return new T.LineSegments(g, new T.LineBasicMaterial({ color, transparent: true, opacity: opacity == null ? 1 : opacity, depthWrite: false }));
  }
  const drop = grp => { while (grp.children.length) { const c = grp.children.pop(); c.geometry.dispose(); c.material.dispose(); } };
  const arcs = new T.Group(), today = new T.Group(); root.add(arcs); root.add(today);
  const KEY = [['#f59e0b', 'Sun at the solstices'], ['#9ca3af', 'Sun at the equinoxes'], ['#60a5fa', 'Moon at the major standstill limits'], ['#c4b5fd', 'Moon at the minor standstill limits'], ['#fde047', 'Sun today'], ['#e5e7eb', 'Moon today']];
  let arcYear = null, eps = 23.44;
  function drawArcs() {
    if (arcYear === st.year) return; arcYear = st.year; drop(arcs); eps = A.obliquity(A.centuriesOfYear(st.year));
    const hp = 0.95;   // the Moon's mean parallax on the horizon, in degrees
    [[eps, 0, 0xf59e0b], [-eps, 0, 0xf59e0b], [0, 0, 0x9ca3af], [eps + A.MOON_INCL, hp, 0x60a5fa], [-eps - A.MOON_INCL, hp, 0x60a5fa], [eps - A.MOON_INCL, hp, 0xc4b5fd], [-eps + A.MOON_INCL, hp, 0xc4b5fd]]
      .forEach(([dec, par, col]) => arcs.add(line(A.decArc(obs, dec, par), col, 0.9)));
  }
  let dayKey = '';
  function drawToday() {
    const k = st.year + '/' + st.doy; if (k === dayKey) return; dayKey = k; drop(today);
    for (const [body, col] of [['Sun', 0xfde047], ['Moon', 0xe5e7eb]]) { const pts = []; for (let m = 0; m <= 1440; m += 5) { const p = A.place(body, A.dateOf(st.year, st.doy, m), obs); pts.push({ az: p.az, alt: p.app }); } today.add(line(pts, col, 0.75)); }
  }

  // ---- stars ----
  const starN = STARS.s.length, starPos = new Float32Array(starN * 3), starCol = new Float32Array(starN * 3), starGeo = keep(new T.BufferGeometry());
  starGeo.setAttribute('position', new T.BufferAttribute(starPos, 3)); starGeo.setAttribute('color', new T.BufferAttribute(starCol, 3));
  const stars = new T.Points(starGeo, keep(new T.PointsMaterial({ size: 2.6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false }))); stars.renderOrder = -2; stars.frustumCulled = false; root.add(stars);
  function drawStars(date, night) {
    stars.visible = night > 0.02; if (!stars.visible) return; stars.material.opacity = night;
    const f = A.starFrame(date, obs), S = STARS.s;
    for (let i = 0, o = 0; i < starN; i++, o += 3) {
      const h = f(S[i][0], S[i][1]), alt = h.alt + (h.alt > -1 ? A.refractionDeg(h.alt) : 0), d = dir(h.az, alt), b = h.alt < -0.6 ? 0 : clamp(Math.pow(10, -0.4 * (S[i][2] - 1.2) * 0.62), 0.12, 1);
      if (!b) { starPos[o] = 0; starPos[o + 1] = -Rd * 1e4; starPos[o + 2] = 0; continue; }   // below the horizon: out of the picture
      starPos[o] = d[0] * Rb; starPos[o + 1] = d[1] * Rb; starPos[o + 2] = d[2] * Rb; starCol[o] = starCol[o + 1] = starCol[o + 2] = b;
    }
    starGeo.attributes.position.needsUpdate = true; starGeo.attributes.color.needsUpdate = true;
  }

  // ---- compass letters above the skyline ----
  const letter = (t, az) => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.font = '700 44px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.65)'; g.strokeText(t, 32, 34); g.fillStyle = t === 'N' ? '#fca5a5' : '#fff'; g.fillText(t, 32, 34);
    const s = new T.Sprite(keep(new T.SpriteMaterial({ map: keep(new T.CanvasTexture(c)), depthWrite: false, transparent: true }))); s.scale.setScalar(Rd * 0.07); put(s, az, A.sampleAlt(vs.alt, vs.step, az) + 3.2, Rd * 0.96); root.add(s); };
  ['N', 'E', 'S', 'W'].forEach((t, i) => letter(t, i * 90));

  // ---- one update for everything that depends on the moment ----
  function update() {
    const date = A.dateOf(st.year, st.doy, st.minute), s = A.place('Sun', date, obs), m = A.place('Moon', date, obs); st.sun = s; st.moon = m; st.date = date;
    const day = paintSky(s.az, s.app); paintLand(day);
    put(sun, s.az, s.app, Rb); put(glow, s.az, s.app, Rb * 0.999); put(moon, m.az, m.app, Rb * 0.995);
    const low = 1 - smooth(0, 9, s.app); sunMat.color.setRGB(lin(1), lin(mix(0.96, 0.55, low)), lin(mix(0.85, 0.22, low))); glow.material.opacity = mix(0.9, 0.55, low) * smooth(-7, -1, s.app);
    moonMat.color.setRGB(lin(mix(0.93, 0.80, day)), lin(mix(0.92, 0.84, day)), lin(mix(0.86, 0.90, day)));
    drawArcs(); drawToday(); arcs.visible = $('skyarcs').checked; drawStars(date, 1 - smooth(-13, -5, s.app));
    ctx.setSun(s.az, s.app, day);
    // readout
    const sk = az => A.sampleAlt(vs.alt, vs.step, az), seen = t => t + A.refractionDeg(t), part = (name, p, sd, extra) => { const h = sk(p.az), hi = seen(p.alt + sd), lo = seen(p.alt - sd), top = hi - h; return name + ': bearing ' + p.az.toFixed(2) + '°, centre ' + sgn(p.app) + ' as seen, declination ' + sgn(p.dec) + '; skyline there ' + sgn(h) + ', ' + (top <= 0 ? 'hidden by the ground' : h > lo ? 'part showing (' + Math.round(100 * top / (hi - lo)) + '% of its height)' : 'clear of it') + (extra || '') + '.'; };
    $('skyread').textContent = part('Sun', s, A.SOLAR_SD) + ' ' + part('Moon', m, A.LUNAR_SD, ', ' + Math.round(100 * A.moonLit(date, obs)) + '% lit');
    $('skydv').textContent = date.getUTCDate() + ' ' + MON[date.getUTCMonth()]; $('skytv').textContent = hhmm(st.minute);
    ctx.dirty();
  }
  function syncInputs() { $('skyyr').value = st.year > 0 ? st.year : 1 - st.year; $('skyera').value = st.year > 0 ? 'AD' : 'BC'; const n = A.daysInYear(st.year); $('skyday').max = n; st.doy = clamp(st.doy, 1, n); $('skyday').value = st.doy; $('skytime').value = st.minute;
    $('skykey').innerHTML = KEY.map(([c, t]) => '<i style="background:' + c + '"></i>' + t).join('') + '. ' + yearName(st.year) + ': obliquity ' + A.obliquity(A.centuriesOfYear(st.year)).toFixed(2) + '°. Dates before 1582 are on the modern (Gregorian) calendar run backwards; ancient clock times are nominal.'; }
  function set(o) { Object.assign(st, o); if (o.minute != null) { while (st.minute >= 1440) { st.minute -= 1440; st.doy = st.doy >= A.daysInYear(st.year) ? 1 : st.doy + 1; } while (st.minute < 0) { st.minute += 1440; st.doy = st.doy <= 1 ? A.daysInYear(st.year) : st.doy - 1; } } syncInputs(); update(); }
  function seekTo(body, rising) {
    const r = A.seek({ body, year: st.year, doy: st.doy, rising, limb: $('skylimb').value, alts: vs.alt, step: vs.step, obs, from: 0 });
    if (!r) { $('skyread').textContent = (body === 'Sun' ? 'The Sun' : 'The Moon') + ' does not ' + (rising ? 'rise over' : 'set behind') + ' the skyline within a day of 0h on this date.'; return null; }
    set({ minute: r.minute }); if (st.standing) { st.yaw = r.az; st.pitch = clamp(r.sky + 1, -20, 60); aim(); } return r;
  }

  // ---- standing at the viewpoint ----
  const cam = ctx.camera, saved = { near: cam.near, far: cam.far, fov: cam.fov };
  function aim() { if (!st.standing) return; const e = ctx.eyeAt(1); cam.position.set(e[0], e[1], e[2]); cam.rotation.order = 'YXZ'; cam.rotation.set(st.pitch * D2R, -st.yaw * D2R, 0); cam.fov = st.fov; cam.near = 0.25; cam.far = Rd * 3; cam.updateProjectionMatrix();
    const y = ((st.yaw % 360) + 360) % 360; look.textContent = 'Looking ' + String(Math.round(y) % 360).padStart(3, '0') + '° (' + PTS[Math.round(y / 22.5) % 16] + '), ' + (st.pitch >= 0 ? 'up ' : 'down ') + Math.abs(st.pitch).toFixed(0) + '° · view ' + Math.round(st.fov) + '° wide'; ctx.dirty(); }
  function stand(on) { if (on === st.standing) return; if (on) { st.wasInside = st.inside; if (st.inside) inside(false); } st.standing = on; $('skystand').classList.toggle('on', on); $('skystand').textContent = on ? 'Back to the block' : 'Stand at the viewpoint'; look.hidden = !on; ctx.controls.enabled = !on; ctx.setVE(on ? 1 : null); place();
    if (on) { if (st.sun && st.sun.app > -6) { st.yaw = st.sun.az; st.pitch = clamp(st.sun.app, 0, 50); } aim(); }
    else { cam.near = saved.near; cam.far = saved.far; cam.fov = saved.fov; cam.rotation.order = 'XYZ'; cam.updateProjectionMatrix(); ctx.resetCam(); if (st.wasInside) inside(true); }   // back to the view you stood up from
    if (ctx.changed) ctx.changed(); }
  // ---- inside the dome: the orbit camera goes in under the dome, low down, looking up and out over the block ----
  // The camera starts a fifth of the dome's radius above the eye, looking slightly up, so the block sits at the foot of
  // the screen and the sky fills the rest; it can neither leave the dome nor sink under the ground, so the bowl under the
  // dome is never seen.
  const ctl = ctx.controls, insideT = new T.Vector3(), IN_H = 0.3;   // the camera circles a point 0.3 dome radii above the eye
  let keepCtl = null;
  function frameInside() {
    const c = root.position, H = Rd * IN_H, R0 = Rd * 0.754;
    insideT.set(c.x, c.y + H, c.z); ctl.target.copy(insideT);
    // start looking the way the Sun is (or north-east), camera on the far side, about eye height
    const az = (st.sun && st.sun.app > -6 ? st.sun.az : 50) * D2R, el = -Math.asin(0.08 / 0.754);
    cam.position.set(c.x - Math.sin(az) * Math.cos(el) * R0, c.y + H + Math.sin(el) * R0, c.z + Math.cos(az) * Math.cos(el) * R0);
    ctl.update(); ctx.dirty();
  }
  function inside(on) {
    on = !!on; if (on === st.inside) return;
    if (on && st.standing) stand(false);
    st.inside = on; const b = $('skyinside'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
    if (on) {
      keepCtl = { pan: ctl.enablePan, min: ctl.minDistance, max: ctl.maxDistance, minP: ctl.minPolarAngle, maxP: ctl.maxPolarAngle, fov: cam.fov };
      ctl.enablePan = false; ctl.minDistance = Rd * 0.3; ctl.maxDistance = Rd * 0.8;   // with the polar limits: never more than 0.99 dome radii from the eye, never below 0.05 above it
      ctl.minPolarAngle = 1.05; ctl.maxPolarAngle = Math.PI / 2 + Math.asin(0.25 / 0.8);   // camera stays above the ground and under the dome
      cam.fov = 62; cam.updateProjectionMatrix(); frameInside();
    } else if (keepCtl) {
      ctl.enablePan = keepCtl.pan; ctl.minDistance = keepCtl.min; ctl.maxDistance = keepCtl.max; ctl.minPolarAngle = keepCtl.minP; ctl.maxPolarAngle = keepCtl.maxP; cam.fov = keepCtl.fov; cam.updateProjectionMatrix(); keepCtl = null;
      if (!st.standing) ctx.resetCam();
    }
    if (ctx.changed) ctx.changed();
  }
  let drag = null; const cv = ctx.canvas;
  const onDown = e => { if (!st.standing) return; drag = { x: e.clientX, y: e.clientY, yaw: st.yaw, pitch: st.pitch }; try { cv.setPointerCapture(e.pointerId); } catch (x) { } };
  const onMove = e => { if (!drag || !st.standing) return; const k = st.fov / (cv.clientHeight || 600); st.yaw = drag.yaw - (e.clientX - drag.x) * k; st.pitch = clamp(drag.pitch + (e.clientY - drag.y) * k, -60, 89); aim(); };
  const onUp = () => { drag = null; };
  const onWheel = e => { if (!st.standing) return; e.preventDefault(); st.fov = clamp(st.fov * (e.deltaY > 0 ? 1.12 : 0.89), 4, 80); aim(); };
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onUp); cv.addEventListener('wheel', onWheel, { passive: false });

  /** Put the dome round the eye; called when the height exaggeration changes. */
  function place() { const e = ctx.eyeAt(st.standing ? 1 : null); root.position.set(e[0], e[1], e[2]); sun.lookAt(root.position); moon.lookAt(root.position); if (st.standing) aim(); else if (st.inside) { const d = cam.position.clone().sub(insideT); insideT.set(root.position.x, root.position.y + Rd * IN_H, root.position.z); ctl.target.copy(insideT); cam.position.copy(insideT).add(d); ctl.update(); } ctx.dirty(); }

  // ---- controls ----
  const on = (id, ev, f) => $(id).addEventListener(ev, f);
  const readYear = () => { const v = clamp(Math.round(+$('skyyr').value) || 1, 1, 4500); return $('skyera').value === 'BC' ? 1 - v : v; };
  on('skyyr', 'change', () => set({ year: readYear() })); on('skyera', 'change', () => set({ year: readYear() }));
  on('skyday', 'input', () => set({ doy: +$('skyday').value })); on('skytime', 'input', () => set({ minute: +$('skytime').value }));
  on('skygo', 'change', () => { const v = $('skygo').value; $('skygo').value = ''; if (!v) return; if (v === 'today') { const n = new Date(), d = A.doyOf(n); set({ year: n.getUTCFullYear(), doy: d.doy, minute: Math.round(d.minute) }); return; } const s = A.seasons(st.year, obs)[v]; if (s) set({ doy: s.doy }); });
  on('skyarcs', 'change', update); on('skystand', 'click', () => stand(!st.standing)); on('skyinside', 'click', () => inside(!st.inside));
  on('skysr', 'click', () => seekTo('Sun', true)); on('skyss', 'click', () => seekTo('Sun', false)); on('skymr', 'click', () => seekTo('Moon', true)); on('skyms', 'click', () => seekTo('Moon', false));
  const setPlay = p => { st.playing = p; $('skyplay').classList.toggle('on', p); $('skyplay').textContent = p ? 'Pause' : 'Play'; last = 0; ctx.dirty(); };
  on('skyplay', 'click', () => setPlay(!st.playing));
  let last = 0;
  /** Called every animation frame by the 3D view. Six minutes of sky to the second while playing. */
  function frame(t) { if (!st.playing) return; if (last) { const dt = Math.min(0.1, (t - last) / 1000); set({ minute: Math.round((st.minute + dt * 6) * 100) / 100 }); } last = t; }

  place(); syncInputs(); update();
  return {
    frame, place, update, set, seek: seekTo, stand, inside, state: () => st, root,
    heading: () => st.standing ? st.yaw : null,
    dispose() { setPlay(false); if (st.standing) stand(false); if (st.inside) inside(false); cv.removeEventListener('pointerdown', onDown); cv.removeEventListener('pointermove', onMove); cv.removeEventListener('pointerup', onUp); cv.removeEventListener('pointercancel', onUp); cv.removeEventListener('wheel', onWheel);
      drop(arcs); drop(today); ctx.scene.remove(root); disposables.forEach(d => d.dispose && d.dispose()); host.innerHTML = ''; host.hidden = true; look.hidden = true; ctx.setSun(null); ctx.dirty(); },
  };
}
