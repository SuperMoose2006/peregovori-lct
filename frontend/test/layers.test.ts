// Слои честны в обе стороны: включённый обязан что-то делать, а невозможный —
// сказать «недоступно», а не притвориться. Этот файл держит вторую половину.
import test from "node:test";
import assert from "node:assert/strict";
import { NO_LAYERS, PRESETS, pruneLayers, sessionLayers, detectLayers, withServer, reasonText, SERVER_SIDE_REASON, type Layers } from "../src/lib/layers";
import { visionTape, visionClock, VISION_TAPE_ROWS } from "../src/components/Debrief";
import type { VisionNote } from "../src/types";
import { I18N } from "../src/i18n";

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

test("состав всех пресетов соответствует обещанным режимам", () => {
  const enabled = Object.fromEntries(PRESETS.map(p => [p.id,
    Object.entries(p.layers).filter(([, on]) => on).map(([id]) => id).sort()]));
  assert.deepEqual(enabled, {
    classic: [],
    read: ["avatar", "probe"],
    call: ["avatar", "voice"],
    poker: ["avatar", "camera", "pokerface"],
    full: ["avatar", "camera", "pokerface", "probe", "voice"],
  });
});

test("Полный контакт поднимает пять слоёв, без камеры гасит камеру и покерфейс с причиной", () => {
  const full = PRESETS.find(p => p.id === "full")!.layers;
  const ready = Object.fromEntries(Object.keys(ON).map(id =>
    [id, { id, available: true, reason: null }])) as ReturnType<typeof detectLayers>;
  assert.deepEqual(sessionLayers("practice", full, ready), ON);
  for (const unavailable of [noMedia(), withServer(ready, { cloud_ai: false, voice: "classic: parakeet" })]) {
    const actual = sessionLayers("practice", full, unavailable);
    for (const id of ["camera", "pokerface"] as const) {
      assert.equal(actual[id], false);
      assert.ok(reasonText(unavailable[id], "ru"));
    }
  }
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

test("покерфейс не показывает счётчик, если камера не смотрела", () => {
  // Подпись «ноль срывов» под невставшей камерой — это обещание, выданное за
  // наблюдение. Различить два случая можно только по числу просмотренных
  // кадров, поэтому оно и хранится рядом со счётчиком.
  const shown = (pokerface: boolean, frames: number) =>
    pokerface && frames > 0;

  assert.equal(shown(true, 0), false, "слой включён, но ни разу не посмотрел");
  assert.equal(shown(false, 5), false, "слой выключен — счётчику неоткуда взяться");
  assert.equal(shown(true, 5), true);
});

test("строка счётчика переведена и несёт подстановку", () => {
  for (const lang of ["ru", "en"] as const) {
    const s = I18N[lang].layers.tellsOf;
    assert.ok(s.includes("{n}"), `${lang}: нет подстановки числа кадров`);
    assert.ok(s.trim().length > 10, `${lang}: строка пуста`);
  }
  assert.ok(!/[а-яё]/i.test(I18N.en.layers.tellsOf), "кириллица в английском");
});


// ---------------------------------------------------------------------------
// Лента наблюдений камеры в разборе
//
// Карточка отвечает на вопрос «когда»: на каком ходу что было видно и где лицо
// себя выдало. До неё это были четыре последние фразы списком — прочитать
// можно, связать с партией нельзя.
// ---------------------------------------------------------------------------

const note = (o: Partial<VisionNote>): VisionNote =>
  ({ turn: 0, at_ms: 0, text: "", expressive: null, ...o });

test("лента берётся из разбора, а не из накопленных живых событий", () => {
  // Живые события идут, только пока держится сокет. После переподключения
  // посреди партии клиентский список короче настоящего — и лента врала бы про
  // начало игры, показывая полную. В разборе едет то, что видел сервер.
  const fromServer = [note({ turn: 0, text: "человек в кадре" }),
                      note({ turn: 3, text: "в кадре появился второй" })];
  assert.deepEqual(visionTape(fromServer).tape.map((n) => n.turn), [0, 3]);
});

test("камера не поднялась — карточки нет, а не пустая лента", () => {
  // Ключа в разборе просто не будет: сервер не присылает пустую ленту. Ноль
  // наблюдений под невставшей камерой — это обещание, выданное за наблюдение.
  for (const empty of [undefined, null, []]) {
    assert.equal(visionTape(empty).tape.length, 0, "нечего показать — не показываем");
  }
});

test("строка, которой нечего сказать, в ленту не попадает", () => {
  // Ни текста, ни выражения на лице — это не наблюдение, а его отсутствие.
  // Нарисованная строкой, она обещала бы, что камера что-то заметила.
  const empty = [note({ turn: 2 }), note({ turn: 3, expressive: false })];
  assert.equal(visionTape(empty).tape.length, 0);
  assert.equal(visionTape([note({ turn: 4, expressive: true })]).tape.length, 1);
});

test("строка без хода в ленту не попадает", () => {
  // Разбор может прийти и от старого сервера, где наблюдения были плоскими
  // строками. Пустая строка «наблюдения» без наблюдения — ровно то, от чего
  // эта карточка уходит.
  const mixed = ["строка от старого сервера", null, note({ turn: 2, text: "видно" })];
  assert.deepEqual(visionTape(mixed).tape.map((n) => n.text), ["видно"]);
});

test("длинная лента показывает хвост и честно считает спрятанное", () => {
  const many = Array.from({ length: VISION_TAPE_ROWS + 5 },
                          (_, i) => note({ turn: i, text: `кадр ${i}` }));
  const { tape, hidden } = visionTape(many);
  assert.equal(tape.length, VISION_TAPE_ROWS);
  assert.equal(hidden, 5, "спрятанные строки обязаны быть названы числом");
  assert.equal(tape[tape.length - 1].turn, VISION_TAPE_ROWS + 4, "показан хвост, а не начало");
});

test("время наблюдения читается как время, а не как миллисекунды", () => {
  assert.equal(visionClock(0), "0:00");
  assert.equal(visionClock(9_000), "0:09");
  assert.equal(visionClock(65_000), "1:05");
  assert.equal(visionClock(-5), "0:00");
});

test("строки ленты переведены и несут подстановку хода", () => {
  for (const lang of ["ru", "en"] as const) {
    const l = I18N[lang].layers;
    assert.ok(l.seenTurn.includes("{n}"), `${lang}: в отметке хода нет подстановки`);
    assert.ok(l.seenMore.includes("{n}"), `${lang}: в хвосте ленты нет числа`);
    for (const s of [l.seenNote, l.seenStart, l.seenTell]) {
      assert.ok(s.trim().length > 3, `${lang}: пустая строка ленты`);
    }
  }
  const cyr = /[а-яё]/i;
  for (const [k, v] of Object.entries(I18N.en.layers)) {
    if (typeof v === "string") assert.ok(!cyr.test(v), `кириллица в английском: ${k}`);
  }
});

test("лента не обещает спокойное лицо там, где модель промолчала", () => {
  // `null` — не «нет». Отметка ставится только на явном «да»; остальное
  // остаётся без отметки, а не превращается в «лицо спокойно».
  const rows = visionTape([note({ turn: 1, expressive: null, text: "а" }),
                           note({ turn: 2, expressive: false, text: "б" }),
                           note({ turn: 3, expressive: true, text: "в" })]).tape;
  assert.deepEqual(rows.map((n) => n.expressive === true), [false, false, true]);
});

// --- причина, которую знает только сервер ----------------------------------

test("у серверной причины есть оба языка, и английский написан по-английски", () => {
  for (const key of ["camera", "voice"] as const) {
    const r = SERVER_SIDE_REASON[key];
    assert.ok(r.ru.length > 20 && r.en.length > 20, `${key}: причина обязана объяснять`);
    assert.ok(!/[а-яё]/i.test(r.en), `${key}: в английской строке кириллица`);
    assert.ok(/[а-яё]/i.test(r.ru), `${key}: русская строка не русская`);
    assert.notEqual(r.ru, r.en);
  }
});

test("причина камеры называет ПРИЧИНУ, а не «недоступно»", () => {
  // «Камера не работает» — это не сведения. Сведения — почему именно.
  assert.match(SERVER_SIDE_REASON.camera.ru, /зрени/);
  assert.match(SERVER_SIDE_REASON.camera.en, /vision/);
});
