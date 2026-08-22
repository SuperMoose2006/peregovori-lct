# Design system — «Диалог» (negotiation dojo)

A negotiation trainer for the ЛЦТ hackathon. Bilingual RU/EN. React 18 + Vite,
**no component library, no Tailwind** — one global stylesheet driven entirely by CSS
custom properties, consumed through semantic class names.

## Two independent axes

| Attribute | Values | Meaning |
|---|---|---|
| `data-theme` | absent (system) · `light` · `dark` | brightness |
| `data-skin` | absent (`dojo`) · `game` | visual identity |

They compose — each skin ships a light and a dark variant. A build-failing guard test
rejects any `var(--x)` that is never declared.

## Skin "dojo" (current default) — lamplit table

Serif on parchment, brass accents. States the product's position: an honest instrument,
not a toy. The deterministic engine is the selling point, so the surface reads as a
document/ledger.

`--ground #f3eee3` · `--panel #fbf8f1` · `--panel-2 #efe8d9` · `--ink #241e16` ·
`--ink-dim #6b6152` · `--ink-faint #7d7359` · `--line #e0d7c5` · `--line-2 #cfc4ad` ·
`--brass #b07c2e` (primary) · `--brass-soft #c0883c`
Dark: `--ground #14110d` · `--panel #1d1913` · `--ink #ece4d5` · `--brass #d4a24e`

Type: `--serif "Iowan Old Style", Palatino, Georgia, serif` for headlines, quotes and
numbers; `--sans system-ui` for body. Radius `--r 12px`. Soft blurred shadow.

## Skin "game" — Duolingo-style

`--ground #ffffff` · `--panel #ffffff` · `--panel-2 #f7f7f7` · `--ink #3c3c3c` ·
`--ink-dim #777` · `--ink-faint #afafaf` · `--line #e5e5e5` · `--line-2 #d8d8d8` ·
`--brass #3f8f00` (primary) · `--brass-soft #58cc02` · `--edge #2f6b00` (button lip)
Dark: `--ground #131f24` · `--panel #1b2b32` · `--ink #f1f7fb` · `--brass #58cc02`

Type: one rounded sans for BOTH `--serif` and `--sans` — the serif is retired, since it
is what makes the default skin read as a document. Radius `--r 16px`. Borders 2px, flat.
`--shadow` is a solid 4px lip, never a blur.

**The 3D button** is the single most identity-defining detail: a 4px darker bottom edge
that a press visibly compresses (`translateY(3px)`, lip shrinks to 1px).

**Contrast rule (non-negotiable).** Duolingo's own `#58cc02` under white text is ~2.2:1,
a WCAG failure. The primary token is therefore the darker `#3f8f00` (~4.2:1 on white);
the bright green lives in `--brass-soft`, where nothing is written on top of it.

**No webfont is linked.** Nunito is named in the stack as a progressive enhancement only
— a demo on venue wifi must not wait on `fonts.gstatic.com` to paint. The look must hold
on shape and weight alone.

## Semantic colours (both skins)

`--trust` green · `--tension` red · `--info` blue · `--leverage` violet.
These are the four negotiation meters and they also carry meaning elsewhere: the AI
judge's chrome is `--info`, a broken-off deal is `--tension`, an agreement `--trust`.

## Layout vocabulary

`.wrap` page column (1120px; 1360px at ≥1440px) · `.top` header · `.foot` footer ·
`.table` game grid (320px instrument rail + chat, bounded to the viewport so the
transcript scrolls, never the page) · `.chat` / `.log` / `.bub` transcript ·
`.debrief` report · `.card` scenario card · `.primary` / `.quit` buttons ·
`.seg` segmented control.

Breakpoints: `≥1440px` wide desktop/projector · `≤860px` game collapses to one column ·
`≤640px` phone.

## Content rules

- All copy is bilingual and typed: `src/i18n.ts` exports `I18N.ru` / `I18N.en` against a
  `Strings` interface, so a new string must exist in BOTH tables or the build fails.
- Numbers are formatted through `lib/format.ts` (locale-aware decimal separator).
- Honesty constraint that shapes the UI: the deterministic engine owns all state and
  scoring. Chrome that implies a live AI judgement (the "graded by meaning" badge, the
  judge-cam chips, the mentor's closing word) may ONLY render when a live judge actually
  ran. Offline the same screens must read complete without them.

## Target direction for this design work

Bring the **app shell** to a Duolingo-like structure — persistent left navigation, a top
stats strip (streak / XP / hearts), a right rail of widgets (daily goal, leaderboard),
and a center content column — instead of the current single centered column with a thin
header and footer. Keep the bilingual copy, the four meters, and the honesty constraint.
