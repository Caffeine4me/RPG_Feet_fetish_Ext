import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawFeetPov, feetPovPrompt, sockPattern } from '../src/feetpov.js';

test('sock patterns and the prompt', () => {
    assert.equal(sockPattern('black and white striped socks'), 'stripes');
    assert.equal(sockPattern('polka dot socks'), 'dots');
    assert.equal(sockPattern('socks with holes'), 'holes');
    assert.equal(sockPattern('toesocks'), 'toes');
    assert.equal(sockPattern('white ankle socks'), 'plain');
    const p = feetPovPrompt({ name: 'Ada', shoes: 'boots', socks: 'grey socks', dials: { sweaty: 9, dirty: 8 } }, { feet: 'socks', place: 'a cinema' });
    assert.match(p, /feet up on it.*grey socks.*sweat droplets.*grimy.*tiny.*cinema/s);
});

test('drawing runs against a stub context', () => {
    const ctx = new Proxy({}, { get: (t, k) => (k === 'imageSmoothingEnabled' ? false : () => undefined), set: () => true });
    for (const feet of ['socks', 'bare', 'shoes']) assert.doesNotThrow(() => drawFeetPov(ctx, { sheet: { name: 'A', shoes: 'sneakers', socks: 'striped socks', look: 'blonde', dials: { sweaty: 8, dirty: 8, smelly: 10 } }, feet, tick: 5 }));
});
