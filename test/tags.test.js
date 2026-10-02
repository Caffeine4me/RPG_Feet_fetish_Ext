import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTags, parseTags, stripTags } from '../src/tags.js';
import { createSheet } from '../src/sheet.js';

const reply = `She sets the mug down beside you; it is taller than your head.
"Stay," she says.

[HEALTH -2]
[MONEY -3.50]
[ITEM +brass key: opens her pantry]
[ITEM +coin x3]
[COND +soaked]
[NPC Mara Voss class 3: runs the bakery]
[NPC Tess]
[NPC Ola 60 ft]
[XP +10]
[CHECK agility 17 vs 12: success]
[TIME Day 2, late evening]
[PLACE Mara's kitchen, under the table]
[NOTE she owes you a favour]`;

test('tags parse', () => {
    const t = parseTags(reply);
    assert.deepEqual(t[0], { type: 'meter', meter: 'health', delta: -2 });
    assert.deepEqual(t[1], { type: 'money', delta: -3.5 });
    assert.deepEqual(t[2], { type: 'item', name: 'brass key', qty: 1, note: 'opens her pantry' });
    assert.deepEqual(t[3], { type: 'item', name: 'coin', qty: 3, note: '' });
    assert.deepEqual(t[4], { type: 'cond', name: 'soaked', on: true });
    assert.deepEqual(t[5], { type: 'npc', name: 'Mara Voss', cls: 3, heightCm: null, note: 'runs the bakery' });
    assert.deepEqual(t[6], { type: 'npc', name: 'Tess', cls: null, heightCm: null, note: '' });
    assert.equal(t[7].cls, 5); assert.equal(t[7].heightCm, 1829);
    assert.deepEqual(t[8], { type: 'xp', delta: 10 });
    assert.equal(t[12].type, 'note');
    assert.equal(parseTags('[Narrator] [OOC: hi] [ITEM]').length, 0);
});

test('strip leaves the prose', () => {
    const s = stripTags(reply);
    assert.ok(s.startsWith('She sets the mug'));
    assert.ok(s.endsWith('"Stay," she says.'));
    assert.equal(stripTags('ok [HP -1] then'), 'ok  then');
});

test('apply updates the game and reports', () => {
    const game = { sheet: createSheet({ money: 20 }), npcs: [], turn: 4 };
    const lines = applyTags(game, parseTags(reply), { r: () => 0.5 });
    assert.equal(game.sheet.meters.health.cur, 8);
    assert.equal(game.sheet.money, 16.5);
    assert.equal(game.sheet.items.length, 2);
    assert.deepEqual(game.sheet.conditions, ['soaked']);
    assert.equal(game.npcs.length, 3);
    assert.equal(game.npcs[0].size_class, 3);
    assert.equal(game.npcs[1].size_class, 2); // r 0.5 lands in class 2 by weight
    assert.equal(game.npcs[2].height_cm, 1829);
    assert.equal(game.sheet.xp, 10);
    assert.equal(game.sheet.clock, 'Day 2, late evening');
    assert.deepEqual(game.checks, ['agility 17 vs 12: success']);
    assert.equal(lines[0].text, 'health -2 (8/10)');
    assert.equal(lines[5].text, 'met Mara Voss, class 3');
});
