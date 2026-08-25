import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_PATHS = ['source', 'work', 'translations', 'output'];
const MANAGED_PATHS = ['work', 'translations', 'output'];

export const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

// Manifest fields safe to echo back. Everything else — adapterConfig, local overlay
// additions — may carry archive keys, tokens, or machine-local install paths.
const INSPECTABLE_FIELDS = ['schemaVersion', 'id', 'adapter', 'languages', 'paths', 'localConfig'];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function merge(base, overlay) {
  if (!isRecord(base) || !isRecord(overlay)) return overlay;
  const result = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    // Assigning `__proto__` would replace the object's prototype instead of adding a key.
    if (key === '__proto__') continue;
    result[key] = isRecord(value) && isRecord(result[key]) ? merge(result[key], value) : value;
  }
  return result;
}

function readJsonFile(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`cannot parse ${label}: ${file}: ${error.message}`);
  }
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

// A path may not exist yet, but one of its ancestors can still be a symlink.
// Resolve the existing prefix and then reattach the missing suffix so safety
// checks see where the path will actually land.
function canonicalizeProspective(file) {
  let existing = path.resolve(file);
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

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === ''
    || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function pathsMatch(left, right) {
  return isWithin(left, right) && isWithin(right, left);
}

function validateResolvedPaths(root, resolvedPaths) {
  const errors = [];
  const canonicalRoot = fs.realpathSync.native(root);
  const reservedRoots = ['.git', '.hg', '.svn']
    .map((name) => canonicalizeProspective(path.join(root, name)));
  const canonical = Object.fromEntries(
    Object.entries(resolvedPaths).map(([name, value]) => [name, canonicalizeProspective(value)]),
  );

  for (const name of MANAGED_PATHS) {
    if (pathEntryExists(resolvedPaths[name])) {
      const status = fs.lstatSync(resolvedPaths[name]);
      if (!status.isDirectory() || status.isSymbolicLink()) {
        errors.push(`paths.${name} must be a regular directory when it already exists`);
      }
    }
    if (pathsMatch(canonicalRoot, canonical[name])) {
      errors.push(`paths.${name} must not be the project root`);
    } else if (!isWithin(canonicalRoot, canonical[name])) {
      errors.push(`paths.${name} must stay inside the project root`);
    }
    if (reservedRoots.some((reserved) => isWithin(reserved, canonical[name]))) {
      errors.push(`paths.${name} must not be inside version-control metadata`);
    }
  }

  const checkedPairs = new Set();
  for (const managedName of MANAGED_PATHS) {
    for (const otherName of Object.keys(canonical)) {
      if (managedName === otherName) continue;
      const pair = [managedName, otherName].sort().join('\0');
      if (checkedPairs.has(pair)) continue;
      checkedPairs.add(pair);
      if (isWithin(canonical[managedName], canonical[otherName])
        || isWithin(canonical[otherName], canonical[managedName])) {
        errors.push(`paths.${managedName} and paths.${otherName} must be separate, non-nested directories`);
      }
    }
  }
  return errors;
}

export function validateProject(project) {
  const errors = [];
  if (!isRecord(project)) return ['project must be a JSON object'];
  if (project.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (typeof project.id !== 'string' || !PROJECT_ID_PATTERN.test(project.id)) {
    errors.push('id must use lowercase letters, digits, dots, underscores, or hyphens');
  }
  if (typeof project.adapter !== 'string' || project.adapter.length === 0) errors.push('adapter is required');
  if (!isRecord(project.languages)) errors.push('languages is required');
  else {
    for (const name of ['source', 'target']) {
      if (typeof project.languages[name] !== 'string' || project.languages[name].length < 2) {
        errors.push(`languages.${name} must be a language tag of at least two characters`);
      }
    }
    if (project.languages.reference !== undefined
      && (typeof project.languages.reference !== 'string' || project.languages.reference.length < 2)) {
      errors.push('languages.reference must be a language tag of at least two characters when present');
    }
    for (const name of Object.keys(project.languages)) {
      if (!['source', 'reference', 'target'].includes(name)) errors.push(`languages.${name} is not a known field`);
    }
  }
  if (!isRecord(project.paths)) errors.push('paths is required');
  else {
    for (const name of REQUIRED_PATHS) {
      if (project.paths[name] === undefined) errors.push(`paths.${name} is required`);
    }
    // Every entry is resolved against the project root, including adapter-specific ones.
    for (const [name, value] of Object.entries(project.paths)) {
      if (typeof value !== 'string' || value.length === 0) {
        errors.push(`paths.${name} must be a non-empty string`);
      }
    }
  }
  if (project.localConfig !== undefined
    && (typeof project.localConfig !== 'string' || project.localConfig.length === 0)) {
    errors.push('localConfig must be a non-empty string when present');
  }
  if (project.adapterConfig !== undefined && !isRecord(project.adapterConfig)) {
    errors.push('adapterConfig must be an object when present');
  }
  return errors;
}

export function readProject(projectFile) {
  const absoluteFile = path.resolve(projectFile);
  if (!fs.existsSync(absoluteFile)) throw new Error(`project manifest not found: ${absoluteFile}`);
  let project = readJsonFile(absoluteFile, 'project manifest');

  const root = path.dirname(absoluteFile);
  if (typeof project?.localConfig === 'string' && project.localConfig.length > 0) {
    const localFile = path.resolve(root, project.localConfig);
    if (fs.existsSync(localFile)) {
      project = merge(project, readJsonFile(localFile, 'local config'));
    }
  }

  const errors = validateProject(project);
  if (errors.length > 0) throw new Error(`invalid project manifest:\n- ${errors.join('\n- ')}`);
  const paths = Object.fromEntries(
    Object.entries(project.paths).map(([key, value]) => [key, path.resolve(root, value)]),
  );
  const pathErrors = validateResolvedPaths(root, paths);
  if (pathErrors.length > 0) throw new Error(`invalid project manifest:\n- ${pathErrors.join('\n- ')}`);
  return { file: absoluteFile, root, config: project, paths };
}

// Fails closed: an allowlist, not a secret-name heuristic. Adapters surface whatever
// part of their own config is safe through their `inspect` method.
export function redactProject(project) {
  if (!isRecord(project)) return {};
  const safe = {};
  for (const field of INSPECTABLE_FIELDS) {
    if (project[field] === undefined) continue;
    if (field === 'paths' && isRecord(project.paths)) {
      safe.paths = Object.fromEntries(Object.entries(project.paths).map(([name, value]) => [
        name,
        typeof value === 'string' && path.isAbsolute(value) ? '[local absolute path]' : value,
      ]));
    } else if (field === 'localConfig'
      && typeof project.localConfig === 'string'
      && path.isAbsolute(project.localConfig)) {
      safe.localConfig = '[local absolute path]';
    } else safe[field] = project[field];
  }
  const withheld = Object.keys(project).filter((key) => !INSPECTABLE_FIELDS.includes(key)).sort();
  if (withheld.length > 0) safe.withheld = withheld;
  return safe;
}
