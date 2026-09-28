// offlineParity.test.ts — инвариант 8 на уровне ПАРТИИ, а не движка.
//
// Движок-зеркало сверен с Python до балла (games.test.ts, parity.test.ts). Но
// между движком и экраном у офлайн-ядра есть собственный код — `MockServer`:
// он накладывает репутацию кампании, закрывает стол по лимиту ходов, решает,
// в каком порядке уходят разбор, реплика, вопрос по лицу и разбор партии. На
// сервере то же самое делают `endpoint.py` и `orchestrator/negotiation.py`, и
// разъехаться эти две обвязки могут, не задев ни одного числа движка.
//
// Время офлайн-ядра подменено (`t.mock.timers`): оно честно «печатает» реплику
// с паузами, и двенадцать ходов по-настоящему шли бы секунды.
import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { MockServer } from "../src/mock/mockServer";
import { reduce, type NegotiationState } from "../src/api/useNegotiation";
import type { ServerMsg } from "../src/types";

const VIEWS = readFileSync(new URL("../../services/gateway/app/views.py", import.meta.url), "utf8");

/** Поднять офлайн-ядро на подменённых часах. */
function offline(t: TestContext) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const seen: ServerMsg[] = [];
  const server = new MockServer((m) => seen.push(m));
  const until = async (done: () => boolean) => {
    for (let i = 0; i < 500 && !done(); i++) {
      t.mock.timers.tick(50);
      for (let k = 0; k < 4; k++) await Promise.resolve();
    }
    assert.ok(done(), "офлайн-ядро не ответило");
  };
  return { server, seen, until };
}

/** Типы сообщений хода подряд, без повторов (дельт бывает сколько угодно). */
const shape = (msgs: ServerMsg[]) =>
  msgs.map((m) => m.type).filter((ty, i, all) => ty !== "phase" && ty !== all[i - 1]);

// ---------------------------------------------------------------------------
// 1. Репутация кампании: тот же сдвиг доверия и тот же потолок
// ---------------------------------------------------------------------------

test("репутация сдвигает стартовое доверие ровно как views.apply_reputation", async (t) => {
  // Прежний тест проверял только «выше — теплее». Коэффициент и потолок ±15
  // могли уехать в любую сторону, оставив направление верным.
  assert.ok(VIEWS.includes("nudge = max(-15.0, min(15.0, reputation * 0.12))"),
    "формула сдвига на сервере сменилась — зеркало mockServer.ts обязано смениться с ней");
  assert.ok(VIEWS.includes("sess.state.trust = max(0.0, min(100.0, sess.state.trust + nudge))"));

  const { server, seen, until } = offline(t);
  const trustAt = async (reputation?: number) => {
    seen.length = 0;
    server.send({ type: "start", scenarioId: "salary", lang: "ru", mode: "campaign", reputation });
    await until(() => seen.some((m) => m.type === "greeting"));
    const g = seen.find((m) => m.type === "greeting");
    return g?.type === "greeting" ? g.state.trust : NaN;
  };
  const base = await trustAt(undefined);
  assert.equal(await trustAt(0), base, "нулевая репутация — тоже репутация, и сдвиг у неё ноль");
  assert.equal(await trustAt(40), Math.round(base + 4.8));
  assert.equal(await trustAt(-40), Math.round(base - 4.8));
  assert.equal(await trustAt(1000), Math.round(Math.min(100, base + 15)), "потолок +15 пробит");
  assert.equal(await trustAt(-1000), Math.round(Math.max(0, base - 15)), "потолок −15 пробит");
  server.close();
});

// ---------------------------------------------------------------------------
// 2. Лимит ходов: стол закрывается там же и так же
// ---------------------------------------------------------------------------

/** Реплики, которые не закрывают сделку и не рвут переговоры. */
const IDLE = [
  "Добрый день.", "Расскажите, как у вас дела.", "Понимаю.", "Хорошо, продолжим.",
  "Давайте подумаем.", "Интересно.", "Ясно.", "Слушаю вас.", "Продолжайте, пожалуйста.",
  "Спасибо за пояснение.", "Я вас услышал.", "Понятно.",
];

