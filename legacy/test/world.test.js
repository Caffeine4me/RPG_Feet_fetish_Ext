import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSheet } from '../src/sheet.js';
import { addLocation, advance, buildWorldMessages, closedHint, createState, isOpenNow, isUnlocked, normalizeWorld, questDone, sleep, travel, whoIsAt } from '../src/world.js';

const card = normalizeSheet({ name: 'Marisol Reyes', archetype: 'Princess', job: 'sorority president' }, { card: true, avatar: 'm.png' });

const RAW = {
    town: { name: 'Port Sock', vibe: 'seaside college town', intro: 'Welcome.' },
    locations: [
        { id: 'home', name: 'Your flat', type: 'home', open: { when: 'start' } },
        { id: 'zbz_house', name: 'Sorority House', type: 'sorority', open: { when: 'day', day: 5 } },
        { id: 'gym', name: 'Iron Sole Gym', type: 'gym', open: { when: 'quest', quest: 'bag' }, hours: ['morning'] },
        { id: 'laundro', name: 'Suds', type: 'laundromat', open: { when: 'quest', quest: 'nope' } },
        { id: 'weird', name: 'Mystery', type: 'castle', open: { when: 'favor', who: 'marisol_reyes', min: 4 } },
    ],
    residents: [
        { id: 'marisol_reyes', name: 'Marisol Reyes', home: 'zbz_house', schedule: { morning: 'gym', afternoon: 'nowhere', evening: 'zbz_house' } },
        { name: 'Bea Kowalski', archetype: 'Drill', home: 'gym', schedule: { morning: 'gym', afternoon: 'gym' } },
        { name: 'Marisol Reyes', archetype: 'Viper' },
    ],
    quests: [{ id: 'bag', title: 'Carry the bag', giver: 'marisol_reyes', goal: 'Carry it.', reward: { opens: 'gym', favor: 2, money: 10 } }],
};

test('normalizeWorld keeps the card, fixes homes, schedules and rules', () => {
    const w = normalizeWorld(RAW, { cardSheets: [card] });
    assert.equal(w.residents.length, 2, 'the duplicate card name is dropped');
    const m = w.residents[0];
    assert.ok(m.card && m.avatar === 'm.png' && m.archetype === 'Princess');
    assert.equal(m.home, 'zbz_house');
    assert.deepEqual(m.schedule, { morning: 'gym', afternoon: 'zbz_house', evening: 'zbz_house', night: 'zbz_house' });
    assert.equal(w.locations.find((l) => l.id === 'zbz_house').open.when, 'start', "the card character's home opens at the start");
    assert.equal(w.locations.find((l) => l.id === 'laundro').open.when, 'start', 'a rule on a missing quest falls back');
    assert.equal(w.locations.find((l) => l.id === 'weird').type, 'generic');
    assert.deepEqual(w.locations.find((l) => l.id === 'weird').open, { when: 'favor', who: 'marisol_reyes', min: 4 });
    assert.equal(w.quests[0].reward.opens, 'gym');
});

test('a world with nothing in it still has a home and a house per resident', () => {
    const w = normalizeWorld('garbage', { cardSheets: [card] });
    assert.ok(w.locations.some((l) => l.type === 'home'));
    assert.equal(w.residents[0].home, 'marisol_reyes_home');
    assert.ok(w.locations.some((l) => l.id === 'marisol_reyes_home'));
});

test('clock, travel, opening and quests', () => {
    const w = normalizeWorld(RAW, { cardSheets: [card] });
    const s = createState(w, { seed: 1 });
    assert.equal(s.at, 'home');
    const gym = w.locations.find((l) => l.id === 'gym');
    assert.equal(isUnlocked(w, s, gym), false);
    assert.match(closedHint(w, s, gym), /Carry the bag/);
    assert.deepEqual(whoIsAt(w, 'gym', 'morning').map((r) => r.id), ['marisol_reyes', 'bea_kowalski']);
    const t = travel(w, s, 'gym');
    assert.ok(t.ok && s.slot === 'afternoon' && t.open === false);
    questDone(w, s, 'bag');
    assert.equal(s.player.money, 50);
    assert.equal(s.rel.marisol_reyes.favor, 2);
    assert.equal(isUnlocked(w, s, gym), true);
    assert.equal(isOpenNow(w, s, gym), false, 'unlocked but the gym is a morning place');
    assert.equal(advance(s, 3), 1);
    assert.equal(s.slot, 'morning');
    assert.equal(s.day, 2);
    sleep(w, s);
    assert.equal(s.day, 3);
    assert.equal(s.at, 'home');
    const loc = addLocation(w, { name: 'The Pier', type: 'beach' });
    assert.equal(loc.open.when, 'flag');
    s.flags[loc.open.flag] = true;
    assert.equal(isUnlocked(w, s, loc), true);
});

test('the world prompt names the card and the count', () => {
    const m = buildWorldMessages({ sheets: [card], user: 'Tom', extraResidents: 4, vibe: 'seaside' });
    assert.match(m[1].content, /id "marisol_reyes"/);
    assert.match(m[1].content, /Invent 4 extra residents/);
    assert.match(m[1].content, /seaside/);
});

test('rolled sizes are given to the invented residents, not the card', async () => {
    const { rollSizes } = await import('../src/world.js');
    const classes = rollSizes(2, 5);
    assert.equal(classes.length, 2);
    const w = normalizeWorld(RAW, { cardSheets: [card], classes });
    assert.equal(w.residents[1].size_class, classes[0].n);
    assert.equal(w.residents[1].height_cm, classes[0].height_cm);
    const m = buildWorldMessages({ sheets: [card], user: 'Tom', extraResidents: 2, classes });
    assert.match(m[1].content, /EXTRA RESIDENTS' SIZES.*#1: class/);
    assert.match(m[1].content, /SIZE CLASSES: class 1 Big: 10-15 ft, 40%/);
});
