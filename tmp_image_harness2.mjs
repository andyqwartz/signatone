import { maskFromImageData, traceContours, composePath, resample, pathToCoeffs } from './js/image.js';
import fs from 'fs';

// read raw RGBA dumped by python (64x64)
const { w, h } = { w: 64, h: 64 };
const buf = fs.readFileSync('/tmp/sgf_test.rgba');
const data = new Uint8ClampedArray(buf);

console.log('=== mode auto (luma) threshold 128 ===');
let { mask } = maskFromImageData(data, w, h, 128, 'auto');
let loops = traceContours(mask, w, h);
console.log('loops:', loops.length, 'lens:', loops.map(l => l.length).slice(0, 8));
console.log('main loop len:', loops.length ? Math.max(...loops.map(l => l.length)) : 0);

console.log('=== inspect a few pixels (luma seems all one value?) ===');
// print first few rgb
for (let r = 0; r < 3; r++) {
  let row = [];
  for (let c = 0; c < 8; c++) { const i = (r * w + c) * 4; row.push(`${data[i]},${data[i+1]},${data[i+2]}`); }
  console.log('row', r, row.join(' | '));
}
