// types.ts — внутренний словарь между экранами и транспортом.
//
// ЧТО ЭТО ТЕПЕРЬ. `ClientMsg`/`ServerMsg` больше НЕ провод: по проводу ходит
// realtime-протокол (`services/gateway/app/realtime/events.py`). Это словарь
// уровнем выше, и у него две реализации:
//
//   RealtimeTransport — переводит его в realtime-события и обратно;
//   MockServer        — исполняет его целиком в браузере (офлайн-ядро).
//
// Такое разделение оставлено сознательно: кампания, экзамен, разбор и
// «что-если» написаны против этого словаря и работают. Менять их одновременно с
// транспортом значило бы отлаживать две новые вещи сразу, не имея ни одной
// опорной.
//
// Value objects ниже (Analysis, Deltas, StateView, ScenarioView, Debrief) —
// настоящее зеркало `services/gateway/app/protocol.py`. Менять синхронно.

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
  /** Послесловие по полосам репутации: ключ → текст на языке сессии. Едет
   *  целиком, потому что полосу считает клиент по СВОЕЙ накопленной
   *  репутации — сервер её между актами не хранит. Оценку не трогает. */
  epilogue?: Record<string, string>;
}

// client -> server
export type ClientMsg =
  // scenarioId is "" for mode "custom"; situation carries the user's free-text;
  // reputation (-100..100) carries a campaign result into the next stage's trust
  // `layers` доезжает и до сервера (`session.init.layers`), и до офлайн-ядра.
  // Слои включают КАНАЛЫ и никогда не входят в оценку — сервер отвечает на них
  // честным `capabilities`, где выключено то, чего окружение не может дать.
  | { type: "start"; scenarioId: string; lang: Lang; mode: Mode; situation?: string;
      reputation?: number;
      layers?: { probe?: boolean; voice?: boolean; camera?: boolean; avatar?: boolean } }
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
  // The "read her face" question. Mock-only for now — see CONTRACT(probe).
  | { type: "probe"; turn: number; options: string[]; answer: number }
  | { type: "phase"; phase: "judging" | "replying" }
  | { type: "hint"; text: string; line?: string }
  // Устройство слоя не поднялось. Отдельно от `error`, потому что это НЕ сбой
  // партии: игра продолжается текстом, а честно назвать нужно ровно тот слой,
  // который отвалился, и ровно ту причину. Общая ошибка на весь сеанс здесь
  // соврала бы дважды: обвинила бы не то устройство и сделала бы вид, что
  // сломалось всё.
  | { type: "layer_failed"; layer: "voice" | "camera"; reason: string }
  | { type: "error"; message: string };
