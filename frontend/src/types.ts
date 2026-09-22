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
/** Режим ЭКРАНА: что показывает оболочка и как выглядит разбор. Ровно четыре
 *  раздела навигатора, и только они. */
export type ScreenMode = "practice" | "campaign" | "custom" | "exam";
/**
 * Режим НА ПРОВОДЕ — шире экранного ровно на один: `drill`, капстоун курса.
 *
 * Развязка нужна потому, что капстоун — экзамен по СУТИ и обычная партия по
 * ВИДУ: его итог сверяют с эталонным прогоном движка, поэтому судьи там быть не
 * должно, а разбор при этом остаётся разбором, а не сертификатом. Пока значение
 * было одно на оба смысла, капстоун уходил в партию как `practice` — с живым
 * судьёй, двигающим ровно те поля, по которым `checkDrill` выносит вердикт.
 *
 * Зеркало — `services/gateway/app/protocol.py::Mode`, менять синхронно.
 */
export type Mode = ScreenMode | "drill";
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

// Один скрытый интерес глазами игрока: ТЕМА видна всегда, ТЕКСТ — только после
// вскрытия. Зеркало backend protocol.py::InterestSlot.
export interface InterestSlot {
  topic: string;
  text: string | null;
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
  // Темы стола + тексты уже вскрытых интересов, по слоту на интерес (зеркало
  // backend InterestSlot). Тема видна всегда — она называет ОБЛАСТЬ, а не
  // секрет; `text: null` значит «ещё не вскрыт», и рисовать вместо него нечего.
  interests?: InterestSlot[];
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
  // Зеркальный стол: id того стола, за который эта запись сажает игрока с ДРУГОЙ
  // стороны. Пусто у всех девяти столов библиотеки.
  mirror_of?: string;
  // Что игрок ЗАЩИЩАЕТ, сидя здесь. Приезжает ДО первого хода: это не секрет
  // оппонента, а собственная карта игрока — он и есть та сторона.
  defending?: DefendedInterest[];
}

// Одна из трёх причин, по которым игрок за ЗЕРКАЛЬНЫМ столом упирается.
// Зеркало backend protocol.py::DefendedInterest.
export interface DefendedInterest {
  topic: string;
  text: string;
}

// A move that swung the negotiation, quoted from the player's own words —
// the "replay the tape" teaching moment. Synthesized by the engine, never the UI.
export interface TurningPoint {
  turn: number;
  quote: string; // the player's actual line
  what: string; // what happened as a result (the meter swing, in prose)
  coach?: string; // optional coach note on the move
}

// Одно наблюдение слоя камеры, привязанное к ходу. Приезжает В РАЗБОРЕ, с
// сервера (`endpoint.py::_attach_vision_tape`), а не собирается на клиенте из
// живых событий: события идут только пока держится сокет, и после
// переподключения посреди партии клиентская лента была бы короче настоящей.
// На оценку ничто отсюда не влияет — лента живёт вне `score_session`.
export interface VisionNote {
  /** Сколько ходов было СДЕЛАНО к моменту кадра. 0 — до первого хода. */
  turn: number;
  /** Миллисекунд от начала партии. */
  at_ms: number;
  /** Что увидела модель. Пусто — кадр не сказал ничего про обстановку, и
   *  строка существует только ради выражения на лице. */
  text: string;
  /** Несло ли лицо явное выражение. `null` — модель об этом не сказала, и это
   *  НЕ «нет»: молчание модели и спокойное лицо разные вещи. */
  expressive: boolean | null;
}

// «С той стороны стола»: один ход партии, рассказанный ОТ ЛИЦА ОППОНЕНТА.
// Зеркало backend protocol.py::HerSideTurn. Строится детерминированно из хроники
// движка — и на сервере, и в офлайн-ядре; ИИ здесь не участвует нигде.
export interface HerSideTurn {
  turn: number;
  quote: string;    // реплика игрока, как он её написал (обрезана)
  said: string;     // что происходило у НЕЁ — от первого лица, её словами
  meters: string[]; // «Доверие +8», «Цена 100 → 98»
  tone: string;     // good | bad | flat — только для оформления
}

