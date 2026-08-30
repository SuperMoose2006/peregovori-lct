# routes.md — screens

**No URL routing.** This is a single-page app with one `screen` state variable in
`App.tsx`; there are no route files, no React Router, no history integration. A
"route" here means a value of the `Screen` union.

| Screen | Trigger | Renders | Notes |
|---|---|---|---|
| `home` | initial | hero, `Gamification` XP strip, `WhyTeaches`, mode picker, `ScenarioPicker` | the only scrolling marketing-ish surface |
| `generating` | mode `custom` + situation submitted | generation spinner | AI builds a bespoke scenario |
| `gen_error` | generation failed/timed out | error panel + fallback to the ready-made picker | |
| `game` | scenario chosen | `Table` (rail + `Chat` + `Composer`) | the negotiation itself |
| `debrief` | engine closed the session | `Debrief` | grade ring, score bars, hidden-interest reveal, turning points, mentor's word, what-if |
| `campaign_done` | final campaign act scored | completion screen with average grade | |
| `profile` | header/profile entry | retention profile (XP, rank, streak, per-scenario bests) | |

Mode (`practice | campaign | custom | exam`) is orthogonal to screen and changes what
`game`/`debrief` show — exam withholds all live coaching, campaign carries reputation
between acts.

## Transport

The screens talk to the backend over one WebSocket (`/ws`) using a modality-independent
"turn" protocol, with a deterministic offline mock as fallback.

### `frontend/src/api/useNegotiation.ts`

