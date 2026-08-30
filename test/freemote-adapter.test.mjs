import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import freeMoteInfoPsb, { createFreeMoteInfoPsbAdapter } from '../src/adapters/freemote-info-psb.mjs';
import { applyMutation } from '../src/adapters/freemote/mutations.mjs';
import { hashSource } from '../src/core/hash.mjs';
import { readJsonLines, writeJsonLines } from '../src/core/jsonl.mjs';
import { readProject } from '../src/core/project.mjs';
import { validateTranslationWorkspace } from '../src/core/segments.mjs';

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function withFixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ludoweft-freemote-test-'));
  try {
    const manifest = {
      schemaVersion: 1,
      id: 'freemote-test-de',
      adapter: 'freemote-info-psb',
      languages: { source: 'fr', reference: 'en', target: 'de' },
      paths: {
        source: './game-data',
        work: './.ludoweft/work',
        translations: './translations',
        output: './dist',
        freeMote: './tools',
      },
      adapterConfig: {
        crypto: { key: 'synthetic-test-key', keyLength: 47 },
        languageSlots: { source: 0, reference: 1, destination: 1, protectedFrom: 'destination' },
        legacyFields: {
          source: 'originalText', reference: 'guideText', target: 'localizedText', translatedStatus: 'translated',
        },
        archives: [
          {
            id: 'story-vault',
            infoFile: 'atlas_story.idx',
            bodyFile: 'atlas_story.payload',
            entryDirectory: 'story-objects',
            resources: [{
              handler: 'mages-scenario',
              include: ['*.scn.m.json'],
              translationDirectory: 'narrative',
            }],
          },
          {
            id: 'menu-vault',
            infoFile: 'widget_catalog.idx',
            bodyFile: 'widget_catalog.payload',
            entryDirectory: 'widget-objects',
            resources: [{
              handler: 'localized-string-array',
              include: ['captions.psb.m.json'],
              arrayLength: 5,
              translationDirectory: 'labels',
            }],
          },
        ],
        mutations: [
          {
            archive: 'menu-vault', file: 'palette.psb.m.json', op: 'appendUnique', path: '/themes',
            match: { id: 'midnight' },
            value: { id: 'midnight', colors: { accent: '#6cc7ff', panel: '#101522' } },
          },
          {
            archive: 'menu-vault', file: 'controls.psb.m.json', op: 'merge', path: '/inputHints',
            value: { accept: { device: 'keyboard', code: 'Enter' }, opacity: 0.1, count: 7 },
          },
        ],
      },
    };
    writeJson(path.join(root, 'ludoweft.project.json'), manifest);

    const storyRoot = path.join(root, '.ludoweft/work/extracted/story-vault_full/story-objects');
    const menuRoot = path.join(root, '.ludoweft/work/extracted/menu-vault_full/widget-objects');
    const scenario = {
      name: 'prologue.route',
      scenes: [{ texts: [[0, [[0, 'Appel'], [1, 'Call %C <pause>']]]] }],
    };
    const config = { menu: [['Utilisateur {name}', 'User {name}\\n', '', '', '']] };
    writeJson(path.join(storyRoot, 'prologue.route.scn.m.json'), scenario);
    writeJson(path.join(menuRoot, 'captions.psb.m.json'), config);
    writeJson(path.join(menuRoot, 'palette.psb.m.json'), { themes: [] });
    writeJson(path.join(menuRoot, 'controls.psb.m.json'), { inputHints: {} });
    for (const [directory, file, packed] of [
      [storyRoot, 'prologue.route.scn.m.resx.json', 'story/primary.psb'],
      [menuRoot, 'captions.psb.m.resx.json', 'label/primary.psb'],
      [menuRoot, 'palette.psb.m.resx.json', 'label?primary.psb'],
      [menuRoot, 'controls.psb.m.resx.json', 'controls.bundle'],
    ]) writeJson(path.join(directory, file), { Context: { FileName: packed } });

    const rawRoots = {
      'story-vault': path.join(root, '.ludoweft/work/extracted/story-vault_raw'),
      'menu-vault': path.join(root, '.ludoweft/work/extracted/menu-vault_raw'),
    };
    for (const archive of manifest.adapterConfig.archives) {
      writeJson(path.join(rawRoots[archive.id], `${archive.infoFile}.json`), { id: archive.id });
      writeJson(path.join(rawRoots[archive.id], `${archive.infoFile}.resx.json`), {
        Context: { MdfKey: 'original', MdfMtKey: 'original' },
      });
    }
    const storyRaw = path.join(rawRoots['story-vault'], 'story-objects');
    const menuRaw = path.join(rawRoots['menu-vault'], 'widget-objects');
    fs.mkdirSync(path.join(storyRaw, 'sidecars'), { recursive: true });
    fs.mkdirSync(path.join(menuRaw, 'sidecars'), { recursive: true });
    fs.writeFileSync(path.join(storyRaw, 'prologue.route'), 'ORIGINAL STORY RESOURCE');
    fs.writeFileSync(path.join(storyRaw, 'sidecars', 'keep.bin'), Buffer.from([0, 1, 2, 3, 255]));
    fs.writeFileSync(path.join(menuRaw, 'captions'), 'ORIGINAL CAPTIONS RESOURCE');
    fs.writeFileSync(path.join(menuRaw, 'palette'), 'ORIGINAL PALETTE RESOURCE');
    fs.writeFileSync(path.join(menuRaw, 'controls'), 'ORIGINAL CONTROLS RESOURCE');
    fs.writeFileSync(path.join(menuRaw, 'sidecars', 'keep.bin'), Buffer.from([9, 8, 7, 6, 0]));

    writeJsonLines(path.join(root, 'translations/narrative/prologue.route.jsonl'), [{
      id: 'prologue.route#s0:t0',
      file: 'prologue.route',
      scene: 0,
      text: 0,
      sourceHash: hashSource('Appel', 'Call %C <pause>'),
      originalText: 'Appel',
      guideText: 'Call %C <pause>',
      localizedText: 'Aufruf %C <pause>',
    }]);
    writeJsonLines(path.join(root, 'translations/labels/captions.jsonl'), [{
      id: 'captions.psb.m.json:/menu/0',
      file: 'captions.psb.m.json',
      pointer: '/menu/0',
      sourceHash: hashSource('Utilisateur {name}', 'User {name}\\n'),
      originalText: 'Utilisateur {name}',
      guideText: 'User {name}\\n',
      localizedText: 'Benutzer {name}\\n',
    }]);

    return run({
      root,
      manifest,
      project: readProject(path.join(root, 'ludoweft.project.json')),
      fullRoots: {
        'story-vault': path.dirname(storyRoot),
        'menu-vault': path.dirname(menuRoot),
      },
      rawRoots,
      resourceMap: {
        'story-vault': [{ rawName: 'prologue.route', relativeJson: 'story-objects/prologue.route.scn.m.json' }],
        'menu-vault': [
          { rawName: 'captions', relativeJson: 'widget-objects/captions.psb.m.json' },
          { rawName: 'palette', relativeJson: 'widget-objects/palette.psb.m.json' },
          { rawName: 'controls', relativeJson: 'widget-objects/controls.psb.m.json' },
        ],
      },
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function snapshotTree(root) {
  const files = new Map();
  const visit = (directory, relativeDirectory = '') => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = path.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) visit(path.join(directory, entry.name), relative);
      else if (entry.isFile()) files.set(relative.split(path.sep).join('/'), fs.readFileSync(path.join(directory, entry.name)));
    }
  };
  visit(root);
  return files;
}

