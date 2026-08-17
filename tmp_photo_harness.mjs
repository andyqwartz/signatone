import { maskFromImageData, traceContours, composePath, resample, pathToCoeffs } from './js/image.js';
import fs from 'fs';

// read a realistic photo dumped as RGBA
const { w, h } = { w: 128, h: 128 };
const buf = fs.readFileSync('/tmp/photo_test.rgba');
const data = new Uint8ClampedArray(buf);

function run(mode, threshold, label) {
  let { mask } = maskFromImageData(data, w, h, threshold, mode);
  let ones = 0; for (const m of mask) if (m) ones++;
  let loops = traceContours(mask, w, h);
  let main = loops.length ? Math.max(...loops.map(l => l.length)) : 0;
  console.log(`${label}: ones=${ones}/${w*h} loops=${loops.length} main=${main}`);
  return loops;
}

console.log('mode auto luma 128:'); run('auto', 128, 'auto/128');
console.log('mode luma 64:'); run('luma', 64, 'luma/64');
console.log('mode alpha:'); run('alpha', 128, 'alpha/128');
