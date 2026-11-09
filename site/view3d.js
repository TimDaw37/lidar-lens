/* LiDAR Lens: 3D view. Lifts the ground inside the lens out as a block that can be rotated, lit and saved.
   Heights come from the same Terrarium tiles as the lens (decoded in the browser, no extra source); the surface
   is draped with exactly what the lens is showing. three.js (vendor/three3d.js) loads only when the view opens. */
(function(){
'use strict';
const LZ=window.__lens;if(!LZ)return;
const map=LZ.map,CFG=LZ.CFG,LC=LZ.LC,$=id=>document.getElementById(id);
// ---------- markup: added here, so the view drops into any LiDAR Lens build with one script line ----------
const CSS="#v3d{position:fixed;z-index:3000;inset:3vh 3vw;background:#fff;border-radius:10px;box-shadow:0 6px 30px rgba(0,0,0,.55);display:flex;flex-direction:column;overflow:hidden;font-size:13px}\n#v3d[hidden]{display:none}\n#v3d .hd{display:flex;align-items:baseline;gap:10px;padding:8px 40px 6px 12px;border-bottom:1px solid #e5e7eb;flex-wrap:wrap}#v3d .hd b{font-size:15px}#v3dinfo{color:#444}\n#v3d .x{position:absolute;right:8px;top:4px;border:0;background:none;font-size:24px;cursor:pointer;line-height:1}\n#v3dstage{position:relative;flex:1;min-height:200px;background:#eef1f4}#v3dc{width:100%;height:100%;display:block;touch-action:none;cursor:grab}#v3dc:active{cursor:grabbing}\n#v3dnorth{position:absolute;right:12px;top:12px;width:40px;height:40px;pointer-events:none}#v3dnorth span{position:absolute;left:0;right:0;top:-14px;text-align:center;font-weight:700;font-size:11px;color:#c92a2a}\n#v3dwait{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(255,255,255,.95);padding:10px 14px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.25);max-width:80%}#v3dwait.err{color:#9b1c1c}\n#v3d .ctl{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;padding:8px 12px;border-top:1px solid #e5e7eb}\n#v3d .ctl label{display:flex;align-items:center;gap:6px;margin:0;white-space:nowrap}#v3d .ctl input[type=range]{width:110px}#v3dsun{display:contents}#v3dsun.off label{opacity:.45}#v3dshadowl.off{opacity:.45}#v3d .hint{color:#666;font-size:12px}\n#v3d .btns{display:flex;gap:6px;margin-left:auto}#v3d .btns button{font-size:13px;padding:5px 9px;cursor:pointer;border:1px solid #bbb;border-radius:5px;background:#f3f4f6}\n#v3d .note{margin:0;padding:0 12px 8px;color:#555;font-size:12px}\nbody.v3dopen #card{display:none!important}\n@media (max-width:700px),(max-height:500px) and (pointer:coarse){#v3d{inset:0;border-radius:0}#v3d .ctl input[type=range]{width:90px}#v3d .btns{margin-left:0}#v3d .btns button{min-height:40px}#v3d .note{font-size:11px}}";
const DIALOG="<div id=\"v3d\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"v3dh\" hidden>\n <div class=\"hd\"><b id=\"v3dh\">3D view of the lens</b><span id=\"v3dinfo\"></span><button class=\"x\" id=\"v3dx\" aria-label=\"Close 3D view\" title=\"Close (Esc)\">&times;</button></div>\n <div id=\"v3dstage\"><canvas id=\"v3dc\" aria-label=\"3D block of the ground in the lens. Drag to turn, scroll to zoom.\"></canvas>\n  <div id=\"v3dnorth\" aria-hidden=\"true\"><svg viewBox=\"0 0 40 40\" width=\"40\" height=\"40\"><circle cx=\"20\" cy=\"20\" r=\"18\" fill=\"rgba(255,255,255,.85)\" stroke=\"#555\"/><path d=\"M20 5 L26 22 L20 18 L14 22 Z\" fill=\"#c92a2a\"/><path d=\"M20 35 L26 22 L20 18 L14 22 Z\" fill=\"#888\"/></svg><span>N</span></div>\n  <div id=\"v3dwait\" role=\"status\" aria-live=\"polite\" hidden></div></div>\n <div class=\"ctl\">\n  <label>Surface <select id=\"v3ddrape\" title=\"What is painted on the ground\"><option value=\"lens\">Lens view, as shown</option><option value=\"lenslit\">Lens view + sun shading</option><option value=\"clay\">Plain, lit by the sun</option></select></label>\n  <label>Height &times;<span id=\"v3dvev\"></span><input type=\"range\" id=\"v3dve\" min=\"1\" max=\"10\" step=\"0.5\" title=\"Vertical exaggeration\"></label>\n  <span id=\"v3dsun\"><label>Sun from <span id=\"v3dazv\"></span><input type=\"range\" id=\"v3daz\" min=\"0\" max=\"359\" step=\"1\" title=\"Sun direction (degrees from north)\"></label>\n  <label>Sun height <span id=\"v3delv\"></span><input type=\"range\" id=\"v3del\" min=\"5\" max=\"85\" step=\"1\" title=\"Sun elevation\"></label>\n  <label id=\"v3dshadowl\" title=\"Let the sun cast shadows across the ground (lit surfaces)\"><input type=\"checkbox\" id=\"v3dshadow\"> Shadows</label><span id=\"v3dsunnote\" class=\"hint\"></span></span>\n  <label id=\"v3danal\" title=\"Red–cyan 3D (trial): view with red–cyan glasses, red over the left eye. three.js AnaglyphEffect with Dubois (2001) colour matrices. Colours are muted in this view. Screen only: GLB and STL files are saved as normal. Draws the block twice, so it is slower on phones.\"><input type=\"checkbox\" id=\"v3dana\"> Red–cyan 3D (trial)</label>\n  <label id=\"v3daol\" title=\"Soft shading (trial): darkens hollows and ditches by how much sky each point sees (sky-view factor after Zakšek et al. 2011, 16 directions within 10 m; 8 on phones), on the lit and plain surfaces\"><input type=\"checkbox\" id=\"v3dao\"> Soft shading (trial)</label>\n  <label title=\"Water level (trial): a flat sheet of water at the height chosen, in metres above sea level (OD). Saved in GLB as its own object; never in STL.\"><input type=\"checkbox\" id=\"v3dwat\"> Water (trial) <span id=\"v3dwatv\"></span><input type=\"range\" id=\"v3dwl\" min=\"0\" max=\"1000\" step=\"1\" value=\"300\" disabled></label>\n  <span class=\"btns\"><button id=\"v3dreset\" title=\"Back to the starting view, looking north\">Reset view</button><button id=\"v3dglb\" title=\"Save the block with its surface, for Blender and 3D viewers\">Save GLB</button><button id=\"v3dstl\" title=\"Save the block's shape for 3D printing (metres, with the height exaggeration)\">Save STL</button></span>\n </div>\n <p class=\"note\" id=\"v3dnote\"></p>\n</div>";
if(!document.getElementById('v3dcss')){const st=document.createElement('style');st.id='v3dcss';st.textContent=CSS;document.head.appendChild(st)}
if(!document.getElementById('v3d')){const t=document.createElement('template');t.innerHTML=DIALOG;document.body.appendChild(t.content.firstElementChild)}
if(!document.getElementById('view3d')){const pr=document.getElementById('profile');if(pr){const b=document.createElement('button');b.id='view3d';b.setAttribute('aria-pressed','false');
  b.title='Lift the ground in the lens out as a 3D block you can turn, light and save (D)';b.textContent='3D view of the lens';pr.insertAdjacentElement('afterend',b)}}
{const kt=document.querySelector('#help table.keys');if(kt&&!/3D view/.test(kt.textContent)){const tr=document.createElement('tr');tr.innerHTML='<td>D</td><td>3D view of the lens</td>';kt.appendChild(tr)}}
const btn=$('view3d'),box=$('v3d');if(!btn||!box)return;
const THREE_SRC='vendor/three3d.js';   // build_site.mjs rewrites this to the hashed asset
const phone=()=>Math.min(screen.width,screen.height)<700||matchMedia('(pointer:coarse)').matches;
let T=null,loading=null;               // three.js namespace, once loaded
let V=null;                             // live view: {renderer,scene,camera,controls,group,top,mats,...}
let model=null;                         // last built model: geometry data + metadata
let raf=0,open=false,busy=false;

function loadThree(){if(window.LL3D)return Promise.resolve(window.LL3D);if(loading)return loading;
  loading=new Promise((res,rej)=>{const s=document.createElement('script');s.src=THREE_SRC;s.async=true;
    s.onload=()=>window.LL3D?res(window.LL3D):rej(new Error('3D library did not start'));s.onerror=()=>{loading=null;rej(new Error('3D library could not be loaded'))};document.head.appendChild(s)});
  return loading}

// ---------- heights under the lens ----------
const tHeight=d=>(o)=>d[o+3]<128?NaN:d[o]*256+d[o+1]+d[o+2]/256-32768;
async function sampleLens(){
  const st=LZ.lensState(),zoom=map.getZoom(),rpx=st.ls/2,c=L.point(st.c[0],st.c[1]);
  const maxR=phone()?160:256;          // grid radius in data pixels: ~80k points on a phone, ~200k on a desktop
  const minZ=Math.max(CFG.minz,(LC.live&&LC.live.minzoom)||0);
  let zt=Math.floor(zoom+Math.log2(maxR/rpx));zt=Math.max(minZ,Math.min(CFG.maxz,zt));
  const s=Math.pow(2,zt-zoom),r=rpx*s;  // lens radius in data pixels at zt
  const cll=map.containerPointToLatLng(c),pc=map.project(cll,zt);
  const mpp=156543.03392*Math.cos(cll.lat*Math.PI/180)/Math.pow(2,zt);
  const x0=Math.floor((pc.x-r-2)/256),x1=Math.floor((pc.x+r+2)/256),y0=Math.floor((pc.y-r-2)/256),y1=Math.floor((pc.y+r+2)/256);
  const jobs=[];for(let ty=y0;ty<=y1;ty++)for(let tx=x0;tx<=x1;tx++)jobs.push(LZ.tileData(zt,tx,ty).then(d=>[tx,ty,d]));
  const tiles=new Map();(await Promise.all(jobs)).forEach(([tx,ty,d])=>{if(d)tiles.set(tx+','+ty,d)});
  const px=(ix,iy)=>{const tx=Math.floor(ix/256),ty=Math.floor(iy/256),d=tiles.get(tx+','+ty);if(!d)return NaN;return tHeight(d)(((iy-ty*256)*256+(ix-tx*256))*4)};
  // bilinear on pixel centres
  const hAt=(fx,fy)=>{const gx=fx-0.5,gy=fy-0.5,ix=Math.floor(gx),iy=Math.floor(gy),ax=gx-ix,ay=gy-iy;
    const a=px(ix,iy),b=px(ix+1,iy),cc=px(ix,iy+1),d=px(ix+1,iy+1),w=[(1-ax)*(1-ay),ax*(1-ay),(1-ax)*ay,ax*ay],v=[a,b,cc,d];
    let sw=0,sv=0;for(let k=0;k<4;k++)if(v[k]===v[k]){sw+=w[k];sv+=w[k]*v[k]}return sw>0.05?sv/sw:NaN};
  return {zt,zoom,s,r,rpx,c,cll,pc,mpp,hAt}}

// ---------- mesh: disc with a clean circular rim, vertical walls and a flat base ----------
function buildModel(S){
  const {r,pc,mpp,hAt,s,rpx}=S,n=Math.ceil(r)+1,N=2*n+1,idx=new Int32Array(N*N).fill(-1);
  const inside=(i,j)=>Math.hypot(i,j)<r-0.25;   // keep interior points clear of the rim, so no snapped point lands on one
  const P=[],UV=[],H=[];let nan=0;
  for(let j=-n;j<=n;j++)for(let i=-n;i<=n;i++){let use=inside(i,j),ox=i,oy=j;
    if(!use){for(let dj=-1;dj<=1&&!use;dj++)for(let di=-1;di<=1;di++)if(inside(i+di,j+dj)){use=true;break}
      if(use){const d=Math.hypot(i,j);ox=i*r/d;oy=j*r/d}}       // snap rim vertices onto the circle
    if(!use)continue;
    const h=hAt(pc.x+ox,pc.y+oy);if(h!==h)nan++;
    idx[(j+n)*N+(i+n)]=H.length;H.push(h);P.push(ox*mpp,oy*mpp);
    const k=0.995;UV.push(0.5+ox*k/(2*r),0.5-oy*k/(2*r))}            // texture: the lens's own square, north up
  if(nan>H.length*0.4)return {error:'There is little or no LiDAR under the lens here, so there is nothing to lift into 3D.'};
  // fill any small gaps from neighbours
  if(nan){for(let pass=0;pass<60&&nan;pass++){nan=0;for(let j=-n;j<=n;j++)for(let i=-n;i<=n;i++){const q=idx[(j+n)*N+(i+n)];if(q<0||H[q]===H[q])continue;
      let sv=0,c=0;for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){const ii=i+di,jj=j+dj;if(Math.abs(ii)>n||Math.abs(jj)>n)continue;const p=idx[(jj+n)*N+(ii+n)];if(p>=0&&H[p]===H[p]){sv+=H[p];c++}}
      if(c)H[q]=sv/c;else nan++}}
    if(nan){const ok=H.filter(h=>h===h),m=ok.reduce((a,b)=>a+b,0)/ok.length;for(let q=0;q<H.length;q++)if(H[q]!==H[q])H[q]=m}}
  let lo=Infinity,hi=-Infinity;for(const h of H){if(h<lo)lo=h;if(h>hi)hi=h}
  const relief=hi-lo,depth=Math.max(3,relief*0.15),yb=-depth;
  const nv=H.length,pos=new Float32Array(nv*3),uv=new Float32Array(UV);
  for(let q=0;q<nv;q++){pos[q*3]=P[q*2];pos[q*3+1]=H[q]-lo;pos[q*3+2]=P[q*2+1]}
  // top triangles (counter-clockwise seen from above: normals point up)
  const tri=[];const edges=new Map();
  const minA=1e-4*mpp*mpp;   // rim triangles folded or squashed by the snapping are left out
  const addT=(a,b,c)=>{const ny=(P[b*2+1]-P[a*2+1])*(P[c*2]-P[a*2])-(P[b*2]-P[a*2])*(P[c*2+1]-P[a*2+1]);if(ny<=minA)return;tri.push(a,b,c);for(const [u,v] of [[a,b],[b,c],[c,a]]){const k=u<v?u+','+v:v+','+u,e=edges.get(k);if(e)e.n++;else edges.set(k,{n:1,u,v})}};
  for(let j=-n;j<n;j++)for(let i=-n;i<n;i++){const a=idx[(j+n)*N+(i+n)],b=idx[(j+n)*N+(i+1+n)],c=idx[(j+1+n)*N+(i+n)],d=idx[(j+1+n)*N+(i+1+n)];
    if(a>=0&&c>=0&&b>=0)addT(a,c,b);if(b>=0&&c>=0&&d>=0)addT(b,c,d)}
  const topCount=tri.length;
  // walls and base, on their own vertices so the top keeps smooth normals
  const wp=[],wi=[];let base=nv;const push=(x,y,z)=>{wp.push(x,y,z);return base++};
  const centre=push(0,yb,0);
  edges.forEach(e=>{if(e.n!==1)return;const a=e.u,b=e.v;
    const ax=pos[a*3],ay=pos[a*3+1],az=pos[a*3+2],bx=pos[b*3],by=pos[b*3+1],bz=pos[b*3+2];
    if(ax===bx&&az===bz)return;
    const A=push(ax,ay,az),B=push(bx,by,bz),A0=push(ax,yb,az),B0=push(bx,yb,bz);
    wi.push(A,A0,B, B,A0,B0);            // wall, facing outward (rim edge a->b runs anticlockwise seen from above)
    const C=push(ax,yb,az),D=push(bx,yb,bz);wi.push(centre,D,C)});   // base, facing down
  const all=new Float32Array(pos.length+wp.length);all.set(pos);all.set(wp,pos.length);
  const uvAll=new Float32Array(all.length/3*2);uvAll.set(uv);
  const index=new Uint32Array(topCount+wi.length);index.set(tri);index.set(wi,topCount);
  return {pos:all,uv:uvAll,index,topCount,lo,hi,relief,depth,diam:2*r*mpp,mpp,nv,grid:{idx,N,n,H}}}

// soft shading (trial): sky-view factor per top vertex at true height (Zakšek, Oštir and Kokalj 2011's sky-view factor,
// 1 - mean sine of the horizon angle), within 10 m in 16 directions (8 on phones), mapped to a gentle darkening
function skyShade(m){const {idx,N,n,H}=m.grid,nd=phone()?8:16,R=Math.max(2,Math.min(phone()?12:20,Math.round(10/m.mpp))),out=new Float32Array(m.nv*3).fill(1);
  const dirs=[];for(let k=0;k<nd;k++){const t=k*2*Math.PI/nd;dirs.push([Math.cos(t),Math.sin(t)])}
  for(let j=-n;j<=n;j++)for(let i=-n;i<=n;i++){const q=idx[(j+n)*N+(i+n)];if(q<0)continue;const h0=H[q];let acc=0,cnt=0;
    for(const [dx,dy] of dirs){let mx=0,hit=false;for(let s=1;s<=R;s++){const ii=Math.round(i+dx*s),jj=Math.round(j+dy*s);if(Math.abs(ii)>n||Math.abs(jj)>n)break;const p=idx[(jj+n)*N+(ii+n)];if(p<0)break;
      const a=(H[p]-h0)/(s*m.mpp);if(a>mx)mx=a;hit=true}if(hit){acc+=Math.sin(Math.atan(mx));cnt++}}
    const svf=cnt?1-acc/cnt:1,ao=Math.min(1,Math.max(0,(svf-0.7)/0.3)),c=0.55+0.45*ao;out[q*3]=out[q*3+1]=out[q*3+2]=c}
  return out}
// orientation check, used once: the edge direction recorded in the map decides whether walls face out
function fixOrientation(m){
  // signed volume of the closed mesh must be positive (outward normals)
  const p=m.pos,ix=m.index;let vol=0;for(let k=0;k<ix.length;k+=3){const a=ix[k]*3,b=ix[k+1]*3,c=ix[k+2]*3;
    vol+=p[a]*(p[b+1]*p[c+2]-p[b+2]*p[c+1])-p[a+1]*(p[b]*p[c+2]-p[b+2]*p[c])+p[a+2]*(p[b]*p[c+1]-p[b+1]*p[c])}
  if(vol<0){for(let k=m.topCount;k<ix.length;k+=3){const t=ix[k+1];ix[k+1]=ix[k+2];ix[k+2]=t}}
  m.volume=Math.abs(vol)/6}

// ---------- drape: what the lens is drawing right now ----------
function captureLens(S){
  const cv=$('gl'),dpr=cv.width/(cv.clientWidth||cv.width);
  const sz=Math.min(2048,Math.round(2*S.rpx*dpr)),out=document.createElement('canvas');out.width=out.height=sz;
  const g=out.getContext('2d');g.fillStyle='#9a9a9a';g.fillRect(0,0,sz,sz);
  try{g.drawImage(cv,(S.c.x-S.rpx)*dpr,(S.c.y-S.rpx)*dpr,2*S.rpx*dpr,2*S.rpx*dpr,0,0,sz,sz)}catch(e){}
  return out}

// ---------- view ----------
// Credit for the LiDAR under the lens. A GB build names a source per country (LC.countryRegions, LC.countryText), so use the
// lens centre's country; otherwise the map's attribution line; otherwise the config's elevation note.
function inPoly(lat,lng,poly){let o=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[0]>lat)!==(b[0]>lat)&&lng<(b[1]-a[1])*(lat-a[0])/(b[0]-a[0])+a[1])o=!o}return o}
const plain=h=>{const d=document.createElement('div');d.innerHTML=h;return d.textContent.replace(/\s+/g,' ').trim()};
function credit(ll){
  if(LC.countryText&&LC.countryRegions){let c=LC.defaultCountry||null;for(const r of LC.countryRegions)if(inPoly(ll.lat,ll.lng,r.poly)){c=r.c;break}
    const t=c&&LC.countryText[c];if(t&&t.lidarAttribution)return plain(t.lidarAttribution).replace(/^LiDAR:?\s*/i,'').split(/;\s*records\b/i)[0].trim()}
  const a=document.querySelector('.leaflet-control-attribution'),t=a?a.textContent:'';
  const m=t.match(/LiDAR:\s*([^;|]+)/);if(m)return m[1].split(/,\s*LiDAR Lens code|\s*\u24d8|\s*Credits/)[0].replace(/[,\s]+$/,'').trim();
  const e=plain(LC.elevationNote||'').replace(/^Elevation:\s*/i,'').replace(/,\s*$/,'').trim();return e||'open LiDAR DTM (Open Government Licence)'}
