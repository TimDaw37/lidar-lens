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
// per-area page description (config metaDescription:'...'), so a non-England lens does not say Environment Agency
if(cfg){const m=fs.readFileSync(cfg,'utf8').match(/metaDescription:'([^']*)'/);if(m)html=html.replace(/(<meta name="description" content=")[^"]*/,'$1'+m[1].replace(/"/g,'&quot;'))}
// config noModels:true removes the Models section, its card and models.js/models.json altogether (GB test lens: models live on Tim's blog)
const NOMODELS=!!(cfg&&/\bnoModels:true/.test(fs.readFileSync(cfg,'utf8')));
if(NOMODELS){html=html.replace(/\n <details class="sec" open id="models">[\s\S]*?\n <\/details>/,'').replace(/<div id="mcard" hidden><\/div>\n?/,'')}
// CSS: Leaflet + the page's <style>, minified
const inline=html.match(/<style>([\s\S]*?)<\/style>/)[1];html=html.replace(/<style>[\s\S]*?<\/style>/,'');
const css=(await esbuild.transform(fs.readFileSync(SITE+'/vendor/leaflet.css','utf8')+'\n'+inline,{loader:'css',minify:true,target:TARGET})).code;
for(const f of fs.readdirSync(SITE+'/vendor/images'))fs.copyFileSync(SITE+'/vendor/images/'+f,OUT+'/assets/images/'+f);
const cssName='app.'+hash(css)+'.css';fs.writeFileSync(OUT+'/assets/'+cssName,css);
// JS: Leaflet + app scripts in page order, transpiled for older browsers and minified (no eval, no modules)
const order=['vendor/leaflet.js','lens.js','tools.js','ui.js','layers.js'].concat(NOMODELS?[]:['models.js']);
let js='';for(const f of order)js+=(await esbuild.transform(fs.readFileSync(SITE+'/'+f,'utf8'),{loader:'js',minify:true,target:TARGET,supported:{destructuring:true},legalComments:'inline'})).code+';\n';
const jsName='app.'+hash(js)+'.js';fs.writeFileSync(OUT+'/assets/'+jsName,js);
const compat=(await esbuild.transform(fs.readFileSync(SITE+'/compat.js','utf8'),{loader:'js',minify:true,target:'es5'})).code;
const compatName='compat.'+hash(compat)+'.js';fs.writeFileSync(OUT+'/assets/'+compatName,compat);
html=html.replace('<link rel="stylesheet" href="vendor/leaflet.css">','<link rel="stylesheet" href="assets/'+cssName+'">');
// 3D view (site/view3d.js + vendor/three3d.js): kept out of the main bundle, so adding it leaves app.*.js, app.*.css and
// compat.*.js byte-identical. view3d.js gets its own hashed, deferred script after the bundle; three3d.js is only fetched
// when someone opens the 3D view, so view3d.js is pointed at its hashed name here.
if(fs.existsSync(SITE+'/view3d.js')){let v=fs.readFileSync(SITE+'/view3d.js','utf8');
  if(fs.existsSync(SITE+'/vendor/three3d.js')){const t3=fs.readFileSync(SITE+'/vendor/three3d.js');const t3Name='three3d.'+hash(t3)+'.js';fs.writeFileSync(OUT+'/assets/'+t3Name,t3);
    if(!v.includes("'vendor/three3d.js'"))throw new Error('view3d.js: three3d path not found');v=v.split("'vendor/three3d.js'").join("'assets/"+t3Name+"'")}
  v=(await esbuild.transform(v,{loader:'js',minify:true,target:TARGET,supported:{destructuring:true},legalComments:'inline'})).code;
  const vName='view3d.'+hash(v)+'.js';fs.writeFileSync(OUT+'/assets/'+vName,v);html=html.replace('<script src="view3d.js"></script>','<script defer src="assets/'+vName+'"></script>')}
else html=html.replace(/\n?<script src="view3d\.js"><\/script>/,'');
html=html.replace(/<script src="compat\.js"><\/script>\s*<script src="config\.js"><\/script>[\s\S]*?<script src="models\.js"><\/script>/,
  '<script src="assets/'+compatName+'"></script>\n<script defer src="config.js"></script>\n<script defer src="assets/'+jsName+'"></script>');
