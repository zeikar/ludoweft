import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { main } from '../src/cli.mjs';
import { deriveProjectId, initializeProject } from '../src/core/init-project.mjs';

function withTempDirectory(run, name = 'ludoweft-init-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), name));
  return Promise.resolve()
    .then(() => run(root))
    .finally(() => fs.rmSync(root, { recursive: true, force: true }));
}

async function captureOutput(argv, cwd) {
  const original = console.log;
  const lines = [];
  console.log = (value) => lines.push(String(value));
  try {
    await main(argv, cwd);
  } finally {
    console.log = original;
  }
  return lines.join('\n');
}

test('init creates a deterministic manifest and reports a useful summary', () => withTempDirectory(
  async (tempRoot) => {
    const projectRoot = path.join(tempRoot, 'Clockwork-Cafe');
    const projectFile = path.join(projectRoot, 'ludoweft.project.json');
    const output = JSON.parse(await captureOutput([
      'init',
      '--project', projectFile,
      '--adapter', 'demo-json',
      '--source-language', 'ja',
      '--reference-language', 'en',
      '--target-language', 'ko',
      '--json',
    ], tempRoot));

    assert.deepEqual(JSON.parse(fs.readFileSync(projectFile, 'utf8')), {
      schemaVersion: 1,
      id: 'clockwork-cafe',
      adapter: 'demo-json',
      languages: { source: 'ja', reference: 'en', target: 'ko' },
      paths: {
        source: './game-data',
        work: './.ludoweft/work',
        translations: './translations',
        output: './dist',
      },
      localConfig: './ludoweft.local.json',
    });
    assert.equal(output.created, true);
    assert.equal(output.overwritten, false);
    assert.equal(output.projectFile, projectFile);
    assert.equal(output.id, 'clockwork-cafe');
    assert.deepEqual(output.gitignore, {
      file: path.join(projectRoot, '.gitignore'),
      added: ['*.local.json', 'game-data/', '.ludoweft/', 'dist/'],
    });
    assert.equal(
      fs.readFileSync(path.join(projectRoot, '.gitignore'), 'utf8'),
      '*.local.json\ngame-data/\n.ludoweft/\ndist/\n',
    );
    assert.equal(fs.existsSync(path.join(projectRoot, 'ludoweft.local.json')), false);
  },
));

test('init accepts an explicit project id and omits an unspecified reference language', () => (
  withTempDirectory(async (root) => {
    await captureOutput([
      'init',
      '--adapter', 'demo-json',
      '--project-id', 'example.ko',
      '--source-language', 'en-US',
      '--target-language', 'ko',
    ], root);

    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'ludoweft.project.json'), 'utf8'));
    assert.equal(manifest.id, 'example.ko');
    assert.deepEqual(manifest.languages, { source: 'en-US', target: 'ko' });
  })
));

test('init refuses to overwrite unless --force is present', () => withTempDirectory(async (root) => {
  fs.writeFileSync(path.join(root, '.gitignore'), 'translations-cache/\n*.local.json\n', 'utf8');
  const first = [
    'init', '--adapter', 'demo-json', '--source-language', 'ja', '--target-language', 'ko',
  ];
  await captureOutput(first, root);

  await assert.rejects(() => main([
    ...first, '--id', 'replacement',
  ], root), /project manifest already exists: .*use --force to overwrite/);

  const output = JSON.parse(await captureOutput([
    ...first, '--id', 'replacement', '--force', '--json',
  ], root));
  assert.equal(output.created, false);
  assert.equal(output.overwritten, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'ludoweft.project.json'), 'utf8')).id, 'replacement');
  assert.equal(
    fs.readFileSync(path.join(root, '.gitignore'), 'utf8'),
    'translations-cache/\n*.local.json\ngame-data/\n.ludoweft/\ndist/\n',
  );
  assert.deepEqual(output.gitignore.added, []);
}));

