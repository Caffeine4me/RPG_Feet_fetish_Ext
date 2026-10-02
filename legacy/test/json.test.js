import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, repair, slug } from '../src/json.js';

test('reads fenced, chatty and truncated JSON', () => {
    assert.deepEqual(extractJson('Sure!\n```json\n{"a": 1, "b": [1,2,]}\n```'), { a: 1, b: [1, 2] });
    assert.deepEqual(extractJson('Here you go: {"a": {"b": "c"}} hope that helps'), { a: { b: 'c' } });
    assert.deepEqual(extractJson('{"name": "Mia", "list": [1, 2, {"x": "cut off he'), { name: 'Mia', list: [1, 2, { x: 'cut off he' }] });
    assert.equal(extractJson('no json here'), null);
});

test('repair closes brackets and drops trailing commas', () => {
    assert.equal(repair('{"a": [1, 2,'), '{"a": [1, 2]}');
});

test('slug', () => {
    assert.equal(slug('Suds & Socks!'), 'suds_socks');
    assert.equal(slug('  Élodie Café '), 'elodie_cafe');
});
