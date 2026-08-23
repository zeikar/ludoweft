import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { repoRoot } from './helpers.mjs';

const read = (file) => JSON.parse(fs.readFileSync(path.join(repoRoot, file), 'utf8'));

const manifest = read('.codex-plugin/plugin.json');
const marketplace = read('.agents/plugins/marketplace.json');
const claudeManifest = read('.claude-plugin/plugin.json');
const claudeMarketplace = read('.claude-plugin/marketplace.json');
const packageJson = read('package.json');

test('every manifest carries the same name and version as the npm package', () => {
  for (const [label, m] of [['codex', manifest], ['claude', claudeManifest]]) {
    assert.equal(m.name, packageJson.name, `${label} manifest name`);
    assert.equal(m.version, packageJson.version, `${label} manifest version`);
  }
});

test('the Claude Code plugin is discoverable from its own marketplace', () => {
  // The repository is both the plugin and the marketplace that offers it.
  assert.equal(claudeMarketplace.name, claudeManifest.name);
  assert.deepEqual(claudeMarketplace.plugins.map((plugin) => plugin.name), [claudeManifest.name]);
  assert.equal(claudeMarketplace.plugins[0].source, './');
  // Claude Code discovers skills at the plugin root, so the manifest declares no custom path.
  assert.equal(claudeManifest.skills, undefined);
  assert.ok(fs.existsSync(path.join(repoRoot, 'skills/ludoweft-localize/SKILL.md')));
});

test('Codex plugin metadata matches the npm package', () => {
  assert.equal(manifest.name, packageJson.name);
  assert.equal(manifest.version, packageJson.version);
  assert.equal(manifest.skills, './skills/');
  assert.equal(marketplace.name, manifest.name);
  assert.equal(marketplace.plugins[0].name, manifest.name);
  assert.equal(marketplace.plugins[0].source.source, 'url');
  assert.equal(marketplace.plugins[0].source.url, `${manifest.repository}.git`);
  assert.ok(fs.existsSync(path.join(repoRoot, 'skills/ludoweft-localize/SKILL.md')));
});

// The previous version of this case ran the entrypoint from the repository, where `src/`
// is always present, so it could not fail. A Codex install clones the whole repository —
// this rebuilds that layout from the tracked file list and runs against it instead.
test('the bundled entrypoint runs from an installed plugin layout', () => {
  const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ludoweft-install-'));
  try {
    const tracked = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' }).trim().split('\n');
    for (const file of tracked) {
      const destination = path.join(installRoot, file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(repoRoot, file), destination);
    }

    const entrypoint = path.join(installRoot, 'skills/ludoweft-localize/scripts/ludoweft.mjs');
    const output = execFileSync(process.execPath, [entrypoint, 'help'], { encoding: 'utf8' });
    assert.match(output, /agent-native game localization pipeline/);
    assert.match(output, /ludoweft <command>/);
  } finally {
    fs.rmSync(installRoot, { recursive: true, force: true });
  }
});

test('the packaged skill declares the workflow reference it tells agents to read', () => {
  const skill = fs.readFileSync(path.join(repoRoot, 'skills/ludoweft-localize/SKILL.md'), 'utf8');
  const referenced = [...skill.matchAll(/\]\((references\/[^)]+)\)/g)].map((match) => match[1]);

  assert.ok(referenced.length > 0, 'SKILL.md must point at its workspace reference');
  for (const reference of referenced) {
    assert.ok(
      fs.existsSync(path.join(repoRoot, 'skills/ludoweft-localize', reference)),
      `SKILL.md links a missing reference: ${reference}`,
    );
  }
});

test('the npm package ships the files the plugin entrypoint needs', () => {
  // `files` narrows an npm publish; the plugin entrypoint reaches outside skills/ into src/.
  for (const entry of ['src', 'skills', 'bin', 'schemas']) {
    assert.ok(packageJson.files.includes(entry), `package.json files must include ${entry}`);
  }
});
