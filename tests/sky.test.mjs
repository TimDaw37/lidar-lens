// Sky dome checks in Chromium. Usage (from tests/): node sky.test.mjs <site URL> [dist folder]
// e.g. node sky.test.mjs https://lidar-lens-gb-live-test.tim-daw.workers.dev/
// Opens the 3D view with its sky from a View from here viewpoint at Stonehenge, sets midsummer 2500 BC, finds first gleam,
// stands at the viewpoint, and checks the view comes apart cleanly. The sums themselves are checked in astro.test.mjs.
import {openSite} from './open.mjs';
const BASE=(process.argv[2]||'').replace(/\/?$/,'/');if(!/^https?:/.test(BASE)){console.error('give the site URL');process.exit(2)}
let pass=0,fail=0;const ok=(n,c,i='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(i?' '+i:''))};
const {b,p,errs,open}=await openSite(BASE,process.argv[3]);
await open('#c=51.17882%2C-1.82622%2C16&l=51.17882%2C-1.82622&mode=0');
await p.waitForFunction(()=>window.__viewshed&&window.__view3d,null,{timeout:10000});
const sky=()=>p.waitForFunction(()=>{const w=document.getElementById('v3dwait');return (window.__view3d.sky()&&w.hidden)||w.classList.contains('err')},null,{timeout:90000}).then(()=>p.evaluate(()=>window.__view3d.sky()?'':document.getElementById('v3dwait').textContent)).catch(()=>'timed out');
ok('View from here runs',await p.evaluate(async()=>!!(await window.__viewshed.run([51.17882,-1.82622]))));
await p.click('#vfh3d');let e=await sky();ok('3D view opens with its sky from the viewpoint',e==='',e);
const first=await p.evaluate(()=>{const k=window.__view3d.sky(),A=window.LLSKY.astro,v=window.__viewshed.state(),o=A.makeObserver(v.ll.lat,v.ll.lng);
  k.set({year:-2499});k.set({doy:A.seasons(-2499,o).midsummer.doy});document.getElementById('skylimb').value='first_gleam';const r=k.seek('Sun',true),s=k.state();
  return {az:r&&r.az,app:r&&r.app,sky:r&&r.sky,dec:s.sun.dec,yr:document.getElementById('skyyr').value+document.getElementById('skyera').value,day:document.getElementById('skydv').textContent,read:document.getElementById('skyread').textContent,
    objs:k.root.children.length,sunNote:document.getElementById('v3dsunnote').textContent,azOff:document.getElementById('v3daz').disabled}});
ok('year and day shown as 2500 BC, late June',first.yr==='2500BC'&&/^2[0-9] Jun$/.test(first.day),first.yr+' '+first.day);
ok('midsummer 2500 BC: Sun at declination 23.97°',Math.abs(first.dec-23.97)<0.01,first.dec.toFixed(3));
ok('first gleam found on the skyline, 48.5° to 50.5°',first.az>48.5&&first.az<50.5&&Math.abs(first.app-first.sky)<0.003,first.az.toFixed(2)+'°, skyline '+first.sky.toFixed(2)+'°');
ok('readout names Sun and Moon',/^Sun: bearing 4\d\.\d\d°.*Moon: bearing/.test(first.read),first.read.slice(0,90));
ok('block lit by the sky Sun, sliders set aside',first.azOff&&/sky/.test(first.sunNote));
// at first gleam the top of the disc is a few pixels at most; four minutes on, the Sun is clear to see just above the skyline
const lit=await p.evaluate(async()=>{const k=window.__view3d.sky(),v=window.__view3d._v();k.stand(true);const s=k.state();s.fov=6;k.set({minute:s.minute+5});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const c=v.renderer.domElement,g=document.createElement('canvas');g.width=c.width;g.height=c.height;const x=g.getContext('2d');x.drawImage(c,0,0);const d=x.getImageData(0,0,g.width,g.height).data;let n=0,sx=0,sy=0;
  for(let j=0;j<g.height;j+=2)for(let i=0;i<g.width;i+=2){const o=(j*g.width+i)*4;if(d[o]>240&&d[o+1]>225&&d[o+2]>90&&d[o+2]<215){n++;sx+=i;sy+=j}}
  return {n,cx:n?sx/n/g.width:0,cy:n?sy/n/g.height:0,ve:document.getElementById('v3dve').value,veOff:document.getElementById('v3dve').disabled,look:document.getElementById('skylook').textContent,head:k.heading(),camY:v.camera.position.y,eye:window.__viewshed.state().z0+1.5-window.__view3d.model().lo}});
ok('standing: eye 1.5 m above the ground, heights at 1×',Math.abs(lit.camY-lit.eye)<0.01&&lit.ve==='1'&&lit.veOff,lit.camY.toFixed(2)+' m above the block base');
ok('standing: looking at the sunrise',lit.head>48&&lit.head<51&&/^Looking 0(49|50)° \(NE\)/.test(lit.look),lit.look);
ok('the Sun is drawn near the middle of the view',lit.n>50&&Math.abs(lit.cx-0.5)<0.2&&Math.abs(lit.cy-0.5)<0.25,lit.n+' px at '+lit.cx.toFixed(2)+','+lit.cy.toFixed(2));
await p.mouse.move(650,330);await p.mouse.down();await p.mouse.move(450,330,{steps:4});await p.mouse.up();
ok('dragging looks round',await p.evaluate(h=>window.__view3d.sky().heading()>h+0.5,lit.head));
await p.click('#skystand');const back=await p.evaluate(()=>({h:window.__view3d.sky().heading(),veOff:document.getElementById('v3dve').disabled,fov:window.__view3d._v().camera.fov,inside:window.__view3d.sky().state().inside}));
ok('back from standing: orbit view restored, inside the dome as before',back.h===null&&!back.veOff&&back.inside&&back.fov===62,JSON.stringify(back));
await p.click('#skyplay');const m0=await p.evaluate(()=>window.__view3d.sky().state().minute);await p.waitForTimeout(1500);const m1=await p.evaluate(()=>window.__view3d.sky().state().minute);await p.click('#skyplay');
ok('Play turns the sky',m1>m0+2,(m1-m0).toFixed(1)+' min in 1.5 s');
ok('night: stars drawn',await p.evaluate(()=>{const k=window.__view3d.sky();k.set({minute:0});return k.root.children.some(c=>c.isPoints&&c.visible)}));
await p.click('#v3dskyon');const off=await p.evaluate(()=>({sky:!!window.__view3d.sky(),row:document.getElementById('v3dsky').hidden,az:document.getElementById('v3daz').disabled,dome:window.__view3d._v().scene.children.some(c=>c.name==='sky dome')}));
ok('unticking Sky removes the dome and gives the sun sliders back',!off.sky&&off.row&&!off.az&&!off.dome,JSON.stringify(off));
await p.click('#v3dskyon');e=await sky();ok('ticking Sky again brings it back',e==='',e);
await p.click('#v3dx');await p.waitForTimeout(300);
// no viewpoint: Sky uses the centre of the lens
await p.evaluate(()=>window.__viewshed.clear());await p.click('#view3d');await p.waitForFunction(()=>window.__view3d.model()&&document.getElementById('v3dwait').hidden,null,{timeout:30000});
ok('3D view opens without sky by default',await p.evaluate(()=>!document.getElementById('v3dskyon').checked&&!window.__view3d.sky()));
await p.click('#v3dskyon');e=await sky();const c=await p.evaluate(()=>{const v=window.__viewshed.state(),m=window.__view3d.model();return v&&{d:window.__lens.map.distance(v.ll,[m.meta.lat,m.meta.lng])}});
ok('no viewpoint set: Sky stands at the lens centre',e===''&&c&&c.d<2,e||(c&&c.d.toFixed(2)+' m'));
await p.click('#v3dx');for(let k=0;k<2;k++){await p.click('#view3d');await p.waitForFunction(()=>window.__view3d.model()&&document.getElementById('v3dwait').hidden,null,{timeout:30000});await p.click('#v3dx');await p.waitForTimeout(200)}
ok('opens and closes again afterwards',await p.evaluate(()=>!window.__view3d.isOpen()));
ok('no JS errors',!errs.length,errs[0]||'');
await b.close();console.log(pass+'/'+(pass+fail));process.exit(fail?1:0);
