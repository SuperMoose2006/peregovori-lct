// Инвариант 5: без ИИ и без сети продукт полностью играбелен.
//
// Это самый легко теряемый инвариант, потому что теряется он ДОБАВЛЕНИЕМ. Никто
// не «выключает офлайн» — кто-то добавляет полезный запрос к серверу и не
// замечает, что без него экран теперь пустой. Так уже было: коуч курса стучался
// в пустоту на каждом упражнении и писал ошибку в консоль.
//
// Поэтому здесь проверяется не «работает ли офлайн», а более сильное: что
// офлайновый путь НЕ ХОДИТ В СЕТЬ ВОВСЕ. Упавший fetch и отсутствующий fetch
// выглядят одинаково для человека и по-разному для продукта: первый стоит
// таймаута на каждом действии.
import test from "node:test";
import assert from "node:assert/strict";
import { synthCampaigns } from "../src/data/campaigns";
import { dailyTable } from "../src/lib/daily";
import { buildProbe, shouldProbe } from "../src/lib/probe";
import { COURSE_BANK } from "../src/data/course.generated";
import { COURSE_BLOCKS } from "../src/data/course.blocks.generated";
import { check } from "../src/lib/courseCheck";
import { analyze, applyMove, newSession, scoreSession } from "../src/mock/engine";
import { SCENARIO_MAP, SCENARIOS } from "../src/data/scenarios";

/** Запретить сеть целиком и вернуть счётчик попыток. */
function forbidNetwork(): { calls: string[]; restore: () => void } {
  const calls: string[] = [];
  const g = globalThis as Record<string, unknown>;
  const original = g.fetch;
  g.fetch = (...args: unknown[]) => {
    calls.push(String(args[0]));
    throw new Error("сеть запрещена в этом тесте");
  };
  // Подмена обязана быть настоящей: если fetch в этой среде отсутствует,
  // «ноль запросов» ничего не доказывает — доказывать будет нечему.
  if (typeof original !== "function") {
    throw new Error("в этой среде нет fetch — тест ничего не сторожит");
  }
  return { calls, restore: () => { g.fetch = original; } };
}

test("полная партия играется офлайн-ядром без единого запроса", () => {
  const net = forbidNetwork();
  try {
    for (const sc of SCENARIOS) {
      const s = newSession(sc, "ru");
      const lines = [
        "Что для вас важнее всего в этой сделке и почему именно это?",
        "Я вас слышу. А чем это грозит, если ничего не менять?",
        "По рыночным данным ориентир другой; давайте опираться на них.",
        "Если мы дадим объём и предоплату — сможете подвинуться?",
      ];
      for (const line of lines) {
        s.turn += 1;
        applyMove(s, analyze(line), line);
      }
      const deb = scoreSession(s);
      assert.ok(deb.overall >= 0 && deb.overall <= 100, `${sc.id}: ${deb.overall}`);
      assert.ok("ABCDF".includes(deb.grade), `${sc.id}: грейд ${deb.grade}`);
    }
  } finally {
    net.restore();
  }
  assert.deepEqual(net.calls, [], "офлайн-партия ходила в сеть");
});

/** Эталонный ответ упражнения — тот, который зачёт обязан принять. */
function referenceAnswer(ex: Record<string, unknown>, lang: "ru" | "en"): unknown {
  if (ex.type === "freeform") {
    const ref = ex.reference as Record<string, string> | undefined;
    return ref ? ref[lang] : "";
  }
  const a = ex.answer as unknown;
  // `numeric` хранит эталон как {value, tolerance} — предикат ждёт число.
  if (ex.type === "numeric" && a && typeof a === "object") {
    return (a as { value: number }).value;
  }
  // `match` хранит эталон парами left→right; предикат ждёт словарь.
  if (ex.type === "match" && Array.isArray(a)) {
    const left = ex.left as string[];
    return Object.fromEntries((a as string[]).map((r, i) => [left[i], r]));
  }
  return a;
}

test("курс зачитывает эталонный ответ офлайн, без единого запроса", () => {
  // Инвариант 9 со стороны браузера: правильный ответ обязан быть правильным, и
  // обязан быть таким БЕЗ СЕТИ. Предикат тот же, что на сервере; если он тихо
  // начнёт спрашивать разрешения у бэкенда, курс перестанет проходиться в
  // самолёте — и заметить это по экрану будет нечем, кроме задержки.
  const net = forbidNetwork();
  const failed: string[] = [];
  try {
    for (const ex of COURSE_BANK as unknown as Record<string, unknown>[]) {
      // Капстоун — настоящая партия, а не карточка: эталон ему не подставить.
      if (ex.type === "drill") continue;
      const v = check(ex as never, referenceAnswer(ex, "ru") as never, "ru");
      if (!v?.ok) failed.push(String(ex.id));
    }
  } finally {
    net.restore();
  }
  assert.deepEqual(failed, [], "эталонный ответ не зачтён офлайн");
  assert.deepEqual(net.calls, [], "проверка курса ходила в сеть");
});

test("кампании, стол дня и слой «читай лицо» считаются офлайн", () => {
  const net = forbidNetwork();
  try {
    for (const lang of ["ru", "en"] as const) {
      const cs = synthCampaigns(lang);
      assert.ok(cs.length >= 2, "кампании не синтезировались");
      for (const c of cs) assert.ok(c.stages.length === 4, c.id);
    }
    const t = dailyTable(new Date(2026, 7, 28));
    assert.ok(SCENARIO_MAP[t.scenarioId], "стол дня указал в пустоту");
    assert.ok(shouldProbe(6, false));
    assert.ok(buildProbe("warmed", 6));
  } finally {
    net.restore();
  }
  assert.deepEqual(net.calls, [], "офлайновые части ходили в сеть");
});

test("курс на диске цел: у каждого блока есть уроки и задания", () => {
  assert.ok(COURSE_BLOCKS.length >= 9);
  for (const b of COURSE_BLOCKS) {
    assert.ok(b.lessons.length > 0, `${b.id}: нет уроков`);
    const own = COURSE_BANK.filter((e) => e.block === b.id);
    assert.ok(own.length > 0, `${b.id}: нет заданий`);
    assert.ok(own.some((e) => e.type === "drill"), `${b.id}: нет капстоуна`);
  }
});
