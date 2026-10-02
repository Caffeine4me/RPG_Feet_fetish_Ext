import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSheet } from '../src/sheet.js';
import { applyDeltas, check, odds, playerLine, rollFor, setValue, sizeStage, triggers } from '../src/rules.js';

const sheet = normalizeSheet({ name: 'Ada Lin', archetype: 'Viper', dials: { bossy: 8, bratty: 9, friendly: 1, smelly: 10, sweaty: 6, dirty: 7 }, wants: { verbs: ['rub'], hates: ['lick'] } });
const state = () => ({ seed: 42, turn: 3, player: { size_cm: 175, stamina: 10, composure: 10, dirt: 0, money: 10, reputation: 0 }, rel: { ada_lin: { favor: 0, irritation: 0, fear: 0, met: false } }, inventory: [] });

test('rolls are deterministic per state and salt', () => {
    assert.equal(rollFor(state()), rollFor(state()));
    assert.notEqual(rollFor(state(), 1), rollFor(state(), 2) === rollFor(state(), 1) ? -1 : rollFor(state(), 2));
    assert.ok(rollFor(state()) >= 1 && rollFor(state()) <= 20);
});

test('wanted verbs are easier, hated ones harder', () => {
    const s = state();
    assert.ok(odds(s, sheet, 'rub') > odds(s, sheet, 'lick'));
    const c = check(s, sheet, 'sniff');
    assert.ok(['crit', 'success', 'fail', 'botch'].includes(c.tier));
    assert.match(c.text, /Ada/);
    assert.ok(c.deltas.player.composure < 0, 'sniffing a 10-smelly girl always costs composure');
});

test('deltas clamp and mark her as met', () => {
    const s = state();
    applyDeltas(s, 'ada_lin', { player: { composure: -30, money: 5 }, rel: { favor: 25, irritation: -3 } });
    assert.equal(s.player.composure, 0);
    assert.equal(s.player.money, 15);
    assert.equal(s.rel.ada_lin.favor, 20);
    assert.equal(s.rel.ada_lin.irritation, 0);
    assert.ok(s.rel.ada_lin.met);
    setValue(s, null, 'size_cm', 5);
    assert.equal(s.player.size_cm, 5);
    assert.equal(sizeStage(5), 'bug');
    const t = triggers(s, [sheet]);
    assert.ok(t.some((x) => x.id === 'passout'));
    s.rel.ada_lin.fear = 9;
    assert.ok(triggers(s, [sheet]).some((x) => x.severity === 'end'));
    assert.match(playerLine(s, 'Tom'), /tiny/);
});
