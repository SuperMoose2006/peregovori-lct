// readingStore.ts — прогресс режима «Чтение стола», ОТДЕЛЬНО от профиля игры.
//
// ПОЧЕМУ ОТДЕЛЬНО, А НЕ ПОЛЕМ В `progress.ts`. Чтение стола — не партия: человек
// смотрит ЧУЖУЮ игру и отвечает на вопрос о ней. В `score_session` не входит ни
// один его ответ, и опыт за него не начисляется — иначе грейд и ранг начали бы
// зависеть от упражнения, которого за столом не было (принцип 3 и инвариант 6:
// сертификат экзамена обязан значить одно и то же у всех).
//
// Поэтому у режима своё хранилище со своим ключом. Разъехаться они не могут по
// построению: этот файл НЕ ИМПОРТИРУЕТ `progress.ts` и не знает про его ключ, а
// `test/reading.test.ts` проверяет, что запись чтения не трогает профиль.
//
// Чтение защищено try/catch ровно как профиль: приватный режим браузера бросает
// исключение прямо из `localStorage`, а «ещё ничего не прочитано» всегда
// остаётся верным ответом.
import type { Lang } from "../types";

const KEY = "dialog.reading.v1";

/** Итог одной прочитанной партии. Три числа, и все три нужны: без `asked` не
 *  сказать «сколько из скольких», а без деления на «точно» и «направление»
 *  пропадает единственная градация, которую режим и ставит. */
export interface ReadingRecord {
  /** Сколько вопросов задала эта партия. */
  asked: number;
  /** Реакция названа в точности. */
  exact: number;
  /** Не та реакция, но та же сторона шкалы теплоты: сблизило / впустую / оттолкнуло. */
  near: number;
}

export interface ReadingLog {
  games: Record<string, ReadingRecord>;
}

/**
 * Идентификаторы партий в каталоге каждого языка, в порядке каталога.
 *
 * ЗДЕСЬ СПИСКОМ, А НЕ ИМПОРТОМ КАТАЛОГА. Карточка на домашнем экране показывает
 * «прочитано N из M» — и ради этого числа тянула бы на первую отрисовку 18 КБ
 * чужих стенограмм (`data/readingGames.ts`). Ровно от такого и стережёт
 * `test/lazy.test.ts`.
 *
 * Хранить ЧИСЛО вместо списка было бы дешевле и неверно: каталоги языков — это
 * два разных СПИСКА, а не одно число, и прочитанное в одном нельзя засчитывать
 * в другом. Пока лестница качества была одноязычной, списки ещё и различались
 * длиной (12 против 9); теперь длина совпала, но совпадение — не правило, и
 * держать его правилом было бы ошибкой.
 *
 * Второй источник правды опасен молчанием, поэтому он не молчит:
 * `test/reading.test.ts` сверяет этот список с настоящим каталогом на обоих
 * языках и валит сборку при расхождении.
 */
export const READING_IDS: Record<Lang, string[]> = {
  ru: ["haggling", "basic", "good", "supplier", "salary", "conflict", "investor", "rent",
       "used_car", "freelance_rate", "sla_renewal", "candidate_offer"],
  en: ["haggling", "basic", "good", "supplier", "salary", "conflict", "investor", "rent",
       "used_car", "freelance_rate", "sla_renewal", "candidate_offer"],
};

export const EMPTY_READING: ReadingLog = { games: {} };

function sanitizeRecord(v: unknown): ReadingRecord | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const num = (x: unknown) =>
    typeof x === "number" && isFinite(x) && x >= 0 ? Math.floor(x) : 0;
  const asked = num(r.asked);
  if (asked <= 0) return null;
  // Ответов не бывает больше, чем вопросов: испорченный блоб не должен
  // рисовать «прочитано 9 из 6».
  const exact = Math.min(asked, num(r.exact));
  const near = Math.min(asked - exact, num(r.near));
  return { asked, exact, near };
}

export function loadReading(): ReadingLog {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (!raw) return EMPTY_READING;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const games: Record<string, ReadingRecord> = {};
    const src = parsed.games;
    if (src && typeof src === "object") {
      for (const [id, val] of Object.entries(src as Record<string, unknown>)) {
        const rec = sanitizeRecord(val);
        if (rec) games[id] = rec;
      }
    }
    return { games };
  } catch {
    return EMPTY_READING;
  }
}

export function saveReading(log: ReadingLog): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(KEY, JSON.stringify({ v: 1, games: log.games }));
    }
  } catch {
    // Квота или приватный режим. Прогресс упражнения — не то, ради чего стоит
    // показывать человеку ошибку посреди разбора.
  }
}

/** Точность чтения одной партии: 1 за точный ответ, 0.5 за верное направление. */
export function readingScore(rec: ReadingRecord): number {
  return rec.asked ? (rec.exact + rec.near * 0.5) / rec.asked : 0;
}

/**
 * Записать результат — ЧИСТО, без хранилища: так правило «остаётся лучшее»
 * проверяется тестом, а не наблюдением за браузером.
 *
 * Лучшим считается более точное чтение, а при равной точности — более длинное:
 * шесть вопросов из шести весомее двух из двух.
 */
export function recordReading(log: ReadingLog, id: string, rec: ReadingRecord): ReadingLog {
  const prev = log.games[id];
  const better = !prev
    || readingScore(rec) > readingScore(prev)
    || (readingScore(rec) === readingScore(prev) && rec.asked > prev.asked);
  if (!better) return log;
  return { games: { ...log.games, [id]: rec } };
}

/** Сколько партий этого каталога уже прочитано. */
export function readingDone(log: ReadingLog, ids: string[]): number {
  return ids.filter((id) => log.games[id]).length;
}

/**
 * С какой партии открывать режим.
 *
 * Сперва первая непрочитанная — порядок каталога педагогический, и перескок
 * через него ломает замысел. Всё прочитано — открываем ХУДШУЮ прочитанную, а не
 * первую: возвращаться стоит туда, где читалось хуже всего.
 */
export function nextReadingGame(log: ReadingLog, ids: string[]): string | null {
  if (!ids.length) return null;
  const unread = ids.find((id) => !log.games[id]);
  if (unread) return unread;
  let worst = ids[0];
  for (const id of ids) {
    if (readingScore(log.games[id]) < readingScore(log.games[worst])) worst = id;
  }
  return worst;
}
