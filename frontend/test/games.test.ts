// games.test.ts — эталонные партии в браузерном зеркале.
//
// Инвариант 8 до сих пор проверялся на уровне ОДНОЙ реплики (fixtures/analyze.json).
// Но партия — это не реплика: уступка, откат, анти-гейминг и закрытие живут в
// applyMove, и разъехаться они могли молча, оставив классификатор синхронным.
// Здесь прогоняются те же партии, что и в services/gateway/tests/test_reference_games.py,
// и сверяются с числами, которые посчитал движок-источник (games.scores.json,
// генератор — services/gateway/tools/gen_game_scores.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SCENARIO_MAP } from "../src/data/scenarios";
import { MIRROR_MAP } from "../src/data/mirrors";
import { analyze, applyMove, newSession, resistance, revealTrustGate, scoreSession } from "../src/mock/engine";
import { formatDeal } from "../src/lib/format";
import type { Lang } from "../src/types";

const GAMES = JSON.parse(readFileSync(new URL("./fixtures/games.json", import.meta.url), "utf8"));
const SCORES = JSON.parse(readFileSync(new URL("./fixtures/games.scores.json", import.meta.url), "utf8"));

// Партии двуязычные ({ru, en}); числа зеркало сверяет по одной половине
// (`ladder.mirror`) — инвариант 8 про совпадение двух РЕАЛИЗАЦИЙ движка, а не
// двух языков, и вторая половина удвоила бы фикстуру, ничего не доказав.
// Порядок качества — другое дело: он проверяется здесь на ОБОИХ языках, потому
// что защиту от накрутки обходят словами, а слова у языков разные.
const PRINCIPLED: Record<string, string[]> = Object.fromEntries(
  Object.entries(GAMES.principled)
    .filter(([k]) => k !== "note")
    .map(([k, v]) => [k, (v as { ru: string[] }).ru]),
) as Record<string, string[]>;
const LADDER = GAMES.ladder;

type Lines = string[] | string | Record<string, string[]>;

const MIRROR: Lang = (GAMES.ladder.mirror ?? GAMES.ladder.lang ?? "ru") as Lang;

function linesOf(game: { lines: Lines }, lang: Lang = MIRROR): string[] {
  const l = game.lines;
  if (typeof l === "string" && l.startsWith("@principled.")) {
    return (GAMES.principled as Record<string, Record<string, string[]>>)[l.split(".")[1]][lang];
  }
  return Array.isArray(l) ? l : (l as Record<string, string[]>)[lang];
}

// Ровно тот же цикл, что у MockServer.handleTurn и у backend-хелпера play().
function play(scenarioId: string, lines: string[], lang: Lang = "ru") {
  const s = newSession(SCENARIO_MAP[scenarioId] ?? MIRROR_MAP[scenarioId], lang);
  for (const text of lines) {
    if (s.status !== "active") break;
    s.turn += 1;
    applyMove(s, analyze(text), text);
    if (s.status === "active" && s.turn >= s.maxTurns) s.status = "breakdown";
  }
  return { s, debrief: scoreSession(s) };
}

