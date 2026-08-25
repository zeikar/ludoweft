import fs from 'node:fs';
import path from 'node:path';
import { hashSource } from './hash.mjs';
import { writeJsonLines } from './jsonl.mjs';
import { validateSegment, validateTranslationWorkspace } from './segments.mjs';

export const JA_EN_KO_V1 = 'ja-en-ko-v1';

const LEGACY_FIELDS = new Set([
  'id',
  'file',
  'scene',
  'text',
  'pointer',
  'sourceHash',
  'ja',
  'en',
  'ko',
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function pathEntryExists(file) {
  try {
    fs.lstatSync(file);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === ''
    || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

// Resolve symlinks in the existing part of a prospective output path. This prevents
// an apparently separate output from resolving back inside the input workspace.
function canonicalizeProspective(file) {
  let existing = file;
  const missing = [];
  while (!pathEntryExists(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    missing.unshift(path.basename(existing));
    existing = parent;
  }
  const canonical = pathEntryExists(existing) ? fs.realpathSync.native(existing) : existing;
  return path.resolve(canonical, ...missing);
}

function assertSeparateTrees(input, output) {
  if (isWithin(input, output) || isWithin(output, input)) {
    throw new Error('input and output must be separate, non-nested directories');
  }
}

function listLegacyFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(fullPath);
    }
  };
  visit(root);
  return files.sort();
}

function safeRelative(root, file) {
  const relative = path.relative(root, file);
  if (relative === '' || path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    throw new Error('JSONL input resolved outside the input directory');
  }
  return relative;
}

function portableRelative(relative) {
  return relative.split(path.sep).join('/');
}

function readLegacyRows(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line === '') continue;
    try {
      rows.push({ line: index + 1, value: JSON.parse(line) });
    } catch (error) {
      throw new Error(`${file}:${index + 1}: invalid JSON: ${error.message}`);
    }
  }
  return rows;
}

function validateLegacyRow(row, location) {
  const errors = [];
  if (!isRecord(row)) return [`${location}: must be an object`];

  for (const field of ['id', 'sourceHash', 'ja', 'en', 'ko']) {
    if (typeof row[field] !== 'string') errors.push(`${location}: ${field} must be a string`);
  }
  if (row.id === '') errors.push(`${location}: id must not be empty`);
  if (row.file !== undefined && (typeof row.file !== 'string' || row.file === '')) {
    errors.push(`${location}: file must be a non-empty string when present`);
  }
  for (const field of ['scene', 'text']) {
    if (row[field] !== undefined && (!Number.isSafeInteger(row[field]) || row[field] < 0)) {
      errors.push(`${location}: ${field} must be a non-negative safe integer when present`);
    }
  }
  if (row.pointer !== undefined && (typeof row.pointer !== 'string' || row.pointer === '')) {
    errors.push(`${location}: pointer must be a non-empty string when present`);
  }
  for (const field of Object.keys(row)) {
    if (!LEGACY_FIELDS.has(field)) errors.push(`${location}: unknown legacy field ${field}`);
  }
  return errors;
}

function convertLegacyRow(row) {
  const sourceHash = hashSource(row.ja, row.en);
  const legacy = {};
  for (const field of ['file', 'scene', 'text', 'pointer']) {
    if (row[field] !== undefined) legacy[field] = row[field];
  }

  const converted = {
    id: row.id,
    source: row.ja,
    reference: row.en,
    target: row.ko,
    sourceHash,
    // Imported targets have not passed Ludoweft's review/validation workflow yet.
    status: row.ko.length > 0 ? 'draft' : 'untranslated',
  };
  if (Object.keys(legacy).length > 0) converted.context = { legacy };
  return converted;
}