function gridRef(ll){const o=LZ.osgb;if(!o)return null;try{const en=o.ll2en(ll.lat,ll.lng);return o.gridRef(en[0],en[1],10)||null}catch(e){return null}}   // the lens centre, not the map centre
function modeName(){const s=$('mode');return s&&s.selectedOptions[0]?s.selectedOptions[0].textContent:'LiDAR'}
const fmt=(v,d)=>v>=100?v.toFixed(0):v.toFixed(d==null?1:d);

function sunDir(az,el){const a=az*Math.PI/180,e=el*Math.PI/180;return [Math.sin(a)*Math.cos(e),Math.sin(e),-Math.cos(a)*Math.cos(e)]}
function applyLook(){if(!V)return;const ve=+$('v3dve').value,az=+$('v3daz').value,el=+$('v3del').value,dr=$('v3ddrape').value;
  $('v3dvev').textContent=ve+'×';$('v3dazv').textContent=az+'°';$('v3delv').textContent=el+'°';
  V.group.scale.y=ve;const d=sunDir(az,el),R=model.diam;V.sun.position.set(d[0]*R*1.5,d[1]*R*1.5,d[2]*R*1.5);
  {const c=V.sun.shadow.camera,h=R*0.62;c.left=-h;c.right=h;c.top=h;c.bottom=-h;c.near=R*0.2;c.far=R*3.5;c.updateProjectionMatrix()}
  const ao=$('v3dao').checked&&dr!=='lens';$('v3dao').disabled=dr==='lens';$('v3daol').classList.toggle('off',dr==='lens');
  if(ao&&!V.top.geometry.getAttribute('color')){const t0=performance.now();V.top.geometry.setAttribute('color',new T.BufferAttribute(skyShade(model),3));V.aoMs=performance.now()-t0}
  V.top.material=dr==='lens'?V.mats.flat:dr==='lenslit'?(ao?V.mats.litao:V.mats.lit):(ao?V.mats.clayao:V.mats.clay);
  {const on=$('v3dwat').checked,wl=$('v3dwl');wl.disabled=!on;const lv=model.lo+(+wl.value/1000)*model.relief;V.water.visible=on;V.water.position.y=lv-model.lo;
    V.water.name='water level '+lv.toFixed(2)+' m OD';let wet=0;if(on){const p=model.pos;for(let q=0;q<model.nv;q++)if(p[q*3+1]<lv-model.lo)wet++}
    $('v3dwatv').textContent=on?lv.toFixed(1)+' m OD ('+Math.round(100*wet/model.nv)+'% under)':''}
  const lit=dr!=='lens',hs=LZ.S.mode===0,on=lit||hs;   // single-sun hillshade is the only lens view drawn with the sun
  $('v3daz').disabled=$('v3del').disabled=!on;$('v3dsun').classList.toggle('off',!on);
  $('v3dsunnote').textContent=on?(hs?'Moves the lens sun too':''):'This lens view has no sun';
  $('v3dshadow').disabled=!lit;$('v3dshadowl').classList.toggle('off',!lit);V.sun.castShadow=lit&&$('v3dshadow').checked;
  if(hs&&(Math.round(LZ.S.az)!==az||Math.round(LZ.S.el)!==el))relightLens(az,el);
  V.controls.target.y=model.relief*ve*0.4;V.controls.update();V.dirty=true}
