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

**Give the worker somewhere to report what it had to decide.** A brief that asks only for translated rows gets only translated rows: a worker meets a term the glossary does not cover, chooses well, and says nothing, so the choice stays invisible until a reviewer finds it or the next batch answers differently. One batch coined ten renderings that way and surfaced none. Ask for those decisions as a named part of the deliverable, and read an empty list on a long batch as a worker that did not notice rather than a batch that raised nothing.

**Review is a different agent from the one that translated the batch.** An agent reviewing its own output re-reads its own reasoning and confirms it. A reviewer checks meaning against the source, adherence to the glossary and voice guide, protected tokens, and consistency with neighbouring scenes — which it may read but must not write. It promotes what it accepts to `reviewed` and records `reviewedBy`, and returns what it cannot resolve as `blocked`.

Neither role runs `apply`, `build`, or `verify`, and neither copies anything into a game directory.

## Match the model to the kind of judgment

Work in a localization run comes in three shapes, and only one of them needs the strongest model available.

- **Deterministic transformation** — a glossary lookup, a fixed value map, a field that mirrors another, a format change. Write a script. It costs nothing, repeats exactly, and can be tested; no model can promise that it will render the same input the same way twice. Reach for a model here and settled terminology gets re-decided once per worker.
- **Applying decisions already made** — translating against a glossary, style rules and a voice guide that carry the calls. A mid-tier model is enough, because the worker is applying judgment rather than forming it. This is the bulk of the work.
- **Making or catching decisions** — deriving the glossary and voice guide, and reviewing what came back. Spend the strongest tier here. A merely adequate translation can be revised later; an error review fails to catch is already copied through every batch that followed it.

Choose by whether the decision has been made, not by how important the text feels. The most expensive tier on a batch whose terminology is already fixed buys very little; the same tier on the review that guards twenty batches buys a great deal.

## Keep parallel workers from diverging

**Settle the open questions before fanning out.** Anything a style guide still lists as undecided will be decided independently by each worker, and their answers will not agree. In one run two workers given the same undecided punctuation rule produced opposite results across a shared file — one normalized every bracket to a single form, the other preserved three distinct forms — and reconciling them afterwards cost more than the decision would have.

**Give each worker its own scratch path.** Workers pointed at one shared scratch directory choose the same obvious filenames and overwrite each other's intermediate work. Name the path per worker, or let each write only inside its own output file.

**Spend the consistency budget on formatting, not on words.** Two workers translating adjacent files blind to each other agreed on every shared term the glossary had missed — ten loanwords and names, all rendered identically, and identically again to a batch translated days earlier. Vocabulary converges on its own, because the target language's own conventions are strong enough to lead independent workers to the same answer.

Punctuation does not. In the same run one worker rewrote the source's quotation marks into the form ordinary in the target language while the other preserved them, and the same split had happened in an earlier batch on the same rule. A rule that tells a worker to preserve something the target language would normally change is the rule that breaks, and it breaks quietly — the text reads correctly either way, so only a comparison finds it.

A wider run said the same thing louder. Four workers, four files, and a term list checked across every file translated so far: one mismatch, and it was the coordinator's own — a glossary entry adopted with different spacing than the batch that coined it. The formatting split twice more, on two axes nobody had thought to decide: whether an honorific suffix takes a space before it, and which of two nearly identical middle-dot characters to use.

So verify what diverges rather than what you fear diverging. Extract the punctuation and spacing from source and translation, compare the sequences, and reconcile mechanically before merging. Checking terms by hand mostly confirms they already agree.

Expect the axis to be new each time. These splits are not one recurring bug to be fixed once — they are wherever the style guide happens to stop, and every batch finds a different edge. Settle each as it appears, and write down why the answer is what it is: the honorific rule ended up spacing one suffix and not another, and a note saying only "space them" would have been undone by the next worker who met the exception.

## Have workers write their output as they go

A worker that holds its whole batch until the end loses all of it when the run dies — and runs do die, on session limits and transient API errors. Tell each worker to write a partial deliverable early and rewrite it as it progresses. Two workers on the same range were interrupted in one session: the one that wrote incrementally left 61 usable rows behind, the one that did not left nothing.

The salvage is cheap once the file exists. Diff the delivered ids against the assigned range, and re-assign only the gap — a fresh worker finishing 56 rows costs a fraction of redoing 117, and it can read the interrupted worker's own output for continuity.

Verify what an interrupted worker delivered before trusting it. Its self-check is the last thing it does, so a partial file has never been checked. In that same session the interrupted output carried protected-token errors that the completed one did not.

## Escaping in the deliverable is not the same as escaping in the text

When workers return structured output, the deliverable format has its own escaping, and it silently competes with the game's. A workspace that stores a line break as the two characters backslash-n needs those two characters written as four in a JSON string; a worker writing the obvious one produces a real newline and fails validation.

It is not a translation judgment, so care and source-reading do not prevent it — three workers in a row made the identical mistake. State the deliverable-level form explicitly in the brief, and check it mechanically at merge: it is invisible in a diff and obvious to a script.

## Correcting a worker that is already running

Send the decision, not the repair. A message saying "the file currently says X and I am fixing it to Y" is self-invalidating: by the time the worker reads it you have made the fix, the worker checks, finds Y, and concludes your message was false. One worker did exactly that and reported the coordinator's message as a possible impersonation attempt — correct instinct, wrong conclusion, and it wasted the worker's time. Say what the value is now.

Assume the correction does not reach everyone. It reaches the workers you message; workers launched before it and never told will finish carrying the old value, and a worker that rewrites its output file after you edit that file in place will silently revert your edit. Both happened in one run. Sweep every deliverable for the corrected term at merge time and treat the messages as an optimization, not as the mechanism.

## The coordinator does not delegate the gates

The coordinator owns merges, `validate`, glossary adoption, and the build stages, and is the only party that raises contested calls with the user.

Delegating validation defeats it. A worker that writes a batch and then validates its own batch reports the result it was hoping for.

**Segments that share a source must share a target.** Group every translated row by its source text and flag any group whose targets disagree. It is the cheapest cross-file consistency check there is: it needs no glossary and no term list, and it finds exactly the divergence that matters — the same line, rendered two ways, in a game that will show both.

A repeated block is where it lands. One title had a three-line scene appearing in two files; two workers who could not see each other produced identical text for the first and third lines and different text for the second. Nothing else would have caught it — no term was involved, both readings were good Korean, and both files validated clean.

Read the groups rather than auto-unifying them. A shared source can legitimately diverge when something outside the source separates the two rows — a different speaker, or a shipped reference translation that read them differently. In one workspace three rows shared a one-word source: two were the same character saying the same thing in two files and had to match, and the third was a different character whose reference rendered it differently, and unifying that one would have flattened a distinction the original localization had drawn.

Run it after each merge alongside `validate`. Thirteen shared-source groups across the whole workspace took one pass to check.

Run `validate` after every merge rather than once at the end. A protected-token error caught at the first merge costs one batch to fix; the same error found after twenty batches costs a re-read of all twenty.

Escalate to the user rather than around them: contested terminology, culturally sensitive material, UI strings that cannot meet a length limit, and anything a reviewer has marked `blocked` twice.
