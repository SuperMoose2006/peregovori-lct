// daily.ts — «Стол дня» в браузере. ЗЕРКАЛО app/engine/daily.py.
//
// Инвариант 8: офлайн-ядро обязано выдать тот же стол, что сервер. Поэтому
// выбор считается арифметикой от «дней с 1970-01-01» — единственной величины,
// которую браузер и Python дают одинаково без библиотек и без договорённостей
// о кодировке. С sha256 паритет стоил бы реализации хеша ради одного числа.
//
// Модификатор — НАЧАЛЬНОЕ УСЛОВИЕ, а не правило подсчёта: он трогает длину
// партии и стартовые шкалы, ровно как репутация кампании, и в score_session не
// входит. Иначе стол дня перестал бы быть сравним с обычным.
import type { Lang } from "../types";
import { SCENARIOS } from "../data/scenarios";

export interface DailyModifier {
  id: string;
  label: Record<Lang, string>;
  note: Record<Lang, string>;
  maxTurns: number | null;
  trust: number;
  tension: number;
}

/** Порядок фиксирован: он входит в выбор по дате. Перестановка сдвинула бы
 *  расписание у всех, кто уже видел завтрашний стол. Зеркало MODIFIERS. */
export const DAILY_MODIFIERS: DailyModifier[] = [
  {
    id: "plain",
    label: { ru: "Как обычно", en: "As usual" },
    note: { ru: "Обычный стол, двенадцать ходов.", en: "An ordinary table, twelve turns." },
    maxTurns: null, trust: 0, tension: 0,
  },
  {
    id: "short",
    label: { ru: "Короткий стол", en: "Short table" },
    note: { ru: "Восемь ходов вместо двенадцати. Разминаться некогда.",
            en: "Eight turns instead of twelve. No time to warm up." },
    maxTurns: 8, trust: 0, tension: 0,
  },
  {
    id: "cold",
    label: { ru: "Холодный старт", en: "Cold open" },
    note: { ru: "Вас здесь не ждали: доверие ниже обычного. Интерес не вскроется, пока не потеплеет.",
            en: "You were not expected: trust starts lower. No interest opens up until it warms." },
    maxTurns: null, trust: -15, tension: 0,
  },
  {
    id: "tense",
    label: { ru: "Напряжённый стол", en: "Tense table" },
    note: { ru: "Разговор начинается уже на нервах. Давить дороже обычного.",
            en: "The conversation starts on edge. Pushing costs more than usual." },
    maxTurns: null, trust: 0, tension: 15,
  },
];

/** Дней с 1970-01-01 в UTC. То же число, что `(d - date(1970,1,1)).days`. */
export function dayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

export interface DailyTable {
  day: string;              // ISO-дата, по которой всё посчитано
  scenarioId: string;
  modifier: DailyModifier;
}

export function dailyTable(d: Date = new Date()): DailyTable {
  const n = dayNumber(d);
  const scenario = SCENARIOS[((n % SCENARIOS.length) + SCENARIOS.length) % SCENARIOS.length];
  // Условие считается ещё и от НОМЕРА КРУГА по столам: четыре условия делят
  // восемь столов нацело, поэтому без круга пара «стол + условие» повторялась
  // бы через восемь дней и понедельник всегда был бы одним и тем же.
  const round = Math.floor(n / SCENARIOS.length);
  const mi = (((n + round) % DAILY_MODIFIERS.length) + DAILY_MODIFIERS.length) % DAILY_MODIFIERS.length;
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { day: iso, scenarioId: scenario.id, modifier: DAILY_MODIFIERS[mi] };
}
