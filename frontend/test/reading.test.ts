// reading.test.ts — режим «Чтение стола».
//
// Режим держится на одном обещании: правильный ответ определяет ДВИЖОК, а не
// автор и не модель. Обещание такого рода живёт ровно столько, сколько живёт
// сторож, поэтому здесь проверяется вся цепочка целиком:
//
//   материал  — каждая реплика каталога совпадает с эталонной фикстурой
//               посимвольно (иначе «настоящая партия» тихо станет сочинённой);
//   ответ     — реакция, которую показывает режим, это та же реакция, что
//               вернул `applyMove`, а итог партии совпадает с числом, которое
//               посчитал СЕРВЕРНЫЙ движок (games.scores.json);
//   вопрос    — четыре варианта, правильный среди них, два вопроса подряд не
//               имеют одного ответа (иначе это подсказка, а не проверка);
//   границы   — ни ИИ, ни сети, ни единой дорожки в счёт партии и в профиль;
//   загрузка  — экран режима не лежит на пути к первой отрисовке и при этом
//               прогревается на простое (инвариант 5).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, resolve } from "node:path";
import { I18N } from "../src/i18n";
import { SCENARIO_MAP } from "../src/data/scenarios";
import { READING_GAMES, readingGamesFor } from "../src/data/readingGames";
import { analyze, applyMove, newSession } from "../src/mock/engine";
import { REACTION_SCALE, isAskable } from "../src/lib/probe";
import { READING_BANDS, bandOf, buildReading, planAsks, verdictOf } from "../src/lib/reading";
import {
  EMPTY_READING, READING_IDS, loadReading, nextReadingGame, readingDone, readingScore,
  recordReading, saveReading,
} from "../src/lib/readingStore";
import type { Lang } from "../src/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const GAMES = JSON.parse(readFileSync(join(ROOT, "test/fixtures/games.json"), "utf8"));
const SCORES = JSON.parse(readFileSync(join(ROOT, "test/fixtures/games.scores.json"), "utf8"));
const LANGS: Lang[] = ["ru", "en"];

// ---- 1. Материал: ни одной придуманной реплики ------------------------------

test("каждая реплика каталога совпадает с эталонной фикстурой посимвольно", () => {
  const ladder = new Map<string, string[]>(
    (GAMES.ladder.games as { id: string; lines: string[] | string }[])
      .filter((g) => Array.isArray(g.lines))
      .map((g) => [g.id, g.lines as string[]]),
  );
  const principled = GAMES.principled as Record<string, { ru: string[]; en: string[] }>;

  for (const game of READING_GAMES) {
    for (const lang of LANGS) {
      const lines = game.lines[lang];
      if (!lines) continue;
      const want = ladder.get(game.id) ?? principled[game.id]?.[lang];
      assert.ok(want, `${game.id}/${lang}: партии нет в games.json — откуда взялись реплики?`);
      assert.deepEqual(lines, want, `${game.id}/${lang} разошлась с фикстурой`);
      // Лестница качества одноязычна: её партии берутся только в русский каталог.
      if (ladder.has(game.id)) assert.equal(lang, "ru", `${game.id}: лестница есть только по-русски`);
    }
    const sc = SCENARIO_MAP[game.scenario];
    assert.ok(sc, `${game.id}: стол ${game.scenario} не существует`);
  }
});

test("список партий в хранилище совпадает с каталогом — и по составу, и по порядку", () => {
  // Второй источник правды заведён нарочно (карточка на домашнем экране не
  // должна тянуть 18 КБ стенограмм), и молчать ему нельзя.
  for (const lang of LANGS) {
    assert.deepEqual(READING_IDS[lang], readingGamesFor(lang).map((g) => g.id), lang);
  }
  assert.equal(READING_IDS.ru.length, 12);
  assert.equal(READING_IDS.en.length, 9);
  // Девять столов продукта обязаны быть в обоих каталогах: именно они делают
  // режим переносимым, а не тренировкой одного стола.
  for (const lang of LANGS) {
    const tables = new Set(readingGamesFor(lang).map((g) => g.scenario));
    assert.equal(tables.size, 9, `${lang}: столов в каталоге ${tables.size}`);
  }
});

