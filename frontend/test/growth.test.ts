// growth.test.ts — история партий и ЧЕСТНОСТЬ вывода о росте.
//
// Продукт обещает, что человек становится лучше, и показать это ему было
// нечем: профиль хранил бегущее среднее по шести навыкам — ответ на вопрос
// «сколько у меня сейчас», а не «стало ли лучше, чем три недели назад».
// `lib/growth.ts` заводит ленту партий и вывод о тенденции над ней.
//
// ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ, и почему именно это:
//
//  1. ТОЧКА НА ГРАФИКЕ — ТО ЖЕ ЧИСЛО, ЧТО ДАЛО ГРЕЙД. Прогоном настоящего
//     офлайн-движка, а не сравнением полей на глаз: в этом продукте уже
//     случалось, что игроку рисовали одно число, а в оценку уходило соседнее
//     похожее. Отдельно проверено, что судейский `avg_arg` в график не течёт.
//  2. ТЕНДЕНЦИЯ НЕ ОБЪЯВЛЯЕТСЯ НА МАЛЫХ ДАННЫХ. Линию по двум точкам нарисовать
//     можно всегда — это ровно то «выглядит настоящим, а внутри пусто», которого
//     по принципу 2 не бывает.
//  3. ШУМ НЕ СЧИТАЕТСЯ РОСТОМ. Две ловушки: одна партия, шагнувшая на одну
//     ступень грубой шкалы, и ряд с НУЛЕВЫМ разбросом, где любая мелочь
//     формально значима.
//  4. ХРАНИЛИЩЕ НЕ РОНЯЕТ ИГРУ. Приватный режим и переполненная квота бросают
//     исключение прямо из `setItem`.
//  5. ИСТОРИЯ НЕ ТРОГАЕТ ОЦЕНКУ (инвариант 6).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  HISTORY_MAX, HISTORY_RESCUE, TREND_MIN, TREND_WINDOW,
  appendHistory, foldHistory, growthView, loadHistory, movedMost,
  overallFloor, pointFrom, saveHistory, skillFloor, trendOf,
  type HistoryPoint,
} from "../src/lib/growth";
import {
  SKILL_IDS, applyDebrief, emptyProfile, loadProfile, skillSignals, type SkillId,
} from "../src/lib/progress";
import { analyze, applyMove, newSession, scoreSession } from "../src/mock/engine";
import { SCENARIO_MAP } from "../src/data/scenarios";
import type { Debrief } from "../src/types";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

// ---------------------------------------------------------------- помощники

/** Подменённое хранилище. `fail` даёт возможность сломать запись так, как её
 *  ломает браузер: исключением из setItem. */
function withStore<T>(
  fn: (store: Map<string, string>) => T,
  fail: (calls: number) => boolean = () => false,
): T {
  const store = new Map<string, string>();
  const g = globalThis as Record<string, unknown>;
  const had = "localStorage" in g;
  const prev = g.localStorage;
  let calls = 0;
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      calls += 1;
      if (fail(calls)) throw new Error("QuotaExceededError");
      store.set(k, v);
    },
    removeItem: (k: string) => void store.delete(k),
  };
  try {
    return fn(store);
  } finally {
    if (had) g.localStorage = prev;
    else delete g.localStorage;
  }
}

const skills = (v: Partial<Record<SkillId, number>>): Record<SkillId, number> => {
  const out = {} as Record<SkillId, number>;
  for (const id of SKILL_IDS) out[id] = v[id] ?? 0;
  return out;
};

const pt = (overall: number, extra: Partial<HistoryPoint> = {}): HistoryPoint => ({
  at: "2026-01-01T00:00:00.000Z",
  scenarioId: "supplier",
  grade: "C",
  overall,
  skills: skills({}),
  ...extra,
});

/** Ряд точек из значений `overall`. */
const series = (values: number[]) => values.map((v) => pt(v));

/** Ряд, где один навык принимает заданные значения. */
const skillSeries = (id: SkillId, values: number[]) =>
  values.map((v) => pt(50, { skills: skills({ [id]: v }) }));

