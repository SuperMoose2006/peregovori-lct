// modeSwitch.test.ts — смена режима посреди партии на проводе: чат ↔ созвон.
//
// Режим на проводе задаёт адрес сокета (`?mode=voice`), слои — `session.init`,
// и поменять их в живом сокете нечем. Поэтому смена режима — это уход со
// старого сокета БЕЗ `session.close` (иначе сервер удалил бы партию) и вход
// новым с `resume`: тот же ход, те же шкалы, та же лента. Здесь держится:
// сокет и `resume`, лента даже на нулевом ходу (серверный `resumed` там ложь),
// честная строка, если партии уже нет, и звук прежнего режима, погашенный до
// нового входа. Серверная половина — tests/test_resilience.py
// (`test_resume_switches_text_and_call_without_losing_the_game`).
import test from "node:test";
import assert from "node:assert/strict";

import { reduce, type NegotiationState } from "../src/api/useNegotiation";
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
  /** Закрыться так, как закрывается настоящий сокет: с кодом. */
  shut(code: number): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  deliver(event: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
  types(): string[] { return this.sent.map((s) => (JSON.parse(s) as { type: string }).type); }
  init(): { resume?: string; layers?: Record<string, boolean> } {
    const raw = this.sent.map((s) => JSON.parse(s) as { type: string; payload?: object })
      .find((m) => m.type === "session.init");
    return (raw?.payload ?? {}) as { resume?: string; layers?: Record<string, boolean> };
  }
}

const g = globalThis as Record<string, unknown>;
g.WebSocket = FakeSocket;
g.location = { protocol: "http:", host: "localhost:5173" };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- провод -------------------------------------------------------------------

const EMPTY: NegotiationState = {
  kind: null, scenario: null, state: null, log: [], debrief: null, busy: false,
  phase: null, error: null, layerFail: {}, conn: "online", judgeActive: false,
  avatarState: null, oppSpeaking: false, oppAudio: false, userSpeaking: false,
  transcript: null, observations: [], tells: 0, tellFrames: 0, tellNow: false,
  framesSent: 0, capabilities: null, switching: false,
};
const STATE0 = {
  trust: 50, tension: 20, info: 10, leverage: 30, offer_opp: 100, offer_player: null,
  interests_found: 0, interests_total: 3, turn: 0, max_turns: 12, status: "active",
};
const STATE1 = { ...STATE0, trust: 55, offer_opp: 96, turn: 1 };

async function table() {
  const { RealtimeTransport } = await import("../src/realtime/transport");
  FakeSocket.instances = [];
  let id = 0;
  let state: NegotiationState = { ...EMPTY };
  const seen: ServerMsg[] = [];
  const conns: string[] = [];
  const transport = new RealtimeTransport(
    (m) => { seen.push(m); state = reduce(state, m, () => ++id); },
    (conn) => { conns.push(conn); state = { ...state, conn }; },
  );
  transport.send({ type: "start", scenarioId: "supplier", lang: "ru", mode: "practice",
                   layers: { probe: true, avatar: true, voice: false, camera: false, pokerface: false } });
  await wait(0);
  const first = FakeSocket.instances[0];
  first.deliver({ type: "session.queue_done" });
  first.deliver({ type: "session.created", session_id: "s-1", resumed: false,
    scenario: { id: "supplier" }, state: STATE0, greeting: "Здравствуйте.", capabilities: {} });
  await wait(0);
  return { transport, first, seen, conns, get: () => state,
           note: (text: string) => { state = { ...state, log: [...state.log, { id: ++id, kind: "sys", text }] }; } };
}

/** Ход целиком — так, как его присылает сервер (orchestrator/negotiation.py). */
function playTurn(socket: FakeSocket) {
  socket.deliver({ type: "engine.state", turn_id: 1, state: STATE1,
    deltas: { trust: 5, tension: 0, info: 0, leverage: 0 }, reaction: "neutral" });
  socket.deliver({ type: "response.output.delta", kind: "text", generation_id: "g1", text: "Допустим." });
  socket.deliver({ type: "response.done", generation_id: "g1", text: "Допустим." });
}

