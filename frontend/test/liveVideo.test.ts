// liveVideo.test.ts — клиент живого видео собеседника: переходы режима лица.
//
// Сервер (`services/gateway/app/avatar/live/adapter.py`) говорит клиенту
// только одно: в каком режиме сейчас лицо. `amplitude` — сервис видео
// отвалился, рисованный портрет со ртом по громкости; `video` — сервис снова
// на связи, кадры по часам звука. Клиент перестраивается по слову сервера и
// больше ничего о сервисе не знает.
import test from "node:test";
import assert from "node:assert/strict";
import { AvatarFrames } from "../src/lib/avatarFrames";
import { faceRenderer, pickFaceSource } from "../src/lib/faceSource";
import { syntheticFace } from "../src/lib/meeting";

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

const VIDEO = { available: true, lipsync: true, lipsync_mode: "video", transport: "jpeg", synthetic: true };

async function started(capabilities: Record<string, unknown>) {
  const { RealtimeTransport } = await import("../src/realtime/transport");
  const seen: Record<string, unknown>[] = [];
  const transport = new RealtimeTransport(() => {}, () => {}, {
    onCapabilities: (c) => seen.push(JSON.parse(JSON.stringify(c))),
  });
  transport.send({ type: "start", scenarioId: "supplier", lang: "ru", mode: "practice" });
  await tick();
  const socket = Socket.latest;
  socket.deliver({ type: "session.queue_done" });
  socket.deliver({ type: "session.created", session_id: "live", scenario: { id: "supplier" },
    state: { status: "active", turn: 1 }, greeting: "Добрый день", capabilities });
  await tick();
  return { transport, socket, seen };
}

const mode = (seen: Record<string, unknown>[]) =>
  faceRenderer(seen[seen.length - 1] as Record<string, unknown>);

test("отказ сервиса посреди партии: лицо уходит в рисованный портрет, кадры гаснут", async () => {
  const { transport, socket, seen } = await started({ avatar: VIDEO });
  try {
    assert.equal(mode(seen), "video");
    assert.equal(syntheticFace(seen[seen.length - 1]), true, "заглушка подписана");
    (transport as any).player = { playbackTimeMs: () => 100, beginTurn() {}, stopAll() {},
      dispose: async () => {} };
    socket.deliver({ type: "response.output.delta", kind: "text", generation_id: "g", text: "Да" });
    socket.deliver({ type: "avatar.frame", generation_id: "g", pts_ms: 90, jpeg: "/9j/2Q==" });
    assert.ok(transport.videoFrame(), "кадр сервиса на экране");
    socket.deliver({ type: "avatar.state", state: "listening", lipsync: true,
      lipsync_mode: "amplitude", transport: "local", reason: "provider_failed", detail: "closed" });
    assert.equal(mode(seen), "amplitude");
    assert.equal(syntheticFace(seen[seen.length - 1]), false,
      "подпись «тестовый поток» снята: потока больше нет, на экране портрет");
    assert.equal(transport.videoFrame(), null, "кадр отказавшего сервиса не держится на экране");
    // Так выбирает лицо экран: рисованный портрет со ртом по громкости.
    assert.equal(pickFaceSource({ renderer: mode(seen), exam: false, reducedMotion: false,
      hasFrame: false, stillFailed: false, loopFailed: false }), "drawn");
  } finally { transport.close(); }
});

test("сервис снова на связи: лицо возвращается к кадрам, один раз, а не на каждом состоянии", async () => {
  const { transport, socket, seen } = await started({ avatar: VIDEO });
  try {
    socket.deliver({ type: "avatar.state", state: "listening", lipsync_mode: "amplitude",
      transport: "local", reason: "provider_failed" });
    assert.equal(mode(seen), "amplitude");
    const before = seen.length;
    socket.deliver({ type: "avatar.state", state: "thinking", lipsync: true, lipsync_mode: "video",
      transport: "jpeg", synthetic: true, reason: "provider_recovered" });
    assert.equal(mode(seen), "video");
    assert.equal(seen.length, before + 1);
    const avatar = seen[seen.length - 1].avatar as Record<string, unknown>;
    assert.equal(avatar.synthetic, true, "заглушка остаётся подписанной и после возврата");
    socket.deliver({ type: "avatar.state", state: "warm", lipsync: true, lipsync_mode: "video", transport: "jpeg" });
    assert.equal(seen.length, before + 1, "повтор режима не перестраивает экран");
  } finally { transport.close(); }
});

