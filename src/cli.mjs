import path from 'node:path';
import { importLegacyJsonl, JA_EN_KO_V1 } from './core/import-jsonl.mjs';
import { initializeProject } from './core/init-project.mjs';
import { loadAdapter, listAdapters } from './core/load-adapter.mjs';
import { readProject, redactProject } from './core/project.mjs';
import { validateTranslationWorkspace } from './core/segments.mjs';

const HELP = `Ludoweft - agent-native game localization pipeline

Usage:
  ludoweft <command> [--project <file>] [--json]

Commands:
  init       Create a project manifest noninteractively
  import-jsonl  Convert a legacy JSONL workspace into Ludoweft segments
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
      --adapter <id>    Resource adapter for init (required)
      --id <id>         Project ID for init (default: derived from project directory)
      --source-language <tag>     Source language for init (required)
      --reference-language <tag>  Optional reference language for init
      --target-language <tag>     Target language for init (required)
      --force           Overwrite an existing manifest during init
      --input <dir>     Legacy JSONL directory for import-jsonl
      --output <dir>    New translation directory for import-jsonl
      --format <name>   Legacy format (default: ja-en-ko-v1)
      --dry-run         Validate an import without writing files
`;

function parseArgs(args) {
  const options = {
    project: 'ludoweft.project.json', json: false, help: false, force: false, dryRun: false,
  };
  const positional = [];
  const seen = new Set();
  const takeValue = (value, index) => {
    const next = args[index + 1];
    if (!next || next.startsWith('-')) throw new Error(`${value} requires a value`);
    return next;
  };
  const setOnce = (name, value, option) => {
    if (seen.has(name)) throw new Error(`${option} may only be specified once`);
    seen.add(name);
    options[name] = value;
  };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--project' || value === '-p') {
      const next = args[index + 1];
      if (!next || next.startsWith('-')) throw new Error(`${value} requires a file path`);
      setOnce('project', next, value);
      index += 1;
    } else if (value === '--json') options.json = true;
    else if (value === '--help' || value === '-h') options.help = true;
    else if (value === '--force') options.force = true;
    else if (value === '--dry-run') options.dryRun = true;
    else if (value === '--adapter') {
      setOnce('adapter', takeValue(value, index), value);
      index += 1;
    } else if (value === '--id' || value === '--project-id') {
      setOnce('id', takeValue(value, index), value);
      index += 1;
    } else if (value === '--source-language') {
      setOnce('sourceLanguage', takeValue(value, index), value);
      index += 1;
    } else if (value === '--reference-language') {
      setOnce('referenceLanguage', takeValue(value, index), value);
      index += 1;
    } else if (value === '--target-language') {
      setOnce('targetLanguage', takeValue(value, index), value);
      index += 1;
    } else if (value === '--input') {
      setOnce('input', takeValue(value, index), value);
      index += 1;
    } else if (value === '--output') {
      setOnce('output', takeValue(value, index), value);
      index += 1;
    } else if (value === '--format') {
      setOnce('format', takeValue(value, index), value);
      index += 1;
    } else if (value.startsWith('-')) throw new Error(`unknown option: ${value}`);
    else positional.push(value);
  }
  if (positional.length > 1) throw new Error(`unexpected argument: ${positional[1]}`);
  const command = positional[0] ?? 'help';
  if (command !== 'init') {
    const initOnly = [
      ['adapter', '--adapter'],
      ['id', '--id'],
      ['sourceLanguage', '--source-language'],
      ['referenceLanguage', '--reference-language'],
      ['targetLanguage', '--target-language'],
    ].find(([name]) => options[name] !== undefined);
    if (initOnly) throw new Error(`${initOnly[1]} is only valid with init`);
    if (options.force) throw new Error('--force is only valid with init');
  }
  if (command !== 'import-jsonl') {
    const importOnly = [
      ['input', '--input'], ['output', '--output'], ['format', '--format'],
    ].find(([name]) => options[name] !== undefined);
    if (importOnly) throw new Error(`${importOnly[1]} is only valid with import-jsonl`);
    if (options.dryRun) throw new Error('--dry-run is only valid with import-jsonl');
  }
  return { command, options };
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
  if (command === 'init') {
    if (options.adapter === undefined) throw new Error('--adapter is required');
    if (options.sourceLanguage === undefined) throw new Error('--source-language is required');
    if (options.targetLanguage === undefined) throw new Error('--target-language is required');
    loadAdapter(options.adapter);
    return print(initializeProject({
      projectFile,
      adapter: options.adapter,
      id: options.id,
      sourceLanguage: options.sourceLanguage,
      referenceLanguage: options.referenceLanguage,
      targetLanguage: options.targetLanguage,
      force: options.force,
    }), options.json);
  }
  if (command === 'import-jsonl') {
    if (options.input === undefined) throw new Error('--input is required');
    if (options.output === undefined) throw new Error('--output is required');
    return print(importLegacyJsonl({
      input: path.resolve(cwd, options.input),
      output: path.resolve(cwd, options.output),
      format: options.format ?? JA_EN_KO_V1,
      dryRun: options.dryRun,
    }), options.json);
  }
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