// hillshade drape: set the lens's sun, let the lens redraw, then copy it onto the block again (coalesced while dragging)
let relit=null,relitBusy=false;
function relightLens(az,el){relit=[az,el];if(relitBusy)return;relitBusy=true;
  (async()=>{while(relit&&V&&model){const [a,e]=relit;relit=null;LZ.S.az=a;LZ.S.el=e;if(LZ.syncUI)LZ.syncUI();LZ.requestRender();if(LZ.saveHashSoon)LZ.saveHashSoon();
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));if(!V)break;
    const c=captureLens(model.cap),g=V.texCanvas.getContext('2d');g.drawImage(c,0,0,V.texCanvas.width,V.texCanvas.height);V.tex.needsUpdate=true;V.dirty=true}
    relitBusy=false})()}
function resetCam(){if(!V)return;const D=model.diam,ve=+$('v3dve').value,dist=Math.max(D*1.7,0.6*D/(Math.tan(V.camera.fov*Math.PI/360)*(V.camera.aspect||1)));   // narrow screens: step back until the block fits across
  V.camera.position.set(0,Math.sin(38*Math.PI/180)*dist+model.relief*ve*0.4,Math.cos(38*Math.PI/180)*dist);
  V.controls.target.set(0,model.relief*ve*0.4,0);V.controls.update();V.dirty=true}
