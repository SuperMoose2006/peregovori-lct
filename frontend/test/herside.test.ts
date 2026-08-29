// herside.test.ts — «С той стороны стола» в браузерном зеркале.
//
// ПОСИМВОЛЬНЫЙ ПАРИТЕТ С СЕРВЕРОМ ЗДЕСЬ НЕ ПРОВЕРЯЕТСЯ: его проверяет
// games.test.ts на шестнадцати эталонных партиях против фикстуры, которую
// пишет сам движок-источник (tools/gen_game_scores.py). Здесь — то, чего
// фикстура не видит: пустая партия, чистота функции, отсутствие языковых
// протечек и главное — что колонка НЕ ВХОДИТ в счёт (инвариант 6).
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENARIO_MAP, SCENARIOS } from "../src/data/scenarios";
import { analyze, applyMove, herSide, newSession, scoreSession } from "../src/mock/engine";
import type { Lang } from "../src/types";

const CYRILLIC = /[а-яА-ЯёЁ]/;

const PRINCIPLED = [
  "Здравствуйте! Почему для вас так важна стабильная загрузка производства?",
  "Понимаю вас. А почему для вас важен денежный поток и предоплата?",
  "Зачем вам разовый заказ, если можно долгосрочный годовой контракт?",
  "По рыночным данным медиана независимых прайсов 86, потому что это отраслевой стандарт.",
  "Если мы дадим годовой контракт с гарантией объёма и предоплату, сможете подвинуться к 86?",
  "Фиксируем пакет: годовой контракт, предоплата — и цена 86. Договорились?",
];
const RUDE = [
  "Что для вас важнее всего — и почему именно это?",
  "Либо вы двигаетесь, либо мы уходим — это ультиматум.",
  "Требую немедленно снизить, иначе разрываем.",
  "Это просто смешно и некомпетентно, вы обманываете.",
];

// Тот же цикл, что у MockServer.handleTurn.
function play(scenarioId: string, lines: string[], lang: Lang = "ru") {
  const s = newSession(SCENARIO_MAP[scenarioId], lang);
  for (const text of lines) {
    if (s.status !== "active") break;
    s.turn += 1;
    applyMove(s, analyze(text), text);
  }
  return s;
}

function allText(col: NonNullable<ReturnType<typeof herSide>>): string[] {
  return [...col.turns.map((t) => t.said), col.missed, col.ask].filter(Boolean);
}

test("партия без единого хода не рисует колонку вовсе", () => {
  assert.equal(herSide(newSession(SCENARIO_MAP.supplier, "ru")), null);
  assert.equal(scoreSession(newSession(SCENARIO_MAP.supplier, "ru")).her_side, null);
});

test("колонка покрывает каждый ход и цитирует игрока", () => {
  const col = herSide(play("supplier", PRINCIPLED))!;
  assert.deepEqual(col.turns.map((t) => t.turn), [1, 2, 3, 4, 5, 6]);
  col.turns.forEach((t, i) => {
    assert.equal(t.quote, PRINCIPLED[i].slice(0, 140));
    assert.ok(t.said.length > 0);
    assert.ok(["good", "bad", "flat"].includes(t.tone));
  });
});

test("одинаковая партия даёт одинаковый текст", () => {
  for (const lines of [PRINCIPLED, RUDE]) {
    assert.deepEqual(herSide(play("supplier", lines)), herSide(play("supplier", lines)));
  }
});

test("ни одного незакрытого плейсхолдера", () => {
  for (const lang of ["ru", "en"] as Lang[]) {
    for (const sc of SCENARIOS) {
      for (const s of allText(herSide(play(sc.id, PRINCIPLED, lang))!)) {
        assert.ok(!s.includes("{") && !s.includes("}"), `${sc.id}/${lang}: ${s}`);
      }
    }
  }
});

test("за столом говорит его собственная персона", () => {
  for (const lang of ["ru", "en"] as Lang[]) {
    for (const sc of SCENARIOS) {
      const col = herSide(play(sc.id, PRINCIPLED, lang))!;
      const mine = sc.cp.nm[lang].split(",")[0].trim();
      assert.equal(col.name, mine);
      const blob = allText(col).join(" ");
      for (const other of SCENARIOS) {
        const alien = other.cp.nm[lang].split(",")[0].trim();
        if (alien === mine) continue;
        // По основе и от границы слова: русское имя склоняется, а внутри
        // английского «hiring» сидит «irin».
        assert.ok(!new RegExp(`\\b${alien.slice(0, -1)}`, "i").test(blob),
                  `${sc.id}/${lang}: чужое имя ${alien}`);
      }
    }
  }
});

test("откат за хамство виден и подписан ценой", () => {
  const s = play("supplier", [
    "По рыночным данным медиана независимых прайсов 86, потому что это стандарт.",
    "Это просто смешно и некомпетентно, вы обманываете.",
  ]);
  const turn = herSide(s)!.turns[1];
  assert.equal(turn.tone, "bad");
  const price = turn.meters.find((m) => m.startsWith("Цена"));
  assert.ok(price, JSON.stringify(turn.meters));
  const [before, after] = price!.split(" ").filter((x) => /^[\d,.]+$/.test(x))
    .map((x) => Number(x.replace(",", ".")));
  assert.ok(after > before, `цена не ушла назад: ${price}`);
});

test("порог доверия объяснён, а не спрятан", () => {
  const s = play("supplier", [
    "Это просто смешно и некомпетентно, вы обманываете.",
    "Почему для вас так важна стабильная загрузка производства?",
  ]);
  assert.equal(s.ledger[1].gated, true);
  assert.equal(herSide(s)!.turns[1].tone, "bad");
});

test("билингвальность без протечек", () => {
  const ru = herSide(play("supplier", PRINCIPLED, "ru"))!;
  const en = herSide(play("supplier", PRINCIPLED, "en"))!;
  assert.notDeepEqual(ru.turns.map((t) => t.said), en.turns.map((t) => t.said));
  for (const s of allText(en)) assert.ok(!CYRILLIC.test(s), `кириллица в EN: ${s}`);
  for (const s of allText(ru)) assert.ok(CYRILLIC.test(s), `латиница в RU: ${s}`);
});

test("инвариант 6: колонка ничего не добавляет в счёт", () => {
  for (const lines of [PRINCIPLED, RUDE]) {
    const s = play("supplier", lines);
    const before = scoreSession(s);
    herSide(s);
    const after = scoreSession(s);
    for (const k of ["overall", "grade", "economic", "relationship", "technique"] as const) {
      assert.equal(after[k], before[k]);
    }
    // …и без хроники счёт тот же: в score_session она не заходит физически.
    s.ledger = [];
    const bare = scoreSession(s);
    for (const k of ["overall", "grade", "economic", "relationship", "technique"] as const) {
      assert.equal(bare[k], before[k]);
    }
  }
});