function analyzeInput(input) {
  const files = listLegacyFiles(input);
  if (files.length === 0) throw new Error(`legacy translation workspace has no .jsonl files: ${input}`);

  const ids = new Map();
  const convertedFiles = [];
  let segments = 0;
  let draft = 0;

  for (const file of files) {
    const relative = safeRelative(input, file);
    const rows = [];
    for (const entry of readLegacyRows(file)) {
      const location = `${portableRelative(relative)}:${entry.line}`;
      const errors = validateLegacyRow(entry.value, location);
      if (errors.length > 0) throw new Error(`invalid legacy JSONL:\n- ${errors.join('\n- ')}`);

      const previous = ids.get(entry.value.id);
      if (previous !== undefined) {
        throw new Error(`${location}: duplicate id also found at ${previous}`);
      }
      ids.set(entry.value.id, location);

      const expectedHash = hashSource(entry.value.ja, entry.value.en);
      if (entry.value.sourceHash !== expectedHash) {
        throw new Error(`${location}: sourceHash does not match ja and en`);
      }

      const converted = convertLegacyRow(entry.value);
      const convertedErrors = validateSegment(converted, location);
      if (convertedErrors.length > 0) {
        throw new Error(`legacy row cannot be converted to a valid segment:\n- ${convertedErrors.join('\n- ')}`);
      }
      rows.push(converted);
      segments += 1;
      if (converted.status === 'draft') draft += 1;
    }
    convertedFiles.push({ relative, rows });
  }

  return { convertedFiles, segments, draft };
}

function resultFor({ dryRun, convertedFiles, segments, draft }) {
  return {
    format: JA_EN_KO_V1,
    dryRun,
    files: convertedFiles.length,
    segments,
    draft,
    untranslated: segments - draft,
    outputFiles: convertedFiles.map(({ relative }) => portableRelative(relative)),
  };
}

export function importLegacyJsonl({ input, output, format = JA_EN_KO_V1, dryRun = false } = {}) {
  if (format !== JA_EN_KO_V1) throw new Error(`unsupported import format: ${String(format)}`);
  if (typeof input !== 'string' || input.length === 0) throw new Error('input must be a non-empty path');
  if (typeof output !== 'string' || output.length === 0) throw new Error('output must be a non-empty path');
  if (typeof dryRun !== 'boolean') throw new Error('dryRun must be a boolean');

  const inputPath = path.resolve(input);
  const outputPath = path.resolve(output);
  assertSeparateTrees(inputPath, outputPath);

  if (!pathEntryExists(inputPath)) throw new Error(`legacy translation workspace not found: ${inputPath}`);
  if (!fs.statSync(inputPath).isDirectory()) throw new Error(`legacy translation workspace is not a directory: ${inputPath}`);

  const canonicalInput = fs.realpathSync.native(inputPath);
  const canonicalOutput = canonicalizeProspective(outputPath);
  assertSeparateTrees(canonicalInput, canonicalOutput);
  if (pathEntryExists(outputPath)) throw new Error(`output already exists: ${outputPath}`);

  const analysis = analyzeInput(inputPath);
  const result = resultFor({ dryRun, ...analysis });
  if (dryRun) return result;

  const outputParent = path.dirname(outputPath);
  fs.mkdirSync(outputParent, { recursive: true });
  const stage = fs.mkdtempSync(path.join(outputParent, `.${path.basename(outputPath)}.ludoweft-import-`));
  let promoted = false;
  try {
    for (const { relative, rows } of analysis.convertedFiles) {
      writeJsonLines(path.join(stage, relative), rows);
    }

    const validation = validateTranslationWorkspace(stage);
    if (validation.errors.length > 0) {
      throw new Error(`staged translation workspace is invalid:\n- ${validation.errors.join('\n- ')}`);
    }
    if (validation.files !== analysis.convertedFiles.length || validation.segments !== analysis.segments) {
      throw new Error('staged translation workspace does not match the analyzed import');
    }
    if (pathEntryExists(outputPath)) throw new Error(`output already exists: ${outputPath}`);

    fs.renameSync(stage, outputPath);
    promoted = true;
    return result;
  } finally {
    if (!promoted && pathEntryExists(stage)) fs.rmSync(stage, { recursive: true, force: true });
  }
}
