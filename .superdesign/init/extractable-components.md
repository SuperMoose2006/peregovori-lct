# extractable-components.md

Candidates for extraction as reusable Superdesign `DraftComponent` entities.

**Caveat that shapes all of these:** this app has no component library. Styling lives in
one global stylesheet keyed by semantic class names and driven by CSS custom properties
(see `theme.md`). So an extracted component is only faithful if the token block travels
with it.

## Layout components (appear on every screen)

### AppHeader
- Source: `frontend/src/App.tsx` (the `.top` block)
- Category: layout
- Description: Brand wordmark + tagline, then four segmented controls — RU/EN, theme, skin, sound.
- Extractable props: `lang` ("ru"|"en", default "ru"), `isDark` (boolean, default false), `skin` ("dojo"|"game", default "dojo"), `muted` (boolean, default false)
- Hardcoded: the wordmark "Диалог." with its accent dot, the tagline, all glyphs (☀ ◐ 🎓 🎮), all CSS

### AppFooter
- Source: `frontend/src/App.tsx` (the `.foot` block)
- Category: layout
- Description: Two-column footer — product name left, tagline right.
- Extractable props: none (pure copy)
- Hardcoded: both strings, all CSS

### GameShell
- Source: `frontend/src/components/Table.tsx`
- Category: layout
- Description: The negotiation cockpit — a two-column grid (`.table`) of instrument rail + chat card, bounded to the viewport so the transcript scrolls instead of the page.
- Extractable props: `finished` (boolean, default false), `exam` (boolean, default false), `phase` ("judging"|"replying"|null, default null)
- Hardcoded: grid template, breakpoints, all CSS

## Basic components (used across screens)

### ScenarioCard
- Source: `frontend/src/components/ScenarioPicker.tsx`
- Category: basic
- Description: One negotiation scenario — icon, title, your role, difficulty dots, best-grade chip, "Начать →".
- Extractable props: `icon` (string, default "📦"), `title` (string), `role` (string), `difficulty` (1–5, default 2), `best` (grade string | null, default null)
- Hardcoded: the arrow glyph, hover lift, all CSS

### PrimaryButton
- Source: `frontend/src/styles.css` (`.primary`; `.oc-go`, `.send`, `.milestone-go` are variants)
- Category: basic
- Description: The one call to action. In skin "game" it grows a 4px darker bottom lip that the press visibly compresses.
- Extractable props: `label` (string), `disabled` (boolean, default false)
- Hardcoded: radius, weight, uppercase transform (game skin only), all CSS

### MeterBar
- Source: `frontend/src/components/Meters.tsx`
- Category: basic
- Description: One labelled 0–100 bar with a tabular value and a pulse cue when it moves.
- Extractable props: `label` (string), `value` (0–100), `kind` ("trust"|"tension"|"info"|"leverage"), `pulsing` (boolean, default false)
- Hardcoded: bar height/radius per skin, colour-by-kind, all CSS

### ChatBubble
- Source: `frontend/src/components/Chat.tsx`
- Category: basic
- Description: One line of the transcript — opponent (left, panel fill) or player (right, brass/green fill), with a tail on the inner corner.
- Extractable props: `side` ("opp"|"me"), `text` (string), `streaming` (boolean, default false)
- Hardcoded: max-width 84%, radii, tail corner, all CSS

### TechniqueChip
- Source: `frontend/src/components/Chat.tsx` + `frontend/src/lib/tagLabel.ts`
- Category: basic
- Description: A recognized negotiation move under the player's line. The judge-cam variant adds a struck-through chip when a line trips the lexicon without carrying meaning.
- Extractable props: `label` (string), `variant` ("tag"|"judge-on"|"judge-reject", default "tag")
- Hardcoded: pill radius, colour per variant, all CSS

### GradeRing
- Source: `frontend/src/components/Debrief.tsx`
- Category: basic
- Description: The debrief's headline — a conic-gradient ring with the letter grade and score, animating from 0 on mount.
- Extractable props: `grade` ("A".."F"), `score` (0–100)
- Hardcoded: 128px size, inner cutout, colour-by-grade, all CSS

### OutcomeStrip
- Source: `frontend/src/components/Table.tsx` (`.outcome`)
- Category: basic
- Description: The closing beat — 🤝/🚪, the verdict, the settled price, and the button through to the debrief. Replaces the composer for ~2.2s.
- Extractable props: `status` ("agreement"|"breakdown"), `price` (string | null), `ready` (boolean, default true)
- Hardcoded: both glyphs, tinted backgrounds, all CSS

### OpeningCard
- Source: `frontend/src/components/Table.tsx` (`.opening`)
- Category: basic
- Description: The turn-0 table-setting card — the scene in one sentence, the warning that three interests are hidden, and three tappable first lines that fill the composer.
- Extractable props: `title` (string), `scene` (string), `hint` (string), `lines` (array of {tag, text})
- Hardcoded: brass left edge, all CSS

### RevealRow
- Source: `frontend/src/components/Debrief.tsx` (`.reveal li`)
- Category: basic
- Description: One hidden interest with whether the player drew it out. Missed rows are deliberately the LOUD state — they are the lesson.
- Extractable props: `text` (string), `found` (boolean)
- Hardcoded: ✓/? marks, colour inversion, all CSS

### XpStrip
- Source: `frontend/src/components/Gamification.tsx`
- Category: basic
- Description: Rank, XP total, progress to next rank, and the daily 1-2-3 goal.
- Extractable props: `rank` (string), `xp` (number), `toNext` (number), `goalDone` (0–3, default 0)
- Hardcoded: rank names, all CSS
