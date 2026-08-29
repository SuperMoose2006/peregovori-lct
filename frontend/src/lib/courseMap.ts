// courseMap.ts — карта курса без банка упражнений.
//
// ЗАЧЕМ ОТДЕЛЬНО ОТ course.ts. Тот переэкспортирует `COURSE_BANK`, поэтому любой
// импорт из него тянет на домашний экран 116 КБ формулировок и разборов на двух
// языках. А главной нужны только блоки: счётчик «пройдено N из 10», следующий
// шаг, подбор разминки к акту кампании и шкала блока в профиле.
//
// Здесь лежит ровно это — данные блоков и чистая арифметика над прогрессом.
// Ничего, что смотрит в банк или зовёт движок, тут быть не должно; проверку
// зачёта и экзамен мастера см. в course.ts и courseExam.ts.
import { COURSE_BLOCKS, COURSE_BLOCK_SIZES } from "../data/course.blocks.generated";

export { COURSE_BLOCKS, COURSE_BLOCK_SIZES };

export const BLOCK_IDS = COURSE_BLOCKS.map((b) => b.id);
export const blockById = (id: string) => COURSE_BLOCKS.find((b) => b.id === id);
export const masterUnlocked = (passedBlocks: number) => passedBlocks >= COURSE_BLOCKS.length;

/** Сколько упражнений в блоке. Число приезжает из генератора вместе с блоками —
 *  подсчёт по банку стоил бы загрузки самого банка. */
export interface NextStep {
  blockId: string;
  /** Урок, который стоит открыть; null — уроки пройдены, ждёт экзамен. */
  lesson: number | null;
}
export const blockSize = (blockId: string) => COURSE_BLOCK_SIZES[blockId] ?? 0;

/**
 * Первый незакрытый шаг курса.
 *
 * Нужен ровно для одного: на домашнем экране кнопка обязана вести В КОНКРЕТНОЕ
 * место. «Открыть курс» заставляет вспоминать, где ты остановился, — а это и
 * есть та секунда сомнения, на которой человек закрывает вкладку.
 */
export function nextStep(done: { lessons: number[]; passed: boolean }[]): NextStep | null {
  for (let i = 0; i < COURSE_BLOCKS.length; i++) {
    const block = COURSE_BLOCKS[i];
    const p = done[i] ?? { lessons: [], passed: false };
    const lesson = block.lessons.find((l) => !p.lessons.includes(l.idx));
    if (lesson) return { blockId: block.id, lesson: lesson.idx };
    if (!p.passed) return { blockId: block.id, lesson: null };
  }
  return null;
}