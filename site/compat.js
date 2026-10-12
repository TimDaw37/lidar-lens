/* LiDAR Lens compatibility shim: plain ES5 so it runs (and can explain) on old browsers. Loaded before the app bundle. */
(function(){
  if(!Object.fromEntries)Object.fromEntries=function(it){var o={};Array.from(it).forEach(function(kv){o[kv[0]]=kv[1]});return o};
  if(window.Promise&&!Promise.allSettled)Promise.allSettled=function(ps){return Promise.all(Array.from(ps).map(function(p){return Promise.resolve(p).then(function(v){return{status:'fulfilled',value:v}},function(e){return{status:'rejected',reason:e}})}))};
  function note(t){var go=function(){var d=document.createElement('div');d.className='compat';d.setAttribute('role','alert');d.textContent=t;
    var x=document.createElement('button');x.type='button';x.textContent='\u00d7';x.title='Dismiss';x.onclick=function(){d.parentNode.removeChild(d)};d.appendChild(x);document.body.appendChild(d)};
    if(document.body)go();else document.addEventListener('DOMContentLoaded',go)}
  var modern=!!(window.fetch&&window.Promise&&window.Map&&window.URL&&Array.from&&window.requestAnimationFrame);
  window.__lensCompat={modern:modern};
  if(!modern){note('This browser is too old to run the LiDAR Lens. Please use an up-to-date Chrome, Firefox, Edge, Safari (iOS 12 or later) or Samsung Internet.');return}
  // LiDAR tiles are lossless WebP (Safari 14+, all current browsers). Check once and explain if unsupported.
  var im=new Image();im.onload=function(){if(im.width!==1){window.__lensCompat.webp=false;fail()}else window.__lensCompat.webp=true};im.onerror=function(){window.__lensCompat.webp=false;fail()};
  function fail(){note('This browser cannot decode WebP images, so the LiDAR layer cannot be shown (the background maps still work). Safari needs iOS/macOS 14 or later.')}
  im.src='data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';
})();