```ts
// useNegotiation.ts — the single hook the UI uses to run a negotiation.
// Wraps the transport (WS or Mock), reduces the ServerMsg stream into React
// state (scenario, live meters, chat log, debrief), and exposes clean actions.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Analysis, Deltas, Lang, Mode, ScenarioView, ServerMsg, StateView } from "../types";
import type { ConnStatus, Transport, TransportKind } from "./transport";
import { createTransport } from "./ws";
import { clampInput } from "../lib/net";

export type ChatEntry =
  | { id: number; kind: "opp"; text: string; streaming?: boolean }
  | { id: number; kind: "me"; text: string; analysis?: Analysis; deltas?: Deltas }
  // `pending` marks the placeholder shown the instant 💡 is pressed. With a
  // live AI coach the answer takes seconds, and without a placeholder the
  // press produced no visible change at all.
  | { id: number; kind: "hint"; text: string; line?: string; pending?: boolean }
  // coach: the semantic judge's per-turn nudge, threaded under the exchange.
  // Rendered by Chat (hidden in exam mode) — the hook stays modality/mode-agnostic.
  // techniques / reject ride along ONLY when the live judge scored this turn (the
  // "judge-cam" chips); both absent offline/mock where no live judge ran.
  | { id: number; kind: "coach"; text: string; techniques?: string[]; reject?: boolean }
  | { id: number; kind: "sys"; text: string };

export interface NegotiationState {
  kind: TransportKind | null;
  scenario: ScenarioView | null;
  state: StateView | null;
  log: ChatEntry[];
  debrief: import("../types").Debrief | null;
  busy: boolean; // waiting for the opponent's reply
  // What the server is doing during `busy`. "judging" means the semantic judge is
  // reading the player's line (the engine cannot score the move without it, so
  // the opponent has not started composing yet); "replying" means it has. Null
  // when the server never said — the client must render fine either way.
  phase: "judging" | "replying" | null;
  error: string | null;
  // Live WS health (mock is always "online"). Drives the mid-game reconnect banner.
  conn: ConnStatus;
  // Whether the semantic judge is live for this session (from the greeting). Drives
  // the "graded by meaning" badge — false offline/mock (deterministic keyword path).
  judgeActive: boolean;
}

export interface Negotiation extends NegotiationState {
  // situation is the free-text brief for mode "custom" (ignored otherwise).
  // reputation (-100..100) carries a campaign result into the next stage's trust.
  start: (scenarioId: string, mode: Mode, situation?: string, reputation?: number) => void;
  turn: (text: string) => void;
  requestHint: () => void;
  clearError: () => void;
  reset: () => void;
}

const initialState: NegotiationState = {
  kind: null,
  scenario: null,
  state: null,
  log: [],
  debrief: null,
  busy: false,
  phase: null,
  error: null,
  conn: "online",
  judgeActive: false,
};

export function useNegotiation(lang: Lang): Negotiation {
  const [s, setS] = useState<NegotiationState>(initialState);
  const transportRef = useRef<Transport | null>(null);
  const idRef = useRef(0);
  const langRef = useRef(lang);
  langRef.current = lang;
  const nextId = () => ++idRef.current;

  const teardown = useCallback(() => {
    transportRef.current?.close();
    transportRef.current = null;
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const handle = useCallback((msg: ServerMsg) => {
    setS((prev) => reduce(prev, msg, nextId));
  }, []);

  const ensureTransport = useCallback((): Transport => {
    if (!transportRef.current) {
      transportRef.current = createTransport(
        handle,
        (kind) => setS((p) => ({ ...p, kind })),
        (conn) =>
          setS((p) => ({
            ...p,
            conn,
            // A drop or a lost connection must never leave the typing indicator
            // spinning — clear busy so the reconnect banner owns the messaging.
            busy: conn === "online" ? p.busy : false,
          })),
      );
    }
    return transportRef.current;
  }, [handle]);

  const start = useCallback(
    (scenarioId: string, mode: Mode, situation?: string, reputation?: number) => {
      teardown();
      setS({ ...initialState });
      const t = ensureTransport();
      t.send({ type: "start", scenarioId, lang: langRef.current, mode, situation, reputation });
    },
    [ensureTransport, teardown],
  );

  const turn = useCallback((text: string) => {
    // Trim guards empty/whitespace sends; clampInput is a backstop against an
    // over-long payload even if the composer's own cap were bypassed.
    const trimmed = clampInput(text.trim());
    if (!trimmed) return;
    setS((prev) => {
      if (prev.busy || !prev.state || prev.state.status !== "active") return prev;
      const entry: ChatEntry = { id: nextId(), kind: "me", text: trimmed };
      transportRef.current?.send({ type: "turn", text: trimmed });
      return { ...prev, busy: true, phase: null, log: [...prev.log, entry] };
    });
  }, []);

  const requestHint = useCallback(() => {
    setS((prev) => {
      // One outstanding request at a time: repeated taps must not queue up a
      // column of placeholders (or a column of answers when they all land).
      if (prev.log.some((e) => e.kind === "hint" && e.pending)) return prev;
      transportRef.current?.send({ type: "hint" });
      const entry: ChatEntry = { id: nextId(), kind: "hint", text: "", pending: true };
      return { ...prev, log: [...prev.log, entry] };
    });
  }, []);

  const clearError = useCallback(() => {
    setS((p) => (p.error ? { ...p, error: null } : p));
  }, []);

  const reset = useCallback(() => {
    teardown();
    setS({ ...initialState });
  }, [teardown]);

  return { ...s, start, turn, requestHint, clearError, reset };
}

// Pure reducer over the ServerMsg stream.
function reduce(prev: NegotiationState, msg: ServerMsg, nextId: () => number): NegotiationState {
  switch (msg.type) {
    case "greeting":
      return {
        ...prev,
        scenario: msg.scenario,
        state: msg.state,
        error: null,
        judgeActive: !!msg.judge_active,
        log: [{ id: nextId(), kind: "opp", text: msg.text }],
      };

    case "opponent_delta": {
      const log = [...prev.log];
      const last = log[log.length - 1];
      if (last && last.kind === "opp" && last.streaming) {
        log[log.length - 1] = { ...last, text: last.text + msg.chunk };
      } else {
        log.push({ id: nextId(), kind: "opp", text: msg.chunk, streaming: true });
      }
      return { ...prev, log };
    }

    case "opponent": {
      const log = [...prev.log];
      // Attach analysis + deltas to the most recent player message.
      for (let i = log.length - 1; i >= 0; i--) {
        const e = log[i];
        if (e.kind === "me" && !e.analysis) {
          log[i] = { ...e, analysis: msg.analysis, deltas: msg.deltas };
          break;
        }
      }
      // Finalize (or add) the opponent bubble with the authoritative text.
      const last = log[log.length - 1];
      if (last && last.kind === "opp" && last.streaming) {
        log[log.length - 1] = { id: last.id, kind: "opp", text: msg.text };
      } else {
        log.push({ id: nextId(), kind: "opp", text: msg.text });
      }
      // The judge's coaching (if any) rides under the exchange. Chat decides
      // whether to show it (exam withholds all live feedback). We also raise a
      // coach entry when the live judge returned recognized-technique labels or a
      // reject flag even without a text nudge — so the "judge-cam" chips can show.
      const techniques = msg.coach_techniques?.length ? msg.coach_techniques : undefined;
      const reject = msg.coach_reject === true ? true : undefined;
      const coachText = msg.coach?.trim() ?? "";
      if (coachText || techniques || reject) {
        log.push({ id: nextId(), kind: "coach", text: coachText, techniques, reject });
      }
      return { ...prev, state: msg.state, busy: false, phase: null, log };
    }

    case "debrief":
      return { ...prev, debrief: msg.debrief, busy: false };

    case "phase":
      return { ...prev, phase: msg.phase };

    case "hint": {
      // Fill the placeholder in place if one is waiting, so the hint appears
      // where the player was already looking rather than below the spinner.
      const i = prev.log.findIndex((e) => e.kind === "hint" && e.pending);
      const filled: ChatEntry = i >= 0
        ? { ...(prev.log[i] as ChatEntry & { kind: "hint" }), text: msg.text, line: msg.line, pending: false }
        : { id: nextId(), kind: "hint", text: msg.text, line: msg.line };
      const log = i >= 0 ? prev.log.map((e, k) => (k === i ? filled : e)) : [...prev.log, filled];
      return { ...prev, log };
    }

    case "error":
      return { ...prev, busy: false, error: msg.message };

    default:
      return prev;
  }
}

```

