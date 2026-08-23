import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { readJsonLines, writeJsonLines } from '../src/core/jsonl.mjs';
import { validateTranslationWorkspace } from '../src/core/segments.mjs';
import { readJson, withDemo, writeJson } from './helpers.mjs';

test('a changed source marks the old translation stale instead of shipping it', () => withDemo(
  ({ project, adapter, jsonl, sourceFile }) => {
    adapter.extract(project);
    adapter.export(project);

    const document = readJson(sourceFile);
    document.scenes[1].text = 'The gate is permanently sealed. Do not approach.';
    writeJson(sourceFile, document);
    adapter.extract(project);

    assert.equal(adapter.export(project).stale, 1);
    const row = readJsonLines(jsonl)[1];
    assert.equal(row.status, 'stale');
    assert.equal(row.target, '문은 09:00에 열립니다.', 'the old translation is kept for revision');
    assert.equal(row.previousSource, 'The gate opens at 09:00.');
    assert.throws(() => adapter.apply(project), /stale segments must be retranslated/);
  },
));

test('a source entry that disappears keeps its translation as orphaned', () => withDemo(
  ({ project, adapter, jsonl, sourceFile }) => {
    adapter.extract(project);
    adapter.export(project);

    const document = readJson(sourceFile);
    const removed = document.scenes.pop();
    writeJson(sourceFile, document);
    adapter.extract(project);

    assert.equal(adapter.export(project).orphaned, 1);
    const orphan = readJsonLines(jsonl).find((row) => row.id === 'dialogue:gate');
    assert.equal(orphan.status, 'orphaned');
    assert.equal(orphan.target, '문은 09:00에 열립니다.');

    assert.equal(orphan.previousStatus, 'reviewed', 'the pre-orphan status is remembered');

    // Restoring the entry upstream must restore a translation that actually applies —
    // asserting only on `target` would pass while the row stayed permanently skipped.
    document.scenes.push(removed);
    writeJson(sourceFile, document);
    adapter.extract(project);
    adapter.export(project);
    const restored = readJsonLines(jsonl).find((row) => row.id === 'dialogue:gate');
    assert.equal(restored.target, '문은 09:00에 열립니다.');
    assert.equal(restored.status, 'reviewed');
    assert.equal(restored.previousStatus, undefined);
    assert.deepEqual(adapter.apply(project), { applied: 2, skipped: 0 });
  },
));

test('re-export preserves provenance and adapter notes', () => withDemo(({ project, adapter, jsonl }) => {
  adapter.extract(project);
  adapter.export(project);

  const rows = readJsonLines(jsonl);
  rows[0].translatedBy = 'agent-a';
  rows[0].reviewedBy = 'human-b';
  rows[0].note = '캐릭터 말투 주의';
  writeJsonLines(jsonl, rows);

  adapter.export(project);
  const row = readJsonLines(jsonl)[0];
  assert.equal(row.translatedBy, 'agent-a');
  assert.equal(row.reviewedBy, 'human-b');
  assert.equal(row.note, '캐릭터 말투 주의');
}));

test('deleting protectedTokens cannot bypass the placeholder gate', () => withDemo(
  ({ project, adapter, jsonl }) => {
    adapter.extract(project);
    adapter.export(project);

    const rows = readJsonLines(jsonl);
    delete rows[0].protectedTokens;
    rows[0].target = '어서 오세요!';
    writeJsonLines(jsonl, rows);

    // apply recomputes tokens from the extracted source rather than trusting the workspace.
    assert.throws(() => adapter.apply(project), /missing protected token/);
  },
));

test('blocked and draft targets never reach a build', () => withDemo(({ project, adapter, jsonl, builtFile }) => {
  adapter.extract(project);
  adapter.export(project);

  const rows = readJsonLines(jsonl);
  rows[0].target = '{player}님, 확신 없음';
  rows[0].status = 'blocked';
  rows[1].target = '초벌 번역입니다';
  rows[1].status = 'draft';
  writeJsonLines(jsonl, rows);

  assert.deepEqual(adapter.apply(project), { applied: 0, skipped: 2 });
  adapter.build(project);
  const built = readJson(builtFile);
  assert.equal(built.scenes[0].text, 'Welcome, {player}!');
  assert.equal(built.scenes[1].text, 'The gate opens at 09:00.');
}));

test('a missing translation workspace fails validation instead of reading as clean', () => withDemo(
  ({ project, adapter }) => {
    fs.rmSync(project.paths.translations, { recursive: true, force: true });
    adapter.extract(project);

    const validation = validateTranslationWorkspace(project.paths.translations);
    assert.match(validation.errors[0], /translation workspace not found/);
    assert.throws(() => adapter.apply(project), /translation file not found/);
  },
));

test('a build cannot pass verification with stale applied resources', () => withDemo(
  ({ project, adapter, builtFile }) => {
    adapter.extract(project);
    adapter.export(project);
    adapter.apply(project);
    adapter.build(project);

    const built = readJson(builtFile);
    built.scenes[0].text = 'an artifact from an earlier run';
    writeJson(builtFile, built);

    assert.throws(() => adapter.verify(project), /build output does not match the current sources/);
  },
));

