import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSheet } from '../src/sheet.js';
import { createState, normalizeWorld } from '../src/world.js';
import { buildBrief, buildReconcileMessages, choiceMessage, parseReconcile, parseReply, stripTags, verbOf } from '../src/scene.js';

const card = normalizeSheet({ name: 'Marisol Reyes', archetype: 'Princess', dials: { smelly: 9 } }, { card: true });
const world = normalizeWorld({
    locations: [{ id: 'home', name: 'Your flat', type: 'home' }, { id: 'gym', name: 'Gym', type: 'gym', hours: ['morning'] }],
    residents: [{ id: 'marisol_reyes', name: 'Marisol Reyes', home: 'gym', schedule: { morning: 'gym' } }],
    quests: [{ id: 'bag', title: 'Carry the bag', giver: 'marisol_reyes', goal: 'Carry it to the gym.' }],
}, { cardSheets: [card] });

test('the brief names the place, the people and the rules', () => {
    const s = createState(world, { seed: 1 });
    s.at = 'gym';
    const b = buildBrief({ world, state: s, user: 'Tom', outcome: { text: 'She let you.' } });
    assert.match(b, /HERE: Gym/);
    assert.match(b, /Marisol Reyes.*Princess/);
    assert.match(b, /QUESTS SHE COULD GIVE.*\[bag\]/);
    assert.match(b, /OUTCOME.*She let you/);
    assert.match(b, /\[CHOICES\]/);
    s.at = 'home';
    assert.match(buildBrief({ world, state: s, user: 'Tom' }), /nobody/);
});

const REPLY = `*The gym smells of rubber and worse.*
Marisol [smug]: "Oh. It's you."
**Marisol Reyes [annoyed]:** "Don't just stand there."
[QUEST bag]
[EVENT service_row]
[CHOICES]
1. (Sniff check) I lean in and breathe in her sneakers.
2) I offer to carry her gym bag
- (Dance check) I dance.
4. I leave.`;

test('parseReply reads lines, expressions, choices with checks, event and quest', () => {
    const p = parseReply(REPLY);
    assert.equal(p.lines.length, 2);
    assert.deepEqual(p.lines[0], { who: 'Marisol', expr: 'smug', text: "Oh. It's you." });
    assert.equal(p.expressions['Marisol Reyes'], 'annoyed');
    assert.equal(p.event, 'service_row');
    assert.deepEqual(p.quests, ['bag']);
    assert.equal(p.choices.length, 4);
    assert.deepEqual(p.choices[0], { n: 1, text: 'I lean in and breathe in her sneakers.', check: 'sniff' });
    assert.equal(p.choices[1].check, null);
    assert.equal(p.choices[2].check, null, 'unknown checks are dropped');
    assert.equal(p.choices[2].text, 'I dance.');
    assert.equal(p.narration[0], 'The gym smells of rubber and worse.');
    assert.doesNotMatch(stripTags(REPLY), /CHOICES|EVENT|QUEST/);
    assert.equal(choiceMessage(p.choices[1]), 'I offer to carry her gym bag.');
    assert.equal(choiceMessage(p.choices[1], { asterisks: true }), '*I offer to carry her gym bag.*');
});

test('reconcile parses and filters to known ids', () => {
    const s = createState(world, { seed: 1 });
    const m = buildReconcileMessages({ world, state: s, reply: 'x', userText: 'y', user: 'Tom' });
    assert.match(m[1].content, /marisol_reyes = Marisol Reyes/);
    const d = parseReconcile('{"favor":{"marisol_reyes":"9","ghost":1},"irritation":{"Marisol Reyes":1},"items_gained":["gym bag"],"money":"-5","size_cm":"12","quests_given":["bag","nope"],"new_places":[{"name":"The Pier","type":"beach"}],"feet":{"marisol_reyes":"BARE"},"time_passed":1}', world);
    assert.deepEqual(d.favor, { marisol_reyes: 3 });
    assert.deepEqual(d.irritation, { marisol_reyes: 1 });
    assert.deepEqual(d.items_gained, ['gym bag']);
    assert.equal(d.money, -5);
    assert.equal(d.size_cm, 12);
    assert.deepEqual(d.quests_given, ['bag']);
    assert.equal(d.new_places[0].name, 'The Pier');
    assert.deepEqual(d.feet, { marisol_reyes: 'bare' });
    assert.equal(d.time_passed, 1);
    assert.equal(parseReconcile('nothing', world).size_cm, null);
});

test('verbOf', () => {
    assert.equal(verbOf('I sniff her socks'), 'sniff');
    assert.equal(verbOf('I give her a massage'), 'rub');
    assert.equal(verbOf('I wash the sneakers'), 'chore');
    assert.equal(verbOf('Hello'), null);
});

test('the brief tells group members who are absent to stay out', async () => {
    const { runChecks } = await import('../src/chatview.js');
    const r = runChecks({ disable_group_trimming: false, auto_scroll_chat_to_bottom: true, collapse_newlines: false, forbid_external_media: true }, { inGroup: true });
    assert.equal(r.find((x) => x.key === 'disable_group_trimming').ok, false);
    assert.equal(runChecks({ disable_group_trimming: false }, { inGroup: false }).find((x) => x.key === 'disable_group_trimming').ok, true);
    assert.equal(r.find((x) => x.key === 'forbid_external_media').ok, true);
});
