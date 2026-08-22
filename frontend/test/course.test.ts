// Курс проверяется тем же движком, что и партия, — и это тест ровно об этом.
//
// Банк доказан на стороне Python против настоящего движка. Здесь доказывается
// вторая половина: браузерное зеркало движка выносит ТЕ ЖЕ вердикты. Если
// mock/engine.ts и engine.py разойдутся, «правильный ответ» в упражнении
// перестанет быть правильным в офлайновой партии — а это и есть тихая ложь,
// ради предотвращения которой курс вообще генерируется, а не пишется дважды.
import test from "node:test";
import assert from "node:assert/strict";
import {
  COURSE_BANK, COURSE_BLOCKS, check, checkFreeform, drawExam, exercisesOf,
  metersOptions, reactionOptions, shuffledRight, simulate, startingOrder,
} from "../src/lib/course";
import type { Lang } from "../src/types";

const LANGS: Lang[] = ["ru", "en"];

test("каждый блок курса имеет уроки и как минимум пять упражнений", () => {
  assert.equal(COURSE_BLOCKS.length, 9);
  for (const b of COURSE_BLOCKS) {
    assert.ok(b.lessons.length >= 4, b.id);
    assert.ok(exercisesOf(b.id).length >= 5, b.id);
    for (const l of b.lessons) assert.ok(l.title.ru && l.title.en && l.body.ru && l.body.en);
  }
});

test("эталонный ответ каждого свободного упражнения проходит свой же предикат", () => {
  for (const ex of COURSE_BANK.filter((x) => x.type === "freeform")) {
    for (const lang of LANGS) {
      const v = checkFreeform(ex, ex.reference![lang], lang);
      assert.ok(v.ok, `${ex.id}/${lang}: ${v.reasons.join(", ")}`);
    }
  }
});

test("верный вариант выбора даёт заявленные приёмы в браузерном движке", () => {
  for (const ex of COURSE_BANK.filter((x) => x.type === "choice" && x.expect_moves)) {
    for (const lang of LANGS) {
      const text = (ex.options![ex.answer as number] as Record<Lang, string>)[lang];
      const v = checkFreeform({ ...ex, check: { require_moves: ex.expect_moves } }, text, lang);
      assert.ok(v.ok, `${ex.id}/${lang}: ${v.moves?.join(",")}`);
    }
  }
});

test("ответы reaction/meters совпадают с тем, что считает движок в браузере", () => {
  for (const ex of COURSE_BANK.filter((x) => x.type === "reaction" || x.type === "meters")) {
    for (const lang of LANGS) {
      const out = simulate(ex.scenario_id!, lang, ex.player_line![lang], ex.state);
      assert.ok(out, ex.id);
      if (ex.type === "reaction") {
        assert.equal(out!.reaction, ex.answer, `${ex.id}/${lang}`);
      } else if ((ex.ask ?? "largest_delta") === "largest_delta") {
        const metersOrder = ["trust", "tension", "info", "leverage"];
        const largest = metersOrder.reduce((a, b) =>
          Math.abs(out!.deltas[b] ?? 0) > Math.abs(out!.deltas[a] ?? 0) ? b : a);
        assert.equal(largest, ex.answer, `${ex.id}/${lang}`);
      } else {
        const meter = (ex.ask as string).split(":")[1];
        const sign = (out!.deltas[meter] ?? 0) > 0 ? "up" : "down";
        assert.equal(sign, ex.answer, `${ex.id}/${lang}`);
      }
    }
  }
});

test("верный ответ всегда среди предложенных вариантов", () => {
  for (const ex of COURSE_BANK) {
    if (ex.type === "reaction") assert.ok(reactionOptions(ex).includes(ex.answer as never), ex.id);
    if (ex.type === "meters") assert.ok(metersOptions(ex).includes(ex.answer as string), ex.id);
  }
});

test("check() засчитывает эталонный ответ у всех типов, где он записан", () => {
  for (const ex of COURSE_BANK) {
    if (ex.type === "choice" || ex.type === "spot_error") {
      assert.ok(check(ex, ex.answer, "ru").ok, ex.id);
      assert.ok(!check(ex, ((ex.answer as number) + 1) % ex.options!.length, "ru").ok, ex.id);
    }
    if (ex.type === "order" || ex.type === "match" || ex.type === "numeric") {
      const given = ex.type === "numeric" ? (ex.answer as { value: number }).value : ex.answer;
      assert.ok(check(ex, given, "ru").ok, ex.id);
    }
    if (ex.type === "reaction" || ex.type === "meters") {
      assert.ok(check(ex, ex.answer, "ru").ok, ex.id);
    }
  }
});

test("выборка экзамена детерминирована, включает капстоун и требует 80%", () => {
  const a = drawExam("closing", 0);
  const b = drawExam("closing", 0);
  assert.deepEqual(a.items.map((x) => x.id), b.items.map((x) => x.id));
  const other = drawExam("closing", 1);
  assert.notDeepEqual(a.items.map((x) => x.id), other.items.map((x) => x.id));
  assert.equal(a.items[a.items.length - 1].type, "drill", "капстоун идёт последним");
  assert.equal(a.total, 6); // четыре обычных + капстоун весом два
  assert.equal(a.passMark, Math.ceil(6 * 0.8));
});

test("предикат капстоуна смотрит только в состояние движка", () => {
  const allowed = new Set(["status", "deal", "interests_found", "tension", "trust",
    "info", "leverage", "turn", "terms_conceded"]);
  for (const ex of COURSE_BANK.filter((x) => x.type === "drill")) {
    for (const c of ex.pass!) assert.ok(allowed.has(c.field), `${ex.id}: ${c.field}`);
  }
});

test("стартовая раскладка «порядка» и «соответствия» не является ответом", () => {
  // Иначе оба типа решались бы нажатием «Проверить» без единого действия:
  // в банке элементы перечислены в правильном порядке — так их удобнее читать
  // и проверять тестами, но показывать так нельзя.
  for (const ex of COURSE_BANK.filter((x) => x.type === "order")) {
    const start = startingOrder(ex);
    const answer = ex.answer as string[];
    assert.equal(start.length, answer.length, ex.id);
    assert.deepEqual([...start].sort(), [...answer].sort(), `${ex.id}: те же элементы`);
    assert.notDeepEqual(start, answer, `${ex.id}: старт не должен быть ответом`);
    assert.deepEqual(startingOrder(ex), start, `${ex.id}: раскладка воспроизводима`);
  }
  for (const ex of COURSE_BANK.filter((x) => x.type === "match")) {
    const right = shuffledRight(ex);
    const answer = ex.answer as Record<string, string>;
    assert.equal(right.length, (ex.right ?? []).length, ex.id);
    const parallel = (ex.left ?? []).every((l, i) => answer[l.id] === right[i]?.id);
    assert.equal(parallel, false, `${ex.id}: колонки не должны идти параллельно`);
    assert.deepEqual(shuffledRight(ex).map((r) => r.id), right.map((r) => r.id), `${ex.id}: воспроизводимо`);
  }
});
