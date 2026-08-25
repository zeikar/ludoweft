import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ID_PATTERN, validateProject } from './project.mjs';

const LANGUAGE_TAG_PATTERN = /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/i;

const DEFAULT_PATHS = Object.freeze({
  source: './game-data',
  work: './.ludoweft/work',
  translations: './translations',
  output: './dist',
});

const GITIGNORE_RULES = Object.freeze(['*.local.json', 'game-data/', '.ludoweft/', 'dist/']);

function validateLanguageTag(value, option) {
  if (typeof value !== 'string' || !LANGUAGE_TAG_PATTERN.test(value)) {
    throw new Error(`${option} must be a valid language tag (for example: ja, en, or zh-Hant)`);
  }
}

function lstatIfPresent(file) {
  try {
    return fs.lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

export function deriveProjectId(projectFile) {
  const directory = path.basename(path.dirname(path.resolve(projectFile)));
  const candidate = directory
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/-+/g, '-')
    .replace(/[._-]+$/, '');

  return PROJECT_ID_PATTERN.test(candidate) ? candidate : 'ludoweft-project';
}

function planGitignore(projectRoot) {
  const file = path.join(projectRoot, '.gitignore');
  let existing = '';
  const status = lstatIfPresent(file);
  if (status !== undefined) {
    if (!status.isFile() || status.isSymbolicLink()) {
      throw new Error(`cannot update project .gitignore because it is not a regular file: ${file}`);
    }
    existing = fs.readFileSync(file, 'utf8');
  }

  const present = new Set(existing.split(/\r?\n/));
  const added = GITIGNORE_RULES.filter((rule) => !present.has(rule));
  const newline = existing.includes('\r\n') ? '\r\n' : '\n';
  const prefix = existing.length > 0 && !existing.endsWith('\n') ? newline : '';
  const content = added.length > 0
    ? `${existing}${prefix}${added.join(newline)}${newline}`
    : existing;
  return {
    file,
    added,
    content,
    snapshot: {
      existed: status !== undefined,
      content: status === undefined ? undefined : fs.readFileSync(file),
    },
  };
}

function restoreFile(file, snapshot) {
  if (snapshot.existed) {
    fs.writeFileSync(file, snapshot.content);
    return;
  }
  const status = lstatIfPresent(file);
  if (status !== undefined) fs.unlinkSync(file);
}

function rollbackOrThrow(error, restores) {
  const rollbackErrors = [];
  for (const restore of restores) {
    try {
      restore();
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError.message);
    }
  }
  if (rollbackErrors.length > 0) {
    throw new Error(`${error.message}\nrollback failed:\n- ${rollbackErrors.join('\n- ')}`, { cause: error });
  }
  throw error;
}

export function initializeProject({
  projectFile,
  adapter,
  id = deriveProjectId(projectFile),
  sourceLanguage,
  referenceLanguage,
  targetLanguage,
  force = false,
}) {
  if (typeof adapter !== 'string' || adapter.length === 0) throw new Error('--adapter is required');
  if (typeof sourceLanguage !== 'string') throw new Error('--source-language is required');
  if (typeof targetLanguage !== 'string') throw new Error('--target-language is required');
  if (!PROJECT_ID_PATTERN.test(id)) {
    throw new Error('--id must use lowercase letters, digits, dots, underscores, or hyphens');
  }

  validateLanguageTag(sourceLanguage, '--source-language');
  validateLanguageTag(targetLanguage, '--target-language');
  if (referenceLanguage !== undefined) validateLanguageTag(referenceLanguage, '--reference-language');
  if (sourceLanguage.toLowerCase() === targetLanguage.toLowerCase()) {
    throw new Error('--source-language and --target-language must be different');
  }

  const absoluteFile = path.resolve(projectFile);
  const projectRoot = path.dirname(absoluteFile);
  const manifestStatus = lstatIfPresent(absoluteFile);
  const existed = manifestStatus !== undefined;
  if (existed) {
    if (!manifestStatus.isFile() || manifestStatus.isSymbolicLink()) {
      throw new Error(`project manifest path is not a regular file: ${absoluteFile}`);
    }
  }
  if (existed && !force) {
    throw new Error(`project manifest already exists: ${absoluteFile} (use --force to overwrite)`);
  }

  const languages = { source: sourceLanguage };
  if (referenceLanguage !== undefined) languages.reference = referenceLanguage;
  languages.target = targetLanguage;

  const manifest = {
    schemaVersion: 1,
    id,
    adapter,
    languages,
    paths: { ...DEFAULT_PATHS },
    localConfig: './ludoweft.local.json',
  };
  const errors = validateProject(manifest);
  if (errors.length > 0) throw new Error(`cannot initialize project:\n- ${errors.join('\n- ')}`);

  fs.mkdirSync(projectRoot, { recursive: true });
  const manifestSnapshot = {
    existed,
    content: existed ? fs.readFileSync(absoluteFile) : undefined,
  };
  const gitignorePlan = planGitignore(projectRoot);
  let manifestAttempted = false;
  let gitignoreAttempted = false;
  try {
    manifestAttempted = true;
    fs.writeFileSync(absoluteFile, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: 'utf8',
      flag: force ? 'w' : 'wx',
    });
    if (gitignorePlan.added.length > 0) {
      gitignoreAttempted = true;
      fs.writeFileSync(gitignorePlan.file, gitignorePlan.content, 'utf8');
    }
  } catch (error) {
    const failure = error.code === 'EEXIST'
      ? new Error(`project manifest already exists: ${absoluteFile} (use --force to overwrite)`, { cause: error })
      : error;
    const restores = [];
    if (gitignoreAttempted) {
      restores.push(() => restoreFile(gitignorePlan.file, gitignorePlan.snapshot));
    }
    // An EEXIST failure from an exclusive create did not modify the file. Every
    // other attempted write may have partially changed it and must be restored.
    if (manifestAttempted && !(error.code === 'EEXIST' && !existed)) {
      restores.push(() => restoreFile(absoluteFile, manifestSnapshot));
    }
    rollbackOrThrow(failure, restores);
  }
  const gitignore = { file: gitignorePlan.file, added: gitignorePlan.added };

  return {
    created: !existed,
    overwritten: existed,
    projectFile: absoluteFile,
    id: manifest.id,
    adapter: manifest.adapter,
    languages: manifest.languages,
    paths: manifest.paths,
    localConfig: manifest.localConfig,
    gitignore,
  };
}
