// parity.test.ts — proves the offline mock engine is at behavioral parity with
// the Python backend (backend/app/engine): all 8 scenarios with structured
// logrolling, honest per-interest reveal, the anti-gaming repetition penalty, the
// technique floor, and non-looping persona banks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENARIOS, SCENARIO_MAP } from "../src/data/scenarios";
import { analyze, applyMove, newSession, renderLine, scoreSession } from "../src/mock/engine";

const EXPECTED_IDS = [
  "supplier", "salary", "conflict", "investor", "rent", "used_car", "freelance_rate", "sla_renewal",
];

// Drive one player line through the engine exactly like MockServer.handleTurn.
function play(s: ReturnType<typeof newSession>, text: string) {
  s.turn += 1;
  return applyMove(s, analyze(text), text);
}

test("all 8 backend scenarios are present with structured logrolling", () => {
  assert.deepEqual(SCENARIOS.map((s) => s.id), EXPECTED_IDS);
  for (const sc of SCENARIOS) {
    assert.ok((sc.secondaryIssues?.length ?? 0) >= 2, `${sc.id} must carry secondary issues`);
    for (const iss of sc.secondaryIssues ?? []) {
      assert.equal(typeof iss.oppValue, "number");
      assert.equal(typeof iss.playerCost, "number");
      assert.ok(iss.keywords.ru.length > 0 && iss.keywords.en.length > 0);
    }
    // Honest-reveal keyword lists exist and are index-aligned with the interests.
    assert.ok(sc.hiddenInterestKeywords, `${sc.id} must have hidden-interest keywords`);
    assert.equal(sc.hiddenInterestKeywords!.ru.length, sc.interests.ru.length);
    assert.equal(sc.hiddenInterestKeywords!.en.length, sc.interests.en.length);
  }
});

test("honest reveal: a specific question uncovers the RIGHT interest, not next-in-order", () => {
  // "долгосрочный контракт" targets supplier interest index 2 (long-term), even
  // though indexes 0/1 are still hidden — the opponent speaks to what was asked.
  const s = newSession(SCENARIO_MAP.supplier, "ru");
  play(s, "Что для вас важнее всего в долгосрочном контракте и почему именно это?");
  assert.deepEqual(s.interests, [2], "long-term interest revealed, not interest 0");

  // Общий вопрос без попадания в ключевые слова не вскрывает НИЧЕГО: запасной
  // ход «отдай следующий по списку» убран — три одинаковых «Почему?» вскрывали
  // все три интереса. Зеркало backend _reveal_index_offline.
  const s2 = newSession(SCENARIO_MAP.supplier, "ru");
  const r2 = play(s2, "А что для вас важнее всего в этой сделке?");
  assert.deepEqual(s2.interests, [], "vague probe → ничего не вскрыто");
  assert.equal(r2.reaction, "probe_vague", "оппонент переспрашивает, а не выдаёт секрет");
});

test("anti-gaming: repeating the exact same strong line barely moves the opponent", () => {
  const s = newSession(SCENARIO_MAP.supplier, "ru");
  const line = "Рыночная цена по отрасли — 86, потому что это медиана независимых данных.";
  const start = s.offerOpp;
  play(s, line);
  const afterFirst = s.offerOpp;
  const move1 = start - afterFirst; // toward the floor (lower is better)
  play(s, line); // identical repeat
  const move2 = afterFirst - s.offerOpp;
  assert.ok(move1 > 0, "the first strong line moves the price");
  assert.ok(move2 < move1 * 0.4, `a verbatim repeat barely moves (got ${move2} vs ${move1})`);
});

test("technique floor: a great number bought without method is capped at C", () => {
  // Land a strong price on the salary scenario by anchoring numbers only, with no
  // interest probing / criteria / trade-offs. High economic, low technique → ≤ C.
  const s = newSession(SCENARIO_MAP.salary, "ru");
  play(s, "Моя позиция — 230.");
  play(s, "Предлагаю 230.");
  play(s, "Давайте 230, по рукам, договорились.");
  const d = scoreSession(s);
  assert.ok(d.technique < 45, `technique should be low (got ${d.technique})`);
  assert.ok(d.grade !== "A" && d.grade !== "B", `grade capped below A/B (got ${d.grade})`);
});

