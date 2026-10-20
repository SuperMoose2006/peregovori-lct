// SectionTour.tsx — тур по элементам ОДНОГО раздела.
//
// Какие шаги и когда показывать, решает lib/tours.ts; этот компонент только
// находит цели на экране и ведёт по ним подсветкой из Onboarding.tsx. Слой не
// модальный: подсвеченная кнопка нажимается как обычно, и уход из раздела —
// нормальный выход из тура (App снимает его при смене раздела).
import { useEffect, useRef, useState } from "react";
import type { Strings } from "../i18n";
import { TOURS, TOUR_READY, type TourSection } from "../lib/tours";
import { Onboarding } from "./Onboarding";

interface Resolved { id: string; ref: { current: HTMLElement | null } }

/** Элемент на экране и занимает место: `hidden` и свёрнутое не подсвечиваем. */
const visible = (el: HTMLElement | null): el is HTMLElement => !!el && el.getClientRects().length > 0;

/** Где стояла прокрутка до тура: окно и прокручиваемые предки целей. */
export interface ScrollMark { win: number; boxes: [Element, number][] }

export function markScroll(targets: (Element | null)[], win: number): ScrollMark {
  const boxes = new Map<Element, number>();
  for (const t of targets) {
    for (let el = t?.parentElement; el; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight && !boxes.has(el)) boxes.set(el, el.scrollTop);
    }
  }
  return { win, boxes: [...boxes] };
}

/**
 * КОНЕЦ ТУРА ВОЗВРАЩАЕТ ТУДА, ГДЕ ОН НАЧАЛСЯ. Подсветка прокручивает к каждой
 * цели, и последняя цель стола на телефоне — внизу рейла: после семи шагов
 * человек оказывался у футера, без чата и поля ввода (аудит 16.10, 390 px).
 * На широком экране так же оставался прокрученным сам рейл.
 */
export function restoreScroll(mark: ScrollMark | null) {
  if (!mark) return;
  for (const [el, top] of mark.boxes) el.scrollTop = top;
  window.scrollTo({ top: mark.win, behavior: "auto" });
}

export function SectionTour({ t, section, exam = false, optedOut, onOptOut, onDone }: {
  t: Strings;
  section: TourSection;
  /** Стол экзамена: Карла там нет вовсе (Mascot.tsx), тур ведёт Тихон. */
  exam?: boolean;
  /** Раздел уже отключён галочкой — показывается, только если позвали кнопкой. */
  optedOut: boolean;
  onOptOut: (off: boolean) => void;
  onDone: () => void;
}) {
  const [steps, setSteps] = useState<Resolved[] | null>(null);
  const [i, setI] = useState(0);
  const mark = useRef<ScrollMark | null>(null);

  // Цели ищутся ПОСЛЕ отрисовки раздела. Стол, курс и редактор едут отдельными
  // файлами, стол ещё и ждёт ответа сервера — поэтому сначала ждём «готовый»
  // элемент раздела (до 15 с), потом собираем шаги. Ссылка на цель заводится
  // один раз на шаг: по её тождеству Onboarding решает, когда перемерить.
  useEffect(() => {
    setSteps(null);
    setI(0);
    const ready = TOUR_READY[section];
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const resolve = () => {
      if (ready && !document.querySelector(ready) && tries++ < 60) {
        timer = setTimeout(resolve, 250);
        return;
      }
      const found = TOURS[section]
        .map((s) => ({ id: s.id, ref: { current: document.querySelector<HTMLElement>(s.selector) } }))
        .filter((s) => visible(s.ref.current));
      mark.current = markScroll(found.map((s) => s.ref.current), window.scrollY);
      setSteps(found);
    };
    // Кадр отсрочки: цели этого раздела могли ещё не встать в дерево.
    timer = setTimeout(resolve, 60);
    return () => { if (timer) clearTimeout(timer); };
  }, [section]);

  if (!steps || steps.length === 0) return null;
  const at = Math.min(i, steps.length - 1);
  const step = steps[at];
  const last = at === steps.length - 1;
  const copy = t.tours[section][step.id];
  if (!copy) return null;
  const finish = () => { restoreScroll(mark.current); onDone(); };
  // Первый шаг — приветствие, дальше маскот показывает на подсвеченное.
  // Экзамен (и его раздел, и стол) ведёт Тихон: правило и запись — его.
  const guide = exam || section === "exam"
    ? { dir: "tikhon" as const, state: at === 0 ? "exam" : "chart", name: t.mascot.tikhon }
    : { dir: "karl" as const, state: at === 0 ? "wave" : "point", name: t.mascot.karl };
  return (
    <Onboarding
      stepKey={`tour-${section}-${step.id}`}
      targetRef={step.ref}
      title={copy.title}
      body={copy.body}
      progress={t.tour.stepOf.replace("{n}", String(at + 1)).replace("{total}", String(steps.length))}
      primaryLabel={last ? t.tour.done : t.tour.next}
      onPrimary={() => (last ? finish() : setI(at + 1))}
      skipLabel={t.tour.skip}
      onSkip={finish}
      optOut={{ label: t.tour.dontShow, checked: optedOut, onChange: onOptOut }}
      guide={guide}
    />
  );
}
