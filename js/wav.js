// Minimal WAV -> Float32Array (PCM16 mono). Shared by the main thread and the
// decode worker. Handles our export format (48k / 16-bit / mono).
export function decodeWavToFloat32(buf) {
  const dv = new DataView(buf);
  let off = 12, dataStart = -1, dataLen = 0, bits = 16, ch = 1;
  const u8 = new Uint8Array(buf);
  const toStr = (o, l) => String.fromCharCode(...u8.subarray(o, o + l));
  while (off + 8 <= buf.byteLength) {
    const id = toStr(off, 4);
    const sz = dv.getUint32(off + 4, true);
    if (id === 'fmt ') { ch = dv.getUint16(off + 8 + 2, true); bits = dv.getUint16(off + 8 + 14, true); }
    else if (id === 'data') { dataStart = off + 8; dataLen = sz; }
    off += 8 + sz + (sz % 2);
  }
  const nframes = dataLen / (bits / 8 * ch);
  const out = new Float32Array(nframes);
  for (let i = 0; i < nframes; i++) out[i] = dv.getInt16(dataStart + i * 2 * ch, true) / 32768;
  return out;
}