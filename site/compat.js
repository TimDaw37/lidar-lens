/* LiDAR Lens compatibility shim: plain ES5 so it runs (and can explain) on old browsers. Loaded before the app bundle. */
(function(){
  if(!Object.fromEntries)Object.fromEntries=function(it){var o={};Array.from(it).forEach(function(kv){o[kv[0]]=kv[1]});return o};
  if(window.Promise&&!Promise.allSettled)Promise.allSettled=function(ps){return Promise.all(Array.from(ps).map(function(p){return Promise.resolve(p).then(function(v){return{status:'fulfilled',value:v}},function(e){return{status:'rejected',reason:e}})}))};
  // Fault report: ring buffers of recent messages and JS errors, gathered into a prefilled email on click.
  var LOG=[],ERR=[];function push(a,t){t=String(t||'').slice(0,160);if(!t||a[a.length-1]===t)return;a.push(t);if(a.length>5)a.shift()}
  window.addEventListener&&window.addEventListener('error',function(e){push(ERR,(e.message||'error')+(e.filename?' @'+String(e.filename).split('/').pop()+':'+e.lineno:''))});
  window.addEventListener&&window.addEventListener('unhandledrejection',function(e){var r=e.reason;push(ERR,'promise: '+(r&&r.message||r))});
  function addr(){return ['timdaw','lens'].join('+')+'@'+['mail','grokbot'].join('.')+'.'+'com'}
  function gl(){var o='none';try{var c=document.createElement('canvas'),g=c.getContext('webgl2');if(g)o='WebGL2, float RT '+(g.getExtension('EXT_color_buffer_float')?'yes':'no');else{g=c.getContext('webgl')||c.getContext('experimental-webgl');if(g)o='WebGL1 only, float tex '+(g.getExtension('OES_texture_float')?'yes':'no')}}catch(e){o='error '+e.message}return o}
  function report(){var n=navigator,s=screen,C=window.__lensCompat||{},r=document.querySelector&&document.querySelector('#about b');
    var b=['What went wrong:','','','--- diagnostics (auto) ---','Lens: '+document.title+' | '+location.protocol+'//'+location.host+location.pathname,
      'Time: '+new Date().toString().slice(0,33),'UA: '+n.userAgent,'Platform: '+(n.platform||'?')+', touch '+(n.maxTouchPoints||0)+', lang '+n.language,
      'Screen '+s.width+'x'+s.height+', viewport '+window.innerWidth+'x'+window.innerHeight+', DPR '+(window.devicePixelRatio||1),
      'GL: '+gl()+(r?', renderer '+r.textContent:''),'WebP: '+(C.webp===undefined?'?':C.webp)+', modern: '+C.modern,
      'Geo: '+(n.geolocation?'yes':'no')+', secure '+(window.isSecureContext?'yes':'no'),'Map: '+String(location.hash).slice(0,300),
      'Msgs: '+(LOG.join(' | ')||'none'),'Errors: '+(ERR.join(' | ')||'none')].join('\n');
    if(b.length>1700)b=b.slice(0,1700)+'…';
    location.href='mailto:'+addr()+'?subject='+encodeURIComponent('LiDAR Lens fault: '+(document.title||location.host))+'&body='+encodeURIComponent(b)}
  window.__lensReport=report;
  function rlink(){var a=document.createElement('a');a.href='#';a.rel='noopener noreferrer';a.textContent='Report a fault';a.onclick=function(e){e.preventDefault?e.preventDefault():0;report();return false};return a}
  function hook(){var m=document.getElementById('msg');if(m&&window.MutationObserver)new MutationObserver(function(){push(LOG,m.textContent)}).observe(m,{childList:true,characterData:true,subtree:true});
    var ab=document.getElementById('about');if(ab&&ab.parentNode){var p=document.createElement('p');p.style.margin='8px 0 0';var a=rlink();a.setAttribute('role','button');a.style.cssText='display:inline-block;padding:4px 10px;border:1px solid #94a3b8;border-radius:6px;text-decoration:none';p.appendChild(a);
      p.appendChild(document.createTextNode(' opens an email with browser details filled in.'));ab.parentNode.appendChild(p)}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hook);else hook();
  function note(t){push(LOG,t);var go=function(){var d=document.createElement('div');d.className='compat';d.setAttribute('role','alert');d.textContent=t+' ';d.appendChild(rlink());
    var x=document.createElement('button');x.type='button';x.textContent='\u00d7';x.title='Dismiss';x.onclick=function(){d.parentNode.removeChild(d)};d.appendChild(x);document.body.appendChild(d)};
    if(document.body)go();else document.addEventListener('DOMContentLoaded',go)}
  var modern=!!(window.fetch&&window.Promise&&window.Map&&window.URL&&Array.from&&window.requestAnimationFrame);
  window.__lensCompat={modern:modern};
  if(!modern){note('This browser is too old to run the LiDAR Lens. Please use an up-to-date Chrome, Firefox, Edge, Safari (iOS 12 or later) or Samsung Internet.');return}
  // Hashed files under /assets/ are cached for a year. The HTML itself is not, so a reload picks up a new build.
  // LiDAR tiles are lossless WebP (Safari 14+, all current browsers). Check once and explain if unsupported.
  var im=new Image();im.onload=function(){if(im.width!==1){window.__lensCompat.webp=false;fail()}else window.__lensCompat.webp=true};im.onerror=function(){window.__lensCompat.webp=false;fail()};
  function fail(){note('This browser cannot decode WebP images, so the LiDAR layer cannot be shown (the background maps still work). Safari needs iOS/macOS 14 or later.')}
  im.src='data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';
})();