test("без кредов сервер шлёт прежние события — режим лица не меняется", async () => {
  const LOCAL = { available: true, lipsync: true, lipsync_mode: "amplitude", transport: "local" };
  const { transport, socket, seen } = await started({ avatar: LOCAL });
  try {
    socket.deliver({ type: "avatar.state", state: "warm", reaction: "warmed", persona: "supplier",
      lipsync: true, lipsync_mode: "amplitude" });
    socket.deliver({ type: "avatar.state", state: "listening", lipsync: false });
    assert.equal(mode(seen), "amplitude");
    // «video» без транспорта кадров — не повод перестраивать экран.
    socket.deliver({ type: "avatar.state", state: "warm", lipsync_mode: "video" });
    assert.equal(mode(seen), "amplitude");
  } finally { transport.close(); }
});

test("кадр старше 250 мс к звучащему звуку не показывается, свежий — показывается", () => {
  const frames = new AvatarFrames();
  frames.push({ generation_id: "g", pts_ms: 0, jpeg: "/9j/2Q==" });
  assert.equal(frames.at(249), "data:image/jpeg;base64,/9j/2Q==");
  assert.equal(frames.at(250), null, "250 мс и старше — уже неправда о губах");
  frames.push({ generation_id: "g", pts_ms: 400, jpeg: "/9j/2Q==" });
  assert.equal(frames.at(420), "data:image/jpeg;base64,/9j/2Q==");
});

test("порог устаревшего кадра задаёт сервер; без него — прежние 250 мс", () => {
  const frames = new AvatarFrames();
  frames.push({ generation_id: "g", pts_ms: 0, jpeg: "/9j/2Q==" });
  assert.ok(frames.at(200), "по умолчанию 200 мс — ещё показываем");
  frames.setStaleMs(100);
  assert.equal(frames.at(120), null, "с порогом 100 мс кадр 120-мс давности не держится");
  frames.setStaleMs("мусор"); frames.setStaleMs(5); frames.setStaleMs(99999);
  frames.push({ generation_id: "g", pts_ms: 200, jpeg: "/9j/2Q==" });
  assert.ok(frames.at(290), "негодные значения порога не приняты — остался 100");
  assert.equal(frames.at(301), null);
});

test("между репликами — лицо сервиса, а не рисованный портрет другого человека", () => {
  const frames = new AvatarFrames();
  assert.equal(frames.at(null, 0), null, "без кадров простоя — как раньше");
  frames.pushIdle("/9j/2Q==", 1000);
  assert.equal(frames.at(null, 1100), "data:image/jpeg;base64,/9j/2Q==");
  frames.push({ generation_id: "g", pts_ms: 0, jpeg: "/9j/AQ==" });
  assert.equal(frames.at(10, 1100), "data:image/jpeg;base64,/9j/AQ==", "в речи — кадр речи");
  assert.equal(frames.at(5000, 1100), "data:image/jpeg;base64,/9j/2Q==", "дыра в речи — лицо в простое");
  frames.clear();
  assert.ok(frames.at(null, 1200), "новая реплика не гасит лицо в простое");
  frames.reset();
  assert.equal(frames.at(null, 1300), null, "возврат к портрету гасит и простой");
  frames.pushIdle("не base64!", 2000);
  assert.equal(frames.at(null, 2000), null);
});

test("транспорт: кадры простоя принимаются, порог — из capabilities, портрет гасит всё", async () => {
  const { transport, socket } = await started({ avatar: { ...VIDEO, stale_ms: 100 } });
  try {
    (transport as any).player = { playbackTimeMs: () => null, beginTurn() {}, stopAll() {},
      dispose: async () => {} };
    socket.deliver({ type: "avatar.frame", idle: true, jpeg: "/9j/2Q==" });
    assert.equal(transport.videoFrame(), "data:image/jpeg;base64,/9j/2Q==", "лицо между репликами видно");
    (transport as any).player.playbackTimeMs = () => 120;
    socket.deliver({ type: "response.output.delta", kind: "text", generation_id: "g", text: "Да" });
    socket.deliver({ type: "avatar.frame", generation_id: "g", pts_ms: 0, jpeg: "/9j/AQ==" });
    assert.equal(transport.videoFrame(), "data:image/jpeg;base64,/9j/2Q==",
      "кадр речи 120-мс давности при пороге 100 не держится — лицо в простое");
    socket.deliver({ type: "avatar.state", state: "listening", lipsync_mode: "amplitude", transport: "local",
      reason: "provider_failed" });
    assert.equal(transport.videoFrame(), null, "после отказа сервиса — только рисованный портрет");
  } finally { transport.close(); }
});

