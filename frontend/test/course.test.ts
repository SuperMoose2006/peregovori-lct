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
  COURSE_BANK, COURSE_BLOCKS, SKILL_BLOCK, blockForWeakest, drawExam,
  exercisesOf, faceImage,
  metersOptions, reactionOptions, shuffledOptions, shuffledRight, startingOrder,
} from "../src/lib/course";
// Зачёт живёт отдельно от данных курса: только он тянет движок-зеркало.
import { check, checkFreeform, simulate } from "../src/lib/courseCheck";
import type { Lang } from "../src/types";

const LANGS: Lang[] = ["ru", "en"];

test("каждый блок курса имеет уроки и как минимум пять упражнений", () => {
  assert.equal(COURSE_BLOCKS.length, 11);
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

test("позиция верного варианта перемешана и ничего не подсказывает", () => {
  // В банке верный вариант оказался вторым в двенадцати пунктах из шестнадцати:
  // так писать удобнее, но игрок, заметивший это, решает курс не читая.
  const picks: number[] = [];
  for (const ex of COURSE_BANK.filter((x) => x.type === "choice" || x.type === "spot_error")) {
    const { options, answer } = shuffledOptions(ex);
    assert.equal(options.length, ex.options!.length, ex.id);
    assert.deepEqual(options[answer], ex.options![ex.answer as number], `${ex.id}: ответ тот же`);
    assert.deepEqual(shuffledOptions(ex).answer, answer, `${ex.id}: раскладка воспроизводима`);
    picks.push(answer);
  }
  const counts = picks.reduce<Record<number, number>>((m, i) => ({ ...m, [i]: (m[i] ?? 0) + 1 }), {});
  const worst = Math.max(...Object.values(counts));
  assert.ok(worst <= Math.ceil(picks.length * 0.5),
    `верный вариант слишком часто на одной позиции: ${JSON.stringify(counts)}`);
});

test("разбор указывает на блок, который тренирует самый слабый навык", () => {
  // Просадка в вопросах ведёт в SPIN, в интересах — в «позиции и интересы»,
  // и так далее. Ровный разбор не предлагает ничего: подтягивать нечего.
  assert.equal(blockForWeakest({ questions: 0, interests: 90, criteria: 90,
    listening: 90, tradeoff: 90, tension: 90 }), "spin-ladder");
  assert.equal(blockForWeakest({ questions: 90, interests: 10, criteria: 90,
    listening: 90, tradeoff: 90, tension: 90 }), "foundations");
  assert.equal(blockForWeakest({ questions: 90, interests: 90, criteria: 90,
    listening: 90, tradeoff: 90, tension: 30 }), "pressure-defense");
  assert.equal(blockForWeakest({ questions: 100, interests: 100, criteria: 100,
    listening: 100, tradeoff: 100, tension: 100 }), null);
  // Каждый навык обязан вести в существующий блок, иначе кнопка ведёт в никуда.
  for (const id of Object.values(SKILL_BLOCK)) {
    assert.ok(COURSE_BLOCKS.some((b) => b.id === id), id);
  }
});

test("«прочитай лицо»: картинка есть, ответ среди вариантов, дистракторы не совпадают", () => {
  // Картинок меньше, чем реакций (nod и smile рисуются как warm, shake_head —
  // как annoyed). Если дистрактор выглядит так же, как ответ, у задания два
  // одинаково верных ответа — и это тихая ложь, а не сложность.
  const drawn = (r: string) => faceImage({ id: "x", type: "face", scenario_id: "rent",
    answer: r } as never);
  for (const ex of COURSE_BANK.filter((x) => x.type === "face")) {
    const img = faceImage(ex);
    assert.ok(img && img.endsWith(".webp"), ex.id);
    const options = reactionOptions(ex);
    assert.ok(options.includes(ex.answer as never), ex.id);
    for (const other of options) {
      if (other === ex.answer) continue;
      assert.notEqual(drawn(other), drawn(String(ex.answer)), `${ex.id}: ${other}`);
    }
  }
});
