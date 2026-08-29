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
import { analyze, applyMove, newSession, resistance, revealTrustGate, scoreSession } from "../src/mock/engine";
import { formatDeal } from "../src/lib/format";
import type { Lang } from "../src/types";

const GAMES = JSON.parse(readFileSync(new URL("./fixtures/games.json", import.meta.url), "utf8"));
const SCORES = JSON.parse(readFileSync(new URL("./fixtures/games.scores.json", import.meta.url), "utf8"));

// Партии двуязычные ({ru, en}); зеркало сверяется по русской половине —
// инвариант 8 про совпадение двух РЕАЛИЗАЦИЙ движка, а не двух языков.
// Английскую половину гоняет services/gateway/tests/test_reference_games.py.
const PRINCIPLED: Record<string, string[]> = Object.fromEntries(
  Object.entries(GAMES.principled)
    .filter(([k]) => k !== "note")
    .map(([k, v]) => [k, (v as { ru: string[] }).ru]),
) as Record<string, string[]>;
const LADDER = GAMES.ladder;

function linesOf(game: { lines: string[] | string }): string[] {
  const l = game.lines;
  return typeof l === "string" && l.startsWith("@principled.") ? PRINCIPLED[l.split(".")[1]] : (l as string[]);
}

// Ровно тот же цикл, что у MockServer.handleTurn и у backend-хелпера play().
function play(scenarioId: string, lines: string[], lang: Lang = "ru") {
  const s = newSession(SCENARIO_MAP[scenarioId], lang);
  for (const text of lines) {
    if (s.status !== "active") break;
    s.turn += 1;
    applyMove(s, analyze(text), text);
    if (s.status === "active" && s.turn >= s.maxTurns) s.status = "breakdown";
  }
  return { s, debrief: scoreSession(s) };
}

function checkAgainstBackend(name: string, scenarioId: string, lines: string[], want: Record<string, unknown>) {
  const { s, debrief } = play(scenarioId, lines, (LADDER.lang ?? "ru") as Lang);
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

// ---- Право первого слова -----------------------------------------------------
// Две партии, отличающиеся ТОЛЬКО первой репликой: якорь с критерием против той
// же цифры голой. Сдвиг рамки живёт в applyMove, а не в классификаторе, — то
// есть ровно там, где два ядра расходятся молча, оставив чипы синхронными.
const FIRST_WORD = GAMES.first_word;

for (const gid of FIRST_WORD.order as string[]) {
  test(`инвариант 8: первое слово — партия «${gid}» считается так же, как на сервере`, () => {
    const game = FIRST_WORD.games.find((g: { id: string }) => g.id === gid);
    checkAgainstBackend(gid, FIRST_WORD.scenario, game.lines, SCORES.first_word[gid]);
  });
}

test("первое слово: обоснованный якорь стоит дороже той же цифры голой", () => {
  const played: Record<string, { overall: number; technique: number; offerOpp: number }> = {};
  for (const gid of FIRST_WORD.order as string[]) {
    const game = FIRST_WORD.games.find((g: { id: string }) => g.id === gid);
    const { s, debrief } = play(FIRST_WORD.scenario, game.lines, FIRST_WORD.lang as Lang);
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

test("лестница качества: спам обязан быть ниже базовой игры", () => {
  const scores: Record<string, number> = {};
  for (const gid of LADDER.order as string[]) {
    const game = LADDER.games.find((g: { id: string }) => g.id === gid);
    scores[gid] = play(LADDER.scenario, linesOf(game)).debrief.overall;
  }
  const order = LADDER.order as string[];
  for (let i = 1; i < order.length; i++) {
    assert.ok(
      scores[order[i - 1]] <= scores[order[i]],
      `«${order[i - 1]}» (${scores[order[i - 1]]}) выше «${order[i]}» (${scores[order[i]]})`,
    );
  }
  assert.ok(scores.spam < scores.basic, `спам ${scores.spam} не ниже базовой ${scores.basic}`);
  assert.ok(scores.alternating < scores.basic, `чередование ${scores.alternating} не ниже базовой ${scores.basic}`);
  assert.ok(scores.exemplary >= 85, `образцовая партия ${scores.exemplary} не дотянула до A`);
});

test("двенадцать пустых реплик не двигают цену", () => {
  const game = LADDER.games.find((g: { id: string }) => g.id === "passive");
  const { s } = play(LADDER.scenario, linesOf(game));
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
  // 1 + 0.06·(3.5 − d): лёгкий стол уступает щедрее, трудный скупее.
  for (const [d, want] of [[2, 1.09], [3, 1.03], [4, 0.97], [5, 0.91]] as [number, number][]) {
    s.difficulty = d;
    assert.ok(Math.abs(resistance(s) - want) < 1e-9, `d=${d}: ${resistance(s)} вместо ${want}`);
  }
  // 30 + 2·(d − 2): у трудного собеседника открыться труднее.
  for (const [d, want] of [[2, 30], [3, 32], [4, 34], [5, 36]] as [number, number][]) {
    s.difficulty = d;
    assert.equal(revealTrustGate(s), want, `d=${d}`);
  }
  // Шкала карточки — 1..5; своя сделка присылает 3, но за края уходить нельзя.
  s.difficulty = 99;
  assert.equal(revealTrustGate(s), 36, "сложность обязана зажиматься в шкалу");
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
