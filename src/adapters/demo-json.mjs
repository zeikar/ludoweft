import fs from 'node:fs';
import path from 'node:path';
import { hashSource } from '../core/hash.mjs';
import { readJsonLines, readJsonLinesIfPresent, writeJsonLines } from '../core/jsonl.mjs';
import {
  APPLICABLE_STATUSES,
  compareProtectedTokens,
  extractProtectedTokens,
  validateSegment,
} from '../core/segments.mjs';

function filesFor(project) {
  const files = project.config.adapterConfig?.files;
  if (!Array.isArray(files) || files.length === 0) throw new Error('demo-json requires adapterConfig.files');
  return files;
}

// adapterConfig is project-authored; a `../` segment must not escape the configured root.
function safeJoin(root, relative) {
  if (typeof relative !== 'string' || relative.length === 0) throw new Error('file path must be a non-empty string');
  const target = path.resolve(root, relative);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`path escapes its configured directory: ${relative}`);
  }
  return target;
}

function locations(project, item) {
  const translation = item.translation ?? `${item.path}.jsonl`;
  return {
    extracted: safeJoin(path.join(project.paths.work, 'extracted'), item.path),
    patched: safeJoin(path.join(project.paths.work, 'patched'), item.path),
    translation: safeJoin(project.paths.translations, translation),
    output: safeJoin(project.paths.output, item.path),
    source: safeJoin(project.paths.source, item.path),
  };
}

function writeJson(file, document) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function getEntries(document, root) {
  const entries = document[root];
  if (!Array.isArray(entries)) throw new Error(`expected an array at JSON property ${root}`);
  return entries;
}

function segmentId(item, entry, index) {
  return `${item.id}:${entry.id ?? index}`;
}

function sourceOf(item, entry) {
  return {
    source: entry[item.text ?? 'text'],
    reference: item.reference ? (entry[item.reference] ?? '') : '',
  };
}

function indexById(rows, file) {
  const byId = new Map();
  for (const row of rows) {
    if (byId.has(row.id)) throw new Error(`${file}: duplicate id ${row.id}; resolve it before continuing`);
    byId.set(row.id, row);
  }
  return byId;
}

