import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classForHeight, heightFor, rollCast, rollClass, scaleOf, scaleText, sizeLine } from '../src/size.js';

test('classes roll by weight: common small, rare mythic', () => {
    assert.equal(rollClass(0), 1);
    assert.equal(rollClass(0.39), 1);
    assert.equal(rollClass(0.41), 2);
    assert.equal(rollClass(0.999), 6);
    assert.equal(rollClass(0.98), 5);
    let counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 1000; i++) counts[rollClass(i / 1000) - 1]++;
    assert.ok(counts[0] > counts[1] && counts[1] > counts[2] && counts[5] < 20);
});

test('heights, classes and scale', () => {
    assert.equal(heightFor(1, 0), 305);
    assert.equal(heightFor(6, 1), 3048);
    assert.equal(classForHeight(1200), 3);
    assert.equal(classForHeight(3000), 6);
    const s = scaleOf(1200);
    assert.ok(s.ratio > 6.8 && s.ratio < 6.9);
    assert.ok(s.foot > 175, 'a 40 ft giant has a foot longer than the player is tall');
    const t = scaleText({ name: 'Ada', height_cm: 1200, size_class: 3 });
    assert.match(t, /Ada is 12\.0 m \(39 ft 4 in\) tall \(size class 3, Colossal/);
    assert.match(t, /her foot is longer than you are tall/);
    assert.match(sizeLine({ height_cm: 457, size_class: 2 }), /Towering \(2\) · 15 ft · 2\.6× you/);
});

test('rollCast is seeded and never all class 1 for a real cast', () => {
    let a = 0.05; const rng = () => (a = (a + 0.17) % 1);
    const cast = rollCast(5, rng);
    assert.equal(cast.length, 5);
    assert.ok(cast.some((n) => n >= 2));
});