// ---- 2. Ответ считает движок ------------------------------------------------

/** Тот же цикл, что у MockServer.handleTurn, games.test.ts и backend `play()`. */
function play(scenarioId: string, lines: string[], lang: Lang) {
  const s = newSession(SCENARIO_MAP[scenarioId], lang);
  for (const text of lines) {
    if (s.status !== "active") break;
    s.turn += 1;
    applyMove(s, analyze(text), text);
    if (s.status === "active" && s.turn >= s.maxTurns) s.status = "breakdown";
  }
  return s;
}

test("правильный ответ каждого вопроса — это то, что вернул applyMove", () => {
  for (const lang of LANGS) {
    for (const game of readingGamesFor(lang)) {
      const r = buildReading(game.id, lang);
      assert.ok(r, `${game.id}/${lang}: чтение не собралось`);
      const s = play(game.scenario, game.lines, lang);
      assert.deepEqual(
        r.turns.map((t) => [t.turn, t.reaction]),
        s.ledger.map((e) => [e.turn, e.reaction]),
        `${game.id}/${lang}: реакции разошлись с движком`,
      );
      for (const t of r.turns) {
        if (!t.ask) continue;
        assert.equal(t.ask.options[t.ask.answer], t.reaction,
          `${game.id}/${lang}, ход ${t.turn}: правильный вариант указывает не на ответ движка`);
      }
    }
  }
});

test("итог партии совпадает с числом серверного движка, а не хранится рядом", () => {
  // games.scores.json посчитан `services/gateway/tools/gen_game_scores.py`. Если
  // режим показывает грейд, он обязан показывать ТОТ ЖЕ грейд (инвариант 8).
  const want = (id: string) => SCORES.ladder[id] ?? SCORES.principled[id];
  for (const game of readingGamesFor("ru")) {
    const r = buildReading(game.id, "ru")!;
    const w = want(game.id);
    assert.ok(w, `${game.id}: в games.scores.json нет числа для этой партии`);
    assert.equal(r.debrief.grade, w.grade, `${game.id}: грейд`);
    assert.equal(r.debrief.overall, w.overall, `${game.id}: overall`);
    assert.equal(r.debrief.status, w.status, `${game.id}: чем кончилось`);
  }
});

test("шкалы и цена в разборе — из хроники движка, а не пересчитаны заново", () => {
  for (const game of readingGamesFor("ru")) {
    const r = buildReading(game.id, "ru")!;
    const s = play(game.scenario, game.lines, "ru");
    r.turns.forEach((t, i) => {
      const e = s.ledger[i];
      assert.deepEqual(t.deltas, e.deltas, `${game.id}, ход ${t.turn}: дельты`);
      assert.equal(t.after.offer, e.offerAfter, `${game.id}, ход ${t.turn}: цена после хода`);
      assert.equal(t.before.offer, e.offerBefore, `${game.id}, ход ${t.turn}: цена до хода`);
      // Шкала «после» обязана быть шкалой «до» плюс дельта: иначе на экране
      // окажется состояние, которого у движка не было.
      assert.ok(Math.abs(t.after.trust - (t.before.trust + e.deltas.trust)) < 1e-9);
      assert.ok(Math.abs(t.after.tension - (t.before.tension + e.deltas.tension)) < 1e-9);
    });
  }
});

// ---- 3. Вопрос ---------------------------------------------------------------

test("два вопроса подряд не имеют одного и того же правильного ответа", () => {
  // Иначе это не вторая проверка, а подсказка: человек отвечает «как в прошлый
  // раз» и попадает, ничего не прочитав. То же правило и та же причина, что у
  // слоя «Читай лицо» (probe.ts::nextProbe).
  for (const lang of LANGS) {
    for (const game of readingGamesFor(lang)) {
      const asked = buildReading(game.id, lang)!.turns.filter((t) => t.ask);
      for (let i = 1; i < asked.length; i++) {
        assert.notEqual(asked[i].reaction, asked[i - 1].reaction,
          `${game.id}/${lang}: ходы ${asked[i - 1].turn} и ${asked[i].turn} спрашивают одно и то же`);
      }
    }
  }
  // И само правило, в отрыве от материала.
  assert.deepEqual(planAsks(["neutral", "neutral", "warmed", "neutral"]),
                   [true, false, true, true]);
  assert.deepEqual(planAsks(["nonsense", "warmed"]), [false, true]);
});