// Колонка целиком. `missed` НЕ дублирует занавес разбора (там список интересов),
// а связывает его с ходами: объясняет, почему невскрытые остались закрытыми.
export interface HerSide {
  name: string;         // имя персоны ЭТОГО стола
  turns: HerSideTurn[];
  missed: string;
  ask: string;          // реплика, которая открыла бы закрытое («» — открывать нечего)
}

// Итог режима «Обратная сторона стола» — то, ради чего в него садятся.
// Зеркало backend protocol.py::OtherSide. Собирается ДЕТЕРМИНИРОВАННО из
// сценария и хроники движка (и на сервере, и офлайн); в оценку отсюда не
// заходит ничего (инвариант 6).
export interface OtherSide {
  seat: string;        // кем игрок был за этим столом — персона оригинала
  origin_id: string;
  origin_title: string;
  defended: DefendedInterest[];
  blind: string;       // почему этих причин никто напротив не увидел
  asked: number;
  total: number;
  windows: string[];   // ходы, на которых вопрос по закрытой теме сработал бы
}

export interface Debrief {
  attestation?: import("./components/ServerCertificate").Attestation | null;
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
  // Лента слоя камеры: что было видно и на каком ходу. Ключа НЕТ вовсе, если
  // слой не высказался ни разу, — карточки тогда не должно быть, а не пустой
  // (принцип 2: слоя нет — так и сказано). Офлайн и без ключа камера не
  // работает вовсе, и поле не приходит никогда.
  observations?: VisionNote[];
  // Сколько кадров модель зрения ДОСМОТРЕЛА до ответа — включая ответы «ничего
  // примечательного», которые записью в ленту не становятся. Без этого числа
  // пустая лента отвечает сразу на два разных вопроса одинаково: «слой смотрел
  // и молчал» и «слой не поднялся». Первое — штатная работа, второе — четвёртое
  // состояние наоборот: работающий слой, показанный как отсутствующий.
  observation_looks?: number;
  // Ход за ходом глазами оппонента. Отсутствует у партии без единого хода и у
  // разборов, пришедших не от движка, — карточка тогда не рисуется вовсе.
  her_side?: HerSide | null;
  // Карточка зеркального стола. Ключа НЕТ на обычном столе — режима, которого
  // не было, на экране не бывает (принцип 2).
  other_side?: OtherSide | null;
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
export interface ScenarioContext {
  sector: string;
  topic: string;
  opponent_role: string;
  opponent_goal: string;
  difficulty: number;
  style: "relationship" | "tough" | "analytical";
}

export type ClientMsg =
  // scenarioId is "" for mode "custom"; situation carries the user's free-text;
  // reputation (-100..100) carries a campaign result into the next stage's trust
  // `layers` доезжает и до сервера (`session.init.layers`), и до офлайн-ядра.
  // Слои включают КАНАЛЫ и никогда не входят в оценку — сервер отвечает на них
  // честным `capabilities`, где выключено то, чего окружение не может дать.
  | { type: "start"; scenarioId: string; lang: Lang; mode: Mode; situation?: string;
      context?: ScenarioContext;
      reputation?: number;
      /** ISO-дата «стола дня». Условие дня ляжет, только если стол ТОГО дня и
       *  правда этот — иначе «короткий стол» выпрашивался бы на любом. */
      daily?: string;
      layers?: { probe?: boolean; voice?: boolean; camera?: boolean; avatar?: boolean;
                 pokerface?: boolean } }
  | { type: "turn"; text: string }
  | { type: "hint" };

// server -> client
export type ServerMsg =
  // judge_active: whether the semantic judge (option C) is live this session, so
  // the UI can honestly surface the "graded by meaning" differentiator. Absent /
  // false = the deterministic keyword path (offline, mock) — nothing to claim.
  | { type: "greeting"; sessionId: string; scenario: ScenarioView; state: StateView; text: string; judge_active?: boolean; resumed?: boolean }
  | { type: "opponent_delta"; chunk: string }
  // coach: optional per-turn coaching from the semantic judge (hidden in exam mode).
  // coach_techniques / coach_reject: present ONLY when the LIVE semantic judge ran
  // this turn (never offline/mock — honestly ABSENT there, not [] / false):
  //   coach_techniques — already-localized labels of the techniques the judge
  //     RECOGNIZED in the player's line (drives the lit "judge-cam" chips).
  //   coach_reject — true when the judge flagged the line as low-meaning
  //     buzzword-spam / parroting (drives the struck-through "pattern, not meaning" chip).
  | { type: "opponent"; text: string; analysis: Analysis; deltas: Deltas; state: StateView; coach?: string; coach_techniques?: string[]; coach_reject?: boolean }
  // РАЗБОР ПРИХОДИТ ДВУМЯ КУСКАМИ, ПОТОМУ ЧТО ГОТОВ В ДВА РАЗНЫХ МОМЕНТА.
  //
  // `analysis` — детерминированный классификатор: теги приёмов, SPIN, флаги.
  // Он готов через 3 мс и после этого не меняется ни от судьи, ни от движка
  // (доказано прогоном эталонных партий — tests/test_analysis_split.py). Едет
  // сразу, чтобы под репликой игрока сразу же что-то загорелось.
  //
  // `arg_quality` — число, которого в те 3 мс ЕЩЁ НЕТ: судья его перепишет,
  // штраф за повтор обрежет. Едет отдельно, когда движок досчитал ход.
  // `judged` называет источник: true — оценил семантический судья, false —
  // словарь движка. Показывать второе под видом первого нельзя (принцип 2).
  //
  // `analysis.arg_quality` внутри первого сообщения — черновик; рисовать его
  // не имеет права никто.
  | { type: "analysis"; analysis: Analysis }
  | { type: "arg_quality"; value: number; judged: boolean }
  | { type: "debrief"; debrief: Debrief }
  // hint.text is the coaching direction; hint.line is a ready-to-send worked
  // example the player can drop into the composer. The line is present only
  // when a live AI coach produced one — the deterministic hint has none.
  // Which part of the turn the server is on. Presentational only — a turn must
  // render correctly if this never arrives (offline/mock, or judge disabled).
  // Вопрос слоя «Читай лицо».
  //
  // Сервер строит вопрос по окончательной реакции и присылает после ответа.
  // Офлайн-ядро использует побитово проверенное зеркало lib/probe.ts.
  | { type: "probe"; turn: number; options: string[]; answer: number }
  | { type: "phase"; phase: "judging" | "replying" }
  | { type: "hint"; text: string; line?: string }
  // Устройство слоя не поднялось. Отдельно от `error`, потому что это НЕ сбой
  // партии: игра продолжается текстом, а честно назвать нужно ровно тот слой,
  // который отвалился, и ровно ту причину. Общая ошибка на весь сеанс здесь
  // соврала бы дважды: обвинила бы не то устройство и сделала бы вид, что
  // сломалось всё.
  | { type: "layer_failed"; layer: "voice" | "camera"; reason: string }
  // Сообщение ПРОДУКТА за столом, а не реплика оппонента и не сбой хода.
  // Заведено ради `session.closed {reason}`: партию можно забрать в другое окно,
  // и сокет здесь закрывается по существу, а не рвётся. Через `error` это
  // сказать нельзя — `error` за столом никем не рисуется, и человек остался бы
  // перед замершим экраном без единого слова.
  | { type: "notice"; text: string }
  | { type: "error"; message: string };