function checkAgainstBackend(name: string, scenarioId: string, lines: string[], want: Record<string, unknown>) {
  const { s, debrief } = play(scenarioId, lines, MIRROR);
  // `deal_text` намеренно НЕ сверяется: единица у клиента короче (« ₽» против
  // «₽/шт») — это решение вёрстки, а не движка. Саму печать цифры проверяет
  // тест «печать цифры сделки» ниже, на одинаковых входах.
  for (const key of ["overall", "grade", "economic", "relationship", "technique", "status"] as const) {
    assert.equal(
      (debrief as Record<string, unknown>)[key],
      want[key],
      `${name}: ${key} разошёлся с движком-источником (${JSON.stringify((debrief as Record<string, unknown>)[key])} vs ${JSON.stringify(want[key])})`,
    );
  }
  assert.equal(debrief.interests_found, want.interests_found, `${name}: вскрыто интересов`);
  assert.equal(s.offerOpp, want.offer_opp, `${name}: цена на столе`);
  assert.equal(s.deal, want.deal, `${name}: цифра сделки`);
  assert.equal(s.turn, want.turn, `${name}: длина партии`);
  // «С той стороны стола» — до символа. Колонка объясняет партию, и объяснение
  // расходится молча: числа-то у обоих ядер сойдутся. Сверяется целиком —
  // имя персоны, реплики оппонента, чипы шкал, занавес и вопрос-ключ.
  assert.deepEqual(
    JSON.parse(JSON.stringify(debrief.her_side)),
    want.her_side,
    `${name}: колонка «с той стороны стола» разошлась с сервером`,
  );
  // Карточка зеркального стола — тоже до символа, и по той же причине: она
  // ОБЪЯСНЯЕТ партию, а объяснение расходится молча — числа-то сойдутся. Ключ
  // есть только у зеркал (у обычных партий его нет и быть не должно).
  if ("other_side" in want) {
    const got = JSON.parse(JSON.stringify(debrief.other_side)) as Record<string, unknown>;
    const exp = want.other_side as Record<string, unknown>;
    // ТЕКСТ самих интересов намеренно НЕ сверяется — ровно по той же причине,
    // что и `deal_text` выше: браузерная библиотека столов держит их короче
    // («Стабильная загрузка» против «Стабильная загрузка производства»), это
    // решение вёрстки карточек, а не движка, и оно старше этого режима.
    // Сверяется всё, что решает СМЫСЛ карточки: кем сидел игрок, откуда
    // зеркало, темы защищаемого, счёт вскрытого и — целиком — «окна», ради
    // которых карточка и заведена.
    const strip = (o: Record<string, unknown>) => ({
      ...o,
      defended: (o.defended as { topic: string }[]).map((d) => d.topic),
    });
    assert.deepEqual(strip(got), strip(exp),
      `${name}: карточка «обратной стороны» разошлась с сервером`);
    assert.equal((got.defended as unknown[]).length, (exp.defended as unknown[]).length);
  } else {
    assert.equal(debrief.other_side ?? null, null,
      `${name}: обычный стол не имеет права рисовать карточку зеркала`);
  }
}

for (const gid of LADDER.order as string[]) {
  test(`инвариант 8: партия «${gid}» считается так же, как на сервере`, () => {
    const game = LADDER.games.find((g: { id: string }) => g.id === gid);
    checkAgainstBackend(gid, LADDER.scenario, linesOf(game), SCORES.ladder[gid]);
  });
}

for (const sid of Object.keys(PRINCIPLED)) {
  test(`инвариант 8: принципиальная партия на «${sid}» считается так же, как на сервере`, () => {
    checkAgainstBackend(sid, sid, PRINCIPLED[sid], SCORES.principled[sid]);
  });
}

// Зеркальные столы («Обратная сторона стола»). Инвариант 8 нужен им НЕ МЕНЬШЕ, а
// больше: у зеркала перевёрнуто направление шкалы, а знак решает, кто выиграл,
// — разошедшиеся движки дали бы здесь ровно противоположный вердикт.
const OTHER_SIDE: Record<string, string[]> = Object.fromEntries(
  Object.entries(GAMES.other_side)
    .filter(([k]) => k !== "note")
    .map(([k, v]) => [k, (v as { ru: string[] }).ru]),
) as Record<string, string[]>;

for (const sid of Object.keys(OTHER_SIDE)) {
  test(`инвариант 8: зеркальный стол «${sid}» считается так же, как на сервере`, () => {
    checkAgainstBackend(sid, sid, OTHER_SIDE[sid], SCORES.other_side[sid]);
  });
}

// ---- Право первого слова -----------------------------------------------------
// Две партии, отличающиеся ТОЛЬКО первой репликой: якорь с критерием против той
// же цифры голой. Сдвиг рамки живёт в applyMove, а не в классификаторе, — то
// есть ровно там, где два ядра расходятся молча, оставив чипы синхронными.
const FIRST_WORD = GAMES.first_word;
const FW_MIRROR: Lang = (FIRST_WORD.mirror ?? FIRST_WORD.lang ?? "ru") as Lang;

for (const gid of FIRST_WORD.order as string[]) {
  test(`инвариант 8: первое слово — партия «${gid}» считается так же, как на сервере`, () => {
    const game = FIRST_WORD.games.find((g: { id: string }) => g.id === gid);
    checkAgainstBackend(gid, FIRST_WORD.scenario, linesOf(game, FW_MIRROR), SCORES.first_word[gid]);
  });
}