function restoreSnapshot(snapshot, root) {
  for (const [relative, contents] of snapshot) {
    const file = path.join(root, ...relative.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
}

function float32RoundTrip(value) {
  if (typeof value === 'number' && !Number.isInteger(value)) return Math.fround(value);
  if (Array.isArray(value)) return value.map(float32RoundTrip);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, float32RoundTrip(item)]));
  }
  return value;
}

function createFakeLifecycle({ manifest, fullRoots, resourceMap }) {
  const config = manifest.adapterConfig;
  const archives = new Map(config.archives.map((archive) => [archive.id, archive]));
  const originalFull = new Map([...archives.keys()].map((id) => [id, snapshotTree(fullRoots[id])]));
  const builtRaw = new Map();
  const controller = {
    itemOutputPaths: [],
    rawByteCorruption: null,
    extraRawEntry: null,
    fullMutation: null,
  };
  const argument = (args, option) => {
    const index = args.indexOf(option);
    if (index < 0 || index + 1 >= args.length) throw new Error(`fake tool call missing ${option}`);
    return args[index + 1];
  };
  const archiveIdFromLabel = (label, prefix, suffix = '') => label.slice(prefix.length, suffix ? -suffix.length : undefined);

  const runTool = ({ args, cwd, label }) => {
    if (label.startsWith('compile ')) {
      const output = argument(args, '-o');
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.copyFileSync(args.at(-1), output);
      return;
    }
    if (label.startsWith('compress ')) {
      const input = args.at(-1);
      fs.copyFileSync(input, `${input}.MZS`);
      return;
    }
    if (label.startsWith('encrypt archive ')) {
      const output = argument(args, '-o');
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.copyFileSync(args.at(-1), output);
      return;
    }
    if (label.startsWith('encrypt ')) {
      const output = argument(args, '-o');
      controller.itemOutputPaths.push(output);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.copyFileSync(args.at(-1), output);
      return;
    }
    if (label.startsWith('build archive ')) {
      const archiveId = archiveIdFromLabel(label, 'build archive ');
      const archive = archives.get(archiveId);
      const output = argument(args, '-o');
      builtRaw.set(archiveId, snapshotTree(cwd));
      fs.mkdirSync(output, { recursive: true });
      fs.writeFileSync(path.join(output, archive.bodyFile), `body:${archiveId}`);
      writeJson(path.join(output, archive.infoFile), { archive: archiveId });
      return;
    }
    if (label.startsWith('verify archive ') && label.endsWith(' raw resources')) {
      const archiveId = archiveIdFromLabel(label, 'verify archive ', ' raw resources');
      const archive = archives.get(archiveId);
      const output = argument(args, '-o');
      restoreSnapshot(builtRaw.get(archiveId), output);
      if (controller.rawByteCorruption?.archive === archiveId) {
        const file = path.join(output, archive.entryDirectory, ...controller.rawByteCorruption.relative.split('/'));
        fs.writeFileSync(file, 'CORRUPTED BY FAKE DECOMPILER');
      }
      if (controller.extraRawEntry?.archive === archiveId) {
        const file = path.join(output, archive.entryDirectory, ...controller.extraRawEntry.relative.split('/'));
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, 'UNEXPECTED ENTRY');
      }
      return;
    }
    if (label.startsWith('verify archive ') && label.endsWith(' full resources')) {
      const archiveId = archiveIdFromLabel(label, 'verify archive ', ' full resources');
      const archive = archives.get(archiveId);
      const output = argument(args, '-o');
      restoreSnapshot(originalFull.get(archiveId), output);
      const snapshot = builtRaw.get(archiveId);
      for (const item of resourceMap[archiveId]) {
        const packed = snapshot.get(`${archive.entryDirectory}/${item.rawName}`);
        if (!packed) continue;
        try {
          writeJson(
            path.join(output, ...item.relativeJson.split('/')),
            float32RoundTrip(JSON.parse(packed.toString('utf8'))),
          );
        } catch {
          // Unmodified synthetic resources are opaque raw bytes, just like real packed entries.
        }
      }
      if (controller.fullMutation?.archive === archiveId) {
        const file = path.join(output, ...controller.fullMutation.relativeJson.split('/'));
        const document = JSON.parse(fs.readFileSync(file, 'utf8'));
        controller.fullMutation.mutate(document);
        writeJson(file, document);
      }
      return;
    }
    throw new Error(`unexpected fake tool call: ${label}`);
  };

  return {
    adapter: createFreeMoteInfoPsbAdapter({
      runTool,
      resolveTools: () => ({ decompiler: 'fake-decompiler', builder: 'fake-builder', converter: 'fake-converter' }),
    }),
    controller,
  };
}

