// The small red ring that marks a clicked spot (the "Pinned" readout) must not linger (11 Nov 2026): moving the map or closing
// the What's here card releases it. Field mode's target ring is deliberate and stays. Usage (from tests/): node pin.test.mjs <site URL> [dist folder]
import {openSite} from './open.mjs';
const BASE=(process.argv[2]||'').replace(/\/?$/,'/');if(!/^https?:/.test(BASE)){console.error('give the site URL');process.exit(2)}
let pass=0,fail=0;const ok=(n,c,i='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(i?' '+i:''))};
const {b,p,errs,open}=await openSite(BASE,process.argv[3]);
const SH='#c=51.1789%2C-1.8262%2C16&l=51.1789%2C-1.8262&ui=research';await open(SH);
// Wiltshire's 3D-model boxes cover Stonehenge and open their own card on a click; switch that layer off so the click reaches the map
await p.evaluate(()=>{const c=document.getElementById('mshow');if(c&&c.checked){c.checked=false;c.dispatchEvent(new Event('change'))}});
const ring=c=>p.evaluate(c=>[...document.querySelectorAll('.leaflet-pane path')].filter(e=>e.getAttribute('stroke')===c).length,c);
const red=()=>p.evaluate(()=>[...document.querySelectorAll('.leaflet-overlay-pane path,.leaflet-pane path')].filter(e=>e.getAttribute('stroke')==='#d00').length);
const at=ll=>p.evaluate(ll=>{const m=window.__lens.map,r=m.getContainer().getBoundingClientRect(),q=m.latLngToContainerPoint(ll);return [r.left+q.x,r.top+q.y]},ll);
let pt=await at([51.1800,-1.8300]);await p.mouse.click(pt[0],pt[1]);await p.waitForTimeout(500);
ok('a click pins the readout there and shows the ring',(await red())===1&&/Pinned/.test(await p.textContent('#wlab')));
await p.mouse.move(pt[0],pt[1]+120);await p.mouse.down();await p.mouse.move(pt[0]+60,pt[1]+60,{steps:8});await p.mouse.up();await p.waitForTimeout(500);
ok('dragging the map away removes the ring and releases the pin',(await red())===0&&!/Pinned/.test(await p.textContent('#wlab')));
pt=await at([51.1800,-1.8300]);await p.mouse.click(pt[0],pt[1]);await p.waitForTimeout(400);
await p.mouse.wheel(0,-300);await p.waitForTimeout(900);ok('zooming removes it too',(await red())===0);
// What's here? card: ring while the card is open, gone when it closes
await open(SH);{const q=await at([51.1795,-1.8320]);await p.mouse.click(q[0],q[1]);await p.waitForTimeout(300)}
await p.click('#whatis');pt=await at([51.1805,-1.8330]);await p.mouse.click(pt[0],pt[1]);
await p.waitForFunction(()=>{const c=document.getElementById('card');return getComputedStyle(c).display!=='none'&&c.textContent.length>80},null,{timeout:45000}).catch(()=>{});
ok('What\'s here? card open: its spot has only the yellow ring, no red one',(await ring('#facc15'))===1&&(await red())===0,'red '+(await red()));
await p.click('#card .x');await p.waitForTimeout(400);ok('closing the card removes the rings',(await red())===0&&(await ring('#facc15'))===0&&!/Pinned/.test(await p.textContent('#wlab')));
await p.evaluate(()=>{window.__lens.setTool&&window.__lens.setTool(null)});
// sharing a point still works: l= is the lens position, not this ring
await open('#c=51.1789%2C-1.8262%2C16&l=51.17886%2C-1.82623&ui=research');
ok('an l= link still opens the lens on that point',await p.evaluate(()=>{const s=window.__lens.lensState(),ll=window.__lens.map.containerPointToLatLng(s.c);return Math.abs(ll.lat-51.17886)<2e-4&&Math.abs(ll.lng+1.82623)<2e-4}));
ok('and draws no red ring',(await red())===0);
// field mode: map taps do not pin; the target ring stays until cleared
await open('#c=51.1789%2C-1.8262%2C16&ui=field&tgt=51.178860,-1.826230');pt=await at([51.1800,-1.8300]);await p.mouse.click(pt[0],pt[1]);await p.waitForTimeout(400);
ok('field mode: a tap draws no red ring',(await red())===0);
await p.mouse.move(pt[0],pt[1]);await p.mouse.down();await p.mouse.move(pt[0]+50,pt[1]+30,{steps:6});await p.mouse.up();await p.waitForTimeout(500);
ok('field mode: the target ring stays when the map moves',await p.evaluate(()=>!!document.querySelector('.fldtgt')));
await p.evaluate(()=>window.__field.set(false));
ok('no JS errors',errs.length===0,errs.join(' | ').slice(0,300));
console.log(pass+' passed, '+fail+' failed');await b.close();process.exit(fail?1:0);
