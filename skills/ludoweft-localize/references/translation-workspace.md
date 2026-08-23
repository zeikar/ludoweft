# Translation workspace

Each JSONL line is one independent segment. Preserve line boundaries so Git diffs and agent batches remain stable.

## Editable fields

- `target`: translated text
- `status`: `untranslated`, `draft`, `translated`, `reviewed`, or `blocked`
- `translatedBy` and `reviewedBy`: optional provenance labels
- Adapter-defined translation notes, when documented by the project

These fields survive a re-export. Generated fields — `source`, `reference`, `sourceHash`, `protectedTokens`, `context` — are rebuilt from the extracted resource every time.

Two statuses are set by the pipeline, not by you:

- `stale`: the source text changed after this segment was translated. The old `target` is kept for reuse and the previous text is in `previousSource`. Revise the translation, then set the status back to `translated` or `reviewed`. `apply`, `build`, and `verify` all refuse to run while any segment is `stale`.
- `orphaned`: the source entry no longer exists upstream. The translation is preserved in case the entry returns, and the status it held beforehand is kept in `previousStatus` so it is restored if that happens. Leave it alone.

Do not edit `id`, `source`, `reference`, `sourceHash`, `protectedTokens`, or structural `context` merely to make validation pass. Validation recomputes `sourceHash` and `protectedTokens` from the segment's own source and rejects values that do not match, so such an edit fails rather than passing. A changed source requires a fresh export or an adapter fix.

## Translation constraints

- Preserve every `protectedTokens` value exactly, including case and punctuation, and keep the same number of occurrences as the source. A placeholder that appears twice in the source must appear twice in the target, and one the source does not contain must not appear in the target at all.
- Preserve intentional line breaks, markup, interpolation variables, and control codes.
- Use `reference` only as supporting context; translate the configured source language.
- Follow the project glossary and character voice guide when present.
- Mark uncertain entries `blocked` and explain the issue in an adapter-supported note field instead of guessing silently.

## Parallel batches

Partition by file first and stable ID second. Never assign the same JSONL file to multiple writers unless the environment provides isolated branches or worktrees and the coordinator expects to resolve conflicts. Review agents may read across batches but should write only their assigned output.
