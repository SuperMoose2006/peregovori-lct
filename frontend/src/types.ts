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
  interests_found: number;
  interests_total: number;
  status: Status;
  turn: number;
  max_turns: number;
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
  spin_stages: number;
  objective_criteria: number;
  empathy: number;
  threats: number;
  tradeoffs: number;
  avg_arg: number;
  tips: string[];
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
  | { type: "greeting"; sessionId: string; scenario: ScenarioView; state: StateView; text: string }
  | { type: "opponent_delta"; chunk: string }
  // coach: optional per-turn coaching from the semantic judge (hidden in exam mode)
  | { type: "opponent"; text: string; analysis: Analysis; deltas: Deltas; state: StateView; coach?: string }
  | { type: "debrief"; debrief: Debrief }
  | { type: "hint"; text: string }
  | { type: "error"; message: string };
