// rematch.ts — «переиграй партию против себя вчерашнего»: чистая арифметика
// сравнения двух попыток за ОДНИМ столом.
//
// ПОЧЕМУ ЭТО ВООБЩЕ ВОЗМОЖНО. Движок — чистая функция от (сценарий, стартовые
// условия, порядок ходов). Одинаковый вход даёт байт-в-байт одинаковое
// состояние, поэтому прошлую партию не нужно хранить кадрами: достаточно её
// ВХОДА (lib/progress.ts, PastRun), а траекторию по ходам пересчитает движок.
//
// ПОЧЕМУ ОФЛАЙН-ЯДРО, А НЕ ЗАПРОС К СЕРВЕРУ. Партия идёт прямо сейчас, и
// сравнение обязано быть на экране на каждом ходу, в том числе без сети
// (инвариант 5). Через `/api/whatif` та же траектория стоила бы одного запроса
// НА ХОД — двенадцать round-trip'ов посреди переговоров. Офлайн-ядро считает
// то же самое (инвариант 8, test/parity.test.ts) и считает мгновенно.
//
// ИИ здесь нет и быть не может: расхождение — это разница двух чисел движка.
// В `score_session` оно не входит ничем: сравнение — послесловие, а не вторая
// оценка (инварианты 3 и 6).
//
// САМ ПЕРЕСЧЁТ — В `rematchReplay.ts`. Он единственный здесь звал движок, а
// звать движок значит тащить офлайн-ядро туда, откуда на него сослались:
// App.tsx берёт отсюда `openingOf` (три поля структуры) на КАЖДОМ экране, и
// вместе с ними на домашний ехали восемьдесят килобайт движка. Арифметика
// сравнения осталась тут, пересчёт приезжает динамически вместе с партией.
import type { StateView } from "../types";
import type { RunOpening } from "./progress";

/** Bump whenever balance or scenario defaults change replayed trajectories. */
export const REPLAY_BALANCE_VERSION = "concessions-three-modes-v1";

/** Один ход прошлой партии: что было сказано и куда после этого встал стол. */
export interface TrailPoint {
  turn: number; // 1-based, как номер хода на экране
  text: string;
  state: StateView;
}

/** Цена на столе: закрытая сделка, пока её нет — их текущее предложение. */
export function priceOf(state: StateView): number {
  return state.deal ?? state.offer_opp;
}

/** Совпадают ли стартовые условия. Разошлись — столы РАЗНЫЕ (короткий стол
 *  дня против обычного, акт с репутацией против практики), и сравнение обязано
 *  сказать это словами, а не молча показать расхождение как заслугу игрока. */
export function sameOpening(a: RunOpening, b: RunOpening): boolean {
  return a.trust === b.trust && a.tension === b.tension && a.maxTurns === b.maxTurns
    && a.balanceVersion === b.balanceVersion;
}

/** Снять стартовые условия с самого первого состояния партии (turn 0). */
export function openingOf(state: StateView): RunOpening {
  return { trust: state.trust, tension: state.tension, maxTurns: state.max_turns,
    balanceVersion: REPLAY_BALANCE_VERSION };
}

export type MeterId = "trust" | "tension" | "info" | "leverage";
/** Порядок как в HUD стола. Напряжение — единственная шкала, где меньше лучше. */
export const METER_IDS: MeterId[] = ["trust", "tension", "info", "leverage"];

export interface Gap {
  then: number;
  now: number;
  delta: number; // now − then
  /** Ближе ли «сейчас» к цели игрока. null — ничья. */
  better: boolean | null;
}

function gap(then: number, now: number, higherBetter: boolean): Gap {
  const delta = now - then;
  return { then, now, delta, better: delta === 0 ? null : higherBetter ? delta > 0 : delta < 0 };
}

/** Расхождение по четырём шкалам на одном ходу. */
export function meterGaps(then: StateView, now: StateView): Record<MeterId, Gap> {
  return {
    trust: gap(then.trust, now.trust, true),
    tension: gap(then.tension, now.tension, false), // меньше — лучше
    info: gap(then.info, now.info, true),
    leverage: gap(then.leverage, now.leverage, true),
  };
}

/** Расхождение по цене. `lowerBetter` — сторона игрока: покупатель хочет ниже. */
export function priceGap(then: StateView, now: StateView, lowerBetter: boolean): Gap {
  return gap(priceOf(then), priceOf(now), !lowerBetter);
}

/** Цена по ходам — ряд для спарклайна. */
export function priceSeries(trail: TrailPoint[]): number[] {
  return trail.map((p) => priceOf(p.state));
}

export function meterSeries(trail: TrailPoint[], id: MeterId): number[] {
  return trail.map((p) => p.state[id]);
}

/**
 * Точки полилинии в координатах 0..100 × 0..100 для двух рядов, нормированных
 * по ОБЩЕЙ шкале: две линии в разных масштабах сравнивать нельзя.
 *
 * Вынесено сюда, а не в разметку, ровно затем, чтобы «сейчас выше» на картинке
 * означало «сейчас больше» в числах — и это проверялось тестом.
 */
export function sparkPoints(a: number[], b: number[]): { a: string; b: string } {
  const all = [...a, ...b];
  const lo = all.length ? Math.min(...all) : 0;
  const hi = all.length ? Math.max(...all) : 0;
  const span = hi - lo || 1;
  // Обе линии живут в одной системе координат по X: общий горизонт — самая
  // длинная из партий, иначе более короткая растянулась бы на всю ширину и
  // «сейчас» выглядело бы длиннее, чем было.
  const steps = Math.max(a.length, b.length, 2) - 1;
  const line = (xs: number[]) =>
    xs
      .map((v, i) => `${((i / steps) * 100).toFixed(2)},${(100 - ((v - lo) / span) * 100).toFixed(2)}`)
      .join(" ");
  return { a: line(a), b: line(b) };
}
