import fs from 'node:fs';
import path from 'node:path';
import { hashSource } from '../core/hash.mjs';
import { readJsonLines, writeJsonLines } from '../core/jsonl.mjs';
import { extractProtectedTokens } from '../core/segments.mjs';

function filesFor(project) {
  const files = project.config.adapterConfig?.files;
  if (!Array.isArray(files) || files.length === 0) throw new Error('demo-json requires adapterConfig.files');
  return files;
}

function copyJson(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const document = JSON.parse(fs.readFileSync(source, 'utf8'));
  fs.writeFileSync(destination, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
}

function getEntries(document, root) {
  const entries = document[root];
  if (!Array.isArray(entries)) throw new Error(`expected an array at JSON property ${root}`);
  return entries;
}

const adapter = {
  id: 'demo-json',
  description: 'Synthetic JSON adapter used to test the complete localization round trip.',
  stability: 'stable',

  inspect(project) {
    return {
      adapter: this.id,
      files: filesFor(project).map((item) => item.path),
      languages: project.config.languages,
    };
  },

  extract(project) {
    for (const item of filesFor(project)) {
      copyJson(path.join(project.paths.source, item.path), path.join(project.paths.work, 'extracted', item.path));
    }
    return { extracted: filesFor(project).length };
  },

  export(project) {
    let segments = 0;
    for (const item of filesFor(project)) {
      const sourceFile = path.join(project.paths.work, 'extracted', item.path);
      const outputFile = path.join(project.paths.translations, item.translation ?? `${item.path}.jsonl`);
      const existing = new Map(readJsonLines(outputFile).map((row) => [row.id, row]));
      const document = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
      const rows = getEntries(document, item.root).map((entry, index) => {
        const id = `${item.id}:${entry.id ?? index}`;
        const source = entry[item.text ?? 'text'];
        const reference = item.reference ? (entry[item.reference] ?? '') : '';
        if (typeof source !== 'string') throw new Error(`${id}: source text must be a string`);
        return {
          id,
          source,
          reference,
          target: existing.get(id)?.target ?? '',
          sourceHash: hashSource(source, reference),
          protectedTokens: extractProtectedTokens(source),
          context: {
            file: item.path,
            entry: index,
            speaker: entry[item.speaker ?? 'speaker'] ?? '',
          },
          status: existing.get(id)?.status ?? 'untranslated',
        };
      });
      writeJsonLines(outputFile, rows);
      segments += rows.length;
    }
    return { files: filesFor(project).length, segments };
  },

  apply(project) {
    let applied = 0;
    for (const item of filesFor(project)) {
      const sourceFile = path.join(project.paths.work, 'extracted', item.path);
      const outputFile = path.join(project.paths.work, 'patched', item.path);
      const translationFile = path.join(project.paths.translations, item.translation ?? `${item.path}.jsonl`);
      const rows = new Map(readJsonLines(translationFile).map((row) => [row.id, row]));
      const document = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
      const entries = getEntries(document, item.root);
      entries.forEach((entry, index) => {
        const id = `${item.id}:${entry.id ?? index}`;
        const row = rows.get(id);
        if (!row || !row.target) return;
        const source = entry[item.text ?? 'text'];
        const reference = item.reference ? (entry[item.reference] ?? '') : '';
        if (hashSource(source, reference) !== row.sourceHash) throw new Error(`${id}: source hash mismatch`);
        for (const token of row.protectedTokens ?? []) {
          if (!row.target.includes(token)) throw new Error(`${id}: target is missing protected token ${token}`);
        }
        entry[item.text ?? 'text'] = row.target;
        applied += 1;
      });
      fs.mkdirSync(path.dirname(outputFile), { recursive: true });
      fs.writeFileSync(outputFile, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    }
    return { applied };
  },

  build(project) {
    for (const item of filesFor(project)) {
      copyJson(path.join(project.paths.work, 'patched', item.path), path.join(project.paths.output, item.path));
    }
    return { built: filesFor(project).length, output: project.paths.output };
  },

  verify(project) {
    for (const item of filesFor(project)) {
      const outputFile = path.join(project.paths.output, item.path);
      if (!fs.existsSync(outputFile)) throw new Error(`missing build output: ${outputFile}`);
      JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    }
    return { verified: filesFor(project).length };
  },
};

export default adapter;
