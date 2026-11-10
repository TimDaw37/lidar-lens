// Inside the dome (sky panel button "Inside the dome", share links with dome=in), at Stonehenge.
// Usage (from tests/): node inside.test.mjs <site URL> [dist folder]
// The camera goes in under the dome, above the ground, looking up and out: the sky fills most of the view, it can be
// turned and zoomed but never leaves the dome or sinks below the eye; the button, Reset view, Stand and the Sky tick box
// all bring the usual block view back.
import {openSite} from './open.mjs';
const BASE=(process.argv[2]||'').replace(/\/?$/,'/');if(!/^https?:/.test(BASE)){console.error('give the site URL');process.exit(2)}
let pass=0,fail=0;const ok=(n,c,i='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(i?' '+i:''))};
const SH='#c=51.1789%2C-1.8262%2C16&l=51.1789%2C-1.8262&vp=51.17882%2C-1.82622&sky=1';
const skyOpen=p=>p.waitForFunction(()=>window.__view3d&&window.__view3d.isOpen()&&window.__view3d.sky()&&document.getElementById('v3dwait').hidden,null,{timeout:120000});
// camera relative to the dome: distance from its centre (the eye) in dome radii, height above the eye in dome radii,
// and the share of the picture's top-to-bottom centre line that is sky (bluish, brighter than the ground)
const cam=p=>p.evaluate(()=>{const v=window.__view3d._v(),k=window.__view3d.sky(),c=k.root.position,Rd=k.root.children[0].geometry.parameters.radius,q=v.camera.position;
  return {d:q.distanceTo(c)/Rd,h:(q.y-c.y)/Rd,fov:v.camera.fov,inside:k.state().inside,pressed:document.getElementById('skyinside').getAttribute('aria-pressed'),hash:location.hash,maxD:v.controls.maxDistance,pan:v.controls.enablePan}});
const skyShare=async p=>{const r=await p.locator('#v3dstage').boundingBox(),b64=(await p.screenshot({clip:r})).toString('base64');   // decoded in the page: no PNG package needed
  return p.evaluate(async b64=>{const im=new Image();im.src='data:image/png;base64,'+b64;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);
    const x=Math.floor(im.width/2),d=g.getImageData(x,0,1,im.height).data;let sky=0,n=0;for(let y=0;y<im.height;y+=2){const i=y*4;n++;if(d[i+2]>d[i]+25&&d[i+2]>d[i+1])sky++}return sky/n},b64)};
const drag=async(p,dx,dy)=>{const r=await p.locator('#v3dstage canvas').first().boundingBox();const x=r.x+r.width/2,y=r.y+r.height/2;await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+dx,y+dy,{steps:12});await p.mouse.up();await p.waitForTimeout(300)};

