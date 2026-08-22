// Table.tsx — the negotiation screen. Left: counterpart card, offers board,
// live meters, briefing, BATNA, interests tracker. Right: chat log + composer.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Analysis, Deltas, Lang, Mode, ScenarioView, StateView } from "../types";
import type { TransportKind } from "../api/transport";
import type { ChatEntry } from "../api/useNegotiation";
import type { Strings } from "../i18n";
import { isTutorialDone, markTutorialDone, shouldRunTutorial } from "../lib/progress";
import { teachingPlaceholder, formatDeal } from "../lib/format";
import { haptic, play } from "../lib/sound";
import { Avatar, avatarMood } from "./Avatar";
import { ScreenHeading } from "./ScreenHeading";
import { Meters } from "./Meters";
import { Scorecard } from "./Scorecard";
import { Chat } from "./Chat";
import { Composer } from "./Composer";
import { DealTracker } from "./DealTracker";
import { DealTerms } from "./DealTerms";
import { Onboarding, type CoachStep } from "./Onboarding";

interface Props {
  t: Strings;
  lang: Lang;
  mode: Mode;
  kind: TransportKind | null;
  scenario: ScenarioView;
  state: StateView | null;
  log: ChatEntry[];
  busy: boolean;
  // Which half of the wait we're in; null when the server never said (mock,
  // judge disabled). See NegotiationState.phase.
  phase?: "judging" | "replying" | null;
  // Whether the live semantic judge scored this session (drives the "graded by
  // meaning" badge on coach lines). False offline/mock — nothing to claim.
  judgeActive: boolean;
  onSend: (text: string) => void;
  onHint: () => void;
  onQuit: () => void;
  // The negotiation's last beat. When the table closes we hold here for a moment
  // instead of swapping straight to the scorecard: the handshake (or the walk-out)
  // IS the climax, and the hold also covers the AI mentor still composing its
  // closing word. `debriefReady` false → the button waits and says so.
  debriefReady?: boolean;
  onSeeDebrief?: () => void;
  // "Read her face" layer: a running "n of m" and the answer callback. Both
  // absent when the layer is off, and the chat then renders no question at all.
  probeTally?: string;
  onProbeAnswer?: (id: number, choice: number) => void;
}

