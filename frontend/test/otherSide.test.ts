// otherSide.test.ts — режим «Обратная сторона стола».
//
// Режим держится на одном утверждении, и оно инженерное, а не педагогическое:
// СМЕНА СТОРОНЫ СТОЛА НЕ ТРЕБУЕТ ВТОРОГО ДВИЖКА. Вся асимметрия «кто здесь
// игрок» лежит в записи стола, поэтому зеркало — это данные, а грейд считает
// та же `scoreSession` по той же формуле. Отсюда и предмет проверок:
//
//   каталог   — список имён на критическом пути не разъехался с самими
//               записями (иначе кнопка запускает стол, которого нет);
//   движок    — зеркало играется тем же движком: инвариант 1 (оппонент не
//               переходит своё дно) и грейд по той же формуле;
//   карточка  — есть только у зеркала, полна офлайн, и её «окна» названы
//               ходом и числами, а не общим советом;
//   границы   — из карточки в счёт не заходит ничего (инвариант 6);
//   загрузка  — записи столов и экран режима не лежат на пути к первой
//               отрисовке, но прогреваются на простое (инвариант 5).
//
// Числовой паритет с сервером доказывается не здесь, а в games.test.ts: там
// зеркальные партии из фикстуры сверяются с тем, что посчитал Python.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, resolve } from "node:path";
import { MIRRORS, MIRROR_MAP } from "../src/data/mirrors";
import { MIRROR_IDS, isMirrorTable } from "../src/lib/mirrorIds";
import { SCENARIO_MAP, SCENARIOS, defendedInterests, toScenarioView } from "../src/data/scenarios";
import { analyze, applyMove, newSession, otherSide, scoreSession } from "../src/mock/engine";
import type { Lang } from "../src/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const LANGS: Lang[] = ["ru", "en"];

function play(scenarioId: string, lines: string[], lang: Lang = "ru") {
  const def = SCENARIO_MAP[scenarioId] ?? MIRROR_MAP[scenarioId];
  const s = newSession(def, lang);
  for (const text of lines) {
    if (s.status !== "active") break;
    s.turn += 1;
    applyMove(s, analyze(text), text);
    if (s.status === "active" && s.turn >= s.maxTurns) s.status = "breakdown";
  }
  return { s, debrief: scoreSession(s) };
}

// ---- 1. Каталог --------------------------------------------------------------

test("список имён на критическом пути совпадает с записями столов", () => {
  // `lib/mirrorIds.ts` едет на первую отрисовку (по нему App решает, писать ли
  // партию соперником), а `data/mirrors.ts` — нет. Разъехаться им нельзя:
  // кнопка запускала бы стол, которого нет ни в одном движке.
  assert.deepEqual([...MIRROR_IDS], MIRRORS.map((m) => m.id));
  for (const id of MIRROR_IDS) assert.ok(isMirrorTable(id), id);
  assert.ok(!isMirrorTable("supplier"), "обычный стол не зеркальный");
  assert.ok(!isMirrorTable(null));
});

test("зеркала не попали в библиотеку — иначе поехало бы расписание «стола дня»", () => {
  // Девять столов и четыре условия взаимно просты; десятая запись сломала бы
  // это, и у всех сдвинулось бы завтрашнее задание (lib/daily.ts).
  assert.equal(SCENARIOS.length, 9);
  for (const id of MIRROR_IDS) assert.ok(!SCENARIO_MAP[id], `${id} проник в библиотеку`);
});

test("каждое зеркало ссылается на существующий стол и берёт его числа", () => {
  for (const m of MIRRORS) {
    const origin = SCENARIO_MAP[m.mirrorOf ?? ""];
    assert.ok(origin, `${m.id}: оригинала ${m.mirrorOf} нет`);
    assert.equal(m.resv, origin.floor, `${m.id}: дно игрока обязано быть дном персоны оригинала`);
    assert.equal(m.floor, origin.resv, `${m.id}: дно оппонента обязано быть красной линией оригинала`);
    assert.notEqual(m.dir, origin.dir, `${m.id}: направление шкалы не перевёрнуто`);
    // ZOPA не пустая, и оппонент открывается ЗА красной линией игрока.
    if (m.dir === "low") {
      assert.ok(m.floor < m.resv && m.open > m.resv, m.id);
    } else {
      assert.ok(m.floor > m.resv && m.open < m.resv, m.id);
    }
  }
});

test("«что вы защищаете» ЦИТИРУЕТ оригинал, а не пишет свой текст рядом", () => {
  for (const m of MIRRORS) {
    const origin = SCENARIO_MAP[m.mirrorOf ?? ""];
    for (const lang of LANGS) {
      const got = defendedInterests(m, lang);
      assert.deepEqual(got.map((d) => d.text), origin.interests[lang], m.id);
      assert.deepEqual(got.map((d) => d.topic), origin.interestTopics[lang], m.id);
    }
    // У обычного стола защищать нечего: прячет там оппонент.
    assert.deepEqual(defendedInterests(SCENARIO_MAP.supplier, "ru"), []);
    assert.equal(toScenarioView(SCENARIO_MAP.supplier, "ru").mirror_of, "");
    assert.deepEqual(toScenarioView(SCENARIO_MAP.supplier, "ru").defending, []);
    assert.equal(toScenarioView(m, "ru").mirror_of, m.mirrorOf);
    // Своя карта едет в СРЕЗЕ СЦЕНАРИЯ, а не только в разбор: за столом игрок
    // обязан видеть, что он здесь защищает, — это его собственные причины.
    assert.deepEqual(toScenarioView(m, "ru").defending, defendedInterests(m, "ru"));
  }
});

// ---- 2. Тот же движок --------------------------------------------------------

