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

## Correcting a worker that is already running

Send the decision, not the repair. A message saying "the file currently says X and I am fixing it to Y" is self-invalidating: by the time the worker reads it you have made the fix, the worker checks, finds Y, and concludes your message was false. One worker did exactly that and reported the coordinator's message as a possible impersonation attempt — correct instinct, wrong conclusion, and it wasted the worker's time. Say what the value is now.

Assume the correction does not reach everyone. It reaches the workers you message; workers launched before it and never told will finish carrying the old value, and a worker that rewrites its output file after you edit that file in place will silently revert your edit. Both happened in one run. Sweep every deliverable for the corrected term at merge time and treat the messages as an optimization, not as the mechanism.

## The coordinator does not delegate the gates

The coordinator owns merges, `validate`, glossary adoption, and the build stages, and is the only party that raises contested calls with the user.

Delegating validation defeats it. A worker that writes a batch and then validates its own batch reports the result it was hoping for.

Run `validate` after every merge rather than once at the end. A protected-token error caught at the first merge costs one batch to fix; the same error found after twenty batches costs a re-read of all twenty.

Escalate to the user rather than around them: contested terminology, culturally sensitive material, UI strings that cannot meet a length limit, and anything a reviewer has marked `blocked` twice.
