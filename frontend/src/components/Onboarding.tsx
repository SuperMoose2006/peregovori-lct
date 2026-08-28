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
// Table, и решает по событиям движка. Состояния игры здесь не трогают, поэтому
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
}

const reduceMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Rect { top: number; left: number; width: number; height: number; }

export function Onboarding(props: CoachStep) {
  const { stepKey, targetRef, title, body, primaryLabel, onPrimary, skipLabel, onSkip } = props;
  const [rect, setRect] = useState<Rect | null>(null);
  const lastRect = useRef<Rect | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  // Measure the spotlight target in viewport coords and keep it pinned as the
  // page settles: a phone re-lays-out under a coach-mark (e.g. the DealTracker
  // grows a sparkline the moment the opponent's price first moves, nudging the
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

  // Tooltip placement: below the element if there's room, else above.
  // Horizontally clamped to the viewport.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const TIP_W = Math.min(320, vw - 24);
  const EST_H = 180; // enough headroom for the decision; exact height not needed
  const below = hole.top + hole.height + 12;
  const placeBelow = below + EST_H <= vh || hole.top < EST_H + 24;
  const top = placeBelow ? below : Math.max(12, hole.top - 12 - EST_H);
  const cx = hole.left + hole.width / 2;
  const left = Math.max(12, Math.min(cx - TIP_W / 2, vw - TIP_W - 12));
  const tipStyle: React.CSSProperties = { top, left, width: TIP_W };
  const arrow: "up" | "down" = placeBelow ? "up" : "down";

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

        <div className="onb-foot">
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
