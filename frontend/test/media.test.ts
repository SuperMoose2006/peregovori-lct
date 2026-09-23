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
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

const globalDescriptors = ["navigator", "window", "AudioWorkletNode", "performance"].map(
  (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
);
const urlDescriptors = ["createObjectURL", "revokeObjectURL"].map(
  (key) => [key, Object.getOwnPropertyDescriptor(URL, key)] as const,
);

afterEach(() => {
  for (const [target, descriptors] of [
    [globalThis, globalDescriptors], [URL, urlDescriptors],
  ] as const) {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(target, key, descriptor);
      else Reflect.deleteProperty(target, key);
    }
  }
});

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

interface Grant {
  camera: boolean;
  mic: boolean;
  /** Имя ошибки вместо NotAllowedError — чтобы играть отказы разного рода. */
  as?: string;
  /** Отказ только на СУЖЕННЫЙ запрос: голый `video: true` проходит. */
  onlyConstrained?: boolean;
  /** Что вернёт enumerateDevices. */
  devices?: { kind: string }[];
}

function install(grant: Grant) {
  const asked: string[] = [];
  const g = globalThis as Record<string, unknown>;
  // В Node 25 navigator — getter-only; после теста возвращаем его descriptor.
  Object.defineProperty(g, "navigator", { configurable: true, writable: true, value: {
    mediaDevices: {
      enumerateDevices: async () => grant.devices ?? [],
      getUserMedia: async (c: { video?: unknown; audio?: unknown }) => {
        const wantsVideo = !!c.video;
        const constrained = wantsVideo && typeof c.video === "object";
        asked.push(wantsVideo ? (constrained ? "camera:узко" : "camera:любая") : "mic");
        const ok = wantsVideo ? grant.camera : grant.mic;
        if (!ok || (grant.onlyConstrained && constrained)) {
          const e = new Error("no device"); e.name = grant.as ?? "NotAllowedError"; throw e;
        }
        return new FakeStream([new FakeTrack(wantsVideo ? "video" : "audio")]) as unknown as MediaStream;
      },
    },
  } });
  g.window = { AudioContext: FakeAudioContext, isSecureContext: true };
  g.AudioWorkletNode = FakeWorkletNode;
  // Загрузчик tsx использует new URL при import: сам конструктор нужен настоящий.
  URL.createObjectURL = () => "blob:fake";
  URL.revokeObjectURL = () => {};
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

test("выход во время запроса камеры гасит поздний поток и не запрашивает микрофон", async () => {
  install({ camera: true, mic: true });
  let grant!: (stream: MediaStream) => void;
  const requested: boolean[] = [];
  navigator.mediaDevices.getUserMedia = (constraints) => {
    requested.push(!!constraints?.video);
    return new Promise((resolve) => { grant = resolve; });
  };
  const { MediaProvider } = await load();
  const provider = new MediaProvider();
  const start = provider.start({ camera: true, mic: true });
  await provider.stop();
  const track = new FakeTrack("video");
  grant(new FakeStream([track]) as unknown as MediaStream);
  await start;
  assert.equal(track.stopped, true);
  assert.deepEqual(requested, [true]);
  assert.equal(provider.running, false);
});

test("выход во время запроса микрофона не оставляет поздний аудиопоток живым", async () => {
  install({ camera: false, mic: true });
  let grant!: (stream: MediaStream) => void;
  navigator.mediaDevices.getUserMedia = () => new Promise((resolve) => { grant = resolve; });
  const { MediaProvider } = await load();
  const provider = new MediaProvider();
  const start = provider.start({ camera: false, mic: true });
  await provider.stop();
  const track = new FakeTrack("audio");
  grant(new FakeStream([track]) as unknown as MediaStream);
  await start;
  assert.equal(track.stopped, true);
  assert.equal(provider.running, false);
});

test("узкий запрос отвергнут — камера просится ещё раз, уже без требований", async () => {
  // Живая камера, которая не любит facingMode: первая попытка отвергнута,
  // вторая обязана пройти. Человек, нажавший «разрешить», обязан получить
  // картинку, а не «устройство не найдено».
  const asked = install({ camera: true, mic: false, as: "NotFoundError", onlyConstrained: true,
                          devices: [{ kind: "videoinput" }] });
  const { MediaProvider } = await load();
  const p = new MediaProvider();
  const report = await p.start({ camera: true, mic: false });
  assert.equal(report.camera, "ok", "вторая попытка без требований обязана поднять камеру");
  assert.deepEqual(asked, ["camera:узко", "camera:любая"], "ровно две попытки, вторая — голая");
  await p.stop();
});

test("отказ пользователя НЕ переспрашивают вторым запросом", async () => {
  const asked = install({ camera: false, mic: false, as: "NotAllowedError",
                          devices: [{ kind: "videoinput" }] });
  const { MediaProvider } = await load();
  const p = new MediaProvider();
  const report = await p.start({ camera: true, mic: false });
  assert.match(String(report.camera), /не разрешён/);
  assert.equal(asked.length, 1, "второй запрос был бы повторным вопросом там, где человек сказал «нет»");
  await p.stop();
});

test("«не найдено» договаривает: камеры нет вовсе или она занята", async () => {
  const { MediaProvider } = await load();

  install({ camera: false, mic: false, as: "NotFoundError", devices: [] });
  let report = await new MediaProvider().start({ camera: true, mic: false });
  assert.match(String(report.camera), /камер в системе нет/,
    "пустой список — говорим прямо, что подключать нечего");

  install({ camera: false, mic: false, as: "NotFoundError",
            devices: [{ kind: "videoinput" }, { kind: "videoinput" }] });
  report = await new MediaProvider().start({ camera: true, mic: false });
  assert.match(String(report.camera), /в системе: 2/,
    "камеры есть — значит дело не в их отсутствии, и об этом обязана быть строка");
  assert.match(String(report.camera), /занято другой программой/);
});

// --- сколько кадров уходит наружу -----------------------------------------
//
// ЧТО ЗДЕСЬ МЕРИТСЯ И ПОЧЕМУ ЭТО ДЕНЬГИ. Клиент снимает кадр раз в секунду.
// Раньше каждый снятый кадр уходил на сервер безусловно: пятиминутная партия
// выгружала около трёхсот кадров (≈4.5 МБ), из которых сервер смотрел в лучшем
// случае тридцать восемь, а в неподвижной комнате — один. Остальные проезжали
// сокет, чтобы быть выброшенными по порогу, который браузер УЖЕ ПОСЧИТАЛ у себя:
// доля изменившихся проб яркости считается здесь, в canvas, и едет вместе с
// кадром.
//
// Теперь неизменившийся кадр не едет вовсе, а такт heartbeat зеркалит серверный
// интервал взгляда. Число обращений к модели от этого не меняется — меняется
// только трафик, и проверяется здесь именно это.

/** Экран, который можно заставить измениться. */
function screen() {
  let level = 10;
  const w = 320, h = 240;
  const data = new Uint8ClampedArray(w * h * 4);
  const paint = () => data.fill(level);
  paint();
  return {
    w, h,
    move(to: number) { level = to; paint(); },
    ctx2d: {
      drawImage() { /* уже нарисовано */ },
      getImageData: () => ({ data }),
    },
  };
}

function installClock() {
  const g = globalThis as Record<string, unknown>;
  const clock = { t: 0 };
  g.performance = { now: () => clock.t };
  return clock;
}

test("неизменившийся кадр наружу не едет — за него платят зря", async () => {
  install({ camera: true, mic: false });
  const clock = installClock();
  const s = screen();
  const { MediaProvider, SEND_HEARTBEAT_MS } = await load();

  const video = { videoWidth: s.w, videoHeight: s.h, srcObject: null as unknown,
                  play: async () => {} };
  const canvas = { width: 0, height: 0, getContext: () => s.ctx2d,
                   toDataURL: () => "data:image/jpeg;base64,ZZZZ" };
  const p = new MediaProvider({
    video: video as unknown as HTMLVideoElement,
    canvas: canvas as unknown as HTMLCanvasElement,
    frameIntervalMs: 1000,
  });
  const sent: string[] = [];
  p.onFrame = (f) => sent.push(f);
  await p.start({ camera: true, mic: false });

  // Пять минут неподвижной комнаты при такте «кадр в секунду».
  for (let i = 0; i < 300; i++) {
    clock.t += 1000;
    // Таймер провайдера в тестовой среде не тикает — дёргаем тот же путь руками.
    const f = (p as unknown as { grabFrame(): string | null }).grabFrame();
    if (f) p.onFrame?.(f);
  }

  const heartbeats = Math.floor(300_000 / SEND_HEARTBEAT_MS) + 1;
  assert.ok(sent.length <= heartbeats,
            `в неподвижной комнате ушло ${sent.length} кадров вместо ${heartbeats}`);
  assert.ok(sent.length >= 2,
            "молчащий транспорт неотличим от сломанной камеры: такт обязан быть");
  await p.stop();
});

test("изменившийся кадр едет сразу — экономия не имеет права съесть событие", async () => {
  install({ camera: true, mic: false });
  const clock = installClock();
  const s = screen();
  const { MediaProvider } = await load();

  const video = { videoWidth: s.w, videoHeight: s.h, srcObject: null as unknown,
                  play: async () => {} };
  const canvas = { width: 0, height: 0, getContext: () => s.ctx2d,
                   toDataURL: () => "data:image/jpeg;base64,ZZZZ" };
  const p = new MediaProvider({
    video: video as unknown as HTMLVideoElement,
    canvas: canvas as unknown as HTMLCanvasElement,
    frameIntervalMs: 1000,
  });
  const grab = () => (p as unknown as { grabFrame(): string | null }).grabFrame();
  await p.start({ camera: true, mic: false });

  clock.t += 1000;
  assert.ok(grab(), "первый кадр обязан уйти безусловно — с него начинается взгляд");
  clock.t += 1000;
  assert.equal(grab(), null, "комната не изменилась, а кадр всё равно уехал");
  s.move(200);                                   // человек вошёл в кадр
  clock.t += 1000;
  assert.ok(grab(), "кадр изменился, а наружу не поехал — событие потеряно");
  await p.stop();
});