// The one place that decides what a patched resource must contain. apply writes it, build
// checks the artifact still equals it, and verify checks the build output does — so a stale
// artifact from an earlier run cannot pass any of the three.
function applyDocument(project, item) {
  const place = locations(project, item);
  const rows = indexById(readJsonLines(place.translation), place.translation);

  const stale = [...rows.values()].filter((row) => row.status === 'stale').map((row) => row.id);
  if (stale.length > 0) {
    throw new Error(`stale segments must be retranslated before applying:\n- ${stale.join('\n- ')}`);
  }

  const document = readJson(place.extracted);
  let applied = 0;
  let skipped = 0;
  const live = new Set();
  getEntries(document, item.root).forEach((entry, index) => {
    const id = segmentId(item, entry, index);
    // export refuses duplicate ids; a source edited afterwards must not slip past that gate
    // by pointing two entries at one workspace row.
    if (live.has(id)) {
      throw new Error(`${id}: duplicate segment id in the extracted resources; run export to resolve it`);
    }
    live.add(id);
    const row = rows.get(id);
    if (!row) throw new Error(`${id}: no workspace segment; run export before applying`);
    // A row reaching a build must satisfy the workspace contract, not merely look truthy.
    const rowErrors = validateSegment(row, id);
    if (rowErrors.length > 0) throw new Error(rowErrors[0]);
    const { source, reference } = sourceOf(item, entry);
    if (hashSource(source, reference) !== row.sourceHash) {
      throw new Error(`${id}: source hash mismatch; run export to refresh the workspace`);
    }
    if (!row.target || !APPLICABLE_STATUSES.includes(row.status)) {
      skipped += 1;
      return;
    }
    // Recomputed from the extracted source: the workspace field is agent-editable and
    // must not be the authority for its own check.
    const tokenErrors = compareProtectedTokens(source, row.target);
    if (tokenErrors.length > 0) throw new Error(`${id}: ${tokenErrors[0]}`);
    entry[item.text ?? 'text'] = row.target;
    applied += 1;
  });
  // Orphaned rows have no entry to visit; counting them keeps applied + skipped equal to
  // the number of segments the workspace holds.
  for (const id of rows.keys()) if (!live.has(id)) skipped += 1;
  return { place, document, applied, skipped };
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
      const place = locations(project, item);
      writeJson(place.extracted, readJson(place.source));
    }
    return { extracted: filesFor(project).length };
  },

  export(project) {
    let segments = 0;
    let stale = 0;
    let orphaned = 0;
    for (const item of filesFor(project)) {
      const place = locations(project, item);
      const existing = indexById(readJsonLinesIfPresent(place.translation), place.translation);
      const document = readJson(place.extracted);
      const seen = new Set();

      const rows = getEntries(document, item.root).map((entry, index) => {
        const id = segmentId(item, entry, index);
        if (seen.has(id)) throw new Error(`${id}: duplicate segment id; give source entries unique ids`);
        seen.add(id);
        const { source, reference } = sourceOf(item, entry);
        if (typeof source !== 'string') throw new Error(`${id}: source text must be a string`);
        const sourceHash = hashSource(source, reference);
        const previous = existing.get(id);
        // A returning entry recovers the status it held before it was orphaned.
        const carried = previous?.status === 'orphaned'
          ? (previous.previousStatus ?? 'untranslated')
          : (previous?.status ?? 'untranslated');

        const row = {
          ...previous,
          id,
          source,
          reference,
          target: previous?.target ?? '',
          sourceHash,
          protectedTokens: extractProtectedTokens(source),
          context: {
            file: item.path,
            entry: index,
            speaker: entry[item.speaker ?? 'speaker'] ?? '',
          },
          status: carried,
        };
        delete row.previousStatus;

        if (previous?.target && previous.sourceHash !== sourceHash) {
          // The source moved on: keep the old target for revision, but never its clean status.
          // The anchor is the source the target was actually translated from, so a second
          // change while still stale must not overwrite it with an intermediate revision.
          row.status = 'stale';
          row.previousSource = previous.status === 'stale' && previous.previousSource !== undefined
            ? previous.previousSource
            : previous.source;
        } else if (carried === 'stale') {
          // Still stale from an earlier export; the marker survives until it is revised.
          row.previousSource = previous.previousSource;
        } else {
          delete row.previousSource;
        }
        if (row.status === 'stale') stale += 1;
        if (row.previousSource === undefined) delete row.previousSource;
        return row;
      });

      // Segments whose source entry disappeared are marked, never silently dropped: an
      // upstream patch that removes an entry must not destroy reviewed translations.
      for (const [id, previous] of existing) {
        if (seen.has(id)) continue;
        rows.push({
          ...previous,
          status: 'orphaned',
          previousStatus: previous.status === 'orphaned'
            ? (previous.previousStatus ?? 'untranslated')
            : (previous.status ?? 'untranslated'),
        });
        orphaned += 1;
      }

      writeJsonLines(place.translation, rows);
      segments += rows.length;
    }
    return { files: filesFor(project).length, segments, stale, orphaned };
  },

  apply(project) {
    let applied = 0;
    let skipped = 0;
    // Nothing is written until every file has been applied, so a failure partway through
    // cannot leave half-patched resources for a later `build` to pick up.
    const pending = [];
    for (const item of filesFor(project)) {
      const result = applyDocument(project, item);
      applied += result.applied;
      skipped += result.skipped;
      pending.push([result.place.patched, result.document]);
    }
    for (const [file, document] of pending) writeJson(file, document);
    return { applied, skipped };
  },

  build(project) {
    // Every file is checked before any output is replaced, so a failure on a later file
    // cannot leave the output directory holding a mix of two generations.
    const pending = [];
    for (const item of filesFor(project)) {
      const { place, document } = applyDocument(project, item);
      if (!fs.existsSync(place.patched)) {
        throw new Error(`missing applied resources, run apply first: ${place.patched}`);
      }
      // The artifact on disk must still equal what apply would produce right now, so a
      // leftover from an earlier run cannot be built.
      if (JSON.stringify(readJson(place.patched)) !== JSON.stringify(document)) {
        throw new Error(`applied resources are out of date, run apply again: ${place.patched}`);
      }
      pending.push([place.output, document]);
    }
    for (const [file, document] of pending) writeJson(file, document);
    return { built: pending.length, output: project.paths.output };
  },

  verify(project) {
    let verified = 0;
    let checked = 0;
    for (const item of filesFor(project)) {
      const { place, document, applied } = applyDocument(project, item);
      if (!fs.existsSync(place.output)) throw new Error(`missing build output: ${place.output}`);
      if (JSON.stringify(readJson(place.output)) !== JSON.stringify(document)) {
        throw new Error(`build output does not match the current sources and translations: ${place.output}`);
      }
      checked += applied;
      verified += 1;
    }
    return { verified, checked };
  },
};

export default adapter;