test("первое слово: обоснованный якорь стоит дороже той же цифры голой", () => {
  const played: Record<string, { overall: number; technique: number; offerOpp: number }> = {};
  for (const gid of FIRST_WORD.order as string[]) {
    const game = FIRST_WORD.games.find((g: { id: string }) => g.id === gid);
    const { s, debrief } = play(FIRST_WORD.scenario, linesOf(game, FW_MIRROR), FW_MIRROR);
    played[gid] = { overall: debrief.overall, technique: debrief.technique, offerOpp: s.offerOpp };
  }
  assert.ok(
    played.grounded.overall > played.bare.overall,
    `якорь с критерием (${played.grounded.overall}) не выше голой цифры (${played.bare.overall})`,
  );
  assert.ok(played.grounded.technique > played.bare.technique, "приём не виден в технике");
  // Рамка: обоснованный якорь оставляет цену оппонента ближе к игроку.
  assert.ok(
    played.grounded.offerOpp < played.bare.offerOpp,
    `рамка не сдвинулась: ${played.grounded.offerOpp} против ${played.bare.offerOpp}`,
  );
});

test("первое слово тратится один раз и не проводит оппонента за дно", () => {
  const line = "Мы предлагаем 1080: по трём объявлениям на такую же модель с этим пробегом медиана рынка именно такая.";
  const sc = SCENARIO_MAP.used_car;

  const first = newSession(sc, "ru");
  first.turn += 1;
  applyMove(first, analyze(line), line);
  assert.equal(first.met.openingAnchor, true, "приём не засчитан на первом ходу");

  const later = newSession(sc, "ru");
  const hi = "Здравствуйте, рад встрече.";
  later.turn += 1;
  applyMove(later, analyze(hi), hi);
  later.turn += 1;
  applyMove(later, analyze(line), line);
  assert.equal(later.met.openingAnchor, false, "право первого слова потрачено дважды");
  assert.ok(first.offerOpp < later.offerOpp, `${first.offerOpp} против ${later.offerOpp}`);

  // Инвариант 1 старше любой рамки: якорь за дном её туда не уводит.
  const wild = "Мы предлагаем 700: по рыночным данным медиана независимых оценок именно такая, потому что это отраслевой стандарт.";
  const s = newSession(sc, "ru");
  s.turn += 1;
  applyMove(s, analyze(wild), wild);
  assert.ok(s.offerOpp >= sc.floor - 1e-9, `цена ${s.offerOpp} ниже дна ${sc.floor}`);
  assert.equal(s.frameOpen, first.frameOpen, "наглый якорь тянет рамку дальше обоснованного");
});

// Анти-игровой порядок — на КАЖДОМ языке лестницы. Пока английской половины не
// было, «спам ниже базовой игры» было доказано по-русски и обещано по-английски;
// обходят же защиту словами, и словари у языков разные.
//
// ЗНАКА НЕРАВЕНСТВА МАЛО. Соседние ступени стояли в одном балле друг от друга
// (спам 27, чередование 28, базовая 29), и живой судья переставлял их местами:
// порядок, доказанный на один балл, не доказан. Поэтому у лестницы есть СТУПЕНИ
// (`ladder.tiers`) и ЗАПАС между соседними (`ladder.tier_margin`) — и оба движка
// проверяют одно и то же число из одной и той же фикстуры.
type Tier = { id: string; games: string[] };
const TIERS = LADDER.tiers as Tier[];
const TIER_MARGIN = LADDER.tier_margin as number;

