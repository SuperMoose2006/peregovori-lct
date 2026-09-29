// clarity.test.ts — интерфейс понятен человеку, который открыл его впервые.
//
// Откуда эти тесты: коллега прошёл продукт глазами нового пользователя и вернул
// список мест, где «непонятно, что это». Каждое место закрыто правкой, и каждая
// правка держится здесь — чтобы следующая правка оформления не вернула «ИХ
// ЦЕНА» без легенды, три одинаковых зелёных или голую «BATNA».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18N } from "../src/i18n";
import { DealTracker, priceStanding, priceTrail, redlineLabelAlign } from "../src/components/DealTracker";
import { DealTerms, termsExample } from "../src/components/DealTerms";
import { ProgressCards, DailyCard, MethodCard } from "../src/components/Rail";
import { LayersPanel } from "../src/components/Setup";
import { CustomSituation } from "../src/components/CustomSituation";
import { emptyProfile } from "../src/lib/progress";
import { dailyTable } from "../src/lib/daily";
import type { LayerId, LayerState } from "../src/lib/layers";
import { NO_LAYERS, NO_SERVER_REASON, SERVER_SIDE_REASON, withServer } from "../src/lib/layers";
import type { ScenarioView, StateView } from "../src/types";

const SRC = new URL("../src/", import.meta.url).pathname;
const CSS = readFileSync(join(SRC, "styles.css"), "utf8");
const ru = I18N.ru;

// ---- График цены --------------------------------------------------------------

const BUYER: ScenarioView = {
  id: "supplier", icon: "box", difficulty: 2, title: "Контракт с поставщиком",
  role: "Вы — менеджер по закупкам.", counterpart_name: "Ирина", counterpart_persona: "",
  headline_unit: "₽/шт", briefing: "", batna: "Другой поставщик по 95.",
  target: 86, reservation: 92,
  secondary_issues: [{ id: "annual_contract", label: "Годовой контракт с гарантией объёма" }],
} as unknown as ScenarioView;

const stateAt = (offer: number, extra: Partial<StateView> = {}): StateView => ({
  trust: 40, tension: 25, info: 0, leverage: 11, offer_opp: offer, offer_player: null, deal: null,
  interests_found: 0, interests_total: 3, interests: [], terms_conceded: [], status: "active",
  turn: 0, max_turns: 12, ...extra,
} as unknown as StateView);

test("строка «что это значит»: за красной линией, в коридоре, у цели — для покупателя", () => {
  assert.equal(priceStanding(86, 92, 100, null), "beyond");
  assert.equal(priceStanding(86, 92, 92, null), "zone", "красная линия — худшее, на что вы СОГЛАСНЫ");
  assert.equal(priceStanding(86, 92, 89, null), "zone");
  assert.equal(priceStanding(86, 92, 85, null), "target");
  assert.equal(priceStanding(86, 92, 100, 88), "settled");
});

test("…и для продавца, где выгоднее большее число", () => {
  assert.equal(priceStanding(230, 195, 180, null), "beyond");
  assert.equal(priceStanding(230, 195, 200, null), "zone");
  assert.equal(priceStanding(230, 195, 240, null), "target");
});

test("путь их цены: к вашей цели, от неё, на месте — в обе стороны торга", () => {
  assert.equal(priceTrail([100, 97, 95], true), "moved");
  assert.equal(priceTrail([180, 190], false), "moved");
  assert.equal(priceTrail([100, 103], true), "away");
  assert.equal(priceTrail([100, 100], true), "flat");
  assert.equal(priceTrail([100], true), "flat");
});

test("легенда называет каждую метку шкалы, и красная линия — «ваша»", () => {
  const html = renderToStaticMarkup(createElement(DealTracker, {
    scenario: BUYER, state: stateAt(100, { offer_player: 84, turn: 1 }), t: ru, lang: "ru" as const,
  }));
  for (const name of [ru.tracker.target, ru.tracker.redline, ru.tracker.zone, ru.tracker.theirOffer,
    ru.tracker.opening, ru.tracker.yourOffer]) {
    assert.ok(html.includes(name), `в легенде нет «${name}»`);
  }
  assert.match(ru.tracker.redline, /^Ваша/, "чья красная линия — сказано в имени");
  assert.ok(html.includes(ru.tracker.hiddenFloor), "не сказано, что границы другой стороны на шкале нет");
  // Образец в легенде на каждую метку на шкале.
  for (const sw of ["sw-target", "sw-redline", "sw-zone", "sw-theirs", "sw-start", "sw-yours"]) {
    assert.ok(html.includes(sw), `нет образца ${sw}`);
  }
});

