// Sky calculations (scripts/sky3d/astro.js), checked in Node against astronomy-engine for the present day and against
// published values for ancient dates. Usage (from the repository root, after npm i): node tests/astro.test.mjs
import * as AE from 'astronomy-engine';import * as A from '../scripts/sky3d/astro.js';
let pass=0,fail=0;const ok=(n,c,i='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(i?' '+i:''))},near=(a,b,t)=>Math.abs(a-b)<=t;
const LAT=51.1789,LON=-1.8262,obs=A.makeObserver(LAT,LON),ao=new AE.Observer(LAT,LON,0);
// present day: bearing and height of the Sun and Moon agree with astronomy-engine's own topocentric places
{const mx={Sun:[0,0],Moon:[0,0]};for(let k=0;k<400;k++){const d=new Date(Date.UTC(2026,0,1)+k*23.37*3600e3);for(const b of ['Sun','Moon']){const p=A.place(b,d,obs),eq=AE.Equator(AE.Body[b],d,ao,true,true),h=AE.Horizon(d,ao,eq.ra,eq.dec,null);
    let da=Math.abs(p.az-h.azimuth);if(da>180)da=360-da;mx[b][0]=Math.max(mx[b][0],da*Math.cos(h.altitude*Math.PI/180));mx[b][1]=Math.max(mx[b][1],Math.abs(p.alt-h.altitude))}}
  ok('2026 Sun within 0.01° of astronomy-engine',mx.Sun[0]<0.01&&mx.Sun[1]<0.01,mx.Sun.map(v=>v.toFixed(4)).join(' '));
  ok('2026 Moon within 0.02° of astronomy-engine',mx.Moon[0]<0.02&&mx.Moon[1]<0.02,mx.Moon.map(v=>v.toFixed(4)).join(' '))}
// obliquity (Laskar 1986): 23.44° now, 23.97° in 2500 BC
ok('obliquity 2026 is 23.44°',near(A.obliquity(A.centuriesOfYear(2026)),23.436,0.002),A.obliquity(A.centuriesOfYear(2026)).toFixed(4));
ok('obliquity 2500 BC is 23.97°',near(A.obliquity(A.centuriesOfYear(-2499)),23.974,0.002),A.obliquity(A.centuriesOfYear(-2499)).toFixed(4));
// the Sun's greatest declination in a year equals the obliquity, at any date (astronomy-engine alone gives 23.86° in 2500 BC)
for(const y of [2026,-2499,-3499]){let hi=-9,lo=9;for(let k=0;k<366;k+=0.25){const p=A.place('Sun',A.dateOf(y,1,k*1440),obs);hi=Math.max(hi,p.dec);lo=Math.min(lo,p.dec)}const e=A.obliquity(A.centuriesOfYear(y));
  ok('Sun reaches ±obliquity in '+y,near(hi,e,0.003)&&near(lo,-e,0.003),hi.toFixed(4)+' '+lo.toFixed(4)+' vs '+e.toFixed(4))}
{let hi=-9;const t=AE.Seasons(-2499).jun_solstice.date;hi=AE.Equator(AE.Body.Sun,t,ao,true,true).dec;ok('(astronomy-engine alone in 2500 BC: 23.86°, the reason for astro.js)',near(hi,23.855,0.01),hi.toFixed(3))}
// the Moon's extremes over 18.6 years in 2500 BC: obliquity + 5.145° + the 0.15° wobble of its inclination
{let hi=-9,lo=9;for(let k=0;k<19*365.25;k+=0.25){const p=A.place('Moon',A.dateOf(-2499,1,k*1440),obs);hi=Math.max(hi,p.dec);lo=Math.min(lo,p.dec)}
  ok('Moon reaches about ±29.2° at a major standstill in 2500 BC',near(hi,29.25,0.08)&&near(lo,-29.25,0.08),hi.toFixed(3)+' '+lo.toFixed(3))}
// level horizon, no refraction: declination 23.97° rises at 49.6° at Stonehenge
ok('flat-horizon rising bearing 49.6°',near(A.flatRiseAz(LAT,23.97),49.6,0.05),A.flatRiseAz(LAT,23.97).toFixed(2));
// stars: present places agree with astronomy-engine; Thuban within 0.1° of the pole in 2800 BC
{const d=new Date(Date.UTC(2026,5,21,22)),f=A.starFrame(d,obs),rot=AE.Rotation_EQJ_HOR(d,ao);let worst=0;
  for(const [ra,dec] of [[14.0731,64.3758],[2.5302,89.2641],[6.7525,-16.7161],[18.6156,38.7837]]){const r=ra*15*Math.PI/180,de=dec*Math.PI/180,v=AE.RotateVector(rot,new AE.Vector(Math.cos(de)*Math.cos(r),Math.cos(de)*Math.sin(r),Math.sin(de),AE.MakeTime(d))),h=AE.HorizonFromVector(v,null),p=f(ra,dec);
    worst=Math.max(worst,Math.abs(p.alt-h.lat),Math.abs(p.az-h.lon)*Math.cos(h.lat*Math.PI/180))}
  ok('2026 stars within 0.01° of astronomy-engine',worst<0.01,worst.toFixed(4));
  const th=A.starFrame(A.dateOf(-2799,172,0),obs)(14.0731,64.3758).dec;ok('Thuban at the pole in 2800 BC',th>89.8,th.toFixed(2))}
// rising: at the moment found, the chosen edge as seen is on the skyline; 2500 BC midsummer first gleam on a 0.6° skyline near 49.4°
{const alts=new Float32Array(1440).fill(0.6),s=A.seasons(-2499,obs).midsummer,out=[];
  for(const limb of ['first_gleam','half','full_orb']){const r=A.seek({body:'Sun',year:-2499,doy:s.doy,rising:true,limb,alts,step:0.25,obs});out.push(r);ok('2500 BC midsummer sunrise, '+limb+': edge on the skyline',r&&near(r.app,0.6,0.002),r&&r.az.toFixed(2)+'°')}
  ok('first gleam 49.4°, then half orb, then full orb further south',near(out[0].az,49.4,0.15)&&out[0].az<out[1].az&&out[1].az<out[2].az,out.map(r=>r.az.toFixed(2)).join(' '));
  const r=A.seek({body:'Sun',year:2026,doy:A.seasons(2026,obs).midsummer.doy,rising:true,limb:'first_gleam',alts,step:0.25,obs});ok('2026 first gleam about 1° further east than in 2500 BC',near(r.az-out[0].az,1.03,0.15),(r.az-out[0].az).toFixed(2));
  const w=A.seek({body:'Sun',year:-2499,doy:A.seasons(-2499,obs).midwinter.doy,rising:false,limb:'full_orb',alts,step:0.25,obs});ok('2500 BC midwinter sunset found in the south-west',w&&w.az>225&&w.az<232,w&&w.az.toFixed(2))}
ok('solstice dates 2026',(()=>{const s=A.seasons(2026,obs),d=A.dateOf(2026,s.midsummer.doy,s.midsummer.minute);return d.toISOString().slice(0,13)==='2026-06-21T08'})());
console.log(pass+'/'+(pass+fail));process.exit(fail?1:0);