test("у каждого вопроса четыре разных варианта, и правильный среди них", () => {
  for (const lang of LANGS) {
    for (const game of readingGamesFor(lang)) {
      for (const t of buildReading(game.id, lang)!.turns) {
        if (!t.ask) continue;
        assert.equal(t.ask.options.length, 4, `${game.id}/${lang}, ход ${t.turn}`);
        assert.equal(new Set(t.ask.options).size, 4, `${game.id}/${lang}, ход ${t.turn}: повтор варианта`);
        assert.ok(t.ask.options.includes(t.reaction as never));
      }
    }
  }
});

test("каждая партия задаёт хотя бы два вопроса и целиком состоит из спрашиваемых реакций", () => {
  for (const lang of LANGS) {
    for (const game of readingGamesFor(lang)) {
      const r = buildReading(game.id, lang)!;
      assert.ok(r.turns.length > 0, `${game.id}/${lang}: пустая партия`);
      assert.ok(r.asked >= 2, `${game.id}/${lang}: вопросов ${r.asked} — это уже не режим`);
      for (const t of r.turns) {
        assert.ok(isAskable(t.reaction),
          `${game.id}/${lang}, ход ${t.turn}: реакция «${t.reaction}» не имеет ярлыка`);
      }
    }
  }
});

test("чтение детерминировано: второй прогон даёт те же вопросы в том же порядке", () => {
  // Реплей обязан совпадать — иначе «прочитано 4 из 5» вчера и сегодня значат
  // разное, а разбор перестаёт быть повторяемым.
  for (const game of readingGamesFor("ru")) {
    const a = buildReading(game.id, "ru")!;
    const b = buildReading(game.id, "ru")!;
    assert.deepEqual(
      a.turns.map((t) => [t.reaction, t.ask?.options ?? null, t.ask?.answer ?? null]),
      b.turns.map((t) => [t.reaction, t.ask?.options ?? null, t.ask?.answer ?? null]),
      game.id,
    );
  }
});

// ---- 4. Разбор -------------------------------------------------------------

test("у каждой встреченной реакции есть ярлык и объяснение на обоих языках", () => {
  const seen = new Set<string>();
  for (const lang of LANGS) {
    for (const game of readingGamesFor(lang)) {
      for (const t of buildReading(game.id, lang)!.turns) seen.add(t.reaction);
    }
  }
  assert.ok(seen.size >= 5, `режим показывает всего ${seen.size} разных реакций`);
  for (const lang of LANGS) {
    for (const r of seen) {
      assert.ok(I18N[lang].probe.reactions[r], `${lang}: нет ярлыка для «${r}»`);
      assert.ok(I18N[lang].probe.why[r], `${lang}: нет объяснения для «${r}»`);
    }
  }
});

test("разбор говорит словами движка: улики, шкалы и её реплика непусты там, где движок высказался", () => {
  const r = buildReading("basic", "ru")!;
  const first = r.turns[0];
  assert.ok(first.tags.length > 0, "вопрос по теме — и ни одного приёма в уликах");
  assert.ok(first.meters.length > 0, "интерес вскрыт, а шкалы молчат");
  assert.ok(first.said.length > 0, "её сторона ничего не сказала");
  assert.equal(first.revealedTopic, SCENARIO_MAP.supplier.interestTopics.ru[0]);
  // Торг без метода: ход есть, движения нет — и разбор обязан это ПОКАЗАТЬ,
  // а не промолчать.
  const flat = buildReading("haggling", "ru")!.turns[0];
  assert.deepEqual(flat.meters, [], "цифра без обоснования не двигает стол");
  assert.ok(flat.said.length > 0);
});