test('build refuses to run before apply', () => withDemo(({ project, adapter }) => {
  adapter.extract(project);
  adapter.export(project);
  assert.throws(() => adapter.build(project), /run apply first/);
}));

test('duplicate segment ids are reported, not silently collapsed', () => withDemo(
  ({ project, adapter, jsonl }) => {
    adapter.extract(project);
    adapter.export(project);

    const rows = readJsonLines(jsonl);
    writeJsonLines(jsonl, [...rows, rows[0]]);

    const validation = validateTranslationWorkspace(project.paths.translations);
    assert.ok(validation.errors.some((error) => /duplicate id/.test(error)));
    assert.throws(() => adapter.apply(project), /duplicate id/);
  },
));

test('an adapter file path cannot escape its configured directory', () => withDemo(({ project, adapter }) => {
  project.config.adapterConfig.files[0].path = '../../escaped.json';
  assert.throws(() => adapter.extract(project), /path escapes its configured directory/);
}));

test('apply writes nothing when a later file fails', () => withDemo(({ project, adapter, sourceFile }) => {
  // A second file whose translation will be missing, so apply fails after the first succeeds.
  const secondSource = path.join(project.paths.source, 'signs.json');
  writeJson(secondSource, { scenes: [{ id: 'gate', text: 'Keep out.' }] });
  project.config.adapterConfig.files.push({
    id: 'signs',
    path: 'signs.json',
    translation: 'signs.jsonl',
    root: 'scenes',
  });

  adapter.extract(project);
  adapter.export(project);
  // Corrupt only the second file's workspace so the first file applies cleanly first.
  fs.rmSync(path.join(project.paths.translations, 'signs.jsonl'));

  assert.throws(() => adapter.apply(project), /translation file not found/);
  assert.equal(
    fs.existsSync(path.join(project.paths.work, 'patched', 'dialogue.json')),
    false,
    'the first file must not be left patched when a later one fails',
  );
  assert.ok(fs.existsSync(sourceFile));
}));

test('a repeated export keeps the stale marker and its previous source', () => withDemo(
  ({ project, adapter, jsonl, sourceFile }) => {
    adapter.extract(project);
    adapter.export(project);

    const document = readJson(sourceFile);
    document.scenes[1].text = 'The gate is sealed.';
    writeJson(sourceFile, document);
    adapter.extract(project);
    adapter.export(project);

    // The second export sees a hash that already matches; the marker must survive anyway.
    adapter.export(project);
    const row = readJsonLines(jsonl)[1];
    assert.equal(row.status, 'stale');
    assert.equal(row.previousSource, 'The gate opens at 09:00.');
    assert.equal(adapter.export(project).stale, 1);
  },
));

test('a stale segment blocks build and verify, not only apply', () => withDemo(
  ({ project, adapter, sourceFile }) => {
    adapter.extract(project);
    adapter.export(project);
    adapter.apply(project);
    adapter.build(project);

    const document = readJson(sourceFile);
    document.scenes[1].text = 'The gate is sealed forever.';
    writeJson(sourceFile, document);
    adapter.extract(project);
    adapter.export(project);

    // The build output from the earlier run is still on disk and still parses.
    for (const stage of ['apply', 'build', 'verify']) {
      assert.throws(() => adapter[stage](project), /stale segments must be retranslated/, `${stage} must refuse`);
    }
  },
));

test('a deleted workspace row fails instead of silently shipping the source text', () => withDemo(
  ({ project, adapter, jsonl }) => {
    adapter.extract(project);
    adapter.export(project);

    writeJsonLines(jsonl, [readJsonLines(jsonl)[0]]);
    assert.throws(() => adapter.apply(project), /no workspace segment; run export/);
  },
));

test('a source edited without re-exporting fails instead of applying a mismatched row', () => withDemo(
  ({ project, adapter, sourceFile }) => {
    adapter.extract(project);
    adapter.export(project);

    const document = readJson(sourceFile);
    document.scenes[1].text = 'The gate opens at 10:00.';
    writeJson(sourceFile, document);
    adapter.extract(project);

    assert.throws(() => adapter.apply(project), /source hash mismatch; run export/);
  },
));

test('a build made from outdated applied resources is rejected', () => withDemo(
  ({ project, adapter, jsonl }) => {
    adapter.extract(project);
    adapter.export(project);
    adapter.apply(project);

    // A translation lands after apply ran; the patched artifact is now behind.
    const rows = readJsonLines(jsonl);
    rows[1].target = '문은 오전 9시에 열립니다.';
    writeJsonLines(jsonl, rows);

    assert.throws(() => adapter.build(project), /applied resources are out of date/);
  },
));

test('skipped counts every segment that did not reach the build', () => withDemo(
  ({ project, adapter, jsonl }) => {
    adapter.extract(project);
    adapter.export(project);

    const rows = readJsonLines(jsonl);
    rows[0].target = '';
    rows[0].status = 'untranslated';
    writeJsonLines(jsonl, rows);

    assert.deepEqual(adapter.apply(project), { applied: 1, skipped: 1 });
  },
));

