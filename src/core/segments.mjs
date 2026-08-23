import { listJsonLines, readJsonLines } from './jsonl.mjs';

export function extractProtectedTokens(text) {
  if (typeof text !== 'string') return [];
  const patterns = [/\{\{[^{}]+\}\}/g, /\{[^{}]+\}/g, /%[A-Za-z0-9_]+%/g, /<\/?[A-Za-z][^>]*>/g];
  return [...new Set(patterns.flatMap((pattern) => text.match(pattern) ?? []))].sort();
}

export function validateSegment(row, location = 'segment') {
  const errors = [];
  if (!row || typeof row !== 'object' || Array.isArray(row)) return [`${location}: must be an object`];
  for (const field of ['id', 'source', 'target', 'sourceHash']) {
    if (typeof row[field] !== 'string') errors.push(`${location}: ${field} must be a string`);
  }
  if (row.reference !== undefined && typeof row.reference !== 'string') {
    errors.push(`${location}: reference must be a string when present`);
  }
  if (row.protectedTokens !== undefined && !Array.isArray(row.protectedTokens)) {
    errors.push(`${location}: protectedTokens must be an array when present`);
  }
  if (typeof row.target === 'string' && row.target.length > 0) {
    for (const token of row.protectedTokens ?? []) {
      if (!row.target.includes(token)) errors.push(`${location}: target is missing protected token ${token}`);
    }
  }
  return errors;
}

export function validateTranslationWorkspace(root) {
  const files = listJsonLines(root);
  const errors = [];
  const ids = new Map();
  let segments = 0;
  let translated = 0;

  for (const file of files) {
    const rows = readJsonLines(file);
    rows.forEach((row, index) => {
      const location = `${file}:${index + 1}`;
      errors.push(...validateSegment(row, location));
      if (typeof row.id === 'string') {
        if (ids.has(row.id)) errors.push(`${location}: duplicate id also found at ${ids.get(row.id)}`);
        else ids.set(row.id, location);
      }
      segments += 1;
      if (typeof row.target === 'string' && row.target.length > 0) translated += 1;
    });
  }
  return { files: files.length, segments, translated, errors };
}
