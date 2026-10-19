// useNegotiation.ts — the single hook the UI uses to run a negotiation.
// Wraps the transport (WS or Mock), reduces the ServerMsg stream into React
// state (scenario, live meters, chat log, debrief), and exposes clean actions.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Analysis, Deltas, Lang, Mode, ScenarioContext, ScenarioView, ServerMsg, StateView } from "../types";
import type { ConnStatus, Transport, TransportKind } from "./transport";
import { createTransport } from "./ws";
import { clampInput } from "../lib/net";
import { normalizeDifficulty } from "../lib/difficulty";

export type ChatEntry =
  | { id: number; kind: "opp"; text: string; streaming?: boolean }
  // analysis — теги приёмов; появляются в тот же миг, что и `turn.analysis`
  // (3 мс), и больше не меняются. argSettled — движок досчитал ход и назвал
  // ОКОНЧАТЕЛЬНОЕ качество аргумента; пока его нет, число не рисуется вовсе:
  // черновик из `turn.analysis` ни судейский, ни движковый. judged — считал
  // ли это число семантический судья (иначе словарь движка).
  | { id: number; kind: "me"; text: string; analysis?: Analysis; deltas?: Deltas;
      argSettled?: boolean; judged?: boolean }
  // `pending` marks the placeholder shown the instant the hint button is pressed. With a
  // live AI coach the answer takes seconds, and without a placeholder the
  // press produced no visible change at all.
  | { id: number; kind: "hint"; text: string; line?: string; pending?: boolean }
  // coach: the semantic judge's per-turn nudge, threaded under the exchange.
  // Rendered by Chat (hidden in exam mode) — the hook stays modality/mode-agnostic.
  // techniques / reject ride along ONLY when the live judge scored this turn (the
  // "judge-cam" chips); both absent offline/mock where no live judge ran.
  | { id: number; kind: "coach"; text: string; techniques?: string[]; reject?: boolean }
  // `calm` — граница режимов («созвон начался»), а не тревога: цвет обычного
  // текста, а не цвет обрыва связи.
  | { id: number; kind: "sys"; text: string; calm?: boolean }
  // The "read her face" question, and its resolved state once answered. The
  // engine's reaction IS the answer, so this is real, not a quiz bolted on top.
  | {
      id: number; kind: "probe"; turn: number;
      options: string[]; answer: number;
      picked?: number;              // undefined while the question is open
    };

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
  // Слой, который не поднялся, и почему. Ключ появляется ТОЛЬКО когда слой
  // просили и он не встал: интерфейс обязан либо показать живой слой, либо
  // сказать «недоступно» словами. Третьего — включённого переключателя над
  // мёртвым устройством — в продукте не бывает (CLAUDE.md, принцип 2).
  layerFail: { voice?: string; camera?: string };
  // Live WS health (mock is always "online"). Drives the mid-game reconnect banner.
  conn: ConnStatus;
  // Whether the semantic judge is live for this session (from the greeting). Drives
  // the "graded by meaning" badge — false offline/mock (deterministic keyword path).
  judgeActive: boolean;
  // ---- realtime-слои. Все необязательные: партия обязана рисоваться, даже
  // если ни одного из этих событий не пришло (офлайн, текстовый режим).
  /** Состояние лица оппонента из `avatar.state`. Null — живых событий нет. */
  avatarState: string | null;
  /** Оппонент сейчас звучит. Управляет честным индикатором речи, а не губами. */
  oppSpeaking: boolean;
  /** Звучит ли оппонент в динамиках — независимо от слоя аватара. */
  oppAudio: boolean;
  /** Игрок сейчас говорит (VAD сервера). */
  userSpeaking: boolean;
  /** Расшифровка речи игрока — показывается, пока он не отправил ход. */
  transcript: string | null;
  /** Наблюдения камеры, накопленные ПО ХОДУ партии. НИКОГДА не влияют на
   *  оценку. Живут ровно ради живого чипа за столом («модель видит: …»).
   *
   *  ЛЕНТУ В РАЗБОРЕ СТРОИТ НЕ ЭТОТ СПИСОК. У неё другой источник —
   *  `debrief.observations` с сервера, где у каждого наблюдения есть ход и
   *  время. Причина простая: события идут, только пока держится сокет, и
   *  партия, пережившая обрыв, собрала бы здесь ленту короче настоящей — а
   *  лента, теряющая куски при переподключении, честной не бывает. */
  observations: string[];
  /** «Покерфейс»: сколько раз лицо несло явное выражение. Счётчик сервера —
   *  клиент его только показывает, поэтому второго источника правды нет. */
  tells: number;
  /** Кадров, по которым слой вообще успел высказаться. Без этого «0 срывов»
   *  неотличимо от «слой ни разу не посмотрел» — а это разные новости. */
  tellFrames: number;
  /** Что слой сказал про ПОСЛЕДНИЙ кадр. Нужен живому чипу: счётчик за партию
   *  не отвечает на вопрос «а сейчас-то я держу лицо». */
  tellNow: boolean;
  /** Что умеет эта сессия (из `session.created`). Null до начала партии. */
  capabilities: Record<string, unknown> | null;
  /** Какие устройства браузер ДЕЙСТВИТЕЛЬНО выдал. Ложь при `capabilities.
   *  microphone === true` — разрешение ещё спрашивается, и звонок говорит
   *  «ждём доступ», а не «микрофон включён». */
  devices: import("../realtime/transport").Devices;
  /** Идёт смена режима той же партии (текст ↔ созвон): сокет сменится, ход
   *  останется. Баннер «связь прервалась» здесь был бы неправдой — человек
   *  сам нажал кнопку. Снимается приветствием нового сокета. */
  switching: boolean;
}

