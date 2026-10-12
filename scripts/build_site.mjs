// Build a production copy of the viewer into dist/: one minified JS bundle and one CSS file with
// content-hashed names (served with a 1-year immutable cache), deferred scripts, no inline <style>
// (so the CSP needs no inline script), and a preconnect to the first basemap host.
// Usage: npm i -D esbuild && node scripts/build_site.mjs [configs/your-area.js]   -> dist/
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import * as esbuild from 'esbuild';
const SITE='site',OUT='dist',cfg=process.argv[2];
const TARGET=['es2018','safari12','chrome64','firefox68','edge79','ios12'];
fs.rmSync(OUT,{recursive:true,force:true});fs.mkdirSync(OUT+'/assets/images',{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex').slice(0,8);
let html=fs.readFileSync(SITE+'/index.html','utf8');
// CSS: Leaflet + the page's <style>, minified
const inline=html.match(/<style>([\s\S]*?)<\/style>/)[1];html=html.replace(/<style>[\s\S]*?<\/style>/,'');
const css=(await esbuild.transform(fs.readFileSync(SITE+'/vendor/leaflet.css','utf8')+'\n'+inline,{loader:'css',minify:true,target:TARGET})).code;
for(const f of fs.readdirSync(SITE+'/vendor/images'))fs.copyFileSync(SITE+'/vendor/images/'+f,OUT+'/assets/images/'+f);
const cssName='app.'+hash(css)+'.css';fs.writeFileSync(OUT+'/assets/'+cssName,css);
// JS: Leaflet + app scripts in page order, transpiled for older browsers and minified (no eval, no modules)
const order=['vendor/leaflet.js','lens.js','tools.js','ui.js'];
let js='';for(const f of order)js+=(await esbuild.transform(fs.readFileSync(SITE+'/'+f,'utf8'),{loader:'js',minify:true,target:TARGET,supported:{destructuring:true},legalComments:'inline'})).code+';\n';
const jsName='app.'+hash(js)+'.js';fs.writeFileSync(OUT+'/assets/'+jsName,js);
const compat=(await esbuild.transform(fs.readFileSync(SITE+'/compat.js','utf8'),{loader:'js',minify:true,target:'es5'})).code;
const compatName='compat.'+hash(compat)+'.js';fs.writeFileSync(OUT+'/assets/'+compatName,compat);
html=html.replace('<link rel="stylesheet" href="vendor/leaflet.css">','<link rel="stylesheet" href="assets/'+cssName+'">');
html=html.replace(/<script src="compat\.js"><\/script>\s*<script src="config\.js"><\/script>[\s\S]*?<script src="ui\.js"><\/script>/,
  '<script src="assets/'+compatName+'"></script>\n<script defer src="config.js"></script>\n<script defer src="assets/'+jsName+'"></script>');
let pre='';if(cfg){const c=fs.readFileSync(cfg,'utf8');const m=c.match(/url:\s*'(https:\/\/[^/'{]+)/);if(m)pre='<link rel="preconnect" href="'+m[1]+'">\n';
  const h=c.match(/link:\{[^}]*href:'(https:[^']+)'/);if(h)pre+='<link rel="canonical" href="'+h[1]+'">\n<meta property="og:url" content="'+h[1]+'">\n';
  fs.copyFileSync(cfg,OUT+'/config.js')}
html=html.replace('<title>',pre+'<title>');fs.writeFileSync(OUT+'/index.html',html.replace(/\n\s*\n/g,'\n'));
const sz=f=>(fs.statSync(OUT+'/'+f).size/1024).toFixed(0)+' KB';
console.log('dist/index.html',sz('index.html'),'| assets/'+jsName,sz('assets/'+jsName),'| assets/'+cssName,sz('assets/'+cssName),'| assets/'+compatName,sz('assets/'+compatName));
