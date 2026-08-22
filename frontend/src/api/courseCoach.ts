// courseCoach.ts — комментарий тренера к свободному ответу упражнения.
//
// ЧТО ЭТО НЕ ДЕЛАЕТ: не решает, зачтено ли упражнение. Вердикт уже вынес движок
// (lib/course.ts) — тем же предикатом, что и на сервере. Здесь ИИ добавляет одну
// конкретную подсказку по СМЫСЛУ, ровно как судья в партии.
//
// Тишина — нормальный ответ. Судья выключен (`NEGO_JUDGE=0`), ключа нет, сеть
// легла, бэкенда вообще нет (офлайн-мок) → null, и карточка тренера просто не
// появляется. Курс обязан быть полностью проходим без единого запроса.
const TIMEOUT_MS = 7000;

export interface CoachNote {
  note: string | null;
  techniques: string[];
}

export async function courseCoach(exerciseId: string, text: string, lang: string): Promise<CoachNote | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("/api/course/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exerciseId, text, lang }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as CoachNote;
    return data && data.note ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
