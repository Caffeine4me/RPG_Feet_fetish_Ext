import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorsFromSheet, shade } from '../src/pixelsprite.js';

test('colours come from the look, shoes and socks', () => {
    const c = colorsFromSheet({ look: 'tall, tanned skin, long blonde hair in a ponytail, white tennis dress', shoes: 'white platform sneakers', socks: 'pink ankle socks' });
    assert.equal(c.hair, '#e8c56a');
    assert.equal(c.skin, '#d8a97a');
    assert.equal(c.top, '#f2f2f2');
    assert.equal(c.socks, '#f08ac0');
    assert.ok(c.long && c.skirt);
    const d = colorsFromSheet({ look: 'short black bob, pale, green hoodie and black jeans', shoes: 'cowgirl boots', socks: 'grey socks with holes' });
    assert.equal(d.hair, '#1a1a22');
    assert.equal(d.top, '#3f8a3f');
    assert.equal(d.bottom, '#1a1a22');
    assert.equal(d.shoes, '#2a2020');
    assert.ok(!d.long && !d.skirt);
    assert.equal(shade('#ffffff', 0.5), '#808080');
});
