# Ludoweft

**Let coding agents localize games.**

Ludoweft is an agent-native pipeline for extracting, translating, validating, and rebuilding moddable game resources. It gives coding agents a deterministic CLI and a stable JSONL workspace while leaving game formats to adapters.

The repository is also an installable Codex plugin. The plugin bundles the orchestration skill and CLI, so a game project only needs its manifest, private resources, and translation workspace.

> Status: pre-alpha. The core contract and synthetic round-trip adapter work; real game adapters are the next milestone.

## Why

Localization tools usually focus on either resource editing or machine translation. Ludoweft connects the full engineering loop:

```text
game files -> adapter -> JSONL -> agent translation/review -> validation -> rebuild
```

The CLI does not call a model provider. Codex, Claude, or another compatible agent drives the workflow, may divide translation into non-overlapping batches, and uses Ludoweft for deterministic file operations and quality gates.

## Scope

The initial scope is file-based localization patches for text-heavy PC games whose resources can be extracted and rebuilt. Runtime text hooking, OCR translation, and universal support for every engine are outside the initial scope.

Ludoweft never includes commercial game assets, extracted text, archive keys, or third-party tools that cannot be redistributed.

## Quick start

Requirements: Node.js 20 or newer.

```sh
npm test
npm run demo
```

## Install as a Codex plugin

Add the GitHub repository as a Codex marketplace, then install Ludoweft:

```sh
codex plugin marketplace add zeikar/ludoweft
codex plugin add ludoweft@ludoweft
```

Start a new Codex thread after installation so the bundled skill is discovered. Open an authorized localization project and ask Codex to inspect its `ludoweft.project.json`; the skill executes the plugin-bundled CLI without requiring `npm link` or a global Ludoweft install.

To follow updates from `main` during pre-alpha development:

```sh
codex plugin marketplace upgrade ludoweft
codex plugin add ludoweft@ludoweft
```

Release tags and stable version pinning will replace the moving `main` reference once the plugin contract stabilizes.

The demo uses synthetic JSON data under `examples/demo` and exercises extraction, JSONL export, validation, translation application, build, and verification.

Run individual stages:

```sh
node ./bin/ludoweft.mjs inspect --project ./examples/demo/ludoweft.project.json
node ./bin/ludoweft.mjs extract --project ./examples/demo/ludoweft.project.json
node ./bin/ludoweft.mjs export --project ./examples/demo/ludoweft.project.json
node ./bin/ludoweft.mjs validate --project ./examples/demo/ludoweft.project.json
node ./bin/ludoweft.mjs apply --project ./examples/demo/ludoweft.project.json
node ./bin/ludoweft.mjs build --project ./examples/demo/ludoweft.project.json
node ./bin/ludoweft.mjs verify --project ./examples/demo/ludoweft.project.json
```

After `npm link`, the same commands are available through `ludoweft`.

## Project manifest

Each private localization project owns a `ludoweft.project.json` file:

```json
{
  "schemaVersion": 1,
  "id": "my-game-ko",
  "adapter": "my-engine",
  "languages": {
    "source": "ja",
    "reference": "en",
    "target": "ko"
  },
  "paths": {
    "source": "./game-data",
    "work": "./.ludoweft/work",
    "translations": "./translations",
    "output": "./dist"
  },
  "localConfig": "./ludoweft.local.json"
}
```

Installation paths, keys, tokens, and other machine-local values belong in the ignored `ludoweft.local.json`, never in a public manifest.

## Translation workspace

One JSON object per line keeps diffs small and lets agents work on separate files without rewriting a giant document:

```json
{"id":"dialogue:intro","source":"Welcome, {player}!","reference":"","target":"{player}님, 어서 오세요!","sourceHash":"...","protectedTokens":["{player}"],"status":"reviewed"}
```

Stable IDs and source hashes detect upstream changes. When `export` sees a segment whose source changed, it keeps the old translation for reuse but marks the segment `stale`, records `previousSource`, and `apply` refuses to build until it is revised. A segment whose source entry disappears upstream becomes `orphaned` rather than being deleted, so a patch that removes an entry never destroys reviewed work.

Only `translated` and `reviewed` segments reach a build. Protected tokens are recomputed from the extracted source at apply time, so editing `protectedTokens` in the workspace cannot bypass the check, and the comparison runs in both directions — a placeholder the target invents is rejected alongside one it drops.

`apply`, `build`, and `verify` all derive the resource they expect from the current sources and workspace, so an artifact left by an earlier run cannot be built or certified.

Schemas live in `schemas/`. Architecture and adapter boundaries are documented in `docs/`.

## Codex plugin and agent skill

`.codex-plugin/plugin.json` packages `skills/ludoweft-localize` and the deterministic Node.js CLI as one Codex plugin. The skill describes the safe orchestration workflow, finds its bundled CLI from the installed plugin, and keeps model judgment separate from resource operations.

The core CLI remains agent-agnostic. Packaging for additional coding agents can reuse the same `src/`, schemas, adapters, and workflow contract without changing game project data.

## Roadmap

- Extract the first real adapter from the STEINS;GATE RE:BOOT prototype without publishing game-specific data.
- Add transactional install and restore primitives.
- Add glossary, style-guide, batching, and review metadata.
- Add agent workflow evaluations and reproducible fixtures.
- Publish stable Codex plugin and CLI releases through appropriate package channels.

## Legal and safety

Use Ludoweft only with games and files you are authorized to modify. Keep original assets and extracted source text out of public repositories. Review third-party tool licenses before downloading or redistributing them. Installation into a live game directory must always be explicit and backed up first.

## License

MIT
