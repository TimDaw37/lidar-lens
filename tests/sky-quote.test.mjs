// The sky dome's loading message carries a quiet quote (11 Nov 2026) that goes with the message. Usage: node sky-quote.test.mjs <site URL> [dist folder] [screenshot]
import {openSite} from './open.mjs';
const BASE=(process.argv[2]||'').replace(/\/?$/,'/');if(!/^https?:/.test(BASE)){console.error('give the site URL');process.exit(2)}
let pass=0,fail=0;const ok=(n,c,i='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(i?' '+i:''))};
const Q='\u201cWe are all in the gutter, but some of us are looking at the stars.\u201d',A='\u2014 Oscar Wilde, Lady Windermere\u2019s Fan';
for(const [w,h,mob] of [[1300,900,false],[390,844,true]]){
  const {b,p,errs}=await openSite(BASE,process.argv[3],{width:w,height:h},mob?{isMobile:true,hasTouch:true,deviceScaleFactor:2}:{});
  await p.goto(BASE+'#c=51.1789%2C-1.8262%2C16&l=51.1789%2C-1.8262&ui=research&sky=1&doy=172&min=600',{waitUntil:'load'});
  const seen=await p.waitForFunction(()=>{const w=document.getElementById('v3dwait');return w&&!w.hidden&&/skyline/.test(w.textContent)&&w.querySelector('.v3dq')},null,{timeout:90000,polling:50}).then(()=>true,()=>false);
  const q=seen?await p.evaluate(()=>{const e=document.querySelector('#v3dwait .v3dq'),c=getComputedStyle(e),r=e.getBoundingClientRect(),w=document.getElementById('v3dwait').getBoundingClientRect();return {t:e.textContent,it:c.fontStyle,fs:parseFloat(c.fontSize),col:c.color,inside:r.left>=w.left-1&&r.right<=w.right+1&&r.bottom<=w.bottom+1,vw:innerWidth,right:r.right}}):null;
  if(seen&&process.argv[4])await p.screenshot({path:process.argv[4].replace(/\.png$/,'')+'_'+w+'x'+h+'.png'});
  ok(w+'px: the quote shows with the skyline loading message',seen&&q.t.startsWith(Q)&&q.t.includes(A),q&&q.t);
  ok(w+'px: quiet italic line, readable (≥11 px), inside the message box and on screen',!!q&&q.it==='italic'&&q.fs>=11&&q.fs<=13&&q.inside&&q.right<=q.vw,JSON.stringify(q));
  const gone=await p.waitForFunction(()=>{const w=document.getElementById('v3dwait');return window.__view3d.sky()&&w.hidden},null,{timeout:120000}).then(()=>true,()=>false);
  ok(w+'px: it goes when the dome is ready, with the message',gone&&await p.evaluate(()=>{const e=document.querySelector('#v3dwait .v3dq');return !e||e.offsetParent===null}));
  ok(w+'px: Building the 3D block message has no quote',await p.evaluate(()=>!/Building/.test(document.getElementById('v3dwait').textContent)||!document.querySelector('#v3dwait .v3dq')));
  ok(w+'px: no JS errors',errs.length===0,errs.join(' | ').slice(0,200));await b.close()}
console.log(pass+' passed, '+fail+' failed');process.exit(fail?1:0);
