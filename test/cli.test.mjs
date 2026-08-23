import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { main } from '../src/cli.mjs';
import { withDemo } from './helpers.mjs';

async function captureOutput(argv) {
  const original = console.log;
  const lines = [];
  console.log = (value) => lines.push(String(value));
  try {
    await main(argv);
  } finally {
    console.log = original;
  }
  return lines.join('\n');
}

test('--json prints JSON while the default prints plain text', async () => {
  const asJson = await captureOutput(['adapters', '--json']);
  const asText = await captureOutput(['adapters']);

  assert.doesNotThrow(() => JSON.parse(asJson));
  assert.throws(() => JSON.parse(asText));
  assert.match(asText, /id: demo-json/);
});

test('an unknown option is rejected instead of becoming the command', async () => {
  await assert.rejects(() => main(['--verbose', 'adapters']), /unknown option: --verbose/);
});

test('--project requires a value', async () => {
  await assert.rejects(() => main(['inspect', '--project', '--json']), /--project requires a file path/);
});

test('inspect withholds adapter configuration from its output', () => withDemo(async ({ project }) => {
  const manifest = path.join(project.root, 'ludoweft.project.json');
  const output = JSON.parse(await captureOutput(['inspect', '--project', manifest, '--json']));

  assert.equal(output.project.adapterConfig, undefined);
  assert.deepEqual(output.project.withheld, ['adapterConfig']);
  // The adapter still surfaces the part of its own config that is safe to show.
  assert.deepEqual(output.adapter.files, ['dialogue.json']);
}));

test('an extra positional argument is rejected instead of ignored', async () => {
  await assert.rejects(() => main(['adapters', 'nosuchthing']), /unexpected argument: nosuchthing/);
});
