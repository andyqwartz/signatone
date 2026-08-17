import { traceContours, composePath, resample, pathToCoeffs } from './js/image.js';
import fs from 'fs';
const { w, h } = { w: 128, h: 128 };
const data = new Uint8ClampedArray(fs.readFileSync('/tmp/photo_test.rgba'));

// Sobel gradient magnitude on luma, then threshold -> edge mask
function luma(i) { return 0.299*data[i*4]+0.587*data[i*4+1]+0.114*data[i*4+2]; }
function sobelEdges(threshold) {
  const g = new Float32Array(w*h);
  let maxg = 0;
  for (let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const tl=luma((y-1)*w+(x-1)),tc=luma((y-1)*w+x),tr=luma((y-1)*w+(x+1));
    const ml=luma(y*w+(x-1)),mr=luma(y*w+(x+1));
    const bl=luma((y+1)*w+(x-1)),bc=luma((y+1)*w+x),br=luma((y+1)*w+(x+1));
    const gx=-tl-2*ml-bl+tr+2*mr+br;
    const gy=-tl-2*tc-tr+bl+2*bc+br;
    const m=Math.sqrt(gx*gx+gy*gy);
    g[y*w+x]=m; if(m>maxg)maxg=m;
  }
  const mask = new Uint8Array(w*h);
  for(let i=0;i<w*h;i++) mask[i] = (g[i] >= threshold*maxg) ? 1 : 0;
  return { mask, maxg };
}
for (const t of [0.10, 0.15, 0.20]) {
  const { mask, maxg } = sobelEdges(t);
  let loops = traceContours(mask, w, h);
  let main = loops.length ? Math.max(...loops.map(l=>l.length)) : 0;
  console.log(`Sobel thresh=${t} (abs ${Math.round(t*maxg)}): loops=${loops.length} main=${main}`);
}
