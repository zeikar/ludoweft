# Agent workflow

The agent layer orchestrates translation; it does not replace the deterministic CLI.

## Recommended roles

- **Coordinator:** inspects the project, creates non-overlapping batches, merges results, and runs validation.
- **Context analyst:** derives a glossary, character voices, naming rules, and scene summaries from authorized workspace content.
- **Translator:** edits only assigned `target` and workflow metadata fields.
- **Reviewer:** checks meaning, voice, terminology, placeholders, and neighboring-scene consistency.
- **Build verifier:** runs validation and rebuild stages and reports evidence without silently installing files.

Small projects do not need separate agents for every role. Parallel workers help only when batches are independent and the coordinator can validate the merge.

## Data boundary

The user chooses which model provider receives source text. Local-only projects should use a local agent or model configuration. Logs, prompts, and artifacts must not be published merely because the Ludoweft core is open source.
