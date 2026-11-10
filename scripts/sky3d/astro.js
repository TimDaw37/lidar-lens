// Sun, Moon and star places for the sky dome, for any observer and any year from about 4000 BC to the present.
//
// astronomy-engine (MIT, Don Cross) supplies the Sun's and Moon's positions. Its own change from the J2000 frame to the
// equator of date uses the IAU 2006 precession polynomials, which are fitted to a few centuries round 2000: by 2500 BC
// they put the midsummer Sun at declination 23.86°, where the obliquity was 23.97° (Laskar 1986). So the place of date
// is built here instead:
//   Sun:   J2000 vector (astronomy-engine) -> ecliptic of J2000 -> longitude from the equinox of date (Meeus 1998, ch. 21);
//          its latitude is set to zero, since the ecliptic of date is the plane of the Sun's path by definition (the
//          truncated planetary series and the polynomial for the moving ecliptic together leave 0.13° there by 2500 BC)
//   Moon:  ecliptic longitude and latitude of date straight from the lunar theory (astronomy-engine EclipticGeoMoon)
//   stars: J2000 catalogue places -> ecliptic of date as for the Sun (no proper motion)
//   then ecliptic of date -> equator of date with Laskar's obliquity, hour angle from mean sidereal time (Meeus ch. 12),
//   parallax for the observer, and Saemundsson's refraction for the height as seen.
// Nutation (under 0.01°) is left out. Ancient clock times are nominal: the Earth's spin is not known to better than
// some hours that far back, so the day and the path across the sky are right but the hour on the clock is a label.
import * as AE from 'astronomy-engine';

const D2R = Math.PI / 180, AS = D2R / 3600;
export const SOLAR_SD = 0.2667, LUNAR_SD = 0.259, MOON_INCL = 5.145;
const EARTH_KM = 6378.14, AU_KM = 149597870.7;

/** Julian centuries (TT, near enough) from J2000 for a calendar year, mid-year. */
export const centuriesOfYear = y => (y + 0.5 - 2000) / 100;

/** Mean obliquity of the ecliptic in degrees (Laskar 1986), T in Julian centuries from J2000; good for 10,000 years either side. */
export function obliquity(T) {
  const U = T / 100;
  const s = 84381.448 + U * (-4680.93 + U * (-1.55 + U * (1999.25 + U * (-51.38 + U * (-249.67 + U * (-39.05 + U * (7.12 + U * (27.87 + U * (5.79 + U * 2.45)))))))));
  return s / 3600;
}

/** Saemundsson refraction, degrees to add to a true altitude (10 °C, 1010 hPa). */
export function refractionDeg(alt) {
  const h = alt < -1 ? -1 : alt;
  return (1.02 / Math.tan((h + 10.3 / (h + 5.11)) * D2R)) / 60;
}

