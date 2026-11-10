/* LiDAR Lens: View from here. Pick a spot; the ground that can be seen from eye height (1.5 m) is marked on the map
   and the skyline is drawn all the way round. Heights come from the same Terrarium tiles as the lens: fine tiles
   near the viewpoint, coarser ones further out, to 10 km. The sweep allows for the curve of the Earth and standard
   refraction. The LiDAR model is bare ground: trees, hedges and buildings are not in it.
   Separate script (like view3d.js), so the main bundle is unchanged. The swept skyline is kept on
   window.__viewshed for the sky dome in the 3D view. */
(function(){
'use strict';
const LZ=window.__lens;if(!LZ||!window.L)return;
// credit in About / data (this script and the sky dome are the only users of these sources)
if(document.getElementById('about')&&!document.getElementById('skycred'))document.getElementById('about').insertAdjacentHTML('beforeend','<br><br><span id="skycred">View from here and the 3D sky: stars from the Yale Bright Star Catalogue, 5th revised edition (Hoffleit, D. &amp; Warren, W.H. Jr. 1991; CDS VizieR V/50), the 1,630 stars to magnitude 5, the same list as the Stonehenge 3D viewers. Sun and Moon from astronomy-engine 2.1.19 (MIT, Don Cross), with the obliquity of Laskar (1986) and sidereal time after Meeus.</span>');
const map=LZ.map,CFG=LZ.CFG,LC=LZ.LC,$=id=>document.getElementById(id);
const EYE=1.5,RE=6371000,KR=0.13,NRAY=1440,STEP=360/NRAY,D2R=Math.PI/180,RANGE=10000;
// rings round the viewpoint: [tile zoom, from m, to m, step along the ray m]. The live worker makes zoom 17 tiles from
// 1 m LiDAR, 15 from 4 m, 14 from 8 m and 13 from 16 m, so the step matches the data.
const RINGS=[[17,0,200,1],[15,200,1000,4],[14,1000,3000,8],[13,3000,RANGE,16]];

// ---------- markup ----------
const CSS="#vfh{position:absolute;z-index:1000;left:10px;bottom:84px;width:min(560px,calc(100% - 20px));background:rgba(255,255,255,.97);border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.4);font-size:13px;padding:8px 10px 8px;box-sizing:border-box}"+
"#vfh[hidden]{display:none}#vfh .x{position:absolute;right:6px;top:2px;border:0;background:none;font-size:22px;cursor:pointer;line-height:1}#vfh h3{margin:0 26px 3px 0;font-size:14px}#vfh p{margin:2px 0;line-height:1.35}"+
"#vfhsum{color:#222}#vfhwarn{color:#7c2d12}#vfhwarn:empty{display:none}#vfhc{display:block;width:100%;height:92px;margin:4px 0 2px;border:1px solid #d1d5db;border-radius:4px;background:#f8fafc;touch-action:none;cursor:crosshair}"+
"#vfhread{min-height:1.35em;color:#111;font-variant-numeric:tabular-nums}#vfh .row{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:4px}#vfh .row button{font-size:13px;padding:4px 8px;cursor:pointer;border:1px solid #bbb;border-radius:4px;background:#f3f4f6}"+
"#vfh .row label{display:flex;gap:4px;align-items:center}#vfhnote{color:#555;font-size:12px}.vfh-img{image-rendering:pixelated}"+
"@media (max-width:700px){#vfh{bottom:64px;font-size:12px}#vfhc{height:70px}}";
const BOX="<div id=\"vfh\" role=\"region\" aria-labelledby=\"vfhh\" hidden><button class=\"x\" id=\"vfhx\" aria-label=\"Close and clear the view\" title=\"Close and clear\">&times;</button>"+
"<h3 id=\"vfhh\">View from here</h3><p id=\"vfhsum\"></p><p id=\"vfhwarn\"></p>"+
"<canvas id=\"vfhc\" role=\"img\" aria-label=\"Height of the skyline, in degrees, round the compass from north through east, south and west\"></canvas>"+
"<p id=\"vfhread\" aria-live=\"polite\"></p>"+
"<div class=\"row\"><label><input type=\"checkbox\" id=\"vfhshade\"> Shade hidden ground instead</label><button id=\"vfhpick\">Pick another spot</button><span id=\"vfhextra\"></span></div>"+
"<p id=\"vfhnote\">Bare ground from LiDAR: trees, hedges and buildings are not included. Eye height 1.5 m. Ground checked to 10 km.</p></div>";
if(!$('vfhcss')){const st=document.createElement('style');st.id='vfhcss';st.textContent=CSS;document.head.appendChild(st)}
if(!$('vfh')){const t=document.createElement('template');t.innerHTML=BOX;document.body.appendChild(t.content.firstElementChild)}
if(!$('viewfrom')){const pr=$('profile');if(pr){const b=document.createElement('button');b.id='viewfrom';b.setAttribute('aria-pressed','false');
  b.title='Click a spot to see the ground and skyline visible from there, at eye height (E)';b.textContent='View from here (off)';pr.insertAdjacentElement('afterend',b)}}
{const kt=document.querySelector('#help table.keys');if(kt&&!/View from here/.test(kt.textContent)){const tr=document.createElement('tr');tr.innerHTML='<td>E</td><td>View from here on/off</td>';kt.appendChild(tr)}}
const btn=$('viewfrom'),box=$('vfh');if(!btn||!box)return;

// ---------- a pane above the lens for the overlay and skyline (the lens canvas sits over the map's own panes) ----------
const PANE='vfhPane';let pane=null,svg=null;
function ensurePane(){if(pane)return;pane=map.createPane(PANE);const mapPane=map.getPane('mapPane');document.body.appendChild(pane);
  Object.assign(pane.style,{zIndex:'470',pointerEvents:'none',position:'fixed',margin:'0',width:'0',height:'0',overflow:'visible'});
  const sync=()=>{const r=map.getContainer().getBoundingClientRect();pane.style.left=r.left+'px';pane.style.top=r.top+'px';pane.style.transform=mapPane.style.transform||'none';pane.style.transformOrigin=mapPane.style.transformOrigin||'0 0'};
  sync();map.on('move zoom resize moveend zoomend zoomanim',sync);map.on('move zoom',()=>requestAnimationFrame(sync));
  svg=L.svg({pane:PANE,padding:0.5})}

// ---------- height tiles ----------
const mppAt=(lat,z)=>156543.03392*Math.cos(lat*D2R)/Math.pow(2,z);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let dcan=null,dctx=null;
async function decode(blob){if(!dcan){dcan=document.createElement('canvas');dcan.width=dcan.height=256;dctx=dcan.getContext('2d',{willReadFrequently:true})}
  let im=null,url=null;
  if(window.createImageBitmap){try{im=await createImageBitmap(blob)}catch(e){im=null}}
  if(!im){url=URL.createObjectURL(blob);im=await new Promise(res=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>res(null);i.src=url})}
  if(!im){if(url)URL.revokeObjectURL(url);return null}
  dctx.clearRect(0,0,256,256);dctx.drawImage(im,0,0);if(url)URL.revokeObjectURL(url);if(im.close)im.close();
  return dctx.getImageData(0,0,256,256).data}
// One tile as RGBA, or null where there is none. The live worker answers 503 while its downloads are queued behind the lens.
async function getTile(z,x,y,q,run){const u=CFG.tiles.replace('{z}',z).replace('{x}',x).replace('{y}',y)+(q||'');
  for(let t=0;t<6;t++){if(run.dead)return null;let r=null;try{r=await fetch(u,CFG.xo?{mode:'cors'}:undefined)}catch(e){r=null}
    if(r&&r.ok){try{return await decode(await r.blob())}catch(e){return null}}
    if(r&&r.status!==503&&r.status!==429)return null;await sleep(1500)}
  return null}
// On new ground the live worker first answers zoom 16-17 with a 4 m tile and makes the 1 m tile behind it; asking again gets the fine one.
async function tileFor(z,x,y,run){if(LC.live&&z>=16){await getTile(z,x,y,'',run);return getTile(z,x,y,'?fine=1',run)}return getTile(z,x,y,'',run)}
async function loadRings(ll,run,onProgress){
  const defs=RINGS.map(([z,from,to,step])=>{z=Math.min(z,CFG.maxz);const mpp=mppAt(ll.lat,z),p=map.project(ll,z),pad=to/mpp+3;
    const x0=Math.floor((p.x-pad)/256),x1=Math.floor((p.x+pad)/256),y0=Math.floor((p.y-pad)/256),y1=Math.floor((p.y+pad)/256);
    const W=(x1-x0+1)*256,Hh=(y1-y0+1)*256,H=new Float32Array(W*Hh).fill(NaN);
    return {z,from,to,step,mpp,vx:p.x,vy:p.y,ox:x0*256,oy:y0*256,W,Hh,H,x0,x1,y0,y1,got:0}});
  const jobs=[];defs.forEach(r=>{for(let ty=r.y0;ty<=r.y1;ty++)for(let tx=r.x0;tx<=r.x1;tx++)jobs.push([r,tx,ty])});
  // nearest first, so the worker starts on the ground round the viewpoint
  let done=0,next=0;const total=jobs.length;
  const worker=async()=>{while(next<jobs.length&&!run.dead){const [r,tx,ty]=jobs[next++],d=await tileFor(r.z,tx,ty,run);
    if(d){r.got++;const bx=(tx-r.x0)*256,by=(ty-r.y0)*256,H=r.H,W=r.W;
      for(let j=0;j<256;j++){let o=j*1024,k=(by+j)*W+bx;for(let i=0;i<256;i++,o+=4,k++)if(d[o+3]>=128)H[k]=d[o]*256+d[o+1]+d[o+2]/256-32768}}
    done++;if(onProgress)onProgress(done,total)}};
  await Promise.all(Array.from({length:8},worker));
  return defs}

// ---------- the sweep ----------
// height at a web-mercator pixel position in a ring's grid: bilinear on pixel centres, nearest where a neighbour is missing
function hAt(r,fx,fy){const gx=fx-r.ox-0.5,gy=fy-r.oy-0.5,ix=Math.floor(gx),iy=Math.floor(gy);
  if(ix<0||iy<0||ix>=r.W-1||iy>=r.Hh-1)return NaN;
  const H=r.H,k=iy*r.W+ix,a=H[k],b=H[k+1],c=H[k+r.W],d=H[k+r.W+1],ax=gx-ix,ay=gy-iy;
  const v=(a*(1-ax)+b*ax)*(1-ay)+(c*(1-ax)+d*ax)*ay;if(v===v)return v;
  return H[(ay<0.5?iy:iy+1)*r.W+(ax<0.5?ix:ix+1)]}
// rings: [{H,W,Hh,ox,oy,vx,vy,mpp,from,to,step}] (grids and viewpoint in web-mercator pixels at each ring's zoom).
// Angle to a point d metres away at height h: atan((h - eye level - d²(1-k)/2R)/d). A point is seen if no nearer point
// on its bearing stands higher in angle. Returns the skyline per bearing and the running maximum along every ray.
function sweep(rings,opt){opt=opt||{};const eye=opt.eye==null?EYE:opt.eye,k=opt.k==null?KR:opt.k,cf=(1-k)/(2*RE),range=rings[rings.length-1].to;
  let z0=opt.z0==null?NaN:opt.z0;if(z0!==z0)for(const r of rings){z0=hAt(r,r.vx,r.vy);if(z0===z0)break}
  if(z0!==z0)return null;
  const ze=z0+eye,sd=[],sr=[],base=[],first=[];
  rings.forEach((r,i)=>{const d0=Math.max(r.from,2*r.step);base.push(sd.length);first.push(d0);for(let d=d0;d<r.to;d+=r.step){sd.push(d);sr.push(i)}});
  const K=sd.length,cum=new Float32Array(NRAY*K),alt=new Float32Array(NRAY),dist=new Float32Array(NRAY),hgt=new Float32Array(NRAY),end=new Float32Array(NRAY),flag=new Uint8Array(NRAY);
  const dip=-Math.sqrt(2*Math.max(ze,0)*(1-k)/RE)/D2R;      // sea-level horizon, used where a bearing has no ground data at all
  for(let a=0;a<NRAY;a++){const az=a*STEP*D2R,sn=Math.sin(az),cs=Math.cos(az);let run=-Infinity,bd=0,bh=NaN,far=0;const o=a*K;
    for(let q=0;q<K;q++){const r=rings[sr[q]],d=sd[q],h=hAt(r,r.vx+d*sn/r.mpp,r.vy-d*cs/r.mpp);
      if(h===h){const t=(h-ze-d*d*cf)/d;if(t>run){run=t;bd=d;bh=h}far=d}
      cum[o+q]=run}
    if(run===-Infinity){alt[a]=dip;dist[a]=0;hgt[a]=NaN;flag[a]=2}
    else{alt[a]=Math.atan(run)/D2R;dist[a]=bd;hgt[a]=bh;flag[a]=bd>0.9*range?1:far<0.9*range?3:0}
    end[a]=far}
  return {z0,eye,ze,k,cf,range,K,sd,base,first,cum,alt,dist,hgt,end,flag,step:STEP,n:NRAY,rings}}
// Seen/hidden for every cell of one ring: 0 no data or outside the ring, 1 seen, 2 hidden.
function raster(S,ri){const r=S.rings[ri],cx=r.vx-r.ox,cy=r.vy-r.oy,rad=r.to/r.mpp,K=S.K,cum=S.cum;
  const x0=Math.max(0,Math.floor(cx-rad)),x1=Math.min(r.W-1,Math.ceil(cx+rad)),y0=Math.max(0,Math.floor(cy-rad)),y1=Math.min(r.Hh-1,Math.ceil(cy+rad));
  const w=x1-x0+1,h=y1-y0+1,m=new Uint8Array(w*h),b=S.base[ri],d0=S.first[ri];let seen=0,all=0;
  for(let j=0;j<h;j++){const dy=(cy-(y0+j+0.5))*r.mpp;for(let i=0;i<w;i++){const dx=(x0+i+0.5-cx)*r.mpp,d=Math.hypot(dx,dy);if(d<r.from||d>=r.to)continue;
    const z=r.H[(y0+j)*r.W+x0+i];if(z!==z)continue;all++;
    let q=(d<d0?b-1:b+Math.floor((d-d0)/r.step))-1,vis=true;
    if(q>=0){const t=(z-S.ze-d*d*S.cf)/d;let fa=Math.atan2(dx,dy)/D2R/STEP;if(fa<0)fa+=NRAY;const a0=Math.floor(fa)%NRAY,a1=(a0+1)%NRAY,f=fa-Math.floor(fa);
      const c0=cum[a0*K+q],c1=cum[a1*K+q],ref=c0===-Infinity?c1:c1===-Infinity?c0:c0*(1-f)+c1*f;
      vis=t>=ref-0.05/d}
    if(vis)seen++;m[j*w+i]=vis?1:2}}
  return {m,w,h,x0:r.ox+x0,y0:r.oy+y0,z:r.z,seen,all,cell:r.mpp*r.mpp}}

// ---------- drawing ----------
let cur=null,runSeq=0,busy=null;
const fmtD=d=>d>=1000?(d/1000).toFixed(d>=9950?0:2)+' km':Math.round(d)+' m';
const fmtA=a=>(a>=0?'+':'−')+Math.abs(a).toFixed(2)+'°';
const PTS=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
const bearing=b=>String(Math.round(b*10)/10).replace(/^(\d+)$/,'$1.0').padStart(5,'0')+'° ('+PTS[Math.round(b/22.5)%16]+')';
function paint(R,shade){const c=document.createElement('canvas');c.width=R.w;c.height=R.h;const g=c.getContext('2d'),im=g.createImageData(R.w,R.h),p=im.data,m=R.m;
  for(let i=0,o=0;i<m.length;i++,o+=4){const v=m[i];if(!shade&&v===1){p[o]=255;p[o+1]=221;p[o+2]=51;p[o+3]=120}else if(shade&&v===2){p[o]=8;p[o+1]=12;p[o+2]=30;p[o+3]=150}}
  g.putImageData(im,0,0);return c.toDataURL()}
function destOf(S,a,d){const r=S.rings[0];return map.unproject(L.point(r.vx+d*Math.sin(a*STEP*D2R)/r.mpp,r.vy-d*Math.cos(a*STEP*D2R)/r.mpp),r.z)}
function drawOverlays(){if(!cur)return;cur.imgs.forEach(l=>map.removeLayer(l));cur.imgs=[];const shade=$('vfhshade').checked;
  cur.rast.forEach(R=>{const b=L.latLngBounds(map.unproject(L.point(R.x0,R.y0+R.h),R.z),map.unproject(L.point(R.x0+R.w,R.y0),R.z));
    cur.imgs.push(L.imageOverlay(paint(R,shade),b,{pane:PANE,interactive:false,className:'vfh-img'}).addTo(map))})}
function drawSkyline(){const S=cur.S,parts=[];let part=[];
  for(let a=0;a<=NRAY;a++){const i=a%NRAY,d=S.dist[i],p=a?S.dist[(a-1)%NRAY]:d;
    if(!(d>0)||(a&&Math.abs(d-p)>Math.max(60,0.15*Math.max(d,p)))){if(part.length>1)parts.push(part);part=[]}
    if(d>0)part.push(destOf(S,i,d))}
  if(part.length>1)parts.push(part);
  cur.lines=[L.polyline(parts,{renderer:svg,pane:PANE,color:'#fff',weight:5,opacity:.85,interactive:false,lineCap:'round'}),
    L.polyline(parts,{renderer:svg,pane:PANE,color:'#be123c',weight:2.5,interactive:false,lineCap:'round'}),
    L.circle(cur.ll,{renderer:svg,pane:PANE,radius:S.range,color:'#111',weight:1,dashArray:'4 5',fill:false,interactive:false}),
    L.circleMarker(cur.ll,{renderer:svg,pane:PANE,radius:6,color:'#fff',weight:2,fillColor:'#be123c',fillOpacity:1,interactive:false})];
  cur.ray=L.polyline([cur.ll,cur.ll],{renderer:svg,pane:PANE,color:'#111',weight:1.5,opacity:0,interactive:false});
  cur.lines.push(cur.ray);cur.lines.forEach(l=>l.addTo(map))}
// skyline height against bearing
function drawChart(hi){const c=$('vfhc'),S=cur&&cur.S;if(!S)return;const dpr=Math.min(2,window.devicePixelRatio||1),w=c.clientWidth,h=c.clientHeight;if(!w||!h)return;
  if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr)}
  const g=c.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
  let lo=0,hi2=0;for(let a=0;a<NRAY;a++){if(S.flag[a]===2)continue;lo=Math.min(lo,S.alt[a]);hi2=Math.max(hi2,S.alt[a])}
  const span=Math.max(1,hi2-lo),top=hi2+span*0.12,bot=lo-span*0.1,L0=30,B=14,X=a=>L0+(w-L0-4)*a/NRAY,Y=v=>(h-B)*(top-v)/(top-bot);cur.chart={L0,w,X};
  g.font='10px system-ui,sans-serif';g.textBaseline='middle';
  g.strokeStyle='#e2e8f0';g.fillStyle='#64748b';g.lineWidth=1;g.textAlign='center';
  ['N','E','S','W','N'].forEach((t,i)=>{const x=X(i*NRAY/4);g.beginPath();g.moveTo(x,0);g.lineTo(x,h-B);g.stroke();g.fillText(t,Math.max(L0+4,Math.min(w-6,x)),h-6)});
  g.textAlign='right';const tick=span>8?5:span>3?2:span>1.5?1:0.5;for(let v=Math.ceil(bot/tick)*tick;v<=top;v+=tick){const y=Y(v);g.strokeStyle=Math.abs(v)<1e-9?'#94a3b8':'#e2e8f0';g.beginPath();g.moveTo(L0,y);g.lineTo(w-4,y);g.stroke();g.fillText((Math.round(v*10)/10)+'°',L0-3,y)}
  g.beginPath();g.moveTo(X(0),h-B);for(let a=0;a<=NRAY;a++)g.lineTo(X(a),Y(S.alt[a%NRAY]));g.lineTo(X(NRAY),h-B);g.closePath();g.fillStyle='rgba(120,113,108,.35)';g.fill();
  // bearings where the skyline is within the last tenth of the range (or the data stops short) are drawn paler
  for(let pass=0;pass<2;pass++){g.beginPath();let pen=false;for(let a=0;a<=NRAY;a++){const f=S.flag[a%NRAY],use=pass?f===0:f!==0;if(use){const x=X(a),y=Y(S.alt[a%NRAY]);pen?g.lineTo(x,y):g.moveTo(x,y);pen=true}else pen=false}
    g.strokeStyle=pass?'#be123c':'#f59e0b';g.lineWidth=1.6;g.stroke()}
  if(hi!=null){const x=X(hi);g.strokeStyle='#111';g.lineWidth=1;g.beginPath();g.moveTo(x,0);g.lineTo(x,h-B);g.stroke()}}
