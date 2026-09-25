import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildProbe } from "../src/lib/probe";
import type { ServerMsg } from "../src/types";

test("offline probe keeps the shared server fixture", () => {
  const cases = JSON.parse(readFileSync(new URL("./fixtures/probes.json", import.meta.url), "utf8"));
  for (const c of cases) assert.deepEqual(buildProbe(c.reaction, c.turn), c.probe);
});

class Socket {
  static OPEN = 1;
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
  sent: { type: string; payload?: unknown }[] = [];
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; }
  deliver(event: object) { this.onmessage?.({ data: JSON.stringify(event) }); }
}

const g = globalThis as Record<string, unknown>;
g.WebSocket = Socket;
g.location = { protocol: "http:", host: "localhost:5173" };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("online asks only the server question, once, after the reply", async () => {
  const { RealtimeTransport } = await import("../src/realtime/transport");
  const received: ServerMsg[] = [];
  const transport = new RealtimeTransport((m) => received.push(m), () => {});
  try {
    transport.send({ type: "start", scenarioId: "supplier", lang: "ru", mode: "practice",
      layers: { probe: true, voice: false, avatar: false, camera: false, pokerface: false } });
    await tick();
    const socket = Socket.latest;
    socket.deliver({ type: "session.queue_done" });
    const state = { status: "active", turn: 3 };
    socket.deliver({ type: "session.created", session_id: "probe-wire", scenario: { id: "supplier" },
      state, greeting: "Здравствуйте.", capabilities: {} });
    await tick();
    received.length = 0;
    socket.deliver({ type: "engine.state", turn_id: 3, state, reaction: "neutral", closed: false });
    socket.deliver({ type: "response.done", text: "Давайте обсудим." });
    assert.equal(received.filter((m) => m.type === "probe").length, 0,
      "engine.state must not trigger a browser-generated probe");
    const question = { type: "probe", turn: 3,
      options: ["warmed", "opened_up", "persuaded", "collaborated"], answer: 2 };
    socket.deliver(question);
    socket.deliver(question);
    assert.deepEqual(received.filter((m) => m.type === "probe"), [question]);
    assert.ok(received.findIndex((m) => m.type === "opponent") < received.findIndex((m) => m.type === "probe"));
    socket.deliver({ ...question, turn: 6, answer: 10 });
    socket.deliver({ ...question, turn: 6, options: ["warmed", "warmed", "warmed", "warmed"] });
    assert.equal(received.filter((m) => m.type === "probe").length, 1);
  } finally {
    transport.close();
  }
});

test("custom configuration reaches session.init unchanged", async () => {
  const { RealtimeTransport } = await import("../src/realtime/transport");
  const { DEFAULT_SCENARIO_CONTEXT } = await import("../src/lib/scenarioContext");
  const context = { ...DEFAULT_SCENARIO_CONTEXT, sector: "Factory", difficulty: 5, style: "tough" as const };
  const transport = new RealtimeTransport(() => {}, () => {});
  try {
    transport.send({ type: "start", scenarioId: "custom", lang: "en", mode: "custom",
      situation: "Negotiate a supply contract", context });
    await tick();
    const socket = Socket.latest;
    socket.deliver({ type: "session.queue_done" });
    await tick();
    const init = socket.sent.find((e) => e.type === "session.init");
    assert.ok(init);
    assert.deepEqual((init.payload as { context: unknown }).context, context);
  } finally {
    transport.close();
  }
});

test("video wire follows current generation and drops cancelled frames", async () => {
  const { RealtimeTransport } = await import("../src/realtime/transport");
  const transport = new RealtimeTransport(() => {}, () => {});
  try {
    transport.send({ type: "start", scenarioId: "supplier", lang: "ru", mode: "practice" });
    await tick();
    const socket = Socket.latest;
    socket.deliver({ type: "session.queue_done" });
    socket.deliver({ type: "session.created", session_id: "video-wire", scenario: { id: "supplier" },
      state: { status: "active", turn: 1 }, greeting: "Hello", capabilities: {} });
    await tick();
    (transport as any).player = { playbackTimeMs: () => 100, beginTurn() {}, stopAll() {},
      dispose: async () => {} };
    socket.deliver({ type: "response.output.delta", kind: "text", generation_id: "g", text: "Hi" });
    socket.deliver({ type: "avatar.frame", generation_id: "old", pts_ms: 100, jpeg: "/9j/2Q==" });
    assert.equal(transport.videoFrame(), null);
    socket.deliver({ type: "avatar.frame", generation_id: "g", pts_ms: 100, jpeg: "/9j/2Q==" });
    assert.equal(transport.videoFrame(), "data:image/jpeg;base64,/9j/2Q==");
    socket.deliver({ type: "generation.cancelled", generation_id: "g" });
    assert.equal(transport.videoFrame(), null);
    socket.deliver({ type: "avatar.frame", generation_id: "g", pts_ms: 100, jpeg: "/9j/2Q==" });
    assert.equal(transport.videoFrame(), null);
  } finally { transport.close(); }
});

test("late audio after response.done returns the speaking indicator to idle", async () => {
  // «Говорит» ставит проигрыватель по своим часам, а не приход чанка: звук,
  // который браузер не играет, не должен зажигать лицо. Поддельный
  // проигрыватель поэтому отдаёт часы: пока звук под указателем — они есть.
  const { RealtimeTransport } = await import("../src/realtime/transport");
  const speaking: boolean[] = [];
  const transport = new RealtimeTransport(() => {}, () => {}, { onOppAudio: on => speaking.push(on) });
  try {
    transport.send({ type: "start", scenarioId: "supplier", lang: "ru", mode: "practice" });
    await tick();
    const socket = Socket.latest;
    socket.deliver({ type: "session.queue_done" });
    socket.deliver({ type: "session.created", session_id: "late-audio", scenario: { id: "supplier" },
      state: { status: "active", turn: 1 }, greeting: "Hello", capabilities: {} });
    await tick();
    let audible = false;
    (transport as any).player = {
      get busy() { return audible; }, blocked: false, isPlaying: false,
      playbackTimeMs: () => (audible ? 120 : null),
      playChunk() { audible = true; }, beginTurn() {}, endTurn() {}, stopAll() { audible = false; },
      dispose: async () => {},
    };
    socket.deliver({ type: "response.done", text: "Hello" });
    await new Promise(resolve => setTimeout(resolve, 550));
    socket.deliver({ type: "response.output.delta", generation_id: "late", kind: "audio", audio: "AAAAAA==" });
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.deepEqual(speaking, [true]);
    audible = false;
    await new Promise(resolve => setTimeout(resolve, 350));
    assert.deepEqual(speaking, [true, false]);
  } finally { transport.close(); }
});