test("полосы шкалы теплоты покрывают все спрашиваемые реакции и не пересекаются", () => {
  const all = [...REACTION_SCALE, "probe_vague"];
  const flat = Object.values(READING_BANDS).flat();
  assert.deepEqual([...flat].sort(), [...all].sort(), "полосы разошлись со шкалой движка");
  assert.equal(new Set(flat).size, flat.length, "реакция попала в две полосы сразу");
  for (const r of all) assert.ok(bandOf(r), r);
});

test("вердикт различает «не та сила» и «не прочитал вовсе»", () => {
  assert.equal(verdictOf("warmed", "warmed"), "exact");
  // Обе тёплые: стол прочитан верно, ошибка в мере.
  assert.equal(verdictOf("opened_up", "collaborated"), "near");
  // Тёплая против холодной — это не мера, это промах.
  assert.equal(verdictOf("warmed", "hardened"), "miss");
  // Переспрос лежит в средней полосе: «вопрос не двинул стол».
  assert.equal(verdictOf("neutral", "probe_vague"), "near");
  assert.equal(verdictOf("opened_up", "probe_vague"), "miss");
});

// ---- 5. Прогресс живёт отдельно ---------------------------------------------

test("прогресс режима не касается профиля игры", () => {
  const store = new Map<string, string>();
  store.set("dialog.progress.v1", "profile-untouched");
  const g = globalThis as { localStorage?: unknown };
  const before = g.localStorage;
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  };
  try {
    saveReading(recordReading(EMPTY_READING, "basic", { asked: 3, exact: 2, near: 1 }));
    assert.equal(store.get("dialog.progress.v1"), "profile-untouched",
      "чтение стола записалось в профиль игры — инвариант 6");
    assert.ok(store.get("dialog.reading.v1"), "у режима должно быть своё хранилище");
    assert.deepEqual(loadReading().games.basic, { asked: 3, exact: 2, near: 1 });
  } finally {
    if (before === undefined) delete g.localStorage;
    else g.localStorage = before;
  }
});

test("испорченный блоб не роняет режим и не рисует «прочитано 9 из 6»", () => {
  const g = globalThis as { localStorage?: unknown };
  const before = g.localStorage;
  g.localStorage = {
    getItem: () => '{"games":{"basic":{"asked":3,"exact":9,"near":9},"bad":{"asked":"x"},"none":null}}',
    setItem: () => {},
  };
  try {
    const log = loadReading();
    assert.deepEqual(log.games.basic, { asked: 3, exact: 3, near: 0 });
    assert.equal(log.games.bad, undefined);
    assert.equal(log.games.none, undefined);
  } finally {
    if (before === undefined) delete g.localStorage;
    else g.localStorage = before;
  }
});

test("остаётся лучшее чтение, и возвращают к худшему", () => {
  let log = recordReading(EMPTY_READING, "basic", { asked: 4, exact: 1, near: 1 });
  log = recordReading(log, "basic", { asked: 4, exact: 3, near: 0 });
  assert.deepEqual(log.games.basic, { asked: 4, exact: 3, near: 0 }, "лучшее не удержалось");
  log = recordReading(log, "basic", { asked: 4, exact: 0, near: 0 });
  assert.deepEqual(log.games.basic, { asked: 4, exact: 3, near: 0 }, "худшее затёрло лучшее");
  assert.ok(readingScore({ asked: 4, exact: 2, near: 2 }) > readingScore({ asked: 4, exact: 2, near: 0 }));

  const ids = ["a", "b", "c"];
  assert.equal(nextReadingGame({ games: {} }, ids), "a", "начинать надо с начала каталога");
  assert.equal(nextReadingGame({ games: { a: { asked: 2, exact: 2, near: 0 } } }, ids), "b");
  const all = {
    games: {
      a: { asked: 2, exact: 2, near: 0 },
      b: { asked: 2, exact: 0, near: 0 },
      c: { asked: 2, exact: 1, near: 0 },
    },
  };
  assert.equal(nextReadingGame(all, ids), "b", "перечитывать стоит там, где читалось хуже всего");
  assert.equal(readingDone(all, ids), 3);
});

