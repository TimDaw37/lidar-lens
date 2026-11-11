// Release 6 (11 Nov 2026, Tim pt2115u/pt2116u): in field mode, tapping the distance/bearing readout shows the target, however far
// away, in the part of the map you can see; Recentre brings you back. After a jump to the target, GPS updates do not pull the map
// back until Recentre is tapped. Usage (from tests/): node field4.test.mjs <site URL> [dist folder]
import {openSite} from './open.mjs';
const BASE=(process.argv[2]||'').replace(/\/?$/,'/');if(!/^https?:/.test(BASE)){console.error('give the site URL');process.exit(2)}
const DIST=process.argv[3];let pass=0,fail=0;const ok=(n,c,i='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(i?' '+i:''))};
const ME={latitude:51.17886,longitude:-1.83},PERTH=[56.3950,-3.4370],NEAR=[51.17886,-1.82623];
// where a point sits on screen, and the visible map between the search bar and the sheet (or beside it on a desktop)
const at=(p,ll)=>p.evaluate(ll=>{const m=window.__lens.map,mr=m.getContainer().getBoundingClientRect(),q=m.latLngToContainerPoint(ll),tb=document.getElementById('titlebox').getBoundingClientRect(),f=document.getElementById('fld').getBoundingClientRect(),desk=f.left>5;
  const x=mr.left+q.x,y=mr.top+q.y,zc=document.querySelector('.leaflet-control-zoom'),zr=zc&&getComputedStyle(zc).display!=='none'?zc.getBoundingClientRect():null,box={l:desk?f.right:0,t:tb.bottom,r:desk&&zr&&zr.width?zr.left:innerWidth,b:desk?innerHeight:f.top};   // on a desktop, clear of the zoom buttons too; on a phone the middle of the screen across (release 7)
  return {x,y,box,inside:x>box.l+10&&x<box.r-10&&y>box.t+10&&y<box.b-10,cy:(box.t+box.b)/2,cx:(box.l+box.r)/2}},ll);
const st=p=>p.evaluate(()=>window.__field.state());
for(const [w,h,touch] of [[360,760,1],[375,812,1],[1280,800,0]]){
  const tag=w+'x'+h;
  const {b,p,ctx,errs,open}=await openSite(BASE,DIST,{width:w,height:h},Object.assign({geolocation:ME,permissions:['geolocation']},touch?{isMobile:true,hasTouch:true,deviceScaleFactor:2}:{}));
  // far target: Perth, ~590 km
  await open(`#c=${ME.latitude}%2C${ME.longitude}%2C15&ui=field&tgt=${PERTH.join(',')}`);await p.waitForTimeout(3000);
  const t=await p.evaluate(()=>{const e=document.querySelector('#fldread .t'),r=e.getBoundingClientRect(),c=getComputedStyle(e),g=document.getElementById('fldbig'),k=[...g.children].filter(x=>x.offsetWidth);
    return {go:e.classList.contains('go'),h:r.height,cur:c.cursor,tab:e.tabIndex,title:e.title,one:k.every(x=>Math.abs(x.offsetTop-k[0].offsetTop)<=4),txt:g.textContent,chev:getComputedStyle(e,'::after').content}});
  ok(tag+': readout looks tappable (outline, chevron, pointer, focusable, title)',t.go&&t.cur==='pointer'&&t.tab===0&&/target/.test(t.title)&&/›|203A/.test(t.chev),JSON.stringify(t));
  ok(tag+': readout hit area at least 48 px tall',t.h>=48,Math.round(t.h)+' px');
  ok(tag+': "'+t.txt+'" stays on one line',t.one);
  let a=await at(p,PERTH),me=await at(p,[ME.latitude,ME.longitude]);
  ok(tag+': starts with you in view, the far target off screen',me.inside&&!a.inside);
  if(touch)await p.tap('#fldread .t');else await p.click('#fldread .t');await p.waitForTimeout(900);
  a=await at(p,PERTH);let s=await st(p);
  ok(tag+': tapping the readout shows the target in the visible map',a.inside,JSON.stringify(a));
  ok(tag+': …centred between the search bar and the sheet',Math.abs(a.y-a.cy)<=8&&Math.abs(a.x-a.cx)<=12,`(${Math.round(a.x)},${Math.round(a.y)}) vs (${Math.round(a.cx)},${Math.round(a.cy)})`);
  ok(tag+': …following stops, Recentre lit',!s.follow&&await p.evaluate(()=>document.getElementById('fldfit').classList.contains('on')));
  ok(tag+': …zoomed in close enough to see the ground',await p.evaluate(()=>window.__lens.map.getZoom()>=16));
  await ctx.setGeolocation({latitude:ME.latitude+0.0004,longitude:ME.longitude+0.0003});await p.waitForTimeout(1500);
  a=await at(p,PERTH);ok(tag+': a GPS update does not snap the map back',a.inside,JSON.stringify((await st(p)).me));
  if(touch)await p.tap('#fldfit');else await p.click('#fldfit');await p.waitForTimeout(900);
  me=await at(p,[ME.latitude+0.0004,ME.longitude+0.0003]);s=await st(p);
  ok(tag+': Recentre brings you back and follows again',me.inside&&s.follow,JSON.stringify(me));
  // near target: ~260 m
  await p.evaluate(ll=>window.__field.setTarget(ll[0],ll[1],''),NEAR);await p.waitForTimeout(900);
  await p.evaluate(()=>{const m=window.__lens.map;m.setView(m.getCenter(),12,{animate:false})});await p.waitForTimeout(300);
  if(touch)await p.tap('#fldread .t');else await p.click('#fldread .t');await p.waitForTimeout(900);
  a=await at(p,NEAR);ok(tag+': near target: tap shows it, centred',a.inside&&Math.abs(a.y-a.cy)<=8,JSON.stringify(a));
  if(touch)await p.tap('#fldfit');else await p.click('#fldfit');await p.waitForTimeout(900);
  a=await at(p,NEAR);me=await at(p,[ME.latitude+0.0004,ME.longitude+0.0003]);ok(tag+': near target: Recentre shows you and the target together',a.inside&&me.inside);
  if(!touch){await p.click('#fldfit');await p.focus('#fldread .t');await p.evaluate(()=>{const m=window.__lens.map;m.setView([51.3,-1.6],13,{animate:false})});
    await p.keyboard.press('Enter');await p.waitForTimeout(700);a=await at(p,NEAR);ok(tag+': Enter on the focused readout shows the target',a.inside)}
  // no target: the readout is not a button
  await p.evaluate(()=>window.__field.clearTarget());await p.waitForTimeout(400);
  ok(tag+': no target: no tappable readout',await p.evaluate(()=>!document.querySelector('#fldread .t').classList.contains('go')));
  ok(tag+': no JS errors',errs.length===0,errs.join(' | ').slice(0,200));await b.close()}
console.log(pass+' passed, '+fail+' failed');process.exit(fail?1:0);
