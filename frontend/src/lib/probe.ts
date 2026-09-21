// probe.ts — the "read her face" question.
//
// This layer is fully REAL, not mocked, and that is the whole reason it is the
// one we ship first: the engine already decides a `reaction` every turn, so the
// right answer is deterministic, reproducible and free. No AI decides it, no
// camera is needed, and it works offline — which is exactly what no
// webcam-based emotion reader can claim.
//
// Everything here is a pure function of (reaction, turn, memory), so a replayed
// session asks the same questions in the same order with the same options.

/** The engine's reaction vocabulary, ordered from coldest to warmest. Ordering
 *  is what makes the distractors hard: neighbours on this scale are the
 *  plausible confusions, and picking far-apart options would make the question
 *  trivial. Mirrors engine.py / mock/engine.ts. */
export const REACTION_SCALE = [
  "walked_out", "offended", "hardened", "pressured", "not_yet",
  "neutral", "collaborated", "persuaded", "opened_up", "warmed",
] as const;

export type Reaction = (typeof REACTION_SCALE)[number];

/**
 * `probe_vague` — реакция движка, которой НЕТ на шкале теплоты, и правильно,
 * что нет: это не состояние, а просьба сузить вопрос («а что именно вас
 * интересует?»). Раньше слой на таком ходу молчал: `buildProbe` возвращал
 * `null`, вопрос не задавался, и человек не получал ничего — ни вопроса, ни
 * объяснения. Снаружи это неотличимо от сломанного слоя, а внутри это самая
 * ценная реплика партии: ровно здесь движок говорит «общий вопрос интерес не
 * вскрывает» — главный тезис продукта.
 *
 * Поэтому реакция стала СПРАШИВАЕМОЙ, но не переехала в шкалу: соседи по
 * теплоте у неё не считаются, дистракторы названы поимённо. Ярлык и разбор для
 * неё уже лежали в `i18n.probe.reactions` / `i18n.probe.why` и не вызывались
 * ниоткуда.
 */
export const OFF_SCALE = {
  // Настоящая путаница у ученика ровно одна: «мой вопрос попал» против «мой
  // вопрос был слишком общим». Поэтому первый дистрактор — `opened_up`.
  probe_vague: ["opened_up", "not_yet", "neutral"],
} as const satisfies Record<string, readonly Reaction[]>;

/** Всё, о чём слой умеет спросить: шкала теплоты плюс реакции вне её. */
export type Askable = Reaction | keyof typeof OFF_SCALE;

export interface Probe {
  turn: number;
  /** Index into `options` of the true reaction. */
  answer: number;
  options: Askable[];
}

export function isReaction(r: string): r is Reaction {
  return (REACTION_SCALE as readonly string[]).includes(r);
}

export function isAskable(r: string): r is Askable {
  return isReaction(r) || r in OFF_SCALE;
}

/** Такт вопросов: не чаще одного на столько ходов. Первый — на третьем ходу
 *  (на первом читать ещё нечего), и никогда после закрытия стола: исход уже
 *  ответил на вопрос.
 *
 *  ЗДЕСЬ СТОЯЛА ВТОРАЯ ФУНКЦИЯ, `shouldProbe(turn, closed)`, и она перестала
 *  быть правдой в тот момент, когда решение стало зависеть от памяти слоя.
 *  Экспортированное правило, которое больше ничего не решает, — это ровно тот
 *  способ, которым документация расходится с кодом, поэтому его нет: правило
 *  целиком живёт в `nextProbe`. */
export const EVERY = 3;

/**
 * Что слой помнит между вопросами. Два числа, и оба нужны:
 * без `lastTurn` не выдержать такт, без `lastReaction` не заметить, что ответ
 * будет тот же самый.
 */
export interface ProbeMemory {
  /** Ход, на котором вопрос задали в последний раз. 0 — ещё ни разу. */
  lastTurn: number;
  /** Реакция, о которой спрашивали в прошлый раз. */
  lastReaction: string | null;
}