// readout for one bearing (ray index a), and optionally the map point under the pointer
function readout(a,pt){const S=cur.S,f=S.flag[a],b=a*STEP;let t='Bearing '+bearing(b)+': ';
  if(f===2)t+='no ground data on this bearing';
  else{t+='skyline '+fmtD(S.dist[a])+' away at '+fmtA(S.alt[a])+', ground '+Math.round(S.hgt[a])+' m';
    const need=S.ze+S.range*Math.tan(S.alt[a]*D2R)+S.range*S.range*S.cf;t+='. Ground beyond '+fmtD(S.range)+' would show only above '+Math.round(need)+' m'}
  $('vfhread').textContent=t+'.';
  if(cur.ray){cur.ray.setLatLngs([cur.ll,destOf(S,a,f===2?S.range:S.dist[a])]);cur.ray.setStyle({opacity:.9})}
  drawChart(a)}
function summary(){const S=cur.S;let seen=0,all=0,open=0,none=0,dmin=Infinity,dmax=0;cur.rast.forEach(R=>{seen+=R.seen*R.cell;all+=R.all*R.cell});
  for(let a=0;a<NRAY;a++){const f=S.flag[a];if(f===2){none++;continue}if(f)open++;dmin=Math.min(dmin,S.dist[a]);dmax=Math.max(dmax,S.dist[a])}
  const gr=cur.gr?cur.gr+', ':'';cur.seenKm2=seen/1e6;cur.groundKm2=all/1e6;
  $('vfhsum').textContent=gr+'ground '+S.z0.toFixed(1)+' m, eye '+(S.z0+S.eye).toFixed(1)+' m. Ground in view: '+(seen/1e6).toFixed(2)+' km² ('+(all?Math.round(100*seen/all):0)+'% of the '+(all/1e6).toFixed(0)+' km² with LiDAR within '+fmtD(S.range)+'). Skyline '+(dmax?fmtD(dmin)+' to '+fmtD(dmax)+' away.':'not found.');
  const deg=n=>Math.round(n*STEP)+'°';
  $('vfhwarn').textContent=(open?'On '+deg(open)+' of the compass (amber on the chart) the skyline is in the last tenth of the range or the LiDAR stops short: higher ground further off may form the true skyline. ':'')+(none?'No ground data on '+deg(none)+'.':'')}
