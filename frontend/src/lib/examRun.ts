// examRun.ts — экзамен блока переживает капстоун.
//
// ДЕФЕКТ, РАДИ КОТОРОГО ЭТО НАПИСАНО. `drawExam` ставит капстоун последним
// заданием, и капстоун есть у КАЖДОГО из десяти блоков. Капстоун — настоящая
// партия: экран курса при её запуске размонтируется целиком, а возврат из
// разбора вёл на карту блоков. Значит экран итога экзамена — счёт, разбор
// промахов, урок восстановления — не показывался НИ РАЗУ ни одному человеку.
// Провалившему экзамен об этом сообщала реплика оппонента в партии.
//
// Внутри одной сессии React ничем не помочь: между «жму капстоун» и «вернулся»
// лежит другой экран и, возможно, перезагрузка страницы (партия идёт минуты).
// Поэтому попытка экзамена кладётся в localStorage — туда же, где живут профиль
// и прогресс, и по той же причине: продукт обязан переживать F5 (инвариант 5).
//
// ЧТО СЮДА НЕ ЗАПИСЫВАЕТСЯ. Ни одного очка не считается здесь. Снимок хранит
// то, что УЖЕ посчитал движок-зеркало (`lib/courseCheck`) на заданиях до
// капстоуна, плюс итог предиката капстоуна (`checkDrill`) — тоже движок. Слоёв
// в снимке нет и быть не может: экзамен идёт с выключенными слоями
// (`sessionLayers(..., fixedOff)`), и ни один их сигнал в счёт не входит
// (принцип 3).
import type { ExamDraw } from "./course";

/** Ключ версионирован так же, как профиль: чужой блоб не должен ломать экран. */
const KEY = "dialog.examRun.v1";

export interface ExamRunSnapshot {
  blockId: string;
  /** Номер попытки на момент старта: от него детерминирована выборка экзамена. */
  attempt: number;
  /** Очки, набранные ДО капстоуна. */
  score: number;
  total: number;
  passMark: number;
  results: { id: string; ok: boolean }[];
  capstoneId: string;
  /** `null` — партия ещё не доиграна. Прерванная попытка не тратит счётчик. */
  capstoneOk: boolean | null;
}

// Тесты и SSR идут без localStorage, а приватный режим бросает исключение прямо
// из него. Зеркало в памяти — тот же приём, что в lib/sound.ts: экран обязан
// работать и там, где хранилища нет.
let memory: string | null = null;

function read(): string | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage.getItem(KEY);
  } catch {
    /* приватный режим — идём в память */
  }
  return memory;
}

function write(value: string | null): void {
  memory = value;
  try {
    if (typeof localStorage === "undefined") return;
    if (value === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, value);
  } catch {
    /* приватный режим — снимок живёт только в памяти этой вкладки */
  }
}

/** Чужой (или испорченный) блоб не должен рисовать экран итога из мусора. */
function sanitize(v: unknown): ExamRunSnapshot | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const blockId = typeof o.blockId === "string" ? o.blockId : null;
  const capstoneId = typeof o.capstoneId === "string" ? o.capstoneId : null;
  const attempt = num(o.attempt);
  const score = num(o.score);
  const total = num(o.total);
  const passMark = num(o.passMark);
  if (!blockId || !capstoneId || attempt === null || score === null
      || total === null || passMark === null) return null;
  const results: { id: string; ok: boolean }[] = [];
  if (Array.isArray(o.results)) {
    for (const r of o.results) {
      if (r && typeof r === "object") {
        const id = (r as Record<string, unknown>).id;
        const ok = (r as Record<string, unknown>).ok;
        if (typeof id === "string" && typeof ok === "boolean") results.push({ id, ok });
      }
    }
  }
  return {
    blockId, attempt, score, total, passMark, results, capstoneId,
    capstoneOk: typeof o.capstoneOk === "boolean" ? o.capstoneOk : null,
  };
}

export function loadExamRun(): ExamRunSnapshot | null {
  const raw = read();
  if (!raw) return null;
  try {
    return sanitize(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveExamRun(run: ExamRunSnapshot): void {
  write(JSON.stringify(run));
}

export function clearExamRun(): void {
  write(null);
}

/** Снимок попытки в момент ухода в капстоун. Чистая функция — её же зовёт тест. */
export function examRunFor(blockId: string, draw: ExamDraw, attempt: number,
                           score: number, results: { id: string; ok: boolean }[],
                           capstoneId: string): ExamRunSnapshot {
  return {
    blockId, attempt, score, total: draw.total, passMark: draw.passMark,
    results: [...results], capstoneId, capstoneOk: null,
  };
}

/**
 * Итог капстоуна возвращается в экзамен.
 *
 * Зовётся из `App.tsx` ровно там, где предикат капстоуна уже посчитан по
 * состоянию движка, — и ТОЛЬКО для капстоуна, запущенного экзаменом. Молчит,
 * если ждущей попытки нет или ждут другое упражнение: партия из урока не имеет
 * права дописать чужой экзамен.
 */
export function noteCapstone(exerciseId: string, ok: boolean): void {
  const run = loadExamRun();
  if (!run || run.capstoneId !== exerciseId || run.capstoneOk !== null) return;
  saveExamRun({ ...run, capstoneOk: ok });
}

/**
 * Итог попытки — арифметика, а не экран.
 *
 * Капстоун весит два очка (`drawExam.weight`), поэтому он и решает сдачу
 * восьмиочкового экзамена. Порог — из той же выборки.
 */
export function examOutcome(run: ExamRunSnapshot): {
  score: number; passed: boolean; results: { id: string; ok: boolean }[];
} {
  const ok = run.capstoneOk === true;
  const score = run.score + (ok ? 2 : 0);
  return {
    score,
    passed: score >= run.passMark,
    results: [...run.results, { id: run.capstoneId, ok }],
  };
}