for (const m of MIRRORS) {
  test(`инвариант 1: за столом «${m.id}» оппонент не переходит своё дно`, () => {
    const s = newSession(m, "ru");
    const lines = [
      "Почему для вас это важно и что для вас важнее всего?",
      "По рыночным данным медиана 1000000, потому что это стандарт.",
      "Если мы дадим всё, что вы просите, сможете подвинуться?",
    ];
    for (let i = 0; i < 20; i++) {
      const text = `${lines[i % lines.length]} (${i})`;
      s.turn += 1;
      applyMove(s, analyze(text), text);
      if (s.lowerBetter) assert.ok(s.offerOpp >= m.floor - 1e-9, `${s.offerOpp} < ${m.floor}`);
      else assert.ok(s.offerOpp <= m.floor + 1e-9, `${s.offerOpp} > ${m.floor}`);
    }
  });
}

test("инвариант 2: агрессия за зеркальным столом срывает его и даёт F", () => {
  const rude = [
    "Ваша цена — просто грабёж, вы обманываете.",
    "Либо вы двигаетесь прямо сейчас, либо мы уходим — это ультиматум.",
    "Требую немедленно двигаться, иначе разрываем.",
    "Это просто смешно и некомпетентно.",
    "Вы врёте, и с вами противно разговаривать.",
  ];
  for (const m of MIRRORS) {
    const { s, debrief } = play(m.id, rude);
    assert.equal(s.status, "breakdown", m.id);
    assert.equal(debrief.grade, "F", `${m.id}: ${debrief.grade} (${debrief.overall})`);
  }
});

// ---- 3. Карточка -------------------------------------------------------------

test("карточки нет на обычном столе и нет до первого хода", () => {
  const { s } = play("supplier", ["Почему для вас важна загрузка производства?"]);
  assert.equal(otherSide(s), null, "обычный стол не имеет права рисовать карточку зеркала");
  assert.equal(otherSide(newSession(MIRROR_MAP.supplier_mirror, "ru")), null,
    "пустая карточка — это четвёртое состояние, которого не бывает");
});

for (const lang of LANGS) {
  test(`карточка называет ХОД, на котором вопрос сработал бы (${lang})`, () => {
    const line = lang === "ru" ? "Ваша цена — просто грабёж." : "Your price is robbery.";
    const { s } = play("supplier_mirror", [line], lang);
    const card = otherSide(s)!;
    assert.ok(card, "карточки нет");
    assert.equal(card.asked, 0);
    assert.equal(card.total, 3);
    assert.equal(card.windows.length, 3, "невскрытых три — окон обязано быть три");
    const turnWord = lang === "ru" ? "Ход 1" : "Turn 1";
    for (const w of card.windows) assert.ok(w.includes(turnWord), w);
    assert.equal(card.seat, SCENARIO_MAP.supplier.cp.nm[lang]);
    assert.equal(card.origin_id, "supplier");
    assert.equal(card.defended.length, 3);
  });
}

test("холодный стол говорит, что вопрос не сработал бы НИ НА ОДНОМ ходу", () => {
  const s = newSession(MIRROR_MAP.investor_mirror, "ru");
  s.trust = 10;
  for (const text of ["Ваша цена — просто грабёж.", "Вы обманываете, это некомпетентно."]) {
    s.turn += 1;
    applyMove(s, analyze(text), text);
  }
  const card = otherSide(s)!;
  for (const w of card.windows) assert.ok(w.includes("ни на одном ходу"), w);
});

test("инвариант 6: из карточки в счёт не заходит ничего", () => {
  const lines = [
    "Почему для вас так важен бюджет закупки на этот год?",
    "По рыночным данным медиана независимых прайсов 90 рублей за штуку, потому что это отраслевой стандарт.",
  ];
  const quiet = play("supplier_mirror", lines).debrief;
  const { s } = play("supplier_mirror", lines);
  otherSide(s);
  const after = scoreSession(s);
  for (const key of ["overall", "grade", "economic", "relationship", "technique"] as const) {
    assert.equal(after[key], quiet[key], key);
  }
});

// ---- 4. Загрузка -------------------------------------------------------------

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
    for (const m of text.matchAll(/(?:^|\n)(?:import|export)\s(?!type\s)[^;]*?from\s*"([^"]+)"/g)) {
      const target = resolveSpec(file, m[1]);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return seen;
}

test("записи зеркальных столов и экран режима не лежат на пути к первой отрисовке", () => {
  const graph = staticGraph(join(SRC, "main.tsx"));
  const leaked = ["data/mirrors.ts", "components/OtherSideScreen.tsx"]
    .filter((rel) => graph.has(normalize(join(SRC, rel))));
  assert.deepEqual(leaked, [],
    "статический импорт вернул это на домашний экран:\n" + leaked.join("\n"));
  // А карточка входа и список имён — обязаны быть: без них в режим нечем войти,
  // а App нечем отличить зеркальный стол от «своей сделки».
  assert.ok(graph.has(normalize(join(SRC, "components/OtherSideCard.tsx"))));
  assert.ok(graph.has(normalize(join(SRC, "lib/mirrorIds.ts"))));
});

test("отложенный экран прогревается на простое — иначе без сети он не откроется", () => {
  const src = readFileSync(join(SRC, "components/OtherSideCard.tsx"), "utf8");
  const dynamic = [...src.matchAll(/\bimport\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(dynamic, ["./OtherSideScreen"], "путь к экрану называется ровно один раз");
  assert.match(src, /requestIdleCallback/, "прогрева на простое нет");
  assert.match(src, /loadOtherSideScreen\(\)\.catch/, "прогрев обязан глушить отказ молча");
});