// Тот же цикл, что у MockServer.handleTurn (см. test/games.test.ts).
function play(scenarioId: string, lines: string[]) {
  const s = newSession(SCENARIO_MAP[scenarioId], "ru");
  for (const text of lines) {
    if (s.status !== "active") break;
    s.turn += 1;
    applyMove(s, analyze(text), text);
    if (s.status === "active" && s.turn >= s.maxTurns) s.status = "breakdown";
  }
  return scoreSession(s);
}

// ============================================================================
// 1. Точка взята из того же разбора, что и грейд
// ============================================================================

test("прогон движка: точка графика — тот же счёт, из которого вышла буква", () => {
  // Три РАЗНЫЕ по качеству партии настоящим офлайн-движком. Проверяется не
  // «поле скопировалось», а что нарисованное число и есть оценённое: `overall`
  // пересчитывается из трёх шкал по инварианту 3 и обязан сойтись с точкой.
  const games: [string, string[]][] = [
    ["supplier", ["Ага.", "Ага.", "Ага.", "Ага.", "Ага."]],
    ["supplier", [
      "Давайте разберёмся: почему для вас важна именно загрузка производства?",
      "Что происходит, когда объём падает ниже плана?",
      "По рыночным данным медиана независимых прайсов — 87, это отраслевой стандарт.",
      "Понимаю, что для вас критична предоплата — это про кассовый разрыв?",
      "Давайте разменяем: мы даём предоплату 50%, вы двигаетесь по цене до 88.",
      "Договорились, 88.",
    ]],
    ["salary", [
      "Почему для компании сейчас важен именно этот бюджет?",
      "Что будет с проектом, если роль останется незакрытой ещё квартал?",
      "По обзору рынка медиана для этой позиции — 320, это объективный критерий.",
      "Готов взять на себя ещё и наставничество, если мы сойдёмся на 320.",
      "Договорились.",
    ]],
  ];

  for (const [scenarioId, lines] of games) {
    const d = play(scenarioId, lines);
    const p = pointFrom(scenarioId, d, new Date("2026-05-01T10:00:00.000Z"));

    assert.equal(p.overall, d.overall, `${scenarioId}: на графике не тот счёт, что в разборе`);
    assert.equal(p.grade, d.grade, `${scenarioId}: буква разошлась с разбором`);
    // Инвариант 3 — доказательство, что это ИМЕННО оценённое число, а не
    // соседнее похожее поле.
    const recomputed = 0.4 * d.economic + 0.25 * d.relationship + 0.35 * d.technique;
    assert.ok(
      Math.abs(p.overall - recomputed) <= 0.5,
      `${scenarioId}: ${p.overall} ≠ 0.4·${d.economic} + 0.25·${d.relationship} + 0.35·${d.technique}`,
    );
    // Шесть сигналов — из тех же полей разбора, что уходят в score_session.
    assert.deepEqual(p.skills, skillSignals(d), `${scenarioId}: сигналы навыков собраны не из разбора`);
  }
});

test("балл судьи в график не течёт", () => {
  // Ровно та ошибка, которой этот продукт уже болел: показать одно число, а в
  // счёт отправить соседнее. `avg_arg` — балл семантического судьи; он входит в
  // технику слагаемым, но НИ ОДНИМ из шести навыков не является и в истории не
  // хранится вовсе. Партия с блестящим судейским баллом и пустой техникой
  // обязана дать нули.
  const d = {
    overall: 30, grade: "F", economic: 0, relationship: 40, technique: 12,
    deal_text: "", status: "breakdown",
    interests_found: 0, interests_total: 3,
    spin_stages: 0, objective_criteria: 0, empathy: 0, threats: 0, tradeoffs: 0,
    avg_arg: 84, tips: [],
  } as unknown as Debrief;
  const p = pointFrom("supplier", d);
  assert.deepEqual(p.skills, skills({ tension: 40 }), "в сигналы просочилось что-то, кроме полей разбора");
  assert.equal(JSON.stringify(p).includes("84"), false, "судейский балл попал в точку истории");
});

// ============================================================================
// 2. Тенденция не объявляется на малых данных
// ============================================================================

