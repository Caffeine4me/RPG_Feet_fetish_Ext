import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classForHeight, heightFor, playerText, rollClass, scaleOf, scaleText, sizeLine, vsYou, PLAYER_CM } from '../src/size.js';

test('classes are weighted, rarer the taller', () => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 1000; i++) counts[rollClass(i / 1000)]++;
    assert.equal(counts[1], 400); assert.equal(counts[2], 270); assert.equal(counts[6], 10);
    assert.equal(rollClass(0), 1); assert.equal(rollClass(0.999), 6);
});

test('heights sit inside their class', () => {
    for (let n = 1; n <= 6; n++) for (const r of [0, 0.5, 0.99]) assert.equal(classForHeight(heightFor(n, r)), n);
});

test('scale against a 3 ft man', () => {
    const s = scaleOf(366, PLAYER_CM); // 12 ft class 1
    assert.equal(s.cls, 1);
    assert.ok(s.ratio > 4 && s.ratio < 4.1);
    assert.equal(s.things[0].name, 'a stair step');
    assert.ok(Math.abs(s.things[0].cm - 36.6) < 0.1); // her step: 17 cm * 2.15
    assert.equal(vsYou(36.6), 'up to your waist');
    assert.equal(vsYou(900), '9.9× your height');
});

test('scale text is concrete and in both units', () => {
    const t = scaleText({ name: 'Mara', size_class: 3, height_cm: 950 }, PLAYER_CM);
    assert.match(t, /Mara: 9\.5 m \(31 ft 2 in\) tall, size class 3 \(Colossal/);
    assert.match(t, /10\.4× your height/);
    assert.match(t, /her foot is longer than you are tall; she can lift you in one hand/);
    assert.match(t, /Her stair step is/);
    assert.match(sizeLine({ name: 'Mara', size_class: 3, height_cm: 950 }), /^Colossal \(3\) · 31 ft 2 in · 10\.4× you$/);
});

test('player text describes the common world at his size', () => {
    const t = playerText(91);
    assert.match(t, /You are 91 cm \(3 ft\) tall/);
    assert.match(t, /a coin is/);
});

test('senses and physics', async () => {
    const { apparentTo, physicsText, senseText, weightKg } = await import('../src/size.js');
    assert.equal(weightKg(366), 699);
    assert.equal(apparentTo({ height_cm: 950 }, 91).word, 'a mouse');
    assert.equal(apparentTo({ height_cm: 366 }, 91).word, 'a cat');
    assert.match(senseText({ height_cm: 950 }, 91), /She weighs about 12\.2 tonnes; you feel her steps through the floor/);
    assert.match(senseText({ height_cm: 950 }, 91), /she notices you when you move/);
    assert.match(physicsText(91), /Falls: 1\.8 m \(6 ft\) is a hard landing/);
});
