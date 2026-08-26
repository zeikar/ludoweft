import { protectedTokenSource } from './slots.mjs';

// Some resources keep the language axis at the document root: one complete sub-document per
// language slot, rather than one string per language at each leaf. The entry lists inside those
// sub-documents are often sorted by each language's own collation, so entry N in one slot and
// entry N in another describe different things. When they are, the resource ships an index table
// per language mapping a stable internal id onto that language's display position, and pairing
// has to go through it.

function unescapePointerToken(token) {
  return token.replaceAll('~1', '/').replaceAll('~0', '~');
}

function resolvePointer(document, pointer, label) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) {
    throw new Error(`${label} must be a JSON pointer starting with /`);
  }
  let value = document;
  for (const token of pointer.slice(1).split('/').map(unescapePointerToken)) {
    if (value === null || typeof value !== 'object') return undefined;
    value = Array.isArray(value) ? value[Number(token)] : value[token];
  }
  return value;
}

function stripSuffix(file, suffix) {
  return suffix && file.endsWith(suffix) ? file.slice(0, -suffix.length) : file.replace(/\.json$/i, '');
}

// A display order is only usable when it is a permutation of the entry list. A duplicated or
// out-of-range position would silently pair two languages' unrelated entries.
function readIndexMap(languageDocument, pointer, count, label) {
  const map = resolvePointer(languageDocument, pointer, `${label} indexPointer`);
  if (!Array.isArray(map)) throw new Error(`${label}: indexPointer ${pointer} is not an array`);
  if (map.length !== count) {
    throw new Error(`${label}: index map has ${map.length} entries but the entry list has ${count}`);
  }
  const seen = new Set();
  for (const position of map) {
    if (!Number.isInteger(position) || position < 0 || position >= count) {
      throw new Error(`${label}: index map contains ${position}, which is not a position in the entry list`);
    }
    if (seen.has(position)) throw new Error(`${label}: index map repeats position ${position}`);
    seen.add(position);
  }
  return map;
}

export const perLanguageDocumentHandler = {
  id: 'per-language-document',

  translationName(_document, { file, resource }) {
    return `${stripSuffix(file, resource.jsonSuffix)}.jsonl`;
  },

  rawName(_document, { file, resource }) {
    return stripSuffix(file, resource.jsonSuffix);
  },

  segments(document, { archive, file, resource, slots }) {
    const languagePointer = resource.languagePointer ?? '/language';
    const { entryPointer, indexPointer, fields } = resource;
    if (typeof entryPointer !== 'string') {
      throw new Error(`${archive}/${file}: per-language-document requires entryPointer`);
    }
    if (!Array.isArray(fields) || fields.length === 0
      || fields.some((field) => typeof field !== 'string' || field.length === 0)) {
      throw new Error(`${archive}/${file}: per-language-document requires a non-empty fields[] of strings`);
    }

    const languages = resolvePointer(document, languagePointer, `${archive}/${file} languagePointer`);
    if (!Array.isArray(languages)) {
      throw new Error(`${archive}/${file}: languagePointer ${languagePointer} is not an array`);
    }
    for (const slot of [slots.source, slots.reference, slots.destination]) {
      if (slot >= languages.length) {
        throw new Error(`${archive}/${file}: language slot ${slot} is missing from ${languagePointer}`);
      }
    }

    const label = `${archive}/${file}`;
    const entriesBySlot = new Map();
    const orderBySlot = new Map();
    for (const slot of new Set([slots.source, slots.reference, slots.destination])) {
      const entries = resolvePointer(languages[slot], entryPointer, `${label} entryPointer`);
      if (!Array.isArray(entries)) {
        throw new Error(`${label}: entryPointer ${entryPointer} is not an array in language slot ${slot}`);
      }
      entriesBySlot.set(slot, entries);
      orderBySlot.set(slot, indexPointer === undefined
        ? undefined
        : readIndexMap(languages[slot], indexPointer, entries.length, `${label} slot ${slot}`));
    }

    const counts = [...entriesBySlot.values()].map((entries) => entries.length);
    if (new Set(counts).size > 1) {
      throw new Error(`${label}: language slots have different entry counts (${counts.join(', ')}), so they cannot be paired`);
    }

    const protectedFrom = protectedTokenSource(slots);
    const entryAt = (slot, internalId) => {
      const order = orderBySlot.get(slot);
      return entriesBySlot.get(slot)[order ? order[internalId] : internalId];
    };

    const segments = [];
    for (let internalId = 0; internalId < counts[0]; internalId += 1) {
      const sourceEntry = entryAt(slots.source, internalId);
      const referenceEntry = entryAt(slots.reference, internalId);
      const destinationEntry = entryAt(slots.destination, internalId);
      if (!sourceEntry || !referenceEntry || !destinationEntry) continue;
      for (const field of fields) {
        const source = sourceEntry[field];
        const reference = referenceEntry[field];
        // An empty source field has nothing to translate, and writing into the destination would
        // add text the original never had — a ruby reading the source language does not use, say.
        if (typeof source !== 'string' || source.length === 0) continue;
        if (typeof reference !== 'string' || typeof destinationEntry[field] !== 'string') continue;
        segments.push({
          id: `${file}#${internalId}:${field}`,
          source,
          reference,
          protectedTokenSource: protectedFrom,
          protectedTokenProfile: resource.protectedTokenProfile ?? 'default',
          context: { archive, file, entry: internalId, field },
          write(target) { destinationEntry[field] = target; },
        });
      }
    }
    return segments;
  },
};
