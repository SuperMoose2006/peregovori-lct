import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { RealtimeSession, HANDSHAKE_TIMEOUT_MS } from "../src/realtime/vendor/realtime-session";

class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: ((e: unknown) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((e: unknown) => void) | null = null;
  constructor() {
    FakeSocket.instances.push(this);
    queueMicrotask(() => { this.readyState = 1; this.onopen?.({}); });
  }
  send(data: string) { if (this.readyState !== 1) throw new Error("closed"); this.sent.push(data); }
  close() { this.readyState = 3; }
  deliver(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }); }
  shut() { this.readyState = 3; this.onclose?.({ code: 1006 }); }
}

const descriptor = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");
const sessions: RealtimeSession[] = [];
afterEach(() => {
  sessions.splice(0).forEach((s) => s.stop());
  if (descriptor) Object.defineProperty(globalThis, "WebSocket", descriptor);
  else Reflect.deleteProperty(globalThis, "WebSocket");
});
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function setup(url: string | (() => Promise<string>) = "ws://example.test", onResume = (_created: unknown) => {}) {
  Object.defineProperty(globalThis, "WebSocket", { configurable: true, writable: true, value: FakeSocket });
  FakeSocket.instances = [];
  const statuses: string[] = [];
  const session = new RealtimeSession({ url, onEvent() {}, onResume, onStatus: (s) => statuses.push(s) });
  sessions.push(session);
  return { session, statuses };
}

test("close after WebSocket open rejects the unfinished handshake", async () => {
  const { session } = setup();
  const started = session.start({ scenarioId: "supplier", lang: "en" });
  const rejected = assert.rejects(started, /closed before/);
  await flush();
  FakeSocket.instances[0].shut();
  await rejected;
  assert.equal(session.running, false);
  assert.equal(session.sendText("lost draft"), false);
});

test("a silent handshake has a deadline and closes the abandoned socket", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { session } = setup();
  const started = session.start({ scenarioId: "supplier", lang: "en" });
  const rejected = assert.rejects(started, /did not start in time/);
  await flush();
  t.mock.timers.tick(HANDSHAKE_TIMEOUT_MS + 1);
  await rejected;
  assert.equal(FakeSocket.instances[0].readyState, 3);
  assert.equal(session.running, false);
});

test("stop during URL resolution prevents a late socket from reopening the session", async () => {
  let resolve!: (url: string) => void;
  const { session } = setup(() => new Promise((r) => { resolve = r; }));
  const started = session.start({ lang: "en" });
  const rejected = assert.rejects(started, /cancelled/);
  await flush();
  session.stop();
  await rejected;
  resolve("ws://example.test");
  await flush();
  assert.equal(FakeSocket.instances.length, 0);
});

test("stop during init cancels pending timers and detaches late messages", async () => {
  const { session } = setup();
  const started = session.start({ lang: "en" });
  const rejected = assert.rejects(started, /cancelled/);
  await flush();
  const socket = FakeSocket.instances[0];
  session.stop();
  await rejected;
  socket.deliver({ type: "session.created", session_id: "too-late" });
  assert.equal(session.running, false);
  assert.equal(socket.onmessage, null);
});

test("an explicit resume publishes the recovered snapshot and only then accepts moves", async () => {
  const recovered: unknown[] = [];
  const { session } = setup("ws://example.test", (created) => recovered.push(created));
  const started = session.start({ lang: "en", resume: "existing" });
  assert.equal(session.sendText("too early"), false);
  await flush();
  const created = { type: "session.created", session_id: "existing", state: { turn: 4 } };
  const socket = FakeSocket.instances[0];
  socket.deliver({ type: "session.queue_done" });
  socket.deliver(created);
  await started;
  assert.deepEqual(recovered, [created]);
  assert.equal(session.sendText("next move"), true);
  assert.deepEqual(socket.sent.map((s) => JSON.parse(s).type), ["session.init", "input.append", "input.commit"]);
});