function clear(keepTool){runSeq++;if(busy)busy.dead=true;busy=null;if(cur){cur.imgs.forEach(l=>map.removeLayer(l));(cur.lines||[]).forEach(l=>map.removeLayer(l))}cur=null;box.hidden=true;
  $('vfhread').textContent='';LZ.saveHashSoon&&LZ.saveHashSoon();document.dispatchEvent(new CustomEvent('viewshed',{detail:null}));if(!keepTool&&LZ.tool()==='viewfrom')LZ.setTool(null)}

async function run(ll){ll=L.latLng(ll);ensurePane();clear(true);const seq=runSeq,job=busy={dead:false};
  LZ.msg('View from here: fetching the ground out to 10 km…');
  let rings;try{rings=await loadRings(ll,job,(d,t)=>{if(seq===runSeq)LZ.msg('View from here: fetching the ground out to 10 km… '+Math.round(100*d/t)+'%')})}
  catch(e){if(seq===runSeq){busy=null;LZ.msg('View from here: could not fetch the ground ('+(e&&e.message||e)+')',5000)}return null}
  if(seq!==runSeq)return null;busy=null;
  const S=sweep(rings);
  if(!S){LZ.msg('View from here: there is no LiDAR height at that spot',4500);return null}
  const rast=rings.map((r,i)=>raster(S,i));let gr='';try{const en=LZ.osgb.ll2en(ll.lat,ll.lng);gr=LZ.osgb.gridRef(en[0],en[1],8)}catch(e){}
  cur={ll,S,rast,imgs:[],lines:[],gr};LZ.msg('',0);
  box.hidden=false;box.style.bottom=$('prof')&&$('prof').style.display==='block'?'264px':'';
  drawOverlays();drawSkyline();summary();drawChart(null);$('vfhread').textContent='Move over the map or the chart to read the skyline on any bearing.';
  setBtn(LZ.tool()==='viewfrom');LZ.saveHashSoon&&LZ.saveHashSoon();document.dispatchEvent(new CustomEvent('viewshed',{detail:api.state()}));return api.state()}

