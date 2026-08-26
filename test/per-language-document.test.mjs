import assert from 'node:assert/strict';
import test from 'node:test';
import { perLanguageDocumentHandler } from '../src/adapters/freemote/handlers/per-language-document.mjs';

const SLOTS = {
  source: 0, reference: 1, destination: 1, protectedFrom: 'destination',
};
const RESOURCE = {
  languagePointer: '/language',
  entryPointer: '/entries',
  indexPointer: '/order',
  fields: ['name', 'note', 'ruby'],
};
const CONTEXT = { archive: 'config', file: 'terms.psb.m.json', resource: RESOURCE, slots: SLOTS };

// Internal id 0 is Alpha and id 1 is Beta. Each language sorts its own list, so the two
// lists disagree on position and `order` (internal id -> display index) is what aligns them.
function misalignedDocument() {
  return {
    language: [
      {
        order: [1, 0],
        entries: [
          { name: 'ベータ', note: 'に', ruby: '' },
          { name: 'アルファ', note: 'いち', ruby: 'あるふぁ' },
        ],
      },
      {
        order: [0, 1],
        entries: [
          { name: 'Alpha', note: 'one', ruby: 'Alpha' },
          { name: 'Beta', note: 'two', ruby: '' },
        ],
      },
    ],
  };
}

const segmentsOf = (document, resource = RESOURCE) => perLanguageDocumentHandler
  .segments(document, { ...CONTEXT, resource });

test('entries are paired through the index map, not by position', () => {
  const byId = new Map(segmentsOf(misalignedDocument()).map((segment) => [segment.id, segment]));

  const name = byId.get('terms.psb.m.json#0:name');
  assert.equal(name.source, 'アルファ');
  assert.equal(name.reference, 'Alpha');
  assert.deepEqual(name.context, {
    archive: 'config', file: 'terms.psb.m.json', entry: 0, field: 'name',
  });

  // Position 0 in each list would have paired ベータ with Alpha instead.
  assert.equal(byId.get('terms.psb.m.json#1:name').source, 'ベータ');
  assert.equal(byId.get('terms.psb.m.json#1:name').reference, 'Beta');
  assert.equal(byId.get('terms.psb.m.json#0:note').source, 'いち');
});

test('a field the source leaves empty is not a segment', () => {
  const ids = segmentsOf(misalignedDocument()).map((segment) => segment.id);
  // Alpha has a reading and Beta does not; inventing one for Beta would add text the source
  // never had, so only Alpha's ruby is offered for translation.
  assert.ok(ids.includes('terms.psb.m.json#0:ruby'));
  assert.ok(!ids.includes('terms.psb.m.json#1:ruby'));
  assert.equal(ids.length, 5);
});

test('writing a target lands in the destination slot at the paired position', () => {
  const document = misalignedDocument();
  const segment = segmentsOf(document).find((row) => row.id === 'terms.psb.m.json#0:name');
  segment.write('알파');
  // Destination is the reference slot here, and internal id 0 sits at position 0 in it.
  assert.equal(document.language[1].entries[0].name, '알파');
  assert.equal(document.language[1].entries[1].name, 'Beta');
  assert.equal(document.language[0].entries[1].name, 'アルファ', 'the source slot is untouched');
});

test('protected tokens follow the slot the target is written into', () => {
  const [segment] = segmentsOf(misalignedDocument());
  assert.equal(segment.protectedTokenSource, 'reference');
  assert.equal(segment.protectedTokenProfile, 'default');
  assert.equal(
    segmentsOf(misalignedDocument(), { ...RESOURCE, protectedTokenProfile: 'mages' })[0].protectedTokenProfile,
    'mages',
  );
});

test('entries pair by position when the resource ships no index map', () => {
  const document = misalignedDocument();
  const resource = { ...RESOURCE, indexPointer: undefined };
  const name = segmentsOf(document, resource).find((row) => row.id === 'terms.psb.m.json#0:name');
  assert.equal(name.source, 'ベータ');
  assert.equal(name.reference, 'Alpha');
});

test('an index map that is not a permutation is rejected instead of mispairing', () => {
  const repeated = misalignedDocument();
  repeated.language[0].order = [0, 0];
  assert.throws(() => segmentsOf(repeated), /repeats position 0/);

  const outOfRange = misalignedDocument();
  outOfRange.language[0].order = [0, 5];
  assert.throws(() => segmentsOf(outOfRange), /not a position in the entry list/);

  const short = misalignedDocument();
  short.language[0].order = [0];
  assert.throws(() => segmentsOf(short), /index map has 1 entries but the entry list has 2/);
});

test('language slots holding different numbers of entries cannot be paired', () => {
  const document = misalignedDocument();
  document.language[1].entries.push({ name: 'Gamma', note: 'three', ruby: '' });
  document.language[1].order = [0, 1, 2];
  assert.throws(() => segmentsOf(document), /different entry counts/);
});

test('the resource must say where the entries and translatable fields are', () => {
  assert.throws(() => segmentsOf(misalignedDocument(), { ...RESOURCE, entryPointer: undefined }),
    /requires entryPointer/);
  assert.throws(() => segmentsOf(misalignedDocument(), { ...RESOURCE, fields: [] }),
    /non-empty fields/);
  assert.throws(() => segmentsOf(misalignedDocument(), { ...RESOURCE, languagePointer: '/missing' }),
    /is not an array/);
  assert.throws(() => segmentsOf(misalignedDocument(), { ...RESOURCE, entryPointer: '/missing' }),
    /is not an array in language slot/);
});

test('a language slot the project configured must exist in the document', () => {
  const document = misalignedDocument();
  document.language.pop();
  assert.throws(
    () => perLanguageDocumentHandler.segments(document, {
      ...CONTEXT, slots: { source: 0, reference: 1, destination: 1, protectedFrom: 'destination' },
    }),
    /language slot 1 is missing/,
  );
});

test('translation and raw names drop the resource json suffix', () => {
  const naming = { file: 'terms.psb.m.json', resource: { ...RESOURCE, jsonSuffix: '.psb.m.json' } };
  assert.equal(perLanguageDocumentHandler.translationName({}, naming), 'terms.jsonl');
  assert.equal(perLanguageDocumentHandler.rawName({}, naming), 'terms');
  assert.equal(perLanguageDocumentHandler.translationName({}, { file: 'terms.json', resource: RESOURCE }), 'terms.jsonl');
});
