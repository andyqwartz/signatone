import { strict as assert } from 'node:assert/strict';
import { SGFConfig } from '../js/config.js';

assert.equal(SGFConfig.sampleRate, 48000);
assert.equal(SGFConfig.f0, 102);
assert.equal(SGFConfig.N, 128);
assert.equal(SGFConfig.harmonicFreq(1), 102);
assert.equal(SGFConfig.harmonicFreq(128), 13056);
assert.equal(SGFConfig.blockSamples(), Math.ceil(120/1000*48000));
console.log('config OK');