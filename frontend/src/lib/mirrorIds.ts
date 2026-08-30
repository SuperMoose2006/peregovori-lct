// mirrorIds.ts — какие столы можно сыграть с ДРУГОЙ стороны, одними именами.
//
// ПОЧЕМУ ОТДЕЛЬНО ОТ `data/mirrors.ts`. Там лежат сами записи столов — числа,
// интересы, ключевые слова, вторичные фишки; это десяток килобайт, нужных
// только тому, кто в режим нажал, и потому файл отложен (`test/lazy.test.ts`).
// А вот ОДИН вопрос — «этот стол вообще из каталога?» — задаётся на критическом
// пути: по нему `App.tsx` решает, записывать ли партию соперником для
// переигровки. Список имён весит строку и разъехаться с данными не может:
// сторожит `frontend/test/otherSide.test.ts`.
export const MIRROR_IDS: readonly string[] = [
  "supplier_mirror",
  "investor_mirror",
  "freelance_mirror",
  "salary_mirror",
  "conflict_mirror",
  "rent_mirror",
];

/** Зеркальный ли это стол. */
export function isMirrorTable(id: string | null | undefined): boolean {
  return !!id && MIRROR_IDS.includes(id);
}
