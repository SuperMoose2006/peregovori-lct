// courseCheck.ts — вердикт по ответу на упражнение курса.
//
// ПОЧЕМУ ОТДЕЛЬНЫМ МОДУЛЕМ. Зачёт свободного ответа обязан гонять НАСТОЯЩИЙ
// движок в браузере: правильный ответ в упражнении обязан быть правильным в
// игре (инвариант 9). Движок весит столько же, сколько весит игра, — и пока эти
// функции жили в `course.ts`, он ехал на домашний экран за компанию со
// счётчиком сданных блоков. Здесь он ехать перестал: модуль подтягивается
// динамически вместе с экраном курса, а домашней странице нужны только данные.
//
// ЧТО ЭТО НЕ ЗНАЧИТ. Проверка не уехала на сервер и не стала слабее: тот же
// движок-зеркало, те же предикаты, тот же офлайн. Правильность каждого пункта
// доказана на стороне Python против настоящего analyze()/apply_move()
// (tests/test_course_bank.py), здесь — исполнение тех же условий.
//
// Зеркало: services/gateway/app/course/check.py. Менять синхронно.
import { SCENARIO_MAP } from "../data/scenarios";
import { analyze, applyMove, newSession } from "../mock/engine";
import { norm } from "./techniques";
import type { Exercise } from "./courseTypes";
import type { Lang, StateView } from "../types";
import {
  checkChoice, checkDrill, checkMatch, checkNumeric, checkOrder, checkPick, type Verdict,
} from "./course";

/** Свободный ответ. Ловит ФОРМУ хода — и говорит об этом честно в разборе. */
export function checkFreeform(ex: Exercise, text: string, lang: Lang): Verdict {
  const spec = ex.check ?? {};
  const a = analyze(text);
  const moves = a.moves;
  const reasons: string[] = [];

  for (const m of spec.require_moves ?? []) if (!moves.includes(m)) reasons.push(`missing:${m}`);
  const any = spec.require_any ?? [];
  if (any.length && !any.some((m) => moves.includes(m))) reasons.push(`missing_any:${any.join("|")}`);
  for (const m of spec.forbid_moves ?? []) if (moves.includes(m)) reasons.push(`forbidden:${m}`);
  // Слова считаем по той же нормализации, что и движок: иначе «300 000» и
  // «300000» дали бы разное число слов, а с ним и разный вердикт.
  const words = norm(text).split(" ").filter(Boolean).length;
  if (words < (spec.min_words ?? 0)) reasons.push("too_short");
  if (a.arg < (spec.min_arg ?? 0)) reasons.push("weak_argument");
  if (spec.require_number && a.number === null) reasons.push("no_number");

  if (spec.require_secondary && ex.scenario_id) {
    const def = SCENARIO_MAP[ex.scenario_id];
    const issue = def?.secondaryIssues?.find((s) => s.id === spec.require_secondary);
    const t = text.toLowerCase();
    const hit = issue?.keywords[lang]?.some((k) => t.includes(k.toLowerCase()));
    if (!hit) reasons.push(`missing_term:${spec.require_secondary}`);
  }

  return { ok: reasons.length === 0, reasons, moves, argQuality: a.arg };
}

export function check(ex: Exercise, answer: unknown, lang: Lang): Verdict {
  switch (ex.type) {
    case "choice":
    case "spot_error": return checkChoice(ex, answer as number);
    case "order": return checkOrder(ex, answer as string[]);
    case "match": return checkMatch(ex, answer as Record<string, string>);
    case "numeric": return checkNumeric(ex, answer as number | null);
    case "freeform": return checkFreeform(ex, String(answer ?? ""), lang);
    case "reaction":
    case "meters":
    case "face": return checkPick(ex, String(answer ?? ""));
    case "drill": return checkDrill(ex, answer as StateView);
  }
}


/** Прогнать реплику через движок-зеркало: то же, что делает `simulate.py`. */
export function simulate(scenarioId: string, lang: Lang, line: string,
                         state?: Exercise["state"]): { reaction: string; deltas: Record<string, number> } | null {
  const def = SCENARIO_MAP[scenarioId];
  if (!def) return null;
  const sess = newSession(def, lang);
  if (state) {
    sess.trust = state.trust; sess.tension = state.tension;
    sess.info = state.info; sess.leverage = state.leverage;
    sess.turn = state.turn;
  }
  const res = applyMove(sess, analyze(line), line);
  return { reaction: res.reaction, deltas: res.deltas as unknown as Record<string, number> };
}
