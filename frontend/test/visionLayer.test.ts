// visionLayer.test.ts — четвёртого состояния у камеры не бывает и на клиенте.
//
// ЧТО ЗДЕСЬ ЛОВИТСЯ. Сервер честно отвечает в `session.created.capabilities`,
// поднялся ли слой камеры: без ключа модели зрения `camera` приходит `false`, и
// сэмплер на сервере не создаётся вовсе. Клиент это поле НЕ ЧИТАЛ НИГДЕ. Из-за
// этого партия без облачного зрения выглядела ровно как рабочая: браузер
// спрашивал доступ к камере, поток открывался, кадр уходил раз в секунду, чип за
// столом горел «кадры идут». Всё это — настоящие признаки, и ни один из них не
// доказывает того, что человек по ним читал.
//
// Открытый поток не доказывает зрения — он бывает открыт, когда кадры никуда не
// идут; это уже чинили. Ушедший кадр тоже не доказывает — он уходит и в мёртвый
// слой. Доказывает только ответ модели, а его в этом состоянии нет и не будет.
//
// Поэтому слой, который сервер не поднял, называется поимённо И НЕ ОТКРЫВАЕТСЯ:
// просить у человека камеру ради кадров, на которые никто не посмотрит, — это
// разрешение, взятое ни за чем, плюс мегабайты наружу.
import test from "node:test";
import assert from "node:assert/strict";

import type { ServerMsg } from "../src/types";
import { SERVER_SIDE_REASON } from "../src/lib/layers";

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
    queueMicrotask(() => { this.readyState = FakeSocket.OPEN; this.onopen?.({}); });
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

/** Сколько раз у браузера вообще спросили устройство. */
let asked: string[] = [];

function installMedia() {
  asked = [];
  g.navigator = {
    mediaDevices: {
      enumerateDevices: async () => [{ kind: "videoinput" }],
      getUserMedia: async (c: { video?: unknown }) => {
        asked.push(c.video ? "camera" : "mic");
        return { getTracks: () => [{ stop() {} }] } as unknown as MediaStream;
      },
    },
  };
  g.window = { isSecureContext: true };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run(capabilities: Record<string, unknown>): Promise<ServerMsg[]> {
  // Транспорт держит таймеры и поток камеры; без `close()` процесс теста не
  // завершится, и молчаливое зависание выглядело бы как медленный набор.
  const { RealtimeTransport } = await import("../src/realtime/transport");
  FakeSocket.instances = [];
  installMedia();

  const seen: ServerMsg[] = [];
  const t = new RealtimeTransport((m) => seen.push(m), () => {});
  t.send({ type: "start", scenarioId: "supplier", lang: "ru", mode: "practice",
           layers: { camera: true, pokerface: true } } as never);

  await wait(0);
  const socket = FakeSocket.instances[FakeSocket.instances.length - 1];
  socket.deliver({ type: "session.queue_done" });
  socket.deliver({
    type: "session.created", session_id: "sess", scenario: { id: "supplier" },
    state: {}, greeting: "Здравствуйте.", capabilities,
  });
  await wait(20);
  t.close();
  await wait(10);
  return seen;
}

test("сервер без облачного зрения — слой назван, и камеру не открывают вовсе", async () => {
  const seen = await run({ camera: false, pokerface: false });

  const failed = seen.find((m) => m.type === "layer_failed");
  assert.ok(failed, "камера не поднялась, а на столе об этом ни строчки");
  assert.equal((failed as { layer: string }).layer, "camera");
  assert.equal((failed as { reason: string }).reason, SERVER_SIDE_REASON.camera.ru);
  assert.deepEqual(asked, [],
                   "у человека спросили камеру ради кадров, которые никто не посмотрит");
});

test("сервер со зрением — камера открывается, лишних слов нет", async () => {
  const seen = await run({ camera: true, pokerface: true });

  assert.equal(seen.find((m) => m.type === "layer_failed"), undefined,
               "рабочий слой объявлен сломанным");
  assert.deepEqual(asked, ["camera"], "слой поднят, а камеру не спросили");
});

test("«покерфейс» отдельной строки не получает — он считает кадры той же камеры", async () => {
  const seen = await run({ camera: false, pokerface: false });
  const failures = seen.filter((m) => m.type === "layer_failed");
  assert.equal(failures.length, 1, "одна причина обязана объяснять оба тумблера");
});
