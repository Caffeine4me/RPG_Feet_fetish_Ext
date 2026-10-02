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

test('size: the rolled class wins, a giant height maps to a class, and the prompt carries it', () => {
    const a = normalizeSheet({ name: 'Ada' }, { size_class: 4, height_cm: 1500 });
    assert.equal(a.size_class, 4);
    assert.equal(a.height_cm, 1500);
    const b = normalizeSheet({ name: 'Bo', height_cm: 2900 });
    assert.equal(b.size_class, 6);
    const c = normalizeSheet({ name: 'Cy', height_cm: 170 }); // a normal height: the sheet rolls a class instead
    assert.ok(c.size_class >= 1 && c.size_class <= 6 && c.height_cm >= 305);
    assert.match(sheetSummary(a), /size class 4, Titanic/);
    const m = buildSheetMessages({ card: { name: 'Ada' }, user: 'Tom', size: { size_class: 4, height_cm: 1500 } });
    assert.match(m[1].content, /SIZE \(fixed\): Ada is 15\.0 m/);
});
