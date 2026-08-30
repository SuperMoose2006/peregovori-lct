// rematchReplay.ts — пересчёт сохранённой партии движком-зеркалом.
//
// Отделено от `rematch.ts` по одной причине: это единственное место сравнения,
// которому нужен движок. Пока оно жило рядом с арифметикой расхождений,
// офлайн-ядро приезжало на домашний экран за компанию с `openingOf` —
// функцией из трёх присваиваний.
//
// Инвариант 8 в силе: считает то же офлайн-ядро, что и партия без сети
// (test/parity.test.ts), просто приезжает оно тогда, когда партия началась.
import { SCENARIO_MAP } from "../data/scenarios";
// Зеркальные столы лежат отдельно (см. data/mirrors.ts). Переигрывать их
// надо ровно так же: движок у них тот же, а «а что если» — его чистая
// функция от (стол, порядок ходов).
import { MIRROR_MAP } from "../data/mirrors";
import { analyze, applyMove, newSession, stateView } from "../mock/engine";
import type { PastRun } from "./progress";
import type { TrailPoint } from "./rematch";

/**
 * Переиграть сохранённую партию ход за ходом.
 *
 * Порядок внутри хода (инкремент → analyze → applyMove) повторяет цикл
 * MockServer'а буква в букву — иначе «прошлая попытка» разошлась бы с той
 * партией, которую человек действительно сыграл.
 *
 * null — переиграть нечем: стол не из каталога (своя сделка) или ходов нет.
 * Это честное «недоступно», а не пустая панель (принцип 2).
 */
export function replayRun(run: PastRun): TrailPoint[] | null {
  const def = SCENARIO_MAP[run.scenarioId] ?? MIRROR_MAP[run.scenarioId];
  if (!def || run.moves.length === 0) return null;
  const s = newSession(def, run.lang);
  // Стартовые условия партии восстанавливаются ЗАМЕРОМ, а не пересчётом их
  // причины: «стол дня» и репутация акта живут в одном месте (сервер и
  // MockServer), и повторять их правила здесь значило бы завести второй
  // источник правды ровно того сорта, который продукт запрещает.
  s.trust = run.opening.trust;
  s.tension = run.opening.tension;
  s.maxTurns = run.opening.maxTurns;
  const trail: TrailPoint[] = [];
  for (const text of run.moves) {
    if (s.status !== "active") break;
    s.turn += 1;
    applyMove(s, analyze(text), text);
    // Кончились ходы — стол закрывается срывом. Ровно как в MockServer: без
    // этой ветки последняя точка траектории показывала бы «ещё играем» там,
    // где партия уже была проиграна по времени.
    if (s.status === "active" && s.turn >= s.maxTurns) s.status = "breakdown";
    trail.push({ turn: s.turn, text, state: stateView(s) });
  }
  return trail;
}