{const o=await openSite(BASE,process.argv[3]);const p=o.p;await o.open(SH);await skyOpen(p);await p.evaluate(()=>window.__view3d.sky().set({doy:172,minute:600}));await p.waitForTimeout(800);   // a summer morning, so the sky is blue
  const a=await cam(p),s0=await skyShare(p);
  ok('sky=1 alone still opens the usual block view (camera outside the dome)',!a.inside&&a.d>1&&a.pressed==='false',JSON.stringify({d:a.d.toFixed(2)}));
  await p.click('#skyinside');await p.waitForTimeout(800);const b=await cam(p),s1=await skyShare(p);
  ok('Inside the dome: camera under the dome, above the eye',b.inside&&b.pressed==='true'&&b.d<1&&b.h>0,JSON.stringify({d:b.d.toFixed(2),h:b.h.toFixed(2)}));
  ok('wider view and no panning while inside',b.fov>50&&b.pan===false,b.fov+' '+b.pan);
  if(s0!=null)ok('much more sky on screen',s1>0.55&&s1>s0+0.15,'sky share '+s0.toFixed(2)+' -> '+s1.toFixed(2));
  await p.waitForTimeout(900);ok('page link gains dome=in',/sky=1/.test((await cam(p)).hash)&&/dome=in/.test((await cam(p)).hash));
  await drag(p,0,-600);let c=await cam(p);ok('dragging the view right down: still above the ground and under the dome',c.h>0.02&&c.d<1,JSON.stringify({d:c.d.toFixed(2),h:c.h.toFixed(2)}));
  await drag(p,0,700);c=await cam(p);ok('dragging the other way: still under the dome',c.d<1&&c.h>0.02,JSON.stringify({d:c.d.toFixed(2),h:c.h.toFixed(2)}));
  const r=await p.locator('#v3dstage canvas').first().boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);for(let i=0;i<25;i++){await p.mouse.wheel(0,400);await p.waitForTimeout(40)}await p.waitForTimeout(400);
  c=await cam(p);ok('zooming right out stays inside the dome',c.d<1.0,c.d.toFixed(2));
  await drag(p,500,0);c=await cam(p);ok('turning round keeps it inside',c.d<1&&c.h>0.02);
  await p.click('#skyinside');await p.waitForTimeout(800);c=await cam(p);
  ok('clicking again brings the usual view back (limits restored)',!c.inside&&c.d>1&&c.fov===a.fov&&c.maxD===a.maxD&&c.pan===a.pan,JSON.stringify({d:c.d.toFixed(2),fov:c.fov}));
  await p.waitForTimeout(900);ok('page link drops dome=in',!/dome=in/.test((await cam(p)).hash));
  await p.click('#skyinside');await p.waitForTimeout(300);await p.click('#skystand');await p.waitForTimeout(500);
  c=await cam(p);const st=await p.evaluate(()=>window.__view3d.sky().state().standing);ok('Stand at the viewpoint from inside: standing, Inside off',st&&!c.inside&&c.pressed==='false');
  await p.click('#skystand');await p.waitForTimeout(500);c=await cam(p);ok('Back to the block from standing: usual view',!c.inside&&c.d>1);
  await p.click('#skyinside');await p.waitForTimeout(300);await p.click('#v3dreset');await p.waitForTimeout(500);c=await cam(p);ok('Reset view leaves the dome',!c.inside&&c.d>1&&c.maxD===a.maxD);
  await p.click('#skyinside');await p.waitForTimeout(300);await p.click('#v3dskybtn');await p.waitForTimeout(800);
  const off=await p.evaluate(()=>{const v=window.__view3d._v();return {sky:!!window.__view3d.sky(),maxD:v.controls.maxDistance,pan:v.controls.enablePan,fov:v.camera.fov}});
  ok('turning the sky off while inside restores the block view controls',!off.sky&&off.maxD===a.maxD&&off.pan===a.pan&&off.fov===a.fov,JSON.stringify(off));
  ok('no JS errors (button)',o.errs.length===0,o.errs.join(' | '));await o.b.close()}

{const o=await openSite(BASE,process.argv[3]);const p=o.p;await o.open(SH+'&dome=in');await skyOpen(p);await p.waitForTimeout(1200);const c=await cam(p);
  ok('share link with dome=in opens straight inside the dome',c.inside&&c.pressed==='true'&&c.d<1&&c.h>0,JSON.stringify({d:c.d.toFixed(2),h:c.h.toFixed(2)}));
  ok('no JS errors (dome=in link)',o.errs.length===0,o.errs.join(' | '));await o.b.close()}
{const o=await openSite(BASE,process.argv[3],{width:420,height:860});const p=o.p;await o.open(SH+'&dome=in');await skyOpen(p);await p.waitForTimeout(1200);const c=await cam(p);
  ok('phone width: dome=in opens inside too',c.inside&&c.d<1&&c.h>0);ok('no JS errors (phone)',o.errs.length===0,o.errs.join(' | '));await o.b.close()}
console.log(pass+' passed, '+fail+' failed');process.exit(fail?1:0);