function prepareLifecycle(fixture) {
  const lifecycle = createFakeLifecycle(fixture);
  lifecycle.adapter.export(fixture.project);
  const storyFile = path.join(fixture.root, 'translations/narrative/prologue.route.jsonl');
  const storyRows = readJsonLines(storyFile);
  storyRows[0].target = '';
  storyRows[0].status = 'untranslated';
  writeJsonLines(storyFile, storyRows);
  assert.deepEqual(lifecycle.adapter.apply(fixture.project), { applied: 1, skipped: 1, modified: 3 });
  return lifecycle;
}

test('freemote adapter migrates legacy rows and applies destination-slot translations', () => withFixture(
  ({ root, project }) => {
    const exported = freeMoteInfoPsb.export(project);
    assert.deepEqual(exported, { files: 2, segments: 2, stale: 0, orphaned: 0 });
    assert.deepEqual(validateTranslationWorkspace(project.paths.translations).errors, []);

    const scenarioRows = readJsonLines(path.join(root, 'translations/narrative/prologue.route.jsonl'));
    assert.equal(scenarioRows[0].source, 'Appel');
    assert.equal(scenarioRows[0].reference, 'Call %C <pause>');
    assert.equal(scenarioRows[0].target, 'Aufruf %C <pause>');
    assert.equal(scenarioRows[0].protectedTokenSource, 'reference');
    assert.equal(scenarioRows[0].protectedTokenProfile, 'mages');
    assert.deepEqual(scenarioRows[0].protectedTokens, ['%C', '<pause>']);
    for (const legacy of ['originalText', 'guideText', 'localizedText', 'file', 'scene', 'text']) {
      assert.equal(Object.hasOwn(scenarioRows[0], legacy), false);
    }

    assert.deepEqual(freeMoteInfoPsb.apply(project), { applied: 2, skipped: 0, modified: 4 });
    const patched = path.join(root, '.ludoweft/work/patched');
    const scenario = JSON.parse(fs.readFileSync(path.join(patched, 'story-objects/prologue.route.scn.m.json')));
    const config = JSON.parse(fs.readFileSync(path.join(patched, 'widget-objects/captions.psb.m.json')));
    assert.equal(scenario.scenes[0].texts[0][1][0][1], 'Appel', 'source slot remains untouched');
    assert.equal(scenario.scenes[0].texts[0][1][1][1], 'Aufruf %C <pause>', 'destination slot receives target');
    assert.equal(config.menu[0][0], 'Utilisateur {name}');
    assert.equal(config.menu[0][1], 'Benutzer {name}\\n');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(patched, 'widget-objects/palette.psb.m.json'))).themes, [
      { id: 'midnight', colors: { accent: '#6cc7ff', panel: '#101522' } },
    ]);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(patched, 'widget-objects/controls.psb.m.json'))).inputHints,
      { accept: { device: 'keyboard', code: 'Enter' }, opacity: 0.1, count: 7 },
    );
  },
));

