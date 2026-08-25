import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { hashSource } from '../src/core/hash.mjs';
import { PROJECT_ID_PATTERN, validateProject } from '../src/core/project.mjs';
import {
  PREVIOUS_STATUSES,
  PROTECTED_TOKEN_PROFILES,
  PROTECTED_TOKEN_SOURCES,
  SEGMENT_STATUSES,
  SOURCE_HASH_PATTERN,
  validateSegment,
} from '../src/core/segments.mjs';
import { repoRoot } from './helpers.mjs';

// The committed schemas are documentation; the handwritten validators are what runs. Every
// constraint either has a case that proves the validator enforces it, or an explicit
// exemption — so adding a constraint to a schema forces a decision here.
const segmentSchema = JSON.parse(fs.readFileSync(path.join(repoRoot, 'schemas/segment.schema.json'), 'utf8'));
const projectSchema = JSON.parse(fs.readFileSync(path.join(repoRoot, 'schemas/project.schema.json'), 'utf8'));

// Structure and metadata, not assertions about a value. Everything else in a schema is
// treated as a constraint — a whitelist of known keywords would hide any newly introduced
// one, which is the very drift this suite exists to catch.
const NON_CONSTRAINT = new Set(['$schema', '$id', 'title', 'description', 'properties', 'items']);

// Every constraint the schema declares, addressed by its exact path.
function constraintPaths(schema, prefix = '') {
  const at = (name) => (prefix ? `${prefix}.${name}` : name);
  const paths = [];
  for (const [keyword, value] of Object.entries(schema)) {
    if (NON_CONSTRAINT.has(keyword)) continue;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // A subschema in constraint position, such as an `additionalProperties` shape.
      paths.push(...constraintPaths(value, at(keyword)));
    } else {
      paths.push(at(keyword));
    }
  }
  if (schema.items) paths.push(...constraintPaths(schema.items, at('items')));
  for (const [name, sub] of Object.entries(schema.properties ?? {})) {
    paths.push(...constraintPaths(sub, prefix ? `${prefix}.${name}` : name));
  }
  return paths;
}

const validSegment = (overrides = {}) => {
  const row = { id: 'x', source: 'hello', target: '', ...overrides };
  if (!('sourceHash' in overrides)) {
    row.sourceHash = hashSource(typeof row.source === 'string' ? row.source : '', row.reference ?? '');
  }
  return row;
};
const validPaths = (overrides = {}) => ({
  source: './s', work: './w', translations: './t', output: './o', ...overrides,
});
const validProject = (overrides = {}) => ({
  schemaVersion: 1,
  id: 'demo',
  adapter: 'demo-json',
  languages: { source: 'en', target: 'ko' },
  paths: validPaths(),
  ...overrides,
});

// [exact schema constraint path, input that violates only that constraint]
const SEGMENT_CASES = [
  ['type', 'not an object'],
  ['required', (() => { const row = validSegment(); delete row.id; return row; })()],
  ['id.type', validSegment({ id: 42 })],
  ['id.minLength', validSegment({ id: '' })],
  ['source.type', validSegment({ source: 42 })],
  ['reference.type', validSegment({ reference: 42 })],
  ['target.type', validSegment({ target: 42 })],
  ['previousSource.type', validSegment({ previousSource: 42 })],
  ['previousStatus.enum', validSegment({ previousStatus: 'orphaned' })],
  ['sourceHash.type', validSegment({ sourceHash: 42 })],
  ['sourceHash.pattern', validSegment({ sourceHash: 'A'.repeat(64) })],
  ['protectedTokens.type', validSegment({ protectedTokens: 'x' })],
  ['protectedTokens.uniqueItems', validSegment({ source: '{a}', protectedTokens: ['{a}', '{a}'] })],
  ['protectedTokens.items.type', validSegment({ source: '{a}', protectedTokens: [42] })],
  ['protectedTokens.items.minLength', validSegment({ source: '{a}', protectedTokens: [''] })],
  ['protectedTokenSource.enum', validSegment({ protectedTokenSource: 'destination' })],
  ['protectedTokenProfile.enum', validSegment({ protectedTokenProfile: 'unknown' })],
  ['context.type', validSegment({ context: 'x' })],
  ['status.enum', validSegment({ status: 'shipped' })],
  ['translatedBy.type', validSegment({ translatedBy: 42 })],
  ['reviewedBy.type', validSegment({ reviewedBy: 42 })],
];

