// Bundle the sky dome (scripts/sky3d/skydome.js with astro.js, the bright-star list and astronomy-engine) into one
// self-contained, same-origin file: site/vendor/sky3d.js, global window.LLSKY. It is fetched only when Sky is ticked in
// the 3D view, so nothing else grows. three.js is not bundled here: the 3D view hands its own copy in.
// Usage: npm i && node scripts/build_sky3d.mjs
import * as esbuild from 'esbuild';import fs from 'node:fs';
const r=await esbuild.build({entryPoints:['scripts/sky3d/skydome.js'],bundle:true,format:'iife',globalName:'LLSKY',minify:true,
  target:['es2018','safari14','chrome80','firefox78'],supported:{destructuring:true},write:false,legalComments:'none'});
const out='site/vendor/sky3d.js';
fs.writeFileSync(out,'/* LiDAR Lens sky dome; includes astronomy-engine (MIT, (c) Don Cross, https://github.com/cosinekitty/astronomy); built by scripts/build_sky3d.mjs */\n'+r.outputFiles[0].text);
console.log(out,(fs.statSync(out).size/1024).toFixed(0)+' KB');
