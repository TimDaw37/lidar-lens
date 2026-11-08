// The second 3D open must not call WEBGL_lose_context. A lost context stays on the
// canvas, and the next WebGLRenderer then crashes in getShaderPrecisionFormat().
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../site/view3d.js', import.meta.url), 'utf8');
if (/forceContextLoss\s*\(/.test(src)) {
  console.error('view3d.js still calls forceContextLoss()');
  process.exit(1);
}
if (!src.includes('cloneNode(false)') || !src.includes('replaceWith')) {
  console.error('view3d.js does not replace the canvas after dispose');
  process.exit(1);
}
console.log('view3d reopen guard ok');