const PROJECT_CASES = [
  ['type', 'not an object'],
  ['required', (() => { const project = validProject(); delete project.adapter; return project; })()],
  ['schemaVersion.const', validProject({ schemaVersion: 2 })],
  ['id.type', validProject({ id: 42 })],
  ['id.pattern', validProject({ id: 'Demo' })],
  ['adapter.type', validProject({ adapter: 42 })],
  ['adapter.minLength', validProject({ adapter: '' })],
  ['languages.type', validProject({ languages: 'x' })],
  ['languages.required', validProject({ languages: { source: 'en' } })],
  ['languages.additionalProperties', validProject({ languages: { source: 'en', target: 'ko', extra: 'xx' } })],
  ['languages.source.type', validProject({ languages: { source: 42, target: 'ko' } })],
  ['languages.source.minLength', validProject({ languages: { source: 'e', target: 'ko' } })],
  ['languages.reference.type', validProject({ languages: { source: 'en', target: 'ko', reference: 42 } })],
  ['languages.reference.minLength', validProject({ languages: { source: 'en', target: 'ko', reference: 'j' } })],
  ['languages.target.type', validProject({ languages: { source: 'en', target: 42 } })],
  ['languages.target.minLength', validProject({ languages: { source: 'en', target: 'k' } })],
  ['paths.type', validProject({ paths: 'x' })],
  ['paths.required', validProject({ paths: { work: './w', translations: './t', output: './o' } })],
  ['paths.source.type', validProject({ paths: validPaths({ source: 42 }) })],
  ['paths.source.minLength', validProject({ paths: validPaths({ source: '' }) })],
  ['paths.work.type', validProject({ paths: validPaths({ work: 42 }) })],
  ['paths.work.minLength', validProject({ paths: validPaths({ work: '' }) })],
  ['paths.translations.type', validProject({ paths: validPaths({ translations: 42 }) })],
  ['paths.translations.minLength', validProject({ paths: validPaths({ translations: '' }) })],
  ['paths.output.type', validProject({ paths: validPaths({ output: 42 }) })],
  ['paths.output.minLength', validProject({ paths: validPaths({ output: '' }) })],
  // An adapter-specific path is still resolved against the project root.
  ['paths.additionalProperties.type', validProject({ paths: validPaths({ cache: true }) })],
  ['paths.additionalProperties.minLength', validProject({ paths: validPaths({ cache: '' }) })],
  ['localConfig.type', validProject({ localConfig: 42 })],
  ['localConfig.minLength', validProject({ localConfig: '' })],
  ['adapterConfig.type', validProject({ adapterConfig: 'x' })],
];

// Constraints with nothing for a validator to enforce, each with its reason.
const EXEMPT = {
  'additionalProperties': 'the root object is deliberately open to adapter and workflow fields',
};

test('the baseline fixtures satisfy both validators', () => {
  assert.deepEqual(validateSegment(validSegment()), []);
  assert.deepEqual(validateProject(validProject()), []);
});

test('enums and patterns declared in the segment schema match the validator', () => {
  assert.deepEqual([...segmentSchema.properties.status.enum].sort(), [...SEGMENT_STATUSES].sort());
  assert.deepEqual([...segmentSchema.properties.previousStatus.enum].sort(), [...PREVIOUS_STATUSES].sort());
  assert.deepEqual(
    [...segmentSchema.properties.protectedTokenSource.enum].sort(),
    [...PROTECTED_TOKEN_SOURCES].sort(),
  );
  assert.deepEqual(
    [...segmentSchema.properties.protectedTokenProfile.enum].sort(),
    [...PROTECTED_TOKEN_PROFILES].sort(),
  );
  assert.equal(segmentSchema.properties.sourceHash.pattern, SOURCE_HASH_PATTERN.source);
});

for (const [schemaName, schema, cases, validate] of [
  ['segment', segmentSchema, SEGMENT_CASES, validateSegment],
  ['project', projectSchema, PROJECT_CASES, validateProject],
]) {
  test(`the validator rejects every ${schemaName} constraint the schema declares`, () => {
    for (const [constraint, input] of cases) {
      assert.ok(validate(input).length > 0, `${schemaName} validator must reject ${constraint}`);
    }
  });

  test(`every ${schemaName} schema constraint has a parity case or an exemption`, () => {
    const covered = new Set(cases.map(([constraint]) => constraint));
    for (const constraint of constraintPaths(schema)) {
      assert.ok(
        covered.has(constraint) || constraint in EXEMPT,
        `add a parity case for ${schemaName} constraint ${constraint}, or exempt it with a reason`,
      );
    }
  });

  test(`every ${schemaName} parity case names a constraint the schema still declares`, () => {
    const declared = new Set(constraintPaths(schema));
    for (const [constraint] of cases) {
      assert.ok(declared.has(constraint), `${schemaName} case ${constraint} no longer exists in the schema`);
    }
  });
}