test("до шести партий тенденции нет — есть счётчик «сыграно N из M»", () => {
  for (let n = 0; n < TREND_MIN; n++) {
    // Ряд, который «растёт» безупречно: 10, 20, 30… По нему линию нарисовать
    // проще всего, и именно поэтому её здесь быть не должно.
    const v = growthView(series(Array.from({ length: n }, (_, i) => 10 + i * 15)));
    assert.equal(v.enough, false, `${n} партий: тенденция объявлена на пустом месте`);
    assert.equal(v.overall, null, `${n} партий: посчитан вердикт`);
    assert.deepEqual(v.skills, [], `${n} партий: посчитаны навыки`);
    assert.equal(v.played, n);
    assert.equal(v.need, TREND_MIN);
  }
  const six = growthView(series([10, 25, 40, 55, 70, 85]));
  assert.equal(six.enough, true, "на шестой партии тенденция уже возможна");
  assert.equal(six.overall?.dir, "up");
});

test("вывод сделан ровно по тем точкам, которые рисует график", () => {
  const v = growthView(series(Array.from({ length: 40 }, (_, i) => 50 + (i % 3))));
  assert.equal(v.window.length, TREND_WINDOW, "окно шире, чем обещано");
  assert.equal(v.played, 40, "счётчик партий считает всю историю, а не окно");
  assert.deepEqual(v.window, series(Array.from({ length: 40 }, (_, i) => 50 + (i % 3))).slice(-TREND_WINDOW));
});

// ============================================================================
// 3. Шум не считается ростом
// ============================================================================

test("одна партия, шагнувшая на одну ступень шкалы, — не рост", () => {
  // Половина окна — три партии; ступень грубой шкалы навыка — 33 очка. Одна
  // партия сдвигает среднее половины на 11 — и это ровно то, что порог обязан
  // отвергнуть, иначе «рост» объявляется каждой второй игрой.
  const t = trendOf([0, 0, 0, 33, 0, 0], skillFloor)!;
  assert.equal(t.dir, "flat", "одна партия объявлена тенденцией");
  assert.ok(t.threshold > Math.abs(t.delta), "порог не покрывает одну ступень одной партии");

  // Две партии из трёх, третья на месте: сдвиг вдвое больше — но и разброс
  // ВНУТРИ половины теперь велик, а планка растёт вместе с ним. Вердикта снова
  // нет, и это то же самое правило, а не второе: тенденция — это как СТАЛО
  // играться, а не как повезло дважды.
  assert.equal(trendOf([0, 0, 0, 33, 33, 0], skillFloor)!.dir, "flat");

  // Половина окна, сдвинувшаяся целиком, — уже разговор.
  assert.equal(trendOf([0, 0, 0, 33, 33, 33], skillFloor)!.dir, "up");
});

test("ряд без разброса: мелкая разница остаётся шумом", () => {
  // Ловушка чистой статистики: разброс нулевой, значит стандартная ошибка ноль,
  // и ЛЮБАЯ разница «значима». Ровно поэтому у порога есть пол.
  const flat = trendOf([50, 50, 50, 54, 54, 54], skillFloor)!;
  assert.equal(flat.dir, "flat", "разница 4 при нулевом разбросе объявлена ростом");
  assert.ok(flat.threshold >= 8, "пол порога исчез");

  // По `overall` пол ниже, но он есть, и он не случайный: столько в счёт
  // способен внести один недетерминированный вход — судья (0.35 · 14 ≈ 4.9).
  assert.equal(trendOf([60, 60, 60, 64, 64, 64], overallFloor)!.dir, "flat");
  assert.equal(trendOf([60, 60, 60, 72, 72, 72], overallFloor)!.dir, "up");
});

test("широкий разброс поднимает планку: скачущий игрок не «растёт»", () => {
  // Тот же сдвиг средних, но в одном ряду человек играет ровно, а в другом —
  // как придётся. Второму разница в те же очки ростом не является.
  const steady = trendOf([50, 52, 48, 62, 64, 60], overallFloor)!;
  const jumpy = trendOf([10, 90, 50, 22, 98, 66], overallFloor)!;
  assert.equal(Math.round(steady.delta), Math.round(jumpy.delta), "тест построен неверно: сдвиги разные");
  assert.equal(steady.dir, "up");
  assert.equal(jumpy.dir, "flat", "разброс не поднял планку");
  assert.ok(jumpy.threshold > steady.threshold);
});

