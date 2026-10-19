// callMode.test.ts — текст и созвон: два режима ОДНОЙ партии.
//
// ЧТО БЫЛО. Голос включался слоем в профиле, и партия шла «чатом с
// микрофоном»: поле ввода, лента, живая расшифровка и сцена встречи разом,
// писать и говорить можно было в одну и ту же секунду. Владелец (19.10):
// «как в ChatGPT» — партия начинается чатом, «Созвон» уводит на экран звонка,
// «Завершить» возвращает в чат с тем же ходом.
//
// ЧТО ЗДЕСЬ ДЕРЖИТСЯ. Правила: старт — без голоса и камеры; созвон — только
// там, где слои разрешены вообще; кнопка без голоса в окружении называет
// причину; «Завершить» меняет сокет только на спокойной связи. Экран: в
// созвоне нет поля ввода, цена видна всегда. Провод — modeSwitch.test.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  callLayers, layersAllowed, startLayers, textLayers, NO_LAYERS, NO_SERVER_REASON, PRESETS, DEFAULT_LAYERS,
  type LayerId, type LayerState, type Layers,
} from "../src/lib/layers";
import { callOffer } from "../src/lib/meeting";
import { I18N } from "../src/i18n";

// --- правила ------------------------------------------------------------------

const ok = (id: LayerId): LayerState => ({ id, available: true, reason: null });
const READY: Record<LayerId, LayerState> = {
  probe: ok("probe"), voice: ok("voice"), camera: ok("camera"), avatar: ok("avatar"), pokerface: ok("pokerface"),
};
const ALL_ON: Layers = { probe: true, voice: true, camera: true, avatar: true, pokerface: true };
const NO_VOICE = { ...READY, voice: { id: "voice" as const, available: false, reason: { ru: "нет https", en: "no https" } } };

test("партия начинается чатом: голоса и камеры нет, сколько бы их ни просили", () => {
  const start = startLayers("practice", ALL_ON, READY);
  assert.deepEqual(start, { probe: true, voice: false, camera: false, avatar: true, pokerface: false });
  // Зачётные партии — по-прежнему без слоёв вовсе.
  assert.deepEqual(startLayers("exam", ALL_ON, READY), NO_LAYERS);
  assert.deepEqual(startLayers("practice", ALL_ON, READY, true), NO_LAYERS);
});

test("созвон поднимает голос, а камеру — только по выбору человека", () => {
  const start = startLayers("practice", ALL_ON, READY);
  assert.deepEqual(callLayers("practice", start, ALL_ON, READY), ALL_ON);
  const noCam = callLayers("practice", start, { ...ALL_ON, camera: false }, READY)!;
  assert.equal(noCam.voice, true);
  assert.equal(noCam.camera, false);
  assert.equal(noCam.pokerface, false, "без камеры «покерфейсу» считать нечего");
  // Остальные слои партии созвон не трогает.
  assert.equal(noCam.probe, true);
  assert.equal(noCam.avatar, true);
  // И выход возвращает ровно стартовые слои.
  assert.deepEqual(textLayers(callLayers("practice", start, ALL_ON, READY)!), start);
});

test("созвона нет там, где слоёв нет: зачёт, капстоун, нет голоса в окружении", () => {
  for (const mode of ["exam", "drill", "campaign", "custom"] as const) {
    assert.equal(callLayers(mode, NO_LAYERS, ALL_ON, READY), null, mode);
    assert.equal(layersAllowed(mode), false, mode);
  }
  assert.equal(callLayers("practice", NO_LAYERS, ALL_ON, READY, true), null, "акт кампании/капстоун (fixedOff)");
  assert.equal(callLayers("practice", NO_LAYERS, ALL_ON, NO_VOICE), null);
});

test("кнопка «Созвон»: в зачёте её нет, без голоса она называет причину", () => {
  assert.deepEqual(callOffer({ allowed: false, voice: READY.voice, offline: false, lang: "ru" }), { show: false });
  assert.deepEqual(callOffer({ allowed: true, voice: READY.voice, offline: false, lang: "ru" }), { show: true, reason: null });
  assert.deepEqual(callOffer({ allowed: true, voice: NO_VOICE.voice, offline: false, lang: "en" }),
    { show: true, reason: "no https" });
  assert.deepEqual(callOffer({ allowed: true, voice: READY.voice, offline: true, lang: "ru" }),
    { show: true, reason: NO_SERVER_REASON.ru }, "офлайн-ядро созвона не умеет, что бы ни сказал браузер");
});

test("голос больше не слой профиля: ни умолчание, ни пресеты его не включают", () => {
  assert.equal(DEFAULT_LAYERS.voice, false);
  for (const p of PRESETS) assert.equal(p.layers.voice, false, p.id);
});