for (const lang of (LADDER.langs ?? [LADDER.lang ?? "ru"]) as Lang[]) {
  const ladderScores = (l: Lang) => {
    const scores: Record<string, number> = {};
    for (const gid of LADDER.order as string[]) {
      const game = LADDER.games.find((g: { id: string }) => g.id === gid);
      scores[gid] = play(LADDER.scenario, linesOf(game, l), l).debrief.overall;
    }
    return scores;
  };

  test(`лестница качества (${lang}): спам обязан быть ниже базовой игры`, () => {
    const scores = ladderScores(lang);
    const order = LADDER.order as string[];
    for (let i = 1; i < order.length; i++) {
      assert.ok(
        scores[order[i - 1]] <= scores[order[i]],
        `${lang}: «${order[i - 1]}» (${scores[order[i - 1]]}) выше «${order[i]}» (${scores[order[i]]})`,
      );
    }
    assert.ok(scores.spam < scores.basic, `${lang}: спам ${scores.spam} не ниже базовой ${scores.basic}`);
    assert.ok(scores.alternating < scores.basic, `${lang}: чередование ${scores.alternating} не ниже базовой ${scores.basic}`);
    assert.ok(scores.exemplary >= 85, `${lang}: образцовая партия ${scores.exemplary} не дотянула до A`);
  });

  test(`лестница качества (${lang}): между ступенями есть запас, а не знак неравенства`, () => {
    const scores = ladderScores(lang);
    for (let i = 1; i < TIERS.length; i++) {
      const top = Math.max(...TIERS[i - 1].games.map((g) => scores[g]));
      const bottom = Math.min(...TIERS[i].games.map((g) => scores[g]));
      assert.ok(
        bottom - top >= TIER_MARGIN,
        `${lang}: ступени «${TIERS[i - 1].id}» (потолок ${top}) и «${TIERS[i].id}» (пол ${bottom}) ` +
          `разведены на ${bottom - top} при требуемых ${TIER_MARGIN}`,
      );
    }
  });

  test(`лестница качества (${lang}): каждая партия доиграна до исхода, который выносит продукт`, () => {
    // `scoreSession` знает три статуса, но в бою до него доходят два: сделка или
    // срыв. Третий, active, гасится на лимите ходов — и здесь (MockServer), и на
    // сервере. Ветка «без соглашения» с её economic = 10 платила четыре очка
    // overall ровно тем партиям, которые обязаны стоять внизу.
    for (const gid of LADDER.order as string[]) {
      const game = LADDER.games.find((g: { id: string }) => g.id === gid);
      const { s } = play(LADDER.scenario, linesOf(game, lang), lang);
      assert.ok(
        s.status === "agreement" || s.status === "breakdown",
        `${lang}/${gid}: партия оценена в состоянии ${s.status} — исхода, которого продукт не выносит`,
      );
    }
  });
}

test("ступени раскладывают лестницу целиком, без забытых партий", () => {
  const flat = TIERS.flatMap((t) => t.games);
  assert.deepEqual(flat, LADDER.order as string[], "ступени и порядок разошлись");
  assert.equal(new Set(flat).size, flat.length, "партия попала в две ступени");
});

test("двенадцать пустых реплик не двигают цену", () => {
  const game = LADDER.games.find((g: { id: string }) => g.id === "passive");
  const { s } = play(LADDER.scenario, linesOf(game), MIRROR);
  const sc = SCENARIO_MAP[LADDER.scenario];
  assert.ok(Math.abs(s.offerOpp - sc.open) <= 0.03 * Math.abs(sc.open), `цена уехала до ${s.offerOpp}`);
});

test("после грубости предложение оппонента становится хуже для игрока", () => {
  const s = newSession(SCENARIO_MAP.supplier, "ru");
  const line = "По рыночным данным медиана независимых прайсов 86, потому что это стандарт.";
  s.turn += 1;
  applyMove(s, analyze(line), line);
  const before = s.offerOpp;
  const rude = "Это просто смешно и некомпетентно, вы обманываете.";
  s.turn += 1;
  applyMove(s, analyze(rude), rude);
  assert.ok(s.offerOpp > before, `цена ${s.offerOpp} не хуже прежней ${before}`);
});

test("«Договорились, 42» — не сделка, а провал закрытия", () => {
  const { s, debrief } = play("supplier", ["Договорились, 42"]);
  assert.notEqual(s.status, "agreement");
  assert.ok(debrief.economic <= 15, `economic=${debrief.economic}`);
});

test("общие «Почему?» не вскрывают интересы, тематические вскрывают все три", () => {
  const vague = play("supplier", ["Почему для вас это важно?", "Почему для вас это важно?", "Почему для вас это важно?"]);
  assert.ok(vague.s.interests.length <= 1, `вскрыто ${vague.s.interests.length}`);
  const themed = play("supplier", PRINCIPLED.supplier.slice(0, 3));
  assert.equal(themed.s.interests.length, 3);
});
test("печать цифры сделки совпадает с движком-источником", () => {
  for (const row of SCORES.format as { value: number; unit: string; ru: string; en: string }[]) {
    assert.equal(formatDeal(row.value, row.unit, "ru"), row.ru, `RU: ${row.value} ${row.unit}`);
    assert.equal(formatDeal(row.value, row.unit, "en"), row.en, `EN: ${row.value} ${row.unit}`);
  }
});

