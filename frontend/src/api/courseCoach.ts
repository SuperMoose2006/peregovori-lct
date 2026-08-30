// courseCoach.ts — комментарий тренера к свободному ответу упражнения.
//
// ЧТО ЭТО НЕ ДЕЛАЕТ: не решает, зачтено ли упражнение. Вердикт уже вынес движок
// (lib/course.ts) — тем же предикатом, что и на сервере. Здесь ИИ добавляет одну
// конкретную подсказку по СМЫСЛУ, ровно как судья в партии.
//
// Тишина — нормальный ответ. Судья выключен (`NEGO_JUDGE=0`), ключа нет, сеть
// легла, бэкенда вообще нет (офлайн-мок) → null, и карточка тренера просто не
// появляется. Курс обязан быть полностью проходим без единого запроса.
import { apiFetch } from "./backend";

const TIMEOUT_MS = 7000;

export interface CoachNote {
  note: string | null;
  techniques: string[];
}

export async function courseCoach(exerciseId: string, text: string, lang: string,
  /** Что решил движок. Тренер его НЕ пересматривает — он его объясняет:
   *  без этого он оценивал реплику как реплику, пока предикат валил её как
   *  ответ на задание, и экран показывал «Не то» рядом с «отличный размен». */
  ok: boolean,
): Promise<CoachNote | null> {
  // В офлайн-сборке (VITE_MOCK=1) бэкенда нет по определению — тот же флаг
  // подменяет и транспорт партии. Запрос всё равно завершался бы ничем, но
  // сначала стучался в пустоту и писал ошибку в консоль на каждом упражнении.
  // Не ходить туда, где заведомо никого нет, — часть того же обещания
  // «курс проходим без единого запроса».
  if (import.meta.env.VITE_MOCK === "1") return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await apiFetch("/api/course/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exerciseId, text, lang, ok }),
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
