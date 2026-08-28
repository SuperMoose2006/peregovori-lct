// engineEdges.test.ts — углы офлайн-ядра, до которых не доходит обычная партия.
//
// Зеркало services/gateway/tests/test_engine_edges.py: там те же углы проверяются
// на движке-источнике. Инвариант 8 держится не тем, что оба файла существуют, а
// тем, что они спрашивают одно и то же.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENARIOS, SCENARIO_MAP } from "../src/data/scenarios";
import { analyze, applyMove, newSession, scoreSession, stateView } from "../src/mock/engine";
import { offerNumber, norm } from "../src/lib/techniques";
import type { Lang } from "../src/types";

const CORPUS = [
  "Почему для вас это важно?",
  "Я вас понимаю, справедливо.",
  "По рынку медиана 88, данные показывают это.",
  "У нас есть альтернатива, конкурент даёт дешевле потому что объём.",
  "Взамен мы дадим предоплату, если вы подвинетесь.",
  "Иначе мы уходим.",
  "Это смешно, вы некомпетентны.",
  "Наша цена 90.",
  "Договорились.",
  "Сколько вы сейчас теряете?",
  "Что вас беспокоит больше всего?",
  "Рад встрече!",
  "",
  "?",
  "Ага 1.",
  "Готовы уступить до 95.",
  "Договорились, иначе мы уходим.",
  "По рукам, вы врете, но ладно.",
  "Договорились на 84.",
];

function play(scenarioId: string, lines: string[], lang: Lang = "ru", difficulty?: number) {
  const s = newSession(SCENARIO_MAP[scenarioId], lang);
  if (difficulty !== undefined) s.difficulty = difficulty;
  for (const text of lines) {
    if (s.status !== "active") break;
    s.turn += 1;
    applyMove(s, analyze(text), text);
  }
  return s;
}

// Детерминированный ГПСЧ: тест обязан падать всегда или не падать никогда.
function rng(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

test("оппонент не выходит за отрезок «открытие → дно» при случайной игре", () => {
  const rand = rng(20240828);
  const problems: string[] = [];
  for (const sc of SCENARIOS) {
    const lo = Math.min(sc.open, sc.floor);
    const hi = Math.max(sc.open, sc.floor);
    for (const diff of [1, 2, 3, 4, 5]) {
      for (let t = 0; t < 40; t++) {
        const n = 1 + Math.floor(rand() * 14);
        const lines = Array.from({ length: n }, () => CORPUS[Math.floor(rand() * CORPUS.length)]);
        const s = play(sc.id, lines, "ru", diff);
        if (!(s.offerOpp >= lo - 1e-9 && s.offerOpp <= hi + 1e-9)) {
          problems.push(`${sc.id}/d${diff}: ${s.offerOpp} вне [${lo}, ${hi}]`);
        }
        for (const [name, v] of [["trust", s.trust], ["tension", s.tension], ["info", s.info], ["leverage", s.leverage]] as const) {
          if (!(v >= 0 && v <= 100)) problems.push(`${sc.id}/d${diff}: ${name}=${v}`);
        }
      }
    }
  }
  assert.deepEqual(problems.slice(0, 10), [], "оппонент или шкала вышли за коридор");
});

test("срыв в том же ходу не оставляет сделки на столе", () => {
  // Одна реплика умеет и закрыть, и сорвать: accept записывает сделку, хамство в
  // той же строке добивает напряжение до ста. Число сделки на сорванном столе —
  // ровно то «выглядит настоящим, а внутри пусто», которого не должно быть.
  const s = newSession(SCENARIO_MAP.supplier, "ru");
  s.tension = 92;
  s.turn += 1;
  const line = "По рукам, вы врете, но ладно.";
  const r = applyMove(s, analyze(line), line);
  assert.equal(s.status, "breakdown");
  assert.equal(r.closed, true);
  assert.equal(s.deal, null);
  assert.equal(stateView(s).deal, null);
  assert.equal(scoreSession(s).economic, 0);

  // …а без напряжения та же реплика закрывается — значит проверка не пустая.
  const ok = newSession(SCENARIO_MAP.supplier, "ru");
  ok.turn += 1;
  applyMove(ok, analyze(line), line);
  assert.equal(ok.status, "agreement");
  assert.equal(ok.deal, 100);
});

test("кириллическая «к» после числа — это тысячи, как и в движке-источнике", () => {
  // `\b` в питоне юникодный, в JS — нет: после «к» границы слова не возникало, и
  // «даю 88к» несло цену на сервере и ничего в браузере (инвариант 8).
  for (const [text, want] of [["даю 88к", 88], ["даю 88 к", 88], ["даю 88k", 88], ["даю 88 тыс", 88]] as const) {
    assert.equal(offerNumber(norm(text), []), want, text);
  }
  assert.equal(analyze("сдвинемся до 88к сегодня").number, 88);
});

test("нелатинские цифры ценой не считаются", () => {
  // `\d` в питоне ловит любую десятичную цифру юникода, здесь — только [0-9].
  // Класс сужен на сервере; тест держит зеркало на той же стороне.
  for (const text of ["наша цена ٩٠", "наша цена ９０", "наша цена ௧௰"]) {
    assert.equal(analyze(text).number, null, text);
  }
});

test("счётчик разменов доходит до трёх — столько же, сколько на сервере", () => {
  // tradeoffs_used упирается в ДЛИНУ списка разменов сценария, а он живёт в двух
  // файлах. Когда в зеркале их было два против трёх, разбор писал «3» онлайн и
  // «2» офлайн на одной и той же партии.
  for (const sc of SCENARIOS) {
    assert.equal(sc.tradeoffs.ru.length, 3, sc.id);
    assert.equal(sc.tradeoffs.en.length, 3, sc.id);
  }
  const s = play("supplier", [
    "Взамен мы дадим предоплату, если вы подвинетесь до 90.",
    "В обмен на годовой контракт — 88?",
    "При условии совместного прогноза спроса, готовы на 87?",
  ]);
  assert.equal(scoreSession(s).tradeoffs, 3);
});

test("косметика не оживляет повтор", () => {
  const base = "По рынку медиана 88 по трём независимым прайсам, потому что объём вырос.";
  const mutations: [string, (s: string, i: number) => string][] = [
    ["дословно", (s) => s],
    ["регистр", (s, i) => (i % 2 ? s.toUpperCase() : s)],
    ["пунктуация", (s, i) => s.replaceAll(".", "!".repeat(i + 1))],
    ["перестановка слов", (s, i) => [...s.split(" ").slice(i % 7), ...s.split(" ").slice(0, i % 7)].join(" ")],
    ["эмодзи", (s, i) => `${s} ${"🙂".repeat(i + 1)}`],
    ["нулевая ширина", (s, i) => s + "​".repeat(i + 1)],
    ["одно новое слово", (s, i) => `${s} уточнение${i}`],
  ];
  for (const [name, mutate] of mutations) {
    const s = play("supplier", Array.from({ length: 12 }, (_, i) => mutate(base, i)));
    assert.equal(scoreSession(s).grade, "F", name);
    assert.ok(s.offerOpp > 92, `${name}: цена уехала до ${s.offerOpp}`);
  }
});
