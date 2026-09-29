// deviceCheck.test.ts — камера и микрофон проверяются В МОМЕНТ ВКЛЮЧЕНИЯ СЛОЯ.
//
// Раньше доступ спрашивался только при старте партии: отказ, отсутствие
// устройства или камера, занятая видеозвонком, выяснялись посреди переговоров.
// Здесь держится: нажатие спрашивает устройство сразу; поток тут же закрыт;
// ответ назван словами; не выданное устройство не оставляет тумблер
// «включённым»; слой, недоступный по серверу или без связи, не спрашивается вовсе.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { checkDevice, classifyMediaError, requestLayers, type DeviceCheck, type DeviceLayer } from "../src/lib/deviceCheck";
import { NO_LAYERS, NO_SERVER_REASON, withServer, type LayerId, type LayerState } from "../src/lib/layers";
import { LayersPanel } from "../src/components/Setup";
import { I18N } from "../src/i18n";

const SRC = new URL("../src/", import.meta.url).pathname;
const ru = I18N.ru;
const err = (name: string) => Object.assign(new Error(name), { name });

/** Поддельные медиаустройства: считают запросы и остановленные дорожки. */
function fakeMedia(result: "ok" | string) {
  const calls: MediaStreamConstraints[] = [];
  let stopped = 0;
  const tracks = [{ stop: () => { stopped++; } }, { stop: () => { stopped++; } }];
  return {
    calls, stopped: () => stopped,
    media: {
      getUserMedia: async (c: MediaStreamConstraints) => {
        calls.push(c);
        if (result !== "ok") throw err(result);
        return { getTracks: () => tracks } as unknown as MediaStream;
      },
    },
  };
}

const ok = (id: LayerId): LayerState => ({ id, available: true, reason: null });
const READY: Record<LayerId, LayerState> = {
  probe: ok("probe"), voice: ok("voice"), camera: ok("camera"), avatar: ok("avatar"), pokerface: ok("pokerface"),
};

// ---- Сам запрос ------------------------------------------------------------------

test("доступ выдан — поток закрыт тут же, камера не остаётся гореть", async () => {
  const f = fakeMedia("ok");
  assert.equal(await checkDevice("camera", f.media), "granted");
  assert.equal(f.stopped(), 2, "каждая дорожка остановлена");
  assert.deepEqual(f.calls, [{ video: true, audio: false }], "камера — без микрофона и без требований к кадру");
  const m = fakeMedia("ok");
  await checkDevice("voice", m.media);
  assert.deepEqual(m.calls, [{ audio: true, video: false }], "голос спрашивает микрофон, не камеру");
});

test("отказ, нет устройства, занято — разные ответы, а не одно «не удалось»", async () => {
  assert.equal(await checkDevice("camera", fakeMedia("NotAllowedError").media), "denied");
  assert.equal(await checkDevice("camera", fakeMedia("NotFoundError").media), "missing");
  assert.equal(await checkDevice("camera", fakeMedia("NotReadableError").media), "busy");
  assert.equal(await checkDevice("camera", fakeMedia("TypeError").media), "failed");
  assert.equal(classifyMediaError(err("SecurityError")), "denied");
  assert.equal(classifyMediaError(err("OverconstrainedError")), "missing");
});

// ---- Что становится с тумблером --------------------------------------------------

const answer = (r: Partial<Record<DeviceLayer, DeviceCheck>>) => {
  const asked: DeviceLayer[] = [];
  return { asked, check: async (l: DeviceLayer) => { asked.push(l); return r[l] ?? "granted"; } };
};

test("камеру дали — слой включён; не дали — тумблер остаётся выключенным", async () => {
  const yes = answer({ camera: "granted" });
  const on = await requestLayers(NO_LAYERS, { ...NO_LAYERS, camera: true }, READY, yes.check);
  assert.equal(on.layers.camera, true);
  assert.equal(on.checks.camera, "granted");
  const no = answer({ camera: "denied" });
  const off = await requestLayers(NO_LAYERS, { ...NO_LAYERS, camera: true, pokerface: true }, READY, no.check);
  assert.equal(off.layers.camera, false, "отказ не выглядит как «включено»");
  assert.equal(off.layers.pokerface, false, "покерфейс без камеры гаснет вместе с ней");
  assert.equal(off.checks.camera, "denied");
});

