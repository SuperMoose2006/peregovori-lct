// dailyGoal.test.ts — цель на сегодня: поднять можно сразу, опустить — только
// со следующего дня.
//
// ОТКУДА ПРАВИЛО. Цель переставлялась в любую сторону в любой момент: поставил
// три, сыграл одну, переставил на одну — и «цель выполнена». Обязательство,
// которое отменяется одним нажатием, обязательством не является. Решение
// владельца: понижение принимается, но вступает в силу со следующего местного
// календарного дня; сегодняшняя цель остаётся прежней.
//
// Здесь держится: понижение сегодня не применяется; повышение применяется
// сразу; отложенное понижение применяется на следующий день само, без захода в
// настройки; старый профиль без нового поля грузится, не теряя прогресса; и
// интерфейс говорит правило ДО нажатия.
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  applyDebrief, dailyGoalView, dayKey, emptyProfile, loadProfile, msUntilNextDay, nextDayKey,
  resolveDailyGoal, saveProfile, setDailyGoalTarget, type Profile,
} from "../src/lib/progress";
import { ProgressCards } from "../src/components/Rail";
import { I18N } from "../src/i18n";
import type { Debrief } from "../src/types";

const MON = "2026-09-28";
const TUE = "2026-09-29";
const WED = "2026-09-30";

const deb = (o: Partial<Debrief> = {}): Debrief => ({
  overall: 60, grade: "C", economic: 60, relationship: 60, technique: 60,
  deal_text: "", status: "agreement",
  interests_found: 0, interests_total: 3, spin_stages: 0, objective_criteria: 0,
  empathy: 0, threats: 0, tradeoffs: 0, avg_arg: 50, tips: [],
  ...o,
} as Debrief);

const withGoal = (target: number): Profile => ({ ...emptyProfile(), dailyGoalTarget: target });

// ---- Правило -----------------------------------------------------------------

test("понижение в текущем дне не применяется: сегодня цель прежняя, новая — с завтра", () => {
  const p = setDailyGoalTarget(withGoal(3), 1, MON);
  const today = dailyGoalView(p, MON);
  assert.equal(today.target, 3, "сегодняшняя цель не опустилась");
  assert.equal(today.later, 1, "выбор принят и отложен");
  assert.deepEqual(p.dailyGoalPending, { target: 1, from: TUE });
});

test("повышение применяется сразу", () => {
  const p = setDailyGoalTarget(withGoal(1), 3, MON);
  const v = dailyGoalView(p, MON);
  assert.equal(v.target, 3);
  assert.equal(v.later, null);
  assert.equal(p.dailyGoalPending, null);
});

test("отложенное понижение применяется на следующий день само — без нового выбора", () => {
  const p = setDailyGoalTarget(withGoal(3), 1, MON);
  // Никаких вызовов между днями: только чтение со вторничным днём.
  const tue = dailyGoalView(p, TUE);
  assert.equal(tue.target, 1);
  assert.equal(tue.later, null, "вступившее в силу больше не «отложено»");
  assert.equal(dailyGoalView(p, WED).target, 1, "и остаётся дальше");
});

test("зачёт партии на следующий день идёт по новой цели и убирает отложенное", () => {
  const p = setDailyGoalTarget(withGoal(3), 1, MON);
  const g = applyDebrief(p, "supplier", deb(), new Date(2026, 8, 29, 10)); // вторник, местное время
  assert.equal(g.dailyTarget, 1);
  assert.equal(g.dailyGoalMet, true, "одна партия при цели 1 — цель выполнена");
  assert.equal(g.profile.dailyGoalTarget, 1);
  assert.equal(g.profile.dailyGoalPending, null);
});

test("лазейка закрыта: поставил три, сыграл одну, опустил до одной — цель не выполнена", () => {
  let p = withGoal(3);
  p = applyDebrief(p, "supplier", deb(), new Date(2026, 8, 28, 10)).profile; // понедельник
  p = setDailyGoalTarget(p, 1, MON);
  const v = dailyGoalView(p, MON);
  assert.equal(v.met, false, `${v.done} из ${v.target} — это не выполненная цель`);
  const second = applyDebrief(p, "rent", deb(), new Date(2026, 8, 28, 12));
  assert.equal(second.dailyTarget, 3);
  assert.equal(second.dailyGoalMet, false, "две из трёх");
});

test("последний выбор отменяет предыдущий: вернуть сегодняшнюю цель — отменить понижение", () => {
  const pending = setDailyGoalTarget(withGoal(3), 1, MON);
  const back = setDailyGoalTarget(pending, 3, MON);
  assert.equal(back.dailyGoalPending, null);
  assert.equal(dailyGoalView(back, TUE).target, 3, "завтра остаётся три");
  const two = setDailyGoalTarget(pending, 2, MON);
  assert.deepEqual(two.dailyGoalPending, { target: 2, from: TUE }, "другое понижение заменяет первое");
  assert.equal(dailyGoalView(two, MON).target, 3);
});

test("повышение поверх отложенного понижения применяется сразу и снимает его", () => {
  const p = setDailyGoalTarget(setDailyGoalTarget(withGoal(2), 1, MON), 3, MON);
  assert.equal(dailyGoalView(p, MON).target, 3);
  assert.equal(p.dailyGoalPending, null);
});

test("вчерашнее отложенное считается уже действующим: понижать дальше можно только с завтра", () => {
  // В понедельник 3 → 2 на вторник. Во вторник действует 2; выбор 1 — снова на завтра.
  const mon = setDailyGoalTarget(withGoal(3), 2, MON);
  const tue = setDailyGoalTarget(mon, 1, TUE);
  assert.equal(dailyGoalView(tue, TUE).target, 2);
  assert.deepEqual(tue.dailyGoalPending, { target: 1, from: WED });
});