// Asserting only that a fixture produces "some error" proves the validator rejects
// something, not that it enforces the value the schema declares — a schema whose
// minLength moved from 2 to 5 would keep such a test green. These cases derive their
// inputs from the live schema value, so the boundary moves with the schema.

function schemaAt(schema, dotted) {
  return dotted.split('.').reduce((node, name) => node.properties[name], schema);
}

// [schema, constraint path, build a fixture with this field set to the given string]
const MIN_LENGTH_FIELDS = [
  [projectSchema, 'adapter', (value) => validProject({ adapter: value })],
  [projectSchema, 'languages.source', (value) => validProject({ languages: { source: value, target: 'ko' } })],
  [projectSchema, 'languages.target', (value) => validProject({ languages: { source: 'en', target: value } })],
  [projectSchema, 'languages.reference',
    (value) => validProject({ languages: { source: 'en', target: 'ko', reference: value } })],
  [projectSchema, 'paths.source', (value) => validProject({ paths: validPaths({ source: value }) })],
  [projectSchema, 'paths.work', (value) => validProject({ paths: validPaths({ work: value }) })],
  [projectSchema, 'paths.translations', (value) => validProject({ paths: validPaths({ translations: value }) })],
  [projectSchema, 'paths.output', (value) => validProject({ paths: validPaths({ output: value }) })],
  [projectSchema, 'localConfig', (value) => validProject({ localConfig: value })],
  [segmentSchema, 'id', (value) => validSegment({ id: value })],
];

test('each declared minLength is the exact boundary the validator enforces', () => {
  for (const [schema, dotted, build] of MIN_LENGTH_FIELDS) {
    const { minLength } = schemaAt(schema, dotted);
    const validate = schema === segmentSchema ? validateSegment : validateProject;
    const filler = 'a'.repeat(minLength);
    assert.ok(validate(build(filler.slice(0, minLength - 1))).length > 0,
      `${dotted} must reject a value shorter than minLength ${minLength}`);
    assert.deepEqual(validate(build(filler)), [],
      `${dotted} must accept a value of exactly minLength ${minLength}`);
  }
});

test('the paths additionalProperties minLength is the boundary for adapter-specific paths', () => {
  const { minLength } = projectSchema.properties.paths.additionalProperties;
  assert.ok(validateProject(validProject({ paths: validPaths({ cache: '' }) })).length > 0);
  assert.deepEqual(validateProject(validProject({ paths: validPaths({ cache: 'a'.repeat(minLength) }) })), []);
});

test('declared patterns and consts are the ones the validator applies', () => {
  assert.equal(projectSchema.properties.id.pattern, PROJECT_ID_PATTERN.source);
  const { const: version } = projectSchema.properties.schemaVersion;
  assert.deepEqual(validateProject(validProject({ schemaVersion: version })), []);
  assert.ok(validateProject(validProject({ schemaVersion: version + 1 })).length > 0);
});

test('a property the schema does not require may be absent', () => {
  for (const [schema, validate, fixture] of [
    [segmentSchema, validateSegment, validSegment()],
    [projectSchema, validateProject, validProject()],
  ]) {
    const optional = Object.keys(schema.properties).filter((name) => !schema.required.includes(name));
    for (const name of optional) {
      const input = { ...fixture };
      delete input[name];
      assert.deepEqual(validate(input), [], `${name} is optional in the schema and must stay optional`);
    }
  }
});

// Naming a constraint path and asserting "some error" proves nothing about the declared
// VALUE. These cases derive the expected behaviour from what the schema says, so flipping
// a declared type, requirement, or openness fails against the unchanged validator.

// One representative per JSON type. Rejection is checked against every type the schema
// does NOT declare, and acceptance against the one it does — testing only rejection of a
// single sample cannot tell `object` from `array`, since one sample stands for both.
const TYPE_SAMPLES = {
  string: 'sample',
  number: 7,
  boolean: true,
  object: { sample: true },
  array: ['sample'],
  null: null,
};

