// Onboarding.tsx — the guided first-negotiation coach-mark overlay. A single
// lightweight step at a time: a dimmed backdrop with a "hole" cut over the
// element that matters right now, plus a small tooltip anchored to it (or a
// centered welcome card when there's no target). Every step is skippable.
//
// The overlay owns only presentation + measurement. WHICH step shows, and WHEN
// (welcome → meters → composer, then event-driven reveals tied to the real
// engine state), is decided by Table. Nothing here touches game state, so the
// deterministic engine stays the single source of truth.
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface CoachStep {
  stepKey: string; // NOT `key` — that's reserved by React and stripped on spread
  // The element to spotlight. Omitted → a centered card (the welcome beat).
  targetRef?: React.RefObject<HTMLElement | null>;
  title: string;
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
  // Optional prominent tap-to-act button (the suggested opening the player can
  // send for their very first turn).
  action?: { label: string; onClick: () => void };
  // Guided-intro position for the progress dots ("2 / 3"). 0 → no dots (event
  // reveals aren't part of the linear intro).
  step: number;
  steps: number;
  skipLabel: string;
  onSkip: () => void;
}

const reduceMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Rect { top: number; left: number; width: number; height: number; }

export function Onboarding(props: CoachStep) {
  const { stepKey, targetRef, title, body, primaryLabel, onPrimary, action, step, steps, skipLabel, onSkip } = props;
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

  // Padding around the spotlighted element, and the hole geometry.
  const PAD = 8;
  const hole = rect
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null;

  // Tooltip placement: centered when there's no target; otherwise below the
  // element if there's room, else above. Horizontally clamped to the viewport.
  let tipStyle: React.CSSProperties;
  let arrow: "up" | "down" | null = null;
  if (!hole) {
    tipStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  } else {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const TIP_W = Math.min(320, vw - 24);
    const EST_H = 210; // enough headroom for the decision; exact height not needed
    const below = hole.top + hole.height + 12;
    const placeBelow = below + EST_H <= vh || hole.top < EST_H + 24;
    const top = placeBelow ? below : Math.max(12, hole.top - 12 - EST_H);
    const cx = hole.left + hole.width / 2;
    const left = Math.max(12, Math.min(cx - TIP_W / 2, vw - TIP_W - 12));
    tipStyle = { top, left, width: TIP_W };
    arrow = placeBelow ? "up" : "down";
  }

  // Portal to <body>: the game screen sets an (identity) transform for its
  // fade-in, which would otherwise become the containing block for our fixed
  // overlay and strand the spotlight tens of px off the real element.
  return createPortal(
    <div className="onb" role="dialog" aria-modal="true" aria-label={title}>
      {hole ? (
        <div className="onb-hole" style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }} />
      ) : (
        <div className="onb-scrim" />
      )}

      <div className={`onb-tip${arrow ? ` a-${arrow}` : " centered"}`} style={tipStyle} ref={tipRef}>
        {arrow ? <span className="onb-arrow" aria-hidden="true" /> : null}
        <div className="onb-title">{title}</div>
        <div className="onb-body">{body}</div>

        {action ? (
          <button className="onb-action" onClick={action.onClick}>
            {action.label}
          </button>
        ) : null}

        <div className="onb-foot">
          {steps > 0 ? (
            <span className="onb-dots" aria-hidden="true">
              {Array.from({ length: steps }, (_, i) => (
                <i className={i + 1 === step ? "on" : ""} key={i} />
              ))}
            </span>
          ) : (
            <span />
          )}
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
