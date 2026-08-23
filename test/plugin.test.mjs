import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Codex plugin metadata matches the npm package', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, '.codex-plugin/plugin.json'), 'utf8'));
  const marketplace = JSON.parse(fs.readFileSync(path.join(root, '.agents/plugins/marketplace.json'), 'utf8'));
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  assert.equal(manifest.name, packageJson.name);
  assert.equal(manifest.version, packageJson.version);
  assert.equal(manifest.skills, './skills/');
  assert.equal(marketplace.name, manifest.name);
  assert.equal(marketplace.plugins[0].name, manifest.name);
  assert.equal(marketplace.plugins[0].source.source, 'url');
  assert.equal(marketplace.plugins[0].source.url, manifest.repository + '.git');
  assert.ok(fs.existsSync(path.join(root, 'skills/ludoweft-localize/SKILL.md')));
});

test('bundled plugin CLI runs without a global install', () => {
  const cli = path.join(root, 'skills/ludoweft-localize/scripts/ludoweft.mjs');
  const output = execFileSync(process.execPath, [cli, 'help'], { encoding: 'utf8' });

  assert.match(output, /agent-native game localization pipeline/);
  assert.match(output, /ludoweft <command>/);
});