// Fields whose declared type is not enough to build an acceptable value, because a sibling
// constraint also applies. An override is used only while it still matches the declared
// type — otherwise the acceptance check would keep feeding the old type and never notice
// that the schema moved.
const VALID_OVERRIDES = {
  'segment.': validSegment(),
  'segment.sourceHash': validSegment().sourceHash,
  'segment.protectedTokens': [],
  'segment.protectedTokens.items': '{a}',
  'project.': validProject(),
  'project.languages': { source: 'en', target: 'ko' },
  'project.paths': validPaths(),
};

function jsonType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value === 'object' ? 'object' : typeof value;
}

// [schema, name, validate, property path ('' for the root), set that property to a value]
const TYPED_FIELDS = [
  [segmentSchema, 'segment', validateSegment, '', (v) => v],
  [segmentSchema, 'segment', validateSegment, 'id', (v) => validSegment({ id: v })],
  [segmentSchema, 'segment', validateSegment, 'source', (v) => validSegment({ source: v })],
  [segmentSchema, 'segment', validateSegment, 'reference', (v) => validSegment({ reference: v })],
  [segmentSchema, 'segment', validateSegment, 'target', (v) => validSegment({ target: v })],
  [segmentSchema, 'segment', validateSegment, 'previousSource', (v) => validSegment({ previousSource: v })],
  [segmentSchema, 'segment', validateSegment, 'sourceHash', (v) => validSegment({ sourceHash: v })],
  [segmentSchema, 'segment', validateSegment, 'protectedTokens', (v) => validSegment({ protectedTokens: v })],
  [segmentSchema, 'segment', validateSegment, 'protectedTokens.items',
    (v) => validSegment({ source: '{a}', protectedTokens: [v] })],
  [segmentSchema, 'segment', validateSegment, 'context', (v) => validSegment({ context: v })],
  [segmentSchema, 'segment', validateSegment, 'translatedBy', (v) => validSegment({ translatedBy: v })],
  [segmentSchema, 'segment', validateSegment, 'reviewedBy', (v) => validSegment({ reviewedBy: v })],
  [projectSchema, 'project', validateProject, '', (v) => v],
  [projectSchema, 'project', validateProject, 'id', (v) => validProject({ id: v })],
  [projectSchema, 'project', validateProject, 'adapter', (v) => validProject({ adapter: v })],
  [projectSchema, 'project', validateProject, 'languages', (v) => validProject({ languages: v })],
  [projectSchema, 'project', validateProject, 'languages.source',
    (v) => validProject({ languages: { source: v, target: 'ko' } })],
  [projectSchema, 'project', validateProject, 'languages.target',
    (v) => validProject({ languages: { source: 'en', target: v } })],
  [projectSchema, 'project', validateProject, 'languages.reference',
    (v) => validProject({ languages: { source: 'en', target: 'ko', reference: v } })],
  [projectSchema, 'project', validateProject, 'paths', (v) => validProject({ paths: v })],
  [projectSchema, 'project', validateProject, 'paths.source', (v) => validProject({ paths: validPaths({ source: v }) })],
  [projectSchema, 'project', validateProject, 'paths.work', (v) => validProject({ paths: validPaths({ work: v }) })],
  [projectSchema, 'project', validateProject, 'paths.translations',
    (v) => validProject({ paths: validPaths({ translations: v }) })],
  [projectSchema, 'project', validateProject, 'paths.output', (v) => validProject({ paths: validPaths({ output: v }) })],
  [projectSchema, 'project', validateProject, 'paths.additionalProperties',
    (v) => validProject({ paths: validPaths({ cache: v }) })],
  [projectSchema, 'project', validateProject, 'localConfig', (v) => validProject({ localConfig: v })],
  [projectSchema, 'project', validateProject, 'adapterConfig', (v) => validProject({ adapterConfig: v })],
];

function nodeAt(schema, dotted) {
  if (dotted === '') return schema;
  return dotted.split('.').reduce((node, name) => (name === 'items' || name === 'additionalProperties'
    ? node[name]
    : node.properties[name]), schema);
}

test('each declared type is the one the validator accepts, and every other type is refused', () => {
  for (const [schema, name, validate, dotted, set] of TYPED_FIELDS) {
    const { type } = nodeAt(schema, dotted);
    const label = dotted === '' ? `${name} root` : `${name}.${dotted}`;
    assert.ok(type in TYPE_SAMPLES, `add a sample value for declared type ${type} at ${label}`);

    const override = VALID_OVERRIDES[`${name}.${dotted}`];
    const valid = override !== undefined && jsonType(override) === type ? override : TYPE_SAMPLES[type];
    assert.deepEqual(validate(set(valid)), [], `${label} declares ${type}, so a ${type} must be accepted`);

    for (const [other, sample] of Object.entries(TYPE_SAMPLES)) {
      if (other === type) continue;
      assert.ok(validate(set(sample)).length > 0, `${label} declares ${type}, so a ${other} must be refused`);
    }
  }
});