/** Дождаться нового сокета и довести его до `session.init`. */
async function nextSocket(): Promise<FakeSocket> {
  for (let i = 0; i < 20 && FakeSocket.instances.length < 2; i++) await wait(0);
  const socket = FakeSocket.instances[FakeSocket.instances.length - 1];
  socket.deliver({ type: "session.queue_done" });
  return socket;
}

async function withQuietPlayer<T>(run: (disposed: () => number) => Promise<T>): Promise<T> {
  const { AudioPlayer } = await import("../src/realtime/vendor/audio-player");
  const init = AudioPlayer.prototype.init;
  const dispose = AudioPlayer.prototype.dispose;
  let disposed = 0;
  AudioPlayer.prototype.init = () => {};             // в node нет AudioContext
  AudioPlayer.prototype.dispose = async () => { disposed++; };
  try {
    return await run(() => disposed);
  } finally {
    AudioPlayer.prototype.init = init;
    AudioPlayer.prototype.dispose = dispose;
  }
}

test("вход в созвон — та же партия: новый сокет с resume, без session.close, лента цела", async () => {
  await withQuietPlayer(async () => {
    const t = await table();
    playTurn(t.first);
    const before = t.get().log.map((e) => e.kind);
    assert.ok(t.get().log.some((e) => e.kind === "opp" && e.text === "Допустим."), "ход не доехал до ленты");

    assert.equal(t.transport.relayer({ probe: true, avatar: true, voice: true, camera: false, pokerface: false }), true);
    assert.ok(!t.first.types().includes("session.close"),
      "прежний сокет закрыл партию — сервер удалил бы её, и возвращаться было бы некуда");
    assert.equal(t.first.readyState, 3, "прежний сокет остался открытым");

    const second = await nextSocket();
    assert.match(second.url, /mode=voice/, "режим на проводе — адрес сокета");
    for (let i = 0; i < 20 && !second.types().includes("session.init"); i++) await wait(10);
    assert.equal(second.init().resume, "s-1", "вошли не в ту партию");
    assert.equal(second.init().layers?.voice, true);

    second.deliver({ type: "session.created", session_id: "s-1", resumed: true,
      scenario: { id: "supplier" }, state: STATE1, greeting: "Здравствуйте.", capabilities: { speech: true } });
    await wait(0);
    assert.deepEqual(t.get().log.map((e) => e.kind), before, "лента партии стёрлась при смене режима");
    assert.equal(t.get().state?.turn, 1);
    assert.ok(!t.seen.some((m) => m.type === "notice"), "«связь восстановлена» — неправда: человек сам нажал кнопку");
    t.transport.close();
  });
});

test("на нулевом ходу смена режима тоже не стирает ленту (серверный resumed там ложь)", async () => {
  await withQuietPlayer(async () => {
    const t = await table();
    t.note("Созвон начался");
    t.transport.relayer({ voice: true });
    const second = await nextSocket();
    for (let i = 0; i < 20 && !second.types().includes("session.init"); i++) await wait(10);
    // Сервер считает `resumed` по числу ходов — на нулевом это false.
    second.deliver({ type: "session.created", session_id: "s-1", resumed: false,
      scenario: { id: "supplier" }, state: STATE0, greeting: "Здравствуйте.", capabilities: {} });
    await wait(0);
    assert.deepEqual(t.get().log.map((e) => e.kind), ["opp", "sys"], "строка о созвоне пропала вместе с лентой");
    assert.equal(t.get().switching, false);
    t.transport.close();
  });
});

test("партии уже нет на сервере — новая попытка и честная строка об этом", async () => {
  const t = await table();
  playTurn(t.first);
  t.transport.relayer({ voice: false });
  const second = await nextSocket();
  for (let i = 0; i < 20 && !second.types().includes("session.init"); i++) await wait(10);
  second.deliver({ type: "session.created", session_id: "s-новая", resumed: false,
    scenario: { id: "supplier" }, state: STATE0, greeting: "Здравствуйте.", capabilities: {} });
  await wait(0);
  const notice = t.seen.find((m) => m.type === "notice") as { text: string } | undefined;
  assert.ok(notice, "новая партия вместо прежней — молча");
  assert.match(notice.text, /Предыдущая попытка недоступна/);
  assert.equal(t.get().state?.turn, 0);
  t.transport.close();
});

