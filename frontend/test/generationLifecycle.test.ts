// generationLifecycle.test.ts — жизненный цикл поколения ответа на клиенте.
//
// Поколение принимается ОДИН раз — первым событием с новым id, текст это или
// звук, — и тогда же прежнее уходит целиком: звук, кадры, часы проигрывателя.
// Хвосты ушедших поколений (звук, кадр, `done`, отмена) не оживляют и не
// глушат новое. Сервер и сам выбрасывает погашенное на выходе шины; здесь
// проверяется то, что уже в полёте или пришло в неудобном порядке.
import test from "node:test";
import assert from "node:assert/strict";
import type { ServerMsg } from "../src/types";

class Socket {
  static latest: Socket;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor() {
    Socket.latest = this;
    queueMicrotask(() => { this.readyState = 1; this.onopen?.(); });
  }
  sent: { type: string }[] = [];
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; }
  deliver(event: object) { this.onmessage?.({ data: JSON.stringify(event) }); }
}

const g = globalThis as Record<string, unknown>;
g.WebSocket = Socket;
g.location = { protocol: "http:", host: "localhost:5173" };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Проигрыватель-самописец: что транспорт попросил и в каком порядке. */
function fakePlayer() {
  const calls: string[] = [];
  return {
    calls,
    busy: false, blocked: false, isPlaying: false,
    playbackTimeMs: () => null,
    playChunk(a: string) { calls.push(`play:${a}`); },
    beginTurn() { calls.push("begin"); },
    endTurn() { calls.push("end"); },
    stopAll() { calls.push("stop"); },
    dispose: async () => {},
  };
}

async function table() {
  const { RealtimeTransport } = await import("../src/realtime/transport");
  const received: ServerMsg[] = [];
  const transport = new RealtimeTransport((m) => received.push(m), () => {});
  transport.send({ type: "start", scenarioId: "supplier", lang: "ru", mode: "practice" });
  await tick();
  const socket = Socket.latest;
  socket.deliver({ type: "session.queue_done" });
  socket.deliver({ type: "session.created", session_id: "gen", scenario: { id: "supplier" },
    state: { status: "active", turn: 0 }, greeting: "Здравствуйте.", capabilities: {} });
  await tick();
  const player = fakePlayer();
  (transport as any).player = player;
  received.length = 0;
  const say = (gen: string, kind: "text" | "audio", body: string) =>
    socket.deliver({ type: "response.output.delta", generation_id: gen, kind,
                     ...(kind === "text" ? { text: body } : { audio: body }) });
  const state = (turn: number) =>
    socket.deliver({ type: "engine.state", turn_id: turn, state: { status: "active", turn },
                     deltas: { trust: 1, tension: 0, info: 0, leverage: 0 }, reaction: "neutral", closed: false });
  return { transport, socket, player, received, say, state };
}

const opponents = (received: ServerMsg[]) => received.filter((m) => m.type === "opponent");

test("звук раньше текста: часы сбрасываются один раз, поздний текст звук не обрывает", async () => {
  const t = await table();
  try {
    t.state(1);
    t.say("g1", "audio", "A1");
    t.say("g1", "text", "Хорошо, ");
    t.say("g1", "audio", "A2");
    assert.deepEqual(t.player.calls, ["stop", "begin", "play:A1", "play:A2"],
      "текст того же поколения не должен начинать реплику заново");
  } finally { t.transport.close(); }
});

test("несколько чанков одного поколения играют подряд без сброса", async () => {
  const t = await table();
  try {
    t.say("g1", "text", "Раз");
    for (const a of ["A1", "A2", "A3"]) t.say("g1", "audio", a);
    assert.deepEqual(t.player.calls, ["stop", "begin", "play:A1", "play:A2", "play:A3"]);
  } finally { t.transport.close(); }
});

test("старый звук после отмены не звучит", async () => {
  const t = await table();
  try {
    t.say("g1", "text", "Хорошо, ");
    t.say("g1", "audio", "A1");
    t.socket.deliver({ type: "generation.cancelled", generation_id: "g1", reason: "client_cancel" });
    t.player.calls.length = 0;
    t.say("g1", "audio", "LATE");
    t.say("g1", "text", "хвост");
    assert.deepEqual(t.player.calls, [], "хвост погашенного поколения дошёл до проигрывателя");
  } finally { t.transport.close(); }
});

