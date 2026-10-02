import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNav, findPath, findPlace, guessKind, layout, navText, smallMinutes, upsertPlace, upsertRoute } from '../src/nav.js';

test('kinds are guessed from names', () => {
    assert.equal(guessKind("Mara's kitchen"), 'indoor'); assert.equal(guessKind('Market square'), 'square'); assert.equal(guessKind('The old drawer'), 'hideout'); assert.equal(guessKind('Somewhere'), 'street');
});

test('places, routes and paths', () => {
    const nav = createNav();
    upsertPlace(nav, { name: "Mara's kitchen", danger: 1 });
    upsertRoute(nav, { from: "Mara's kitchen", to: 'Back step', giantMin: 1 });
    upsertRoute(nav, { from: 'Back step', to: 'Market square', giantMin: 5, hazards: ['gutter', 'cats'] });
    upsertRoute(nav, { from: "Mara's kitchen", to: 'Market square', giantMin: 12 });
    assert.equal(nav.places.length, 3); assert.equal(nav.routes.length, 3);
    assert.equal(findPlace(nav, 'mara').name, "Mara's kitchen");
    assert.equal(smallMinutes(5, 91), 12);
    const path = findPath(nav, 'mara_s_kitchen', 'market_square', 91);
    assert.deepEqual(path.map((l) => l.to), ['back_step', 'market_square']); // 2 + 12 beats 29
    assert.equal(path.reduce((a, l) => a + l.minutes, 0), 14);
    assert.equal(findPath(nav, 'mara_s_kitchen', 'nowhere'), null);
    upsertPlace(nav, { name: 'Back step', kind: 'street', danger: 4, note: 'a cat sleeps here' });
    assert.equal(findPlace(nav, 'Back step').danger, 4);
    nav.at = 'mara_s_kitchen';
    assert.match(navText(nav, 91), /Here: Mara's kitchen \(indoors; danger 1\/5/);
    assert.match(navText(nav, 91), /Ways from here: Back step \(2 min for you\); Market square \(29 min for you\)/);
    layout(nav);
    assert.ok(nav.places.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
    const d = Math.hypot(nav.places[0].x - nav.places[1].x, nav.places[0].y - nav.places[1].y);
    assert.ok(d > 0.15);
    const snap = nav.places.map((p) => [p.x, p.y]);
    layout(nav);
    const moved = Math.max(...nav.places.map((p, i) => Math.hypot(p.x - snap[i][0], p.y - snap[i][1])));
    assert.ok(moved < 0.01); // a second pass barely moves anything
});
