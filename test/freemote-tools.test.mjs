import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createToolRunner, resolveFreeMoteTools } from '../src/adapters/freemote/tool-runner.mjs';

function withTools(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ludoweft-tools-test-'));
  try {
    const files = {
      decompiler: 'PsbDecompile.exe',
      builder: 'PsBuild.exe',
      converter: 'EmtConvert.exe',
    };
    const hashes = {};
    for (const [id, name] of Object.entries(files)) {
      const value = `synthetic ${id}`;
      fs.writeFileSync(path.join(root, name), value, 'utf8');
      hashes[id] = crypto.createHash('sha256').update(value).digest('hex');
    }
    return run({ root, files, hashes });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('FreeMote tool paths stay contained and optional hashes are verified', () => withTools(({ root, hashes }) => {
  const project = {
    paths: { freeMote: root },
    config: { adapterConfig: { tool: { hashes } } },
  };
  const resolved = resolveFreeMoteTools(project);
  assert.equal(resolved.builder, path.join(root, 'PsBuild.exe'));

  project.config.adapterConfig.tool.hashes.builder = '0'.repeat(64);
  assert.throws(() => resolveFreeMoteTools(project), /tool hash mismatch: PsBuild\.exe/);
  project.config.adapterConfig.tool.builder = '../outside.exe';
  assert.throws(() => resolveFreeMoteTools(project), /must be a file name inside paths\.freeMote/);
}));

test('tool runner uses argument arrays and redacts configured secrets from failures', () => {
  const secret = 'private-seed';
  let observed;
  const run = createToolRunner({
    spawn(executable, args, options) {
      observed = { executable, args, options };
      return { status: 9, stdout: '', stderr: `failed with ${secret}` };
    },
  });
  assert.throws(
    () => run({
      executable: 'tool.exe', args: ['-s', secret], cwd: 'work', label: 'synthetic tool', secrets: [secret],
    }),
    (error) => error.message.includes('[REDACTED]') && !error.message.includes(secret),
  );
  assert.deepEqual(observed.args, ['-s', secret]);
  assert.equal(observed.options.shell, false);
  assert.equal(observed.options.windowsHide, true);
});