/** Proleptic Gregorian date for a year (astronomical: 0 = 1 BC), day of year (1 = 1 Jan) and minutes of Universal Time. */
export function dateOf(year, doy, minuteUt) {
  const d = new Date(0); d.setUTCFullYear(year, 0, 1); d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() + (Math.round(doy) - 1) * 864e5 + (+minuteUt || 0) * 6e4);
}
export const daysInYear = y => ((y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 366 : 365);
export function doyOf(date) { const d = new Date(0); d.setUTCFullYear(date.getUTCFullYear(), 0, 1); d.setUTCHours(0, 0, 0, 0); const ms = date.getTime() - d.getTime(); return { doy: Math.floor(ms / 864e5) + 1, minute: (ms % 864e5) / 6e4 }; }

// ---- frames ----
const EPS0 = 84381.448 * AS;   // obliquity at J2000
/** Ecliptic of J2000 (lon, lat, radians) -> ecliptic and mean equinox of date. Meeus, Astronomical Algorithms 2nd ed., eq. 21.5-21.7. */
export function eclJ2000ToDate(lon, lat, T) {
  const eta = (47.0029 * T - 0.03302 * T * T + 0.000060 * T * T * T) * AS;
  const Pi = 174.876384 * D2R + (-869.8089 * T + 0.03536 * T * T) * AS;
  const p = (5029.0966 * T + 1.11113 * T * T - 0.000006 * T * T * T) * AS;
  const A = Math.cos(eta) * Math.cos(lat) * Math.sin(Pi - lon) - Math.sin(eta) * Math.sin(lat);
  const B = Math.cos(lat) * Math.cos(Pi - lon);
  const C = Math.cos(eta) * Math.sin(lat) + Math.sin(eta) * Math.cos(lat) * Math.sin(Pi - lon);
  return { lon: p + Pi - Math.atan2(A, B), lat: Math.asin(Math.max(-1, Math.min(1, C))) };
}
/** Equatorial J2000 unit vector -> ecliptic of J2000 lon, lat (radians). */
function eqjToEcl(x, y, z) {
  const c = Math.cos(EPS0), s = Math.sin(EPS0), ye = y * c + z * s, ze = -y * s + z * c, r = Math.hypot(x, ye, ze);
  return { lon: Math.atan2(ye, x), lat: Math.asin(ze / r) };
}
/** Ecliptic of date -> right ascension and declination of date (radians), obliquity eps in radians. */
function eclToEq(lon, lat, eps) {
  return {
    ra: Math.atan2(Math.sin(lon) * Math.cos(eps) - Math.tan(lat) * Math.sin(eps), Math.cos(lon)),
    dec: Math.asin(Math.max(-1, Math.min(1, Math.sin(lat) * Math.cos(eps) + Math.cos(lat) * Math.sin(eps) * Math.sin(lon)))),
  };
}
/** Greenwich mean sidereal time in radians for a Date (UT). Meeus eq. 12.4. */
export function gmst(date) {
  const d = date.getTime() / 864e5 + 2440587.5 - 2451545.0, T = d / 36525;
  const deg = 280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - T * T * T / 38710000;
  return (((deg % 360) + 360) % 360) * D2R;
}

/** Observer: latitude and longitude in degrees (east positive). */
export function makeObserver(lat, lon) { return { lat, lon, phi: lat * D2R, sp: Math.sin(lat * D2R), cp: Math.cos(lat * D2R) }; }

/** Height and bearing (degrees) of a point at hour angle H and declination dec (radians), for the centre of the Earth. */
function altAz(obs, H, dec) {
  const sd = Math.sin(dec), cd = Math.cos(dec), ch = Math.cos(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, obs.sp * sd + obs.cp * cd * ch)));
  let az = Math.atan2(-cd * Math.sin(H), sd * obs.cp - cd * obs.sp * ch) / D2R; if (az < 0) az += 360;
  return { alt: alt / D2R, az };
}

/**
 * Sun or Moon for the observer at a Date. Returns bearing (az, degrees from true north), true height of the centre
 * with parallax (alt), height as seen with refraction (app), declination of date (dec), distance in km and the
 * ecliptic longitude and latitude of date in degrees.
 */
export function place(body, date, obs) {
  const t = AE.MakeTime(date), T = t.tt / 36525;
  let lon, lat, km;
  if (body === 'Moon') { const m = AE.EclipticGeoMoon(t); lon = m.lon * D2R; lat = m.lat * D2R; km = m.dist * AU_KM; }
  else { const v = AE.GeoVector(AE.Body.Sun, t, true), e = eqjToEcl(v.x, v.y, v.z), d = eclJ2000ToDate(e.lon, e.lat, T); lon = d.lon; lat = 0; km = Math.hypot(v.x, v.y, v.z) * AU_KM; }
  const eq = eclToEq(lon, lat, obliquity(T) * D2R), H = gmst(date) + obs.lon * D2R - eq.ra, g = altAz(obs, H, eq.dec);
  const alt = g.alt - Math.asin(EARTH_KM / km) / D2R * Math.cos(g.alt * D2R);     // parallax lowers the body: 0.95° for the Moon on the horizon
  let l = lon / D2R % 360; if (l < 0) l += 360;
  return { az: g.az, alt, app: alt + refractionDeg(alt), dec: eq.dec / D2R, km, lon: l, lat: lat / D2R, geoAlt: g.alt };
}
/** Fraction of the Moon's disc that is lit, 0 to 1. */
export function moonLit(date, obs) { const s = place('Sun', date, obs), m = place('Moon', date, obs); const e = Math.acos(Math.cos(m.lat * D2R) * Math.cos((m.lon - s.lon) * D2R)); return (1 - Math.cos(e)) / 2; }

