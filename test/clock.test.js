import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clockText, createTime, parseTime, rollWeather, slotOf, tick } from '../src/clock.js';

test('slots and text', () => {
    assert.equal(slotOf(3 * 60), 'night'); assert.equal(slotOf(8 * 60), 'morning'); assert.equal(slotOf(23 * 60), 'night');
    assert.equal(clockText({ day: 2, min: 19 * 60 + 5 }), 'Day 2, 19:05 (evening)');
    const t = createTime(1, 23 * 60); assert.equal(tick(t, 120), 1); assert.deepEqual(t, { day: 2, min: 60 });
});

test('TIME tags', () => {
    const now = createTime(1, 8 * 60);
    assert.deepEqual(parseTime('+45 min', now), { add: 45 });
    assert.deepEqual(parseTime('+2 hours', now), { add: 120 });
    assert.deepEqual(parseTime('Day 2, evening', now), { set: { day: 2, min: 19 * 60 } });
    assert.deepEqual(parseTime('Day 3 14:30', now), { set: { day: 3, min: 14 * 60 + 30 } });
    assert.deepEqual(parseTime('late evening', now), { set: { day: 1, min: 21 * 60 } });
    assert.deepEqual(parseTime('dawn', now), { set: { day: 2, min: 5 * 60 + 30 } }); // dawn has passed today
    assert.deepEqual(parseTime('the next morning', now), { set: { day: 2, min: 8 * 60 } });
    assert.equal(parseTime('soon', now), null);
});

test('weather is weighted', () => {
    assert.equal(rollWeather(0), 'clear'); assert.equal(rollWeather(0.999), 'heat');
});
