// ReadingCard.tsx — вход в режим «Чтение стола» с домашнего экрана.
//
// ПОЧЕМУ КАРТОЧКА В РЕЙЛЕ, А НЕ ПУНКТ МЕНЮ. Слева перечислены РЕЖИМЫ ПАРТИИ —
// то, где человек садится за стол сам; чтение стола партией не является и в
// грейд не входит, поэтому шестой строкой рядом с экзаменом оно обещало бы не
// то. В рейле оно стоит там, где человек выбирает, чем заняться сегодня, —
// рядом со столом дня и курсом, и рядом же честно написано «в грейд не входит».
//
// ПОЧЕМУ ЭКРАН РЕЖИМА ЕДЕТ ОТДЕЛЬНЫМ ФАЙЛОМ. Он тянет за собой движок, каталог
// чужих партий и полосу шкал; на домашнем экране всё это не нужно никому, кто
// сюда не нажал (`test/lazy.test.ts`). Отсюда же вторая половина правила:
// «ленивый» экран без сети не откроется, если файл не доехал ЗАРАНЕЕ, — поэтому
// он греется на простое сразу после первой отрисовки, ровно как экраны из
// `App.tsx::WARM`. Оба свойства проверяет `test/reading.test.ts`: и что импорт
// динамический, и что прогрев есть.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Lang } from "../types";
import type { Strings } from "../i18n";
import { useModalShell } from "../lib/modal";
import { READING_IDS, loadReading, readingDone } from "../lib/readingStore";
import { LazyScreen } from "./LazyScreen";
import { RailCard } from "./Rail";

/** Единственное место, где называется путь к экрану режима: тот же путь в
 *  прогреве ниже даёт тот же кусок сборки, разные пути дали бы два. */
const loadReadingScreen = () =>
  import("./ReadingScreen").then((m) => ({ default: m.ReadingScreen }));

export function ReadingCard({ t, lang }: { t: Strings; lang: Lang }) {
  const [open, setOpen] = useState(false);
  // Прогресс перечитывается при закрытии: экран пишет его в своё хранилище, и
  // карточка обязана показать то, что там теперь лежит, а не то, что лежало при
  // загрузке страницы.
  const [log, setLog] = useState(() => loadReading());
  const sheet = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setLog(loadReading());
  }, []);
  useModalShell(open, sheet, close);

  // Прогрев на простое — цена, которой оплачен инвариант 5. Отказ глушится
  // молча: это оптимизация, и её провал ничего не должен показывать; настоящий
  // отказ увидит тот, кто в этот экран пойдёт (LazyScreen скажет вслух).
  useEffect(() => {
    const warm = () => { loadReadingScreen().catch(() => {}); };
    const idle = (window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
    }).requestIdleCallback;
    if (idle) idle(warm);
    else setTimeout(warm, 2000);
  }, []);

  const ids = READING_IDS[lang];
  const done = readingDone(log, ids);

  return (
    <>
      <RailCard title={t.reading.title}>
        <p className="rc-note">{t.reading.cardLead}</p>
        <span className="rc-bar"><i style={{ width: `${(done / ids.length) * 100}%` }} /></span>
        <p className="rc-next">
          {t.reading.cardProgress
            .replace("{n}", String(done))
            .replace("{total}", String(ids.length))}
        </p>
        <p className="rd-note">{t.reading.notScored}</p>
        {/* Опора для прибора, не для стилей: обходчик снимков ходил по подписям
            кнопок, а они переводятся — и в английском режиме промах глотался бы
            молча (см. probes/README.md). Ключ от языка не зависит. */}
        <button className="btn primary rc-go" data-reading="open" onClick={() => setOpen(true)}>
          {t.reading.cardCta} →
        </button>
      </RailCard>

      {open ? createPortal(
        // Портал в body обязателен: `useModalShell` помечает `.app` инертным, а
        // диалог внутри инертного поддерева стал бы инертным сам.
        <div className="rd-shell" role="dialog" aria-modal="true"
             aria-label={t.reading.title} ref={sheet} tabIndex={-1}>
          <LazyScreen
            lang={lang}
            load={loadReadingScreen}
            onHome={close}
            render={(Screen) => <Screen t={t} lang={lang} onClose={close} />}
          />
        </div>,
        document.body,
      ) : null}
    </>
  );
}
