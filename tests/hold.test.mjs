// Press-and-hold on the map no longer opens a pop-up (removed 10 Nov 2026); the What's here? tool (W) still works.
// Usage (from tests/): node hold.test.mjs <site URL> [dist folder]
import {openSite} from './open.mjs';
const BASE=(process.argv[2]||'').replace(/\/?$/,'/');if(!/^https?:/.test(BASE)){console.error('give the site URL');process.exit(2)}
let pass=0,fail=0;const ok=(n,c,i='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(i?' '+i:''))};
const {b,p,errs,open}=await openSite(BASE,process.argv[3]);
await open('#c=51.1789%2C-1.8262%2C16&l=51.1789%2C-1.8262');
const pt=await p.evaluate(()=>{const m=window.__lens.map,r=m.getContainer().getBoundingClientRect(),q=m.latLngToContainerPoint([51.1805,-1.8330]);return [r.left+q.x,r.top+q.y]});
const popped=()=>p.evaluate(()=>({pop:!!document.querySelector('.leaflet-popup'),card:getComputedStyle(document.getElementById('card')).display!=='none'&&!!document.getElementById('card').textContent.trim()}));
for(const ms of [700,2500]){await p.mouse.move(pt[0],pt[1]);await p.mouse.down();await p.waitForTimeout(ms);const s0=await popped();await p.mouse.up();await p.waitForTimeout(800);
  const s1=await popped(),s={pop:s0.pop||s1.pop,card:s0.card||s1.card};ok('holding the mouse '+ms+' ms on the map opens nothing',!s.pop&&!s.card,JSON.stringify(s))}
await p.mouse.click(pt[0],pt[1],{button:'right'});await p.waitForTimeout(800);{const s=await popped();ok('right-click (and a phone long-press, which fires it) opens nothing',!s.pop&&!s.card,JSON.stringify(s))}
// touch: a held touch on the map (pointer events as a phone sends them)
await p.evaluate(([x,y])=>{const el=document.elementFromPoint(x,y);const o={bubbles:true,cancelable:true,clientX:x,clientY:y,pointerId:7,pointerType:'touch',isPrimary:true,button:0};
  el.dispatchEvent(new PointerEvent('pointerdown',o));return new Promise(r=>setTimeout(()=>{el.dispatchEvent(new MouseEvent('contextmenu',o));el.dispatchEvent(new PointerEvent('pointerup',o));r()},2200))},pt);
await p.waitForTimeout(800);{const s=await popped();ok('held touch for 2.2 s opens nothing',!s.pop&&!s.card,JSON.stringify(s))}
ok('a plain click with no tool on opens nothing',await (async()=>{await p.mouse.click(pt[0],pt[1]);await p.waitForTimeout(800);const s=await popped();return !s.pop&&!s.card})());
// What's here? switched on still works
await p.click('#whatis');ok('What\'s here? turns on',await p.evaluate(()=>window.__lens.tool()==='whatis'||document.getElementById('whatis').getAttribute('aria-pressed')==='true'));
await p.mouse.click(pt[0],pt[1]);
const got=await p.waitForFunction(()=>{const c=document.getElementById('card');return getComputedStyle(c).display!=='none'&&/[0-9]/.test(c.textContent)&&c.textContent.length>80},null,{timeout:45000}).then(()=>true,()=>false);
const txt=await p.evaluate(()=>document.getElementById('card').textContent.replace(/\s+/g,' ').slice(0,140));
ok('What\'s here? card opens for the clicked spot with its measurements',got,txt);
ok('no JS errors',errs.length===0,errs.join(' | ').slice(0,300));
console.log(pass+' passed, '+fail+' failed');await b.close();process.exit(fail?1:0);
