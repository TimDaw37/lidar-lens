// The second 3D open must not reuse a canvas whose WebGL context was released.
// A lost context stays on that canvas, and the next WebGLRenderer then crashes
// in getShaderPrecisionFormat().
// Later 3D work on main still calls forceContextLoss() on close; the reopen
// guard is to replace the canvas with a clone before the next open.
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../site/view3d.js', import.meta.url), 'utf8');
if (!src.includes('cloneNode(false)') || !src.includes('replaceWith')) {
  console.error('view3d.js does not replace the canvas after dispose');
  process.exit(1);
}
console.log('view3d reopen guard ok');