let pre='';if(cfg){const c=fs.readFileSync(cfg,'utf8');const m=c.match(/url:\s*'(https:\/\/[^/'{]+)/);if(m)pre='<link rel="preconnect" href="'+m[1]+'">\n';
  const h=c.match(/link:\{[^}]*href:'(https:[^']+)'/);if(h)pre+='<link rel="canonical" href="'+h[1]+'">\n<meta property="og:url" content="'+h[1]+'">\n';
  const tn=c.match(/toolName:\s*'((?:[^'\\]|\\.)*)'/);if(tn){const n=tn[1].replace(/\\'/g,"'").replace(/&/g,'&amp;');html=html.split('What is it?').join(n)}
  const at=c.match(/analyticsToken:\s*'([0-9a-f]{32})'/);if(at)html=html.replace('</body>','<script defer src=\'https://static.cloudflareinsights.com/beacon.min.js\' data-cf-beacon=\'{"token": "'+at[1]+'"}\'></script>\n</body>');   // Cloudflare Web Analytics
  const cn=c.match(/cname:\s*'([^']+)'/);if(cn)fs.writeFileSync(OUT+'/CNAME',cn[1]+'\n');   // GitHub Pages custom domain
  const cfgName='config.'+hash(c)+'.js';fs.writeFileSync(OUT+'/assets/'+cfgName,c);fs.copyFileSync(cfg,OUT+'/config.js');
  html=html.replace('<script defer src="config.js"></script>','<script defer src="assets/'+cfgName+'"></script>')}
if(fs.existsSync(SITE+'/icons'))for(const f of fs.readdirSync(SITE+'/icons'))fs.copyFileSync(SITE+'/icons/'+f,OUT+'/'+f);   // favicon + manifest at the site root
if(!NOMODELS&&fs.existsSync(SITE+'/models.json'))fs.copyFileSync(SITE+'/models.json',OUT+'/models.json');
// An area's OSTN15 correction grid can sit next to its config as <config>-ostn_grid.json (e.g. configs/england-ostn_grid.json);
// it is written as whole cm, delta-coded (about half the download), and tools.js and live-sw.js decode it
if(process.argv[2]){const g=process.argv[2].replace(/\.js$/,'-ostn_grid.json');if(fs.existsSync(g)){fs.mkdirSync(OUT+'/data',{recursive:true});{const G=JSON.parse(fs.readFileSync(g,'utf8'));if(!G.enc){for(const k of['de','dn']){let p=0;G[k]=G[k].map(x=>{const v=Math.round(x*100),d=v-p;p=v;return d})}G.enc='cm-delta'}fs.writeFileSync(OUT+'/data/ostn_grid.json',JSON.stringify(G))}}}
if(fs.existsSync(SITE+'/live-sw.js'))fs.copyFileSync(SITE+'/live-sw.js',OUT+'/live-sw.js');   // live mode service worker: fixed name at the site root (its scope)
// an area whose live mode differs can build its own worker: a make_sw.mjs next to its config (gb/make_sw.mjs: the Great Britain worker)
if(cfg&&fs.existsSync(path.dirname(cfg)+'/make_sw.mjs'))fs.writeFileSync(OUT+'/live-sw.js',(await import(path.resolve(path.dirname(cfg)+'/make_sw.mjs'))).default(cfg));
html=html.replace('<title>',pre+'<title>');fs.writeFileSync(OUT+'/index.html',html.replace(/\n\s*\n/g,'\n'));
// Cloudflare static assets ignore long Cache-Control on hashed files unless _headers says so.
fs.writeFileSync(OUT+'/_headers','/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n');
if(fs.existsSync(SITE+'/nhle_places.json'))fs.copyFileSync(SITE+'/nhle_places.json',OUT+'/nhle_places.json');
// an area can carry its own scheduled-monument names for type-ahead search as <config>-places.json (e.g. configs/england-places.json)
// or, for several configs of one area, as places.json in the config's folder (gb/places.json: England, Wales and Scotland)
if(process.argv[2]){const pl=process.argv[2].replace(/\.js$/,'-places.json'),pd=path.dirname(process.argv[2])+'/places.json';if(fs.existsSync(pl))fs.copyFileSync(pl,OUT+'/nhle_places.json');else if(fs.existsSync(pd))fs.copyFileSync(pd,OUT+'/nhle_places.json')}
const sz=f=>(fs.statSync(OUT+'/'+f).size/1024).toFixed(0)+' KB';
console.log('dist/index.html',sz('index.html'),'| assets/'+jsName,sz('assets/'+jsName),'| assets/'+cssName,sz('assets/'+cssName),'| assets/'+compatName,sz('assets/'+compatName));