test("падение называется падением, а середина окна не считается дважды", () => {
  assert.equal(trendOf([90, 88, 92, 40, 42, 38], overallFloor)!.dir, "down");
  // Нечётная длина: средняя партия отбрасывается, половины равны.
  const odd = trendOf([0, 0, 0, 999, 100, 100, 100], overallFloor)!;
  assert.equal(odd.n, 3);
  assert.equal(odd.before, 0);
  assert.equal(odd.after, 100);
  // И вырожденный вход не роняет арифметику.
  assert.equal(trendOf([], overallFloor), null);
  assert.equal(trendOf([50], overallFloor), null);
});

test("«вырос сильнее всех» называет только объявленные тенденции", () => {
  const rows = growthView(
    skillSeries("criteria", [0, 0, 0, 100, 100, 100]).map((p, i) => ({
      ...p,
      // второй навык шумит на одну ступень, третий проседает
      skills: { ...p.skills, listening: i === 3 ? 33 : 0, tradeoff: i < 3 ? 100 : 0 },
    })),
  );
  const m = movedMost(rows);
  assert.equal(m.up?.id, "criteria");
  assert.equal(m.down?.id, "tradeoff");
  const byId = Object.fromEntries(rows.skills.map((s) => [s.id, s.trend.dir]));
  assert.equal(byId.listening, "flat", "шум одной партии попал в вердикт");
  assert.deepEqual(rows.skills.map((s) => s.id), SKILL_IDS, "навыки показываются не все или не в том порядке");
});

// ============================================================================
// 4. Хранилище: переполнение и приватный режим не роняют игру
// ============================================================================

test("переполнение ленты вытесняет самые старые партии", () => {
  let list: HistoryPoint[] = [];
  for (let i = 0; i < HISTORY_MAX + 25; i++) list = foldHistory(list, pt(i % 100, { scenarioId: `s${i}` }));
  assert.equal(list.length, HISTORY_MAX);
  assert.equal(list[0].scenarioId, "s25", "вытеснили не самые старые");
  assert.equal(list[list.length - 1].scenarioId, `s${HISTORY_MAX + 24}`);
});

test("закрытое хранилище не роняет запись партии", () => {
  const d = play("supplier", ["Ага.", "Ага.", "Ага."]);
  // Приватный режим: setItem бросает ВСЕГДА, включая аварийную попытку.
  withStore((store) => {
    const out = appendHistory("supplier", d);
    assert.equal(out.length, 1, "в памяти партия всё равно есть");
    assert.equal(store.size, 0, "в хранилище ничего не легло — и это нормально");
    // Перезагрузка: истории просто нет, а не сбой.
    assert.deepEqual(loadHistory(), []);
  }, () => true);
});

test("квота: одна попытка ужаться до хвоста, дальше — молча", () => {
  // Первая запись не влезла, вторая (хвост) влезла — так себя ведёт квота,
  // когда лента подросла.
  withStore(() => {
    const big = Array.from({ length: HISTORY_MAX }, (_, i) => pt(i % 100, { scenarioId: `s${i}` }));
    const kept = saveHistory(big);
    assert.equal(kept.length, HISTORY_RESCUE, "аварийный хвост не сохранён");
    assert.deepEqual(loadHistory(), kept, "память и диск разошлись");
  }, (calls) => calls === 1);
});

