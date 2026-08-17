import { maskFromImageData, traceContours, composePath, resample, pathToCoeffs } from './js/image.js';

// Simulate the RGBA of a 64x64 image: black square (luma<128) on white
const w=64,h=64;
const data = new Uint8ClampedArray(w*h*4);
for(let r=0;r<h;r++)for(let c=0;c<w;c++){
  const inside = (r>=8&&r<=55&&c>=8&&c<=55);
  const v = inside?0:255;
  const i=(r*w+c)*4; data[i]=v;data[i+1]=v;data[i+2]=v;data[i+3]=255;
}
const {mask} = maskFromImageData(data,w,h,128,'auto');
let ones=0; for(const m of mask) if(m) ones++;
console.log('mask ones(luma dark):',ones);
let loops = traceContours(mask,w,h);
console.log('loops:',loops.length, 'lens:', loops.map(l=>l.length).slice(0,10));
const path = composePath(loops);
console.log('path len:',path.length);
const N=512; const pts=resample(path,N);
console.log('resample pts:',pts.length);
let mnx=1e9,mxx=-1e9,mny=1e9,mxy=-1e9;
for(const p of pts){mnx=Math.min(mnx,p.x);mxx=Math.max(mxx,p.x);mny=Math.min(mny,p.y);mxy=Math.max(mxy,p.y);}
console.log('bbox:',mxx-mnx,'x',mxy-mny);
const coeffs = pathToCoeffs(pts, 100);
console.log('coeffs:',coeffs.length,' top:', coeffs.slice(0,5).map(c=>`${c.k}:${c.amp.toFixed(3)}`).join(' '));
