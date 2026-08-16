// Table.tsx — the negotiation screen. Left: counterpart card, offers board,
// live meters, briefing, BATNA, interests tracker. Right: chat log + composer.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Deltas, Mode, ScenarioView, StateView } from "../types";
import type { TransportKind } from "../api/transport";
import type { ChatEntry } from "../api/useNegotiation";
import type { Strings } from "../i18n";
import { isTutorialDone, markTutorialDone, shouldRunTutorial } from "../lib/progress";
import { haptic, play } from "../lib/sound";
import { Meters } from "./Meters";
import { Chat } from "./Chat";
import { Composer } from "./Composer";
import { DealTracker } from "./DealTracker";
import { DealTerms } from "./DealTerms";
import { Onboarding, type CoachStep } from "./Onboarding";

interface Props {
  t: Strings;
  mode: Mode;
  kind: TransportKind | null;
  scenario: ScenarioView;
  state: StateView | null;
  log: ChatEntry[];
  busy: boolean;
  onSend: (text: string) => void;
  onHint: () => void;
  onQuit: () => void;
}

// Counterpart's face reflects their live mood — driven only by the deterministic
// meters (trust/tension), so it's another read on the same honest state. Withheld
// in exam mode, where meters are hidden (would leak the same signal).
function moodFace(st: StateView | null, fallback: string): string {
  if (!st) return fallback;
  if (st.tension > 70) return "😠";
  if (st.tension > 45) return "😟";
  if (st.trust > 65) return "🙂";
  return "😐";
}

