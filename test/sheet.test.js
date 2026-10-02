import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSheetMessages, normalizeOdor, normalizeSheet, odorText, sheetSummary } from '../src/sheet.js';

test('a sheet from a messy reply gets defaults and clamps', () => {
    const s = normalizeSheet('Here:\n```json\n{"name":"Marisol Reyes","age":"21","archetype":"stuck up","dials":{"bossy":15,"bratty":"10","friendly":-2},"odor":{"cheesy":5,"lemony":5},"wants":{"verbs":["Rub","sniff","dance"],"hates":["rub","lick"]},"schedule":{"morning":"Tennis Court"}}\n```', { card: true, avatar: 'm.png' });
    assert.equal(s.id, 'marisol_reyes');
    assert.equal(s.archetype, 'Princess');
    assert.equal(s.dials.bossy, 11);
    assert.equal(s.dials.bratty, 10);
    assert.equal(s.dials.friendly, 0);
    assert.equal(s.dials.smelly, 6);
    assert.deepEqual(s.odor, { cheesy: 50, lemony: 50, fishy: 0, meaty: 0 });
    assert.deepEqual(s.wants.verbs, ['rub', 'sniff']);
    assert.deepEqual(s.wants.hates, ['lick']);
    assert.equal(s.schedule.morning, 'tennis_court');
    assert.ok(s.card && s.avatar === 'm.png');
});

test('odor normalises to 100 and reads naturally', () => {
    assert.deepEqual(normalizeOdor({ cheesy: 3, lemony: 1, fishy: 0, meaty: 0 }), { cheesy: 75, lemony: 25, fishy: 0, meaty: 0 });
    assert.equal(odorText({ cheesy: 75, lemony: 25 }), 'overwhelmingly cheesy');
    assert.equal(odorText({ cheesy: 50, lemony: 30, fishy: 10, meaty: 10 }), 'mostly cheesy with a lemony edge');
});

test('the summary and the prompt carry the card', () => {
    const s = normalizeSheet({ name: 'Ada', archetype: 'Viper', shoes: 'cowgirl boots', socks: 'black socks with holes', hook: 'Spits on the world.' });
    const text = sheetSummary(s);
    assert.match(text, /Ada.*Viper/);
    assert.match(text, /cowgirl boots/);
    const m = buildSheetMessages({ card: { name: 'Ada', description: 'A goth girl.' }, user: 'Tom', persona: 'A short guy.' });
    assert.equal(m.length, 2);
    assert.match(m[1].content, /CHARACTER: Ada/);
    assert.match(m[1].content, /THE PLAYER \(Tom\)/);
});
