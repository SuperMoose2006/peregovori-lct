// layersMatrix.test.ts — правило слоёв на ВСЕХ входах, а не на трёх примерах.
//
// `layers.test.ts` держит правило примерами: экзамен, кампания, своя сделка,
// капстоун, одна «пустая» среда. Этого хватает, пока правило не тронули. Но
// тумблеров пять, режимов на проводе пять (капстоун — `drill`, его в примерах
// нет), а сред три — и сбой в любой клетке значит одно из двух: либо слой в
// партии на зачёт (принцип 3: грейд перестаёт быть сравним), либо «покерфейс»,
// считающий кадры камеры, которой нет (принцип 2: четвёртое состояние).
//
// Второе, чего не проверял никто, — сам `detectLayers` в настоящей браузерной
// среде. В node нет ни `navigator.mediaDevices`, ни `window`, поэтому прежние
// тесты видели только «устройств нет». Здесь среда подменяется явно.
import test from "node:test";
import assert from "node:assert/strict";

import {
  NO_LAYERS, detectLayers, pruneLayers, reasonText, sessionLayers,
  type LayerId, type LayerState, type Layers,
} from "../src/lib/layers";
import { REPRODUCIBLE_MODES } from "../src/lib/modes";
import type { Mode } from "../src/types";

const IDS = Object.keys(NO_LAYERS) as LayerId[];
const DEVICE: LayerId[] = ["voice", "camera", "pokerface"];
const MODES: Mode[] = ["practice", "campaign", "custom", "exam", "drill"];

type Env = "secure" | "insecure" | "no-media";

