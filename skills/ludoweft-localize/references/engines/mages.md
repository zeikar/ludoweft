# MAGES visual novels

Findings for MAGES titles reached through the `freemote-info-psb` adapter. Everything below was verified against a shipped title; items proven in-game are marked. Extend this file when a run teaches something new, and keep per-game facts in the project repository.

## Language slots

Resources carry every language in parallel. A title shipping four languages exposes them as slot 0 through 3, with slot 0 the Japanese original. `languages` in a scenario document lists the non-base languages in slot order.

Two different layouts exist, and they are not interchangeable:

- **Language at the leaf.** Text sits in an array of one string per language, so the language axis is at the bottom of the tree. The `localized-string-array` handler finds exactly this shape.
- **Language at the root.** The document is an array of complete per-language documents, one per slot. `localized-string-array` finds nothing here, because it looks for leaf arrays of strings. A resource like this needs its own handler; adding the file to `include` is not enough.

A root-language resource can also sort each language independently, so index *i* in one slot and index *i* in another are unrelated entries. Look for an index-conversion table stored beside the data and pair through it. Verify that any such tables are exact inverse permutations before trusting them.

## Ruby

Scenario text marks ruby as `[reading,N]base`, where **N is the number of base characters the reading spans**, counted forward from the marker. The reading is distributed evenly across those characters, and N need not cover the whole word.

**Verified in-game:** ruby renders in a non-Japanese slot. Shipped localizations that avoid ruby entirely are not evidence against this — see the font section.

## Font faces

Faces are declared in the init resource as `{face, file}` entries, typically a body face plus per-language variants and **a separate `ruby` face**. A per-language `facemap` then remaps face names, commonly only the body face.

Remapping only the body face leaves ruby drawn with the original font. Body text renders correctly while ruby shows missing-glyph boxes, which reads as "the engine does not support ruby in this slot" and is not. Map every face the target script needs, `ruby` included.

**Verified in-game:** adding `ruby` to the facemap turns the boxes into correct glyphs with no other change.

## Cross-reference tags

Scenario text carries tags of the form `<name,index,display>`. The display field is localized along with the rest of the line; the structural head is not. The `mages` protected-token profile claims `<name,index,` for exactly this reason — protecting the whole tag would force the reference language into every target.

The index in these tags may not share the origin of an index-conversion table in the resource the tag points at. One shipped title uses 1-based tags against 0-based table indices. Check the offset against a known pair rather than assuming.

## Control codes

`%C` and `%p` are two-character controls that can be followed immediately by text or by another control, as in `%CContinue%p`. `%%C` also occurs. The `mages` profile claims these ahead of the generic percent-wrapped placeholder pattern so it cannot join two controls into one token.
