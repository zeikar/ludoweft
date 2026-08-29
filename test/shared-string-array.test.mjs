import assert from 'node:assert/strict';
import test from 'node:test';
import { sharedStringArrayHandler as handler } from '../src/adapters/freemote/handlers/shared-string-array.mjs';

const ctx = (over = {}) => ({ archive: 'config', file: 'names.psb.m.json', resource: {}, ...over });

test('emits one segment per string, with source doubling as reference', () => {
  const doc = ['？？？', '倫太郎', '至'];
  const segments = handler.segments(doc, ctx());
  assert.equal(segments.length, 3);
  assert.equal(segments[1].id, 'names.psb.m.json:/1');
  assert.equal(segments[1].source, '倫太郎');
  assert.equal(segments[1].reference, '倫太郎');
  assert.equal(segments[1].protectedTokenSource, 'source');
});

test('writes back into the array it read', () => {
  const doc = ['？？？', '倫太郎'];
  const segments = handler.segments(doc, ctx());
  segments[1].write('오카베');
  assert.deepEqual(doc, ['？？？', '오카베']);
});

test('skips empty strings and non-strings', () => {
  const doc = ['名前', '', 7, null, '至'];
  const segments = handler.segments(doc, ctx());
  assert.deepEqual(segments.map((s) => s.source), ['名前', '至']);
  assert.deepEqual(segments.map((s) => s.context.pointer), ['/0', '/4']);
});

test('follows a pointer to a nested array', () => {
  const doc = { table: { names: ['가', '나'] } };
  const segments = handler.segments(doc, ctx({ resource: { pointer: '/table/names' } }));
  assert.equal(segments.length, 2);
  assert.equal(segments[0].id, 'names.psb.m.json:/table/names/0');
  segments[0].write('다');
  assert.equal(doc.table.names[0], '다');
});

test('rejects a pointer that is not an array', () => {
  assert.throws(() => handler.segments({ table: 'x' }, ctx({ resource: { pointer: '/table' } })), /not an array/);
});

test('rejects a pointer that does not resolve', () => {
  assert.throws(() => handler.segments({}, ctx({ resource: { pointer: '/missing' } })), /not found/);
});

test('names the translation file after the resource', () => {
  assert.equal(handler.translationName([], ctx({ resource: { jsonSuffix: '.psb.m.json' } })), 'names.jsonl');
  assert.equal(handler.rawName([], ctx({ resource: { jsonSuffix: '.psb.m.json' } })), 'names');
});
