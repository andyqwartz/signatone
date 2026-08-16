import { strict as assert } from 'node:assert/strict';
import { SGFConfig } from '../js/config.js';

assert.equal(SGFConfig.sampleRate, 48000);
assert.equal(SGFConfig.f0, 102);
assert.equal(SGFConfig.N, 32);
assert.equal(SGFConfig.harmonicFreq(1), 102);
assert.equal(SGFConfig.harmonicFreq(32), 3264);
assert.equal(SGFConfig.blockSamples(), Math.ceil(90/1000*48000));
console.log('config OK');