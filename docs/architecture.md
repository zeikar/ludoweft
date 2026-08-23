# Architecture

Ludoweft separates deterministic resource operations from probabilistic translation work.

## Layers

1. **Core CLI** loads a project, validates the manifest and translation workspace, and dispatches lifecycle stages.
2. **Adapters** understand one resource format or engine family and implement `inspect`, `extract`, `export`, `apply`, `build`, and `verify`.
3. **Translation workspace** stores stable, reviewable JSONL segments independent of the source archive format.
4. **Agent skill** tells a coding agent how to plan, translate, review, and invoke quality gates.
5. **Private game project** holds the profile, translations, local secrets, and game-specific exceptions.

```text
private game project
  -> ludoweft core
      -> selected adapter
          -> external format tool, when required
  -> JSONL workspace
      -> coordinator agent
          -> translation and review workers
  -> validated build artifacts
```

## Dependency direction

The public Ludoweft repository must not import a private game project. A private project selects Ludoweft and an adapter through its manifest. Game-specific keys, paths, original text, and binaries never become adapter defaults or test fixtures.

## Deterministic boundary

Agents may decide how to translate text, but the core owns stable IDs, source hashes, protected-token checks, duplicate detection, status gating, file writes, and build verification. This makes model changes observable in translation diffs without making resource operations model-dependent.

Every gate derives its answer from data the agent cannot edit for convenience. Protected tokens are recomputed from the extracted source rather than read from the workspace row; `sourceHash` is checked against the row's own source at validation time and against the extracted resource at apply time; `verify` compares the build against the applied resources and the translations that were supposed to land in it. A missing workspace, a missing translation file, or a build that predates `apply` is an error, never an empty success.

`schemas/` documents the on-disk contract. The runtime validators in `src/core/` are what actually run, and `test/schema-parity.test.mjs` fails if the two drift apart.

## Adapter contract

An adapter exports metadata and six lifecycle methods:

```js
export default {
  id: 'engine-id',
  description: 'What this adapter supports.',
  stability: 'experimental',
  inspect(project) {},
  extract(project) {},
  export(project) {},
  apply(project) {},
  build(project) {},
  verify(project) {},
};
```

Adapters may invoke existing third-party tools. They should download nothing implicitly, must verify configured tool versions when possible, and must not embed game keys or proprietary assets.
