---
name: ludoweft-localize
description: Orchestrate file-based game localization projects with the Ludoweft CLI, including extraction, JSONL translation, review, validation, and rebuilding. Use for authorized moddable game resources; do not use for runtime OCR or text-hook translation.
---

# Ludoweft localization

Use Ludoweft as the deterministic boundary for resource operations while applying agent judgment only to analysis, translation, and review.

## Start safely

1. Locate `ludoweft.project.json` and run `ludoweft inspect`.
2. Confirm that the user is authorized to modify the game files in scope.
3. Keep commercial assets, extracted source text, local installation paths, archive keys, and tool binaries out of public repositories.
4. Do not install or overwrite live game files unless the user asks. A future install operation must create and verify a backup first.

If the project has no supported adapter, inspect the format and propose an adapter boundary. Do not invent archive keys, command flags, or binary structures.

## Translation workflow

Run `extract`, then `export`, and validate the generated workspace before editing. Read [references/translation-workspace.md](references/translation-workspace.md) before translating or reviewing JSONL.

For a large workspace, divide work by non-overlapping files or stable ID ranges when subagents are available. Give each worker the relevant glossary, style rules, neighboring context, and exact writable files. The coordinator owns merges and validation; workers must not rebuild or install the game independently.

After translation:

1. Run `ludoweft validate`.
2. Resolve missing protected tokens, duplicate IDs, malformed JSONL, and stale source hashes.
3. Run `apply`, `build`, and `verify`.
4. Report translated and reviewed counts plus build evidence. Keep installation as a separate, explicitly authorized action.

Prefer human review for ambiguous dialogue, names, wordplay, UI length constraints, and culturally sensitive material. Do not label unreviewed agent output as a finished human localization.
