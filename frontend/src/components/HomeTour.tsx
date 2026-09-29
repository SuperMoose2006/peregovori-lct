// HomeTour.tsx — короткий обход главного экрана при первом заходе.
//
// ЗАЧЕМ. Человек, открывший продукт впервые, видел заголовок, карточку «Ваш
// следующий шаг», меню из семи слов и рейл из восьми карточек — и не понимал,
// что это за продукт и что делать прямо сейчас. Механизм подсказок был
// (Onboarding.tsx, анимации onbtip/onbfade, флаг dialog.tutorialDone.v1), но
// работал только за столом и только после первого хода.
//
// ЧЕТЫРЕ ШАГА, А НЕ ЛЕКЦИЯ. Что это за продукт → с чего начать → разделы →
// ваш прогресс. Каждый шаг подсвечивает НАСТОЯЩИЙ элемент экрана (правило
// Onboarding.tsx: подсказки без цели не бывает), пропустить можно на любом.
//
// Слой не модальный и ничего не блокирует: подсвеченная карточка нажимается
// как обычно, и нажатие «Сесть за стол» посреди обхода — нормальный выход из
// него (App закрывает вводную, когда человек уходит с главной).
import { useEffect, useState } from "react";
import type { Strings } from "../i18n";
import { Onboarding } from "./Onboarding";

type StepId = keyof Strings["tour"]["steps"];

/**
 * Шаги и их цели. Селектор — класс элемента, который на главной уже есть;
 * `test/onboarding.test.ts` сверяет, что каждый из них действительно стоит в
 * разметке, — переименованный класс иначе молча выключил бы шаг.
 */
export const TOUR_STEPS: ReadonlyArray<{ id: StepId; selector: string }> = [
  { id: "intro", selector: ".practice-intro" },
  { id: "start", selector: ".route" },
  { id: "nav", selector: ".sidenav" },
  { id: "progress", selector: ".rail-progress" },
];

interface Resolved { id: StepId; ref: { current: HTMLElement | null } }

export function HomeTour({ t, onDone }: { t: Strings; onDone: () => void }) {
  const [steps, setSteps] = useState<Resolved[] | null>(null);
  const [i, setI] = useState(0);

  // Цели ищутся ПОСЛЕ отрисовки экрана: на первом рендере их ещё нет в DOM.
  // Ссылка на элемент заводится один раз на шаг, и её тождество стабильно —
  // Onboarding по нему решает, когда перемерить подсветку. Цели нет (карточки
  // «следующий шаг» может не быть) — шаг выпадает, а не висит над пустотой.
  useEffect(() => {
    const found = TOUR_STEPS
      .map((s) => ({ id: s.id, ref: { current: document.querySelector<HTMLElement>(s.selector) } }))
      .filter((s) => s.ref.current);
    setSteps(found);
  }, []);

  if (!steps || steps.length === 0) return null;
  const at = Math.min(i, steps.length - 1);
  const step = steps[at];
  const last = at === steps.length - 1;
  const copy = t.tour.steps[step.id];
  return (
    <Onboarding
      stepKey={`tour-${step.id}`}
      targetRef={step.ref}
      title={copy.title}
      body={copy.body}
      progress={t.tour.stepOf.replace("{n}", String(at + 1)).replace("{total}", String(steps.length))}
      primaryLabel={last ? t.tour.done : t.tour.next}
      onPrimary={() => (last ? onDone() : setI(at + 1))}
      skipLabel={t.tour.skip}
      onSkip={onDone}
    />
  );
}
