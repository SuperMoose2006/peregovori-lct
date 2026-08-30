// OtherSideCard.tsx — вход в режим «Обратная сторона стола» с домашнего экрана.
//
// ПОЧЕМУ КАРТОЧКА В РЕЙЛЕ, А НЕ ШЕСТАЯ СТРОКА В МЕНЮ РЕЖИМОВ. Слева
// перечислены режимы, различающиеся ПРАВИЛАМИ партии: практика, кампания, стол
// дня, своя сделка, экзамен. У обратной стороны правила ровно те же — тот же
// движок, та же формула, тот же потолок техники; отличается только запись
// стола, за который садится игрок. Строкой рядом с «Экзаменом» она обещала бы
// другой регламент, которого нет.
//
// ЧЕМ ОНА ОТЛИЧАЕТСЯ ОТ СОСЕДКИ «ЧТЕНИЕ СТОЛА». Ровно одним, и это написано на
// самой карточке: чтение стола партией не является и в грейд не входит, а это
// — партия, и грейд ей ставит тот же `score_session`. Плашка честности здесь
// поэтому обратная по смыслу и такая же громкая по месту.
//
// ПОЧЕМУ ЭКРАН РЕЖИМА ЕДЕТ ОТДЕЛЬНЫМ ФАЙЛОМ. Он тянет записи зеркальных столов
// (`data/mirrors.ts`) — числа, интересы, ключевые слова; на домашнем экране это
// не нужно никому, кто сюда не нажал (`test/lazy.test.ts`). И вторая половина
// того же правила: «ленивый» экран без сети не откроется, если файл не доехал
// ЗАРАНЕЕ, — поэтому он греется на простое сразу после первой отрисовки.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Lang } from "../types";
import type { Strings } from "../i18n";
import { useModalShell } from "../lib/modal";
import { LazyScreen } from "./LazyScreen";
import { RailCard } from "./Rail";

/** Единственное место, где называется путь к экрану режима: тот же путь в
 *  прогреве ниже даёт тот же кусок сборки, разные пути дали бы два. */
const loadOtherSideScreen = () =>
  import("./OtherSideScreen").then((m) => ({ default: m.OtherSideScreen }));

export function OtherSideCard(
  { t, lang, onPlay }: { t: Strings; lang: Lang; onPlay: (scenarioId: string) => void },
) {
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useModalShell(open, sheet, close);

  // Прогрев на простое — цена, которой оплачен инвариант 5. Отказ глушится
  // молча: это оптимизация; настоящий отказ увидит тот, кто в экран пойдёт.
  useEffect(() => {
    const warm = () => { loadOtherSideScreen().catch(() => {}); };
    const idle = (window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
    }).requestIdleCallback;
    if (idle) idle(warm);
    else setTimeout(warm, 2000);
  }, []);

  const play = useCallback((scenarioId: string) => {
    setOpen(false);
    onPlay(scenarioId);
  }, [onPlay]);

  return (
    <>
      <RailCard title={t.otherSide.title}>
        <p className="rc-note">{t.otherSide.cardLead}</p>
        <p className="rd-note">{t.otherSide.scored}</p>
        {/* Опора для прибора, не для стилей: обходчик снимков ходит по подписям
            кнопок, а они переводятся — ключ от языка не зависит. */}
        <button className="btn primary rc-go" data-other-side="open" onClick={() => setOpen(true)}>
          {t.otherSide.cardCta} →
        </button>
      </RailCard>

      {open ? createPortal(
        // Портал в body обязателен: `useModalShell` помечает `.app` инертным, а
        // диалог внутри инертного поддерева стал бы инертным сам.
        <div className="rd-shell" role="dialog" aria-modal="true"
             aria-label={t.otherSide.title} ref={sheet} tabIndex={-1}>
          <LazyScreen
            lang={lang}
            load={loadOtherSideScreen}
            onHome={close}
            render={(Screen) => <Screen t={t} lang={lang} onClose={close} onPlay={play} />}
          />
        </div>,
        document.body,
      ) : null}
    </>
  );
}