test("испорченный и чужой блоб — это «истории пока нет»", () => {
  withStore((store) => {
    store.set("dialog.history.v1", "{не json");
    assert.deepEqual(loadHistory(), []);

    store.set("dialog.history.v1", JSON.stringify({ v: 1, points: "не массив" }));
    assert.deepEqual(loadHistory(), []);

    store.set("dialog.history.v1", JSON.stringify({
      v: 1,
      points: [
        { at: "", scenarioId: "supplier", grade: "Z", overall: 50, skills: {} }, // чужой грейд
        { scenarioId: "supplier", grade: "B", overall: 5000, skills: { criteria: -9, tension: "нет" } },
        "строка вместо записи",
      ],
    }));
    const back = loadHistory();
    assert.equal(back.length, 1, "запись с чужим грейдом или без стола должна отбрасываться");
    assert.equal(back[0].overall, 100, "счёт зажат сотней");
    assert.equal(back[0].skills.criteria, 0);
    assert.equal(back[0].skills.tension, 0);
  });
});

// ============================================================================
// 5. История ничего не добавляет к оценке (инвариант 6)
// ============================================================================

test("запись истории не трогает профиль оценки", () => {
  const d = play("supplier", [
    "Почему для вас важна загрузка производства?",
    "По рыночным данным медиана независимых прайсов — 87.",
    "Договорились, 88.",
  ]);
  const now = new Date("2026-06-01T12:00:00.000Z");

  // Один и тот же ход профиля — с записью истории и без неё.
  const clean = withStore(() => JSON.stringify(applyDebrief(emptyProfile(), "supplier", d, now)));
  const dirty = withStore(() => {
    appendHistory("supplier", d, now);
    const res = applyDebrief(emptyProfile(), "supplier", d, now);
    // И профиль в хранилище история не создаёт и не портит.
    assert.deepEqual(loadProfile(), emptyProfile(), "история залезла в ключ профиля");
    return JSON.stringify(res);
  });
  assert.equal(dirty, clean, "история изменила оценку партии");

  // Форма профиля про историю не знает вовсе: ключи разные, полей нет.
  assert.equal(JSON.stringify(emptyProfile()).includes("history"), false);
  const src = readFileSync(join(SRC, "lib", "growth.ts"), "utf8");
  assert.equal(src.includes("dialog.progress"), false, "growth.ts пишет в ключ профиля");
  assert.equal(/saveProfile|recordDebrief|applyDebrief/.test(src), false,
               "growth.ts правит профиль оценки — это витрина, а не механика");
});

// ============================================================================
// Оформление: только объявленные токены
// ============================================================================

test("styles.growth.css не использует ни одного необъявленного токена", () => {
  // Тот же сторож, что у общего файла (tokens.test.ts), но для своего: правило
  // «var(--x) без объявления валит сборку» не должно обходиться тем, что стили
  // уехали в новый файл.
  const declared = new Set<string>();
  for (const m of readFileSync(join(SRC, "styles.css"), "utf8").matchAll(/(^|[;{\s])(--[a-z0-9-]+)\s*:/gi)) {
    declared.add(m[2]);
  }
  const own = readFileSync(join(SRC, "styles.growth.css"), "utf8");
  for (const m of own.matchAll(/(^|[;{\s])(--[a-z0-9-]+)\s*:/gi)) declared.add(m[2]);
  const used = [...own.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((m) => m[1]);
  const missing = [...new Set(used)].filter((t) => !declared.has(t)).sort();
  assert.deepEqual(missing, [], `необъявленные токены: ${missing.join(", ")}`);

  // Текста поверх ЯРКОГО зелёного здесь быть не может: `--brass-soft` и `--trust`
  // заливают полосы, где ничего не написано (CLAUDE.md, раздел про контраст).
  assert.equal(/color:\s*var\(--(brass-soft|trust)\)/.test(own), false,
               "яркий зелёный ушёл в цвет текста");

  // Движение уважает системную настройку.
  assert.ok(own.includes("prefers-reduced-motion"), "анимация не выключается по просьбе системы");

  // Свой файл не должен подключаться в main.tsx: он едет со своим экраном.
  assert.equal(readFileSync(join(SRC, "main.tsx"), "utf8").includes("styles.growth.css"), false);
  const importers = readdirSync(join(SRC, "components"))
    .filter((f) => f.endsWith(".tsx"))
    .filter((f) => readFileSync(join(SRC, "components", f), "utf8").includes("styles.growth.css"));
  assert.deepEqual(importers, ["Growth.tsx"], "файл стилей подключён не своим компонентом");
});
