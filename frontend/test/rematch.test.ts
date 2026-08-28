// rematch.test.ts — «переиграй партию против себя вчерашнего».
//
// Вся ценность фичи держится на одном утверждении: движок — чистая функция от
// (сценарий, стартовые условия, порядок ходов). Если это неправда, «вы тогда»
// показывает не ту партию, которую человек сыграл, — и продукт врёт ровно в том
// месте, где обещает честность. Поэтому здесь проверяется не разметка, а
// воспроизводимость, направление «лучше/хуже», объём хранения и то, что
// сравнения нет там, где его не должно быть.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  METER_IDS, meterGaps, meterSeries, openingOf, priceGap, priceOf, priceSeries,
  sameOpening, sparkPoints,
} from "../src/lib/rematch";
// Пересчёт живёт отдельно: он единственный здесь зовёт движок-зеркало.
import { replayRun } from "../src/lib/rematchReplay";
import {
  compactRun, foldPastRun, keepRun, loadPastRun, loadPastRuns, savePastRun,
  PAST_MAX_MOVES, PAST_MAX_TABLES, PAST_MOVE_CHARS, type PastRun,
} from "../src/lib/progress";
import { analyze, applyMove, newSession, stateView } from "../src/mock/engine";
import { SCENARIO_MAP } from "../src/data/scenarios";
import type { StateView } from "../src/types";

const MOVES = [
  "Здравствуйте. Расскажите, что для вас важнее всего в этом контракте и почему?",
  "А как загрузка производства влияет на вашу цену?",
  "Давайте опираться на рыночные данные: по отрасли справедливо около 1100.",
  "Если я готов обсудить предоплату, готовы ли вы двинуться по цене?",
  "Понимаю вашу позицию. Договорились.",
];

const run = (o: Partial<PastRun> = {}): PastRun => ({
  scenarioId: "supplier",
  lang: "ru",
  at: "2026-08-01T10:00:00.000Z",
  opening: { trust: 40, tension: 25, maxTurns: 12 },
  moves: MOVES,
  grade: "B",
  score: 72,
  economic: 70,
  relationship: 66,
  technique: 60,
  dealText: "1 100 ₽/шт",
  status: "agreement",
  ...o,
});

// ---------------------------------------------------------------------------
// Воспроизводимость: та же партия, тот же стол.
// ---------------------------------------------------------------------------

test("переигровка детерминирована: два прогона совпадают полностью", () => {
  const a = replayRun(run());
  const b = replayRun(run());
  assert.ok(a && b);
  assert.deepEqual(a, b);
});

test("переигровка повторяет цикл партии ход в ход", () => {
  // Эталон считается тем же способом, каким партию исполняет MockServer:
  // инкремент хода → analyze → applyMove. Разойдись порядок — «вы тогда»
  // показывало бы партию, которой не было.
  const def = SCENARIO_MAP.supplier;
  const s = newSession(def, "ru");
  const expected: StateView[] = [];
  for (const text of MOVES) {
    if (s.status !== "active") break;
    s.turn += 1;
    applyMove(s, analyze(text), text);
    if (s.status === "active" && s.turn >= s.maxTurns) s.status = "breakdown";
    expected.push(stateView(s));
  }
  const trail = replayRun(run());
  assert.ok(trail);
  assert.deepEqual(trail.map((p) => p.state), expected);
  assert.deepEqual(trail.map((p) => p.text), MOVES.slice(0, expected.length));
  assert.deepEqual(trail.map((p) => p.turn), expected.map((_, i) => i + 1));
});

test("стартовые условия стола восстанавливаются замером, а не догадкой", () => {
  // «Холодный старт» столa дня: доверие ниже. Переигровка обязана начинать
  // оттуда же, иначе короткий/холодный стол сравнивался бы с обычным молча.
  const cold = replayRun(run({ opening: { trust: 25, tension: 25, maxTurns: 12 } }));
  const plain = replayRun(run());
  assert.ok(cold && plain);
  assert.ok(cold[0].state.trust < plain[0].state.trust);
});

test("короткий стол закрывается по своему числу ходов", () => {
  const short = replayRun(run({ opening: { trust: 40, tension: 25, maxTurns: 2 } }));
  assert.ok(short);
  assert.equal(short.length, 2);
  assert.equal(short[short.length - 1].state.status, "breakdown");
  assert.equal(short[0].state.max_turns, 2);
});

test("переигрывать нечем — честный null, а не пустая панель", () => {
  // Своя сделка: сценария нет в каталоге, и движку нечего переигрывать.
  assert.equal(replayRun(run({ scenarioId: "custom" })), null);
  assert.equal(replayRun(run({ moves: [] })), null);
});

test("openingOf снимает ровно то, что меняют модификаторы стола", () => {
  const trail = replayRun(run());
  assert.ok(trail);
  const op = openingOf({ ...trail[0].state, trust: 25, tension: 40, max_turns: 8 });
  assert.deepEqual(op, { trust: 25, tension: 40, maxTurns: 8 });
  assert.ok(sameOpening(op, { trust: 25, tension: 40, maxTurns: 8 }));
  assert.ok(!sameOpening(op, { trust: 25, tension: 40, maxTurns: 12 }));
});