export interface Negotiation extends NegotiationState {
  // situation is the free-text brief for mode "custom" (ignored otherwise).
  // reputation (-100..100) carries a campaign result into the next stage's trust.
  start: (scenarioId: string, mode: Mode, situation?: string, reputation?: number,
          layers?: { probe?: boolean; voice?: boolean; camera?: boolean; avatar?: boolean;
                     pokerface?: boolean },
          /** ISO-дата «стола дня» — только когда партия и правда сегодняшняя. */
          daily?: string, context?: ScenarioContext,
          /** Средний акт кампании (средний балл минус 50) — по нему приветствие. */
          reputationAvg?: number | null) => void;
  turn: (text: string) => void;
  requestHint: () => void;
  /** Своя сделка, до первого хода: поправить числа стола (CE-01). */
  adjust: (open: number, target: number, redline: number) => void;
  answerProbe: (id: number, choice: number) => void;
  clearError: () => void;
  reset: () => void;
  /** Уровень микрофона 0..1 для полоски «вас слышно». Ссылка стабильна. */
  getMicLevel: () => number;
  getSpeechLevel: () => number;
  getVideoFrame: () => string | null;
  /** Звук ответа пришёл, а браузер его держит — нужен жест пользователя. */
  getAudioBlocked: () => boolean;
  resumeAudio: () => void;
  setMicMuted: (muted: boolean) => void;
  /** Оборвать реплику оппонента кнопкой. Голосом сервер перебивает сам. */
  interrupt: () => void;
  /** Сменить слои идущей партии — вход в созвон и выход из него. Ложь — смена
   *  сейчас невозможна (ход в полёте, стол закрыт, офлайн-ядро). */
  relayer: (layers: Record<string, boolean>, note?: string) => boolean;
  setCameraOff: (off: boolean) => void;
  stopCapture: () => void;
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
  layerFail: {},
  conn: "online",
  judgeActive: false,
  avatarState: null,
  oppSpeaking: false,
  oppAudio: false,
  userSpeaking: false,
  transcript: null,
  observations: [],
  tells: 0,
  tellFrames: 0,
  tellNow: false,
  capabilities: null,
  devices: { mic: "off", camera: "off" },
  switching: false,
};

/** Куда рисовать картинку с камеры. Сами слои выбираются на экране подготовки
 *  и едут в сообщении `start` — здесь только DOM-узлы, которых у протокола нет.
 *
 *  Именно ref-объекты, а не элементы: на первом рендере узлов ещё нет, а
 *  транспорт создаётся позже. Разыменование отложено до этого момента. */
export interface RealtimeOptions {
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
  canvasRef?: React.MutableRefObject<HTMLCanvasElement | null>;
}