test('every type the schemas declare has a case, including the root', () => {
  const covered = new Set(TYPED_FIELDS.map(([, name, , dotted]) => `${name}.${dotted}`));
  for (const [schema, name] of [[segmentSchema, 'segment'], [projectSchema, 'project']]) {
    for (const constraint of constraintPaths(schema)) {
      if (constraint !== 'type' && !constraint.endsWith('.type')) continue;
      const dotted = constraint === 'type' ? '' : constraint.slice(0, -'.type'.length);
      assert.ok(covered.has(`${name}.${dotted}`), `add a ${name} type case for ${dotted || 'the root'}`);
    }
  }
});

test('a field the schema requires is rejected when absent, and an optional one is not', () => {
  for (const [schema, validate, fixture, name] of [
    [segmentSchema, validateSegment, validSegment(), 'segment'],
    [projectSchema, validateProject, validProject(), 'project'],
  ]) {
    for (const field of schema.required) {
      const input = { ...fixture };
      delete input[field];
      assert.ok(validate(input).length > 0, `${name}.${field} is required by the schema and must be enforced`);
    }
    for (const field of Object.keys(schema.properties).filter((n) => !schema.required.includes(n))) {
      const input = { ...fixture };
      delete input[field];
      assert.deepEqual(validate(input), [], `${name}.${field} is optional in the schema and must stay optional`);
    }
  }
});

// [name, subschema, build a project with these fields, a complete set of them]
const NESTED_OBJECTS = [
  ['languages', projectSchema.properties.languages,
    (fields) => validProject({ languages: fields }), { source: 'en', reference: 'ja', target: 'ko' }],
  ['paths', projectSchema.properties.paths, (fields) => validProject({ paths: fields }), validPaths()],
];

test('nested required and optional members match what the schema declares', () => {
  for (const [name, schema, build, complete] of NESTED_OBJECTS) {
    for (const field of schema.required) {
      const fields = { ...complete };
      delete fields[field];
      assert.ok(validateProject(build(fields)).length > 0, `${name}.${field} is required and must be enforced`);
    }
    // The symmetric half: a member the schema does not require must not be enforced either.
    for (const field of Object.keys(schema.properties).filter((f) => !schema.required.includes(f))) {
      const fields = { ...complete };
      delete fields[field];
      assert.deepEqual(validateProject(build(fields)), [], `${name}.${field} is optional and must stay optional`);
    }
  }
});

test('declared uniqueItems matches what the validator enforces', () => {
  // The validator rejects duplicates unconditionally, so the schema must declare it.
  assert.equal(segmentSchema.properties.protectedTokens.uniqueItems, true);
  assert.ok(validateSegment(validSegment({ source: '{a}', protectedTokens: ['{a}', '{a}'] })).length > 0);
});

test('declared additionalProperties matches whether the validator accepts unknown fields', () => {
  const cases = [
    ['segment', segmentSchema, validateSegment, () => ({ ...validSegment(), unknownField: 'x' })],
    ['project', projectSchema, validateProject, () => validProject({ unknownField: 'x' })],
    ['languages', projectSchema.properties.languages, validateProject,
      () => validProject({ languages: { source: 'en', target: 'ko', unknownField: 'x' } })],
  ];
  for (const [name, schema, validate, build] of cases) {
    const declared = schema.additionalProperties;
    assert.equal(typeof declared, 'boolean', `${name} additionalProperties must be a boolean here`);
    if (declared) assert.deepEqual(validate(build()), [], `${name} is open, so an unknown field must be accepted`);
    else assert.ok(validate(build()).length > 0, `${name} is closed, so an unknown field must be rejected`);
  }
});

test('the declared protectedTokens item minimum matches what the validator can enforce', () => {
  // The validator requires each entry to be a non-empty string AND to equal a token derived
  // from the source. That match rule subsumes any longer minimum, so the validator cannot
  // enforce one independently — the schema must not declare a stronger bound than 1.
  assert.equal(segmentSchema.properties.protectedTokens.items.minLength, 1);
  assert.ok(validateSegment(validSegment({ source: '{a}', protectedTokens: [''] })).length > 0);
  assert.deepEqual(validateSegment(validSegment({ source: '{a}', protectedTokens: ['{a}'] })), []);
});