test("выход из созвона гасит звук прежнего режима до нового сокета", async () => {
  await withQuietPlayer(async (disposed) => {
    const t = await table();
    t.transport.relayer({ voice: true });
    const second = await nextSocket();
    for (let i = 0; i < 20 && !second.types().includes("session.init"); i++) await wait(10);
    second.deliver({ type: "session.created", session_id: "s-1", resumed: true,
      scenario: { id: "supplier" }, state: STATE0, greeting: "", capabilities: { speech: true } });
    for (let i = 0; i < 10; i++) await wait(0);
    const was = disposed();

    t.transport.relayer({ voice: false });
    await wait(0);
    assert.equal(disposed(), was + 1, "проигрыватель созвона пережил выход из него");
    assert.ok(!second.types().includes("session.close"));
    // Третий сокет доводится до `session.created`: иначе таймер тишины его
    // рукопожатия держал бы прогон.
    for (let i = 0; i < 20 && FakeSocket.instances.length < 3; i++) await wait(0);
    const third = FakeSocket.instances[2];
    third.deliver({ type: "session.queue_done" });
    third.deliver({ type: "session.created", session_id: "s-1", resumed: true,
      scenario: { id: "supplier" }, state: STATE0, greeting: "", capabilities: {} });
    await wait(0);
    t.transport.close();
  });
});

test("смена режима до начала партии невозможна", async () => {
  const { RealtimeTransport } = await import("../src/realtime/transport");
  FakeSocket.instances = [];
  const transport = new RealtimeTransport(() => {}, () => {});
  assert.equal(transport.relayer({ voice: true }), false, "партии ещё нет — входить некуда");
  transport.send({ type: "start", scenarioId: "supplier", lang: "ru", mode: "practice" });
  assert.equal(transport.relayer({ voice: true }), false, "до session.created resume указать нечем");
  // Рукопожатие доводится до конца: иначе его таймер тишины держал бы прогон.
  await wait(0);
  const socket = FakeSocket.instances[0];
  socket.deliver({ type: "session.queue_done" });
  socket.deliver({ type: "session.created", session_id: "s-1", scenario: { id: "supplier" }, state: STATE0,
                   greeting: "", capabilities: {} });
  await wait(0);
  transport.close();
});

