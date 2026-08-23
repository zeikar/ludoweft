import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { readProject, redactProject } from '../src/core/project.mjs';
import { readJson, withDemo, writeJson } from './helpers.mjs';

test('a local config cannot replace the manifest prototype', () => withDemo(({ project }) => {
  const manifestFile = path.join(project.root, 'ludoweft.project.json');
  const manifest = readJson(manifestFile);
  manifest.localConfig = './ludoweft.local.json';
  writeJson(manifestFile, manifest);
  writeJson(path.join(project.root, 'ludoweft.local.json'), JSON.parse('{"__proto__":{"polluted":"yes"}}'));

  const loaded = readProject(manifestFile);
  assert.equal(loaded.config.polluted, undefined);
  assert.equal(Object.getPrototypeOf(loaded.config), Object.prototype);
}));

test('a malformed local config names the file it failed to parse', () => withDemo(({ project }) => {
  const manifestFile = path.join(project.root, 'ludoweft.project.json');
  const manifest = readJson(manifestFile);
  manifest.localConfig = './ludoweft.local.json';
  writeJson(manifestFile, manifest);
  fs.writeFileSync(path.join(project.root, 'ludoweft.local.json'), '{ "paths": { broken\n', 'utf8');

  assert.throws(() => readProject(manifestFile), /cannot parse local config: .*ludoweft\.local\.json/);
}));

test('a non-string path value is rejected before it reaches path.resolve', () => withDemo(
  ({ project }) => {
    const manifestFile = path.join(project.root, 'ludoweft.project.json');
    const manifest = readJson(manifestFile);
    manifest.paths.cacheEnabled = true;
    writeJson(manifestFile, manifest);

    assert.throws(() => readProject(manifestFile), /paths.cacheEnabled must be a non-empty string/);
  },
));

test('an adapter-specific path is resolved against the project root', () => withDemo(({ project }) => {
  const manifestFile = path.join(project.root, 'ludoweft.project.json');
  const manifest = readJson(manifestFile);
  manifest.paths.tools = './tools';
  writeJson(manifestFile, manifest);

  const loaded = readProject(manifestFile);
  assert.equal(loaded.paths.tools, path.join(project.root, 'tools'));
}));

test('project inspection exposes only allowlisted manifest fields', () => {
  const redacted = redactProject({
    schemaVersion: 1,
    id: 'demo',
    adapter: 'demo-json',
    archiveKey: 'secret',
    adapterConfig: { toolPath: '/opt/private/tool', authorization: 'Bearer AAA' },
  });

  assert.equal(redacted.id, 'demo');
  assert.equal(redacted.adapter, 'demo-json');
  assert.equal(redacted.archiveKey, undefined);
  assert.equal(redacted.adapterConfig, undefined);
  assert.deepEqual(redacted.withheld, ['adapterConfig', 'archiveKey']);
});

test('redaction does not depend on secret-sounding key names', () => {
  // The previous heuristic missed these entirely; an allowlist withholds them by default.
  const redacted = redactProject({ id: 'demo', authorization: 'a', cookie: 'b', credentials: 'c', session: 'd' });

  assert.deepEqual(redacted.withheld, ['authorization', 'cookie', 'credentials', 'session']);
  for (const field of ['authorization', 'cookie', 'credentials', 'session']) {
    assert.equal(redacted[field], undefined);
  }
});

test('project manifest keeps its declared path layout', () => withDemo(({ project }) => {
  const manifest = readProject(path.join(project.root, 'ludoweft.project.json'));
  assert.equal(manifest.config.id, 'ludoweft-demo-ko');
  assert.equal(path.basename(manifest.paths.output), 'dist');
}));
