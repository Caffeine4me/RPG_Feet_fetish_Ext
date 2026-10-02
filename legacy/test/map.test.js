import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitTest, layoutTown, pixelText, shortName, textWidth, drawTown } from '../src/map.js';

const world = { locations: Array.from({ length: 12 }, (_, i) => ({ id: `l${i}`, name: `Place ${i}`, type: i === 3 ? 'farm' : i === 5 ? 'lighthouse' : 'cafe' })) };

test('layout is deterministic, inside the canvas, and buildings do not overlap', () => {
    const a = layoutTown(world, { seed: 3 }), b = layoutTown(world, { seed: 3 });
    assert.deepEqual(a, b);
    assert.equal(a.buildings.length, 12);
    for (const x of a.buildings) {
        assert.ok(x.x >= 0 && x.y >= 0 && x.x + x.w <= a.w && x.y + x.h <= a.h, 'inside');
        for (const y of a.buildings) if (x !== y) assert.ok(x.x + x.w <= y.x || y.x + y.w <= x.x || x.y + x.h <= y.y || y.y + y.h <= x.y, `no overlap ${x.id} ${y.id}`);
    }
    assert.ok(a.paths.length >= 11 * 3, 'a spanning tree joins every building');
    const b0 = a.buildings[0];
    assert.equal(hitTest(a, b0.x + 2, b0.y + 2), 'l0');
    assert.equal(hitTest(a, -50, -50), null);
});

test('pixel font and sign names', () => {
    assert.equal(textWidth('CLOSED'), 23);
    assert.equal(shortName('Suds & Socks Laundromat', 12), 'SUDS & SOCKS');
    assert.equal(shortName('Élodie', 12), 'LODIE');
    const calls = [];
    const ctx = { fillRect: (...a) => calls.push(a), set fillStyle(v) { this._f = v; }, get fillStyle() { return this._f; } };
    assert.equal(pixelText(ctx, 'A', 0, 0), 3);
    assert.equal(calls.length, 10, 'A is ten lit pixels');
});

test('drawTown runs against a stub context', () => {
    const ctx = new Proxy({}, { get: (t, k) => (k === 'imageSmoothingEnabled' ? false : () => undefined), set: () => true });
    const canvas = { getContext: () => ctx };
    const layout = layoutTown(world, { seed: 1 });
    assert.doesNotThrow(() => drawTown(canvas, layout, world, { open: { l0: 'locked', l1: 'closed' }, hover: 'l2', at: 'l0', slot: 'night', people: { l1: [{ name: 'A' }] } }));
});
