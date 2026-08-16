// Table.tsx — the negotiation screen. Left: counterpart card, offers board,
// live meters, briefing, BATNA, interests tracker. Right: chat log + composer.
import { useEffect, useRef, useState } from "react";
import type { Deltas, Mode, ScenarioView, StateView } from "../types";
import type { TransportKind } from "../api/transport";
import type { ChatEntry } from "../api/useNegotiation";
import type { Strings } from "../i18n";
import { Meters } from "./Meters";
import { Chat } from "./Chat";
import { Composer } from "./Composer";
import { DealTracker } from "./DealTracker";

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

  // First-90-seconds hook: a one-time, dismissible coach bubble nudging the new
  // player to open with a question. Shown only on turn 0 (before any send) and
  // never in exam (which withholds help). Dismissed on × or the first send.
  const [coachDismissed, setCoachDismissed] = useState(false);
  const showFirstCoach = !exam && !!st && st.turn === 0 && !coachDismissed;
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
    setFlash(true);
    setToast(true);
    const t1 = setTimeout(() => setFlash(false), 900);
    const t2 = setTimeout(() => setToast(false), 2600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [iFound, exam]);

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

            <DealTracker scenario={scenario} state={st} t={t} />

            {st && !exam ? (
              <Meters state={st} labels={t.meters} info={t.meterInfo} deltas={lastDeltas} />
            ) : null}

            {iTotal > 0 && !exam ? (
              <div className={`interests-line${flash ? " flash" : ""}`}>
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

            <div className="brief">{scenario.briefing}</div>
            <div className="batna">
              <b>🛡 {t.batna}</b>
              <span>{scenario.batna}</span>
            </div>
            <button className="quit" onClick={onQuit}>
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
            <Composer
              disabled={busy || finished || !st}
              placeholder={t.placeholder}
              quickMoves={t.quickMoves}
              onSend={handleSend}
              onHint={onHint}
              hintEnabled={!exam}
              showChips={!exam}
            />
          </main>
        </div>
      </div>
    </section>
  );
}
