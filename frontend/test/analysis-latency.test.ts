// analysis-latency.test.ts — КОГДА разбор хода становится виден игроку.
//
// ЧТО ЭТО ЗА ПРИБОР И ЧЕГО ОН НЕ ДЕЛАЕТ. Сервер шлёт `turn.analysis` первым, и
// уходит оно за 3 мс. Само по себе это не доказывает НИЧЕГО про экран: событие
// можно отправить и положить в буфер до конца хода — ровно так и было. Поэтому
// здесь меряется не провод, а поведение отгруженного кода: записанный поток
// событий прогоняется через настоящий `RealtimeTransport` и настоящий `reduce`,
// и фиксируется, на каком событии в ленте впервые появляются теги приёмов и
// впервые — число.
//
// Времена вех (`WIRE`) — ВХОД, а не результат: они взяты из живого замера
// `services/gateway/tools/bench_latency.py`. Прибор отвечает на вопрос «на
// каком событии», живой замер — «когда это событие приходит». Смешивать их
// нельзя: тест, сам себе назначивший часы, уже трижды льстил в этом продукте.
import test from "node:test";
import assert from "node:assert/strict";

import { reduce, type ChatEntry, type NegotiationState } from "../src/api/useNegotiation";
import { MockServer } from "../src/mock/mockServer";
import type { ServerMsg } from "../src/types";

// --- минимальный браузер (тот же, что в takeover.test.ts) --------------------

type Handler = ((e: unknown) => void) | null;

class FakeSocket {
  static readonly OPEN = 1;
  static instances: FakeSocket[] = [];

  readyState = 0;
  sent: string[] = [];
  onopen: Handler = null;
  onclose: Handler = null;
  onerror: Handler = null;
  onmessage: Handler = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = FakeSocket.OPEN;
      this.onopen?.({});
    });
  }

  send(data: string): void { this.sent.push(data); }
  close(): void { this.readyState = 3; }
  deliver(event: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
}

const g = globalThis as Record<string, unknown>;
g.WebSocket = FakeSocket;
g.location = { protocol: "http:", host: "localhost:5173" };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- записанный ход ---------------------------------------------------------

/** Медианы живого замера, мс от отправки реплики. ВХОД прибора, см. шапку. */
const WIRE = {
  "turn.analysis": 3,
  "judge.started": 4,
  "judge.completed": 715,
  "engine.state": 719,
  "response.output.delta": 1274,
  "response.done": 1561,
} as const;

/** Черновик разбора — тот, что уходит в `turn.analysis` ДО судьи. */
const DRAFT = {
  tags: [{ key: "objective_criteria", label: "объективный критерий" },
         { key: "tradeoff", label: "размен" }],
  primary: "objective_criteria",
  arg_quality: 84,              // судья его перепишет, а повтор обрежет
  spin: null,
  flags: { hostile: false, threat: false, question: true },
};

/** Число, которое движок на самом деле положил в метрики и в грейд. */
const SETTLED = 41;

const STATE = {
  trust: 55, tension: 20, info: 30, leverage: 40,
  offer_opp: 92, offer_player: 86, interests_found: 1, interests_total: 3,
  turn: 1, max_turns: 12, status: "active",
};

/** Ход целиком, в порядке провода. */
function turnEvents(): Array<{ at: number; event: Record<string, unknown> }> {
  return [
    { at: WIRE["turn.analysis"],
      event: { type: "turn.analysis", turn_id: 1, text: "реплика", analysis: DRAFT } },
    { at: WIRE["judge.started"], event: { type: "judge.started", turn_id: 1 } },
    { at: WIRE["judge.completed"], event: { type: "judge.completed", turn_id: 1, semantic: true } },
    { at: WIRE["engine.state"],
      event: { type: "engine.state", turn_id: 1, state: STATE,
               deltas: { trust: 5, tension: -3, info: 10, leverage: 8 },
               arg_quality: SETTLED, judged: true, reaction: "persuaded", closed: false } },
    { at: WIRE["response.output.delta"],
      event: { type: "response.output.delta", kind: "text", generation_id: "g1",
               turn_id: 1, text: "Хорошо, " } },
    { at: WIRE["response.done"],
      event: { type: "response.done", generation_id: "g1", turn_id: 1,
               text: "Хорошо, давайте посчитаем." } },
  ];
}