export function useNegotiation(lang: Lang, realtime: RealtimeOptions = {}): Negotiation {
  const [s, publishState] = useState<NegotiationState>(initialState);
  const stateRef = useRef(s);
  // Actions may arrive twice before React renders. Commit once, outside React's
  // replayable updater: transport sends and IDs must not be replayed in StrictMode.
  const setS = useCallback((change: NegotiationState | ((p: NegotiationState) => NegotiationState)) => {
    const next = typeof change === "function" ? change(stateRef.current) : change;
    stateRef.current = next;
    publishState(next);
  }, []);
  const transportEpoch = useRef(0);
  const transportRef = useRef<Transport | null>(null);
  const idRef = useRef(0);
  const langRef = useRef(lang);
  langRef.current = lang;
  // Через ref, а не через зависимость эффекта: смена микрофона не должна
  // пересоздавать транспорт посреди партии.
  const realtimeRef = useRef(realtime);
  realtimeRef.current = realtime;
  const nextId = () => ++idRef.current;

  const teardown = useCallback(() => {
    transportEpoch.current++;
    transportRef.current?.close();
    transportRef.current = null;
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const handle = useCallback((msg: ServerMsg) => {
    setS((prev) => reduce(prev, msg, nextId));
  }, []);

  const ensureTransport = useCallback((): Transport => {
    if (!transportRef.current) {
      const epoch = transportEpoch.current;
      const currentState = (change: (p: NegotiationState) => NegotiationState) => {
        if (epoch === transportEpoch.current) setS(change);
      };
      transportRef.current = createTransport(
        (msg) => { if (epoch === transportEpoch.current) handle(msg); },
        (kind) => currentState((p) => ({ ...p, kind })),
        (conn) =>
          currentState((p) => ({
            ...p,
            conn,
            // A drop or a lost connection must never leave the typing indicator
            // spinning — clear busy so the reconnect banner owns the messaging.
            busy: conn === "online" ? p.busy : false,
            switching: conn === "lost" ? false : p.switching,
          })),
        {
          // Голос и камера сюда не передаются: их выбирают на экране
          // подготовки, и они приезжают в сообщении `start` (см. transport.ts).
          videoEl: realtimeRef.current.videoRef ?? null,
          canvasEl: realtimeRef.current.canvasRef ?? null,
          // «ГОВОРИТ» РЕШАЕТ ПРОИГРЫВАТЕЛЬ, А НЕ СЕРВЕР. Состояние лица приходит
          // с сервера в момент синтеза, а слышно реплику позже — после
          // джиттер-буфера, а в приостановленном браузером звуке не слышно
          // вовсе. Поэтому индикатор, кнопка перебивания и лицо связаны с
          // часами проигрывателя (onOppAudio), а `avatar.state` задаёт только
          // выражение.
          onAvatar: (avatarState) =>
            currentState((p) => ({ ...p, avatarState })),
          onOppAudio: (speaking) =>
            currentState((p) => ({ ...p, oppAudio: speaking, oppSpeaking: speaking })),
          onTell: (expressive, total) =>
            currentState((p) => ({ ...p, tells: total, tellNow: expressive,
                           tellFrames: p.tellFrames + 1 })),
          onObservation: (text) =>
            currentState((p) => ({ ...p, observations: [...p.observations, text] })),
          // ГОЛОС И КЛАВИАТУРА ОБЯЗАНЫ ДАВАТЬ ОДИН И ТОТ ЖЕ ХОД — включая то, что
          // человек видит. Раньше финальная расшифровка просто гасила живой
          // предпросмотр (`transcript: null`), а сам текст выбрасывался: партия
          // голосом шла без единой своей реплики в ленте, и игрок не мог
          // проверить, что именно услышала система. Теперь финал становится
          // обычной репликой «me» — и получает чипы приёмов и дельты от судьи
          // тем же кодом, что и напечатанная (см. attach ниже по файлу).
          onTranscript: (text, final) =>
            currentState((p) => {
              // Стол закрыт — речь не ход (сервер её и не шлёт, но запоздавшее
              // событие не должно ставить пузырь и вечную занятость).
              if (p.debrief || (p.state && p.state.status !== "active")) return { ...p, transcript: null };
              if (!final) return { ...p, transcript: text };
              const said = text.trim();
              if (!said) return { ...p, transcript: null };
              return { ...p, transcript: null, busy: true, phase: null,
                       log: [...p.log, { id: nextId(), kind: "me", text: said }] };
            }),
          onSpeech: (userSpeaking) => currentState((p) => ({ ...p, userSpeaking })),
          onCapabilities: (capabilities) => currentState((p) => ({ ...p, capabilities })),
          onDevices: (devices) => currentState((p) => ({ ...p, devices })),
        },
      );
    }
    return transportRef.current;
  }, [handle]);

  const start = useCallback(
    (scenarioId: string, mode: Mode, situation?: string, reputation?: number,
     layers?: { probe?: boolean; voice?: boolean; camera?: boolean; pokerface?: boolean },
     daily?: string, context?: ScenarioContext, reputationAvg?: number | null) => {
      teardown();
      setS({ ...initialState });
      const t = ensureTransport();
      t.send({ type: "start", scenarioId, lang: langRef.current, mode, situation,
               reputation, reputationAvg, layers, daily, context });
    },
    [ensureTransport, teardown],
  );

  const turn = useCallback((text: string) => {
    // Trim guards empty/whitespace sends; clampInput is a backstop against an
    // over-long payload even if the composer's own cap were bypassed.
    const trimmed = clampInput(text.trim());
    if (!trimmed) return;
    setS((prev) => {
      // Пока сокет меняется (чат ↔ созвон), ход уйти некуда: прежний сокет
      // закрыт, новый ещё не принят — а `busy` повис бы навсегда.
      if (prev.conn !== "online" || prev.switching || prev.busy || !prev.state || prev.state.status !== "active") return prev;
      const entry: ChatEntry = { id: nextId(), kind: "me", text: trimmed };
      transportRef.current?.send({ type: "turn", text: trimmed });
      return { ...prev, busy: true, phase: null, log: [...prev.log, entry] };
    });
  }, []);

  /** Resolve a probe in place. The answer came with the question, so this needs
   *  no round-trip and stays correct offline. */
  const answerProbe = useCallback((id: number, choice: number) => {
    setS((prev) => ({
      ...prev,
      log: prev.log.map((e) =>
        e.kind === "probe" && e.id === id && e.picked === undefined ? { ...e, picked: choice } : e),
    }));
  }, []);

  const adjust = useCallback((open: number, target: number, redline: number) => {
    transportRef.current?.send({ type: "adjust", open, target, redline });
  }, []);

  const requestHint = useCallback(() => {
    setS((prev) => {
      // One outstanding request at a time: repeated taps must not queue up a
      // column of placeholders (or a column of answers when they all land).
      if (prev.conn !== "online" || prev.switching || prev.log.some((e) => e.kind === "hint" && e.pending)) return prev;
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

  // Стабильные ссылки: LiveBar опрашивает уровень по таймеру, и меняющаяся
  // каждый рендер функция пересоздавала бы таймер шестьдесят раз в секунду.
  const getMicLevel = useCallback(() => transportRef.current?.micLevel?.() ?? 0, []);
  const getSpeechLevel = useCallback(() => transportRef.current?.speechLevel?.() ?? 0, []);
  const getVideoFrame = useCallback(() => transportRef.current?.videoFrame?.() ?? null, []);
  const getAudioBlocked = useCallback(() => transportRef.current?.audioBlocked?.() ?? false, []);
  const resumeAudio = useCallback(() => transportRef.current?.resumeAudio?.(), []);
  const setMicMuted = useCallback((muted: boolean) => transportRef.current?.setMicMuted?.(muted), []);
  const interrupt = useCallback(() => transportRef.current?.interrupt?.(), []);
  const setCameraOff = useCallback((off: boolean) => transportRef.current?.setCameraOff?.(off), []);
  const stopCapture = useCallback(() => transportRef.current?.stopCapture?.(), []);
  /** `note` — строка в ленту («созвон начался»): разговор голосом остаётся в
   *  той же ленте, что и напечатанный, и граница режимов в ней видна. */
  const relayer = useCallback((layers: Record<string, boolean>, note?: string) => {
    const t = transportRef.current;
    const p = stateRef.current;
    if (!t?.relayer || p.switching || p.busy || p.conn !== "online") return false;
    if (!p.state || p.state.status !== "active" || p.debrief) return false;
    if (!t.relayer(layers)) return false;
    // Недослушанная фраза прежнего режима ходом уже не станет.
    // Отказ устройства прежнего режима к новому не относится: микрофон,
    // не вставший в созвоне, не повод для строки под полем ввода в чате.
    setS((q) => ({ ...q, switching: true, transcript: null, userSpeaking: false, layerFail: {},
                   log: note ? [...q.log, { id: nextId(), kind: "sys", text: note, calm: true }] : q.log }));
    return true;
  }, []);

  return { ...s, start, turn, requestHint, adjust, answerProbe, clearError, reset, getMicLevel, getSpeechLevel,
           getVideoFrame, getAudioBlocked, resumeAudio, setMicMuted, interrupt, relayer, setCameraOff,
           stopCapture };
}

/** Тот же итог: совпали все числа и буквы, из которых складывается оценка. */
export function sameScorecard(a: import("../types").Debrief, b: import("../types").Debrief): boolean {
  return a.overall === b.overall && a.grade === b.grade && a.status === b.status
    && a.deal_text === b.deal_text && a.economic === b.economic
    && a.relationship === b.relationship && a.technique === b.technique;
}

/** Пузырь оппонента, который ещё печатается в ЭТОМ ходе, — или -1.
 *  Ищется назад до последней реплики игрока, а не только в последней записи:
 *  посреди потока в ленту встаёт уведомление (синтез речи упал — notice c
 *  keepBusy) или заглушка подсказки, и хвост реплики уходил в новый пузырь, а
 *  первый навсегда оставался «печатающимся» с сырым текстом. До реплики
 *  игрока — чтобы не дописать в пузырь прошлого хода. */
function streamingOpp(log: ChatEntry[]): number {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.kind === "opp" && e.streaming) return i;
    if (e.kind === "me") return -1;
  }
  return -1;
}

// Pure reducer over the ServerMsg stream.
//
// Экспортируется ради прибора: `test/analysis-latency.test.ts` прогоняет через
// НЕГО ЖЕ записанный поток событий и смотрит, на каком событии разбор впервые
// становится виден игроку. Мерить это по проводу нельзя — ушедшее событие не
// доказывает нарисованного поля (ровно так прибор задержек врал трижды).
/** Реплика игрока, которой принадлежит ИТОГ хода (балл аргумента, дельты).
 *
 * Разбор (`analysis`) приходит до судьи и ложится под реплику сразу; итог —
 * после судьи. В классическом голосе человек может заговорить, пока идёт
 * судья, и финальная расшифровка кладёт реплику N+1 в ленту РАНЬШЕ итога хода
 * N — поиск «последней реплики без итога» отдавал итог N реплике N+1 (найдено
 * после аудита 17.10). Поэтому сначала — последняя реплика, у которой разбор
 * уже есть, а итога ещё нет; без такой (старый сервер, потерянный `analysis`) —
 * как раньше, последняя без итога. Реплика, которая ходом так и не стала,
 * разбора не получает — и итог не уезжает на неё. */
type MeEntry = Extract<ChatEntry, { kind: "me" }>;
function settlingMove(log: ChatEntry[], open: (e: MeEntry) => boolean): number {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.kind === "me" && e.analysis && open(e)) return i;
  }
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.kind === "me" && open(e)) return i;
  }
  return -1;
}