function sizeAna(){if(!V||!V.ana)return;const st=$('v3dstage'),w=st.clientWidth,h=st.clientHeight;if(!w||!h)return;V.ana.setSize(w,h);const c=V.renderer.domElement;c.style.width=c.style.height=''}   // setSize also styles the canvas; the stylesheet sizes it
function sizeView(){if(!V)return;const st=$('v3dstage'),w=st.clientWidth,h=st.clientHeight;if(!w||!h)return;
  V.renderer.setSize(w,h,false);sizeAna();V.camera.aspect=w/h;V.camera.updateProjectionMatrix();V.dirty=true}
function loop(){raf=requestAnimationFrame(loop);if(!V)return;const moved=V.controls.update();
  if(moved||V.dirty){V.dirty=false;
    // red-cyan (trial): three's AnaglyphEffect (Dubois colour matrices) with the eye gap at 1/30 of the viewing distance and the
    // eyes converging on the orbit target, so the block sits at the screen and its relief comes forward
    if($('v3dana').checked){if(!V.ana){V.ana=new T.AnaglyphEffect(V.renderer);sizeAna()}const d=V.camera.position.distanceTo(V.controls.target);V.ana.stereo.eyeSep=d/30;V.camera.focus=d;V.ana.render(V.scene,V.camera)}
    else V.renderer.render(V.scene,V.camera);
    $('v3dnorth').style.transform='rotate('+(V.controls.getAzimuthalAngle()*180/Math.PI).toFixed(1)+'deg)'}}