/** Rotation taking J2000 catalogue places to the observer's sky at a Date: returns f(raHours, decDeg) -> {alt, az} (true, no refraction). */
export function starFrame(date, obs) {
  const T = AE.MakeTime(date).tt / 36525, eps = obliquity(T) * D2R, lst = gmst(date) + obs.lon * D2R;
  return (raH, decDeg) => {
    const ra = raH * 15 * D2R, dec = decDeg * D2R, cd = Math.cos(dec), e = eqjToEcl(cd * Math.cos(ra), cd * Math.sin(ra), Math.sin(dec));
    const d = eclJ2000ToDate(e.lon, e.lat, T), q = eclToEq(d.lon, d.lat, eps);
    return Object.assign(altAz(obs, lst - q.ra, q.dec), { dec: q.dec / D2R });
  };
}

/** The path across the sky of a point at fixed declination (degrees): [{az, alt (as seen)}] for every degree of hour angle, with parallax hp (degrees) if given. */
export function decArc(obs, decDeg, hp) {
  const out = [], dec = decDeg * D2R;
  for (let h = -180; h <= 180; h += 1) { const g = altAz(obs, h * D2R, dec), a = g.alt - (hp || 0) * Math.cos(g.alt * D2R); out.push({ az: g.az, alt: a + refractionDeg(a) }); }
  return out;
}
/** Bearing of rising on a level, sea-level horizon with no refraction, for a declination (degrees). */
export const flatRiseAz = (latDeg, decDeg) => Math.acos(Math.sin(decDeg * D2R) / Math.cos(latDeg * D2R)) / D2R;

/** Skyline height at a bearing from the swept profile (alts every step degrees from north). */
export function sampleAlt(alts, step, az) {
  const n = alts.length; let a = az % 360; if (a < 0) a += 360;
  const x = a / step, i0 = Math.floor(x), t = x - i0, i = i0 % n, j = (i + 1) % n;
  return alts[i] * (1 - t) + alts[j] * t;
}
/** Limb: 'first_gleam' is the upper edge, 'full_orb' the lower edge, anything else the centre. */
export const limbOffset = (limb, body) => { const sd = body === 'Moon' ? LUNAR_SD : SOLAR_SD; return limb === 'first_gleam' ? sd : limb === 'full_orb' ? -sd : 0; };

/**
 * The moment the chosen limb, as seen, meets the skyline: rising (first climb through it in the eastern half) or
 * setting (first drop through it in the western half), searching from `from` minutes after 0h UT on the day given.
 * Returns {minute, date, az, app (height of the limb as seen), sky (skyline height there)} or null.
 */
export function seek({ body, year, doy, rising, limb, alts, step, obs, from }) {
  const off = limbOffset(limb, body), t0 = Number.isFinite(+from) ? +from : 0, t1 = t0 + 26 * 60;
  const at = min => { const date = dateOf(year, doy, min), p = place(body, date, obs), lt = p.alt + off, app = lt + refractionDeg(lt), sky = sampleAlt(alts, step, p.az); return { minute: min, date, az: p.az, app, sky, diff: app - sky }; };
  let prev = null;
  for (let m = t0; m <= t1; m += 3) {
    const cur = at(m), side = rising ? cur.az < 180 : cur.az >= 180;
    if (prev && side && (rising ? prev.diff <= 0 && cur.diff > 0 : prev.diff > 0 && cur.diff <= 0)) {
      let lo = m - 3, hi = m;
      for (let k = 0; k < 18; k++) { const mid = (lo + hi) / 2, above = at(mid).diff > 0; if (rising ? above : !above) hi = mid; else lo = mid; }
      return at((lo + hi) / 2);
    }
    prev = cur;
  }
  return null;
}
/** Solstices and equinoxes of a year as {doy, minute}, from the Sun's longitude of date (found by bisection on `place`). */
export function seasons(year, obs) {
  const lonAt = (doy, min) => place('Sun', dateOf(year, doy, min), obs).lon, out = {};
  [['spring', 0], ['midsummer', 90], ['autumn', 180], ['midwinter', 270]].forEach(([name, L]) => {
    const f = d => { let x = lonAt(1, d * 1440) - L; x = ((x + 540) % 360) - 180; return x; };
    let lo = null; for (let d = 0; d < 370; d += 5) if (f(d) <= 0 && f(d + 5) > 0 && Math.abs(f(d)) < 20) { lo = d; break; }
    if (lo == null) return; let hi = lo + 5;
    for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (f(mid) > 0) hi = mid; else lo = mid; }
    const dd = (lo + hi) / 2, n = daysInYear(year); out[name] = { doy: Math.min(n, Math.floor(dd) + 1), minute: (dd - Math.floor(dd)) * 1440 };
  });
  return out;
}
