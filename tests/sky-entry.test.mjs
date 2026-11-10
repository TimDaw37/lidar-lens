// Ways into the sky dome, from a fresh page with no viewpoint, at Stonehenge. Usage (from tests/): node sky-entry.test.mjs <site URL> [dist folder] [screenshot folder]
// 1. the Sky button in Tools: asks for a spot, a click there works out the view from it and opens the 3D view with the dome;
//    with a viewpoint already set it goes straight to the dome; K does the same as the button.
// 2. the Sky dome button in the 3D view's header: with no viewpoint the dome stands at the centre of the block.
// 3. share links: sky=1 (with vp, or without it for the lens centre) opens straight into the dome; the existing routes still work.
import {openSite} from './open.mjs';
const BASE=(process.argv[2]||'').replace(/\/?$/,'/');if(!/^https?:/.test(BASE)){console.error('give the site URL');process.exit(2)}
const SHOTS=process.argv[4]||'';
let pass=0,fail=0;const ok=(n,c,i='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(i?' '+i:''))};
const SH='#c=51.1789%2C-1.8262%2C16&l=51.1789%2C-1.8262',SPOT=[51.17882,-1.82622];
const skyOpen=p=>p.waitForFunction(()=>{const w=document.getElementById('v3dwait');return window.__view3d.isOpen()&&((window.__view3d.sky()&&w.hidden)||w.classList.contains('err'))},null,{timeout:120000}).then(()=>p.evaluate(()=>window.__view3d.sky()?'':document.getElementById('v3dwait').textContent));
const clickAt=async(p,ll)=>{const pt=await p.evaluate(ll=>{const m=window.__lens.map,q=m.latLngToContainerPoint(ll),r=m.getContainer().getBoundingClientRect();return [r.left+q.x,r.top+q.y]},ll);await p.mouse.click(pt[0],pt[1])};
const fresh=async()=>{const o=await openSite(BASE,process.argv[3]);await o.open(SH);await o.p.waitForFunction(()=>window.__viewshed&&window.__view3d,null,{timeout:15000});return o};

// ---- route 1: the Sky button ----
{const {b,p,errs}=await fresh();
  const pos=await p.evaluate(()=>{const s=document.getElementById('skybtn'),w=document.getElementById('whatis');return {there:!!s,label:s&&s.textContent,first:!!(s&&w&&s.nextElementSibling===w),inTools:!!(s&&s.closest('details')&&/Tools/.test(s.closest('details').querySelector('summary').textContent)),vp:!!window.__viewshed.state()}});
  ok('Sky button at the top of Tools, clearly labelled',pos.there&&pos.first&&pos.inTools&&/Sky/.test(pos.label),pos.label);
  ok('fresh page has no viewpoint',!pos.vp);
  await p.click('#skybtn');
  const ask=await p.evaluate(()=>({tool:window.__lens.tool(),pressed:document.getElementById('skybtn').getAttribute('aria-pressed'),label:document.getElementById('skybtn').textContent,msg:document.getElementById('msg').textContent}));
  ok('no viewpoint: asks for a spot to stand at',ask.tool==='viewfrom'&&ask.pressed==='true'&&/click a spot to stand at/i.test(ask.label+' '+ask.msg),ask.label+' | '+ask.msg);
  await clickAt(p,SPOT);let e=await skyOpen(p);ok('click: view from there worked out, 3D view opens with the dome',e==='',e);
  const st=await p.evaluate(sp=>{const v=window.__viewshed.state();return {d:v?window.__lens.map.distance(v.ll,sp):null,btn:document.getElementById('v3dskybtn').getAttribute('aria-pressed'),tool:window.__lens.tool(),sky:document.getElementById('skybtn').getAttribute('aria-pressed')}},SPOT);
  ok('viewpoint is the clicked spot',st.d!=null&&st.d<15,st.d&&st.d.toFixed(1)+' m');
  ok('header Sky dome button shows on; Tools button back to normal',st.btn==='true'&&st.sky==='false'&&st.tool==null);
  await p.waitForTimeout(1500);if(SHOTS)await p.screenshot({path:SHOTS+'/route1_sky_button.png'});
  await p.waitForTimeout(800);const h=await p.evaluate(()=>location.hash);ok('page link carries the viewpoint and sky=1',/vp=/.test(h)&&/sky=1/.test(h),h.slice(0,160));
  await p.click('#v3dx');await p.waitForTimeout(500);ok('closing the 3D view drops sky=1 from the link',!/sky=1/.test(await p.evaluate(()=>location.hash)));
  await p.click('#skybtn');e=await skyOpen(p);ok('with a viewpoint set, Sky goes straight to the dome',e==='',e);await p.click('#v3dx');await p.waitForTimeout(300);
  await p.evaluate(()=>window.__viewshed.clear());await p.keyboard.press('k');
  ok('K starts the same',await p.evaluate(()=>window.__lens.tool()==='viewfrom'&&document.getElementById('skybtn').getAttribute('aria-pressed')==='true'));
  await p.keyboard.press('Escape');await p.waitForTimeout(200);
  ok('Esc cancels it',await p.evaluate(()=>window.__lens.tool()==null&&document.getElementById('skybtn').getAttribute('aria-pressed')==='false'));
  await p.keyboard.press('e');await p.waitForTimeout(200);await clickAt(p,SPOT);await p.waitForFunction(()=>window.__viewshed.state(),null,{timeout:60000});await p.waitForTimeout(800);
  ok('View from here (E) still only shows the view, no 3D',await p.evaluate(()=>!window.__view3d.isOpen()&&!document.getElementById('vfh').hidden));
  await p.click('#vfh3d');e=await skyOpen(p);ok('old route: 3D view with sky still works',e==='',e);
  ok('no JS errors (route 1)',errs.length===0,errs.join(' | ').slice(0,300));await b.close()}

// ---- route 2: the Sky dome button in the 3D view ----
{const {b,p,errs}=await fresh();
  await p.click('#view3d');await p.waitForFunction(()=>window.__view3d.model()&&document.getElementById('v3dwait').hidden,null,{timeout:60000});
  const hd=await p.evaluate(()=>{const s=document.getElementById('v3dskybtn'),r=s&&s.getBoundingClientRect();return {there:!!s,inHeader:!!(s&&s.closest('.hd')),vis:!!(r&&r.width>60&&r.height>18),label:s&&s.textContent,on:s&&s.getAttribute('aria-pressed'),sky:!!window.__view3d.sky()}});
  ok('3D view: prominent Sky dome button in the header',hd.there&&hd.inHeader&&hd.vis&&/Sky dome/.test(hd.label)&&hd.on==='false'&&!hd.sky,hd.label);
  await p.click('#v3dskybtn');let e=await skyOpen(p);ok('clicking it opens the dome',e==='',e);
  const c=await p.evaluate(()=>{const v=window.__viewshed.state(),m=window.__view3d.model();return {d:v?window.__lens.map.distance(v.ll,[m.meta.lat,m.meta.lng]):null,box:document.getElementById('v3dskyon').checked,on:document.getElementById('v3dskybtn').getAttribute('aria-pressed')}});
  ok('no viewpoint: the dome stands at the centre of the block',c.d!=null&&c.d<3,c.d&&c.d.toFixed(2)+' m');
  ok('Sky tick box and button agree',c.box&&c.on==='true');
  ok('sky panel keeps its own styling (legend swatches, spaced controls)',await p.evaluate(()=>{const st=document.getElementById('skycss');const sw=document.querySelector('#v3dsky i, #v3dsky .sw, #v3dsky [class*=key] span');return !!st&&st.textContent.length>200&&!/#skybtn/.test(st.textContent)}));
  await p.waitForTimeout(1500);if(SHOTS)await p.screenshot({path:SHOTS+'/route2_3d_sky_dome_button.png'});
  await p.click('#v3dskybtn');await p.waitForTimeout(500);
  ok('clicking again removes the dome',await p.evaluate(()=>!window.__view3d.sky()&&!document.getElementById('v3dskyon').checked&&document.getElementById('v3dskybtn').getAttribute('aria-pressed')==='false'&&!window.__view3d._v().scene.children.some(c=>c.name==='sky dome')));
  await p.click('#v3dskyon');e=await skyOpen(p);ok('the Sky tick box still works and lights the button',e===''&&await p.evaluate(()=>document.getElementById('v3dskybtn').getAttribute('aria-pressed')==='true'),e);
  ok('no JS errors (route 2)',errs.length===0,errs.join(' | ').slice(0,300));await b.close()}

// ---- route 3: share links ----
{const o=await openSite(BASE,process.argv[3]);await o.open(SH+'&vp=51.17882%2C-1.82622&sky=1');let e=await skyOpen(o.p);
  ok('share link with vp and sky=1 opens straight into the dome',e==='',e);
  ok('dome at the linked viewpoint',await o.p.evaluate(()=>{const v=window.__viewshed.state();return !!v&&window.__lens.map.distance(v.ll,[51.17882,-1.82622])<5}));
  ok('no JS errors (vp + sky)',o.errs.length===0,o.errs.join(' | ').slice(0,300));await o.b.close()}
{const o=await openSite(BASE,process.argv[3]);await o.open(SH+'&sky=1');let e=await skyOpen(o.p);
  ok('share link with sky=1 alone opens the dome at the lens centre',e==='',e);
  ok('no JS errors (sky alone)',o.errs.length===0,o.errs.join(' | ').slice(0,300));await o.b.close()}
console.log(pass+' passed, '+fail+' failed');process.exit(fail?1:0);