export function Table({ t, mode, kind, scenario, state, log, busy, onSend, onHint, onQuit }: Props) {
  const st = state;
  const finished = !!st && st.status !== "active";
  const iFound = st?.interests_found ?? 0;
  const iTotal = st?.interests_total ?? 0;
  // Exam is an assessment: all live coaching feedback (meters, interests tracker,
  // technique chips/badges, meter deltas, hint) is withheld until the debrief.
  const exam = mode === "exam";
  // Latest turn's deltas (for the meter pulse cue) — read off the most recent
  // player line in the log. Never used in exam (meters are hidden there anyway).
  let lastDeltas: Deltas | null = null;
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.kind === "me" && e.deltas) {
      lastDeltas = e.deltas;
      break;
    }
  }
  const face = exam ? scenario.icon : moodFace(st, scenario.icon);

  // Typing indicator: show while a turn is in flight (busy) but the opponent's
  // reply hasn't begun. Once opponent_delta pushes a streaming "opp" bubble it
  // becomes the last entry, so the indicator yields to the live reply. Cleared
  // automatically when busy drops (opponent/error/debrief all reset it), and
  // never shown after the game is finished.
  const lastEntry = log[log.length - 1];
  const typing = busy && !finished && (!lastEntry || lastEntry.kind !== "opp");

  // First-90-seconds hook: a one-time, dismissible coach bubble nudging the new
  // player to open with a question. Shown only on turn 0 (before any send) and
  // never in exam (which withholds help). Dismissed on × or the first send.
  const [coachDismissed, setCoachDismissed] = useState(false);
  // The legacy one-line nudge is for RETURNING players; first-timers get the full
  // guided onboarding instead (below), so suppress it whenever that ran this game.

  // Mobile: the briefing + BATNA collapse behind a toggle so the game side-strip
  // stays short and the chat/composer are reachable without endless scrolling.
  // On desktop this section is always expanded (the toggle is hidden by CSS).
  const [moreOpen, setMoreOpen] = useState(false);
  const handleSend = (text: string) => {
    setCoachDismissed(true);
    onSend(text);
  };

  // Interest-reveal delight: when the engine's interests_found ticks up, flash
  // the tracker and float a brief toast. Purely celebratory — we never reveal
  // the interest text the backend withheld, only that the COUNT rose. Suppressed
  // in exam (the tracker itself is hidden there). CSS honors reduced-motion.
  const [flash, setFlash] = useState(false);
  const [toast, setToast] = useState(false);
  const prevFound = useRef(iFound);
  useEffect(() => {
    const rose = iFound > prevFound.current;
    prevFound.current = iFound;
    if (!rose || exam) return;
    // Celebratory cue for uncovering a hidden interest: a gentle rising chime
    // + a light haptic. Fires once per real count increase (this effect only
    // runs when `rose`), so no guard against re-render is needed.
    play("reveal");
    haptic();
    setFlash(true);
    setToast(true);
    const t1 = setTimeout(() => setFlash(false), 900);
    const t2 = setTimeout(() => setToast(false), 2600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [iFound, exam]);

  // ---- Guided first-negotiation onboarding (director's #1) ------------------
  // Practice-only, first-time-only coach-marks that reveal each element the
  // moment it first matters — a warm intro (welcome → meters → composer) and
  // then two reveals tied to REAL engine events: the first interest uncovered
  // and the opponent's first price move. Skippable at every step; the engine
  // stays the source of truth (this only points at what it already did).
  const ranTutorial = useRef(shouldRunTutorial(mode, isTutorialDone()));
  const showFirstCoach = !exam && !ranTutorial.current && !!st && st.turn === 0 && !coachDismissed;
  type TutPhase = "off" | "welcome" | "meters" | "compose" | "run" | "done";
  const [tutPhase, setTutPhase] = useState<TutPhase>(() => (ranTutorial.current ? "welcome" : "off"));
  const [tutMark, setTutMark] = useState<null | "interest" | "deal">(null);
  const [tutQueue, setTutQueue] = useState<Array<"interest" | "deal">>([]);
  const tutPhaseRef = useRef(tutPhase);
  tutPhaseRef.current = tutPhase;
  const tutSeen = useRef({ interest: false, deal: false });
  const tutFirstOffer = useRef<number | null>(null);
  const tutFound = useRef(iFound);
  const tutDoneOnce = useRef(false);

  const metersRef = useRef<HTMLDivElement>(null);
  const dealRef = useRef<HTMLDivElement>(null);
  const interestsRef = useRef<HTMLDivElement>(null);
  const composeRef = useRef<HTMLDivElement>(null);

  // Persist the one-time flag the first moment the player engages an exit path
  // (advances past the intro, sends the opener, or skips) — so a second game
  // never re-onboards, even if they quit mid-tutorial. Idempotent.
  const commitTutDone = useCallback(() => {
    if (!tutDoneOnce.current) {
      tutDoneOnce.current = true;
      markTutorialDone();
    }
  }, []);

  // Queue an event-driven reveal, once each, only while the tutorial is live.
  const queueTutMark = useCallback((ev: "interest" | "deal") => {
    const p = tutPhaseRef.current;
    if (p === "off" || p === "done") return;
    if (tutSeen.current[ev]) return;
    tutSeen.current[ev] = true;
    setTutQueue((q) => [...q, ev]);
  }, []);

  // Real event #1: the engine's interests_found ticked up → an interest surfaced.
  useEffect(() => {
    const rose = iFound > tutFound.current;
    tutFound.current = iFound;
    if (rose) queueTutMark("interest");
  }, [iFound, queueTutMark]);

  // Real event #2: the opponent's offer moved off its opening (their price shifted).
  useEffect(() => {
    if (!st) return;
    if (tutFirstOffer.current === null) {
      tutFirstOffer.current = st.offer_opp;
      return;
    }
    if (st.offer_opp !== tutFirstOffer.current) queueTutMark("deal");
  }, [st, queueTutMark]);

  // Show queued reveals one at a time; finish once both have been shown.
  useEffect(() => {
    if (tutPhase !== "run" || tutMark !== null) return;
    if (tutQueue.length === 0) {
      if (tutSeen.current.interest && tutSeen.current.deal) setTutPhase("done");
      return;
    }
    setTutMark(tutQueue[0]);
    setTutQueue((q) => q.slice(1));
  }, [tutPhase, tutMark, tutQueue]);

  // End the guided intro (either "send the opener" or "I'll write my own").
  const startTutRun = useCallback(() => {
    commitTutDone();
    setTutPhase("run");
  }, [commitTutDone]);
  const sendTutOpener = useCallback(() => {
    handleSend(t.onboarding.suggestedOpening);
    startTutRun();
  }, [t, startTutRun]); // eslint-disable-line react-hooks/exhaustive-deps
  const dismissTutMark = useCallback(() => setTutMark(null), []);
  const skipTutorial = useCallback(() => {
    commitTutDone();
    setTutPhase("off");
    setTutMark(null);
    setTutQueue([]);
  }, [commitTutDone]);

  // Quitting mid-tutorial still counts as "seen" — never re-onboard next game.
  const handleQuit = () => {
    if (ranTutorial.current) commitTutDone();
    onQuit();
  };

  // Resolve the single active coach step (or null). Event reveals take the stage
  // over the linear intro; intro steps carry 3 progress dots, reveals carry none.
  const o = t.onboarding;
  const intro = { steps: 3, skipLabel: o.skip, onSkip: skipTutorial };
  let tutStep: CoachStep | null = null;
  if (tutMark === "interest") {
    tutStep = { stepKey: "m-interest", targetRef: interestsRef, title: o.interestTitle, body: o.interestBody,
      primaryLabel: o.gotIt, onPrimary: dismissTutMark, step: 0, steps: 0, skipLabel: o.skip, onSkip: skipTutorial };
  } else if (tutMark === "deal") {
    tutStep = { stepKey: "m-deal", targetRef: dealRef, title: o.dealTitle, body: o.dealBody,
      primaryLabel: o.gotIt, onPrimary: dismissTutMark, step: 0, steps: 0, skipLabel: o.skip, onSkip: skipTutorial };
  } else if (tutPhase === "welcome") {
    tutStep = { stepKey: "welcome", title: o.welcomeTitle, body: o.welcomeBody,
      primaryLabel: o.next, onPrimary: () => setTutPhase("meters"), step: 1, ...intro };
  } else if (tutPhase === "meters") {
    tutStep = { stepKey: "meters", targetRef: metersRef, title: o.metersTitle, body: o.metersBody,
      primaryLabel: o.next, onPrimary: () => setTutPhase("compose"), step: 2, ...intro };
  } else if (tutPhase === "compose") {
    tutStep = { stepKey: "compose", targetRef: composeRef, title: o.composeTitle, body: o.composeBody,
      primaryLabel: o.orTypeYourself, onPrimary: startTutRun, action: { label: o.sendOpening, onClick: sendTutOpener },
      step: 3, ...intro };
  }

  return (
    <section className="screen">
      {toast ? (
        <div className="toast" role="status">
          🎯 {t.interestToast}
        </div>
      ) : null}
      <div className="wrap">
        <div className="table">
          <aside className="side">
            <div className="opp">
              <div className="face" key={face}>{face}</div>
              <div>
                <div className="nm">{scenario.counterpart_name}</div>
                <div className="ps">{scenario.counterpart_persona}</div>
              </div>
            </div>

            <div ref={dealRef} className="onb-anchor">
              <DealTracker scenario={scenario} state={st} t={t} />
            </div>

            {/* Visible logrolling: the tradeable "package" forming, right under
                the price tracker so the price move and the trade read together.
                Renders only for scenarios that carry secondary issues. */}
            <DealTerms scenario={scenario} state={st} t={t} />

            {st && !exam ? (
              <div ref={metersRef} className="onb-anchor">
                <Meters state={st} labels={t.meters} info={t.meterInfo} deltas={lastDeltas} />
              </div>
            ) : null}

            {iTotal > 0 && !exam ? (
              <div ref={interestsRef} className={`interests-line${flash ? " flash" : ""}`}>
                <span>{t.interests}:</span>
                <span className="pips">
                  {Array.from({ length: iTotal }, (_, i) => (
                    <i className={i < iFound ? "on" : ""} key={i} />
                  ))}
                </span>
                <span>
                  {iFound}/{iTotal}
                </span>
              </div>
            ) : null}

            <div className={`side-more${moreOpen ? " open" : ""}`}>
              <button
                className="side-more-toggle"
                onClick={() => setMoreOpen((o) => !o)}
                aria-expanded={moreOpen}
              >
                <span>📋 {t.moreLabel}</span>
                <span className="chev" aria-hidden="true">▾</span>
              </button>
              <div className="side-more-body">
                <div className="brief">{scenario.briefing}</div>
                <div className="batna">
                  <b>🛡 {t.batna}</b>
                  <span>{scenario.batna}</span>
                </div>
              </div>
            </div>
            <button className="quit" onClick={handleQuit}>
              ← {t.quit}
            </button>
          </aside>

          <main className="chat">
            <div className="ch">
              <div className="turn">
                {t.turn} {st?.turn ?? 0}/{st?.max_turns ?? 12}
                {kind === "mock" ? <span className="conn mock">{t.usingMock}</span> : null}
                {kind === null ? <span className="conn">{t.connecting}</span> : null}
              </div>
            </div>
            <Chat
              log={log}
              metersShort={t.metersShort}
              argLabel={t.argLabel}
              exam={exam}
              coachLabel={t.coachLabel}
              typing={typing}
              typingLabel={t.typingLabel}
            />
            {showFirstCoach ? (
              <div className="firstcoach" role="note">
                <span>{t.firstTurnCoach.replace("{name}", scenario.counterpart_name)}</span>
                <button
                  className="firstcoach-x"
                  onClick={() => setCoachDismissed(true)}
                  aria-label={t.dismiss}
                >
                  ×
                </button>
              </div>
            ) : null}
            <div ref={composeRef} className="onb-anchor">
              <Composer
                disabled={busy || finished || !st}
                placeholder={t.placeholder}
                quickMoves={t.quickMoves}
                onSend={handleSend}
                onHint={onHint}
                hintEnabled={!exam}
                showChips={!exam}
              />
            </div>
          </main>
        </div>
      </div>
      {tutStep ? <Onboarding {...tutStep} /> : null}
    </section>
  );
}