test('MAGES percent codes are enforced even when the source has none', () => withFixture(({ root, project }) => {
  freeMoteInfoPsb.export(project);
  const file = path.join(root, 'translations/narrative/prologue.route.jsonl');
  const rows = readJsonLines(file);
  rows[0].target = 'Aufruf <pause>';
  writeJsonLines(file, rows);
  assert.throws(() => freeMoteInfoPsb.apply(project), /missing protected token %C/);
}));

test('build emits every configured archive and collision-safe item paths survive a full verify', () => withFixture(
  (fixture) => {
    const { adapter, controller } = prepareLifecycle(fixture);
    const built = adapter.build(fixture.project);
    assert.equal(built.built, 2, 'the untranslated story archive must still be rebuilt');
    assert.equal(built.modified, 3);
    for (const archive of fixture.manifest.adapterConfig.archives) {
      assert.equal(fs.existsSync(path.join(fixture.project.paths.output, archive.infoFile)), true);
      assert.equal(fs.existsSync(path.join(fixture.project.paths.output, archive.bodyFile)), true);
    }

    const naiveA = 'menu-vault-label/primary.psb'.replace(/[^A-Za-z0-9._-]/g, '_');
    const naiveB = 'menu-vault-label?primary.psb'.replace(/[^A-Za-z0-9._-]/g, '_');
    assert.equal(naiveA, naiveB, 'the fixture must exercise a real sanitization collision');
    assert.equal(new Set(controller.itemOutputPaths).size, controller.itemOutputPaths.length);

    assert.deepEqual(adapter.verify(fixture.project), { verified: 2, checked: 3 });
  },
));

test('verify rejects byte corruption in an unmodified raw archive entry', () => withFixture((fixture) => {
  const { adapter, controller } = prepareLifecycle(fixture);
  adapter.build(fixture.project);
  controller.rawByteCorruption = { archive: 'story-vault', relative: 'sidecars/keep.bin' };
  assert.throws(
    () => adapter.verify(fixture.project),
    /verified raw archive entry differs from original: story-vault\/sidecars\/keep\.bin/,
  );
}));

test('verify rejects changes to the raw archive file inventory', () => withFixture((fixture) => {
  const { adapter, controller } = prepareLifecycle(fixture);
  adapter.build(fixture.project);
  controller.extraRawEntry = { archive: 'menu-vault', relative: 'sidecars/unexpected.bin' };
  assert.throws(
    () => adapter.verify(fixture.project),
    /verified raw archive inventory differs from original: menu-vault/,
  );
}));

test('verify allows float32 round trips but keeps integer-valued JSON exact', () => withFixture((fixture) => {
  const { adapter, controller } = prepareLifecycle(fixture);
  adapter.build(fixture.project);
  assert.doesNotThrow(() => adapter.verify(fixture.project), '0.1 may round-trip through float32');

  controller.fullMutation = {
    archive: 'menu-vault',
    relativeJson: 'widget-objects/controls.psb.m.json',
    mutate(document) { document.inputHints.count = 7.0000001; },
  };
  assert.throws(
    () => adapter.verify(fixture.project),
    /verified resource differs from applied resource: menu-vault\/controls\.psb\.m\.json/,
  );
}));

