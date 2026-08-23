---
name: ludoweft-localize
description: Orchestrate file-based game localization projects with Ludoweft, including resource inspection, extraction, JSONL translation, review, validation, and rebuilding. Use when a project contains ludoweft.project.json or the user asks to localize, translate, or rebuild authorized moddable game resources; do not use for runtime OCR or text-hook translation.
---

# Ludoweft localization

Use Ludoweft as the deterministic boundary for resource operations while applying agent judgment only to analysis, translation, and review.

## Use the bundled CLI

This skill ships with the Ludoweft CLI; do not require a global npm installation. Invoke `scripts/ludoweft.mjs` from this skill's own directory with Node.js 20 or newer, and run it with the localization project as the working directory.

Resolve the skill directory from whichever the host provides:

- `${CLAUDE_PLUGIN_ROOT}/skills/ludoweft-localize` when that variable is set.
- Otherwise the directory this `SKILL.md` was loaded from.

```text
node <skill-directory>/scripts/ludoweft.mjs inspect --project ./ludoweft.project.json
```

Use the bundled path for every Ludoweft command in this workflow. If Node.js 20 or newer is unavailable, stop and report the missing runtime rather than installing software without permission.

## Start safely

1. Locate `ludoweft.project.json` and run the bundled CLI's `inspect` command.
2. Confirm that the user is authorized to modify the game files in scope.
3. Keep commercial assets, extracted source text, local installation paths, archive keys, and tool binaries out of public repositories.
4. Do not install or overwrite live game files unless the user asks. A future install operation must create and verify a backup first.

If the project has no supported adapter, inspect the format and propose an adapter boundary. Do not invent archive keys, command flags, or binary structures.

## Translation workflow

Run `extract`, then `export`, and validate the generated workspace before editing. Read [references/translation-workspace.md](references/translation-workspace.md) completely before translating or reviewing JSONL.

For a large workspace, divide work by non-overlapping files or stable ID ranges when subagents are available. Give each worker the relevant glossary, style rules, neighboring context, and exact writable files. The coordinator owns merges and validation; workers must not rebuild or install the game independently.

After translation:

1. Run the bundled CLI's `validate` command. It reports malformed JSONL, duplicate IDs, corrupted `sourceHash` values, protected tokens that do not match the source, and placeholder counts that differ between source and target.
2. Resolve every reported error. Do not edit `sourceHash` or `protectedTokens` to silence a check — validation compares them against the segment's own source and will reject the edit.
3. Re-run `export` after any upstream change. Segments whose source moved on come back as `stale` with the old translation kept in `target` and the old text in `previousSource`; revise them and set the status back to `translated` or `reviewed`. Segments marked `orphaned` no longer exist upstream and need no work.
4. Run `apply`, `build`, and `verify`. All three refuse to run while any segment is `stale`, while a workspace row is missing for an extracted segment, or while a `sourceHash` no longer matches the extracted source — rerun `export` when that happens. Only `translated` and `reviewed` segments reach a build; every other segment is counted in `skipped`. Check that `applied` and `skipped` match what you expect before trusting the build.
5. Report translated and reviewed counts plus build evidence. Keep installation as a separate, explicitly authorized action.

Prefer human review for ambiguous dialogue, names, wordplay, UI length constraints, and culturally sensitive material. Do not label unreviewed agent output as a finished human localization.
