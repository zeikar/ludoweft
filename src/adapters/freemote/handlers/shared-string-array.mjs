function pointerEscape(value) {
  return String(value).replaceAll('~', '~0').replaceAll('/', '~1');
}

function stripSuffix(file, suffix) {
  return suffix && file.endsWith(suffix) ? file.slice(0, -suffix.length) : file.replace(/\.json$/i, '');
}

function resolvePointer(document, pointer, label) {
  if (pointer === '' || pointer === '/') return document;
  if (!pointer.startsWith('/')) throw new Error(`${label}: pointer must start with /`);
  let value = document;
  for (const raw of pointer.slice(1).split('/')) {
    const key = raw.replaceAll('~1', '/').replaceAll('~0', '~');
    if (value === null || typeof value !== 'object') throw new Error(`${label}: pointer ${pointer} not found`);
    value = Array.isArray(value) ? value[Number(key)] : value[key];
  }
  if (value === undefined) throw new Error(`${label}: pointer ${pointer} not found`);
  return value;
}

// Some documents store one string per entry with no language axis at all — a MAGES title
// keeps its speaker-name list that way, one Japanese string per entry, while the scenario
// beside it carries four language slots per line. There is no reference slot to compare
// against, so the source doubles as the reference and a translation replaces the only copy
// the game has. That makes the edit visible in the original language too; a project should
// decide that deliberately before adding a resource here.
//
// Confirm the strings actually reach the screen before translating them. A document like
// this can be loaded and still not be what the renderer draws from — the same text often
// exists in the scenario as well, and a screen may be a pre-rendered per-language image
// that no text edit can touch.
export const sharedStringArrayHandler = {
  id: 'shared-string-array',

  translationName(_document, { file, resource }) {
    return `${stripSuffix(file, resource.jsonSuffix)}.jsonl`;
  },

  rawName(_document, { file, resource }) {
    return stripSuffix(file, resource.jsonSuffix);
  },

  segments(document, { archive, file, resource }) {
    const pointer = resource.pointer ?? '';
    const target = resolvePointer(document, pointer, `${archive}/${file}`);
    if (!Array.isArray(target)) {
      throw new Error(`${archive}/${file}: pointer ${pointer || '/'} is not an array`);
    }
    const segments = [];
    target.forEach((value, index) => {
      if (typeof value !== 'string' || value.length === 0) return;
      const itemPointer = `${pointer}/${pointerEscape(index)}`;
      segments.push({
        id: `${file}:${itemPointer}`,
        source: value,
        reference: value,
        protectedTokenSource: 'source',
        protectedTokenProfile: resource.protectedTokenProfile ?? 'default',
        context: { archive, file, pointer: itemPointer },
        write(next) { target[index] = next; },
      });
    });
    return segments;
  },
};
