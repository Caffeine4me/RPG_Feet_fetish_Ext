import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addXp, changeItem, changeMeter, createSheet, levelFor, normalizeSheet, setCondition, sheetText, spendPoint } from '../src/sheet.js';

test('a fresh sheet', () => {
    const s = createSheet({ name: 'Tom' });
    assert.equal(s.height_cm, 91);
    assert.deepEqual(s.meters.health, { cur: 10, max: 10 });
    assert.equal(s.money, 20);
    assert.match(sheetText(s), /Tom, level 1 \(0 xp\)\. health 10\/10/);
    assert.match(sheetText(s), /nothing but the clothes/);
});

test('meters clamp, items stack and vanish, conditions toggle', () => {
    const s = createSheet();
    assert.equal(changeMeter(s, 'health', -13), 0);
    assert.equal(changeMeter(s, 'health', +99), 10);
    changeItem(s, 'Brass Key', 1, 'opens her pantry');
    changeItem(s, 'coin', 3);
    changeItem(s, 'brass key', 1);
    assert.equal(s.items.find((i) => i.id === 'brass_key').qty, 2);
    changeItem(s, 'coin', -5);
    assert.equal(s.items.some((i) => i.id === 'coin'), false);
    setCondition(s, 'Soaked'); setCondition(s, 'soaked'); setCondition(s, 'hidden');
    assert.deepEqual(s.conditions, ['soaked', 'hidden']);
    setCondition(s, 'soaked', false);
    assert.deepEqual(s.conditions, ['hidden']);
    assert.match(sheetText(s), /Brass Key ×2 \(opens her pantry\)/);
});

test('xp levels and points', () => {
    const s = createSheet();
    assert.equal(levelFor(250), 3);
    assert.equal(addXp(s, 210), 2);
    assert.equal(s.points, 2);
    assert.equal(spendPoint(s, 'wits'), true);
    assert.equal(s.attrs.wits, 3);
    assert.equal(spendPoint(s, 'nope'), false);
});

test('normalize repairs an old or broken sheet', () => {
    const s = normalizeSheet({ name: 'Tom', meters: { health: { cur: 50, max: 12 } }, attrs: { might: 7 }, items: ['rope', { name: 'coin', qty: 2 }, {}], conditions: ['Wet', 'wet'] });
    assert.deepEqual(s.meters.health, { cur: 12, max: 12 });
    assert.deepEqual(s.meters.nerve, { cur: 10, max: 10 });
    assert.equal(s.attrs.might, 7);
    assert.equal(s.items.length, 2);
    assert.deepEqual(s.conditions, ['wet']);
});