test("на самой шкале подписано, чья красная линия, и подпись уходит от цели", () => {
  const html = renderToStaticMarkup(createElement(DealTracker, {
    scenario: BUYER, state: stateAt(100), t: ru, lang: "ru" as const,
  }));
  const scale = html.slice(html.indexOf('class="dt-scale"'), html.indexOf("dt-key"));
  assert.ok(scale.includes(`>${ru.tracker.redline}<`), "у красной черты на шкале нет подписи");
  // Цель всегда слева: подпись красной линии тянется вправо, пока есть место.
  assert.equal(redlineLabelAlign(0.3), "start");
  assert.equal(redlineLabelAlign(0.8), "end");
});

test("их цена за вашей красной линией объяснена словами, а не оставлена загадкой", () => {
  const html = renderToStaticMarkup(createElement(DealTracker, {
    scenario: BUYER, state: stateAt(100), t: ru, lang: "ru" as const,
  }));
  assert.ok(html.includes('class="dt-status beyond"'));
  assert.ok(html.includes("хуже вашей красной линии"), html);
});

test("метка старта больше не носит класс карточки «Стол накрыт»", () => {
  // Класс `opening` совпадал с карточкой в ленте, и «старт» рисовался карточкой
  // с зелёной кромкой за краем шкалы — третий зелёный, которого не должно быть.
  const html = renderToStaticMarkup(createElement(DealTracker, {
    scenario: BUYER, state: stateAt(100), t: ru, lang: "ru" as const,
  }));
  assert.equal(/class="[^"]*\bopening\b/.test(html), false);
  assert.ok(html.includes("dt-mark start"));
});

test("вместо линии без подписи — строка «откуда → куда» и что это значит", () => {
  assert.equal(/<svg[^>]*>.*<path/s.test(renderToStaticMarkup(createElement(DealTracker, {
    scenario: BUYER, state: stateAt(100), t: ru, lang: "ru" as const,
  }))), false, "непонятный снижающийся график вернулся");
  for (const lang of ["ru", "en"] as const) {
    const tr = I18N[lang].tracker;
    for (const s of [tr.historyMoved, tr.historyAway]) assert.ok(s.includes("{from}") && s.includes("{to}"));
  }
});

/** Тело CSS-правила по точному селектору. */
function rule(selector: string): string {
  const i = CSS.indexOf(`${selector} {`);
  assert.ok(i >= 0, `нет правила ${selector}`);
  return CSS.slice(i, CSS.indexOf("}", i));
}

test("цель, коридор, их старт и ваше предложение — разными цветами; зелёный только у цели", () => {
  const block = rule(".dealtracker");
  const tok = (name: string) => (block.match(new RegExp(`--dt-${name}:\\s*([^;]+);`)) ?? [])[1]?.trim();
  const colors = { target: tok("target"), redline: tok("redline"), theirs: tok("theirs"),
    yours: tok("yours"), zone: tok("zone") };
  for (const [k, v] of Object.entries(colors)) assert.ok(v, `нет цвета --dt-${k}`);
  assert.equal(new Set(Object.values(colors)).size, 5, `цвета совпадают: ${JSON.stringify(colors)}`);
  const GREEN = /--(brass|brass-soft|trust)\b/;
  assert.match(colors.target!, GREEN, "цель — зелёная");
  for (const k of ["redline", "theirs", "yours", "zone"] as const) {
    assert.doesNotMatch(colors[k]!, GREEN, `«${k}» зелёный — это и была жалоба`);
  }
  // Сами метки и образцы легенды берут цвет из этих переменных, а не свой.
  assert.match(rule(".dt-zone, .sw-zone"), /var\(--dt-zone\)/);
  assert.doesNotMatch(rule(".dt-zone, .sw-zone"), GREEN);
  assert.match(rule(".dt-mark.start .ring"), /var\(--dt-theirs\)/);
  assert.match(rule(".dt-mark.yours .dot"), /var\(--dt-yours\)/);
  assert.doesNotMatch(rule(".dt-axis"), GREEN, "ось шкалы тоже красилась в зелёный градиент");
});

// ---- Что можно предложить взамен ----------------------------------------------