test("non-looping banks: the same reaction varies its line across turns", () => {
  const s = newSession(SCENARIO_MAP.supplier, "ru"); // relationship persona
  const seen = new Set<string>();
  for (let t = 1; t <= 4; t++) {
    s.turn = t; // vary only the line seed; offer/interests held constant
    seen.add(renderLine(s, "neutral", false));
  }
  assert.ok(seen.size >= 3, `consecutive same-reaction turns should vary (got ${seen.size} distinct)`);
});

test("persona voice: different styles pull different variant lines for one reaction", () => {
  const rel = newSession(SCENARIO_MAP.supplier, "ru"); // relationship
  const tough = newSession(SCENARIO_MAP.conflict, "ru"); // tough
  rel.turn = 1; tough.turn = 1;
  // Style variants sit in front of the shared base, so seed 1 pulls a style line.
  assert.notEqual(renderLine(rel, "hardened", false), renderLine(tough, "hardened", false));
});

test("principled supplier game grades A or B (method earns the number)", () => {
  const s = newSession(SCENARIO_MAP.supplier, "ru");
  play(s, "Здравствуйте, рад встрече! Расскажите, как у вас сейчас с загрузкой производства?");
  play(s, "Понимаю вас. А что для вас важнее всего — денежный поток и предоплата, и почему?");
  play(s, "Ясно. А что для вас важнее в долгосрочном контракте, ради чего он вам?");
  play(s, "По рыночным данным справедливая цена — 86, потому что это медиана по отрасли.");
  play(s, "Если мы подпишем годовой контракт с гарантией объёма и дадим предоплату 30%, сможете подвинуться по цене?");
  play(s, "Тогда предлагаю 86, потому что годовой объём это оправдывает.");
  play(s, "Отлично, договорились на 86, по рукам!");
  const d = scoreSession(s);
  assert.equal(d.status, "agreement", `should close a deal (got ${d.status})`);
  assert.ok(s.interests.length >= 2, `interests uncovered (got ${s.interests.length})`);
  assert.ok(s.termsConceded.length >= 1, "at least one term traded");
  assert.ok(d.grade === "A" || d.grade === "B", `principled play → A/B (got ${d.grade}, overall ${d.overall})`);
});

test("aggressive game breaks down to F", () => {
  const s = newSession(SCENARIO_MAP.used_car, "ru"); // tough persona amplifies tension
  let closed = false;
  for (let i = 0; i < 6 && !closed; i++) {
    const r = play(s, "Снижайте цену немедленно, иначе мы уходим! Это смешно и просто некомпетентно.");
    closed = r.closed;
  }
  const d = scoreSession(s);
  assert.equal(d.status, "breakdown", `hostility should break the talk (got ${d.status})`);
  assert.equal(d.grade, "F", `breakdown → F (got ${d.grade})`);
});

// ---------------------------------------------------------------------------
// Паритет модальностей: голос и клавиатура дают ОДИН И ТОТ ЖЕ ход
// ---------------------------------------------------------------------------
//
// Требование realtime-пересборки. Ход не должен зависеть от того, набрали его
// или произнесли, — иначе тренажёр оценивает дикцию вместо переговоров.
//
// Технически модальность неразличима по построению: распознавание отдаёт тот
// же `text`, что и клавиатура. Реальный риск в другом — в ФОРМЕ числа. Люди
// печатают «300 000», а говорят «триста тысяч», и до правки это давало разные
// ходы: offer против statement.

test("паритет: цена словами и цифрами — один и тот же ход", () => {
  const pairs: Array<[string, string]> = [
    ["Готов платить триста тысяч рублей.", "Готов платить 300 000 рублей."],
    ["Моя цена шестьдесят четыре тысячи.", "Моя цена 64 000."],
    ["Предлагаю восемьдесят пять тысяч за штуку.", "Предлагаю 85 000 за штуку."],
  ];
  for (const [spoken, typed] of pairs) {
    const a = analyze(spoken);
    const b = analyze(typed);
    assert.equal(a.primary, b.primary, `«${spoken}» дало ${a.primary}, «${typed}» — ${b.primary}`);
    assert.equal(a.number, b.number, `число разошлось: ${a.number} vs ${b.number}`);
    assert.deepEqual(a.tags.map((t) => t.key).sort(), b.tags.map((t) => t.key).sort());
    assert.equal(a.arg, b.arg);
  }
});

test("число без разделителя читается целиком, а не первыми тремя цифрами", () => {
  // Регрессия на найденный дефект: прежняя регулярка требовала разделитель
  // групп, поэтому «300000» читалось как 300 — игрок называл одну цену, а
  // движок засчитывал другую, молча.
  assert.equal(analyze("цена 300000").number, 300000);
  assert.equal(analyze("цена 64000").number, 64000);
  assert.equal(analyze("цена 300 000").number, 300000);
  assert.equal(analyze("85.5 за штуку").number, 85.5);
});

