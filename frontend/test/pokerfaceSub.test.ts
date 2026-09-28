// pokerfaceSub.test.ts — «покерфейс» подчинён камере СТРОЕНИЕМ панели.
//
// ЧТО ЗДЕСЬ ЛОВИТСЯ. Он считает по кадрам камеры, и `pruneLayers` гасит его,
// пока она выключена. Пока он стоял отдельной карточкой, это выглядело так:
// человек жмёт тумблер, выбор уходит в `applyLayers`, там же обнуляется и
// пишется обратно — тумблер не двигается и НИЧЕГО НЕ ГОВОРИТ. Мёртвое нажатие
// без объяснения и есть то самое четвёртое состояние, которого в продукте не
// бывает, только со стороны интерфейса.
//
// Поэтому тумблер живёт внутри карточки камеры, а три его состояния —
// «недоступен», «камера выключена», «работает» — обязаны читаться разными
// словами. Тест держит и вложенность, и то, что молчания нет ни в одном из них.
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LayersPanel } from "../src/components/Setup";
import { I18N } from "../src/i18n";
import { NO_LAYERS, type LayerId, type LayerState, type Layers } from "../src/lib/layers";

const t = I18N.ru;

const ok = (id: LayerId): LayerState => ({ id, available: true, reason: null });
const no = (id: LayerId): LayerState => ({
  id, available: false, reason: { ru: "нужен https или localhost", en: "needs https" },
});

const READY: Record<LayerId, LayerState> = {
  probe: ok("probe"), voice: ok("voice"), camera: ok("camera"),
  avatar: ok("avatar"), pokerface: ok("pokerface"),
};

function html(layers: Layers, states = READY): string {
  return renderToStaticMarkup(createElement(LayersPanel, {
    t, lang: "ru" as const, layers, states,
    onToggle: () => {}, onPreset: () => {},
  }));
}

/** Кусок разметки от `<div class="ly-sub` до конца строки с его подписью. */
function sub(markup: string): string {
  const at = markup.indexOf("ly-sub");
  assert.notEqual(at, -1, "подвыбор обязан присутствовать в карточке камеры");
  return markup.slice(at, markup.indexOf("</div>", markup.indexOf("ly-note-pokerface")));
}

test("«покерфейс» не карточка верхнего уровня — он внутри камеры", () => {
  const markup = html({ ...NO_LAYERS, camera: true });
  const cards = markup.match(/class="layer /g) ?? [];
  assert.equal(cards.length, 4, "карточек ровно четыре: аватар, читай лицо, голос, камера");
  assert.equal((markup.match(/ly-sub/g) ?? []).length > 0, true);
  // Вложенность именно в камеру, а не рядом: подвыбор идёт ПОСЛЕ её подписи и
  // ДО закрытия её карточки — проверяем по соседству с причиной камеры.
  assert.ok(markup.indexOf("ly-note-camera") < markup.indexOf("ly-sub"));
});

test("камера выключена — тумблер заперт и говорит, чего не хватает", () => {
  const markup = sub(html({ ...NO_LAYERS, camera: false }));
  assert.match(markup, /aria-disabled="true"/);
  assert.match(markup, /aria-checked="false"/);
  assert.ok(markup.includes(t.layers.needsCamera), "причина обязана быть названа словами");
  assert.ok(!markup.includes(t.layers.sameGrade), "обещание про грейд — не ответ на «почему не жмётся»");
  // Тревожный цвет здесь соврал бы: ничего не сломано, нужен один клик выше.
  assert.ok(!/ly-note na/.test(markup), "подсказка не красится как отказ");
});

test("камера включена — тумблер живой и несёт обычное обещание", () => {
  const markup = sub(html({ ...NO_LAYERS, camera: true }));
  assert.ok(!markup.includes("aria-disabled"), "запирать нечего: камера работает");
  assert.ok(markup.includes(t.layers.sameGrade));
  assert.ok(!markup.includes(t.layers.needsCamera));
});

test("камера включена вместе с покерфейсом — подвыбор горит", () => {
  const markup = sub(html({ ...NO_LAYERS, camera: true, pokerface: true }));
  assert.match(markup, /aria-checked="true"/);
});

test("камеры нет в этом браузере — причина камеры, а не «включите камеру»", () => {
  const states = { ...READY, camera: no("camera"), pokerface: no("pokerface") };
  const markup = sub(html({ ...NO_LAYERS, camera: true, pokerface: true }, states));
  assert.match(markup, /aria-disabled="true"/);
  assert.ok(markup.includes("нужен https"), "чинить нечего — это обязано читаться иначе");
  assert.ok(!markup.includes(t.layers.needsCamera), "совет включить камеру здесь бесполезен");
  assert.match(markup, /ly-note na/, "настоящий запрет — единственное, что красится тревожно");
});

test("выбор покерфейса не теряется при сверке с пресетами", () => {
  // «Покерфейс» ушёл из карточек, но не из выбора: пресет с ним обязан
  // подсвечиваться, иначе панель показывает активным не то, что включено.
  const withPf = html({ ...NO_LAYERS, camera: true, avatar: true, pokerface: true });
  const withoutPf = html({ ...NO_LAYERS, camera: true, avatar: true });
  const lit = (m: string) => (m.match(/sp-pill on/g) ?? []).length;
  assert.equal(lit(withPf), 1, "пресет «Покерфейс» обязан гореть");
  assert.equal(lit(withoutPf), 0, "без покерфейса ни один пресет не совпадает");
});