export function reduce(prev: NegotiationState, msg: ServerMsg, nextId: () => number): NegotiationState {
  switch (msg.type) {
    case "greeting":
      return {
        ...prev,
        scenario: { ...msg.scenario, difficulty: normalizeDifficulty(msg.scenario.difficulty) },
        state: msg.state,
        busy: false,
        phase: null,
        error: null,
        judgeActive: !!msg.judge_active,
        switching: false,
        log: msg.resumed
          ? prev.log.filter(e => !(e.kind === "hint" && e.pending))
              .map(e => e.kind === "opp" && e.streaming ? { ...e, streaming: false } : e)
          : [{ id: nextId(), kind: "opp", text: msg.text }],
      };

    case "opponent_delta": {
      const log = [...prev.log];
      const at = streamingOpp(log);
      const open = at >= 0 ? log[at] : null;
      if (open && open.kind === "opp") {
        log[at] = { ...open, text: open.text + msg.chunk };
      } else {
        log.push({ id: nextId(), kind: "opp", text: msg.chunk, streaming: true });
      }
      return { ...prev, log };
    }

    // Теги приёмов под репликой игрока — как только их посчитал классификатор.
    // Голос и клавиатура здесь неразличимы (инвариант 7): реплика «me» уже
    // лежит в ленте к этому моменту в обоих случаях — напечатанную кладёт
    // `turn()`, распознанную — финальная расшифровка, которую сервер шлёт ДО
    // хода (`user.transcript {final}` → `on_player_turn`).
    case "analysis": {
      const log = [...prev.log];
      for (let i = log.length - 1; i >= 0; i--) {
        const e = log[i];
        if (e.kind === "me" && !e.analysis) {
          log[i] = { ...e, analysis: msg.analysis };
          return { ...prev, log };
        }
      }
      return prev;
    }

    // Окончательное качество аргумента. Отдельным сообщением, потому что до
    // судьи и до `apply_move` этого числа не существует: показать раньше —
    // значит либо соврать, либо переписать уже показанное на глазах.
    case "arg_quality": {
      const log = [...prev.log];
      const i = settlingMove(log, (e) => !e.argSettled);
      if (i < 0) return prev;
      const e = log[i] as MeEntry;
      const analysis = e.analysis ? { ...e.analysis, arg_quality: msg.value } : undefined;
      log[i] = { ...e, analysis, argSettled: true, judged: msg.judged };
      return { ...prev, log };
    }

    case "opponent": {
      const log = [...prev.log];
      // Запасной путь: теги обычно уже привязаны сообщением `analysis` выше, и
      // тогда эта ветка ничего не делает. Она держит ход, до которого
      // `turn.analysis` не доехал (старый сервер, потерянное событие) — но
      // ЧИСЛО отсюда не берётся: `argSettled` ставит только `arg_quality`.
      const mine = settlingMove(log, (e) => !e.deltas);
      if (mine >= 0) {
        const e = log[mine] as MeEntry;
        log[mine] = { ...e, analysis: e.analysis ?? msg.analysis, deltas: msg.deltas };
      }
      // Finalize (or add) the opponent bubble with the authoritative text.
      const at = streamingOpp(log);
      if (!msg.text.trim()) {
        // Реплику погасили до первого слова: ход закрыт, а пустого пузыря
        // нет — показывать нечего.
        if (at >= 0) log.splice(at, 1);
      } else if (at >= 0) {
        log[at] = { id: log[at].id, kind: "opp", text: msg.text };
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
      // ПЕРЕОТПРАВЛЕННЫЙ ИТОГ — НЕ НОВАЯ ПАРТИЯ. После восстановления сессии
      // сервер присылает тот же разбор ещё раз, а App записывает партию в
      // профиль, историю, кампанию и капстоун по ССЫЛКЕ на объект итога.
      // Новый объект с тем же счётом начислял всё второй раз (замер e2e:
      // XP 104 → 208, попыток 1 → 2, цель дня 1 → 2). Тот же счёт той же
      // партии — прежний объект; новая партия начинается с `debrief: null`.
      if (prev.debrief && sameScorecard(prev.debrief, msg.debrief)) {
        return prev.busy ? { ...prev, busy: false } : prev;
      }
      // Разбор кладётся ЦЕЛИКОМ, включая ленту наблюдений камеры
      // (`observations` с ходами и временем): она посчитана там же, где шла
      // партия, и переживает обрыв связи, в отличие от накопленной здесь.
      return { ...prev, debrief: msg.debrief, busy: false };

    case "phase":
      return { ...prev, phase: msg.phase };

    case "probe":
      return { ...prev, log: [...prev.log, {
        id: nextId(), kind: "probe", turn: msg.turn, options: msg.options, answer: msg.answer,
      }] };

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

    case "layer_failed":
      // Партия НЕ прерывается: `busy` не трогаем, ход играется текстом.
      return { ...prev, layerFail: { ...prev.layerFail, [msg.layer]: msg.reason } };

    case "notice":
      // Строкой в ленте, а не баннером: человек смотрит в стол, и объяснение
      // должно лежать там, где он читает. `busy` снимаем — партия остановлена,
      // и крутящийся индикатор «оппонент печатает» был бы обещанием ответа,
      // которого не будет.
      // TTS may fail while the text reply is still streaming. Only completion
      // of that reply may release the next turn in this case.
      return { ...prev, busy: msg.keepBusy ? prev.busy : false, phase: msg.keepBusy ? prev.phase : null,
               log: [...prev.log, { id: nextId(), kind: "sys", text: msg.text }] };

    case "error":
      return { ...prev, busy: false, error: msg.message };

    default:
      return prev;
  }
}