const EMPTY: NegotiationState = {
  kind: null, scenario: null, state: null, log: [], debrief: null, busy: false,
  phase: null, error: null, layerFail: {}, conn: "online", judgeActive: true,
  avatarState: null, oppSpeaking: false, oppAudio: false, userSpeaking: false,
  transcript: null, observations: [], tells: 0, tellFrames: 0, tellNow: false,
  framesSent: 0, capabilities: null,
};

interface Timeline {
  /** Веха, на которой в ленте впервые появились теги приёмов. */
  tagsAt: number | null;
  /** Веха, на которой впервые появилось ЧИСЛО качества довода. */
  scoreAt: number | null;
  /** Все значения, которые число успело показать. Длина > 1 — перерисовка. */
  scoreValues: number[];
  /** Все наборы тегов, которые лента успела показать. */
  tagSets: string[];
  final: ChatEntry[];
}

/** Прогнать записанный ход через отгруженный транспорт и отгруженный reducer. */
async function replay(opts: { viaVoice?: boolean } = {}): Promise<Timeline> {
  const { RealtimeTransport } = await import("../src/realtime/transport");
  FakeSocket.instances = [];

  let id = 0;
  let state: NegotiationState = { ...EMPTY, log: [] };
  const timeline: Timeline = { tagsAt: null, scoreAt: null, scoreValues: [], tagSets: [], final: [] };

  const transport = new RealtimeTransport(
    (m: ServerMsg) => { state = reduce(state, m, () => ++id); },
    () => {},
    {
      // Голосовой путь: финальная расшифровка кладёт реплику «me» в ленту
      // ровно так же, как это делает хук (см. useNegotiation.onTranscript).
      onTranscript: (text, final) => {
        if (!final || !text.trim()) return;
        state = { ...state, log: [...state.log, { id: ++id, kind: "me", text: text.trim() }] };
      },
    },
  );

  transport.send({ type: "start", scenarioId: "supplier", lang: "ru", mode: "practice" });
  await wait(0);
  const socket = FakeSocket.instances[FakeSocket.instances.length - 1];
  socket.deliver({ type: "session.queue_done" });
  socket.deliver({
    type: "session.created", session_id: "s1", scenario: { id: "supplier" },
    state: STATE, greeting: "Здравствуйте.", capabilities: { judge: true },
  });
  await wait(0);

  // Реплика игрока попадает в ленту ДО событий хода — и напечатанная, и
  // распознанная (сервер шлёт `user.transcript {final}` перед ходом).
  if (opts.viaVoice) {
    socket.deliver({ type: "user.transcript", text: "реплика", final: true });
  } else {
    state = { ...state, log: [...state.log, { id: ++id, kind: "me", text: "реплика" }], busy: true };
    transport.send({ type: "turn", text: "реплика" });
  }
  await wait(0);

  const observe = (at: number) => {
    const me = [...state.log].reverse().find((e) => e.kind === "me") as
      (ChatEntry & { kind: "me" }) | undefined;
    if (!me) return;
    if (me.analysis) {
      const keys = me.analysis.tags.map((t) => t.key).join(",");
      if (!timeline.tagSets.includes(keys)) timeline.tagSets.push(keys);
      if (timeline.tagsAt === null) timeline.tagsAt = at;
    }
    if (me.argSettled && me.analysis) {
      const v = me.analysis.arg_quality;
      if (!timeline.scoreValues.includes(v)) timeline.scoreValues.push(v);
      if (timeline.scoreAt === null) timeline.scoreAt = at;
    }
  };

  observe(0);
  for (const { at, event } of turnEvents()) {
    socket.deliver(event);
    await wait(0);
    observe(at);
  }
  transport.close();
  timeline.final = state.log;
  return timeline;
}

// ---------------------------------------------------------------------------
// 1. Теги — сразу. Число — когда движок его посчитал.
// ---------------------------------------------------------------------------

test("теги приёмов видны на turn.analysis, а не через реплику оппонента", async () => {
  const t = await replay();

  assert.equal(t.tagsAt, WIRE["turn.analysis"],
    `теги показались на ${t.tagsAt} мс вместо ${WIRE["turn.analysis"]}: разбор снова кто-то копит`);
  assert.ok(t.tagsAt! < WIRE["response.done"],
    "теги обязаны появиться раньше реплики оппонента — ради этого их и считают детерминированно");
  assert.deepEqual(t.tagSets, ["objective_criteria,tradeoff"],
    "набор тегов менялся на глазах у игрока — перерисовка запрещена");
});

