# Translation workspace

Each JSONL line is one independent segment. Preserve line boundaries so Git diffs and agent batches remain stable.

## Editable fields

- `target`: translated text
- `status`: `untranslated`, `draft`, `translated`, `reviewed`, or `blocked`
- `translatedBy` and `reviewedBy`: optional provenance labels
- `note`: a free-form translation note, and the default place to explain a `blocked` segment

These fields survive a re-export, and so do fields the adapter does not recognize — that is what makes `note` and any project-defined workflow field safe to add. Generated fields — `source`, `reference`, `sourceHash`, `protectedTokenSource`, `protectedTokenProfile`, `protectedTokens`, `context` — are rebuilt from the extracted resource every time.

Two statuses are set by the pipeline, not by the translator:

- `stale`: the source text changed after this segment was translated. The old `target` is kept for reuse and the previous text is in `previousSource`. Revise the translation, then set the status back to `translated` or `reviewed`. `apply`, `build`, and `verify` all refuse to run while any segment is `stale`.
- `orphaned`: the source entry no longer exists upstream. The translation is preserved in case the entry returns, and the status it held beforehand is kept in `previousStatus` so it is restored if that happens. Leave it alone.

Do not edit `id`, `source`, `reference`, `sourceHash`, `protectedTokenSource`, `protectedTokenProfile`, `protectedTokens`, or structural `context` merely to make validation pass. Validation recomputes `sourceHash` and the protected tokens from the selected source/reference text under the named token profile, while apply checks the adapter policy again. Such an edit fails rather than passing. A changed source requires a fresh export or an adapter fix.

## Translation constraints

- Preserve every `protectedTokens` value exactly, including case and punctuation, and keep the same number of occurrences as the text named by `protectedTokenSource`. A placeholder that appears twice there must appear twice in the target, and one it does not contain must not appear in the target at all.
- Preserve intentional line breaks, markup, interpolation variables, and control codes.
- Use `reference` only as supporting context; translate the configured source language.
- Follow the project glossary, character voice guide, and style rules. [glossary-and-style.md](glossary-and-style.md) gives their canonical paths; ask the coordinator when a batch arrives without them.
- Mark uncertain entries `blocked` and explain the issue in `note` instead of guessing silently.

## Parallel batches

Partition by file first and stable ID second. Never assign the same JSONL file to multiple writers unless the environment provides isolated branches or worktrees and the coordinator expects to resolve conflicts. Review agents may read across batches but should write only their assigned output.
