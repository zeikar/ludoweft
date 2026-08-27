# MAGES visual novels

Findings for MAGES titles reached through the `freemote-info-psb` adapter. Everything below was verified against a shipped title; items proven in-game are marked. Extend this file when a run teaches something new, and keep per-game facts in the project repository.

## Language slots

Resources carry every language in parallel. A title shipping four languages exposes them as slot 0 through 3, with slot 0 the Japanese original. `languages` in a scenario document lists the non-base languages in slot order.

Two different layouts exist, and they are not interchangeable:

- **Language at the leaf.** Text sits in an array of one string per language, so the language axis is at the bottom of the tree. The `localized-string-array` handler finds exactly this shape, matching a leaf array whose length equals the resource's `arrayLength` — 4 unless the project sets it, so a title shipping a different number of languages must say so. The match is a pure shape test, so an unrelated array of that many strings in the same document is picked up as segments too.
- **Language at the root.** The document holds one complete sub-document per slot. `localized-string-array` finds nothing here, because it looks for leaf arrays of strings; use `per-language-document` instead. It takes `languagePointer` (the language array, `/language` by default), `entryPointer` (the entry list inside each language), and `fields` (which keys of an entry to translate). Adding the file to an existing resource's `include` is not enough — the shape needs the other handler.

A root-language resource can also sort each language independently, so index *i* in one slot and index *i* in another are unrelated entries. Look for an index-conversion table stored beside the data and give its pointer to `per-language-document` as `indexPointer`; the handler pairs through it and refuses a table that is not a permutation of the entry list. Without that pointer it pairs by position, which is correct only for resources that share one order.

## An absent speaker is not always narration

`mages-scenario` puts a scene's speaker in a segment's `context` when the text carries one. It is missing whenever the line does not open a new speaker header, and that covers two unrelated cases: ordinary narration, and a row that continues the previous speaker's own block.

The second case is easy to miss and expensive when missed. Message-board scenes are built from post headers, and every line after a header until the next one belongs to that poster. Rendering those in the narrator's voice breaks the thread. In one title, 96 of the header-less rows were continuations rather than narration, across four files.

Decide by looking at the surrounding rows rather than by the field alone: if a nearby speaker looks like a post header rather than a character name, treat every header-less row until the next header as the same writer continuing.

## Ruby

Scenario text marks ruby as `[reading,N]base`, where **N is the number of base characters the reading spans**, counted forward from the marker. The reading is distributed evenly across those characters, and N need not cover the whole word.

**Verified in-game:** ruby renders in a non-Japanese slot. Shipped localizations that avoid ruby entirely are not evidence against this — see the font section.

## Font faces

Faces are declared in the init resource as `{face, file}` entries, typically a body face plus per-language variants and **a separate `ruby` face**. A per-language `facemap` then remaps face names, commonly only the body face.

Remapping only the body face leaves ruby drawn with the original font. Body text renders correctly while ruby shows missing-glyph boxes, which reads as "the engine does not support ruby in this slot" and is not. Map every face the target script needs, `ruby` included.

**Verified in-game:** adding `ruby` to the facemap turns the boxes into correct glyphs with no other change.

## The token profile is per resource, not per engine

`mages-scenario` defaults to the `mages` protected-token profile. Every other handler defaults to `default`, so a resource that is not scenario text — a localized string array in the same archive, for instance — gets the profile only when the project sets `protectedTokenProfile` on that resource.

Without it the generic patterns apply and both failures the profile exists to prevent come back: the percent-wrapped placeholder pattern joins `%CContinue%p` into one token, and the generic markup pattern claims a whole `<name,index,display>` tag, forcing the reference language into every target. Neither is reported. `validate` passes and the wrong text ships.

## Cross-reference tags

Scenario text carries tags of the form `<name,index,display>`. The display field is localized along with the rest of the line; the structural head is not. The `mages` protected-token profile claims `<name,index,` for exactly this reason — protecting the whole tag would force the reference language into every target. It only applies where the resource actually uses the profile; see the section above.

The index in these tags may not share the origin of an index-conversion table in the resource the tag points at. One shipped title uses 1-based tags against 0-based table indices. Check the offset against a known pair rather than assuming.

## Control codes

`%C` and `%p` are two-character controls that can be followed immediately by text or by another control, as in `%CContinue%p`. `%%C` also occurs. The `mages` profile claims these ahead of the generic percent-wrapped placeholder pattern so it cannot join two controls into one token — again, only on resources that use the profile.

Because the percent sign is a control head, a percent sign that means "percent" is written `%`. This escape is not a protected token, so `validate` compares nothing and a missing backslash passes every gate — the engine then reads the following character as a control and the line renders wrong. Check the shipped localizations for which convention they use before the first batch: in one game every one of the 45 literal percent signs was escaped and every unescaped one was a control head, so the rule was decidable by counting.

Escapes like this are the class of engine detail worth searching for deliberately. A translator meeting one mid-batch will usually route around it — writing the word instead of the sign — and the convention stays undiscovered until a later batch writes it plainly and ships it broken.
