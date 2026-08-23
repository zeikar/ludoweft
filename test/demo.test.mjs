import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadAdapter } from '../src/core/load-adapter.mjs';
import { readJsonLines, writeJsonLines } from '../src/core/jsonl.mjs';
import { readProject, redactProject } from '../src/core/project.mjs';
import { validateTranslationWorkspace } from '../src/core/segments.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.resolve(here, '../examples/demo');

function withDemo(run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ludoweft-test-'));
  const projectRoot = path.join(tempRoot, 'demo');
  fs.cpSync(fixture, projectRoot, { recursive: true });
  try {
    return run(projectRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

test('synthetic adapter completes a translated round trip', () => withDemo((projectRoot) => {
  const project = readProject(path.join(projectRoot, 'ludoweft.project.json'));
  const adapter = loadAdapter(project.config.adapter);

  assert.deepEqual(adapter.extract(project), { extracted: 1 });
  assert.equal(adapter.export(project).segments, 2);
  const validation = validateTranslationWorkspace(project.paths.translations);
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.translated, 2);
  assert.equal(adapter.apply(project).applied, 2);
  adapter.build(project);
  assert.deepEqual(adapter.verify(project), { verified: 1 });

  const built = JSON.parse(fs.readFileSync(path.join(project.paths.output, 'dialogue.json'), 'utf8'));
  assert.equal(built.scenes[0].text, '{player}님, 어서 오세요!');
  assert.equal(built.scenes[1].text, '문은 09:00에 열립니다.');
}));

test('adapter refuses a translation that drops a protected token', () => withDemo((projectRoot) => {
  const project = readProject(path.join(projectRoot, 'ludoweft.project.json'));
  const adapter = loadAdapter(project.config.adapter);
  adapter.extract(project);
  adapter.export(project);

  const translationFile = path.join(project.paths.translations, 'dialogue.jsonl');
  const rows = readJsonLines(translationFile);
  rows[0].target = '어서 오세요!';
  writeJsonLines(translationFile, rows);

  assert.throws(() => adapter.apply(project), /missing protected token/);
}));

test('project inspection redacts secrets', () => {
  const redacted = redactProject({ archiveKey: 'secret', nested: { apiToken: 'token', ordinary: 'ok' } });
  assert.equal(redacted.archiveKey, '<redacted>');
  assert.equal(redacted.nested.apiToken, '<redacted>');
  assert.equal(redacted.nested.ordinary, 'ok');
});