test("панель условий говорит, ЧТО это, что с ним делать и когда строка отметится", () => {
  const html = renderToStaticMarkup(createElement(DealTerms, { scenario: BUYER, state: stateAt(100), t: ru }));
  assert.notEqual(ru.terms.title, "Условия сделки", "прежнее имя читалось как «что нужно выполнить»");
  for (const s of [ru.terms.title, ru.terms.lead, ru.terms.howMarked]) assert.ok(html.includes(s));
  assert.ok(html.includes("годовой контракт с гарантией объёма"), "пример собран не из этого стола");
});

test("пример фразы — с условием ЭТОГО стола и без сломанной аббревиатуры", () => {
  assert.match(termsExample(ru, "Годовой контракт"), /согласимся на годовой контракт/);
  assert.match(termsExample(ru, "KPI-ревью"), /KPI-ревью/);
});

// ---- BATNA ----------------------------------------------------------------------

test("BATNA расшифрована там, где человек встречает её впервые", () => {
  for (const [lang, word] of [["ru", /запасн/i], ["en", /fallback/i]] as const) {
    const t = I18N[lang];
    assert.match(t.batna, word, `${lang}: карточка на столе — голая аббревиатура`);
    assert.ok(t.batnaHint.length > 20, `${lang}: нет строки «зачем это знать»`);
    assert.match(t.tagLabels.batna, word, `${lang}: чип приёма под репликой — голая аббревиатура`);
    assert.match(t.meterInfo.leverage, word, `${lang}: подсказка шкалы «Рычаг» — голая аббревиатура`);
  }
  assert.match(readFileSync(join(SRC, "components", "Table.tsx"), "utf8"), /\{t\.batnaHint\}/);
});

// ---- Рейл: «Цель дня», «Ваш ранг», «Стол дня», «Метод» -------------------------

test("у цели на сегодня и у ранга есть строка «что это и что с этим делать»", () => {
  const html = renderToStaticMarkup(createElement(ProgressCards, {
    t: ru, lang: "ru" as const, profile: emptyProfile(), onSetGoal: () => {},
  }));
  assert.ok(html.includes(ru.goal.hint));
  assert.ok(html.includes(ru.rank.hint));
  assert.ok(html.includes("0 из 1"), "голое «0/1» не говорит, чего ноль");
  assert.match(ru.rank.hint, /не влияет/, "не сказано, на что ранг НЕ влияет");
});

test("переговоры дня объясняют, что это такое, и помнят ваш рекорд за этим столом", () => {
  const today = dailyTable().scenarioId;
  const profile = { ...emptyProfile(), scenarios: { [today]: { bestGrade: "B", bestScore: 78, attempts: 2 } } } as unknown as ReturnType<typeof emptyProfile>;
  const html = renderToStaticMarkup(createElement(DailyCard, { t: ru, lang: "ru" as const, profile, onPlay: () => {} }));
  assert.ok(html.includes(ru.daily.lead), "не сказано, что это одна ситуация на всех");
  assert.ok(html.includes("B, 78 из 100"), "рекорд за столом дня пропал вместе с карточкой «Тихон помнит»");
});

test("четыре приёма — с примером под каждым и дорогой в курс", () => {
  let went = 0;
  const html = renderToStaticMarkup(createElement(MethodCard, { t: ru, onCourse: () => { went++; } }));
  for (const p of ru.teach.panels) {
    assert.ok(html.includes(p.name) && html.includes(p.example), `у приёма «${p.name}» нет примера`);
  }
  assert.ok(html.includes(ru.method.more));
  assert.notEqual(ru.method.title, "Метод");
});

test("курс называется понятно", () => {
  assert.equal(ru.course.title, "Курс переговоров");
});

// ---- Профиль: слои --------------------------------------------------------------

const ok = (id: LayerId): LayerState => ({ id, available: true, reason: null });
const READY: Record<LayerId, LayerState> = {
  probe: ok("probe"), voice: ok("voice"), camera: ok("camera"), avatar: ok("avatar"), pokerface: ok("pokerface"),
};

test("профиль говорит, где слои работают, и помечает недоступным то, чего нет", () => {
  const html = renderToStaticMarkup(createElement(LayersPanel, {
    t: ru, lang: "ru" as const, layers: NO_LAYERS, states: READY, onToggle: () => {}, onPreset: () => {},
  }));
  assert.ok(html.includes(ru.layers.where), "не сказано, что слои работают только в «Тренировке»");
  assert.match(ru.layers.where, /Тренировк/);
  assert.ok(html.includes(ru.layers.needs.voice) && html.includes(ru.layers.needs.camera));
  // Живого видео-лица нет — строка есть, выключателя у неё нет, и она «недоступно».
  const later = html.slice(html.indexOf("ly-later"));
  assert.ok(later.includes(ru.layers.avatarLater) && later.includes(ru.layers.unavailable));
  const laterBlock = later.slice(0, later.indexOf("</div></div>") + 12);
  assert.doesNotMatch(laterBlock, /role="switch"/, "у того, чего нет, не бывает тумблера");
});

