// Слои честны в обе стороны: включённый обязан что-то делать, а невозможный —
// сказать «недоступно», а не притвориться. Этот файл держит вторую половину.
import test from "node:test";
import assert from "node:assert/strict";
import { NO_LAYERS, PRESETS, pruneLayers, sessionLayers, detectLayers, type Layers } from "../src/lib/layers";

const ON: Layers = { probe: true, voice: true, camera: true, avatar: true, pokerface: true };

/** Окружение без getUserMedia — то же, что открытая по http страница. */
const noMedia = () => ({
  probe: { id: "probe" as const, available: true, reason: null },
  voice: { id: "voice" as const, available: false, reason: { ru: "нет", en: "no" } },
  camera: { id: "camera" as const, available: false, reason: { ru: "нет", en: "no" } },
  avatar: { id: "avatar" as const, available: true, reason: null },
  pokerface: { id: "pokerface" as const, available: false, reason: { ru: "нет", en: "no" } },
});

test("покерфейс без камеры гаснет: считать нечего", () => {
  const have = detectLayers();
  const want = { ...NO_LAYERS, pokerface: true };
  assert.equal(pruneLayers(want, have).pokerface, false);
});

test("покерфейс с камерой доживает до партии, если среда даёт камеру", () => {
  const have = detectLayers();
  const got = pruneLayers({ ...NO_LAYERS, camera: true, pokerface: true }, have);
  assert.equal(got.pokerface, got.camera, "тумблер не должен пережить свою камеру");
});

test("недоступная среда гасит всё, что требует устройств", () => {
  const got = pruneLayers(ON, noMedia());
  assert.equal(got.voice, false);
  assert.equal(got.camera, false);
  assert.equal(got.pokerface, false);
  // А то, что не требует устройств, остаётся: игра без сети обязана быть целой.
  assert.equal(got.probe, true);
  assert.equal(got.avatar, true);
});

test("каждый пресет перечисляет ВСЕ слои", () => {
  const keys = Object.keys(NO_LAYERS).sort();
  for (const p of PRESETS) {
    assert.deepEqual(Object.keys(p.layers).sort(), keys,
      `пресет «${p.id}» забыл слой — забытый читается как выключенный молча`);
  }
});

test("ни один пресет не включает покерфейс без камеры", () => {
  for (const p of PRESETS) {
    if (p.layers.pokerface) assert.equal(p.layers.camera, true, `пресет «${p.id}»`);
  }
});

test("классика — это действительно ничего", () => {
  const classic = PRESETS.find((p) => p.id === "classic")!;
  assert.ok(Object.values(classic.layers).every((v) => v === false));
});

// Экран подготовки перед партией убран: «НАЧАТЬ →» ведёт прямо за стол. Правило
// «партия на оценку идёт без слоёв» жило веткой того экрана — здесь оно живёт
// чистой функцией, и вот тесты, которые не дадут ему уехать вместе с роутером.
const ALL: Layers = { probe: true, voice: true, camera: true, avatar: true, pokerface: true };

test("экзамен не получает слоёв, что бы ни стояло в профиле", () => {
  const got = sessionLayers("exam", ALL, detectLayers());
  assert.deepEqual(got, NO_LAYERS, "сертификат обязан быть сравним с сертификатом без слоёв");
});

test("акт кампании и своя сделка тоже идут без слоёв", () => {
  for (const mode of ["campaign", "custom"] as const) {
    assert.deepEqual(sessionLayers(mode, ALL, detectLayers()), NO_LAYERS, mode);
  }
});

test("капстоун курса гасит слои даже в тренировке", () => {
  // Партия из урока запускается режимом «практика», но сравнивается с экзаменом.
  assert.deepEqual(sessionLayers("practice", ALL, detectLayers(), true), NO_LAYERS);
});

test("тренировка получает выбранное — но не то, чего среда не даёт", () => {
  const got = sessionLayers("practice", ALL, noMedia());
  assert.equal(got.probe, true);
  assert.equal(got.avatar, true);
  assert.equal(got.voice, false);
  assert.equal(got.camera, false);
  assert.equal(got.pokerface, false);
});

test("выбор игрока не портится ни одним режимом: функция чистая", () => {
  const want: Layers = { ...NO_LAYERS, probe: true, avatar: true };
  const copy = { ...want };
  sessionLayers("exam", want, detectLayers());
  assert.deepEqual(want, copy, "экзамен не имеет права затирать настройку профиля");
});