test("старый звук после начала нового ответа выбрасывается, новый играет", async () => {
  const t = await table();
  try {
    t.say("g1", "text", "Первый");
    t.say("g2", "text", "Второй");
    t.player.calls.length = 0;
    t.say("g1", "audio", "OLD");
    t.say("g2", "audio", "NEW");
    assert.deepEqual(t.player.calls, ["play:NEW"]);
  } finally { t.transport.close(); }
});

test("старые done и отмена после нового ответа его не трогают", async () => {
  const t = await table();
  try {
    t.state(1);
    t.say("g1", "text", "Первый");
    t.say("g2", "text", "Второй");
    t.say("g2", "audio", "NEW");
    t.player.calls.length = 0;
    t.received.length = 0;
    t.socket.deliver({ type: "response.done", generation_id: "g1", text: "Первый." });
    t.socket.deliver({ type: "generation.cancelled", generation_id: "g1", reason: "new_turn" });
    assert.deepEqual(t.player.calls, [], "устаревшее событие остановило или закончило новый ответ");
    assert.equal(opponents(t.received).length, 0, "устаревший done собрал ход второй раз");
    t.say("g2", "audio", "MORE");
    assert.deepEqual(t.player.calls, ["play:MORE"]);
  } finally { t.transport.close(); }
});

test("done кончает текст, а не звук: звук того же поколения после него играет", async () => {
  const t = await table();
  try {
    t.state(1);
    t.say("g1", "text", "Давайте обсудим.");
    t.socket.deliver({ type: "response.done", generation_id: "g1", text: "Давайте обсудим." });
    t.say("g1", "audio", "AFTER");
    assert.ok(t.player.calls.includes("play:AFTER"));
    assert.equal(opponents(t.received).length, 1);
  } finally { t.transport.close(); }
});

test("ход собирается один раз: отмена после done второго не добавляет", async () => {
  const t = await table();
  try {
    t.state(1);
    t.say("g1", "text", "Давайте обсудим.");
    t.socket.deliver({ type: "response.done", generation_id: "g1", text: "Давайте обсудим." });
    t.socket.deliver({ type: "generation.cancelled", generation_id: "g1", reason: "new_turn" });
    assert.equal(opponents(t.received).length, 1);
  } finally { t.transport.close(); }
});

test("перебитый до done ход доводится с услышанным текстом", async () => {
  const t = await table();
  try {
    t.state(1);
    t.say("g1", "text", "Хорошо, ");
    t.socket.deliver({ type: "generation.cancelled", generation_id: "g1", reason: "barge_in" });
    const done = opponents(t.received);
    assert.equal(done.length, 1);
    assert.equal((done[0] as { text: string }).text, "Хорошо, ");
  } finally { t.transport.close(); }
});

test("кадры: только принятого поколения, хвост ушедшего не встаёт в очередь", async () => {
  const t = await table();
  try {
    const frames = (t.transport as any).faceFrames as { generation: string; frames: unknown[] };
    t.say("g1", "audio", "A1");
    t.socket.deliver({ type: "avatar.frame", generation_id: "g1", pts_ms: 0, jpeg: "/9j/2Q==" });
    assert.equal(frames.generation, "g1");
    assert.equal(frames.frames.length, 1);
    t.say("g2", "audio", "B1");
    t.socket.deliver({ type: "avatar.frame", generation_id: "g1", pts_ms: 40, jpeg: "/9j/2Q==" });
    assert.equal(frames.frames.length, 0, "кадр ушедшего поколения встал в очередь нового");
    t.socket.deliver({ type: "avatar.frame", generation_id: "g2", pts_ms: 0, jpeg: "/9j/2Q==" });
    assert.equal(frames.generation, "g2");
    assert.equal(frames.frames.length, 1);
  } finally { t.transport.close(); }
});

test("переподключение: поколение прежнего сокета больше ничего не трогает", async () => {
  const t = await table();
  try {
    t.say("g1", "text", "До обрыва");
    t.say("g1", "audio", "A1");
    t.socket.deliver({ type: "session.created", session_id: "gen", scenario: { id: "supplier" },
      state: { status: "active", turn: 1 }, greeting: "Здравствуйте.", resumed: true, capabilities: {} });
    t.player.calls.length = 0;
    t.say("g1", "audio", "LATE");
    t.say("g2", "text", "После");
    t.say("g2", "audio", "B1");
    assert.deepEqual(t.player.calls, ["stop", "begin", "play:B1"]);
  } finally { t.transport.close(); }
});
