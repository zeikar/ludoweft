# Engine checks

A translation can be correct and still ship unreadable. Before translating at scale, prove that the target language actually renders, and record what the engine does so the next session does not rediscover it.

## Prove the target script renders in every text layer

A game draws text in several layers — body text, ruby or furigana, speaker names, choices, UI labels, system messages — and each layer can use its own font. Confirm the target script in each of them, not only in body text.

Fonts are usually declared as named faces and remapped per language. Remapping only the body face leaves every other layer on the original font, and a font built for the source language will not carry the target script. The result is missing glyphs confined to one layer while body text looks perfect.

That failure is easy to misread. Boxes above a correctly rendered line look like the engine not supporting the feature, when the feature works and the font was never mapped. Check the font declaration before concluding anything about engine support.

## Absence in the shipped localizations proves nothing

A feature missing from every localization the game shipped is weak evidence that the engine cannot do it. The original teams may have hit the same unmapped-font problem and quietly stopped using it. Treat their output as a hint about what is conventional, never as a capability test.

Run the test instead. It is cheap and it is the only thing that settles the question.

## Probe at the first line

Put the probe in the first line of the game, so verifying costs seconds rather than a playthrough. A probe should be visually unmistakable — a short marker string rather than a plausible translation — so nobody has to squint to tell whether it worked.

Mark every probe in its `note` field, keep the count to a handful, and revert them once the answer is in. A probe left behind ships as a translation.

## Record what the run taught

Write engine behaviour to `ludoweft/engine-notes.md` in the project, beside the glossary and style rules: markup the engine understands, font faces and how they are remapped, tags whose display text is localized, control codes, and anything a build silently drops. State which findings were verified in-game and which are inferred.

Findings that hold for an engine rather than for one game belong upstream. `references/engines/` collects them, one file per engine, and a new engine file is a welcome contribution. Keep game-specific facts — archive layouts, file lists, keys, install paths — in the project repository, never in that directory.

## Available engine references

- [engines/mages.md](engines/mages.md) — MAGES visual novels, reached through the `freemote-info-psb` adapter.

Read the entry that matches the project's adapter before the first batch, and extend it when a run teaches something new.
