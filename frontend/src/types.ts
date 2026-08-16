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
}

// client -> server
export type ClientMsg =
  // scenarioId is "" for mode "custom"; situation carries the user's free-text
  | { type: "start"; scenarioId: string; lang: Lang; mode: Mode; situation?: string }
  | { type: "turn"; text: string }
  | { type: "hint" };

// server -> client
export type ServerMsg =
  | { type: "greeting"; sessionId: string; scenario: ScenarioView; state: StateView; text: string }
  | { type: "opponent_delta"; chunk: string }
  | { type: "opponent"; text: string; analysis: Analysis; deltas: Deltas; state: StateView }
  | { type: "debrief"; debrief: Debrief }
  | { type: "hint"; text: string }
  | { type: "error"; message: string };