export const NO_PROBES: ProbeMemory = { lastTurn: 0, lastReaction: null };

/**
 * Офлайн-зеркало app/probe.py. Онлайн получает готовый вопрос от сервера;
 * общая фикстура проверяет ответ и порядок вариантов на обеих сторонах.
 *
 * ПОЧЕМУ ПОДРЯД НЕ СПРАШИВАЕМ ОБ ОДНОМ И ТОМ ЖЕ. Два вопроса подряд с одним
 * правильным ответом — это не вторая проверка, а подсказка: человек отвечает
 * «как в прошлый раз» и попадает, ничего не прочитав. Такт при этом сдвигается
 * РОВНО НА ОДИН ХОД: если и на следующем ходу реакция та же, вопрос всё равно
 * задаётся. Пропуск без предела превратил бы ровную партию в молчащий слой — а
 * молчащий слой неотличим от невставшего, и это ровно то состояние, которого в
 * продукте не бывает.
 */
export function nextProbe(reaction: string, turn: number, closed: boolean,
                          memory: ProbeMemory): Probe | null {
  if (closed || turn < EVERY) return null;
  const since = turn - memory.lastTurn;
  if (since < EVERY) return null;
  if (since === EVERY && reaction === memory.lastReaction) return null;
  return buildProbe(reaction, turn);
}

/** Три дистрактора и правильный ответ, перемешанные детерминированно. */
export function buildProbe(reaction: string, turn: number): Probe | null {
  if (!isAskable(reaction)) return null;
  const pool: Askable[] = [reaction, ...distractors(reaction)];
  const options = shuffled(pool, seedOf(reaction, turn));
  return { turn, answer: options.indexOf(reaction), options };
}

/** Соседи по шкале теплоты — плюс одно исключение, объяснённое ниже. */
function distractors(reaction: Askable): Askable[] {
  if (reaction in OFF_SCALE) return [...OFF_SCALE[reaction as keyof typeof OFF_SCALE]];
  const i = REACTION_SCALE.indexOf(reaction as Reaction);
  const near: Askable[] = [];
  for (let d = 1; near.length < 3 && d < REACTION_SCALE.length; d++) {
    for (const j of [i - d, i + d]) {
      if (j >= 0 && j < REACTION_SCALE.length && near.length < 3) near.push(REACTION_SCALE[j]);
    }
  }
  // «Приоткрылась» против «просит уточнить вопрос» — это и есть тезис продукта:
  // интерес вскрывает вопрос ПО ТЕМЕ, а общий получает переспрос. Самый дальний
  // сосед по теплоте («идёт навстречу») такой проверки не даёт, поэтому на этом
  // одном вопросе он уступает место переспросу.
  if (reaction === "opened_up") near[2] = "probe_vague";
  return near;
}

/**
 * ПОЧЕМУ НЕ ПРОСТО ПОВОРОТ ПО НОМЕРУ ХОДА. Раньше порядок вариантов был
 * `pool.slice(turn % 4)`, а правильный ответ всегда стоял в `pool[0]`. Значит
 * его СЛОТ был чистой функцией одного номера хода: ход 3 → второй вариант, ход
 * 6 → третий, ход 9 → четвёртый, ход 12 → первый. Одинаково в каждой партии, на
 * каждом столе, при любой реакции. Тренажёр, в котором правильный ответ
 * угадывается по номеру хода, тренирует счёт до четырёх.
 *
 * Теперь перестановка зависит и от самой реакции, то есть от того, что человек
 * как раз и должен прочитать. Функция осталась чистой — реплей совпадает.
 */
function seedOf(reaction: string, turn: number): number {
  const key = `${reaction}@${turn}`;
  let h = 0x811c9dc5;                                  // FNV-1a, 32 бита
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function shuffled<T>(pool: T[], seed: number): T[] {
  const out = [...pool];
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;    // LCG, Numerical Recipes
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
