// Стол дня обязан совпасть с серверным до последнего дня, иначе офлайн-ядро
// играет другую игру (инвариант 8). Ожидаемые пары ниже сняты прогоном
// app/engine/daily.py — не переписаны из головы.
import test from "node:test";
import assert from "node:assert/strict";
import { dailyTable, dayNumber, DAILY_MODIFIERS } from "../src/lib/daily";
import { SCENARIOS, SCENARIO_MAP } from "../src/data/scenarios";

test("число дня — это дни с 1970-01-01, как в Python", () => {
  assert.equal(dayNumber(new Date(1970, 0, 1)), 0);
  assert.equal(dayNumber(new Date(1970, 0, 2)), 1);
  assert.equal(dayNumber(new Date(2026, 7, 28)), 20693);
});

test("расписание совпадает с серверным", () => {
  // Снято прогоном services/gateway/app/engine/daily.py на тех же датах.
  const expected: [string, string, string][] = [
    ["2026-08-28", "used_car", "tense"],
    ["2026-08-29", "freelance_rate", "plain"],
    ["2026-08-30", "sla_renewal", "short"],
    ["2026-08-31", "supplier", "tense"],
    ["2026-09-01", "salary", "plain"],
    ["2026-09-02", "conflict", "short"],
  ];
  for (const [iso, scenarioId, modifierId] of expected) {
    const [y, m, d] = iso.split("-").map(Number);
    const got = dailyTable(new Date(y, m - 1, d));
    assert.equal(got.day, iso);
    assert.equal(got.scenarioId, scenarioId, iso);
    assert.equal(got.modifier.id, modifierId, iso);
  }
});

test("один и тот же день — один и тот же стол", () => {
  const d = new Date(2026, 7, 28);
  const first = dailyTable(d);
  for (let i = 0; i < 20; i++) assert.deepEqual(dailyTable(d), first);
});

test("за восемь дней проходят все столы", () => {
  const seen = new Set<string>();
  for (let i = 0; i < SCENARIOS.length; i++) {
    seen.add(dailyTable(new Date(2026, 7, 28 + i)).scenarioId);
  }
  assert.equal(seen.size, SCENARIOS.length);
});

test("пара «стол + условие» не повторяется через неделю", () => {
  const pairs = new Set<string>();
  for (let i = 0; i < 32; i++) {
    const t = dailyTable(new Date(2026, 0, 1 + i));
    pairs.add(`${t.scenarioId}/${t.modifier.id}`);
  }
  assert.equal(pairs.size, SCENARIOS.length * DAILY_MODIFIERS.length);
});

test("условия билингвальны и объяснены", () => {
  for (const m of DAILY_MODIFIERS) {
    for (const field of [m.label, m.note]) {
      assert.ok(field.ru.trim() && field.en.trim(), m.id);
      assert.ok(!/[а-яё]/i.test(field.en), `${m.id}: кириллица в английском`);
    }
  }
  // «Как обычно» обязан не менять ничего — иначе это не «как обычно».
  const plain = DAILY_MODIFIERS.find((m) => m.id === "plain")!;
  assert.equal(plain.maxTurns, null);
  assert.equal(plain.trust, 0);
  assert.equal(plain.tension, 0);
});

test("каждое условие, кроме обычного, что-то делает", () => {
  for (const m of DAILY_MODIFIERS.filter((x) => x.id !== "plain")) {
    assert.ok(m.maxTurns !== null || m.trust !== 0 || m.tension !== 0,
      `${m.id} объявлен, но ничего не меняет`);
  }
});

test("офлайн-ядро действительно накладывает условие дня", async () => {
  // Проверяем не намерение, а результат: партия со «столом дня» обязана нести
  // его условие. Подпись «короткий стол» при двенадцати ходах — та самая ложь,
  // которой в продукте не бывает.
  const { MockServer } = await import("../src/mock/mockServer");
  const table = dailyTable(new Date(2026, 7, 30)); // short: восемь ходов
  assert.equal(table.modifier.id, "short", "контракт расписания изменился");

  const greet = async (msg: Record<string, unknown>) => {
    let state: { maxTurns?: number; max_turns?: number } | null = null;
    const srv = new MockServer((m: { type: string; state?: Record<string, number> }) => {
      if (m.type === "greeting") state = m.state as never;
    });
    srv.send({ type: "start", lang: "ru", mode: "practice", ...msg } as never);
    for (let i = 0; i < 60 && !state; i++) await new Promise((r) => setTimeout(r, 10));
    return state as { max_turns: number } | null;
  };

  const withDaily = await greet({ scenarioId: table.scenarioId, daily: table.day });
  assert.ok(withDaily, "приветствие не пришло");
  assert.equal(withDaily!.max_turns, 8, "условие дня не легло в офлайн-партию");

  const plain = await greet({ scenarioId: table.scenarioId });
  assert.equal(plain!.max_turns, 12, "условие легло без просьбы");

  const wrongTable = await greet({
    scenarioId: Object.keys(SCENARIO_MAP).find((id) => id !== table.scenarioId)!,
    daily: table.day,
  });
  assert.equal(wrongTable!.max_turns, 12, "условие выпросили на чужом столе");
});
