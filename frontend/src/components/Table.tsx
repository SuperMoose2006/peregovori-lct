// Table.tsx — the negotiation screen. Left: counterpart card, offers board,
// live meters, briefing, BATNA, interests tracker. Right: chat log + composer.
import type { Mode, ScenarioView, StateView } from "../types";
import type { TransportKind } from "../api/transport";
import type { ChatEntry } from "../api/useNegotiation";
import type { Strings } from "../i18n";
import { Meters } from "./Meters";
import { Chat } from "./Chat";
import { Composer } from "./Composer";

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

export function Table({ t, mode, kind, scenario, state, log, busy, onSend, onHint, onQuit }: Props) {
  const unit = scenario.headline_unit;
  const st = state;
  const finished = !!st && st.status !== "active";
  const iFound = st?.interests_found ?? 0;
  const iTotal = st?.interests_total ?? 0;

  return (
    <section className="screen">
      <div className="wrap">
        <div className="table">
          <aside className="side">
            <div className="opp">
              <div className="face">{scenario.icon}</div>
              <div>
                <div className="nm">{scenario.counterpart_name}</div>
                <div className="ps">{scenario.counterpart_persona}</div>
              </div>
            </div>

            <div className="offers">
              <div className="ob">
                <div className="l">{t.theirOffer}</div>
                <div className="v">{st ? st.offer_opp + unit : "—"}</div>
              </div>
              <div className="ar">⇄</div>
              <div className="ob">
                <div className="l">{t.yourTarget}</div>
                <div className="v tg">{scenario.target + unit}</div>
              </div>
            </div>

            {st ? <Meters state={st} labels={t.meters} /> : null}

            {iTotal > 0 ? (
              <div className="interests-line">
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
            <Chat log={log} metersShort={t.metersShort} argLabel={t.argLabel} />
            <Composer
              disabled={busy || finished || !st}
              placeholder={t.placeholder}
              quickMoves={t.quickMoves}
              onSend={onSend}
              onHint={onHint}
              hintEnabled={mode !== "exam"}
            />
          </main>
        </div>
      </div>
    </section>
  );
}
