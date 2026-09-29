// Onboarding.tsx — подсветка ОДНОГО элемента прямо на столе: затемнение с
// «дыркой» над тем, что сейчас важно, и маленькая подсказка рядом с ним.
//
// ЧЕГО ЗДЕСЬ БОЛЬШЕ НЕТ. Была линейная вводная из трёх шагов, и первый её шаг —
// карточка «Добро пожаловать за стол» по центру экрана поверх всего. Она
// перекрывала ответ оппонента и строку тренера, то есть ровно тот момент, ради
// которого существует. Экран без цели (centered) и точки прогресса убраны
// вместе с ней: каждый оставшийся шаг обязан указывать на РЕАЛЬНЫЙ элемент,
// который движок только что изменил.
//
// Слой владеет только показом и замером. КАКОЙ шаг показывать и КОГДА решает
// хозяин: за столом — Table, по событиям движка первой партии; в каждом разделе —
// SectionTour, тур по его элементам (правила показа — lib/tours.ts). Состояния игры здесь не трогают, поэтому
// детерминированный движок остаётся единственным источником правды.
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface CoachStep {
  stepKey: string; // NOT `key` — that's reserved by React and stripped on spread
  /** Элемент, который подсвечиваем. Обязателен: подсказки без цели больше нет. */
  targetRef: React.RefObject<HTMLElement | null>;
  title: string;
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
  skipLabel: string;
  onSkip: () => void;
  /** «Шаг 2 из 4» — у серии подсказок. У одиночной подсветки на столе его нет. */
  progress?: string;
  /** Галочка «Больше не показывать» — видимая, прямо в карточке. У туров
   *  разделов она есть, у одиночных подсветок за столом её нет. */
  optOut?: { label: string; checked: boolean; onChange: (checked: boolean) => void };
}

const reduceMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface Rect { top: number; left: number; width: number; height: number; }

export type TipSide = "up" | "down" | "left" | "right";
export interface TipPlace {
  top: number;
  left: number;
  /** С какой стороны подсказки торчит стрелка: "up" — цель над подсказкой. */
  arrow: TipSide;
  /** Где на кромке подсказки стоит стрелка, в пикселях от её начала. */
  arrowAt: number;
}

const GAP = 12;
const EDGE = 12;

/**
 * Куда поставить подсказку рядом с подсвеченным элементом.
 *
 * ПОЧЕМУ ЧЕТЫРЕ СТОРОНЫ, А НЕ ДВЕ. Раньше подсказка вставала только под целью
 * или над ней — и для первой же высокой цели (меню разделов во всю высоту
 * окна) обе стороны оказывались за краем экрана: подсказка рисовалась ниже
 * нижней кромки, человек видел ободок и не видел ни слова. Теперь, если сверху
 * и снизу места нет, она встаёт сбоку, а если нет и сбоку — прижимается к низу
 * окна поверх цели: текст на экране важнее того, что под ним.
 *
 * Чистая функция: проверяется тестом на размерах, а не глазами.
 */
export function placeTip(hole: Rect, vw: number, vh: number, tipW: number, tipH: number): TipPlace {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));
  const cx = hole.left + hole.width / 2;
  const cy = hole.top + hole.height / 2;
  const horiz = () => clamp(cx - tipW / 2, EDGE, vw - tipW - EDGE);
  const vert = () => clamp(cy - tipH / 2, EDGE, vh - tipH - EDGE);
  const arrowX = (left: number) => clamp(cx - left, 18, tipW - 18);
  const arrowY = (top: number) => clamp(cy - top, 18, tipH - 18);

  const below = hole.top + hole.height + GAP;
  if (below + tipH <= vh - EDGE) {
    const left = horiz();
    return { top: below, left, arrow: "up", arrowAt: arrowX(left) };
  }
  const above = hole.top - GAP - tipH;
  if (above >= EDGE) {
    const left = horiz();
    return { top: above, left, arrow: "down", arrowAt: arrowX(left) };
  }
  const right = hole.left + hole.width + GAP;
  if (right + tipW <= vw - EDGE) {
    const top = vert();
    return { top, left: right, arrow: "left", arrowAt: arrowY(top) };
  }
  const leftSide = hole.left - GAP - tipW;
  if (leftSide >= EDGE) {
    const top = vert();
    return { top, left: leftSide, arrow: "right", arrowAt: arrowY(top) };
  }
  // Места нет нигде (телефон, цель на весь экран): низ окна, стрелка вверх.
  const left = horiz();
  const top = Math.max(EDGE, vh - tipH - EDGE);
  return { top, left, arrow: "up", arrowAt: arrowX(left) };
}

