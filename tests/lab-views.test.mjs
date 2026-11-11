// Release 6 (11 Nov 2026): each visualisation keeps its own look. Contrast, Gamma, colour ramp and auto contrast no longer
// carry over from one view to the next; a view opens with its own default the first time and with the user's own setting when
// they come back; "Default look for this view" puts back the current view's defaults only; share links set the look as before.
// Usage (from tests/): node lab-views.test.mjs <site URL> [dist folder]
import {openSite} from './open.mjs';
const BASE=(process.argv[2]||'').replace(/\/?$/,'/');if(!/^https?:/.test(BASE)){console.error('give the site URL');process.exit(2)}
const DIST=process.argv[3];let pass=0,fail=0;const ok=(n,c,i='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(i?' '+i:''))};
const near=(a,b)=>Math.abs(a-b)<1e-6;
const {b,p,errs,open}=await openSite(BASE,DIST,{width:1300,height:900});
await open('#c=51.17886%2C-1.82623%2C16&l=51.17886%2C-1.82623');await p.waitForTimeout(1500);
const vs=()=>p.evaluate(()=>window.__lens.viewState());
const mode=async m=>{await p.selectOption('#mode',String(m));await p.waitForTimeout(500)};
const slide=async(id,v)=>{await p.evaluate(([id,v])=>{const e=document.getElementById(id);e.value=String(v);e.dispatchEvent(new Event('input',{bubbles:true}))},[id,v]);await p.waitForTimeout(200)};
let s=await vs();const d0={ct:s.ct,gm:s.gm};
ok('hillshade opens at its own default look, reset button greyed out',s.mode===0&&s.atDefault&&await p.evaluate(()=>document.getElementById('viewreset').disabled),JSON.stringify(s));
await slide('ct',2.5);await slide('gm',1.6);await p.selectOption('#ramp','viridis');await p.waitForTimeout(300);
s=await vs();ok('a tweak shows the reset button',!s.atDefault&&await p.evaluate(()=>!document.getElementById('viewreset').disabled));
await mode(4);s=await vs();ok('sky-view does not inherit the hillshade tweak',s.mode===4&&s.atDefault&&s.ramp==='grey'&&!near(s.ct,2.5)&&!near(s.gm,1.6),JSON.stringify(s));
await mode(10);s=await vs();ok('Combined VAT opens at its own default look',s.atDefault,JSON.stringify(s));
await slide('ct',0.5);await mode(0);s=await vs();
ok('back to hillshade: its own tweak comes back',near(s.ct,2.5)&&near(s.gm,1.6)&&s.ramp==='viridis',JSON.stringify(s));
await mode(10);s=await vs();ok('back to Combined VAT: its own tweak comes back',near(s.ct,0.5),JSON.stringify(s));
await mode(3);await p.click('#auto');await p.waitForTimeout(300);s=await vs();ok('auto contrast off in LRM',!s.auto);
await mode(0);s=await vs();ok('auto contrast still on in hillshade',s.auto);
await mode(3);s=await vs();ok('LRM keeps auto contrast off',!s.auto);
await p.click('#viewreset');await p.waitForTimeout(400);s=await vs();ok('reset: LRM back to its defaults (auto on, its ramp)',s.atDefault&&s.auto&&s.ramp==='rdbu',JSON.stringify(s));
await mode(0);s=await vs();ok('reset of one view leaves the others',near(s.ct,2.5)&&s.ramp==='viridis');
await p.click('#viewreset');await p.waitForTimeout(400);s=await vs();ok('reset hillshade: its own default',s.atDefault&&near(s.ct,d0.ct)&&near(s.gm,d0.gm)&&s.ramp==='grey',JSON.stringify(s));
// the UI shows the right values
ok('sliders show the current view',await p.evaluate(s=>Math.abs(+document.getElementById('ct').value-s.ct)<1e-6&&document.getElementById('ramp').value===s.ramp,s));
// share link with explicit settings keeps them, and the hash carries the current view's look
await mode(2);await slide('ct',1.7);await slide('gm',0.8);await p.evaluate(()=>window.__lens.saveHashSoon());await p.waitForTimeout(800);
const h=await p.evaluate(()=>location.hash);ok('hash carries this view\'s look',/[#&]ct=1.7(&|$)/.test(h)&&/[#&]gm=0.8(&|$)/.test(h)&&/[#&]mode=2(&|$)/.test(h),h.slice(0,200));
await open(h.replace(/^#/,'#'));await p.waitForTimeout(1500);s=await vs();ok('share link opens with exactly that look',s.mode===2&&near(s.ct,1.7)&&near(s.gm,0.8),JSON.stringify(s));
await mode(0);s=await vs();ok('…and other views from the link page open at their defaults',s.atDefault,JSON.stringify(s));
await mode(2);s=await vs();ok('…and the linked view keeps the link\'s look',near(s.ct,1.7)&&near(s.gm,0.8));
// Reset to defaults (all) clears every view
await slide('ct',3);await mode(0);await slide('ct',3);await p.click('#reset');await p.waitForTimeout(700);s=await vs();ok('Reset to defaults clears every view',s.mode===0&&s.atDefault&&s.kept.length===0,JSON.stringify(s));
await mode(2);s=await vs();ok('…including views tweaked before',s.atDefault);
ok('no JS errors',errs.length===0,errs.join(' | ').slice(0,200));await b.close();
// field mode: Hillshade / VAT buttons use each view's own look
{const {b,p,errs,open}=await openSite(BASE,DIST,{width:1300,height:900});
  await open('#c=51.17886%2C-1.82623%2C16&l=51.17886%2C-1.82623&ui=field');await p.waitForTimeout(1500);
  await p.click('#fldviews button[data-v=vat]');await p.waitForTimeout(500);let s=await p.evaluate(()=>window.__lens.viewState());
  ok('field VAT at its own default look',s.mode===10&&s.atDefault,JSON.stringify(s));
  await p.click('#fldviews button[data-v=hs]');await p.waitForTimeout(500);s=await p.evaluate(()=>window.__lens.viewState());
  ok('field Hillshade at its own default look after VAT',s.mode===0&&s.atDefault,JSON.stringify(s));
  ok('no JS errors (field)',errs.length===0,errs.join(' | ').slice(0,200));await b.close()}
console.log(pass+' passed, '+fail+' failed');process.exit(fail?1:0);
