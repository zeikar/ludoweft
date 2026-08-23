import fs from 'node:fs';
import { hashSource } from './hash.mjs';
import { listJsonLines, readJsonLines } from './jsonl.mjs';

export const SEGMENT_STATUSES = [
  'untranslated',
  'draft',
  'translated',
  'reviewed',
  'blocked',
  'stale',
  'orphaned',
];

// Only these statuses may reach a build. `stale`, `blocked`, and `draft` are held back.
export const APPLICABLE_STATUSES = ['translated', 'reviewed'];

// A segment cannot have been orphaned before it was orphaned.
export const PREVIOUS_STATUSES = SEGMENT_STATUSES.filter((status) => status !== 'orphaned');

export const SOURCE_HASH_PATTERN = /^[a-f0-9]{64}$/;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Counts non-overlapping tokens so `{{name}}` is claimed whole instead of also yielding `{name}`.
function countProtectedTokens(text) {
  const counts = new Map();
  if (typeof text !== 'string') return counts;
  const patterns = [/\{\{[^{}]+\}\}/g, /%[A-Za-z0-9_]+%/g, /<\/?[A-Za-z][^>]*>/g, /\{[^{}]+\}/g];
  const claimed = [];
  for (const pattern of patterns) {
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      const start = match.index;
      const end = start + match[0].length;
      if (claimed.some(([from, to]) => start < to && end > from)) continue;
      claimed.push([start, end]);
      counts.set(match[0], (counts.get(match[0]) ?? 0) + 1);
    }
  }
  return counts;
}

export function extractProtectedTokens(text) {
  return [...countProtectedTokens(text).keys()].sort();
}

// Compares occurrence counts in both directions, not mere presence: a placeholder dropped
// from one of two occurrences still breaks the rendered string, and one the target invents
// renders as literal text the game never substitutes.
export function compareProtectedTokens(source, target) {
  const sourceCounts = countProtectedTokens(source);
  const targetCounts = countProtectedTokens(target);
  const errors = [];
  for (const token of [...new Set([...sourceCounts.keys(), ...targetCounts.keys()])].sort()) {
    const expected = sourceCounts.get(token) ?? 0;
    const actual = targetCounts.get(token) ?? 0;
    if (actual === expected) continue;
    if (actual === 0) errors.push(`target is missing protected token ${token}`);
    else if (expected === 0) errors.push(`target adds protected token ${token} that the source does not have`);
    else errors.push(`target has protected token ${token} ${actual} times but source has ${expected}`);
  }
  return errors;
}

export function validateSegment(row, location = 'segment') {
  const errors = [];
  if (!isRecord(row)) return [`${location}: must be an object`];

  for (const field of ['id', 'source', 'target', 'sourceHash']) {
    if (typeof row[field] !== 'string') errors.push(`${location}: ${field} must be a string`);
  }
  if (row.id === '') errors.push(`${location}: id must not be empty`);
  for (const field of ['reference', 'translatedBy', 'reviewedBy', 'previousSource']) {
    if (row[field] !== undefined && typeof row[field] !== 'string') {
      errors.push(`${location}: ${field} must be a string when present`);
    }
  }
  if (row.context !== undefined && !isRecord(row.context)) {
    errors.push(`${location}: context must be an object when present`);
  }
  if (row.status !== undefined && !SEGMENT_STATUSES.includes(row.status)) {
    errors.push(`${location}: status must be one of ${SEGMENT_STATUSES.join(', ')}`);
  }
  // Set by export when a segment is orphaned, so it can regain its status if the entry returns.
  if (row.previousStatus !== undefined && !PREVIOUS_STATUSES.includes(row.previousStatus)) {
    errors.push(`${location}: previousStatus must be one of ${PREVIOUS_STATUSES.join(', ')}`);
  }

  if (row.protectedTokens !== undefined && !Array.isArray(row.protectedTokens)) {
    errors.push(`${location}: protectedTokens must be an array when present`);
  } else if (Array.isArray(row.protectedTokens)) {
    if (row.protectedTokens.some((token) => typeof token !== 'string' || token.length === 0)) {
      errors.push(`${location}: protectedTokens entries must be non-empty strings`);
    } else if (new Set(row.protectedTokens).size !== row.protectedTokens.length) {
      errors.push(`${location}: protectedTokens entries must be unique`);
    } else if (typeof row.source === 'string') {
      // The field is agent-editable, so it must still describe this row's own source.
      const derived = extractProtectedTokens(row.source);
      const listed = [...row.protectedTokens].sort();
      if (derived.length !== listed.length || derived.some((token, index) => token !== listed[index])) {
        errors.push(`${location}: protectedTokens does not match the tokens in source`);
      }
    }
  }

  // A forged or corrupted hash must fail here, not silently at apply time.
  if (typeof row.sourceHash === 'string') {
    if (!SOURCE_HASH_PATTERN.test(row.sourceHash)) {
      errors.push(`${location}: sourceHash must be 64 lowercase hex characters`);
    } else if (typeof row.source === 'string' && hashSource(row.source, row.reference ?? '') !== row.sourceHash) {
      errors.push(`${location}: sourceHash does not match source and reference`);
    }
  }

  if (typeof row.source === 'string' && typeof row.target === 'string' && row.target.length > 0) {
    errors.push(...compareProtectedTokens(row.source, row.target).map((error) => `${location}: ${error}`));
  }
  return errors;
}

export function validateTranslationWorkspace(root) {
  const empty = { files: 0, segments: 0, translated: 0, byStatus: {}, errors: [] };
  if (!fs.existsSync(root)) {
    return { ...empty, errors: [`translation workspace not found: ${root}`] };
  }
  const files = listJsonLines(root);
  if (files.length === 0) {
    return { ...empty, errors: [`translation workspace has no .jsonl files: ${root}`] };
  }

  const errors = [];
  const ids = new Map();
  const byStatus = {};
  let segments = 0;
  let translated = 0;

  for (const file of files) {
    readJsonLines(file).forEach((row, index) => {
      const location = `${file}:${index + 1}`;
      errors.push(...validateSegment(row, location));
      segments += 1;
      if (!isRecord(row)) return;
      if (typeof row.id === 'string') {
        if (ids.has(row.id)) errors.push(`${location}: duplicate id also found at ${ids.get(row.id)}`);
        else ids.set(row.id, location);
      }
      const status = typeof row.status === 'string' ? row.status : 'untranslated';
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      if (typeof row.target === 'string' && row.target.length > 0) translated += 1;
    });
  }
  return { files: files.length, segments, translated, byStatus, errors };
}