test("число качества довода не показывается, пока движок его не посчитал", async () => {
  const t = await replay();

  assert.equal(t.scoreAt, WIRE["engine.state"],
    `число появилось на ${t.scoreAt} мс: раньше судьи его нет, позже — прятать нечего`);
  assert.deepEqual(t.scoreValues, [SETTLED],
    `игрок увидел ${t.scoreValues.join(" → ")}: показанное поле не имеет права менять значение`);
  assert.notEqual(t.scoreValues[0], DRAFT.arg_quality,
    "на экран уехал ЧЕРНОВИК из turn.analysis — то самое число, которого движок не считал");
});

test("источник балла назван: судейский балл не выдаётся за движковый и наоборот", async () => {
  const t = await replay();
  const me = t.final.find((e) => e.kind === "me") as (ChatEntry & { kind: "me" });
  assert.equal(me.judged, true, "судья отработал, а интерфейсу об этом не сказали");
});

// ---------------------------------------------------------------------------
// 2. Инвариант 7: голос и клавиатура — один и тот же ход
// ---------------------------------------------------------------------------

test("разбор ведёт себя одинаково для напечатанного и сказанного хода", async () => {
  const typed = await replay();
  const spoken = await replay({ viaVoice: true });

  assert.equal(spoken.tagsAt, typed.tagsAt, "голосом теги появляются в другой момент");
  assert.equal(spoken.scoreAt, typed.scoreAt, "голосом число появляется в другой момент");
  assert.deepEqual(spoken.scoreValues, typed.scoreValues);
  assert.deepEqual(spoken.tagSets, typed.tagSets);
});

// ---------------------------------------------------------------------------
// 3. Инвариант 8: офлайн-ядро ведёт себя так же — и там ждать нечего
// ---------------------------------------------------------------------------

test("офлайн разбор приходит сразу и целиком: судьи там нет вовсе", async () => {
  const seen: ServerMsg[] = [];
  const server = new MockServer((m) => seen.push(m));
  server.send({ type: "start", scenarioId: "supplier", lang: "ru", mode: "practice" });
  await wait(50);

  seen.length = 0;
  server.send({ type: "turn", text: "По рыночным данным медиана независимых прайсов 86, потому что это отраслевой стандарт." });

  // Ни одного тика ожидания: офлайн обе половины разбора готовы синхронно.
  await Promise.resolve();
  const analysis = seen.find((m) => m.type === "analysis");
  const score = seen.find((m) => m.type === "arg_quality");
  assert.ok(analysis, "офлайн разбор всё ещё ждёт реплику оппонента");
  assert.ok(score, "офлайн числу нечего ждать — судьи здесь нет");
  assert.ok(!seen.some((m) => m.type === "opponent" || m.type === "opponent_delta"),
    "разбор обязан опережать реплику оппонента и офлайн тоже");

  if (analysis.type === "analysis") assert.ok(analysis.analysis.tags.length > 0);
  if (score.type === "arg_quality") {
    assert.equal(score.judged, false,
      "офлайн балл считает словарь движка, и выдавать его за судейский нельзя (принцип 2)");
    assert.ok(score.value > 0);
  }

  await wait(1200);
  const opponent = seen.find((m) => m.type === "opponent");
  assert.ok(opponent, "реплика оппонента так и не пришла");
  if (opponent.type === "opponent" && score.type === "arg_quality") {
    assert.equal(opponent.analysis.arg_quality, score.value,
      "офлайн два канала разбора разошлись в числе");
  }
  server.close();
});

// ---------------------------------------------------------------------------
// 4. Потеря события не оставляет ленту без разбора
// ---------------------------------------------------------------------------

test("без turn.analysis теги всё равно доезжают с репликой оппонента", () => {
  let id = 0;
  const next = () => ++id;
  let state: NegotiationState = {
    ...EMPTY, log: [{ id: next(), kind: "me", text: "реплика" }],
  };
  state = reduce(state, {
    type: "opponent", text: "Хорошо.", analysis: DRAFT as never,
    deltas: { trust: 1, tension: 0, info: 0, leverage: 0 }, state: STATE as never,
  }, next);

  const me = state.log.find((e) => e.kind === "me") as (ChatEntry & { kind: "me" });
  assert.ok(me.analysis, "запасной путь потерян: ход остался вообще без разбора");
  assert.notEqual(me.argSettled, true,
    "число из `opponent` — черновик; помечать его посчитанным нельзя");
});