test("живое видео: конец реплики не срезает джиттер-буфер — звук там, где его ждёт сервер", async () => {
  const { AudioPlayer } = await import("../src/realtime/vendor/audio-player");
  class Context {
    static instance: Context;
    state = "running"; sampleRate = 100; currentTime = 8; destination = {};
    starts: number[] = [];
    constructor() { Context.instance = this; }
    createBuffer(_c: number, n: number, rate: number) {
      return { getChannelData: () => new Float32Array(n), duration: n / rate };
    }
    createBufferSource() {
      const ctx = this;
      return { connect() {}, start(at: number) { ctx.starts.push(at); }, stop() {}, disconnect() {}, buffer: null };
    }
  }
  const saved = (globalThis as any).window;
  (globalThis as any).window = { AudioContext: Context };
  const chunk = Buffer.from(new Float32Array([0.1, -0.1, 0, 0]).buffer).toString("base64");
  try {
    const usual = new AudioPlayer({ outputSampleRate: 100, playbackDelayMs: 160 });
    usual.init(); usual.beginTurn(); usual.playChunk(chunk); usual.endTurn();
    assert.equal(Context.instance.starts.length, 1, "без живого видео — как раньше: конец реплики запускает сразу");

    const live = new AudioPlayer({ outputSampleRate: 100, playbackDelayMs: 160 });
    live.holdOnEnd = true;
    live.init(); live.beginTurn(); live.playChunk(chunk); live.endTurn();
    assert.equal(Context.instance.starts.length, 0, "с живым видео звук ждёт свой буфер");
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(Context.instance.starts.length, 1, "и стартует по буферу, а не пропадает");
    await live.dispose(); await usual.dispose();
  } finally { (globalThis as any).window = saved; }
});

test("транспорт: лицо сервиса держит конец реплики в проигрывателе, прежнее лицо — нет", async () => {
  class Context {
    state = "running"; sampleRate = 24000; currentTime = 0; destination = {};
    createBuffer(_c: number, n: number, rate: number) {
      return { getChannelData: () => new Float32Array(n), duration: n / rate };
    }
    createBufferSource() { return { connect() {}, start() {}, stop() {}, disconnect() {}, buffer: null }; }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  const saved = (globalThis as any).window;
  (globalThis as any).window = { AudioContext: Context };
  const LOCAL = { available: true, lipsync: true, lipsync_mode: "amplitude", transport: "local" };
  try {
    for (const [avatar, hold] of [[{ ...VIDEO, stale_ms: 100 }, true], [LOCAL, false]] as const) {
      const { RealtimeTransport } = await import("../src/realtime/transport");
      const transport = new RealtimeTransport(() => {}, () => {}, {});
      transport.send({ type: "start", scenarioId: "supplier", lang: "ru", mode: "practice", layers: { voice: true } } as any);
      await tick();
      const socket = Socket.latest;
      socket.deliver({ type: "session.queue_done" });
      socket.deliver({ type: "session.created", session_id: "s", scenario: { id: "supplier" },
        state: { status: "active", turn: 1 }, greeting: "Добрый день", capabilities: { avatar, speech: true } });
      await tick(); await tick();
      assert.equal((transport as any).player?.holdOnEnd, hold,
        hold ? "с живым видео конец реплики не срезает буфер" : "без живого видео проигрыватель как раньше");
      transport.close();
    }
  } finally { (globalThis as any).window = saved; }
});

test("транспорт: порог устаревшего кадра приходит и с возвратом видео", async () => {
  const { transport, socket } = await started({ avatar: VIDEO });          // порога нет — 250
  try {
    (transport as any).player = { playbackTimeMs: () => 120, beginTurn() {}, stopAll() {},
      dispose: async () => {} };
    socket.deliver({ type: "avatar.state", state: "thinking", lipsync: true, lipsync_mode: "video",
      transport: "jpeg", stale_ms: 100 });
    socket.deliver({ type: "response.output.delta", kind: "text", generation_id: "g", text: "Да" });
    socket.deliver({ type: "avatar.frame", generation_id: "g", pts_ms: 0, jpeg: "/9j/AQ==" });
    assert.equal(transport.videoFrame(), null, "порог 100 мс из состояния лица: кадр 120-мс давности не держится");
  } finally { transport.close(); }
});
