import { protectedTokenSource } from './slots.mjs';

function pointerEscape(value) {
  return String(value).replaceAll('~', '~0').replaceAll('/', '~1');
}

function stripSuffix(file, suffix) {
  return suffix && file.endsWith(suffix) ? file.slice(0, -suffix.length) : file.replace(/\.json$/i, '');
}

export const localizedStringArrayHandler = {
  id: 'localized-string-array',

  translationName(_document, { file, resource }) {
    return `${stripSuffix(file, resource.jsonSuffix)}.jsonl`;
  },

  rawName(_document, { file, resource }) {
    return stripSuffix(file, resource.jsonSuffix);
  },

  segments(document, { archive, file, resource, slots }) {
    const arrayLength = resource.arrayLength ?? 4;
    if (!Number.isInteger(arrayLength) || arrayLength < 1) {
      throw new Error(`${archive}/${file}: arrayLength must be a positive integer`);
    }
    const protectedFrom = protectedTokenSource(slots);
    const segments = [];
    const visit = (value, parts) => {
      if (Array.isArray(value)) {
        if (value.length === arrayLength && value.every((item) => typeof item === 'string')) {
          const pointer = `/${parts.map(pointerEscape).join('/')}`;
          const id = `${file}:${pointer}`;
          const source = value[slots.source];
          const reference = value[slots.reference];
          if (typeof source !== 'string' || typeof reference !== 'string'
            || typeof value[slots.destination] !== 'string') {
            throw new Error(`${id}: configured language slots must contain strings`);
          }
          segments.push({
            id,
            source,
            reference,
            protectedTokenSource: protectedFrom,
            protectedTokenProfile: resource.protectedTokenProfile ?? 'default',
            context: { archive, file, pointer },
            write(target) { value[slots.destination] = target; },
          });
          return;
        }
        value.forEach((item, index) => visit(item, [...parts, index]));
        return;
      }
      if (value && typeof value === 'object') {
        Object.entries(value).forEach(([key, item]) => visit(item, [...parts, key]));
      }
    };
    visit(document, []);
    return segments;
  },
};