test("одиночное числительное без единицы НЕ становится ценой", () => {
  // «Три условия» не должно превратиться в оффер на 3.
  assert.equal(analyze("У меня три условия.").number, null);
  assert.equal(analyze("Три, четыре пункта").number, null);
  assert.notEqual(analyze("У меня три условия.").primary, "offer");
});

// ---------------------------------------------------------------------------
// Классификатор хода: буквальная сверка с Python по фикстуре.
//
// Раньше паритет проверялся поведением партии целиком — и этого оказалось мало:
// в TS-зеркале была проверка `substance` (цифра или связка «потому что») на
// прибавку за критерий и размен, а в Python её не было. Одна и та же реплика
// получала 38 очков аргумента онлайн и 28 офлайн, и упражнение курса зачитывалось
// по-разному в зависимости от того, была ли сеть.
//
// Фикстура генерируется из настоящего Python-движка:
//   cd services/gateway && python tools/gen_analyze_fixtures.py
// Тест `tests/test_analyze_fixtures.py` на той стороне следит, чтобы она не
// протухла. Здесь — что зеркало отвечает то же самое.
import fixtures from "./fixtures/analyze.json" with { type: "json" };

test("классификатор в браузере отвечает ровно как движок в Python", () => {
  const bad: string[] = [];
  // `words` в фикстуре есть, но в TS-анализе его нет как поля — он участвует
  // только внутри расчёта арг-качества, и расхождение по нему проявилось бы в `arg`.
  for (const c of fixtures.cases as {
    text: string; moves: string[]; arg: number;
    number: number | null; spin: string | null; primary: string;
  }[]) {
    const a = analyze(c.text);
    if (JSON.stringify([...a.moves].sort()) !== JSON.stringify([...c.moves].sort())) {
      bad.push(`«${c.text}» приёмы: ${a.moves} ≠ ${c.moves}`);
    } else if (a.arg !== c.arg) {
      bad.push(`«${c.text}» аргумент: ${a.arg} ≠ ${c.arg}`);
    } else if (a.number !== c.number) {
      bad.push(`«${c.text}» число: ${a.number} ≠ ${c.number}`);
    } else if ((a.spin ?? null) !== (c.spin ?? null)) {
      bad.push(`«${c.text}» SPIN: ${a.spin} ≠ ${c.spin}`);
    } else if (a.primary !== c.primary) {
      bad.push(`«${c.text}» главный приём: ${a.primary} ≠ ${c.primary}`);
    }
  }
  assert.equal(bad.length, 0, `\n${bad.slice(0, 12).join("\n")}\n(всего ${bad.length})`);
});

test("«70 тысяч» одинаково читается в браузере и в движке", () => {
  // Живая партия закрылась на 29 902k за месяц: множитель после цифр дописывался
  // отдельным числом («70 1000»), и регулярка цены читала «70 100». Зеркало
  // обязано считать так же, иначе офлайн и онлайн разойдутся на ровном месте.
  const cases: [string, number | null][] = [
    ["Тогда фиксируем: 70 тысяч в месяц. По рукам?", 70000],
    ["Готов платить полтора миллиона.", 1500000],
    ["Ставка 1,5 миллиона за проект.", 1500000],
    ["Три предложения на столе.", null],
  ];
  for (const [text, expected] of cases) {
    assert.equal(analyze(text).number, expected, text);
  }
});

test("«70 тысяч» на столе, который считает тысячами, — это 70", () => {
  // Пересчёт идёт в ОБЕ стороны и только в единицах самого сценария. Без
  // ветки «/1000» сделка в аренде закрывалась на 29 902k за месяц; с одной
  // лишь «×1000» число просто игнорировалось, и человек, назвавший семьдесят
  // тысяч, не называл ничего. Зеркало обязано считать так же, иначе офлайн и
  // онлайн разъедутся ровно там, где игрок называет цену.
  const s = newSession(SCENARIO_MAP["rent"], "ru");
  const line = "Готов подписать на 70 тысяч в месяц, договорились?";
  applyMove(s, analyze(line), line);
  assert.ok(s.offerPlayer !== null, "число не стало ценой вовсе");
  assert.ok(s.offerPlayer! > 40 && s.offerPlayer! < 150,
    `цена вне шкалы стола: ${s.offerPlayer}`);
});
