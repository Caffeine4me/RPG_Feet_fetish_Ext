import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findNpc, npcsText, upsertNpc } from '../src/npcs.js';

test('loose name matching and updates', () => {
    const list = [];
    const a = upsertNpc(list, { name: 'Mara Voss', turn: 1 }, () => 0.1);
    assert.equal(a.created, true); assert.equal(a.npc.size_class, 1);
    const b = upsertNpc(list, { name: 'Mara', cls: 4, note: 'baker', turn: 3 });
    assert.equal(b.created, false); assert.equal(b.npc.size_class, 4); assert.equal(b.npc.note, 'baker'); assert.equal(b.npc.seen, 3);
    assert.equal(list.length, 1);
    assert.equal(findNpc(list, 'Voss'), null);
    assert.equal(findNpc(list, 'mara voss').name, 'Mara Voss');
});

test('prompt lines put the card first', () => {
    const list = [];
    upsertNpc(list, { name: 'Tess', turn: 9 }, () => 0.5);
    upsertNpc(list, { name: 'Ola', card: true, turn: 0 }, () => 0.5);
    const t = npcsText(list, { playerCm: 91 });
    assert.ok(t.startsWith('- Ola:'));
    assert.match(t, /\n- Tess:/);
});
