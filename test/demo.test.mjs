import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { readJsonLines, writeJsonLines } from '../src/core/jsonl.mjs';
import { validateTranslationWorkspace } from '../src/core/segments.mjs';
import { withDemo } from './helpers.mjs';

test('synthetic adapter completes a translated round trip', () => withDemo(({ project, adapter }) => {
  assert.deepEqual(adapter.extract(project), { extracted: 1 });
  assert.equal(adapter.export(project).segments, 2);
  const validation = validateTranslationWorkspace(project.paths.translations);
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.translated, 2);
  assert.deepEqual(adapter.apply(project), { applied: 2, skipped: 0 });
  adapter.build(project);
  assert.deepEqual(adapter.verify(project), { verified: 1, checked: 2 });

  const built = JSON.parse(fs.readFileSync(path.join(project.paths.output, 'dialogue.json'), 'utf8'));
  assert.equal(built.scenes[0].text, '{player}님, 어서 오세요!');
  assert.equal(built.scenes[1].text, '문은 09:00에 열립니다.');
}));

test('adapter refuses a translation that drops a protected token', () => withDemo(({ project, adapter, jsonl }) => {
  adapter.extract(project);
  adapter.export(project);

  const rows = readJsonLines(jsonl);
  rows[0].target = '어서 오세요!';
  writeJsonLines(jsonl, rows);

  assert.throws(() => adapter.apply(project), /missing protected token/);
}));
