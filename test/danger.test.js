import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crowdNow, journey, resolveLeg, riskOf, sleepHere, triggers, waitHere } from '../src/danger.js';
import { createSheet, passTime, setCondition } from '../src/sheet.js';
import { createNav, findPath, upsertPlace, upsertRoute } from '../src/nav.js';
import { rng } from '../src/dice.js';

const sq = { id: 'sq', name: 'Market square', kind: 'square', danger: 3, crowd: 3, cover: 0 };

test('risk grows with crowd, dark, rain and state', () => {
    const sheet = createSheet();
    const day = riskOf(sq, { sheet, time: { day: 1, min: 12 * 60 }, weather: 'clear' });
    assert.equal(day.dc, 18); // 6 + 6 + crowd 3*2
    const night = riskOf(sq, { sheet, time: { day: 1, min: 2 * 60 }, weather: 'rain' });
    assert.equal(night.dc, 18); // no crowd, dark +3, rain +3
    setCondition(sheet, 'hidden');
    assert.equal(riskOf(sq, { sheet, time: { day: 1, min: 2 * 60 }, weather: 'rain' }).dc, 15);
    assert.equal(crowdNow(sq, 3 * 60), 0);
    const home = { kind: 'hideout', danger: 0, crowd: 0, cover: 3 };
    assert.equal(riskOf(home, { sheet, time: { day: 1, min: 2 * 60 }, weather: 'rain' }).level, 'fairly safe');
});

test('a leg can hurt', () => {
    const sheet = createSheet();
    const low = resolveLeg(sheet, sq, null, { time: { day: 1, min: 12 * 60 }, weather: 'clear' }, () => 0.02); // roll 1
    assert.equal(low.tier, 'disaster'); assert.ok(sheet.meters.health.cur <= 7);
    const s2 = createSheet();
    const high = resolveLeg(s2, sq, { hazards: ['a cart'] }, { time: { day: 1, min: 12 * 60 }, weather: 'clear' }, () => 0.99); // roll 20
    assert.equal(high.tier, 'clean'); assert.equal(high.hazard, 'a cart'); assert.equal(s2.meters.health.cur, 10);
});

test('time passing: hunger, cold, tiredness, healing', () => {
    const sheet = createSheet();
    passTime(sheet, 6 * 60, { weather: 'clear', outside: false });
    assert.equal(sheet.meters.food.cur, 6);
    setCondition(sheet, 'soaked');
    passTime(sheet, 4 * 60, { weather: 'cold', outside: true });
    assert.ok(sheet.meters.warmth.cur <= 1);
    passTime(sheet, 15 * 60, { weather: 'clear', outside: false });
    assert.ok(sheet.conditions.includes('exhausted'));
    assert.ok(sheet.conditions.includes('hungry') || sheet.conditions.includes('starving'));
    assert.ok(sheet.meters.health.cur < 10);
});

test('a journey, a wait and a night', () => {
    const nav = createNav();
    upsertPlace(nav, { name: 'Drawer', kind: 'hideout' });
    upsertRoute(nav, { from: 'Drawer', to: 'Market square', giantMin: 5, hazards: ['a cart'] });
    nav.at = 'drawer';
    const game = { sheet: createSheet({ name: 'Tom' }), nav, weather: 'clear' };
    const path = findPath(nav, 'drawer', 'market_square', 91);
    const out = journey(game, path, rng(3));
    assert.equal(out.minutes, 12); assert.equal(nav.at, 'market_square'); assert.match(out.text, /Tom travelled to Market square, 12 minutes/);
    assert.match(waitHere(game, 60, rng(4)), /waited 60 minutes at Market square/);
    const night = sleepHere(game, rng(5));
    assert.match(night, /slept \d+ hours/); assert.equal(game.sheet.time.min, 7 * 60); assert.equal(game.sheet.time.day, 2);
    game.sheet.meters.health.cur = 0;
    assert.equal(triggers(game.sheet)[0].severity, 'end');
});
