# Architecture

Ludoweft separates deterministic resource operations from probabilistic translation work.

## Layers

1. **Core CLI** loads a project, validates schemas, and dispatches lifecycle stages.
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

Agents may decide how to translate text, but the core owns stable IDs, source hashes, protected-token checks, duplicate detection, file writes, and build verification. This makes model changes observable in translation diffs without making resource operations model-dependent.

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
