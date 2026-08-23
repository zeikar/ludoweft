import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_PATHS = ['source', 'work', 'translations', 'output'];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function merge(base, overlay) {
  if (!isRecord(base) || !isRecord(overlay)) return overlay;
  const result = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    result[key] = isRecord(value) && isRecord(result[key]) ? merge(result[key], value) : value;
  }
  return result;
}

export function validateProject(project) {
  const errors = [];
  if (!isRecord(project)) return ['project must be a JSON object'];
  if (project.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (typeof project.id !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(project.id)) {
    errors.push('id must use lowercase letters, digits, dots, underscores, or hyphens');
  }
  if (typeof project.adapter !== 'string' || project.adapter.length === 0) errors.push('adapter is required');
  if (!isRecord(project.languages)) errors.push('languages is required');
  else {
    if (typeof project.languages.source !== 'string') errors.push('languages.source is required');
    if (typeof project.languages.target !== 'string') errors.push('languages.target is required');
  }
  if (!isRecord(project.paths)) errors.push('paths is required');
  else {
    for (const name of REQUIRED_PATHS) {
      if (typeof project.paths[name] !== 'string' || project.paths[name].length === 0) {
        errors.push(`paths.${name} is required`);
      }
    }
  }
  return errors;
}

export function readProject(projectFile) {
  const absoluteFile = path.resolve(projectFile);
  if (!fs.existsSync(absoluteFile)) throw new Error(`project manifest not found: ${absoluteFile}`);
  let project;
  try {
    project = JSON.parse(fs.readFileSync(absoluteFile, 'utf8'));
  } catch (error) {
    throw new Error(`cannot parse project manifest: ${error.message}`);
  }

  const root = path.dirname(absoluteFile);
  if (project.localConfig) {
    const localFile = path.resolve(root, project.localConfig);
    if (fs.existsSync(localFile)) {
      project = merge(project, JSON.parse(fs.readFileSync(localFile, 'utf8')));
    }
  }

  const errors = validateProject(project);
  if (errors.length > 0) throw new Error(`invalid project manifest:\n- ${errors.join('\n- ')}`);
  const paths = Object.fromEntries(
    Object.entries(project.paths).map(([key, value]) => [key, path.resolve(root, value)]),
  );
  return { file: absoluteFile, root, config: project, paths };
}

export function redactProject(project) {
  const secretPattern = /(key|secret|token|password)/i;
  const visit = (value) => {
    if (Array.isArray(value)) return value.map(visit);
    if (!isRecord(value)) return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, secretPattern.test(key) ? '<redacted>' : visit(item)]),
    );
  };
  return visit(project);
}