function makeView(m,tex){
  const t=T,old=$('v3dc'),cv=old.cloneNode(false);old.replaceWith(cv);   // fresh canvas: the last one's context was released on close
  const renderer=new t.WebGLRenderer({canvas:cv,antialias:true,alpha:false,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));renderer.setClearColor(0xeef1f4,1);
  const scene=new t.Scene(),camera=new t.PerspectiveCamera(35,1,m.diam/500,m.diam*20);
  const geo=new t.BufferGeometry();geo.setAttribute('position',new t.BufferAttribute(m.pos,3));geo.setAttribute('uv',new t.BufferAttribute(m.uv,2));
  geo.setIndex(new t.BufferAttribute(m.index,1));geo.computeVertexNormals();
  const topGeo=geo.clone();topGeo.setIndex(new t.BufferAttribute(m.index.slice(0,m.topCount),1));
  const sideGeo=geo.clone();sideGeo.setIndex(new t.BufferAttribute(m.index.slice(m.topCount),1));sideGeo.deleteAttribute('uv');
  topGeo.computeVertexNormals();sideGeo.computeVertexNormals();geo.dispose();
  const map=new t.CanvasTexture(tex);map.colorSpace=t.SRGBColorSpace;map.anisotropy=renderer.capabilities.getMaxAnisotropy();
  const mats={flat:new t.MeshBasicMaterial({map}),lit:new t.MeshLambertMaterial({map}),clay:new t.MeshLambertMaterial({color:0xd8d2c4}),side:new t.MeshLambertMaterial({color:0x8d7b66})};
  mats.litao=new t.MeshLambertMaterial({map,vertexColors:true});mats.clayao=new t.MeshLambertMaterial({color:0xd8d2c4,vertexColors:true});
  mats.flat.name='lens view';mats.lit.name='lens view, lit';mats.clay.name='clay';mats.side.name='block sides';mats.litao.name='lens view, lit, soft shading';mats.clayao.name='clay, soft shading';
  const wp=[0,0,0],wi=[],seg=128,wr=m.diam/2*0.998;for(let k=0;k<seg;k++){const a=k*2*Math.PI/seg;wp.push(Math.cos(a)*wr,0,Math.sin(a)*wr);wi.push(0,((k+1)%seg)+1,k+1)}   // disc, normal up
  const wgeo=new t.BufferGeometry();wgeo.setAttribute('position',new t.BufferAttribute(new Float32Array(wp),3));wgeo.setIndex(wi);wgeo.computeVertexNormals();
  mats.water=new t.MeshLambertMaterial({color:0x2f6fb5,transparent:true,opacity:0.55,depthWrite:false});mats.water.name='water';
  const water=new t.Mesh(wgeo,mats.water);water.visible=false;water.renderOrder=2;
  const top=new t.Mesh(topGeo,mats.flat),side=new t.Mesh(sideGeo,mats.side);top.name='ground (DTM)';side.name='block sides and base';
  const group=new t.Group();group.add(top);group.add(side);group.add(water);scene.add(group);
  scene.add(new t.HemisphereLight(0xffffff,0x6a6a6a,0.45));const sun=new t.DirectionalLight(0xffffff,2.9);scene.add(sun);scene.add(sun.target);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=t.PCFSoftShadowMap;
  sun.shadow.mapSize.set(phone()?1024:4096,phone()?1024:4096);sun.shadow.bias=-0.0004;sun.shadow.normalBias=m.mpp*0.8;
  top.castShadow=top.receiveShadow=true;side.castShadow=true;side.receiveShadow=true;
  const controls=new t.OrbitControls(camera,cv);controls.enableDamping=true;controls.dampingFactor=0.12;controls.screenSpacePanning=true;
  controls.minDistance=m.diam*0.15;controls.maxDistance=m.diam*5;controls.maxPolarAngle=Math.PI*0.62;
  controls.addEventListener('change',()=>{V&&(V.dirty=true)});
  V={renderer,scene,camera,controls,group,top,side,water,mats,sun,tex:map,texCanvas:tex,dirty:true}}

