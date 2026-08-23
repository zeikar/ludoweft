import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  extractProtectedTokens,
  validateSegment,
  validateTranslationWorkspace,
} from '../src/core/segments.mjs';
import { withDemo } from './helpers.mjs';

test('a non-object JSONL line reports an error instead of crashing', () => withDemo(({ project, jsonl }) => {
  fs.writeFileSync(jsonl, 'null\n', 'utf8');
  const validation = validateTranslationWorkspace(project.paths.translations);
  assert.match(validation.errors[0], /must be an object/);
}));

test('validation rejects a forged source hash', () => {
  const errors = validateSegment({ id: 'x', source: 'hello', target: '안녕', sourceHash: 'not-a-real-hash' });
  assert.ok(errors.some((error) => /sourceHash must be 64 lowercase hex/.test(error)));
});

test('validation rejects a hash that does not match its own source', () => {
  const errors = validateSegment({ id: 'x', source: 'hello', target: '안녕', sourceHash: 'a'.repeat(64) });
  assert.ok(errors.some((error) => /does not match source and reference/.test(error)));
});

test('validation counts placeholder occurrences, not mere presence', () => {
  const errors = validateSegment({
    id: 'x',
    source: '{p} vs {p}',
    target: '{p} 대결',
    sourceHash: 'a'.repeat(64),
    protectedTokens: ['{p}'],
  });
  assert.ok(errors.some((error) => /protected token \{p\} 1 times but source has 2/.test(error)));
});

test('nested placeholders are extracted once, not split into two tokens', () => {
  assert.deepEqual(extractProtectedTokens('{{name}} 님'), ['{{name}}']);
  assert.deepEqual(extractProtectedTokens('{{a}} and {b}'), ['{b}', '{{a}}']);
});