// ---- «Своя сделка» и «Редактор» ------------------------------------------------

test("своя сделка и редактор объясняют, чем отличаются друг от друга", () => {
  const html = renderToStaticMarkup(createElement(CustomSituation, {
    t: ru, lang: "ru" as const, value: "", error: null, onChange: () => {}, onGenerate: () => {},
  }));
  assert.ok(html.includes(ru.custom.vsEditor));
  assert.match(ru.custom.vsEditor, /Редактор/);
  const admin = readFileSync(join(SRC, "components", "AdminScenarioScreen.tsx"), "utf8");
  const blocks = admin.match(/vsCustom: "[^"]+"/g) ?? [];
  assert.equal(blocks.length, 2, "строка о различии нужна на обоих языках");
  assert.match(blocks[0], /Своей сделки/);
  assert.match(admin, /\{t\.vsCustom\}/, "строка есть в словаре, но не рисуется");
});

// ---- Слои: что скажет сервер — известно ДО партии ------------------------------

test("без сервера голос, камера, покерфейс и лицо с сервера — «недоступно» с причиной", () => {
  const got = withServer(READY, "offline");
  for (const id of ["voice", "camera", "pokerface", "avatar"] as LayerId[]) {
    assert.equal(got[id].available, false, `${id} обещан без сервера`);
    assert.deepEqual(got[id].reason, NO_SERVER_REASON);
  }
  assert.equal(got.probe.available, true, "вопрос о реакции считает движок — он есть и офлайн");
});

test("сервер без облака: камера и покерфейс недоступны, голос — если сервер сам так сказал", () => {
  const offAi = withServer(READY, { cloud_ai: false, voice: "unavailable (NEGO_AI=off) — настроено: parakeet" });
  assert.equal(offAi.camera.available, false);
  assert.equal(offAi.pokerface.available, false);
  assert.equal(offAi.voice.available, false);
  assert.deepEqual(offAi.camera.reason, SERVER_SIDE_REASON.camera);
  assert.deepEqual(offAi.voice.reason, SERVER_SIDE_REASON.voice);
  assert.equal(offAi.avatar.available, true);
});

test("стенд с облаком и распознаванием — ничего не отнимается; сервер молчит — тоже", () => {
  const stand = withServer(READY, { cloud_ai: true, voice: "classic: parakeet (nvidia/parakeet-tdt-0.6b-v3, local)" });
  assert.deepEqual(stand, READY);
  assert.deepEqual(withServer(READY, null), READY, "пока сервер не ответил, «нет» — такая же неправда, как «да»");
});

test("браузерная причина первичнее серверной", () => {
  const insecure: LayerState = { id: "voice", available: false, reason: { ru: "нужен https", en: "needs https" } };
  const got = withServer({ ...READY, voice: insecure }, "offline");
  assert.deepEqual(got.voice.reason, insecure.reason);
});

test("выбранный, но недоступный слой не горит включённым", () => {
  const html = renderToStaticMarkup(createElement(LayersPanel, {
    t: ru, lang: "ru" as const, layers: { ...NO_LAYERS, voice: true },
    states: withServer(READY, "offline"), onToggle: () => {}, onPreset: () => {},
  }));
  const at = html.indexOf(`aria-label="${ru.layers.names.voice}"`);
  const voice = html.slice(html.lastIndexOf("<button", at), html.indexOf(">", at)); // тег тумблера целиком
  assert.match(voice, /aria-checked="false"/);
  assert.match(voice, /aria-disabled="true"/);
});

test("на экзамене строка-совет под шапкой графика молчит, легенда остаётся", () => {
  // Экзамен — оценка: живое сопровождение там выключено до разбора. «Добивайтесь
  // уступок» — совет, а шкала и легенда — факты.
  const html = renderToStaticMarkup(createElement(DealTracker, {
    scenario: BUYER, state: stateAt(100), t: ru, lang: "ru" as const, coaching: false,
  }));
  assert.equal(html.includes("dt-status"), false);
  assert.ok(html.includes(ru.tracker.redline));
  assert.match(readFileSync(join(SRC, "components", "Table.tsx"), "utf8"), /coaching=\{!exam\}/);
});