// ---- 6. Границы режима -------------------------------------------------------

const MODE_FILES = [
  "lib/reading.ts", "lib/readingStore.ts", "data/readingGames.ts",
  "components/ReadingScreen.tsx", "components/ReadingCard.tsx",
];
const readMode = (rel: string) => readFileSync(join(SRC, rel), "utf8");

test("в режиме нет ни сети, ни ИИ, ни дорожки в счёт партии", () => {
  const bad: string[] = [];
  for (const rel of MODE_FILES) {
    const text = readMode(rel);
    for (const [what, re] of [
      ["сеть", /\bfetch\(|new WebSocket|XMLHttpRequest/],
      ["транспорт", /from "\.\.?\/(api|realtime)\//],
      ["профиль игры", /from "\.\.?\/lib\/progress"/],
    ] as const) {
      if (re.test(text)) bad.push(`${rel}: ${what}`);
    }
  }
  assert.deepEqual(bad, [],
    "режим обязан считаться движком в браузере и не касаться профиля:\n" + bad.join("\n"));
});

test("Карл молчит, пока вопрос открыт", () => {
  // Его лицо считается из ДЕЛЬТ хода: показанное до ответа, оно и было бы
  // ответом — довольный ворон значит «доверие выросло».
  const src = readMode("components/ReadingScreen.tsx");
  const ask = src.slice(src.indexOf('className="rd-ask"'), src.indexOf('rd-next'));
  assert.match(ask, /<Karl state="study"/, "над открытым вопросом должен стоять постоянный кадр");
  assert.doesNotMatch(ask, /karlState\(/, "состояние из дельт над открытым вопросом — это подсказка");
  assert.match(src.slice(src.indexOf("function ReadingReveal")), /karlState\(\{ deltas/,
    "после раскрытия ворон обязан реагировать на посчитанный ход");
});

// ---- 7. Загрузка: не на критическом пути, но прогрет -------------------------

function resolveSpec(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), spec);
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx", ""]) {
    try {
      readFileSync(base + ext, "utf8");
      return normalize(base + ext);
    } catch { /* следующее расширение */ }
  }
  return null;
}

function staticGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [normalize(entry)];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    const specs: string[] = [];
    for (const m of text.matchAll(/(?:^|\n)(?:import|export)\s(?!type\s)[^;]*?from\s*"([^"]+)"/g)) {
      specs.push(m[1]);
    }
    for (const spec of specs) {
      const target = resolveSpec(file, spec);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return seen;
}

test("экран режима и стенограммы чужих партий не лежат на пути к первой отрисовке", () => {
  const graph = staticGraph(join(SRC, "main.tsx"));
  const leaked = ["components/ReadingScreen.tsx", "lib/reading.ts", "data/readingGames.ts"]
    .filter((rel) => graph.has(normalize(join(SRC, rel))));
  assert.deepEqual(leaked, [],
    "статический импорт вернул это на домашний экран:\n" + leaked.join("\n"));
  // А карточка входа — обязана быть: без неё в режим нечем войти.
  assert.ok(graph.has(normalize(join(SRC, "components/ReadingCard.tsx"))));
});

test("отложенный экран прогревается на простое — иначе без сети он не откроется", () => {
  // Инвариант 5. То же правило и по той же причине, что и WARM в App.tsx
  // (test/lazy.test.ts): «ленивый» экран, которого нет в кеше, — это не игра
  // офлайн, а половина страницы.
  const src = readMode("components/ReadingCard.tsx");
  const dynamic = [...src.matchAll(/\bimport\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(dynamic, ["./ReadingScreen"], "путь к экрану называется ровно один раз");
  assert.match(src, /requestIdleCallback/, "прогрева на простое нет");
  assert.match(src, /loadReadingScreen\(\)\.catch/, "прогрев обязан глушить отказ молча");
});
