import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { hashSource } from '../core/hash.mjs';
import {
  listJsonLines,
  readJsonLines,
  readJsonLinesIfPresent,
  writeJsonLines,
} from '../core/jsonl.mjs';
import {
  APPLICABLE_STATUSES,
  compareProtectedTokens,
  extractProtectedTokens,
  validateSegment,
  validateTranslationWorkspace,
} from '../core/segments.mjs';
import { localizedStringArrayHandler } from './freemote/handlers/localized-string-array.mjs';
import { magesScenarioHandler } from './freemote/handlers/mages-scenario.mjs';
import { applyMutation } from './freemote/mutations.mjs';
import { createToolRunner, resolveFreeMoteTools } from './freemote/tool-runner.mjs';

const HANDLERS = new Map([
  [magesScenarioHandler.id, magesScenarioHandler],
  [localizedStringArrayHandler.id, localizedStringArrayHandler],
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeJoin(root, relative, label = 'path') {
  if (typeof relative !== 'string' || relative.length === 0 || path.isAbsolute(relative)) {
    throw new Error(`${label} must be a non-empty relative path`);
  }
  const target = path.resolve(root, relative);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error(`${label} escapes its root: ${relative}`);
  return target;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read JSON ${file}: ${error.message}`);
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sameJson(left, right) {
  return isDeepStrictEqual(left, right);
}

// FreeMote may serialize PSB float32 values through JSON as longer JavaScript doubles
// and quantize them again on rebuild. Integers remain exact; non-integers are equal only
// when they represent the same float32 value. Everything else stays structurally exact.
function sameResourceJson(left, right) {
  if (typeof left === 'number' && typeof right === 'number') {
    if (Number.isInteger(left) || Number.isInteger(right)) return Object.is(left, right);
    return Object.is(Math.fround(left), Math.fround(right));
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => sameResourceJson(value, right[index]));
  }
  if (isRecord(left) || isRecord(right)) {
    if (!isRecord(left) || !isRecord(right)) return false;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return sameJson(leftKeys, rightKeys)
      && leftKeys.every((key) => sameResourceJson(left[key], right[key]));
  }
  return Object.is(left, right);
}

function toPosix(file) {
  return file.split(path.sep).join('/');
}

function registerRelativeDestination(registry, relative, owner, label) {
  if (typeof relative !== 'string' || relative.length === 0 || path.isAbsolute(relative)) {
    throw new Error(`${label} must be a non-empty relative path`);
  }
  const normalized = path.normalize(relative);
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
    throw new Error(`${label} escapes its root: ${relative}`);
  }
  // FreeMote targets Windows games, so reject collisions under Windows case folding
  // even when validation happens on another platform.
  const key = toPosix(normalized).toLowerCase();
  const conflict = registry.find((entry) => entry.key === key
    || entry.key.startsWith(`${key}/`) || key.startsWith(`${entry.key}/`));
  if (conflict) {
    throw new Error(`${label} collision between ${conflict.owner} and ${owner}`);
  }
  registry.push({ key, owner });
  return normalized;
}

function uniqueStage(target) {
  return path.join(path.dirname(target), `.${path.basename(target)}.stage-${process.pid}-${Date.now()}`);
}

function promoteDirectory(stage, target) {
  const previous = path.join(path.dirname(target), `.${path.basename(target)}.previous-${process.pid}-${Date.now()}`);
  const hadTarget = fs.existsSync(target);
  if (hadTarget) fs.renameSync(target, previous);
  try {
    fs.renameSync(stage, target);
  } catch (error) {
    if (hadTarget && fs.existsSync(previous) && !fs.existsSync(target)) fs.renameSync(previous, target);
    throw error;
  }
  if (hadTarget) fs.rmSync(previous, { recursive: true, force: true });
}

function assertNoInterruptedPromotion(target) {
  const parent = path.dirname(target);
  const prefix = `.${path.basename(target)}.previous-`;
  const previous = fs.readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.name.startsWith(prefix))
    .map((entry) => ({ entry, file: path.join(parent, entry.name) }))
    .sort((left, right) => left.file.localeCompare(right.file));
  if (previous.length === 0) return;
  const backups = previous.map(({ file }) => file).join(', ');
  throw new Error(`possible interrupted directory promotion requires manual recovery for ${target}: ${backups}`);
}

function withStagingDirectory(target, run, { copyExisting = false } = {}) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  assertNoInterruptedPromotion(target);
  const stage = uniqueStage(target);
  fs.rmSync(stage, { recursive: true, force: true });
  if (copyExisting && fs.existsSync(target)) fs.cpSync(target, stage, { recursive: true });
  else fs.mkdirSync(stage, { recursive: true });
  try {
    const result = run(stage);
    promoteDirectory(stage, target);
    return result;
  } catch (error) {
    fs.rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}

function configFor(project, { requireCrypto = false } = {}) {
  const config = project.config.adapterConfig;
  if (!isRecord(config)) throw new Error('freemote-info-psb requires adapterConfig');
  if (!Array.isArray(config.archives) || config.archives.length === 0) {
    throw new Error('adapterConfig.archives must be a non-empty array');
  }
  const slots = config.languageSlots;
  if (!isRecord(slots)) throw new Error('adapterConfig.languageSlots is required');
  for (const field of ['source', 'reference', 'destination']) {
    if (!Number.isInteger(slots[field]) || slots[field] < 0) {
      throw new Error(`adapterConfig.languageSlots.${field} must be a non-negative integer`);
    }
  }
  if (!['source', 'reference', 'destination'].includes(slots.protectedFrom ?? 'source')) {
    throw new Error('adapterConfig.languageSlots.protectedFrom must be source, reference, or destination');
  }
  slots.protectedFrom ??= 'source';

  const ids = new Set();
  const archiveOutputs = [];
  for (const archive of config.archives) {
    if (!isRecord(archive) || typeof archive.id !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(archive.id)) {
      throw new Error('every archive requires a lowercase id');
    }
    if (ids.has(archive.id)) throw new Error(`duplicate archive id: ${archive.id}`);
    ids.add(archive.id);
    for (const field of ['infoFile', 'bodyFile', 'entryDirectory']) {
      safeJoin(project.paths.source, archive[field], `archive ${archive.id} ${field}`);
    }
    for (const field of ['infoFile', 'bodyFile']) {
      registerRelativeDestination(
        archiveOutputs,
        archive[field],
        `${archive.id}.${field}`,
        'archive output path',
      );
    }
    if (!Array.isArray(archive.resources) || archive.resources.length === 0) {
      throw new Error(`archive ${archive.id} requires resources[]`);
    }
    for (const resource of archive.resources) {
      if (!isRecord(resource) || !HANDLERS.has(resource.handler)) {
        throw new Error(`archive ${archive.id} has unsupported resource handler: ${resource?.handler}`);
      }
      if (!Array.isArray(resource.include) || resource.include.length === 0
        || resource.include.some((item) => typeof item !== 'string' || item.length === 0)) {
        throw new Error(`archive ${archive.id} resource ${resource.handler} requires include[]`);
      }
    }
  }
  if (config.mutations !== undefined && !Array.isArray(config.mutations)) {
    throw new Error('adapterConfig.mutations must be an array when present');
  }
  if (requireCrypto) {
    if (!isRecord(config.crypto) || typeof config.crypto.key !== 'string' || config.crypto.key.length === 0) {
      throw new Error('adapterConfig.crypto.key is required in the local configuration');
    }
    if (!Number.isInteger(config.crypto.keyLength) || config.crypto.keyLength < 1) {
      throw new Error('adapterConfig.crypto.keyLength must be a positive integer');
    }
  }
  return config;
}

function resourceDefaults(resource) {
  return {
    ...resource,
    jsonSuffix: resource.jsonSuffix ?? (resource.handler === 'mages-scenario' ? '.scn.m.json' : '.psb.m.json'),
    translationDirectory: resource.translationDirectory ?? '',
  };
}

function matches(file, pattern) {
  if (!pattern.includes('*')) return file === pattern;
  if (!pattern.startsWith('*.') || pattern.slice(1).includes('*')) {
    throw new Error(`only exact names and *.suffix include patterns are supported: ${pattern}`);
  }
  return file.endsWith(pattern.slice(1));
}

function archiveRoots(project, archive) {
  return {
    full: path.join(project.paths.work, 'extracted', `${archive.id}_full`),
    raw: path.join(project.paths.work, 'extracted', `${archive.id}_raw`),
  };
}

function documentKey(archiveId, file) {
  return `${archiveId}/${toPosix(file)}`;
}

function addMutationDocuments(project, config, documents, byKey) {
  for (const mutation of config.mutations ?? []) {
    if (!isRecord(mutation) || typeof mutation.archive !== 'string' || typeof mutation.file !== 'string') {
      throw new Error('each mutation requires archive and file');
    }
    const archive = config.archives.find((item) => item.id === mutation.archive);
    if (!archive) throw new Error(`mutation references unknown archive: ${mutation.archive}`);
    const key = documentKey(archive.id, mutation.file);
    if (byKey.has(key)) continue;
    const root = safeJoin(archiveRoots(project, archive).full, archive.entryDirectory, 'archive entryDirectory');
    const jsonFile = safeJoin(root, mutation.file, 'mutation file');
    if (!fs.existsSync(jsonFile)) throw new Error(`mutation source not found: ${archive.id}/${mutation.file}`);
    const relativeJson = path.join(archive.entryDirectory, mutation.file);
    const suffix = ['.scn.m.json', '.psb.m.json', '.json'].find((value) => mutation.file.endsWith(value));
    const record = {
      archive,
      resource: null,
      handler: null,
      file: mutation.file,
      relativeJson,
      jsonFile,
      resxFile: jsonFile.replace(/\.json$/i, '.resx.json'),
      document: readJson(jsonFile),
      rawName: mutation.rawName ?? mutation.file.slice(0, suffix ? -suffix.length : undefined),
      translationFile: null,
      segments: [],
    };
    documents.push(record);
    byKey.set(key, record);
  }
}

function documentsFor(project) {
  const config = configFor(project);
  const documents = [];
  const byKey = new Map();
  for (const archive of config.archives) {
    const full = archiveRoots(project, archive).full;
    const entryRoot = safeJoin(full, archive.entryDirectory, `archive ${archive.id} entryDirectory`);
    if (!fs.existsSync(entryRoot)) throw new Error(`extracted archive not found: ${archive.id}`);
    const available = fs.readdirSync(entryRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.resx.json'))
      .map((entry) => entry.name)
      .sort();
    for (const rawResource of archive.resources) {
      const resource = resourceDefaults(rawResource);
      const selected = available.filter((file) => resource.include.some((pattern) => matches(file, pattern)));
      for (const exact of resource.include.filter((pattern) => !pattern.includes('*'))) {
        if (!selected.includes(exact)) throw new Error(`configured resource file not found: ${archive.id}/${exact}`);
      }
      if (selected.length === 0) {
        throw new Error(`resource include matched no files: ${archive.id}/${resource.include.join(', ')}`);
      }
      const handler = HANDLERS.get(resource.handler);
      for (const file of selected) {
        const key = documentKey(archive.id, file);
        if (byKey.has(key)) throw new Error(`resource file matched more than one handler: ${key}`);
        const jsonFile = safeJoin(entryRoot, file, 'resource file');
        const document = readJson(jsonFile);
        const handlerContext = { archive: archive.id, file, resource, slots: config.languageSlots };
        const translationName = handler.translationName(document, handlerContext);
        const translationFile = safeJoin(
          project.paths.translations,
          path.join(resource.translationDirectory, translationName),
          'translation file',
        );
        const record = {
          archive,
          resource,
          handler,
          file,
          relativeJson: path.join(archive.entryDirectory, file),
          jsonFile,
          resxFile: jsonFile.replace(/\.json$/i, '.resx.json'),
          document,
          rawName: handler.rawName(document, handlerContext),
          translationFile,
          segments: handler.segments(document, handlerContext),
        };
        documents.push(record);
        byKey.set(key, record);
      }
    }
  }
  addMutationDocuments(project, config, documents, byKey);
  return { documents, byKey };
}

function indexRows(rows, file, globalIds = null) {
  const result = new Map();
  for (const row of rows) {
    if (!isRecord(row) || typeof row.id !== 'string') throw new Error(`${file}: every row requires an id`);
    if (result.has(row.id)) throw new Error(`${file}: duplicate id ${row.id}`);
    if (globalIds?.has(row.id)) throw new Error(`${file}: duplicate id also found at ${globalIds.get(row.id)}`);
    result.set(row.id, row);
    globalIds?.set(row.id, file);
  }
  return result;
}

function normalizeLegacy(row, legacy) {
  if (!isRecord(legacy) || typeof row.source === 'string') return { ...row };
  const fields = [legacy.source, legacy.reference, legacy.target];
  if (fields.some((field) => typeof field !== 'string' || typeof row[field] !== 'string')) return { ...row };
  const source = row[legacy.source];
  const reference = row[legacy.reference];
  if (row.sourceHash !== hashSource(source, reference)) throw new Error(`${row.id}: legacy sourceHash mismatch`);
  const normalized = {
    ...row,
    source,
    reference,
    target: row[legacy.target],
    status: row.status ?? (row[legacy.target] ? (legacy.translatedStatus ?? 'draft') : 'untranslated'),
    protectedTokenSource: 'source',
    protectedTokenProfile: 'default',
    protectedTokens: extractProtectedTokens(source, 'default'),
  };
  for (const field of new Set([...fields, 'file', 'scene', 'text', 'pointer'])) delete normalized[field];
  return normalized;
}

function mergedRows(descriptors, existingRows, file, legacy) {
  const existing = indexRows(existingRows.map((row) => normalizeLegacy(row, legacy)), file);
  const seen = new Set();
  let stale = 0;
  let orphaned = 0;
  const rows = descriptors.map((descriptor) => {
    if (seen.has(descriptor.id)) throw new Error(`${descriptor.id}: duplicate id in extracted resources`);
    seen.add(descriptor.id);
    const previous = existing.get(descriptor.id);
    const sourceHash = hashSource(descriptor.source, descriptor.reference);
    const target = previous?.target ?? '';
    const carried = previous?.status === 'orphaned'
      ? (previous.previousStatus ?? 'untranslated')
      : (previous?.status ?? (target ? 'draft' : 'untranslated'));
    const row = {
      ...previous,
      id: descriptor.id,
      source: descriptor.source,
      reference: descriptor.reference,
      target,
      sourceHash,
      protectedTokenSource: descriptor.protectedTokenSource,
      protectedTokenProfile: descriptor.protectedTokenProfile,
      protectedTokens: extractProtectedTokens(
        descriptor[descriptor.protectedTokenSource],
        descriptor.protectedTokenProfile,
      ),
      context: descriptor.context,
      status: carried,
    };
    delete row.previousStatus;
    if (target && previous?.sourceHash !== sourceHash) {
      row.status = 'stale';
      row.previousSource = previous?.status === 'stale' && previous.previousSource !== undefined
        ? previous.previousSource
        : previous?.source;
    } else if (target && carried === 'stale') row.previousSource = previous.previousSource;
    else delete row.previousSource;
    if (row.status === 'stale') stale += 1;
    return row;
  });
  for (const [id, previous] of existing) {
    if (seen.has(id)) continue;
    rows.push({
      ...previous,
      status: 'orphaned',
      previousStatus: previous.status === 'orphaned'
        ? (previous.previousStatus ?? 'untranslated')
        : (previous.status ?? 'untranslated'),
    });
    orphaned += 1;
  }
  return { rows, stale, orphaned };
}

function workspaceError(validation) {
  return new Error(`translation validation failed:\n- ${validation.errors.join('\n- ')}`);
}

function exportWorkspace(project) {
  const config = configFor(project);
  const { documents } = documentsFor(project);
  let stale = 0;
  let orphaned = 0;
  const generated = new Set();
  const result = withStagingDirectory(project.paths.translations, (stage) => {
    for (const item of documents.filter((document) => document.resource && document.segments.length > 0)) {
      const relative = path.relative(project.paths.translations, item.translationFile);
      const output = safeJoin(stage, relative, 'translation file');
      const merged = mergedRows(item.segments, readJsonLinesIfPresent(output), output, config.legacyFields);
      writeJsonLines(output, merged.rows);
      generated.add(path.resolve(output));
      stale += merged.stale;
      orphaned += merged.orphaned;
    }
    for (const file of listJsonLines(stage)) {
      if (generated.has(path.resolve(file))) continue;
      const existing = readJsonLines(file).map((row) => normalizeLegacy(row, config.legacyFields));
      if (existing.length === 0) {
        fs.rmSync(file);
        continue;
      }
      const rows = existing.map((row) => ({
        ...row,
        status: 'orphaned',
        previousStatus: row.status === 'orphaned'
          ? (row.previousStatus ?? 'untranslated')
          : (row.status ?? 'untranslated'),
      }));
      orphaned += rows.filter((row, index) => existing[index].status !== 'orphaned').length;
      writeJsonLines(file, rows);
    }
    const validation = validateTranslationWorkspace(stage);
    if (validation.errors.length > 0) throw workspaceError(validation);
    return { files: validation.files, segments: validation.segments, stale, orphaned };
  }, { copyExisting: true });
  return result;
}

function buildApplyPlan(project) {
  const validation = validateTranslationWorkspace(project.paths.translations);
  if (validation.errors.length > 0) throw workspaceError(validation);
  if ((validation.byStatus.stale ?? 0) > 0) throw new Error('stale segments must be retranslated before applying');
  const config = configFor(project);
  const { documents, byKey } = documentsFor(project);
  const globalIds = new Map();
  const rowsByFile = new Map();
  for (const file of listJsonLines(project.paths.translations)) {
    rowsByFile.set(path.resolve(file), indexRows(readJsonLines(file), file, globalIds));
  }
  const liveIds = new Set();
  const modified = new Map();
  let applied = 0;
  for (const item of documents.filter((document) => document.resource && document.segments.length > 0)) {
    const rows = rowsByFile.get(path.resolve(item.translationFile));
    if (!rows) throw new Error(`translation file not found: ${item.translationFile}`);
    const liveInFile = new Set();
    for (const descriptor of item.segments) {
      if (liveIds.has(descriptor.id)) throw new Error(`${descriptor.id}: duplicate id in extracted resources`);
      liveIds.add(descriptor.id);
      liveInFile.add(descriptor.id);
      const row = rows.get(descriptor.id);
      if (!row) throw new Error(`${descriptor.id}: no workspace segment; run export before applying`);
      const errors = validateSegment(row, descriptor.id);
      if (errors.length > 0) throw new Error(errors[0]);
      if ((row.protectedTokenSource ?? 'source') !== descriptor.protectedTokenSource) {
        throw new Error(`${descriptor.id}: protectedTokenSource does not match adapter policy; run export`);
      }
      if ((row.protectedTokenProfile ?? 'default') !== descriptor.protectedTokenProfile) {
        throw new Error(`${descriptor.id}: protectedTokenProfile does not match adapter policy; run export`);
      }
      if (hashSource(descriptor.source, descriptor.reference) !== row.sourceHash) {
        throw new Error(`${descriptor.id}: source hash mismatch; run export to refresh the workspace`);
      }
      if (!row.target || !APPLICABLE_STATUSES.includes(row.status)) continue;
      const protectedText = descriptor[descriptor.protectedTokenSource];
      const tokenErrors = compareProtectedTokens(protectedText, row.target, descriptor.protectedTokenProfile);
      if (tokenErrors.length > 0) throw new Error(`${descriptor.id}: ${tokenErrors[0]}`);
      descriptor.write(row.target);
      modified.set(documentKey(item.archive.id, item.file), item);
      applied += 1;
    }
    for (const [id, row] of rows) {
      if (!liveInFile.has(id) && row.status !== 'orphaned') {
        throw new Error(`${id}: workspace row has no extracted source; run export before applying`);
      }
    }
  }
  for (const mutation of config.mutations ?? []) {
    const item = byKey.get(documentKey(mutation.archive, mutation.file));
    if (!item) throw new Error(`mutation document was not loaded: ${mutation.archive}/${mutation.file}`);
    if (applyMutation(item.document, mutation)) modified.set(documentKey(item.archive.id, item.file), item);
  }
  return {
    applied,
    skipped: validation.segments - applied,
    documents: [...modified.values()].sort((a, b) => documentKey(a.archive.id, a.file)
      .localeCompare(documentKey(b.archive.id, b.file))),
  };
}

function manifestFor(plan) {
  const rawDestinations = [];
  return plan.documents.map((item) => {
    if (!fs.existsSync(item.resxFile)) throw new Error(`resource metadata not found: ${item.resxFile}`);
    const packedName = readJson(item.resxFile)?.Context?.FileName;
    if (typeof packedName !== 'string' || packedName.length === 0) {
      throw new Error(`resource metadata has no Context.FileName: ${item.resxFile}`);
    }
    const record = {
      archive: item.archive.id,
      entryDirectory: item.archive.entryDirectory,
      file: item.file,
      relativeJson: toPosix(item.relativeJson),
      rawName: item.rawName,
      packedName,
    };
    registerRelativeDestination(
      rawDestinations,
      path.join(record.archive, record.entryDirectory, record.rawName),
      `${record.archive}/${record.file}`,
      'raw archive destination',
    );
    return record;
  });
}

function writeApplied(project, plan) {
  const patchedRoot = path.join(project.paths.work, 'patched');
  const manifest = manifestFor(plan);
  withStagingDirectory(patchedRoot, (stage) => {
    for (const [index, item] of plan.documents.entries()) {
      const meta = manifest[index];
      const output = safeJoin(stage, meta.relativeJson, 'patched resource');
      writeJson(output, item.document);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.copyFileSync(item.resxFile, output.replace(/\.json$/i, '.resx.json'));
    }
    writeJson(path.join(stage, 'manifest.json'), manifest);
  });
  return { applied: plan.applied, skipped: plan.skipped, modified: manifest.length };
}

function readApplied(project, plan) {
  const patchedRoot = path.join(project.paths.work, 'patched');
  const manifestFile = path.join(patchedRoot, 'manifest.json');
  if (!fs.existsSync(manifestFile)) throw new Error('missing applied resources, run apply first');
  const expected = manifestFor(plan);
  const actual = readJson(manifestFile);
  if (!sameJson(actual, expected)) throw new Error('applied resource manifest is out of date, run apply again');
  for (let index = 0; index < plan.documents.length; index += 1) {
    const file = safeJoin(patchedRoot, expected[index].relativeJson, 'patched resource');
    if (!fs.existsSync(file) || !sameJson(readJson(file), plan.documents[index].document)) {
      throw new Error(`applied resources are out of date, run apply again: ${expected[index].relativeJson}`);
    }
  }
  return { patchedRoot, manifest: expected };
}

function safeItemName(item) {
  // Sanitization alone can collapse distinct resource names to the same path. Bind the
  // inert name to the original identity and retain an extension for FreeMote's output.
  const identity = `${item.archive}\0${item.file}\0${item.packedName}`;
  const digest = crypto.createHash('sha256').update(identity, 'utf8').digest('hex').slice(0, 12);
  const sanitized = `${item.archive}-${item.packedName}`.replace(/[^A-Za-z0-9._-]/g, '_');
  const candidateExtension = path.extname(sanitized);
  const hasUsableExtension = /^\.[A-Za-z0-9_-]+$/.test(candidateExtension);
  const extension = hasUsableExtension ? candidateExtension : '.packed';
  const stem = hasUsableExtension ? sanitized.slice(0, -extension.length) : sanitized;
  const boundedStem = stem.slice(0, 96).replace(/[. ]+$/g, '') || 'resource';
  return `${boundedStem}-${digest}${extension}`;
}

function fileInventory(root) {
  if (!fs.existsSync(root)) throw new Error(`archive entry directory not found: ${root}`);
  const files = [];
  const visit = (directory, relativeDirectory = '') => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = path.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) visit(path.join(directory, entry.name), relative);
      else if (entry.isFile()) files.push(toPosix(relative));
      else throw new Error(`unsupported archive entry type: ${toPosix(relative)}`);
    }
  };
  visit(root);
  return files.sort();
}

function toolCall(runTool, tools, crypto, id, args, cwd, label) {
  return runTool({ executable: tools[id], args, cwd, label, secrets: [crypto.key] });
}

export function createFreeMoteInfoPsbAdapter({
  runTool = createToolRunner(),
  resolveTools = resolveFreeMoteTools,
} = {}) {
  return {
    id: 'freemote-info-psb',
    description: 'FreeMote-backed localization for keyed info.psb.m/body.bin archives.',
    stability: 'experimental',

    inspect(project) {
      const config = configFor(project);
      return {
        adapter: this.id,
        stability: this.stability,
        archives: config.archives.map((archive) => ({
          id: archive.id,
          handlers: archive.resources.map((resource) => resource.handler),
        })),
        sourceAvailable: fs.existsSync(project.paths.source),
        toolsAvailable: typeof project.paths.freeMote === 'string' && fs.existsSync(project.paths.freeMote),
        extracted: fs.existsSync(path.join(project.paths.work, 'extracted')),
      };
    },

    extract(project) {
      const config = configFor(project, { requireCrypto: true });
      const tools = resolveTools(project);
      const target = path.join(project.paths.work, 'extracted');
      return withStagingDirectory(target, (stage) => {
        for (const archive of config.archives) {
          const info = safeJoin(project.paths.source, archive.infoFile, 'archive info file');
          const body = safeJoin(project.paths.source, archive.bodyFile, 'archive body file');
          if (!fs.existsSync(info) || !fs.existsSync(body)) throw new Error(`archive source files not found: ${archive.id}`);
          const full = path.join(stage, `${archive.id}_full`);
          const raw = path.join(stage, `${archive.id}_raw`);
          fs.mkdirSync(full, { recursive: true });
          fs.mkdirSync(raw, { recursive: true });
          toolCall(runTool, tools, config.crypto, 'decompiler', [
            'info-psb', '-k', config.crypto.key, '-l', String(config.crypto.keyLength),
            '-a', '-b', body, '-o', full, info,
          ], project.root, `extract ${archive.id} full resources`);
          toolCall(runTool, tools, config.crypto, 'decompiler', [
            'info-psb', '-k', config.crypto.key, '-l', String(config.crypto.keyLength),
            '-raw', '-b', body, '-o', raw, info,
          ], project.root, `extract ${archive.id} raw resources`);
          for (const root of [full, raw]) {
            if (!fs.existsSync(safeJoin(root, archive.entryDirectory, 'archive entryDirectory'))) {
              throw new Error(`FreeMote did not produce ${archive.id}/${archive.entryDirectory}`);
            }
          }
        }
        return { extracted: config.archives.length, work: 'extracted' };
      });
    },

    export(project) {
      return exportWorkspace(project);
    },

    apply(project) {
      return writeApplied(project, buildApplyPlan(project));
    },

    build(project) {
      const config = configFor(project, { requireCrypto: true });
      const tools = resolveTools(project);
      const plan = buildApplyPlan(project);
      const { patchedRoot, manifest } = readApplied(project, plan);
      const temp = path.join(project.paths.work, `.build-temp-${process.pid}-${Date.now()}`);
      fs.rmSync(temp, { recursive: true, force: true });
      fs.mkdirSync(temp, { recursive: true });
      try {
        return withStagingDirectory(project.paths.output, (output) => {
          const packedByKey = new Map();
          for (const item of manifest) {
            const safe = safeItemName(item);
            const pure = path.join(temp, 'items', `${safe}.pure.psb`);
            const packed = path.join(temp, 'items', safe);
            const json = safeJoin(patchedRoot, item.relativeJson, 'patched resource');
            fs.mkdirSync(path.dirname(pure), { recursive: true });
            toolCall(runTool, tools, config.crypto, 'builder', ['-ns', '-o', pure, json], project.root,
              `compile ${item.archive}/${item.file}`);
            toolCall(runTool, tools, config.crypto, 'converter', ['pack', '-s', 'MZS', pure], project.root,
              `compress ${item.archive}/${item.file}`);
            const shell = `${pure}.MZS`;
            if (!fs.existsSync(shell)) throw new Error(`FreeMote did not produce compressed resource: ${item.file}`);
            toolCall(runTool, tools, config.crypto, 'converter', [
              'mpack', '-r', '-s', `${config.crypto.key}${item.packedName}`,
              '-l', String(config.crypto.keyLength), '-o', packed, shell,
            ], project.root, `encrypt ${item.archive}/${item.file}`);
            if (!fs.existsSync(packed)) throw new Error(`FreeMote did not produce packed resource: ${item.file}`);
            packedByKey.set(documentKey(item.archive, item.file), packed);
          }

          for (const archive of config.archives) {
            const roots = archiveRoots(project, archive);
            const sourceRoot = path.join(temp, `${archive.id}-archive-source`);
            const plainRoot = path.join(temp, `${archive.id}-archive-plain`);
            fs.cpSync(roots.raw, sourceRoot, { recursive: true });
            for (const item of manifest.filter((entry) => entry.archive === archive.id)) {
              const destination = safeJoin(
                sourceRoot,
                path.join(archive.entryDirectory, item.rawName),
                'raw archive entry',
              );
              fs.mkdirSync(path.dirname(destination), { recursive: true });
              fs.copyFileSync(packedByKey.get(documentKey(item.archive, item.file)), destination);
            }
            const infoJson = safeJoin(sourceRoot, `${archive.infoFile}.json`, 'archive info JSON');
            const infoResx = safeJoin(sourceRoot, `${archive.infoFile}.resx.json`, 'archive info metadata');
            const resx = readJson(infoResx);
            if (!isRecord(resx.Context)) throw new Error(`archive metadata has no Context: ${archive.id}`);
            resx.Context.MdfKey = null;
            resx.Context.MdfMtKey = null;
            writeJson(infoResx, resx);
            fs.mkdirSync(plainRoot, { recursive: true });
            toolCall(runTool, tools, config.crypto, 'builder', [
              'info-psb', '-raw', '-o', plainRoot, infoJson,
            ], sourceRoot, `build archive ${archive.id}`);
            const plainBody = safeJoin(plainRoot, archive.bodyFile, 'built archive body');
            const plainInfo = safeJoin(plainRoot, archive.infoFile, 'built archive info');
            const outputBody = safeJoin(output, archive.bodyFile, 'output archive body');
            const outputInfo = safeJoin(output, archive.infoFile, 'output archive info');
            if (!fs.existsSync(plainBody) || !fs.existsSync(plainInfo)) {
              throw new Error(`FreeMote did not produce archive outputs: ${archive.id}`);
            }
            fs.mkdirSync(path.dirname(outputBody), { recursive: true });
            fs.mkdirSync(path.dirname(outputInfo), { recursive: true });
            fs.copyFileSync(plainBody, outputBody);
            toolCall(runTool, tools, config.crypto, 'converter', [
              'mpack', '-r', '-s', `${config.crypto.key}${archive.infoFile}`,
              '-l', String(config.crypto.keyLength), '-o', outputInfo, plainInfo,
            ], project.root, `encrypt archive ${archive.id}`);
          }
          return { built: config.archives.length, modified: manifest.length, output: project.paths.output };
        });
      } finally {
        fs.rmSync(temp, { recursive: true, force: true });
      }
    },

    verify(project) {
      const config = configFor(project, { requireCrypto: true });
      const tools = resolveTools(project);
      const plan = buildApplyPlan(project);
      const { patchedRoot, manifest } = readApplied(project, plan);
      const target = path.join(project.paths.work, 'verified');
      return withStagingDirectory(target, (stage) => {
        for (const archive of config.archives) {
          const info = safeJoin(project.paths.output, archive.infoFile, 'built archive info');
          const body = safeJoin(project.paths.output, archive.bodyFile, 'built archive body');
          if (!fs.existsSync(info) || !fs.existsSync(body)) throw new Error(`build output not found: ${archive.id}`);
          const full = path.join(stage, `${archive.id}_full`);
          const raw = path.join(stage, `${archive.id}_raw`);
          fs.mkdirSync(full, { recursive: true });
          fs.mkdirSync(raw, { recursive: true });
          toolCall(runTool, tools, config.crypto, 'decompiler', [
            'info-psb', '-k', config.crypto.key, '-l', String(config.crypto.keyLength),
            '-a', '-b', body, '-o', full, info,
          ], project.root, `verify archive ${archive.id} full resources`);
          toolCall(runTool, tools, config.crypto, 'decompiler', [
            'info-psb', '-k', config.crypto.key, '-l', String(config.crypto.keyLength),
            '-raw', '-b', body, '-o', raw, info,
          ], project.root, `verify archive ${archive.id} raw resources`);

          const originalEntryRoot = safeJoin(
            archiveRoots(project, archive).raw,
            archive.entryDirectory,
            'original raw archive entryDirectory',
          );
          const verifiedEntryRoot = safeJoin(raw, archive.entryDirectory, 'verified raw archive entryDirectory');
          const originalFiles = fileInventory(originalEntryRoot);
          const verifiedFiles = fileInventory(verifiedEntryRoot);
          if (!sameJson(originalFiles, verifiedFiles)) {
            throw new Error(`verified raw archive inventory differs from original: ${archive.id}`);
          }
          const modifiedRawNames = new Set(manifest
            .filter((entry) => entry.archive === archive.id)
            .map((entry) => toPosix(path.relative(
              originalEntryRoot,
              safeJoin(originalEntryRoot, entry.rawName, 'modified raw archive entry'),
            ))));
          for (const relative of originalFiles) {
            if (modifiedRawNames.has(relative)) continue;
            const expected = safeJoin(originalEntryRoot, relative, 'original raw archive entry');
            const actual = safeJoin(verifiedEntryRoot, relative, 'verified raw archive entry');
            if (!fs.readFileSync(actual).equals(fs.readFileSync(expected))) {
              throw new Error(`verified raw archive entry differs from original: ${archive.id}/${relative}`);
            }
          }

          for (const item of manifest.filter((entry) => entry.archive === archive.id)) {
            const expected = safeJoin(patchedRoot, item.relativeJson, 'patched resource');
            const actual = safeJoin(full, item.relativeJson, 'verified resource');
            if (!fs.existsSync(actual) || !sameResourceJson(readJson(actual), readJson(expected))) {
              throw new Error(`verified resource differs from applied resource: ${archive.id}/${item.file}`);
            }
          }
        }
        return { verified: config.archives.length, checked: manifest.length };
      });
    },
  };
}

export default createFreeMoteInfoPsbAdapter();