test('archive output paths reject normalized case-insensitive collisions', () => withFixture(({ project }) => {
  const [first, second] = project.config.adapterConfig.archives;
  second.infoFile = first.bodyFile.toUpperCase();
  assert.throws(
    () => freeMoteInfoPsb.export(project),
    /archive output path collision between story-vault\.bodyFile and menu-vault\.infoFile/,
  );
}));

test('translation output paths reject normalized case-insensitive collisions before export', () => withFixture(
  ({ root, project }) => {
    const menuArchive = project.config.adapterConfig.archives[1];
    menuArchive.resources.push({
      handler: 'mages-scenario',
      include: ['alternate.scn.m.json'],
      translationDirectory: 'NARRATIVE',
    });
    writeJson(
      path.join(root, '.ludoweft/work/extracted/menu-vault_full/widget-objects/alternate.scn.m.json'),
      {
        name: 'prologue.route',
        scenes: [{ texts: [['Guide', [[0, 'Autre'], [1, 'Another']]]] }],
      },
    );

    assert.throws(
      () => freeMoteInfoPsb.export(project),
      /translation output path collision between story-vault\/prologue\.route\.scn\.m\.json and menu-vault\/alternate\.scn\.m\.json/,
    );
  },
));

test('resources with no translatable segments do not reserve a translation output path', () => withFixture(
  ({ root, project }) => {
    const menuArchive = project.config.adapterConfig.archives[1];
    menuArchive.resources.push({
      handler: 'mages-scenario',
      include: ['empty.scn.m.json'],
      translationDirectory: 'NARRATIVE',
    });
    writeJson(
      path.join(root, '.ludoweft/work/extracted/menu-vault_full/widget-objects/empty.scn.m.json'),
      { name: 'prologue.route', scenes: [] },
    );

    assert.doesNotThrow(() => freeMoteInfoPsb.export(project));
  },
));

test('modified resources cannot overwrite the same raw archive destination', () => withFixture(({ project }) => {
  freeMoteInfoPsb.export(project);
  const mutations = project.config.adapterConfig.mutations;
  mutations[0].rawName = 'shared/item';
  mutations[1].rawName = 'SHARED/item';
  assert.throws(
    () => freeMoteInfoPsb.apply(project),
    /raw archive destination collision between menu-vault\/controls\.psb\.m\.json and menu-vault\/palette\.psb\.m\.json/,
  );
}));

test('a lone promotion backup fails closed instead of claiming an unrelated sibling', () => withFixture(
  ({ project }) => {
    const translations = project.paths.translations;
    const previous = path.join(path.dirname(translations), '.translations.previous-crash-test');
    fs.renameSync(translations, previous);
    assert.equal(fs.existsSync(translations), false);

    assert.throws(
      () => freeMoteInfoPsb.export(project),
      /possible interrupted directory promotion requires manual recovery/,
    );
    assert.equal(fs.existsSync(translations), false);
    assert.equal(fs.existsSync(previous), true);
    const rows = readJsonLines(path.join(previous, 'narrative/prologue.route.jsonl'));
    assert.equal(rows[0].localizedText, 'Aufruf %C <pause>');
  },
));

test('multiple interrupted promotions fail without choosing a backup', () => withFixture(({ project }) => {
  const translations = project.paths.translations;
  const parent = path.dirname(translations);
  const first = path.join(parent, '.translations.previous-crash-a');
  const second = path.join(parent, '.translations.previous-crash-b');
  fs.renameSync(translations, first);
  fs.cpSync(first, second, { recursive: true });
  assert.throws(
    () => freeMoteInfoPsb.export(project),
    /possible interrupted directory promotion requires manual recovery/,
  );
  assert.equal(fs.existsSync(translations), false);
  assert.equal(fs.existsSync(first), true);
  assert.equal(fs.existsSync(second), true);
}));

test('declarative mutations reject prototype paths and arbitrary operations', () => {
  assert.throws(
    () => applyMutation({ value: {} }, { op: 'merge', path: '/value/__proto__', value: {} }),
    /forbidden key/,
  );
  assert.throws(() => applyMutation({ value: {} }, { op: 'execute', path: '/value' }), /unsupported mutation/);
});

test('merge creates a missing final object but not missing intermediate paths', () => {
  const document = { panel: {} };
  assert.equal(applyMutation(document, { op: 'merge', path: '/panel/hints', value: { accept: 'Enter' } }), true);
  assert.deepEqual(document.panel.hints, { accept: 'Enter' });
  assert.throws(
    () => applyMutation(document, { op: 'merge', path: '/panel/missing/deep', value: {} }),
    /path not found/,
  );
});