// --- экран --------------------------------------------------------------------

test("в созвоне нет поля ввода, а кнопка «Завершить» есть", async () => {
  const { CallView } = await import("../src/components/CallView");
  const t = I18N.ru;
  const html = renderToStaticMarkup(createElement(CallView, {
    t, lang: "ru", scenario: { id: "supplier", counterpart_name: "Марина", counterpart_persona: "закупщик",
      headline_unit: "₽" } as never,
    state: { trust: 55, tension: 20, info: 10, leverage: 30, offer_opp: 96, offer_player: null,
      interests_found: 0, interests_total: 3, turn: 1, max_turns: 12, status: "active" } as never, status: "listening", avatarState: null, renderer: "portrait", synthetic: false,
    videoPending: false, oppSpeaking: false, speech: true, subtitle: null, transcript: null,
    micAvailable: true, micFail: null, micMuted: false, onToggleMic: () => {},
    camera: { up: false, off: false, reason: null }, onToggleCamera: () => {},
    hud: null, turnLabel: "ход 1 из 12", feed: null, hint: null, hintEnabled: true, hintDisabled: false,
    onHint: () => {}, probe: null, onHangUp: () => {}, hangupPending: false, outcome: null,
  }));
  assert.ok(!html.includes("<textarea"), "в созвоне снова можно печатать — режимы смешались");
  assert.ok(html.includes(t.call.end));
  assert.ok(html.includes(t.call.feed));
  assert.ok(html.includes(t.call.theirOffer), "цена в созвоне обязана быть видна всегда");
});

test("кнопка «Созвон» стоит рядом с полем ввода и не прячет причину отказа", async () => {
  const { Composer } = await import("../src/components/Composer");
  const base = {
    disabled: false, placeholder: "", quickMoves: [], onSend: () => {}, onHint: () => {}, hintEnabled: true,
    hintLabel: "h", sendLabel: "s", showChips: false, limitNote: "", charForms: ["", "", ""] as [string, string, string],
  };
  const off = renderToStaticMarkup(createElement(Composer, base));
  assert.ok(!off.includes("call-go"), "кнопка без созвона в партии");
  const na = renderToStaticMarkup(createElement(Composer, { ...base,
    call: { label: "Созвон", title: "Созвон недоступен: нет https", disabled: true, onCall: () => {} } }));
  assert.match(na, /class="call-go"[^>]*aria-disabled="true"/);
  assert.ok(na.includes("нет https"), "отказ без причины");
});

test("шлюз без распознавания не предлагает созвон: «disabled» в health — тоже отказ", async () => {
  const { withServer } = await import("../src/lib/layers");
  for (const voice of ["disabled (check NEGO_VOICE); fallback: text",
                       "classic: disabled (check NEGO_ASR; fallback: text); fallback: text (no automatic cloud ASR)",
                       "unavailable (NEGO_AI=off) — настроено: classic: parakeet"]) {
    assert.equal(withServer(READY, { voice }).voice.available, false, voice);
  }
  assert.equal(withServer(READY, { voice: "classic: parakeet (nvidia/parakeet-tdt-0.6b-v3, local); fallback: text" })
    .voice.available, true, "рабочий голос стенда");
  assert.equal(withServer(READY, { voice: "openai-realtime (explicit); fallback: text" }).voice.available, true);
});

test("«Завершить» меняет сокет только на спокойной связи и между ходами", async () => {
  const { hangUpAction } = await import("../src/lib/meeting");
  const calm = { open: true, busy: false, switching: false, conn: "online" as const };
  assert.equal(hangUpAction(calm), "switch");
  // Ход в полёте: смена сокета оборвала бы его — ждём ответа.
  assert.equal(hangUpAction({ ...calm, busy: true }), "wait");
  // Звонок ещё подключается или связь возвращается: уйти в чат сейчас значило
  // бы оставить партию в голосовом сокете под текстовым экраном.
  assert.equal(hangUpAction({ ...calm, switching: true, conn: "connecting" }), "wait");
  assert.equal(hangUpAction({ ...calm, conn: "reconnecting" }), "wait");
  // Стол закрыт или связи нет насовсем — менять нечего, экран уходит в чат.
  assert.equal(hangUpAction({ ...calm, open: false }), "local");
  assert.equal(hangUpAction({ ...calm, conn: "lost" }), "local");
  assert.equal(hangUpAction({ ...calm, busy: true, conn: "lost" }), "local");
});