test('init requires an adapter and both translation endpoints', async () => {
  await assert.rejects(() => main(['init']), /--adapter is required/);
  await assert.rejects(() => main(['init', '--adapter', 'demo-json']), /--source-language is required/);
  await assert.rejects(() => main([
    'init', '--adapter', 'demo-json', '--source-language', 'ja',
  ]), /--target-language is required/);
});

test('init validates adapters, ids, and language tags before writing', () => withTempDirectory(async (root) => {
  const base = ['init', '--source-language', 'ja', '--target-language', 'ko'];
  await assert.rejects(() => main([...base, '--adapter', 'missing']), /unknown adapter: missing/);
  await assert.rejects(() => main([
    ...base, '--adapter', 'demo-json', '--id', 'Not Valid',
  ], root), /--id must use lowercase/);
  await assert.rejects(() => main([
    'init', '--adapter', 'demo-json', '--source-language', '../ja', '--target-language', 'ko',
  ], root), /--source-language must be a valid language tag/);
  await assert.rejects(() => main([
    'init', '--adapter', 'demo-json', '--source-language', 'ko', '--target-language', 'KO',
  ], root), /must be different/);
  assert.equal(fs.existsSync(path.join(root, 'ludoweft.project.json')), false);
}));

test('init-only flags are rejected by existing commands', async () => {
  await assert.rejects(() => main(['adapters', '--force']), /--force is only valid with init/);
  await assert.rejects(
    () => main(['adapters', '--adapter', 'demo-json']),
    /--adapter is only valid with init/,
  );
});

test('project id derivation has a stable safe fallback', () => {
  assert.equal(deriveProjectId(path.join('C:\\', '日本語', 'ludoweft.project.json')), 'ludoweft-project');
});

test('init rolls back both new and forced manifests when .gitignore writing fails', () => (
  withTempDirectory((root) => {
    const initializeWithInjectedFailure = (projectRoot, force) => {
      const projectFile = path.join(projectRoot, 'ludoweft.project.json');
      const gitignoreFile = path.join(projectRoot, '.gitignore');
      const originalWrite = fs.writeFileSync;
      let injected = false;
      fs.writeFileSync = (...args) => {
        if (!injected && path.resolve(String(args[0])) === path.resolve(gitignoreFile)) {
          injected = true;
          originalWrite.call(fs, gitignoreFile, 'partial update\n', 'utf8');
          const error = new Error('injected .gitignore failure');
          error.code = 'EIO';
          throw error;
        }
        return originalWrite.apply(fs, args);
      };
      try {
        assert.throws(() => initializeProject({
          projectFile,
          adapter: 'demo-json',
          id: 'rollback-test',
          sourceLanguage: 'ja',
          targetLanguage: 'ko',
          force,
        }), /injected \.gitignore failure/);
      } finally {
        fs.writeFileSync = originalWrite;
      }
      return { projectFile, gitignoreFile };
    };

    const freshRoot = path.join(root, 'fresh');
    const fresh = initializeWithInjectedFailure(freshRoot, false);
    assert.equal(fs.existsSync(fresh.projectFile), false);
    assert.equal(fs.existsSync(fresh.gitignoreFile), false);

    const forcedRoot = path.join(root, 'forced');
    fs.mkdirSync(forcedRoot);
    const forcedManifest = path.join(forcedRoot, 'ludoweft.project.json');
    const forcedGitignore = path.join(forcedRoot, '.gitignore');
    const originalManifest = '{"keep":"original manifest bytes"}\r\n';
    const originalGitignore = 'keep-this-rule/\r\n';
    fs.writeFileSync(forcedManifest, originalManifest, 'utf8');
    fs.writeFileSync(forcedGitignore, originalGitignore, 'utf8');

    initializeWithInjectedFailure(forcedRoot, true);
    assert.equal(fs.readFileSync(forcedManifest, 'utf8'), originalManifest);
    assert.equal(fs.readFileSync(forcedGitignore, 'utf8'), originalGitignore);
  })
));