### `frontend/src/api/transport.ts`

```ts
// transport.ts — the abstraction the UI talks to. Both the real WebSocket client
// (ws.ts) and the local MockServer (mock/mockServer.ts) implement this, so the
// components/hook never care which one is behind them. A REST fallback would be a
// third implementation of the same interface (seam left in ws.ts).
import type { ClientMsg, ServerMsg } from "../types";

export type ServerMsgHandler = (msg: ServerMsg) => void;

export interface Transport {
  /** Push a client message toward the server (or mock). */
  send(msg: ClientMsg): void;
  /** Tear down the connection / cancel pending timers. */
  close(): void;
}

export type TransportKind = "ws" | "mock";

// Live connection health for the real WS transport. The mock is always "online".
// "reconnecting" = a mid-game drop is being retried; "lost" = retries exhausted.
export type ConnStatus = "online" | "reconnecting" | "lost";

```

### `frontend/src/types.ts`

```ts
// types.ts — SHARED CONTRACT mirror of backend/app/protocol.py. Keep in sync.
// Modality-agnostic "turn" protocol over WebSocket (REST fallback mirrors these).

export type Lang = "ru" | "en";
export type Mode = "practice" | "campaign" | "custom" | "exam";
export type Status = "active" | "agreement" | "breakdown";

export interface Tag {
  key: string; // spin | criteria | batna | empathy | tradeoff | threat | ...
  label: string;
}

export interface Flags {
  hostile: boolean;
  threat: boolean;
  question: boolean;
}

export interface Analysis {
  tags: Tag[];
  primary: string;
  arg_quality: number; // 0..100
  spin: string | null; // situation | problem | implication | need-payoff
  flags: Flags;
}

export interface Deltas {
  trust: number;
  tension: number;
  info: number;
  leverage: number;
}

export interface StateView {
  trust: number;
  tension: number;
  info: number;
  leverage: number;
  offer_opp: number;
  offer_player: number | null;
  // The SETTLED price once the deal closes — the meeting point, not whatever the
  // opponent last said. null while the table is open. A closing screen reading
  // offer_opp would print a number the deal was never struck at.
  deal?: number | null;
  interests_found: number;
  interests_total: number;
  // ids of secondary issues the player has traded so far (logrolling "package").
  // Empty/absent for scenarios without tradeable secondary issues. Grows per turn.
  terms_conceded?: string[];
  status: Status;
  turn: number;
  max_turns: number;
}

// A tradeable secondary issue exposed to the client (label only, no numbers).
// Mirrors backend SecondaryIssueView — powers the visible logrolling "package".
export interface SecondaryIssueView {
  id: string;
  label: string;
}

export interface ScenarioView {
  id: string;
  icon: string;
  difficulty: number;
  title: string;
  role: string;
  counterpart_name: string;
  counterpart_persona: string;
  headline_unit: string;
  briefing: string;
  batna: string;
  target: number;
  reservation: number;
  // Tradeable secondary issues for cross-issue value creation (logrolling).
  // Only some scenarios (supplier, salary) have them; others send [].
  secondary_issues?: SecondaryIssueView[];
}

// A move that swung the negotiation, quoted from the player's own words —
// the "replay the tape" teaching moment. Synthesized by the engine, never the UI.
export interface TurningPoint {
  turn: number;
  quote: string; // the player's actual line
  what: string; // what happened as a result (the meter swing, in prose)
  coach?: string; // optional coach note on the move
}

export interface Debrief {
  overall: number;
  grade: string; // A|B|C|D|F
  economic: number;
  relationship: number;
  technique: number;
  deal_text: string;
  status: Status;
  interests_found: number;
  interests_total: number;
  // Every hidden interest with whether the player drew it out. Deterministic —
  // present offline too, unlike the ai_* fields below.
  interests?: { text: string; found: boolean }[];
  spin_stages: number;
  objective_criteria: number;
  empathy: number;
  threats: number;
  tradeoffs: number;
  avg_arg: number;
  tips: string[];
  // The AI mentor's closing word: it NARRATES the scorecard above, it never
  // changes it. Present only when a live AI backend answered — every debrief
  // must read complete with all three absent.
  ai_verdict?: string;
  ai_strength?: string;
  ai_growth?: string;
  // The 1-2 moves that swung the negotiation most (backend may omit; older
  // debriefs / non-engine paths render nothing when absent).
  turning_points?: TurningPoint[];
}

// "А что если…" — the deterministic what-if replay. Because the engine is a pure
// function of (scenario, ordered moves), one pivotal turn can be re-run with a
// BETTER line to show exactly how the future would diverge. Mirrors the backend's
// POST /api/whatif contract (main.py). Fully reproducible; no LLM involved.
export interface WhatIfRequest {
  scenarioId: string;
  lang: Lang;
  moves: string[]; // the player's own lines, in order
  turnIndex: number; // 0-based index into `moves` — the pivotal turn
  altText: string; // the stronger line to replay instead
}

// One replayed branch: the move's classification, meter swing, resulting state,
// and the opponent's line. `original` re-runs the real move; `alternative` the
// suggested better one. Engine-owned — the UI only renders.
export interface WhatIfBranch {
  text: string;
  analysis: Analysis;
  deltas: Deltas;
  state: StateView;
  opponent_line: string;
}

export interface WhatIfResponse {
  turnIndex: number;
  original: WhatIfBranch;
  alternative: WhatIfBranch;
}

export interface CampaignStageView {
  scenario_id: string;
  act: string;
  intro: string;
  title: string;
  icon: string;
  difficulty: number;
}

export interface CampaignView {
  id: string;
  icon: string;
  title: string;
  tagline: string;
  stages: CampaignStageView[];
}

// client -> server
export type ClientMsg =
  // scenarioId is "" for mode "custom"; situation carries the user's free-text;
  // reputation (-100..100) carries a campaign result into the next stage's trust
  | { type: "start"; scenarioId: string; lang: Lang; mode: Mode; situation?: string; reputation?: number }
  | { type: "turn"; text: string }
  | { type: "hint" };

// server -> client
export type ServerMsg =
  // judge_active: whether the semantic judge (option C) is live this session, so
  // the UI can honestly surface the "graded by meaning" differentiator. Absent /
  // false = the deterministic keyword path (offline, mock) — nothing to claim.
  | { type: "greeting"; sessionId: string; scenario: ScenarioView; state: StateView; text: string; judge_active?: boolean }
  | { type: "opponent_delta"; chunk: string }
  // coach: optional per-turn coaching from the semantic judge (hidden in exam mode).
  // coach_techniques / coach_reject: present ONLY when the LIVE semantic judge ran
  // this turn (never offline/mock — honestly ABSENT there, not [] / false):
  //   coach_techniques — already-localized labels of the techniques the judge
  //     RECOGNIZED in the player's line (drives the lit "judge-cam" chips).
  //   coach_reject — true when the judge flagged the line as low-meaning
  //     buzzword-spam / parroting (drives the struck-through "pattern, not meaning" chip).
  | { type: "opponent"; text: string; analysis: Analysis; deltas: Deltas; state: StateView; coach?: string; coach_techniques?: string[]; coach_reject?: boolean }
  | { type: "debrief"; debrief: Debrief }
  // hint.text is the coaching direction; hint.line is a ready-to-send worked
  // example the player can drop into the composer. The line is present only
  // when a live AI coach produced one — the deterministic hint has none.
  // Which part of the turn the server is on. Presentational only — a turn must
  // render correctly if this never arrives (offline/mock, or judge disabled).
  | { type: "phase"; phase: "judging" | "replying" }
  | { type: "hint"; text: string; line?: string }
  | { type: "error"; message: string };

```

