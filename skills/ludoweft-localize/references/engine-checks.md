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

## Untranslated text on screen is not always a missed resource

When a player reports text still in the original language, find where the renderer reads it before adding a resource for it. Three different things look identical from the player's seat:

- **A resource nobody extracted.** The fix is a resource definition.
- **A document that is loaded but not drawn from.** The same text often lives in two places — a scenario line and a name table beside it — and only one reaches that screen. Translating the wrong one changes nothing and looks like the patch failed.
- **A pre-rendered image.** Some engines ship one image per language for text-heavy screens; a title doing this had them beside the ordinary art, distinguished only by a language suffix on the filename. No text edit can reach those.

The cheapest way to tell them apart is a distinctive string from the screen — a post id, a handle, a serial number — searched across every archive. If it appears in no text resource at all while the screen shows it localized, it is rendered art.

A screenshot settles in seconds what static analysis argues about for an hour. Ask for one.

## Record what the run taught

Write engine behaviour to `ludoweft/engine-notes.md` in the project, beside the glossary and style rules: markup the engine understands, font faces and how they are remapped, tags whose display text is localized, control codes, and anything a build silently drops. State which findings were verified in-game and which are inferred.

Findings that hold for an engine rather than for one game belong upstream. `references/engines/` collects them, one file per engine, and a new engine file is a welcome contribution. Keep game-specific facts — archive layouts, file lists, keys, install paths — in the project repository, never in that directory.

## Available engine references

- [engines/mages.md](engines/mages.md) — MAGES visual novels, reached through the `freemote-info-psb` adapter.

Read the entry that matches the project's engine before the first batch — each entry names the adapters that reach it — and extend it when a run teaches something new.

## Adding an engine file

A new engine file is a welcome contribution. Follow what the existing entries already do:

- Name the file after the engine in lowercase, not after the adapter that reaches it. One adapter can serve more than one engine, and one engine can be reached by more than one adapter.
- Open by naming those adapters, the basis for the findings, and the rule that per-game facts stay in the project repository.
- Add the file to the list above by hand. Nothing scans the directory, so an unlisted entry is invisible.
- Mark anything confirmed by running the game as **Verified in-game:** and leave the rest plainly stated as inference. That distinction is the most valuable thing in an engine file.

Describing markup is a documentation change. Teaching the CLI a new protected-token profile is not: profile names are a fixed allowlist in the core, so a new one needs a code change and a test rather than a reference file.
