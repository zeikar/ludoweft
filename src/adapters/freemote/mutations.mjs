const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function decodePointer(pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) {
    throw new Error('mutation path must be an RFC 6901 JSON pointer');
  }
  return pointer.slice(1).split('/').map((part) => {
    const decoded = part.replaceAll('~1', '/').replaceAll('~0', '~');
    if (FORBIDDEN_KEYS.has(decoded)) throw new Error(`mutation path contains forbidden key: ${decoded}`);
    return decoded;
  });
}

function valueAt(document, pointer, { createObject = false } = {}) {
  let value = document;
  const parts = decodePointer(pointer);
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (Array.isArray(value)) {
      if (!/^\d+$/.test(part) || Number(part) >= value.length) throw new Error(`mutation path not found: ${pointer}`);
      value = value[Number(part)];
    } else if (isRecord(value) && Object.hasOwn(value, part)) value = value[part];
    else if (isRecord(value) && createObject && index === parts.length - 1) {
      value[part] = {};
      value = value[part];
    }
    else throw new Error(`mutation path not found: ${pointer}`);
  }
  return value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function applyMutation(document, mutation) {
  if (!isRecord(mutation)) throw new Error('mutation must be an object');
  if (mutation.op === 'appendUnique') {
    const target = valueAt(document, mutation.path);
    if (!Array.isArray(target)) throw new Error(`appendUnique requires an array at ${mutation.path}`);
    if (!isRecord(mutation.match) || !isRecord(mutation.value)) {
      throw new Error('appendUnique requires object match and value fields');
    }
    const found = target.some((item) => isRecord(item)
      && Object.entries(mutation.match).every(([key, value]) => !FORBIDDEN_KEYS.has(key)
        && JSON.stringify(item[key]) === JSON.stringify(value)));
    if (!found) target.push(clone(mutation.value));
    return !found;
  }
  if (mutation.op === 'merge') {
    const target = valueAt(document, mutation.path, { createObject: true });
    if (!isRecord(target) || !isRecord(mutation.value)) throw new Error(`merge requires objects at ${mutation.path}`);
    let changed = false;
    for (const [key, value] of Object.entries(mutation.value)) {
      if (FORBIDDEN_KEYS.has(key)) throw new Error(`mutation value contains forbidden key: ${key}`);
      if (JSON.stringify(target[key]) !== JSON.stringify(value)) changed = true;
      target[key] = clone(value);
    }
    return changed;
  }
  throw new Error(`unsupported mutation operation: ${mutation.op}`);
}
