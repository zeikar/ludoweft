# Translation workspace

Each JSONL line is one independent segment. Preserve line boundaries so Git diffs and agent batches remain stable.

## Editable fields

- `target`: translated text
- `status`: `untranslated`, `draft`, `translated`, `reviewed`, or `blocked`
- `translatedBy` and `reviewedBy`: optional provenance labels
- Adapter-defined translation notes, when documented by the project

Do not edit `id`, `source`, `reference`, `sourceHash`, `protectedTokens`, or structural `context` merely to make validation pass. A changed source requires a fresh export or an adapter fix.

## Translation constraints

- Preserve every `protectedTokens` value exactly, including case and punctuation.
- Preserve intentional line breaks, markup, interpolation variables, and control codes.
- Use `reference` only as supporting context; translate the configured source language.
- Follow the project glossary and character voice guide when present.
- Mark uncertain entries `blocked` and explain the issue in an adapter-supported note field instead of guessing silently.

## Parallel batches

Partition by file first and stable ID second. Never assign the same JSONL file to multiple writers unless the environment provides isolated branches or worktrees and the coordinator expects to resolve conflicts. Review agents may read across batches but should write only their assigned output.