async function playToLimit(t: TestContext) {
  const { server, seen, until } = offline(t);
  server.send({ type: "start", scenarioId: "supplier", lang: "ru", mode: "practice",
                layers: { probe: true } });
  await until(() => seen.some((m) => m.type === "greeting"));
  let last: ServerMsg[] = [];
  for (const line of IDLE) {
    const from = seen.length;
    server.send({ type: "turn", text: line });
    await until(() => seen.slice(from).some((m) => m.type === "opponent"));
    const opp = seen.slice(from).find((m) => m.type === "opponent");
    if (opp?.type === "opponent" && opp.state.status !== "active") {
      await until(() => seen.slice(from).some((m) => m.type === "debrief"));
      last = seen.slice(from);
      break;
    }
  }
  server.close();
  return last;
}

test("двенадцатый ход закрывает стол срывом, и разбор идёт следом — как на сервере", async (t) => {
  // Сервер (negotiation.py, шаг 3): `turn >= max_turns` → `breakdown`, ход
  // закрыт, вопроса по лицу нет, следом `_send_debrief`.
  const last = await playToLimit(t);
  assert.ok(last.length > 0, "стол не закрылся за двенадцать ходов");
  const opp = last.find((m) => m.type === "opponent");
  assert.ok(opp?.type === "opponent");
  assert.equal(opp.state.turn, 12);
  assert.equal(opp.state.status, "breakdown");
  assert.deepEqual(shape(last), ["analysis", "arg_quality", "opponent_delta", "opponent", "debrief"],
    "на закрытом столе порядок другой или задан вопрос по лицу");
  const debrief = last.find((m) => m.type === "debrief");
  assert.ok(debrief?.type === "debrief");
  assert.equal(debrief.debrief.status, "breakdown");
});

test("реплика по истечении времени та же, что у сервера", {
  todo: "mock/mockServer.ts:199-201 говорит «У нас вышло время на сегодня. Договориться так и не " +
        "удалось.», а views.py::timeout_line — «…Предлагаю вернуться позже — договориться так и " +
        "не удалось.» (и по-английски так же): офлайн и онлайн закрывают стол разными словами",
}, async (t) => {
  const want = VIEWS.match(/def timeout_line[\s\S]*?return "([^"]+)"[\s\S]*?return "([^"]+)"/);
  assert.ok(want, "не нашёл views.timeout_line — разбор исходника сломан");
  const last = await playToLimit(t);
  const opp = last.find((m) => m.type === "opponent");
  assert.ok(opp?.type === "opponent");
  assert.equal(opp.text, want[1]);
});

// ---------------------------------------------------------------------------
// 3. Один ход — одна и та же последовательность сообщений офлайн и онлайн
// ---------------------------------------------------------------------------

type Handler = ((e: unknown) => void) | null;

class FakeSocket {
  static readonly OPEN = 1;
  static latest: FakeSocket;
  readyState = 0;
  onopen: Handler = null;
  onclose: Handler = null;
  onerror: Handler = null;
  onmessage: Handler = null;
  constructor() {
    FakeSocket.latest = this;
    queueMicrotask(() => { this.readyState = 1; this.onopen?.({}); });
  }
  send(): void {}
  close(): void { this.readyState = 3; }
  deliver(event: Record<string, unknown>): void { this.onmessage?.({ data: JSON.stringify(event) }); }
}

