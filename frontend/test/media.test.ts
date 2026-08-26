// media.test.ts — микрофон и камера обязаны падать ПОРОЗНЬ и говорить об этом.
//
// Что проверяется и почему это важнее, чем кажется. Слои включаются на экране
// подготовки поодиночке, но поднимались одним методом подряд: сначала камера,
// потом микрофон. Отказ камеры выбрасывал исключение ДО микрофона, поэтому
// человек, разрешивший микрофон и запретивший камеру, оставался без обоих — и
// ни одна строка на экране об этом не сообщала. Это ровно то четвёртое
// состояние, которого в продукте не бывает: «выглядит настоящим, а внутри
// пусто» (CLAUDE.md, принцип 2).
//
// Поэтому `start()` больше не бросает на отказ устройства. Он возвращает отчёт
// по каждому слою отдельно, а звать виновника по имени обязан вызывающий.
import test from "node:test";
import assert from "node:assert/strict";

// --- минимальный браузер --------------------------------------------------
// Не jsdom: нужен ровно тот кусок Web Audio, который трогает провайдер, и
// подделка должна быть видимой глазом, а не чёрным ящиком.
class FakeTrack {
  stopped = false;
  constructor(readonly kind: string) {}
  stop() { this.stopped = true; }
}
class FakeStream {
  constructor(private tracks: FakeTrack[]) {}
  getTracks() { return this.tracks; }
}
class FakeNode { connect() { /* граф не считаем */ } disconnect() {} }
class FakeWorkletNode extends FakeNode {
  port = { onmessage: null as unknown, postMessage() {} };
  constructor(_ctx: unknown, _name: string, _opts: unknown) { super(); }
}
class FakeAudioContext {
  state = "running";
  destination = new FakeNode();
  audioWorklet = { addModule: async () => {} };
  constructor(_o: unknown) {}
  createMediaStreamSource() { return new FakeNode(); }
  createAnalyser() { return { fftSize: 0, frequencyBinCount: 8, getByteTimeDomainData() {}, connect() {}, disconnect() {} }; }
  createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
  async close() { this.state = "closed"; }
}

function install(grant: { camera: boolean; mic: boolean }) {
  const asked: string[] = [];
  const g = globalThis as Record<string, unknown>;
  g.navigator = {
    mediaDevices: {
      getUserMedia: async (c: { video?: unknown; audio?: unknown }) => {
        const wantsVideo = !!c.video;
        asked.push(wantsVideo ? "camera" : "mic");
        const ok = wantsVideo ? grant.camera : grant.mic;
        if (!ok) { const e = new Error("Permission denied"); e.name = "NotAllowedError"; throw e; }
        return new FakeStream([new FakeTrack(wantsVideo ? "video" : "audio")]) as unknown as MediaStream;
      },
    },
  };
  g.window = { AudioContext: FakeAudioContext, isSecureContext: true };
  g.AudioWorkletNode = FakeWorkletNode;
  g.URL = { createObjectURL: () => "blob:fake", revokeObjectURL: () => {} };
  return asked;
}

async function load() {
  return await import("../src/realtime/vendor/media-provider.ts");
}

test("отказ камеры не уносит с собой микрофон", async () => {
  const asked = install({ camera: false, mic: true });
  const { MediaProvider } = await load();
  const p = new MediaProvider();
  const report = await p.start({ camera: true, mic: true });

  assert.equal(report.mic, "ok", "микрофон разрешён — обязан подняться");
  assert.notEqual(report.camera, "ok", "камера запрещена — так и записано");
  assert.match(String(report.camera), /не разрешён/);
  assert.ok(asked.includes("mic"), "у микрофона обязаны были спросить, несмотря на отказ камеры");
  await p.stop();
});

test("отказ микрофона не уносит с собой камеру", async () => {
  install({ camera: true, mic: false });
  const { MediaProvider } = await load();
  const p = new MediaProvider();
  const report = await p.start({ camera: true, mic: true });

  assert.equal(report.camera, "ok", "камера разрешена — обязана работать одна");
  assert.notEqual(report.mic, "ok");
  await p.stop();
});

test("выключенный слой в отчёте — «off», а не ошибка", async () => {
  install({ camera: true, mic: true });
  const { MediaProvider } = await load();
  const p = new MediaProvider();
  const report = await p.start({ camera: false, mic: true });
  assert.equal(report.camera, "off");
  assert.equal(report.mic, "ok");
  await p.stop();
});

test("stop() гасит дорожки обоих устройств — иначе горит лампочка камеры", async () => {
  install({ camera: true, mic: true });
  const { MediaProvider } = await load();
  const p = new MediaProvider();
  await p.start({ camera: true, mic: true });
  const tracks: FakeTrack[] = [];
  for (const key of ["audioStream", "videoStream"] as const) {
    const s = (p as unknown as Record<string, FakeStream | null>)[key];
    if (s) tracks.push(...(s.getTracks() as unknown as FakeTrack[]));
  }
  assert.equal(tracks.length, 2, "оба потока обязаны существовать");
  await p.stop();
  assert.ok(tracks.every((t) => t.stopped), "после stop() ни одна дорожка не осталась живой");
});
