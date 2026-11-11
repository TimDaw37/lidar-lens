// View from here / sky dome: a far-ground tile that never answers must not freeze the build at 99% (Tim, near Boscastle,
// 11 Nov 2026). Some tiles are made to hang for ever and one to fail; the run must still finish, count the late tiles,
// and keep the 10 km range. Usage (from tests/): node vfh-timeout.test.mjs <site URL> [dist folder]
import {openSite} from './open.mjs';
const BASE=(process.argv[2]||'').replace(/\/?$/,'/');if(!/^https?:/.test(BASE)){console.error('give the site URL');process.exit(2)}
let pass=0,fail=0;const ok=(n,c,i='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(i?' '+i:''))};
const BOS=[50.68967,-4.70407];
// 1. the spot as it is: completes
{const {b,p,errs,open}=await openSite(BASE,process.argv[3],{width:1300,height:900});
  await open('#c=50.68967%2C-4.70329%2C16&l=50.68967%2C-4.70407');await p.waitForFunction(()=>window.__viewshed,null,{timeout:20000});
  const t0=Date.now();const s=await p.evaluate(async ll=>{const s=await window.__viewshed.run(ll);return s&&{range:s.range,slow:s.slowTiles,seen:s.seenKm2}},BOS);
  ok('Boscastle: View from here completes',!!s,JSON.stringify(s)+' in '+((Date.now()-t0)/1000).toFixed(1)+' s');
  ok('Boscastle: ground still checked to 10 km',s&&s.range===10000);
  ok('no JS errors (plain run)',errs.length===0,errs.join(' | ').slice(0,200));await b.close()}
// 2. hanging and failing tiles: the build still finishes (context routes, so the live service worker's own requests are caught too)
{const {b,p,errs,open}=await openSite(BASE,process.argv[3],{width:1300,height:900});
  await open('#c=50.68967%2C-4.70329%2C16&l=50.68967%2C-4.70407');await p.waitForFunction(()=>window.__viewshed,null,{timeout:20000});
  // three far tiles (zoom 13) never answer, however often they are asked; one near tile (zoom 17) hangs once and answers
  // when asked again; one zoom-14 tile fails outright
  const dead=new Set(),once=new Set();let failed=0;
  await p.context().route(/\/(?:terrain|tc)\/(13|14|17)\/(\d+)\/(\d+)\.png/,r=>{const m=r.request().url().match(/(?:terrain|tc)\/(\d+)\/(\d+)\/(\d+)/),z=+m[1],k=m.slice(1).join('/');
    if(z===13&&(dead.has(k)||dead.size<3)){dead.add(k);return}   // never answered
    if(z===17&&!once.size){once.add(k);return}
    if(z===14&&failed<1){failed++;return r.fulfill({status:500,body:'x'})}
    return r.fallback()});
  const t0=Date.now();
  const s=await Promise.race([p.evaluate(async ll=>{const s=await window.__viewshed.run(ll);return s&&{range:s.range,slow:s.slowTiles,flags:[...s.flag].filter(f=>f).length,msg:document.getElementById('vfhwarn').textContent}},BOS),
    new Promise(r=>setTimeout(()=>r('HUNG'),90000))]);
  const secs=(Date.now()-t0)/1000;
  ok('hanging tiles: the build finishes',s&&s!=='HUNG',JSON.stringify(s)+' in '+secs.toFixed(1)+' s');
  ok('hanging tiles: finished within about one tile deadline (20 s) of normal',secs<60,secs.toFixed(1)+' s');
  ok('hanging tiles: the three dead tiles counted as late; the one that hung once was asked again',s&&s!=='HUNG'&&s.slow===3,s&&s.slow);
  ok('hanging tiles: the warning says tiles did not arrive',s&&s!=='HUNG'&&/did not arrive in time/.test(s.msg),s&&s.msg);
  ok('hanging tiles: still 10 km',s&&s!=='HUNG'&&s.range===10000);
  ok('hanging tiles: the progress message is cleared',!/fetching the ground/.test(await p.evaluate(()=>document.getElementById('msg').textContent)));
  ok('no JS errors (hanging tiles)',errs.length===0,errs.join(' | ').slice(0,200));await b.close()}
console.log(pass+' passed, '+fail+' failed');process.exit(fail?1:0);
