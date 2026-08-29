// The probe layer is the one modality that is REAL rather than mocked, so its
// determinism is the thing worth locking down: a replayed session must ask the
// same questions with the same options in the same order.
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProbe, nextProbe, NO_PROBES, OFF_SCALE, REACTION_SCALE, EVERY,
  type ProbeMemory,
} from "../src/lib/probe";
import { I18N } from "../src/i18n";

const ASKABLE = [...REACTION_SCALE, ...Object.keys(OFF_SCALE)];

test("the true reaction is always among the options and correctly indexed", () => {
  for (const r of ASKABLE) {
    for (let turn = 2; turn <= 12; turn++) {
      const p = buildProbe(r, turn);
      assert.ok(p, `${r}@${turn}`);
      assert.equal(p!.options[p!.answer], r);
      assert.equal(p!.options.length, 4);
      assert.equal(new Set(p!.options).size, 4, "options must be distinct");
    }
  }
});

test("distractors are NEIGHBOURS on the warmth scale, not random opposites", () => {
  // "warmed" vs "walked_out" would be trivial; the confusion worth training is
  // between adjacent states.
  const p = buildProbe("neutral", 4)!;
  const idx = p.options.map((o) => REACTION_SCALE.indexOf(o as never));
  const centre = REACTION_SCALE.indexOf("neutral");
  for (const i of idx) assert.ok(Math.abs(i - centre) <= 2, `${REACTION_SCALE[i]} too far`);
});

test("it is a pure function — same input, same question", () => {
  assert.deepEqual(buildProbe("hardened", 6), buildProbe("hardened", 6));
});

test("an unknown reaction yields no question rather than a wrong one", () => {
  assert.equal(buildProbe("nonsense", 3), null);
  assert.equal(buildProbe("нет такой реакции", 6), null);
});

test("no question on the first move or after the table closes", () => {
  assert.equal(nextProbe("neutral", 1, false, NO_PROBES), null, "nothing to read on turn 1");
  assert.equal(nextProbe("neutral", EVERY, true, NO_PROBES), null,
               "the outcome already answers it");
  assert.ok(nextProbe("neutral", EVERY, false, NO_PROBES));
});

// --- «переспрос» ----------------------------------------------------------
//
// РАНЬШЕ ЗДЕСЬ СТОЯЛО ОБРАТНОЕ. Тест требовал, чтобы на реакции `probe_vague`
// слой МОЛЧАЛ, и довод был такой: это не состояние на шкале теплоты, а просьба
// сузить вопрос, и вставка её в шкалу испортила бы дистракторы соседям.
//
// Первая половина довода верна и сохранена: шкала не тронута, `probe_vague` в
// ней нет. Вторая половина не выдержала проверки четырьмя состояниями. Молчание
// на ходу, где слой включён и прекрасно работает, снаружи неотличимо от
// сломанного слоя: вопрос просто не появляется, и человек не знает почему.
// Хуже того, молчал слой ровно на самой ценной реплике партии — там, где движок
// говорит «общий вопрос интерес не вскрывает», то есть на главном тезисе
// продукта. Ярлык и разбор для этой реакции уже лежали в i18n и не вызывались
// ниоткуда.

test("«переспрос» — спрашиваемая реакция, а не дыра в слое", () => {
  const p = buildProbe("probe_vague", 6);
  assert.ok(p, "слой обязан спросить и про переспрос");
  assert.equal(p!.options[p!.answer], "probe_vague");
  assert.equal(REACTION_SCALE.includes("probe_vague" as never), false,
               "шкала теплоты остаётся шкалой теплоты");
});

test("дистракторы переспроса названы поимённо и бьют в нужную путаницу", () => {
  const p = buildProbe("probe_vague", 9)!;
  assert.ok(p.options.includes("opened_up"),
            "«приоткрылась» против «просит уточнить» — это и есть урок про интересы");
  for (const o of p.options) assert.notEqual(o, "walked_out");
});

test("«приоткрылась» проверяется переспросом, а не третьим соседом по теплоте", () => {
  const p = buildProbe("opened_up", 6)!;
  assert.ok(p.options.includes("probe_vague"),
            "вопрос попал или был слишком общим — единственная путаница, которая учит");
});

test("у каждого спрашиваемого варианта есть ярлык и разбор на обоих языках", () => {
  for (const lang of ["ru", "en"] as const) {
    for (const r of ASKABLE) {
      assert.ok(I18N[lang].probe.reactions[r], `${lang}: нет ярлыка для ${r}`);
      assert.ok(I18N[lang].probe.why[r], `${lang}: нечем объяснить ${r}`);
    }
  }
});

// --- где стоит правильный ответ -------------------------------------------

test("слот правильного ответа НЕ вычисляется из одного номера хода", () => {
  // Раньше порядок был `pool.slice(turn % 4)` при ответе всегда в `pool[0]`,
  // то есть слот = (4 - ход % 4) % 4 — одинаково в каждой партии, на каждом
  // столе, при любой реакции. Тренажёр, где ответ угадывается по номеру хода,
  // тренирует счёт до четырёх.
  for (const turn of [3, 6, 9, 12]) {
    const slots = new Set(ASKABLE.map((r) => buildProbe(r, turn)!.answer));
    assert.ok(slots.size > 1,
              `на ходу ${turn} все реакции встали в один слот — ответ читается по ходу`);
  }
});

test("и по реакции слот тоже не читается — он зависит от обоих", () => {
  const slots = new Set([3, 6, 9, 12].map((t) => buildProbe("pressured", t)!.answer));
  assert.ok(slots.size > 1, "answer position must vary across turns");
});

// --- такт вопросов --------------------------------------------------------

function play(reactions: string[]): number[] {
  let memory: ProbeMemory = { ...NO_PROBES };
  const asked: number[] = [];
  reactions.forEach((reaction, i) => {
    const turn = i + 1;
    const p = nextProbe(reaction, turn, false, memory);
    if (p) {
      asked.push(turn);
      memory = { lastTurn: turn, lastReaction: reaction };
    }
  });
  return asked;
}

test("в живой партии такт прежний — каждый третий ход", () => {
  const asked = play(["neutral", "not_yet", "pressured", "hardened", "neutral", "opened_up",
                      "warmed", "neutral", "probe_vague", "persuaded", "collaborated", "warmed"]);
  assert.deepEqual(asked, [3, 6, 9, 12]);
});

test("подряд об одном и том же не спрашивают: ответ «как в прошлый раз» — не чтение", () => {
  const asked = play(Array(12).fill("neutral"));
  // Такт сдвигается ровно на ход и не пропадает: молчащий слой неотличим от
  // невставшего, поэтому бесконечно откладывать вопрос нельзя.
  assert.deepEqual(asked, [3, 7, 11]);
});

test("пропуск ограничен одним ходом даже при неизменной реакции", () => {
  const memory: ProbeMemory = { lastTurn: 3, lastReaction: "neutral" };
  assert.equal(nextProbe("neutral", 6, false, memory), null, "ровно через такт — пропуск");
  assert.ok(nextProbe("neutral", 7, false, memory), "а дальше спрашиваем, что бы ни было");
});

test("реплей совпадает: та же партия — те же вопросы", () => {
  const moves = ["neutral", "pressured", "hardened", "opened_up", "warmed", "neutral",
                 "probe_vague", "not_yet", "collaborated", "persuaded", "neutral", "warmed"];
  assert.deepEqual(play(moves), play(moves));
});