// ---- Граница дня -------------------------------------------------------------

test("граница дня — местный календарный день, как у серии; месяц и год переходятся", () => {
  assert.equal(nextDayKey("2026-09-30"), "2026-10-01");
  assert.equal(nextDayKey("2026-12-31"), "2027-01-01");
  assert.equal(nextDayKey("2028-02-28"), "2028-02-29");
  // 23:59 и 00:01 местного времени — разные дни, и ключ берётся тем же dayKey,
  // что и у серии.
  assert.equal(dayKey(new Date(2026, 8, 28, 23, 59)), MON);
  assert.equal(dayKey(new Date(2026, 8, 29, 0, 1)), TUE);
});

test("до полуночи — считанные секунды, сразу после неё — почти сутки", () => {
  const late = msUntilNextDay(new Date(2026, 8, 28, 23, 59, 30));
  assert.ok(late > 29_000 && late <= 32_000, `${late} мс`);
  const early = msUntilNextDay(new Date(2026, 8, 29, 0, 0, 0));
  assert.ok(early > 23 * 3600_000, `${early} мс`);
});

// ---- Старые профили ------------------------------------------------------------

function withStorage<T>(raw: string | null, run: () => T): T {
  const store = new Map<string, string>();
  if (raw !== null) store.set("dialog.progress.v1", raw);
  const g = globalThis as { localStorage?: unknown };
  const prev = g.localStorage;
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  try { return run(); } finally { g.localStorage = prev; }
}

test("старый профиль без нового поля грузится целиком: ничего не отложено, прогресс на месте", () => {
  const old = JSON.stringify({
    version: 5, xp: 420, streak: 4, lastStreakDay: MON, dailyGoalTarget: 2,
    dailyDoneDay: MON, dailyDoneCount: 1,
    scenarios: { supplier: { bestGrade: "B", bestScore: 78, attempts: 3, lastPlayed: "2026-09-28T10:00:00Z" } },
  });
  const p = withStorage(old, () => loadProfile());
  assert.equal(p.dailyGoalPending, null);
  assert.equal(p.dailyGoalTarget, 2);
  assert.equal(p.xp, 420, "опыт не потерян");
  assert.equal(p.streak, 4, "серия не потеряна");
  assert.equal(p.scenarios.supplier?.bestGrade, "B", "рекорды не потеряны");
  assert.equal(dailyGoalView(p, MON).target, 2);
});

test("испорченное отложенное понижение не роняет профиль — его просто нет", () => {
  for (const bad of [42, "завтра", { target: "1", from: TUE }, { target: 1, from: "вторник" }, null]) {
    const p = withStorage(JSON.stringify({ xp: 100, dailyGoalTarget: 3, dailyGoalPending: bad }), () => loadProfile());
    assert.equal(p.dailyGoalPending, null, JSON.stringify(bad));
    assert.equal(p.xp, 100);
    assert.equal(p.dailyGoalTarget, 3);
  }
});

test("отложенное понижение переживает перезагрузку", () => {
  const p = setDailyGoalTarget(withGoal(3), 1, MON);
  const back = withStorage(null, () => { saveProfile(p); return loadProfile(); });
  assert.deepEqual(back.dailyGoalPending, { target: 1, from: TUE });
  assert.equal(resolveDailyGoal(back, MON).target, 3);
  assert.equal(resolveDailyGoal(back, TUE).target, 1);
});

// ---- Интерфейс: правило видно до нажатия ---------------------------------------

const ru = I18N.ru;
const cards = (profile: Profile, today: string) => renderToStaticMarkup(createElement(ProgressCards, {
  t: ru, lang: "ru" as const, profile, onSetGoal: () => {}, today,
}));

/** Тег кнопки цели с числом `n` целиком. */
function goalButton(html: string, n: number): string {
  const steps = html.slice(html.indexOf('class="rc-steps"'));
  const m = steps.match(new RegExp(`<button[^>]*>${n}</button>`));
  assert.ok(m, `нет кнопки ${n}`);
  return m![0];
}

test("правило выбора стоит рядом с кнопками ещё до первого нажатия", () => {
  const html = cards(withGoal(2), MON);
  assert.ok(html.includes(ru.goal.rule), "запрет на понижение обнаруживался бы только методом тыка");
  assert.match(ru.goal.rule, /со следующего дня/);
});

test("кнопка меньше сегодняшней цели говорит «с завтрашнего дня», не меньше — «с сегодняшнего»", () => {
  const html = cards(withGoal(2), MON);
  assert.ok(goalButton(html, 1).includes(ru.goal.setLater.replace("{n}", "1")));
  assert.ok(goalButton(html, 2).includes(ru.goal.setNow.replace("{n}", "2")));
  assert.ok(goalButton(html, 3).includes(ru.goal.setNow.replace("{n}", "3")));
});

test("назначенное понижение видно: «сегодня 3, с завтрашнего дня 1», а в полночь — просто 1", () => {
  const p = setDailyGoalTarget(withGoal(3), 1, MON);
  const mon = cards(p, MON);
  assert.ok(mon.includes("Сегодня цель — 3, с завтрашнего дня — 1"), mon);
  assert.match(goalButton(mon, 3), /aria-pressed="true"/);
  assert.match(goalButton(mon, 1), /class="[^"]*\bnext\b/);
  const tue = cards(p, TUE);
  assert.equal(tue.includes("с завтрашнего дня — 1"), false, "во вторник откладывать уже нечего");
  assert.match(goalButton(tue, 1), /aria-pressed="true"/);
});
