# Glossary and style guide

A glossary, a character voice guide, and a set of style rules are the project context that keeps separate batches, sessions, and workers consistent. Ludoweft does not read, store, or validate them; the coordinator authors them and hands them to every translator and reviewer.

## Where they live

Write them to fixed paths beside `ludoweft.project.json`, so a later session finds the decisions instead of making them again:

```text
ludoweft/glossary.md
ludoweft/voice.md
ludoweft/style.md
```

Check those paths before authoring anything. When they exist, extend them; a rewrite silently discards decisions that earlier batches were already translated against.

They quote extracted source text, so they fall under the same boundary as the workspace and never belong in a public repository.

Build them after the first successful `export` and before the first translated batch. A workspace small enough for one uninterrupted session needs only a short shared note; anything split across batches, files, or workers needs all three.

## Check what the game already ships

Text-heavy games often carry their own terminology data: a tips or encyclopedia menu, a character roster, an item or skill database, an archive of in-game documents. When the game ships in more than one language, that resource is a bilingual glossary written by the original localization team, and it is stronger evidence than anything inferred from dialogue. It usually carries a category and a definition per term as well.

Look for it before authoring entries. Search the extracted resource tree for names such as `tips`, `dic`, `glossary`, `word`, `term`, `encyclopedia`, `chrname`, or `database`, and inspect any file whose size stands out from its neighbours.

Two cautions:

- **The resource may sit outside the adapter's reach.** A file that yields no segments is still readable straight from the extracted tree, so mine it for terminology regardless. Report it as well: a resource that holds terminology is usually one the patch should be translating.
- **Parallel language arrays are not always index-aligned.** A menu sorted for display follows each language's own collation, so entry 0 in one language and entry 0 in another describe different terms. Look for an index-conversion table stored beside the data, pair through it, and spot-check several pairs before trusting the set. A misaligned mining pass yields a glossary that is uniformly wrong and still reads as plausible.

Treat what the resource yields as a proposal, not a decision. An official rendering still has to satisfy the project's style rules, and the target language is often not among the languages the game ships.

## Derive them from the workspace

Read the exported JSONL, not memory and not a summary of the game. Count how often a term actually occurs and where, then decide it once.

Record the segment `id` that decided each entry. A reviewer must be able to open that line and check the call.

Bring contested names, honorific handling, and anything with an established community rendering to the user as a decision, with the options and the tradeoff. Do not import terminology from fan translations or wikis unprompted. Do not invent a reading for a name the source never disambiguates; mark those segments `blocked` and ask.

Deriving these documents reads far more workspace text than translating a single batch does. Delegate that pass to a subagent when the host provides them, and require it to return the proposed entries and their deciding ids rather than the text it read. The coordinator's context is better spent on merges and validation, and a proposal carrying its own evidence stays checkable without a second reading pass.

## Glossary

One row per term that must not vary between segments. Rejected variants are listed explicitly so a later batch does not reintroduce them, and the UI column flags terms that also face a length limit.

```markdown
| Source | Target | Deciding id | Rejected | UI |
|---|---|---|---|---|
| 未来ガジェット研究所 | 미래 가제트 연구소 | resg00_01.ks#s1:t14 | 퓨처 가젯 연구소 | yes |
| Dメール | D메일 | resg01_13.ks#s3:t2 | 디메일, D-메일 | yes |
| リーディングシュタイナー | 리딩 슈타이너 | resg00_01.ks#s2:t31 | 리딩 슈타이너現象 | no |
```

Also record how a term inflects, attaches particles, or pluralizes in the target language when that is not obvious from the target column.

Cover proper nouns, invented terminology, organization and device names, recurring UI labels, units, date and time formats, and any term the reference language renders differently from the source. Prefer a stable rendering over an elegant one; a term that reads slightly flat in every scene costs less than one that shifts between scenes.

## Character voice

One entry per speaker who has more than a handful of lines:

```markdown
### 岡部倫太郎 / 오카베 린타로

- First person: 俺 → "나", but 鳳凰院凶真 mode uses "이 몸"
- Address: 助手 → "조수", never "크리스" while in character
- Politeness: plain form throughout; drops to polite only with Mr. Braun
- Tics: フゥーハハハ → "후하하하하" (fixed); エル・プサイ・コングルゥ → "엘 프사이 콩그루" (fixed)
- Register shift: mid-scene drop to plain sincerity after a D-mail failure
- Examples: resg00_01.ks#s1:t0, resg01_13.ks#s3:t18
```

Derive each entry from lines the speaker actually has. When the workspace exposes a speaker in `context`, group by it; otherwise identify speakers while reading a scene in order and record the ids used.

## Style rules

Cover what the glossary and the voice guide do not:

- the default register for narration, UI, and system messages
- punctuation, ellipsis, quotation marks, and numeral conventions
- where protected tokens sit in a sentence — `translation-workspace.md` covers which slot `protectedTokenSource` names and how occurrences are counted
- the line-break policy, and any length limit, named together with the constraint that causes it
- how to handle text the source deliberately leaves in another language
- which situations to mark `blocked` instead of guessing

## Keep them current

Append decisions; do not rewrite history. Earlier batches were translated against the guide as it stood, and a reviewer needs to see which version applied.

When a decision changes, list the affected segment ids and revise them. A re-export never rewrites a `target` for a terminology change, so an unrevised segment keeps the old term and still validates.

## Hand off to workers

Give each worker `references/translation-workspace.md`, the glossary entries and voice entries in scope, the full style rules, the assigned files, and the neighbouring context needed to read a scene in order. A worker that never sees the workspace reference does not know which fields are editable or how protected tokens are counted.

Workers propose glossary additions; they do not adopt them. The coordinator decides, records the entry, and republishes it, so a term first met in one batch is rendered the same way in every other.