function disposeView(){if(!V)return;cancelAnimationFrame(raf);raf=0;V.controls.dispose();if(V.ana)V.ana.dispose();
  V.top.geometry.dispose();V.side.geometry.dispose();V.water.geometry.dispose();Object.values(V.mats).forEach(m=>m.dispose());V.tex.dispose();
  V.renderer.dispose();if(V.renderer.forceContextLoss)V.renderer.forceContextLoss();V=null}

function status(t,err){const w=$('v3dwait');w.textContent=t||'';w.hidden=!t;w.classList.toggle('err',!!err)}

async function show(){
  if(busy)return;if(LZ.renderer()==='none'){LZ.msg('This device cannot draw the LiDAR, so the 3D view is not available.',4000);return}
  {let ok=false;try{ok=!!document.createElement('canvas').getContext('webgl2')}catch(e){}
    if(!ok){LZ.msg('The 3D view needs WebGL 2, which this browser or device does not offer. The lens itself still works.',5000);return}}
  busy=true;open=true;box.hidden=false;document.body.classList.add('v3dopen');btn.setAttribute('aria-pressed','true');
  disposeView();status('Building the 3D block…');$('v3dinfo').textContent='';$('v3dnote').textContent='';
  try{
    LZ.requestRender();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const [t,S]=await Promise.all([loadThree(),sampleLens()]);T=t;if(!open)return;
    const tex=captureLens(S);const m=buildModel(S);if(m.error){status(m.error,true);return}
    fixOrientation(m);model=m;model.cap={c:S.c,rpx:S.rpx};
    model.meta={mode:modeName(),credit:credit(S.cll),grid:gridRef(S.cll),lat:+S.cll.lat.toFixed(6),lng:+S.cll.lng.toFixed(6),spacing:m.mpp,zt:S.zt,made:new Date().toISOString().slice(0,10)};
    makeView(m,tex);
    {const steep=Math.max(1,Math.floor(0.12*m.diam/Math.max(m.relief,0.01)*2)/2);$('v3dve').value=String(Math.max(1,Math.min(10,LZ.S.ve||2,steep)))}   // steep ground starts gentler: relief at most ~12% of the width
    $('v3dshadow').checked=!phone();   // shadows cost speed: on for desktops, off for phones (tick to turn on)
    $('v3daz').value=String(Math.round(LZ.S.az)%360);$('v3del').value=String(Math.max(5,Math.min(85,Math.round(LZ.S.el))));   // start from the lens's own sun
    const where=model.meta.grid||(model.meta.lat+', '+model.meta.lng);
    $('v3dinfo').textContent=model.meta.mode+' · '+fmt(m.diam,0)+' m across · relief '+fmt(m.relief,2)+' m · centre '+where;
    $('v3dnote').textContent='Bare-earth model (DTM): trees, buildings and standing stones are removed, so megaliths do not appear. Heights every '+fmt(m.mpp,2)+' m, exaggerated by the factor shown; the sides are '+fmt(m.depth,1)+' m deep at 1×. LiDAR: '+model.meta.credit+'.';
    status('');sizeView();resetCam();applyLook();if(!raf)loop();
  }catch(e){console.warn('3D view',e);status('The 3D view could not be built: '+(e&&e.message||e),true)}
  finally{busy=false}}
