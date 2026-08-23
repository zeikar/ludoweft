import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAdapter } from '../src/core/load-adapter.mjs';
import { readProject } from '../src/core/project.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..');
const fixture = path.join(repoRoot, 'examples/demo');
const generated = ['.ludoweft', 'dist'];

// Each case runs against a throwaway copy of the demo fixture so tests never mutate the repo.
export function withDemo(run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ludoweft-test-'));
  const projectRoot = path.join(tempRoot, 'demo');
  // `npm run demo` writes into the fixture; copying those artifacts would make test
  // results depend on whether the demo had been run.
  fs.cpSync(fixture, projectRoot, {
    recursive: true,
    filter: (source) => !generated.some((name) => path.relative(fixture, source).split(path.sep).includes(name)),
  });
  const cleanup = () => fs.rmSync(tempRoot, { recursive: true, force: true });
  try {
    const project = readProject(path.join(projectRoot, 'ludoweft.project.json'));
    const result = run({
      project,
      adapter: loadAdapter(project.config.adapter),
      jsonl: path.join(project.paths.translations, 'dialogue.jsonl'),
      sourceFile: path.join(project.paths.source, 'dialogue.json'),
      builtFile: path.join(project.paths.output, 'dialogue.json'),
    });
    // An async case must finish before the fixture is removed underneath it.
    if (result instanceof Promise) return result.finally(cleanup);
    cleanup();
    return result;
  } catch (error) {
    cleanup();
    throw error;
  }
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeJson(file, document) {
  fs.writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
}
