import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from '../src/prompt.js';
import { createSheet } from '../src/sheet.js';
import { upsertNpc } from '../src/npcs.js';
import { diceLine, d20, luck, rng } from '../src/dice.js';

test('the prompt has every section', () => {
    const sheet = createSheet({ name: 'Tom' });
    const npcs = [];
    upsertNpc(npcs, { name: 'Mara', cls: 3, heightCm: 950, card: true });
    const p = buildPrompt({ sheet, npcs, roll: 14, checks: ['wits 15 vs 12: success'], user: 'Tom', settings: { world: 'The town is called Hollow.' } });
    assert.match(p, /^\[Smallfolk: Tom is a 3-foot-tall man in a world of giants\]/);
    assert.match(p, /The town is called Hollow\./);
    assert.match(p, /YOU \(Tom\): You are 91 cm/);
    assert.match(p, /GIANTS Tom KNOWS[^\n]*\n- Mara: 9\.5 m/);
    assert.match(p, /DICE THIS TURN: 14 \(fair\) -> might 16, agility 16, wits 16, charm 16/);
    assert.match(p, /Last checks: wits 15/);
    assert.match(p, /\[HEALTH -2\]/);
    assert.doesNotMatch(buildPrompt({ sheet, npcs: [], roll: null, user: 'Tom' }), /GIANTS|DICE/);
});

test('dice', () => {
    const r = rng(7);
    const rolls = new Set(); for (let i = 0; i < 200; i++) rolls.add(d20(r()));
    assert.ok(rolls.has(1) && rolls.has(20) && rolls.size === 20);
    assert.equal(luck(20), 'a stroke of luck'); assert.equal(luck(1), 'a disaster');
    assert.match(diceLine({ might: 3 }, 10), /^10 \(poor\) -> might 13, agility 10/);
});
