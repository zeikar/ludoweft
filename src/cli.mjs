import path from 'node:path';
import { loadAdapter, listAdapters } from './core/load-adapter.mjs';
import { readProject, redactProject } from './core/project.mjs';
import { validateTranslationWorkspace } from './core/segments.mjs';

const HELP = `Ludoweft - agent-native game localization pipeline

Usage:
  ludoweft <command> [--project <file>] [--json]

Commands:
  adapters   List installed resource adapters
  inspect    Inspect the project without exposing configured secrets
  extract    Extract source resources through the selected adapter
  export     Export translatable segments to JSONL
  validate   Validate the project and translation workspace
  apply      Apply translated segments to extracted resources
  build      Build distributable resources
  verify     Verify build outputs
  pipeline   Run extract, export, validate, apply, build, and verify
  help       Show this help
`;

function parseArgs(args) {
  const options = { project: 'ludoweft.project.json', json: false };
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--project' || value === '-p') {
      options.project = args[index + 1];
      index += 1;
      if (!options.project) throw new Error('--project requires a file path');
    } else if (value === '--json') options.json = true;
    else positional.push(value);
  }
  return { command: positional[0] ?? 'help', options };
}

function print(value, json) {
  if (json || typeof value !== 'string') console.log(JSON.stringify(value, null, 2));
  else console.log(value);
}

function validate(project) {
  const workspace = validateTranslationWorkspace(project.paths.translations);
  if (workspace.errors.length > 0) {
    throw new Error(`translation validation failed:\n- ${workspace.errors.join('\n- ')}`);
  }
  return workspace;
}

export async function main(args, cwd = process.cwd()) {
  const { command, options } = parseArgs(args);
  if (command === 'help' || command === '--help' || command === '-h') return print(HELP, false);
  if (command === 'adapters') return print(listAdapters(), options.json);

  const projectFile = path.resolve(cwd, options.project);
  const project = readProject(projectFile);
  const adapter = loadAdapter(project.config.adapter);

  if (command === 'inspect') {
    return print({ project: redactProject(project.config), adapter: adapter.inspect(project) }, options.json);
  }
  if (command === 'validate') return print(validate(project), options.json);
  if (['extract', 'export', 'apply', 'build', 'verify'].includes(command)) {
    return print(await adapter[command](project), options.json);
  }
  if (command === 'pipeline') {
    const result = {};
    for (const stage of ['extract', 'export']) result[stage] = await adapter[stage](project);
    result.validate = validate(project);
    for (const stage of ['apply', 'build', 'verify']) result[stage] = await adapter[stage](project);
    return print(result, options.json);
  }
  throw new Error(`unknown command: ${command}`);
}