// ---------------------------------------------------------------------------
// Направление «лучше/хуже» — единственное место, где сравнение может соврать.
// ---------------------------------------------------------------------------

const st = (o: Partial<StateView> = {}): StateView => ({
  trust: 50, tension: 30, info: 20, leverage: 40,
  offer_opp: 1200, offer_player: null, deal: null,
  interests_found: 0, interests_total: 3, status: "active", turn: 1, max_turns: 12,
  ...o,
});

test("цена: покупателю лучше ниже, продавцу — выше", () => {
  const then = st({ offer_opp: 1200 });
  const now = st({ offer_opp: 1100 });
  assert.equal(priceGap(then, now, true).better, true);   // dir "low" — игрок платит
  assert.equal(priceGap(then, now, false).better, false); // dir "high" — игрок получает
  assert.equal(priceGap(then, then, true).better, null);  // ничья остаётся ничьёй
  assert.equal(priceGap(then, now, true).delta, -100);
});

test("цена берётся из закрытой сделки, а не из последнего слова оппонента", () => {
  assert.equal(priceOf(st({ offer_opp: 1200, deal: 1050 })), 1050);
  assert.equal(priceOf(st({ offer_opp: 1200, deal: null })), 1200);
});

test("шкалы: напряжение — единственная, где меньше значит лучше", () => {
  const gaps = meterGaps(st(), st({ trust: 60, tension: 20, info: 40, leverage: 30 }));
  assert.equal(gaps.trust.better, true);
  assert.equal(gaps.tension.better, true);   // 30 → 20
  assert.equal(gaps.info.better, true);
  assert.equal(gaps.leverage.better, false); // 40 → 30
  assert.deepEqual(METER_IDS, ["trust", "tension", "info", "leverage"]);
});

test("ряды по ходам идут в порядке ходов", () => {
  const trail = replayRun(run());
  assert.ok(trail);
  assert.deepEqual(priceSeries(trail), trail.map((p) => priceOf(p.state)));
  assert.deepEqual(meterSeries(trail, "trust"), trail.map((p) => p.state.trust));
});

test("две линии спарклайна живут в одной системе координат", () => {
  // Иначе «выше на картинке» перестаёт значить «больше в числах»: короткая
  // партия растянулась бы на всю ширину, а слабый ряд — на всю высоту.
  const { a, b } = sparkPoints([0, 50, 100], [100, 50, 0]);
  const ys = (s: string) => s.split(" ").map((p) => Number(p.split(",")[1]));
  const xs = (s: string) => s.split(" ").map((p) => Number(p.split(",")[0]));
  assert.deepEqual(ys(a), [100, 50, 0]); // 0 внизу, 100 наверху (SVG вниз растёт)
  assert.deepEqual(ys(b), [0, 50, 100]);
  assert.deepEqual(xs(a), [0, 50, 100]);
  // Более короткий ряд не растягивается на всю ширину: горизонт общий.
  const two = sparkPoints([10, 20, 30, 40], [10, 20]);
  assert.deepEqual(xs(two.b), [0, 33.33]);
  // Плоский ряд не делит на ноль.
  assert.ok(sparkPoints([5, 5], [5, 5]).a.length > 0);
  assert.ok(sparkPoints([], []).a === "");
});

// ---------------------------------------------------------------------------
// Хранение: компактно, лучшее на стол, потолок на число столов.
// ---------------------------------------------------------------------------

test("хранится вход движка, а не картинка партии", () => {
  const r = compactRun(run({ moves: ["x".repeat(PAST_MOVE_CHARS + 50), ...MOVES] }));
  assert.equal(r.moves[0].length, PAST_MOVE_CHARS);
  const many = compactRun(run({ moves: Array.from({ length: 40 }, (_, i) => `ход ${i}`) }));
  assert.equal(many.moves.length, PAST_MAX_MOVES);
  // Никаких состояний, дельт и реплик оппонента: их пересчитает движок.
  assert.deepEqual(Object.keys(r).sort(), [
    "at", "dealText", "economic", "grade", "lang", "moves", "opening",
    "relationship", "scenarioId", "score", "status", "technique",
  ]);
});

test("на столе остаётся ЛУЧШАЯ партия — неудача не стирает взятую планку", () => {
  const good = run({ grade: "B", score: 72 });
  const bad = run({ grade: "D", score: 44, at: "2026-08-02T10:00:00.000Z" });
  assert.equal(keepRun(bad, good).grade, "B");
  assert.equal(keepRun(run({ grade: "A", score: 90 }), good).grade, "A");
  assert.equal(keepRun(good, null).grade, "B");
});

test("сменился язык — прошлая стенограмма для сравнения бесполезна", () => {
  // Реплики опознаются по ключевым словам СВОЕГО языка: русскую партию нельзя
  // переигрывать по-английски, иначе вскрытые интересы молча потеряются.
  const ru = run({ grade: "A", score: 90 });
  const en = run({ lang: "en", grade: "F", score: 20 });
  assert.equal(keepRun(en, ru).lang, "en");
});