function hide(){open=false;box.hidden=true;document.body.classList.remove('v3dopen');btn.setAttribute('aria-pressed','false');disposeView();status('');btn.focus()}

// ---------- saving ----------
function fileBase(){const m=model.meta,w=(m.grid||(m.lat+'_'+m.lng)).replace(/[^A-Za-z0-9_.-]+/g,'');return 'lidar-lens-3d-'+w+'-'+fmt(model.diam,0)+'m-ve'+$('v3dve').value}
function save(blob,name){const a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000)}
function saveGLB(){if(!V)return;const ve=+$('v3dve').value;
  V.group.userData={title:'LiDAR Lens 3D block',source:model.meta.credit,visualisation:V.top.material.name+' ('+model.meta.mode+')',centre:model.meta.grid||'',lat:model.meta.lat,lng:model.meta.lng,
    units:'metres; x east, y up, z south; heights relative to the lowest point ('+model.lo.toFixed(2)+' m OD)',verticalExaggeration:ve,spacing_m:+model.mpp.toFixed(3),made:model.meta.made,
    note:'Bare-earth DTM. Contains public sector information licensed under the Open Government Licence v3.0.'};
  new T.GLTFExporter().parse(V.group,res=>save(new Blob([res],{type:'model/gltf-binary'}),fileBase()+'.glb'),e=>LZ.msg('Could not save the model: '+e,4000),{binary:true})}