test('a target that invents a placeholder is rejected', () => withDemo(({ project, adapter, jsonl }) => {
  adapter.extract(project);
  adapter.export(project);

  const rows = readJsonLines(jsonl);
  rows[1].target = '{player}님, 문은 09:00에 열립니다.';
  writeJsonLines(jsonl, rows);

  const validation = validateTranslationWorkspace(project.paths.translations);
  assert.ok(validation.errors.some((error) => /adds protected token \{player\}/.test(error)));
  assert.throws(() => adapter.apply(project), /adds protected token/);
}));

test('repeated source changes keep the source the translation was made from', () => withDemo(
  ({ project, adapter, jsonl, sourceFile }) => {
    const setText = (text) => {
      const document = readJson(sourceFile);
      document.scenes[1].text = text;
      writeJson(sourceFile, document);
      adapter.extract(project);
      adapter.export(project);
    };

    adapter.extract(project);
    adapter.export(project);
    const original = readJsonLines(jsonl)[1].source;

    setText('B: the gate is closed.');
    assert.equal(readJsonLines(jsonl)[1].previousSource, original);

    // A second change before retranslation must not re-anchor to the intermediate revision:
    // the target still translates the original text.
    setText('C: the gate is sealed.');
    const row = readJsonLines(jsonl)[1];
    assert.equal(row.status, 'stale');
    assert.equal(row.previousSource, original);
    assert.equal(row.target, '문은 09:00에 열립니다.');
  },
));

test('a failed multi-file build leaves no mixed-generation output', () => withDemo(
  ({ project, adapter, jsonl, builtFile }) => {
    const signsSource = path.join(project.paths.source, 'signs.json');
    const signsJsonl = path.join(project.paths.translations, 'signs.jsonl');
    writeJson(signsSource, { scenes: [{ id: 'a', text: 'Keep out.' }] });
    project.config.adapterConfig.files.push({
      id: 'signs', path: 'signs.json', translation: 'signs.jsonl', root: 'scenes',
    });

    adapter.extract(project);
    adapter.export(project);
    const signs = readJsonLines(signsJsonl);
    signs[0].target = '출입 금지';
    signs[0].status = 'reviewed';
    writeJsonLines(signsJsonl, signs);
    adapter.apply(project);
    adapter.build(project);

    // The first file is applied cleanly; only the second drifts after apply ran.
    const rows = readJsonLines(jsonl);
    rows[0].target = '{player}님, 반갑습니다!';
    writeJsonLines(jsonl, rows);
    adapter.apply(project);
    signs[0].target = '접근 금지';
    writeJsonLines(signsJsonl, signs);

    assert.throws(() => adapter.build(project), /applied resources are out of date/);
    assert.equal(
      readJson(builtFile).scenes[0].text,
      '{player}님, 어서 오세요!',
      'the first output must still hold the previous generation',
    );
    assert.equal(readJson(path.join(project.paths.output, 'signs.json')).scenes[0].text, '출입 금지');
  },
));

test('a non-string target cannot reach a build', () => withDemo(({ project, adapter, jsonl }) => {
  adapter.extract(project);
  adapter.export(project);

  // Truthy but not a string: it carries no protected tokens, so a token check alone passes.
  const rows = readJsonLines(jsonl);
  rows[1].target = 42;
  rows[1].status = 'reviewed';
  writeJsonLines(jsonl, rows);

  for (const stage of ['apply', 'build', 'verify']) {
    assert.throws(() => adapter[stage](project), /target must be a string/, `${stage} must refuse`);
  }
}));

test('applied and skipped account for every segment in the workspace', () => withDemo(
  ({ project, adapter, jsonl, sourceFile }) => {
    adapter.extract(project);
    adapter.export(project);
    const rows = readJsonLines(jsonl);
    rows[0].target = '{player}님, 어서 오세요!';
    rows[1].target = '문은 09:00에 열립니다.';
    rows.forEach((row) => { row.status = 'reviewed'; });
    writeJsonLines(jsonl, rows);

    const document = readJson(sourceFile);
    document.scenes.pop();
    writeJson(sourceFile, document);
    adapter.extract(project);

    const exported = adapter.export(project);
    const result = adapter.apply(project);
    assert.equal(exported.orphaned, 1);
    assert.equal(result.applied + result.skipped, exported.segments, 'the counts must reconcile');
  },
));

test('a duplicate id introduced after export cannot reuse one workspace row', () => withDemo(
  ({ project, adapter, sourceFile }) => {
    adapter.extract(project);
    adapter.export(project);

    // Same id and same text as an existing entry, so the hash check alone would pass and
    // one reviewed translation would be applied to two different entries.
    const document = readJson(sourceFile);
    document.scenes.push({ id: 'intro', speaker: 'Echo', text: 'Welcome, {player}!', ja: 'ようこそ、{player}！' });
    writeJson(sourceFile, document);
    adapter.extract(project);

    for (const stage of ['apply', 'build', 'verify']) {
      assert.throws(() => adapter[stage](project), /duplicate segment id in the extracted resources/, stage);
    }
  },
));