// ---------- tool wiring ----------
function setBtn(on){btn.classList.toggle('on',on);btn.setAttribute('aria-pressed',on);btn.textContent=on?'View from here ON: click a spot':cur||busy?'View from here (shown)':'View from here (off)'}
LZ.toolHooks.viewfrom={on(){setBtn(true);LZ.msg('View from here ON: click the spot to stand on (inside or outside the lens). Esc or the button turns it off.',4000)},off(){setBtn(false)}};
btn.onclick=()=>LZ.setTool('viewfrom');
map.on('click',e=>{if(LZ.tool()!=='viewfrom')return;if(window.__lensEatClick&&Date.now()<window.__lensEatClick)return;LZ.setTool(null);run(e.latlng).then(()=>setBtn(false));setBtn(false)});
// with the 3D view present: move the map so the viewpoint is under the lens, then open the block with its sky dome
if(window.__view3d){const b=document.createElement('button');b.id='vfh3d';b.textContent='3D view with sky';b.title='Open the 3D view of the lens, centred on this viewpoint, with the skyline, Sun, Moon and stars';$('vfhextra').appendChild(b);
  b.onclick=async()=>{if(!cur)return;const st=LZ.lensState(),pt=map.latLngToContainerPoint(cur.ll);if(!st.fs)map.panBy([pt.x-st.c[0],pt.y-st.c[1]],{animate:false});
    for(let k=0;k<25;k++){await sleep(160);if($('loading').hidden)break}window.__view3d.show({sky:true})}}