test("столов в хранилище не больше потолка — вытесняется самый старый", () => {
  let tables: Record<string, PastRun> = {};
  for (let i = 0; i < PAST_MAX_TABLES + 3; i++) {
    tables = foldPastRun(tables, run({
      scenarioId: `table-${i}`,
      at: `2026-08-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
    }));
  }
  assert.equal(Object.keys(tables).length, PAST_MAX_TABLES);
  assert.ok(!tables["table-0"], "самый старый стол обязан вытесняться");
  assert.ok(tables[`table-${PAST_MAX_TABLES + 2}`], "только что сыгранный стол обязан остаться");
});

test("localStorage: запись, чтение и защита от испорченного блоба", () => {
  const store = new Map<string, string>();
  const g = globalThis as Record<string, unknown>;
  const had = "localStorage" in g;
  const prev = g.localStorage;
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  try {
    assert.equal(loadPastRun("supplier"), null);
    const stored = savePastRun(run());
    assert.equal(stored.grade, "B");
    assert.deepEqual(loadPastRun("supplier"), compactRun(run()));

    // Объём. Партия — это двенадцать реплик; блоб обязан оставаться килобайтами,
    // а не мегабайтами, иначе квота localStorage унесёт с собой профиль.
    const blob = store.get("dialog.pastruns.v1") ?? "";
    assert.ok(blob.length < 4096, `одна партия занимает ${blob.length} байт`);

    // Испорченный блоб — «сравнивать не с чем», а не исключение в партию.
    store.set("dialog.pastruns.v1", "{не json");
    assert.deepEqual(loadPastRuns(), {});
    store.set("dialog.pastruns.v1", JSON.stringify({ v: 1, tables: { x: { grade: "Z" } } }));
    assert.deepEqual(loadPastRuns(), {});
  } finally {
    if (had) g.localStorage = prev;
    else delete g.localStorage;
  }
});

// ---------------------------------------------------------------------------
// Инварианты продукта.
// ---------------------------------------------------------------------------

test("сравнение не ходит в сеть: инвариант 5", () => {
  const g = globalThis as Record<string, unknown>;
  const original = g.fetch;
  const calls: string[] = [];
  g.fetch = (...args: unknown[]) => {
    calls.push(String(args[0]));
    throw new Error("сеть запрещена в этом тесте");
  };
  try {
    const trail = replayRun(run());
    assert.ok(trail && trail.length > 0);
    meterGaps(trail[0].state, trail[trail.length - 1].state);
    priceGap(trail[0].state, trail[trail.length - 1].state, true);
  } finally {
    if (original) g.fetch = original;
    else delete g.fetch;
  }
  assert.deepEqual(calls, [], `сравнение постучалось в сеть: ${calls.join(", ")}`);
});

test("ни одно число сравнения не входит в оценку: инварианты 3 и 6", () => {
  // Структурно: слой сравнения не умеет считать балл — он вообще не знает про
  // scoreSession. Пропусти эту проверку, и «послесловие» однажды станет второй
  // оценкой на той же странице.
  for (const file of ["src/lib/rematch.ts", "src/components/Rematch.tsx"]) {
    const src = readFileSync(file, "utf8");
    assert.doesNotMatch(src, /scoreSession/, `${file}: сравнение считает балл`);
    assert.doesNotMatch(src, /overall\s*=/, `${file}: сравнение пересчитывает overall`);
  }
});

test("на экзамене сравнения нет", () => {
  // Экзамен идёт без подсказок и сопровождения; переигровка против себя — это
  // сопровождение. Отсекается в двух местах, и оба обязаны быть на месте:
  // App вообще не записывает и не показывает партию вне практики, а Debrief
  // гасит карточку сам — тем же `exam`, что гасит Карла и рекомендации курса.
  const app = readFileSync("src/App.tsx", "utf8");
  assert.match(app, /mode !== "practice"[^\n]*\|\|/,
    "App пишет прошлую партию не только в практике");
  const showRival = app.match(/const showRival =[\s\S]*?;/);
  assert.ok(showRival, "showRival в App.tsx не найден — тест устарел вместе с кодом");
  assert.match(showRival[0], /mode === "practice"/,
    "панель сравнения показывается вне практики");

  const debrief = readFileSync("src/components/Debrief.tsx", "utf8");
  const showRematch = debrief.match(/const showRematch =[^\n]*/);
  assert.ok(showRematch, "showRematch в Debrief.tsx не найден — тест устарел вместе с кодом");
  assert.match(showRematch[0], /!exam/, "карточка переигровки не погашена на экзамене");
});

test("«А что если…» осталось при своём: один ход, а не партия", () => {
  // Требование «не ломать существующее»: развилка — это ОДИН ход из середины
  // партии, и она не должна была превратиться в переигровку целиком.
  const src = readFileSync("src/api/whatif.ts", "utf8");
  assert.match(src, /turnIndex/);
  // Код переигровки (без комментариев — в шапке развилка честно упомянута как
  // соседняя механика) не зовёт её ни одной строкой: это две разные вещи.
  const lib = readFileSync("src/lib/rematch.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(lib, /whatIf/i, "переигровка полезла в развилку одного хода");
});
