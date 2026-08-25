---
name: ludoweft-localize
description: This skill should be used when a project contains ludoweft.project.json, or when the user asks to extract, translate, patch, or rebuild text in moddable game files, including FreeMote info-PSB and MAGES visual-novel archives. It covers resource inspection, extraction, JSONL translation, review, validation, and rebuilding through the Ludoweft CLI. It should not be used for runtime OCR, text-hook translation, application i18n frameworks, or plain document translation.
---

# Ludoweft localization

Use Ludoweft as the deterministic boundary for resource operations while applying agent judgment only to analysis, translation, and review.

## Use the bundled CLI

This skill ships with the Ludoweft CLI; do not require a global npm installation. Invoke `scripts/ludoweft.mjs` from this skill's own directory with Node.js 20 or newer, and run it with the localization project as the working directory.

Resolve the skill directory from whichever the host provides:

- `${CLAUDE_PLUGIN_ROOT}/skills/ludoweft-localize` when that variable is set. PowerShell spells the same variable `$env:CLAUDE_PLUGIN_ROOT`.
- Otherwise the directory this `SKILL.md` was loaded from.

Quote the path. Game installations and plugin caches both sit under directories with spaces.

```text
node "<skill-directory>/scripts/ludoweft.mjs" inspect --project ./ludoweft.project.json
```

Use the bundled path for every Ludoweft command in this workflow. Add `--json` whenever a step needs machine-readable counts instead of the default indented text. If Node.js 20 or newer is unavailable, stop and report the missing runtime rather than installing software without permission.

`pipeline` runs extract, export, validate, apply, build, and verify in a single call. It exists for round-trip checks against a fixture project and leaves no room for translation or review between export and apply. Run the stages separately on a real project.

## Start safely

1. Locate `ludoweft.project.json` and run the bundled CLI's `inspect` command. `adapters` lists the installed resource adapters and needs no manifest. If the repository is empty, use `init` only after the adapter and source/target languages are known; do not guess them. `init` creates an adapter-neutral skeleton, so add the selected adapter's project-authored configuration before expecting `inspect` to succeed.
2. Check whether the project already carries a glossary, character voice guide, and style rules, and extend them rather than authoring new ones. [references/glossary-and-style.md](references/glossary-and-style.md) gives their canonical paths.
3. Keep commercial assets, extracted source text, local installation paths, archive keys, and tool binaries out of public repositories.
4. Ludoweft has no install command. `build` writes to the project's output directory and never touches the live game. Copy files into a game directory only when the user asks, and back up every replaced file first.

If the project has no supported adapter, run `adapters`, inspect the format, and propose an adapter boundary. Do not invent archive keys, command flags, or binary structures.

## Adapter-specific setup

Read the entry that matches the project; skip the rest.

- **FreeMote info-PSB.** `freemote-info-psb` requires separately installed FreeMote tools and project-authored archive configuration. A private project must supply `adapterConfig`, `paths.freeMote`, and any local overlay after `init`. Never guess those values or download the tools implicitly.
- **Legacy JSONL trees.** For a legacy `ja`/`en`/`ko` tree, run `import-jsonl --dry-run` into a separate destination first, then reconcile it with a fresh adapter export. Manifest `paths` resolve against the manifest's directory, but `--input` and `--output` resolve against the current working directory. Non-empty imported targets are `draft` until reviewed, validated, and explicitly promoted to `translated` or `reviewed`.

## Translation workflow

Run `extract`, then `export`, and validate the generated workspace before editing. Read [references/translation-workspace.md](references/translation-workspace.md) completely before translating or reviewing JSONL.

Read [references/glossary-and-style.md](references/glossary-and-style.md) next, then derive the project glossary, character voice guide, and style rules from the exported workspace before the first batch. The CLI never reads those documents, so consistency between batches, sessions, and workers depends entirely on them.

Run the work as a team once the workspace outgrows a single context: preparation passes in parallel, translators partitioned by non-overlapping files or stable ID ranges, and reviewers that are separate agents from the translators who wrote the batch. Read [references/agent-team.md](references/agent-team.md) before fanning out — it covers file ownership, what each worker must be handed, and which stages never leave the coordinator.

After translation:

1. Run the bundled CLI's `validate` command. It reports malformed JSONL, duplicate IDs, corrupted `sourceHash` values, protected tokens that do not match their configured source or reference slot, and placeholder counts that differ from the target.
2. Resolve every reported error. Do not edit `sourceHash` or `protectedTokens` to silence a check — validation compares them against the segment's own source and will reject the edit.
3. Re-run `export` after any upstream change. Segments whose source moved on come back as `stale` with the old translation kept in `target` and the old text in `previousSource`; revise them and set the status back to `translated` or `reviewed`. Segments marked `orphaned` no longer exist upstream and need no work.
4. Run `apply`, `build`, and `verify`. All three refuse to run while any segment is `stale`, while a workspace row is missing for an extracted segment, or while a `sourceHash` no longer matches the extracted source — rerun `export` when that happens. Only `translated` and `reviewed` segments reach a build; every other segment is counted in `skipped`. Check that `applied` and `skipped` match the expected counts before trusting the build.
5. Report progress from `validate`'s `byStatus` map, never from its `translated` field. That field counts every non-empty `target` regardless of status, so it also counts `draft`, `blocked`, and `stale` rows that no build will ship, and it overstates progress badly right after `import-jsonl`. Report build evidence and the glossary revision the batch was translated against. Keep installation as a separate, explicitly authorized action.

Prefer human review for ambiguous dialogue, names, wordplay, UI length constraints, and culturally sensitive material. Do not label unreviewed agent output as a finished human localization.