export function Table({ t, lang, mode, kind, scenario, state, log, busy, phase, judgeActive, onSend, onHint, onQuit, debriefReady, onSeeDebrief, probeTally, onProbeAnswer }: Props) {
  // The coach's worked example travels from a hint bubble down into the
  // composer. A monotonic nonce (not the text) is what makes re-tapping the
  // same suggestion refill the box after the player edited it away.
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | undefined>(undefined);
  const prefillNonce = useRef(1);
  // On a phone the rail stacks above the chat, so the closing strip mounts far
  // below the fold — the climax of the negotiation rendered where nobody was
  // looking, and the hold expires before they find it. Bring it into view.
  const outcomeRef = useRef<HTMLDivElement | null>(null);
  // Focus follows the question: opening one disables the composer under the
  // player's cursor, which would otherwise drop focus to <body> mid-turn. When
  // it resolves, focus goes back to the composer so typing continues naturally.
  const probeEls = useRef(new Map<number, HTMLDivElement>());
  const focusedProbe = useRef<number | null>(null);
  const registerProbe = useCallback((id: number, el: HTMLDivElement | null) => {
    if (el) probeEls.current.set(id, el);
    else probeEls.current.delete(id);
  }, []);
  const st = state;
  const finished = !!st && st.status !== "active";
  // An unanswered question blocks the composer (but never the transcript): the
  // player has to commit to a reading before the negotiation moves on.
  const probeOpen = log.some((e) => e.kind === "probe" && e.picked === undefined);
  useEffect(() => {
    if (!finished) return;
    outcomeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [finished]);

  const openProbeId = (() => {
    for (let i = log.length - 1; i >= 0; i--) {
      const e = log[i];
      if (e.kind === "probe") return e.picked === undefined ? e.id : null;
    }
    return null;
  })();
  useEffect(() => {
    if (openProbeId != null) {
      probeEls.current.get(openProbeId)?.focus({ preventScroll: false });
      focusedProbe.current = openProbeId;
    } else if (focusedProbe.current != null) {
      focusedProbe.current = null;
      composeRef.current?.querySelector("textarea")?.focus({ preventScroll: true });
    }
  }, [openProbeId]);

  const iFound = st?.interests_found ?? 0;
  const iTotal = st?.interests_total ?? 0;
  // Exam is an assessment: all live coaching feedback (meters, interests tracker,
  // technique chips/badges, meter deltas, hint) is withheld until the debrief.
  const exam = mode === "exam";

  // Turn 0 leaves a tall empty log. Exam withholds all coaching, so it keeps the
  // bare table; everywhere else the void carries the scene and three real first
  // lines — the point where a first-timer decides whether they know what to do.
  const showOpening = !exam && !!st && st.turn === 0;
  const unit = scenario.headline_unit;
  const openingCard = showOpening ? (
    <div className="opening" role="note">
      <h3>{t.opening.title}</h3>
      <p className="op-scene">
        {t.opening.scene
          .replace("{role}", scenario.role)
          .replace("{name}", scenario.counterpart_name)
          .replace("{offer}", formatDeal(st!.offer_opp, unit, lang))
          .replace("{target}", formatDeal(scenario.target, unit, lang))
          .replace("{red}", formatDeal(scenario.reservation, unit, lang))}
      </p>
      <p className="op-hint">{t.opening.hint}</p>
      <div className="op-lines">
        {t.opening.lines.map((l, i) => (
          <button
            key={i}
            type="button"
            className="op-line"
            // Fills the composer, never sends: the move stays the player's and
            // gets judged like anything they type themselves.
            onClick={() => setPrefill({ text: l.text, nonce: prefillNonce.current++ })}
          >
            <span className="op-tag">{l.tag}</span>
            <span className="op-text">{l.text}</span>
          </button>
        ))}
      </div>
    </div>
  ) : null;

  // Teaching placeholder: nudge a concrete technique for the opening turns, then
  // settle to the neutral prompt. Withheld in exam (no live coaching there).
  const placeholder = exam ? t.placeholder : teachingPlaceholder(st?.turn ?? 0, t.placeholder, t.placeholderNudges);
  // Latest turn's deltas (for the meter pulse cue) — read off the most recent
  // player line in the log. Never used in exam (meters are hidden there anyway).
  // Latest turn's deltas + analysis feed both the meter pulse and the rubric
  // scorecard (item 2) — both read off the most recent classified player line.
  let lastDeltas: Deltas | null = null;
  let lastAnalysis: Analysis | null = null;
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.kind === "me" && e.deltas) {
      lastDeltas = e.deltas;
      lastAnalysis = e.analysis ?? null;
      break;
    }
  }
  // The counterpart's face reflects their live mood — driven only by the
  // deterministic meters (trust/tension), another read on the same honest state.
  // In exam the meters are hidden, so `avatarMood` returns a fixed neutral (the
  // expression must never leak the withheld signal).
  const mood = avatarMood(st, exam);

  // Typing indicator: show while a turn is in flight (busy) but the opponent's
  // reply hasn't begun. Once opponent_delta pushes a streaming "opp" bubble it
  // becomes the last entry, so the indicator yields to the live reply. Cleared
  // automatically when busy drops (opponent/error/debrief all reset it), and
  // never shown after the game is finished.
  const lastEntry = log[log.length - 1];
  // The judge's pass and the opponent's reply are both "busy", but they are
  // different waits and only the second one is anybody typing — see `phase`.
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
        {/* Screen-reader heading + focus target for the game screen (visually the
            counterpart card carries the identity, so this stays sr-only). */}
        <ScreenHeading as="h2" className="sr-only">
          {t.a11y.gameHeading.replace("{name}", scenario.counterpart_name)}
        </ScreenHeading>
        <div className="table">
          <aside className="side">
            {/* While a "read her face" question is open the portrait becomes the
                main object on screen — this is the one beat that justifies the
                parametric expressions, which otherwise work almost unnoticed. */}
            <div className={`opp${probeOpen ? " reading" : ""}`}>
              {probeOpen ? <div className="opp-cue">{t.probe.readFace}</div> : null}
              <div className="face">
                <Avatar scenarioId={scenario.id} mood={mood} label={scenario.counterpart_name} />
              </div>
              <div>
                <div className="nm">{scenario.counterpart_name}</div>
                <div className="ps">{scenario.counterpart_persona}</div>
              </div>
            </div>

            <div ref={dealRef} className="onb-anchor">
              <DealTracker scenario={scenario} state={st} t={t} lang={lang} />
            </div>

            {/* Visible logrolling: the tradeable "package" forming, right under
                the price tracker so the price move and the trade read together.
                Renders only for scenarios that carry secondary issues. */}
            <DealTerms scenario={scenario} state={st} t={t} />

            {st && !exam ? (
              <div ref={metersRef} className="onb-anchor">
                <Meters state={st} labels={t.meters} info={t.meterInfo} deltas={lastDeltas} />
                <Scorecard analysis={lastAnalysis} deltas={lastDeltas} labels={t.scorecard} />
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
              {/* The game skin turns the turn counter into a spent-budget bar:
                  the same honest framing (budget, not countdown), but visible at
                  a glance from the back of a room. */}
              {st ? (
                <div className="turnbar" aria-hidden="true">
                  <i style={{ width: `${Math.round(((st.turn ?? 0) / Math.max(1, st.max_turns)) * 100)}%` }} />
                </div>
              ) : null}
              <div className="turn">
                {/* Budget, not a countdown: before the first move show the turn
                    BUDGET ("12 ходов"); once play starts show "ход {n} из {max}"
                    — never "ход 0/12", which reads like a countdown-to-failure. */}
                {(st?.turn ?? 0) < 1
                  ? t.turnBudget.replace("{n}", String(st?.max_turns ?? 12))
                  : t.turnOf
                      .replace("{n}", String(st?.turn ?? 0))
                      .replace("{max}", String(st?.max_turns ?? 12))}
                {kind === "mock" ? <span className="conn mock">{t.usingMock}</span> : null}
                {kind === null ? <span className="conn">{t.connecting}</span> : null}
              </div>
            </div>
            <Chat
              onUseLine={(text) => setPrefill({ text, nonce: prefillNonce.current++ })}
              useLineLabel={t.useLine}
              log={log}
              metersShort={t.metersShort}
              metersFull={t.meters}
              deltaAria={t.a11y.delta}
              logLabel={t.a11y.chatLog}
              argLabel={t.argLabel}
              exam={exam}
              coachLabel={t.coachLabel}
              judgeActive={judgeActive}
              judgeBadge={t.judgeBadge}
              judgeReject={t.judgeReject}
              typing={typing}
              tagLabels={t.tagLabels}
              typingLabel={phase === "judging" ? t.judgingLabel : t.typingLabel}
              typingJudging={phase === "judging"}
              opening={showOpening ? openingCard : undefined}
              hintPendingLabel={t.hintPending}
              probeLabels={t.probe}
              probeTally={probeTally}
              registerProbe={registerProbe}
              probeMeters={
                st ? (
                  <>
                    {([["trust", st.trust], ["tension", st.tension],
                       ["info", st.info], ["leverage", st.leverage]] as const).map(([k, v]) => (
                      <span className="pm" key={k}>
                        <b>{t.metersShort[k]}</b>
                        <i className="pm-bar"><i className={`pm-fill ${k}`} style={{ width: `${v}%` }} /></i>
                        <u>{v}</u>
                      </span>
                    ))}
                  </>
                ) : undefined
              }
              onProbeAnswer={onProbeAnswer}
            />
            {showFirstCoach ? (
              <div className="firstcoach" role="note">
                <span>{t.firstTurnCoach}</span>
                <button
                  className="firstcoach-x"
                  onClick={() => setCoachDismissed(true)}
                  aria-label={t.dismiss}
                >
                  ×
                </button>
              </div>
            ) : null}
            {finished && onSeeDebrief ? (
              <div className={`outcome ${st!.status}`} role="status" ref={outcomeRef}>
                <div className="oc-stamp">
                  <span className="oc-mark" aria-hidden="true">
                    {st!.status === "agreement" ? "🤝" : "🚪"}
                  </span>
                  <span className="oc-title">
                    {st!.status === "agreement" ? t.outcome.agreement : t.outcome.breakdown}
                  </span>
                  {/* The settled price, never `offer_opp` — the deal closes at
                      the meeting point, so offer_opp would contradict the
                      opponent's own closing line by a rouble or two. */}
                  {st!.status === "agreement" && st!.deal != null ? (
                    <span className="oc-price">
                      {st!.deal}
                      {scenario.headline_unit}
                    </span>
                  ) : null}
                </div>
                <button className="primary oc-go" onClick={onSeeDebrief} disabled={!debriefReady}>
                  {debriefReady ? t.outcome.see : t.outcome.preparing}
                </button>
              </div>
            ) : null}
            <div ref={composeRef} className="onb-anchor" hidden={finished && !!onSeeDebrief}>
              <Composer
                disabled={busy || finished || probeOpen || !st}
                blocked={probeOpen}
                placeholder={probeOpen ? t.probe.blocked : placeholder}
                quickMoves={t.quickMoves}
                onSend={handleSend}
                onHint={onHint}
                hintEnabled={!exam}
                showChips={!exam}
                limitNote={t.composerLimit}
                // Turn-1 only opener (before any move): a one-tap interest probe
                // that pre-fills the box. Withheld in exam (no live help there).
                suggestion={!exam && !!st && st.turn === 0 ? t.suggestChip : undefined}
                prefill={prefill}
              />
            </div>
          </main>
        </div>
      </div>
      {tutStep ? <Onboarding {...tutStep} /> : null}
    </section>
  );
}
