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
  // analysis — теги приёмов; появляются в тот же миг, что и `turn.analysis`
  // (3 мс), и больше не меняются. argSettled — движок досчитал ход и назвал
  // ОКОНЧАТЕЛЬНОЕ качество аргумента; пока его нет, число не рисуется вовсе:
  // черновик из `turn.analysis` ни судейский, ни движковый. judged — считал
  // ли это число семантический судья (иначе словарь движка).
  | { id: number; kind: "me"; text: string; analysis?: Analysis; deltas?: Deltas;
      argSettled?: boolean; judged?: boolean }
  // `pending` marks the placeholder shown the instant 💡 is pressed. With a
  // live AI coach the answer takes seconds, and without a placeholder the
  // press produced no visible change at all.
  | { id: number; kind: "hint"; text: string; line?: string; pending?: boolean }
  // coach: the semantic judge's per-turn nudge, threaded under the exchange.
  // Rendered by Chat (hidden in exam mode) — the hook stays modality/mode-agnostic.
  // techniques / reject ride along ONLY when the live judge scored this turn (the
  // "judge-cam" chips); both absent offline/mock where no live judge ran.
  | { id: number; kind: "coach"; text: string; techniques?: string[]; reject?: boolean }
  | { id: number; kind: "sys"; text: string }
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
  /** Сколько кадров камеры ушло на сервер. Ноль при поднятой камере значит,
   *  что поток открыт, а картинка никуда не едет — и чип обязан это сказать. */
  framesSent: number;
  /** Что умеет эта сессия (из `session.created`). Null до начала партии. */
  capabilities: Record<string, unknown> | null;
}

