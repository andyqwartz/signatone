// Encode Float32Array samples into a 16-bit PCM mono RIFF WAV ArrayBuffer.
export function encodeWav(float32, sampleRate) {
  const n = float32.length;
  const buf = new ArrayBuffer(44 + n*2);
  const v = new DataView(buf);
  const ws = (o, s) => { for(let i=0;i<s.length;i++) v.setUint8(o+i, s.charCodeAt(i)); };
  ws(0,'RIFF');   v.setUint32(4, 36+n*2, true);
  ws(8,'WAVE');   ws(12,'fmt '); v.setUint32(16,16,true);
  v.setUint16(20,1,true);        // PCM
  v.setUint16(22,1,true);        // mono
  v.setUint32(24,sampleRate,true);
  v.setUint32(28, sampleRate*2, true); // byte rate
  v.setUint16(32,2,true);        // block align
  v.setUint16(34,16,true);       // bits
  ws(36,'data'); v.setUint32(40, n*2, true);
  for (let i=0;i<n;i++){
    const s = Math.max(-1, Math.min(1, float32[i]));
    v.setInt16(44 + i*2, s < 0 ? s*0x8000 : s*0x7FFF, true);
  }
  return buf;
}

// Browser-only helper: buffer -> downloadable object URL.
export function wavBlobUrl(buf) {
  const blob = new Blob([buf], {type:'audio/wav'});
  return URL.createObjectURL(blob);
}