$('vfhx').onclick=()=>{clear();setBtn(false)};$('vfhpick').onclick=()=>{if(LZ.tool()!=='viewfrom')LZ.setTool('viewfrom')};$('vfhshade').onchange=drawOverlays;
document.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||(e.key!=='e'&&e.key!=='E'))return;const t=e.target;
  if(t&&(t.tagName==='INPUT'&&t.type!=='checkbox'&&t.type!=='range'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.isContentEditable))return;
  if(window.__view3d&&window.__view3d.isOpen&&window.__view3d.isOpen())return;LZ.setTool('viewfrom')});
const rayOf=ll=>{const r=cur.S.rings[0],p=map.project(ll,r.z);let b=Math.atan2(p.x-r.vx,r.vy-p.y)/D2R;if(b<0)b+=360;return Math.round(b/STEP)%NRAY};
map.on('mousemove',e=>{if(cur&&LZ.tool()!=='viewfrom')readout(rayOf(e.latlng))});
{const c=$('vfhc'),at=e=>{if(!cur||!cur.chart)return;const r=c.getBoundingClientRect(),x=e.clientX-r.left,ch=cur.chart;readout(Math.max(0,Math.min(NRAY-1,Math.round((x-ch.L0)/(ch.w-ch.L0-4)*NRAY))))};
  c.addEventListener('pointermove',at);c.addEventListener('pointerdown',at)}
window.addEventListener('resize',()=>{if(cur)drawChart(null)});
// share link: vp=lat,lng
{const prev=window.__lensHashExtra;window.__lensHashExtra=function(p){if(prev)prev(p);if(cur)p.set('vp',cur.ll.lat.toFixed(5)+','+cur.ll.lng.toFixed(5))}}
const api={run,clear:()=>{clear();setBtn(false)},sweep,raster,RANGE,EYE,
  state:()=>cur?{ll:cur.ll,gridRef:cur.gr,z0:cur.S.z0,eye:cur.S.eye,k:cur.S.k,range:cur.S.range,step:STEP,alt:cur.S.alt,dist:cur.S.dist,hgt:cur.S.hgt,flag:cur.S.flag,seenKm2:cur.seenKm2,groundKm2:cur.groundKm2,_S:cur.S,_rast:cur.rast}:null};
window.__viewshed=api;
{const v=LZ.H0&&LZ.H0.vp,m=v&&String(v).match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  if(m){const go=()=>run([+m[1],+m[2]]).then(()=>setBtn(false));const sw=navigator.serviceWorker;
    if(LC.live&&sw&&!sw.controller)sw.ready.then(()=>setTimeout(go,800),go);else setTimeout(go,800)}}
})();