/** Выполнить `fn` в подменённой браузерной среде и вернуть всё как было. */
function inBrowser<T>(env: Env, fn: () => T): T {
  const g = globalThis as Record<string, unknown>;
  const navDesc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const winDesc = Object.getOwnPropertyDescriptor(globalThis, "window");
  const media = env === "no-media" ? {} : { mediaDevices: { getUserMedia: async () => ({}) } };
  Object.defineProperty(globalThis, "navigator", { value: media, configurable: true, writable: true });
  g.window = { isSecureContext: env !== "insecure" };
  try {
    return fn();
  } finally {
    if (navDesc) Object.defineProperty(globalThis, "navigator", navDesc);
    else Reflect.deleteProperty(globalThis, "navigator");
    if (winDesc) Object.defineProperty(globalThis, "window", winDesc);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

const ENVS: Record<Env, Record<LayerId, LayerState>> = {
  secure: inBrowser("secure", detectLayers),
  insecure: inBrowser("insecure", detectLayers),
  "no-media": inBrowser("no-media", detectLayers),
};

/** Все 32 сочетания пяти тумблеров. */
const ALL_WANTS: Layers[] = Array.from({ length: 1 << IDS.length }, (_, bits) =>
  Object.fromEntries(IDS.map((id, i) => [id, !!(bits & (1 << i))])) as Layers);

// ---------------------------------------------------------------------------
// 1. Что умеет среда
// ---------------------------------------------------------------------------

test("https и getUserMedia — устройства доступны и причина не рисуется", () => {
  for (const id of DEVICE) {
    assert.equal(ENVS.secure[id].available, true, id);
    assert.equal(ENVS.secure[id].reason, null, `${id}: причина под доступным слоем`);
    assert.equal(reasonText(ENVS.secure[id], "ru"), "");
  }
});

test("небезопасный контекст и браузер без getUserMedia — устройства недоступны и сказано почему", () => {
  // Браузер не отдаст поток по http с чужого хоста. Переключатель, который
  // «включается» и ничего не делает, — ровно то, чего в продукте не бывает.
  for (const env of ["insecure", "no-media"] as const) {
    for (const id of DEVICE) {
      const s = ENVS[env][id];
      assert.equal(s.available, false, `${env}/${id}`);
      assert.ok(s.reason, `${env}/${id}: недоступно без объяснения`);
      const ru = reasonText(s, "ru"), en = reasonText(s, "en");
      assert.ok(/[а-яё]/i.test(ru), `${env}/${id}: русская причина не по-русски`);
      assert.ok(en.length > 10 && !/[а-яё]/i.test(en), `${env}/${id}: английская причина «${en}»`);
    }
  }
});

test("вопрос по лицу и лицо оппонента не зависят от устройств и сети", () => {
  // Инвариант 5: без сети и без камеры продукт полностью играбелен.
  for (const env of Object.keys(ENVS) as Env[]) {
    for (const id of ["probe", "avatar"] as const) {
      assert.equal(ENVS[env][id].available, true, `${env}/${id}`);
      assert.equal(ENVS[env][id].reason, null, `${env}/${id}`);
    }
  }
});

test("проба среды не оставляет следов в глобальном объекте", () => {
  // Подмена `navigator` выше обязана откатиться, иначе соседние проверки этого
  // файла тихо шли бы уже в «браузере».
  assert.equal(typeof (globalThis as Record<string, unknown>).window, "undefined");
  assert.equal(detectLayers().camera.available, false);
});

// ---------------------------------------------------------------------------
// 2. Правило целиком: 32 выбора × 3 среды × 5 режимов × капстоун
// ---------------------------------------------------------------------------

test("ни в одной клетке «покерфейс» не переживает свою камеру", () => {
  const bad: string[] = [];
  for (const [env, have] of Object.entries(ENVS)) {
    for (const want of ALL_WANTS) {
      const pruned = pruneLayers(want, have);
      if (pruned.pokerface && !pruned.camera) bad.push(`prune ${env} ${JSON.stringify(want)}`);
      for (const mode of MODES) {
        for (const fixedOff of [false, true]) {
          const got = sessionLayers(mode, want, have, fixedOff);
          if (got.pokerface && !got.camera) bad.push(`${mode}${fixedOff ? "+fixed" : ""} ${env} ${JSON.stringify(want)}`);
        }
      }
    }
  }
  assert.deepEqual(bad, []);
});

test("слой не включается сам и не включается там, где его нет", () => {
  const bad: string[] = [];
  for (const [env, have] of Object.entries(ENVS)) {
    for (const want of ALL_WANTS) {
      const got = pruneLayers(want, have);
      assert.deepEqual(Object.keys(got).sort(), [...IDS].sort(), "выпал или прибавился ключ слоя");
      for (const id of IDS) {
        if (got[id] && !want[id]) bad.push(`${env}: ${id} включился без просьбы`);
        if (got[id] && !have[id].available) bad.push(`${env}: ${id} включён, а среда его не даёт`);
        // И обратное: доступное и выбранное не теряется. Исключение одно —
        // «покерфейс» без камеры, его гасит правило выше.
        const expected = want[id] && have[id].available && (id !== "pokerface" || want.camera);
        if (got[id] !== expected) bad.push(`${env}: ${id} ${JSON.stringify(want)} → ${got[id]}`);
      }
    }
  }
  assert.deepEqual(bad, [], bad.slice(0, 10).join("\n"));
});

test("всё, кроме тренировки, и любой капстоун идут без единого слоя", () => {
  // Принцип 3. `drill` — капстоун курса на проводе: экзамен по сути, и в
  // примерах `layers.test.ts` его нет вовсе.
  for (const [env, have] of Object.entries(ENVS)) {
    for (const want of ALL_WANTS) {
      for (const mode of MODES) {
        for (const fixedOff of [false, true]) {
          if (mode === "practice" && !fixedOff) continue;
          assert.deepEqual(sessionLayers(mode, want, have, fixedOff), NO_LAYERS,
            `${mode}${fixedOff ? " (капстоун)" : ""} в среде ${env} получил слои ${JSON.stringify(want)}`);
        }
      }
    }
  }
});

test("каждый зачётный режим из общего списка идёт без слоёв", () => {
  // Список зачётных режимов живёт в lib/modes.ts и сверяется с сервером
  // (graded-run.test.ts). Новый зачётный режим обязан гасить слои сразу, без
  // отдельной правки здесь.
  assert.ok(REPRODUCIBLE_MODES.length > 0);
  for (const mode of REPRODUCIBLE_MODES) {
    assert.deepEqual(sessionLayers(mode, { ...NO_LAYERS, probe: true, avatar: true, camera: true },
                                   ENVS.secure), NO_LAYERS, mode);
  }
});

test("тренировка в полноценной среде получает ровно выбранное", () => {
  for (const want of ALL_WANTS) {
    const got = sessionLayers("practice", want, ENVS.secure);
    assert.deepEqual(got, { ...want, pokerface: want.pokerface && want.camera }, JSON.stringify(want));
  }
});
