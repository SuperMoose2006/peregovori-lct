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
    (transport as any).player = { playbackTimeMs: () => 100, beginTurn() {}, stopAll() {},
      dispose: async () => {} };
    socket.deliver({ type: "response.output.delta", kind: "text", generation_id: "g", text: "Да" });
    socket.deliver({ type: "avatar.frame", generation_id: "g", pts_ms: 90, jpeg: "/9j/2Q==" });
    assert.ok(transport.videoFrame(), "кадр сервиса на экране");
    socket.deliver({ type: "avatar.state", state: "listening", lipsync: true,
      lipsync_mode: "amplitude", transport: "local", reason: "provider_failed", detail: "closed" });
    assert.equal(mode(seen), "amplitude");
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
