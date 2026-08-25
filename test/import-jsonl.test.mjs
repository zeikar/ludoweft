import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { hashSource } from '../src/core/hash.mjs';
import { importLegacyJsonl, JA_EN_KO_V1 } from '../src/core/import-jsonl.mjs';

function withTemp(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ludoweft-import-test-'));
  try {
    return run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function legacyRow(overrides = {}) {
  const row = {
    id: 'scene#0',
    file: 'scene.dat',
    scene: 0,
    text: 0,
    ja: 'source text',
    en: 'reference text',
    ko: '',
    ...overrides,
  };
  row.sourceHash ??= hashSource(row.ja, row.en);
  return row;
}

function writeJsonl(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
}

function readJsonl(file) {
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

test('imports ja-en-ko v1 while preserving relative layout and structural context', () => withTemp((root) => {
  const input = path.join(root, 'legacy');
  const output = path.join(root, 'translations');
  writeJsonl(path.join(input, 'scenario', 'chapter.jsonl'), [
    legacyRow(),
    legacyRow({ id: 'scene#1', scene: 1, text: 2, ko: 'translated text' }),
  ]);
  writeJsonl(path.join(input, 'config', 'menu.jsonl'), [
    legacyRow({
      id: 'menu:/title',
      file: 'menu.dat',
      pointer: '/title',
      scene: undefined,
      text: undefined,
    }),
  ]);

  const result = importLegacyJsonl({ input, output, format: JA_EN_KO_V1 });

  assert.deepEqual(result, {
    format: 'ja-en-ko-v1',
    dryRun: false,
    files: 2,
    segments: 3,
    draft: 1,
    untranslated: 2,
    outputFiles: ['config/menu.jsonl', 'scenario/chapter.jsonl'],
  });
  const scenario = readJsonl(path.join(output, 'scenario', 'chapter.jsonl'));
  assert.deepEqual(scenario[0], {
    id: 'scene#0',
    source: 'source text',
    reference: 'reference text',
    target: '',
    sourceHash: hashSource('source text', 'reference text'),
    status: 'untranslated',
    context: { legacy: { file: 'scene.dat', scene: 0, text: 0 } },
  });
  assert.equal(scenario[1].status, 'draft');
  assert.notEqual(scenario[1].status, 'reviewed');
  assert.deepEqual(readJsonl(path.join(output, 'config', 'menu.jsonl'))[0].context, {
    legacy: { file: 'menu.dat', pointer: '/title' },
  });
}));

test('dry run fully checks input without writing output or staging files', () => withTemp((root) => {
  const input = path.join(root, 'legacy');
  const output = path.join(root, 'new-parent', 'translations');
  writeJsonl(path.join(input, 'one.jsonl'), [legacyRow()]);

  const before = fs.readdirSync(root).sort();
  const result = importLegacyJsonl({ input, output, dryRun: true });

  assert.equal(result.dryRun, true);
  assert.deepEqual(fs.readdirSync(root).sort(), before);
  assert.equal(fs.existsSync(path.dirname(output)), false);
}));

test('rejects a source hash mismatch without creating output', () => withTemp((root) => {
  const input = path.join(root, 'legacy');
  const output = path.join(root, 'translations');
  writeJsonl(path.join(input, 'one.jsonl'), [legacyRow({ sourceHash: '0'.repeat(64) })]);

  assert.throws(() => importLegacyJsonl({ input, output }), /sourceHash does not match ja and en/);
  assert.equal(fs.existsSync(output), false);
}));

test('rejects duplicate ids across files', () => withTemp((root) => {
  const input = path.join(root, 'legacy');
  const output = path.join(root, 'translations');
  writeJsonl(path.join(input, 'a.jsonl'), [legacyRow()]);
  writeJsonl(path.join(input, 'nested', 'b.jsonl'), [legacyRow()]);

  assert.throws(() => importLegacyJsonl({ input, output }), /duplicate id also found at a\.jsonl:1/);
  assert.equal(fs.existsSync(output), false);
}));

test('rejects malformed legacy rows and unsupported formats', () => withTemp((root) => {
  const input = path.join(root, 'legacy');
  const output = path.join(root, 'translations');
  writeJsonl(path.join(input, 'one.jsonl'), [{ ...legacyRow(), ko: 7 }]);

  assert.throws(() => importLegacyJsonl({ input, output }), /ko must be a string/);
  assert.throws(
    () => importLegacyJsonl({ input, output, format: 'unknown-v1' }),
    /unsupported import format/,
  );
}));

test('rejects invalid JSON without leaving an output tree', () => withTemp((root) => {
  const input = path.join(root, 'legacy');
  const output = path.join(root, 'translations');
  fs.mkdirSync(input);
  fs.writeFileSync(path.join(input, 'broken.jsonl'), '{broken\n', 'utf8');

  assert.throws(() => importLegacyJsonl({ input, output }), /broken\.jsonl:1: invalid JSON/);
  assert.equal(fs.existsSync(output), false);
}));

test('rejects same, nested, and pre-existing output directories', () => withTemp((root) => {
  const input = path.join(root, 'legacy');
  writeJsonl(path.join(input, 'one.jsonl'), [legacyRow()]);

  assert.throws(() => importLegacyJsonl({ input, output: input }), /separate, non-nested/);
  assert.throws(() => importLegacyJsonl({ input, output: path.join(input, 'converted') }), /separate, non-nested/);
  assert.throws(() => importLegacyJsonl({ input, output: root }), /separate, non-nested/);

  const existing = path.join(root, 'existing');
  fs.mkdirSync(existing);
  assert.throws(() => importLegacyJsonl({ input, output: existing }), /output already exists/);
}));

test('returns only relative file names and aggregate counts', () => withTemp((root) => {
  const input = path.join(root, 'legacy');
  const output = path.join(root, 'translations');
  const secret = crypto.randomBytes(12).toString('hex');
  writeJsonl(path.join(input, 'nested', 'one.jsonl'), [legacyRow({ ja: secret })]);

  const result = importLegacyJsonl({ input, output, dryRun: true });
  const serialized = JSON.stringify(result);
  assert.deepEqual(result.outputFiles, ['nested/one.jsonl']);
  assert.equal(serialized.includes(root), false);
  assert.equal(serialized.includes(secret), false);
}));
