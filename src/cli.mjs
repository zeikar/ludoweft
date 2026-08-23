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

Options:
  -p, --project <file>  Project manifest (default: ludoweft.project.json)
      --json            Print machine-readable JSON instead of plain text
`;

function parseArgs(args) {
  const options = { project: 'ludoweft.project.json', json: false, help: false };
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--project' || value === '-p') {
      const next = args[index + 1];
      if (!next || next.startsWith('-')) throw new Error(`${value} requires a file path`);
      options.project = next;
      index += 1;
    } else if (value === '--json') options.json = true;
    else if (value === '--help' || value === '-h') options.help = true;
    else if (value.startsWith('-')) throw new Error(`unknown option: ${value}`);
    else positional.push(value);
  }
  if (positional.length > 1) throw new Error(`unexpected argument: ${positional[1]}`);
  return { command: positional[0] ?? 'help', options };
}

function formatText(value, indent = '') {
  if (value === null || typeof value !== 'object') return `${indent}${value}`;
  if (Array.isArray(value)) {
    if (value.length === 0) return `${indent}(none)`;
    return value.map((item) => (item !== null && typeof item === 'object'
      ? formatText(item, indent)
      : `${indent}- ${item}`)).join('\n');
  }
  return Object.entries(value)
    .map(([key, item]) => (item !== null && typeof item === 'object'
      ? `${indent}${key}:\n${formatText(item, `${indent}  `)}`
      : `${indent}${key}: ${item}`))
    .join('\n');
}

function print(value, json) {
  if (typeof value === 'string') console.log(value);
  else console.log(json ? JSON.stringify(value, null, 2) : formatText(value));
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
  if (options.help || command === 'help') return print(HELP, false);
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
