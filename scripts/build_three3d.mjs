// Bundle the small part of three.js the 3D block view needs into one self-contained, same-origin file
// (site/vendor/three3d.js, global window.LL3D). It is loaded only when someone opens the 3D view, so the
// main bundle stays small, and it needs no CDN (the Worker's CSP allows scripts from 'self' only).
// Usage: npm i && node scripts/build_three3d.mjs
import * as esbuild from 'esbuild';import fs from 'node:fs';
const entry=`export {WebGLRenderer,Scene,PerspectiveCamera,BufferGeometry,BufferAttribute,Mesh,MeshBasicMaterial,MeshLambertMaterial,
  DirectionalLight,AmbientLight,HemisphereLight,CanvasTexture,SRGBColorSpace,PCFSoftShadowMap,LinearFilter,LinearMipmapLinearFilter,Group,Color,Vector3,DoubleSide,FrontSide,REVISION,
  SphereGeometry,CircleGeometry,LineSegments,LineBasicMaterial,Points,PointsMaterial,Sprite,SpriteMaterial,BackSide,AdditiveBlending} from 'three';   // second line: the sky dome
export {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
export {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
export {AnaglyphEffect} from 'three/examples/jsm/effects/AnaglyphEffect.js';`;
// Red-cyan view (trial, 9 Nov 2026): three's AnaglyphEffect keeps its StereoCamera private, with a 64 mm eye gap meant for scenes in
// metres around a person. The 3D block is hundreds of metres across, so expose the camera (effect.stereo) to set the gap to suit.
const exposeStereo={name:'expose-stereo',setup(b){b.onLoad({filter:/AnaglyphEffect\.js$/},a=>{const src=fs.readFileSync(a.path,'utf8');
  const out=src.replace('const _stereo = new StereoCamera();','const _stereo = this.stereo = new StereoCamera();');if(out===src)throw new Error('AnaglyphEffect: StereoCamera line not found');return {contents:out,loader:'js'}})}};
const r=await esbuild.build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'js'},bundle:true,format:'iife',globalName:'LL3D',minify:true,
  target:['es2018','safari14','chrome80','firefox78'],supported:{destructuring:true},write:false,legalComments:'inline',plugins:[exposeStereo]});
const out='site/vendor/three3d.js';fs.writeFileSync(out,'/* three.js (MIT, https://threejs.org) subset for LiDAR Lens 3D view; built by scripts/build_three3d.mjs */\n'+r.outputFiles[0].text);
console.log(out,(fs.statSync(out).size/1024).toFixed(0)+' KB');
