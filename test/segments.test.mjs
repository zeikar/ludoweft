import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  compareProtectedTokens,
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

test('escaped controls preserve the exact backslash run length', () => {
  const doubled = String.fromCharCode(92, 92, 110);
  const single = String.fromCharCode(92, 110);
  assert.deepEqual(extractProtectedTokens(doubled), [doubled]);
  assert.ok(compareProtectedTokens(doubled, single)
    .some((error) => /missing protected token/.test(error)));
  assert.ok(compareProtectedTokens(doubled, single)
    .some((error) => /adds protected token/.test(error)));
});

test('protected tokens may be derived from the reference slot', () => {
  const errors = validateSegment({
    id: 'x',
    source: 'plain source',
    reference: 'Reference {name}',
    target: '번역 {name}',
    sourceHash: 'a'.repeat(64),
    protectedTokenSource: 'reference',
    protectedTokens: ['{name}'],
  });
  assert.ok(errors.some((error) => /sourceHash does not match/.test(error)));
  assert.ok(!errors.some((error) => /protectedTokens/.test(error)));
  assert.ok(!errors.some((error) => /missing protected token/.test(error)));
});

test('reference-derived protected tokens cannot be bypassed with source tokens', () => {
  const source = '원문';
  const reference = 'Reference {name}\\ncontinued';
  const errors = validateSegment({
    id: 'x',
    source,
    reference,
    target: '번역',
    sourceHash: 'a'.repeat(64),
    protectedTokenSource: 'reference',
    protectedTokens: ['{name}', '\\n'],
  });
  assert.ok(errors.some((error) => /missing protected token \{name\}/.test(error)));
  assert.ok(errors.some((error) => error.includes('missing protected token \\n')));
});

test('the MAGES token profile protects single-percent control codes', () => {
  const source = '表示%p';
  const reference = '%CContinue%p';
  const row = {
    id: 'x',
    source,
    reference,
    target: '%C계속%p',
    sourceHash: 'a'.repeat(64),
    protectedTokenSource: 'reference',
    protectedTokenProfile: 'mages',
    protectedTokens: ['%C', '%p'],
  };
  const validErrors = validateSegment(row);
  assert.ok(validErrors.some((error) => /sourceHash does not match/.test(error)));
  assert.ok(!validErrors.some((error) => /protected token|protectedTokens/.test(error)));

  assert.ok(validateSegment({ ...row, target: '계속%p' })
    .some((error) => /missing protected token %C/.test(error)));
  assert.ok(validateSegment({ ...row, protectedTokenProfile: 'default' })
    .some((error) => /protectedTokens does not match/.test(error)));
});

test('the MAGES token profile keeps escaped double-percent controls distinct', () => {
  const row = {
    id: 'x',
    source: 'plain',
    reference: '%%CContinue%p',
    target: '%%C계속%p',
    sourceHash: 'a'.repeat(64),
    protectedTokenSource: 'reference',
    protectedTokenProfile: 'mages',
    protectedTokens: ['%%C', '%p'],
  };
  const validErrors = validateSegment(row);
  assert.ok(!validErrors.some((error) => /protected token|protectedTokens/.test(error)));
  assert.ok(validateSegment({ ...row, target: '%C계속%p' })
    .some((error) => /missing protected token %%C/.test(error)));
});

test('a MAGES scenario tag protects its structure and leaves its display text translatable', () => {
  const reference = '"What!? <tips,1,The Organization> is already moving?"';
  assert.deepEqual(extractProtectedTokens(reference, 'mages'), ['<tips,1,']);
  // a tag that carries no localized field is still claimed whole
  assert.deepEqual(extractProtectedTokens('<br> and <i>x</i>', 'mages'), ['</i>', '<br>', '<i>']);
  // the default profile keeps its previous behaviour
  assert.deepEqual(extractProtectedTokens(reference, 'default'), ['<tips,1,The Organization>']);

  assert.deepEqual(
    compareProtectedTokens(reference, '"뭐라고!? <tips,1,기관>이 벌써 움직이고 있다고?"', 'mages'),
    [],
  );
  assert.ok(compareProtectedTokens(reference, '"뭐라고!? 기관이 벌써 움직이고 있다고?"', 'mages')
    .some((error) => /missing protected token <tips,1,/.test(error)));
});