export function Onboarding(props: CoachStep) {
  const { stepKey, targetRef, title, body, primaryLabel, onPrimary, skipLabel, onSkip, progress, optOut } = props;
  const [rect, setRect] = useState<Rect | null>(null);
  const lastRect = useRef<Rect | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  // Настоящая высота подсказки. До первого замера — оценка: её хватает, чтобы
  // решить сторону, а после замера длинный текст не уезжает за край окна.
  const [tipH, setTipH] = useState(180);
  useLayoutEffect(() => {
    const h = tipRef.current?.offsetHeight;
    if (h && Math.abs(h - tipH) > 1) setTipH(h);
  });

  // Measure the spotlight target in viewport coords and keep it pinned as the
  // page settles: a phone re-lays-out under a coach-mark (e.g. the DealTracker
  // grows a price-trail line the moment the opponent's price first moves, nudging the
  // element below it down). We track that via a ResizeObserver on the body, the
  // scroll/resize listeners, and a short settle loop after the (reduced-motion-
  // aware) scroll-into-view — so the hole never strands over a stale position.
  useLayoutEffect(() => {
    const el = targetRef?.current ?? null;
    if (!el) { setRect(null); lastRect.current = null; return; }
    const measure = () => {
      const r = el.getBoundingClientRect();
      const next = { top: r.top, left: r.left, width: r.width, height: r.height };
      const p = lastRect.current;
      if (!p || p.top !== next.top || p.left !== next.left || p.width !== next.width || p.height !== next.height) {
        lastRect.current = next;
        setRect(next);
      }
    };
    const reduce = reduceMotion();
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    measure();

    // A brief rAF settle loop converges the spotlight onto the element's final
    // resting rect as the smooth scroll and any reflow underneath complete.
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      measure();
      if (performance.now() - start < 1000) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(document.body);
    ro?.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
    // stepKey changes with every step; that's the intended re-measure trigger.
  }, [stepKey, targetRef]);

  // Цель ещё не измерена — рисовать нечего. Пустой экран лучше затемнения,
  // повисшего непонятно над чем.
  if (!rect) return null;

  // Padding around the spotlighted element, and the hole geometry.
  const PAD = 8;
  const hole = { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 };

  // Placement is a pure function (see placeTip): below, above, beside, or pinned
  // to the bottom of the window — whichever keeps every word on screen.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const TIP_W = Math.min(320, vw - 24);
  const place = placeTip(hole, vw, vh, TIP_W, tipH);
  const tipStyle = {
    top: place.top, left: place.left, width: TIP_W,
    "--onb-arrow-at": `${place.arrowAt}px`,
  } as React.CSSProperties;
  const arrow = place.arrow;

  // Portal to <body>: the game screen sets an (identity) transform for its
  // fade-in, which would otherwise become the containing block for our fixed
  // overlay and strand the spotlight tens of px off the real element.
  return createPortal(
    // Не модальное окно: `aria-modal` здесь означал бы «остальной экран для вас
    // закрыт», а он открыт — и это главное свойство этой подсказки.
    <div className="onb" role="dialog" aria-label={title}>
      <div className="onb-hole" style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }} />

      <div className={`onb-tip a-${arrow}`} style={tipStyle} ref={tipRef}>
        <span className="onb-arrow" aria-hidden="true" />
        <div className="onb-title">{title}</div>
        <div className="onb-body">{body}</div>
        {optOut ? (
          <label className="onb-opt">
            <input type="checkbox" checked={optOut.checked}
                   onChange={(e) => optOut.onChange(e.currentTarget.checked)} />
            <span>{optOut.label}</span>
          </label>
        ) : null}

        <div className="onb-foot">
          {progress ? <span className="onb-step">{progress}</span> : null}
          <div className="onb-btns">
            <button className="onb-skip" onClick={onSkip}>{skipLabel}</button>
            <button className="onb-next" onClick={onPrimary}>{primaryLabel}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