test("ответ браузера о микрофоне, пришедший после «Завершить», не роняет живой чат", async () => {
  // Найдено ревью созвона. «Созвон» → браузер спрашивает микрофон → человек
  // жмёт «Завершить» → отвечает браузеру. Продолжение прежнего входа читало
  // уже обнулённое поле провайдера, падало, и `catch` объявлял «связь
  // потеряна» поверх живого текстового сокета: панель с «Повторить», который
  // начинает НОВУЮ партию.
  const { MediaProvider } = await import("../src/realtime/vendor/media-provider");
  const supported = MediaProvider.supported;
  const start = MediaProvider.prototype.start;
  const stop = MediaProvider.prototype.stop;
  let answer: (r: { mic: string; camera: string }) => void = () => {};
  let stopped = 0;
  MediaProvider.supported = () => true;
  MediaProvider.prototype.start = function () { return new Promise((r) => { answer = r as never; }); };
  MediaProvider.prototype.stop = async function () { stopped++; };
  try {
    await withQuietPlayer(async () => {
      const t = await table();
      t.transport.relayer({ voice: true });
      const call = await nextSocket();
      for (let i = 0; i < 20 && !call.types().includes("session.init"); i++) await wait(10);
      call.deliver({ type: "session.created", session_id: "s-1", resumed: true,
        scenario: { id: "supplier" }, state: STATE0, greeting: "", capabilities: { microphone: true, speech: true } });
      for (let i = 0; i < 5; i++) await wait(0);           // браузер спрашивает микрофон

      assert.equal(t.transport.relayer({ voice: false }), true, "«Завершить» не принято");
      for (let i = 0; i < 20 && FakeSocket.instances.length < 3; i++) await wait(0);
      const chat = FakeSocket.instances[2];
      chat.deliver({ type: "session.queue_done" });
      chat.deliver({ type: "session.created", session_id: "s-1", resumed: true,
        scenario: { id: "supplier" }, state: STATE0, greeting: "", capabilities: {} });
      await wait(0);
      const before = t.conns.length;
      const failedBefore = t.seen.filter((m) => m.type === "layer_failed").length;

      answer({ mic: "ok", camera: "off" });                // человек ответил браузеру
      for (let i = 0; i < 5; i++) await wait(0);
      assert.ok(!t.conns.slice(before).includes("lost"), `чат объявлен потерянным: ${t.conns.slice(before)}`);
      assert.equal(t.get().conn, "online");
      assert.equal(t.seen.filter((m) => m.type === "layer_failed").length, failedBefore,
        "отчёт об устройствах режима, которого больше нет, доехал до экрана");
      assert.ok(stopped >= 1, "микрофон, выданный уже после выхода из звонка, остался гореть");
      t.transport.close();
    });
  } finally {
    MediaProvider.supported = supported;
    MediaProvider.prototype.start = start;
    MediaProvider.prototype.stop = stop;
  }
});

test("неудачный вход в ту же партию повторяется, а не сдаётся с первого раза", async () => {
  // Найдено ревью созвона: обрыв сокета переподключается с паузами
  // (lib/net.ts), а смена режима при первой же неудаче давала «связь
  // потеряна» — хотя сервер держит партию тот же срок.
  const t = await table();
  t.transport.relayer({ voice: false, probe: true });
  const second = await nextSocket();
  second.shut(1006);                                       // перезапуск сервера на выкладке
  for (let i = 0; i < 5; i++) await wait(0);
  assert.equal(t.get().conn, "reconnecting", `сдались сразу: ${t.conns.join(",")}`);
  for (let i = 0; i < 40 && FakeSocket.instances.length < 3; i++) await wait(50);
  const third = FakeSocket.instances[2];
  assert.ok(third, "повторной попытки не было");
  third.deliver({ type: "session.queue_done" });
  for (let i = 0; i < 20 && !third.types().includes("session.init"); i++) await wait(10);
  assert.equal(third.init().resume, "s-1", "повтор вошёл не в ту партию");
  third.deliver({ type: "session.created", session_id: "s-1", resumed: true,
    scenario: { id: "supplier" }, state: STATE0, greeting: "", capabilities: {} });
  await wait(0);
  assert.equal(t.get().conn, "online");
  assert.ok(!t.conns.includes("lost"));
  t.transport.close();
});

test("партия начата заново — вопросы о реакции считаются с первого хода", async () => {
  // Найдено ревью созвона: счётчик последнего вопроса переживал смену режима
  // и тогда, когда сервер начал НОВУЮ партию (прежней уже нет), — и вопросы
  // её первых ходов глушились как повторы.
  const probe = (turn: number) => ({ type: "probe", turn, options: ["a", "b", "c", "d"], answer: 0 });
  const t = await table();
  t.first.deliver(probe(1));
  t.first.deliver(probe(2));
  assert.equal(t.seen.filter((m) => m.type === "probe").length, 2);
  t.transport.relayer({ probe: true });
  const second = await nextSocket();
  for (let i = 0; i < 20 && !second.types().includes("session.init"); i++) await wait(10);
  second.deliver({ type: "session.created", session_id: "s-новая", resumed: false,
    scenario: { id: "supplier" }, state: STATE0, greeting: "", capabilities: {} });
  await wait(0);
  second.deliver(probe(1));
  assert.equal(t.seen.filter((m) => m.type === "probe").length, 3, "вопрос первого хода новой партии заглушён");
  t.transport.close();
});
