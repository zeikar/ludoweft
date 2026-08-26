# Agent team

Ludoweft's gates are deterministic, but everything between `export` and `apply` is model judgment over more text than one context holds. Run that stretch as a team: parallel where passes are independent, sequential where one writer must own a file.

Scale the team to the workspace. A few hundred segments translated in one sitting need no team at all. Fan out when the work no longer fits a single context, or when independent judgment measurably improves the result.

## One writer per file at a time

Every JSONL file has exactly one writer at any moment, and ownership moves rather than being shared: the translator owns a batch, hands it back, and the reviewer then becomes its only writer. Two agents editing one file concurrently corrupts line ownership, and the merge hides it from the very gate that would have caught it.

Give every worker its exact writable paths. A worker that was never told its boundary will widen it.

## Preparation passes run in parallel

Four read-heavy passes precede the first batch, and three of them are independent:

- **Resource survey** — which resources the adapter actually reaches, which hold terminology or UI text while producing no segments, and which control codes, placeholders, and length limits occur in practice.
- **Glossary** and **character voice** — see [glossary-and-style.md](glossary-and-style.md).
- **Style rules** — start this one after the resource survey returns, because its control-code and length clauses depend on what that pass found.

Each returns a proposal carrying deciding ids, never the text it read. The coordinator adopts, records, and republishes; a worker never adopts its own proposal.

## Translation and review are separate agents

Partition by file first and stable ID second, and keep whole scenes in one batch. A translator that cannot read a scene in order gets voice, referents, and pronouns wrong.

Hand every translator:

- [translation-workspace.md](translation-workspace.md), handed over as a resolved absolute path or as its contents. A subagent inherits neither `SKILL.md` nor the skill directory, so a relative link means nothing to it; resolve the path the way `SKILL.md` resolves the bundled CLI. Without that file a worker edits generated fields or miscounts protected tokens
- the glossary and voice entries in scope, plus the full style rules
- the exact writable files, and the neighbouring context needed to read scenes in order

A translator fills `target`, sets `status` to `translated`, and records itself in `translatedBy`. It escalates a contested call as `blocked` with the reason in `note` instead of guessing.

**Review is a different agent from the one that translated the batch.** An agent reviewing its own output re-reads its own reasoning and confirms it. A reviewer checks meaning against the source, adherence to the glossary and voice guide, protected tokens, and consistency with neighbouring scenes — which it may read but must not write. It promotes what it accepts to `reviewed` and records `reviewedBy`, and returns what it cannot resolve as `blocked`.

Neither role runs `apply`, `build`, or `verify`, and neither copies anything into a game directory.

## The coordinator does not delegate the gates

The coordinator owns merges, `validate`, glossary adoption, and the build stages, and is the only party that raises contested calls with the user.

Delegating validation defeats it. A worker that writes a batch and then validates its own batch reports the result it was hoping for.

Run `validate` after every merge rather than once at the end. A protected-token error caught at the first merge costs one batch to fix; the same error found after twenty batches costs a re-read of all twenty.

Escalate to the user rather than around them: contested terminology, culturally sensitive material, UI strings that cannot meet a length limit, and anything a reviewer has marked `blocked` twice.