test("ход с вопросом по лицу: офлайн-ядро и провод дают экрану одно и то же", async (t) => {
  // Экран один на оба пути. Если офлайн-ядро положит вопрос раньше реплики или
  // число внутрь `opponent`, стол без сети будет выглядеть иначе, чем с сетью, —
  // и ни один тест движка этого не заметит. `phase` не сравнивается: это
  // подпись к ожиданию судьи, а судьи офлайн нет (types.ts: «a turn must render
  // correctly if this never arrives»).
  const g = globalThis as Record<string, unknown>;
  g.WebSocket = FakeSocket;
  g.location = { protocol: "http:", host: "localhost:5173" };
  const { RealtimeTransport } = await import("../src/realtime/transport");
  const online: ServerMsg[] = [];
  const transport = new RealtimeTransport((m) => online.push(m), () => {});
  transport.send({ type: "start", scenarioId: "supplier", lang: "ru", mode: "practice", layers: { probe: true } });
  await new Promise((r) => setTimeout(r, 0));
  const socket = FakeSocket.latest;
  socket.deliver({ type: "session.queue_done" });
  socket.deliver({ type: "session.created", session_id: "s", scenario: { id: "supplier" },
    state: { turn: 2, status: "active" }, greeting: "", capabilities: {} });
  await new Promise((r) => setTimeout(r, 0));
  online.length = 0;
  // Порядок `on_player_turn`: разбор → судья → движок → слово судьи → реплика → вопрос.
  for (const e of [
    { type: "turn.analysis", turn_id: 3, analysis: { tags: [], primary: "statement", arg_quality: 10, spin: null,
      flags: { hostile: false, threat: false, question: false } } },
    { type: "judge.started", turn_id: 3 },
    { type: "judge.completed", turn_id: 3, semantic: true },
    { type: "engine.state", turn_id: 3, state: { turn: 3, status: "active" }, deltas: { trust: 0, tension: 0, info: 0, leverage: 0 },
      arg_quality: 10, judged: true, reaction: "neutral", closed: false },
    { type: "turn.coach", turn_id: 3, text: "", techniques: [], reject: false },
    { type: "response.output.delta", kind: "text", generation_id: "g", text: "Хорошо, " },
    { type: "response.output.delta", kind: "text", generation_id: "g", text: "продолжим." },
    { type: "response.done", generation_id: "g", text: "Хорошо, продолжим." },
    { type: "probe", turn: 3, options: ["warmed", "neutral", "hardened", "irritated"], answer: 1 },
  ]) socket.deliver(e);
  transport.close();

  const { server, seen, until } = offline(t);
  server.send({ type: "start", scenarioId: "supplier", lang: "ru", mode: "practice", layers: { probe: true } });
  await until(() => seen.some((m) => m.type === "greeting"));
  let probeTurn: ServerMsg[] = [];
  for (const line of IDLE.slice(0, 6)) {
    const from = seen.length;
    server.send({ type: "turn", text: line });
    await until(() => seen.slice(from).some((m) => m.type === "opponent"));
    if (seen.slice(from).some((m) => m.type === "probe")) { probeTurn = seen.slice(from); break; }
  }
  server.close();

  assert.ok(probeTurn.length > 0, "офлайн за шесть ходов не задал ни одного вопроса по лицу");
  assert.deepEqual(shape(online), ["analysis", "arg_quality", "opponent_delta", "opponent", "probe"]);
  assert.deepEqual(shape(probeTurn), shape(online), "офлайн и онлайн рисуют ход в разном порядке");

  // И то, что из этого получается на экране, одинаково по форме.
  const table = (msgs: ServerMsg[]) => {
    let id = 0;
    const s0: NegotiationState = {
      kind: null, scenario: null, state: null, log: [{ id: ++id, kind: "me", text: "реплика" }], debrief: null,
      busy: true, phase: null, error: null, layerFail: {}, conn: "online", judgeActive: false,
      avatarState: null, oppSpeaking: false, oppAudio: false, userSpeaking: false, transcript: null,
      observations: [], tells: 0, tellFrames: 0, tellNow: false, framesSent: 0, capabilities: null,
    };
    const s = msgs.reduce((acc, m) => reduce(acc, m, () => ++id), s0);
    return { kinds: s.log.map((e) => e.kind), busy: s.busy,
             settled: (s.log[0] as { argSettled?: boolean }).argSettled };
  };
  const on = table(online), off = table(probeTurn);
  // Слово судьи офлайн подменяет словарный наставник, онлайн его здесь нет —
  // карточку наставника сравнивать нечестно, всё остальное обязано совпасть.
  const noCoach = (k: string[]) => k.filter((x) => x !== "coach");
  assert.deepEqual(noCoach(off.kinds), noCoach(on.kinds));
  assert.deepEqual(noCoach(on.kinds), ["me", "opp", "probe"]);
  assert.equal(off.busy, false);
  assert.equal(on.busy, false);
  assert.equal(off.settled, true);
  assert.equal(on.settled, true);
});
