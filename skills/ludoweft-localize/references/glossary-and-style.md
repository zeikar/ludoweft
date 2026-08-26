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

Deriving these documents reads far more workspace text than translating a single batch does. Delegate each pass to its own subagent and require proposals carrying deciding ids rather than the text it read; [agent-team.md](agent-team.md) covers how the passes divide, what comes back, and who adopts it.

## Glossary

One row per term that must not vary between segments. Rejected variants are listed explicitly so a later batch does not reintroduce them, and the UI column flags terms that also face a length limit.

```markdown
| Source | Target | Deciding id | Rejected | UI |
|---|---|---|---|---|
| 星辰議会 | 성진의회 | ch01_02#s2:t7 | 스텔라 카운슬, 별의회 | yes |
| 忘却炉 | 망각로 | ch03_11#s1:t22 | 오블리비언 퍼니스 | no |
| 灰の刻 | 잿빛 시각 | ch02_05#s4:t3 | 애쉬 아워, 재의 시간 | yes |
```

Also record how a term inflects, attaches particles, or pluralizes in the target language when that is not obvious from the target column.

Cover proper nouns, invented terminology, organization and device names, recurring UI labels, units, date and time formats, and any term the reference language renders differently from the source. Prefer a stable rendering over an elegant one; a term that reads slightly flat in every scene costs less than one that shifts between scenes.

## Character voice

One entry per speaker who has more than a handful of lines:

```markdown
### 灰森隊長 / 하이모리 대장

- First person: 俺 → "나", but shifts to 私 → "저" in front of the council
- Address: calls every squadmate by rank, never by given name while on duty
- Politeness: plain form with the squad, polite form on the bridge
- Tics: へっ → "훗" (fixed)
- Register shift: drops to flat plain form mid-scene once a mission has failed
- Examples: ch01_02#s2:t7, ch03_11#s1:t22
```

Derive each entry from lines the speaker actually has. When the workspace exposes a speaker in `context`, group by it; otherwise identify speakers while reading a scene in order and record the ids used.

## Style rules

Cover what the glossary and the voice guide do not:

- the default register for narration, UI, and system messages
- punctuation, ellipsis, quotation marks, and numeral conventions
- where protected tokens sit in a sentence — [translation-workspace.md](translation-workspace.md) covers which slot `protectedTokenSource` names and how occurrences are counted
- the line-break policy, and any length limit, named together with the constraint that causes it
- how to handle text the source deliberately leaves in another language
- which situations to mark `blocked` instead of guessing

## Keep them current

Append decisions; do not rewrite history. Earlier batches were translated against the guide as it stood, and a reviewer needs to see which version applied.

When a decision changes, list the affected segment ids and revise them. A re-export never rewrites a `target` for a terminology change, so an unrevised segment keeps the old term and still validates.

## Hand off to workers

[agent-team.md](agent-team.md) owns the handoff: what each worker receives and how to address the files it must read, who may write which file, and why workers propose glossary entries while only the coordinator adopts them.