export interface Negotiation extends NegotiationState {
  // situation is the free-text brief for mode "custom" (ignored otherwise).
  // reputation (-100..100) carries a campaign result into the next stage's trust.
  start: (scenarioId: string, mode: Mode, situation?: string, reputation?: number,
          layers?: { probe?: boolean; voice?: boolean; camera?: boolean; avatar?: boolean;
                     pokerface?: boolean },
          /** ISO-дата «стола дня» — только когда партия и правда сегодняшняя. */
          daily?: string) => void;
  turn: (text: string) => void;
  requestHint: () => void;
  answerProbe: (id: number, choice: number) => void;
  clearError: () => void;
  reset: () => void;
  /** Уровень микрофона 0..1 для полоски «вас слышно». Ссылка стабильна. */
  getMicLevel: () => number;
  /** Оборвать реплику оппонента кнопкой. Голосом сервер перебивает сам. */
  interrupt: () => void;
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
  framesSent: 0,
  capabilities: null,
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
  const [s, setS] = useState<NegotiationState>(initialState);
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
        {
          // Голос и камера сюда не передаются: их выбирают на экране
          // подготовки, и они приезжают в сообщении `start` (см. transport.ts).
          videoEl: realtimeRef.current.videoRef ?? null,
          canvasEl: realtimeRef.current.canvasRef ?? null,
          // Лицо и звук — два независимых признака речи. Аватар может быть
          // выключен, а оппонент всё равно звучит: тогда «говорит» приходит из
          // собственного проигрывателя (onOppAudio). Складываем оба, иначе в
          // режиме «только голос» перебить оппонента нечем.
          onAvatar: (avatarState) =>
            setS((p) => ({ ...p, avatarState,
                           oppSpeaking: avatarState === "speaking" || p.oppAudio })),
          onOppAudio: (speaking) =>
            setS((p) => ({ ...p, oppAudio: speaking,
                           oppSpeaking: speaking || p.avatarState === "speaking" })),
          onTell: (expressive, total) =>
            setS((p) => ({ ...p, tells: total, tellNow: expressive,
                           tellFrames: p.tellFrames + 1 })),
          onObservation: (text) =>
            setS((p) => ({ ...p, observations: [...p.observations, text] })),
          onCameraFrame: () => setS((p) => ({ ...p, framesSent: p.framesSent + 1 })),
          // ГОЛОС И КЛАВИАТУРА ОБЯЗАНЫ ДАВАТЬ ОДИН И ТОТ ЖЕ ХОД — включая то, что
          // человек видит. Раньше финальная расшифровка просто гасила живой
          // предпросмотр (`transcript: null`), а сам текст выбрасывался: партия
          // голосом шла без единой своей реплики в ленте, и игрок не мог
          // проверить, что именно услышала система. Теперь финал становится
          // обычной репликой «me» — и получает чипы приёмов и дельты от судьи
          // тем же кодом, что и напечатанная (см. attach ниже по файлу).
          onTranscript: (text, final) =>
            setS((p) => {
              if (!final) return { ...p, transcript: text };
              const said = text.trim();
              if (!said) return { ...p, transcript: null };
              return { ...p, transcript: null,
                       log: [...p.log, { id: nextId(), kind: "me", text: said }] };
            }),
          onSpeech: (userSpeaking) => setS((p) => ({ ...p, userSpeaking })),
          onCapabilities: (capabilities) => setS((p) => ({ ...p, capabilities })),
        },
      );
    }
    return transportRef.current;
  }, [handle]);

  const start = useCallback(
    (scenarioId: string, mode: Mode, situation?: string, reputation?: number,
     layers?: { probe?: boolean; voice?: boolean; camera?: boolean; pokerface?: boolean },
     daily?: string) => {
      teardown();
      setS({ ...initialState });
      const t = ensureTransport();
      t.send({ type: "start", scenarioId, lang: langRef.current, mode, situation,
               reputation, layers, daily });
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

  /** Resolve a probe in place. The answer came with the question, so this needs
   *  no round-trip and stays correct offline. */
  const answerProbe = useCallback((id: number, choice: number) => {
    setS((prev) => ({
      ...prev,
      log: prev.log.map((e) =>
        e.kind === "probe" && e.id === id && e.picked === undefined ? { ...e, picked: choice } : e),
    }));
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

  // Стабильные ссылки: LiveBar опрашивает уровень по таймеру, и меняющаяся
  // каждый рендер функция пересоздавала бы таймер шестьдесят раз в секунду.
  const getMicLevel = useCallback(() => transportRef.current?.micLevel?.() ?? 0, []);
  const interrupt = useCallback(() => transportRef.current?.interrupt?.(), []);

  return { ...s, start, turn, requestHint, answerProbe, clearError, reset, getMicLevel, interrupt };
}

// Pure reducer over the ServerMsg stream.
//
// Экспортируется ради прибора: `test/analysis-latency.test.ts` прогоняет через
// НЕГО ЖЕ записанный поток событий и смотрит, на каком событии разбор впервые
// становится виден игроку. Мерить это по проводу нельзя — ушедшее событие не
// доказывает нарисованного поля (ровно так прибор задержек врал трижды).
export function reduce(prev: NegotiationState, msg: ServerMsg, nextId: () => number): NegotiationState {
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
      for (let i = log.length - 1; i >= 0; i--) {
        const e = log[i];
        if (e.kind === "me" && !e.argSettled) {
          const analysis = e.analysis ? { ...e.analysis, arg_quality: msg.value } : undefined;
          log[i] = { ...e, analysis, argSettled: true, judged: msg.judged };
          return { ...prev, log };
        }
      }
      return prev;
    }

    case "opponent": {
      const log = [...prev.log];
      // Запасной путь: теги обычно уже привязаны сообщением `analysis` выше, и
      // тогда эта ветка ничего не делает. Она держит ход, до которого
      // `turn.analysis` не доехал (старый сервер, потерянное событие) — но
      // ЧИСЛО отсюда не берётся: `argSettled` ставит только `arg_quality`.
      for (let i = log.length - 1; i >= 0; i--) {
        const e = log[i];
        if (e.kind !== "me" || e.deltas) continue;
        log[i] = { ...e, analysis: e.analysis ?? msg.analysis, deltas: msg.deltas };
        break;
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
      return { ...prev, busy: false, phase: null,
               log: [...prev.log, { id: nextId(), kind: "sys", text: msg.text }] };

    case "error":
      return { ...prev, busy: false, error: msg.message };

    default:
      return prev;
  }
}
