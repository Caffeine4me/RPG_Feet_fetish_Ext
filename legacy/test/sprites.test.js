import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSheet } from '../src/sheet.js';
import { backgroundPrompt, borderColor, cellRects, feetCardPrompt, keyOut, opaqueBounds, spriteSheetPrompt } from '../src/sprites.js';
import { pictureRequest, readPicture, readModels, sizeFor } from '../src/picture.js';

test('prompts carry the sheet and the style', () => {
    const s = normalizeSheet({ name: 'Ada', look: 'red hair, green hoodie', shoes: 'cowgirl boots', socks: 'black socks with holes', dials: { dirty: 8, sweaty: 8 } });
    const p = spriteSheetPrompt(s, { reference: true });
    assert.match(p, /3 columns and 2 rows/);
    assert.match(p, /neutral.*smug.*annoyed.*laughing.*bored.*disgusted/);
    assert.match(p, /red hair/);
    assert.match(p, /attached image/);
    assert.match(feetCardPrompt(s), /grimy.*glistening/);
    assert.match(backgroundPrompt({ name: 'Gym', type: 'gym', interior: 'mats and racks' }, { slot: 'night' }), /no people.*mats and racks.*night/s);
});

test('cells, keying and bounds', () => {
    assert.deepEqual(cellRects(300, 200, 3, 2)[4], { x: 100, y: 100, w: 100, h: 100 });
    const w = 4, h = 4;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) { data[i * 4] = 250; data[i * 4 + 1] = 5; data[i * 4 + 2] = 250; data[i * 4 + 3] = 255; }
    // one dark pixel in the middle
    const mid = (1 * w + 2) * 4; data[mid] = 10; data[mid + 1] = 10; data[mid + 2] = 10;
    const key = keyOut(data, w, h);
    assert.deepEqual(key, { r: 250, g: 5, b: 250 });
    assert.equal(data[mid + 3], 255);
    assert.equal(data[3], 0);
    assert.deepEqual(opaqueBounds(data, w, h), { x: 2, y: 1, w: 1, h: 1 });
    assert.deepEqual(borderColor(data, w, h), { r: 250, g: 5, b: 250 });
});

test('picture requests and replies', () => {
    const g = pictureRequest('gemini', { prompt: 'p', model: 'm', aspect: '3:2', images: ['data:image/png;base64,AAAA'] });
    assert.equal(g.body.chat_completion_source, 'makersuite');
    assert.equal(g.body.messages[0].content.length, 2);
    assert.deepEqual(sizeFor('16:9', 1024), { width: 1024, height: 576 });
    assert.deepEqual(readPicture({ responseContent: { parts: [{ text: 'hi' }, { inlineData: { data: 'iVBORxyz', mimeType: 'image/png' } }] } }), { data: 'iVBORxyz', format: 'png' });
    assert.deepEqual(readPicture({ choices: [{ message: { content: 'nope' } }] }), { text: 'nope' });
    assert.deepEqual(readModels('gemini', { data: [{ id: 'models/gemini-2.5-flash-image' }, { id: 'models/gemini-pro' }] }), [{ id: 'gemini-2.5-flash-image', name: 'gemini-2.5-flash-image' }]);
});