test("RU и EN расходятся разделителем, но разбираются в одно число", () => {
  const ru = formatDeal(91.57, "\u20bd/\u0448\u0442", "ru");
  const en = formatDeal(91.57, "\u20bd/\u0448\u0442", "en");
  assert.notEqual(ru, en, "локали обязаны печатать по-разному");
  assert.ok(ru.includes("\u202f"), `нет узкого пробела перед знаком валюты — ${JSON.stringify(ru)}`);
  const num = (s: string) =>
    parseFloat(s.replace(/[\u202f\u00a0]/g, "").replace(",", ".").replace(/[^\d.]/g, ""));
  assert.equal(num(ru), 91.57);
  assert.equal(num(en), 91.57);
});

// ---- Инвариант 8 для сложности стола ----------------------------------------
// Партии выше уже проверяют коэффициент сложности насквозь: `games.scores.json`
// посчитан движком-источником на всех восьми столах, а difficulty у них разная
// (2..5). Здесь замер точечный — те же числа, что в
// services/gateway/tests/test_difficulty.py, чтобы расхождение читалось сразу в
// формуле, а не только в итоговом балле пятиходовой партии.

test("инвариант 8: сессия несёт сложность стола", () => {
  for (const sid of ["supplier", "salary", "conflict", "investor"]) {
    assert.equal(newSession(SCENARIO_MAP[sid], "ru").difficulty, SCENARIO_MAP[sid].diff, sid);
  }
});

test("инвариант 8: сопротивление и порог доверия совпадают с движком-источником", () => {
  const s = newSession(SCENARIO_MAP.supplier, "ru");
  // 1 + 0.12·(3.5 − d): лёгкий стол уступает щедрее, трудный скупее.
  for (const [d, want] of [[1, 1.30], [2, 1.18], [3, 1.06], [4, 0.94], [5, 0.82]] as [number, number][]) {
    s.difficulty = d;
    assert.ok(Math.abs(resistance(s) - want) < 1e-9, `d=${d}: ${resistance(s)} вместо ${want}`);
  }
  // min(39, 30 + 4·(d − 2)): первый вопрос доступен при стартовом доверии 40.
  for (const [d, want] of [[1, 26], [2, 30], [3, 34], [4, 38], [5, 39]] as [number, number][]) {
    s.difficulty = d;
    assert.equal(revealTrustGate(s), want, `d=${d}`);
  }
  // Шкала карточки — 1..5; своя сделка присылает 3, но за края уходить нельзя.
  s.difficulty = 99;
  assert.equal(revealTrustGate(s), 39, "сложность обязана зажиматься в шкалу");
});

test("инвариант 8: трудный стол проходит меньше пути к своему дну", () => {
  // Та же стенограмма, тот же стол — меняется только сложность.
  const lines = PRINCIPLED.investor;
  const walked: Record<number, number> = {};
  for (const d of [2, 3, 4, 5]) {
    const s = newSession(SCENARIO_MAP.investor, "ru");
    s.difficulty = d;
    for (const text of lines) {
      if (s.status !== "active") break;
      s.turn += 1;
      applyMove(s, analyze(text), text);
    }
    const sc = SCENARIO_MAP.investor;
    walked[d] = Math.abs(s.offerOpp - sc.open) / Math.abs(sc.open - sc.floor);
    // Инвариант 1 не отменяется никаким коэффициентом сложности.
    assert.ok(s.offerOpp >= sc.floor - 0.001, `d=${d}: цена ${s.offerOpp} ниже дна ${sc.floor}`);
  }
  for (const [lo, hi] of [[2, 3], [3, 4], [4, 5]]) {
    assert.ok(walked[lo] >= walked[hi], `сложность ${hi} прошла дальше, чем ${lo}: ${JSON.stringify(walked)}`);
  }
  assert.ok(walked[2] > walked[5], `сложность не различима: ${JSON.stringify(walked)}`);
});
