# pages.md — screen dependency trees

`App.tsx` is the single entry for every screen (no router). Trees below list the local
imports each screen actually pulls in — the **candidate set** for `--context-file`.
Apply the payload budget: for most tasks `App.tsx` + the screen's own component +
`theme.md`'s Part 1 summary is enough; do NOT pass the whole 1852-line `styles.css`
unless the task is specifically about it.

## home
Entry: `src/App.tsx` (screen === "home")
Dependencies:
- src/components/Gamification.tsx        (XP strip, daily goal, toasts, milestone overlay)
  - src/lib/progress.ts
- src/components/WhyTeaches.tsx          (proof-of-method panels)
- src/components/ScenarioPicker.tsx      (mode picker + 8 scenario cards)
  - src/data/scenarios.ts
  - src/lib/progress.ts
- src/components/CustomSituation.tsx     (free-text brief for mode "custom")
- src/components/ScreenHeading.tsx
- src/i18n.ts
- src/styles.css

## game
Entry: `src/App.tsx` (screen === "game") -> `src/components/Table.tsx`
Dependencies:
- src/components/Table.tsx               (the whole cockpit: rail + chat + composer)
  - src/components/Avatar.tsx            (counterpart portrait, mood-reactive)
  - src/components/DealTracker.tsx       (price scale + sparkline)
  - src/components/DealTerms.tsx         (tradeable secondary issues)
  - src/components/Meters.tsx            (trust / tension / info / leverage)
  - src/components/Scorecard.tsx         (per-turn rubric chips)
  - src/components/Chat.tsx              (transcript, tags, coach lines, judge-cam)
    - src/lib/tagLabel.ts                (localizes move tags from their stable key)
  - src/components/Composer.tsx          (input, quick moves, hint)
  - src/components/Onboarding.tsx        (first-run tutorial)
  - src/lib/format.ts
  - src/lib/sound.ts
- src/api/useNegotiation.ts              (WS turn protocol + offline mock fallback)
  - src/api/transport.ts
  - src/api/ws.ts
  - src/mock/mockServer.ts
    - src/mock/engine.ts                 (deterministic offline mirror of the Python engine)
- src/types.ts
- src/i18n.ts

## debrief
Entry: `src/App.tsx` (screen === "debrief") -> `src/components/Debrief.tsx`
Dependencies:
- src/components/Debrief.tsx             (grade ring, score bars, stats, reveal, turning
                                          points, mentor's word, master line, what-if,
                                          exam certificate variant)
  - src/lib/whatif.ts                    (picks the pivotal turn; deterministic replay)
  - src/api/whatif.ts
  - src/lib/progress.ts                  (personal best, XP award)
  - src/components/ScreenHeading.tsx
- src/types.ts
- src/i18n.ts

## campaign_done
Entry: `src/App.tsx` -> `src/components/CampaignScreen.tsx`
Dependencies:
- src/components/CampaignScreen.tsx
  - src/api/campaigns.ts
  - src/data/campaigns.ts

## profile
Entry: `src/App.tsx` (screen === "profile")
Dependencies:
- src/components/Gamification.tsx
- src/lib/progress.ts

---

## Where the content comes from

All copy is bilingual and lives in `src/i18n.ts` (`I18N.ru` / `I18N.en`, typed by the
`Strings` interface). Scenario content lives in `src/data/scenarios.ts`. A design that
introduces new text must add it to BOTH language tables — the `Strings` type enforces it
at build time.