function saveSTL(){if(!model)return;const ve=+$('v3dve').value,p=model.pos,ix=model.index,nt=ix.length/3,buf=new ArrayBuffer(84+50*nt),dv=new DataView(buf);
  const head=('LiDAR Lens 3D block, metres, VE '+ve+'x. '+model.meta.credit.replace(/\u00a9/g,'(c)')+' (OGL v3.0)').replace(/[^\x20-\x7e]/g,'').slice(0,80);for(let k=0;k<80;k++)dv.setUint8(k,k<head.length?head.charCodeAt(k):32);
  dv.setUint32(80,nt,true);let o=84;
  // STL is z-up: x east, y north, z up
  const V3=q=>[p[q*3],-p[q*3+2],p[q*3+1]*ve];
  for(let k=0;k<ix.length;k+=3){const a=V3(ix[k]),b=V3(ix[k+1]),c=V3(ix[k+2]);
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const l=Math.hypot(nx,ny,nz)||1;
    for(const v of [nx/l,ny/l,nz/l,...a,...b,...c]){dv.setFloat32(o,v,true);o+=4}dv.setUint16(o,0,true);o+=2}
  save(new Blob([buf],{type:'model/stl'}),fileBase()+'.stl')}

// ---------- wiring ----------
btn.addEventListener('click',()=>open?hide():show());
$('v3dx').addEventListener('click',hide);
['v3dve','v3daz','v3del','v3ddrape','v3dshadow','v3dwl'].forEach(id=>$(id).addEventListener('input',applyLook));['v3dao','v3dwat'].forEach(id=>$(id).addEventListener('change',applyLook));$('v3dshadow').addEventListener('change',applyLook);
$('v3ddrape').addEventListener('change',applyLook);$('v3dana').addEventListener('change',()=>{if(V)V.dirty=true});
$('v3dreset').addEventListener('click',resetCam);
$('v3dglb').addEventListener('click',saveGLB);$('v3dstl').addEventListener('click',saveSTL);
window.addEventListener('resize',()=>{if(open)sizeView()});
// while open, keys belong to the 3D view: Esc closes it, and the map's shortcuts stay quiet
document.addEventListener('keydown',e=>{if(!open)return;if(e.key==='Escape'){hide();e.preventDefault()}e.stopImmediatePropagation()},true);
document.addEventListener('keydown',e=>{if(open||e.ctrlKey||e.metaKey||e.altKey||(e.key!=='d'&&e.key!=='D'))return;const t=e.target;
  if(t&&(t.tagName==='INPUT'&&t.type!=='checkbox'&&t.type!=='range'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.isContentEditable))return;if(!btn.disabled){e.preventDefault();show()}});
if(LZ.renderer()==='none'){btn.disabled=true;btn.title='This device cannot draw the LiDAR, so the 3D view is not available'}
window.__view3d={show,hide,model:()=>model,isOpen:()=>open,_build:buildModel,_fix:fixOrientation,_v:()=>V};
})();