test("микрофон проверяется так же; пресет с двумя устройствами спрашивает оба", async () => {
  const a = answer({ voice: "busy", camera: "granted" });
  const r = await requestLayers(NO_LAYERS, { ...NO_LAYERS, voice: true, camera: true, avatar: true }, READY, a.check);
  assert.deepEqual(a.asked.sort(), ["camera", "voice"]);
  assert.equal(r.layers.voice, false);
  assert.equal(r.layers.camera, true);
  assert.equal(r.layers.avatar, true, "слои без устройств включаются без вопросов");
});

test("спрашивается только то, что включают сейчас: выключение и уже включённое — без запроса", async () => {
  const a = answer({});
  await requestLayers({ ...NO_LAYERS, camera: true }, { ...NO_LAYERS, camera: true, probe: true }, READY, a.check);
  await requestLayers({ ...NO_LAYERS, voice: true }, NO_LAYERS, READY, a.check);
  assert.deepEqual(a.asked, []);
});

test("слой недоступен по серверу или без связи — устройство не спрашивается вовсе", async () => {
  const a = answer({});
  const offline = withServer(READY, "offline");
  const r = await requestLayers(NO_LAYERS, { ...NO_LAYERS, voice: true, camera: true }, offline, a.check);
  assert.deepEqual(a.asked, [], "без связи просить камеру незачем");
  assert.equal(r.layers.camera, false);
  const noVision = withServer(READY, { cloud_ai: false, voice: "classic: parakeet" });
  await requestLayers(NO_LAYERS, { ...NO_LAYERS, camera: true }, noVision, a.check);
  assert.deepEqual(a.asked, [], "сервер без зрения — камеру не спрашиваем");
  assert.deepEqual(offline.camera.reason, NO_SERVER_REASON, "серверная причина осталась своей");
});

// ---- Что видит человек ------------------------------------------------------------------

const panel = (checks: Parameters<typeof LayersPanel>[0]["checks"], layers = NO_LAYERS) =>
  renderToStaticMarkup(createElement(LayersPanel, {
    t: ru, lang: "ru" as const, layers, states: READY, onToggle: () => {}, onPreset: () => {}, checks,
  }));

test("ответ устройства написан рядом с тумблером — и отказ говорит, как выдать доступ потом", () => {
  const denied = panel({ camera: "denied" });
  assert.ok(denied.includes(ru.layers.check.camera.denied));
  assert.match(ru.layers.check.camera.denied, /настройках сайта/);
  assert.match(denied, /class="ly-check denied" role="status"/);
  assert.ok(panel({ voice: "granted" }, { ...NO_LAYERS, voice: true }).includes(ru.layers.check.voice.granted));
  assert.ok(panel({ camera: "busy" }).includes(ru.layers.check.camera.busy));
  assert.ok(panel({ camera: "missing" }).includes(ru.layers.check.camera.missing));
});

test("пока браузер спрашивает, тумблер заперт — второго окна подряд не будет", () => {
  const html = panel({ camera: "checking" });
  const at = html.indexOf(`aria-label="${ru.layers.names.camera}"`);
  const tag = html.slice(html.lastIndexOf("<button", at), html.indexOf(">", at));
  assert.match(tag, /aria-disabled="true"/);
  assert.ok(html.includes(ru.layers.check.camera.checking));
});

test("подпись под тумблером обещает проверку при включении, а не посреди партии", () => {
  for (const lang of ["ru", "en"] as const) {
    for (const id of ["voice", "camera"] as const) {
      assert.doesNotMatch(I18N[lang].layers.needs[id], /начнётся партия|game starts/, `${lang}/${id}`);
    }
  }
  const app = readFileSync(join(SRC, "App.tsx"), "utf8");
  assert.match(app, /onToggle=\{\(id\) => chooseLayers\(layerPrefs,/, "профиль включает слой в обход проверки");
  assert.match(app, /onToggle=\{\(id\) => chooseLayers\(activeLayers,/, "шторка за столом включает слой в обход проверки");
});