test("карточки на тёмной сцене звонка пишут своим цветом, а не белым сцены", async () => {
  // Найдено вживую: сцена задаёт `color: #fff`, карточка вопроса о реакции —
  // светлая и своего цвета текста не имеет. Вопрос и четыре ответа читались
  // белым по белому — пустая рамка с пустыми кнопками.
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.call \{[^}]*color: #fff/, "сцена звонка больше не белая — проверка устарела");
  assert.match(css, /\.call-cards \{ color: var\(--ink\); \}/, "карточки на сцене наследуют белый текст");
});

test("в шторке слоёв нет тумблера «Голосом» — голос включается созвоном", async () => {
  // Найдено ревью: тумблер остался, спрашивал микрофон и не менял ничего —
  // `startLayers` срезает голос, а `callLayers` включает его независимо.
  const { LayersPanel } = await import("../src/components/Setup");
  const ok2 = (id: LayerId): LayerState => ({ id, available: true, reason: null });
  const states = { probe: ok2("probe"), voice: ok2("voice"), camera: ok2("camera"), avatar: ok2("avatar"), pokerface: ok2("pokerface") };
  for (const lang of ["ru", "en"] as const) {
    const html = renderToStaticMarkup(createElement(LayersPanel, {
      t: I18N[lang], lang, layers: DEFAULT_LAYERS, states, onToggle: () => {}, onPreset: () => {},
    }));
    assert.ok(!html.includes(`aria-label="${I18N[lang].layers.names.voice}"`), `${lang}: тумблер голоса в шторке`);
    assert.ok(html.includes(`aria-label="${I18N[lang].layers.names.camera}"`), `${lang}: камера пропала вместе с голосом`);
  }
});

test("шторка в чате показывает камеру из выбора человека, а не «выключено» чата", async () => {
  // Найдено ревью: в чате камера погашена по построению, шторка рисовала её
  // выключенной, и нажатие ЛЮБОГО тумблера записывало это в профиль — следующий
  // созвон поднимался без камеры.
  const { drawerLayers } = await import("../src/lib/layers");
  const prefs: Layers = { probe: true, voice: false, camera: true, avatar: true, pokerface: true };
  const chat = startLayers("practice", prefs, READY);
  const shown = drawerLayers(chat, prefs, true);
  assert.equal(shown.camera, true);
  assert.equal(shown.pokerface, true);
  // Нажатие «читай лицо» в шторке собирает выбор из ПОКАЗАННОГО — камера в нём жива.
  const next = { ...shown, probe: !shown.probe };
  assert.equal(next.camera, true, "нажатие соседнего тумблера выключило камеру в профиле");
  // В созвоне и в партии на зачёт — то, что партия получила на самом деле.
  const call = callLayers("practice", chat, { ...prefs, camera: false }, READY)!;
  assert.deepEqual(drawerLayers(call, prefs, true), call);
  assert.deepEqual(drawerLayers(NO_LAYERS, prefs, false), NO_LAYERS);
});

test("разбор видит камеру и «покерфейс» звонка и после «Завершить»", async () => {
  // Найдено ревью: разбор смотрел на слои ТЕКУЩЕГО режима. Звонок с камерой,
  // «Завершить», партия закрыта в чате — и карточки камеры и «покерфейса»
  // пропадали, хотя слой честно смотрел весь звонок.
  const { unionLayers } = await import("../src/lib/layers");
  const prefs: Layers = { probe: true, voice: false, camera: true, avatar: true, pokerface: true };
  const chat = startLayers("practice", prefs, READY);
  const call = callLayers("practice", chat, prefs, READY)!;
  const run = unionLayers(unionLayers(unionLayers(NO_LAYERS, chat), call), textLayers(call));
  assert.equal(run.camera, true);
  assert.equal(run.pokerface, true);
  assert.deepEqual(unionLayers(NO_LAYERS, chat), chat, "без звонка слоёв партии не прибавляется");
  const { readFileSync } = await import("node:fs");
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /observations=\{runLayers\.camera \?/, "разбор снова смотрит на текущий режим");
  assert.match(app, /tells=\{runLayers\.pokerface &&/);
});

test("«Завершить»: отказ смены в последний момент — ждать, а не уходить в чат", async () => {
  // Найдено ревью: `hangUpAction` сказал «switch», а хук отказал (ход ушёл в
  // ту же миллисекунду) — и выход шёл «местным» путём: чат на экране поверх
  // ГОЛОСОВОГО сокета живой партии, ровно то, что `hangUpAction` запрещает.
  const { readFileSync } = await import("node:fs");
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const body = app.slice(app.indexOf("const leaveCall = useCallback"), app.indexOf("}, [activeLayers, hangUp, nego, t]);"));
  const sw = body.slice(body.indexOf('if (hangUp === "switch")'), body.indexOf("nego.stopCapture();"));
  assert.match(sw, /setHangupPending\(true\);\s*return;\s*\}\s*$/, "отказ хука ведёт в «местный» выход");
});
