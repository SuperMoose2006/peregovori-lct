// DeepReview.tsx — «Глубокий разбор» в итогах: кнопка, ход работы агентов, отчёт.
//
// Обычный разбор над этой карточкой не меняется (решение владельца 19.10): это
// отдельная вещь по кнопке. Плашка «оценка модели · не влияет на грейд» стоит в
// шапке всегда — по той же причине, что у карточек камеры: граница между
// посчитанным и наблюдённым видна без чтения текста.
import { useId, useState } from "react";
import type { Strings } from "../i18n";
import type { DeepReview as Report, Lang, ReviewEvidence } from "../types";
import type { ReviewState } from "../api/useNegotiation";
import { Icon } from "./Icon";
import {
  TIMELINE_ROWS, channelCaveats, channelText, confLevel, evidenceLabel, evidenceWhen,
  pct, softValue,
} from "../lib/review";

/** Группы агентов в порядке показа — те же id, что шлёт сервер в прогрессе. */
const AGENT_ORDER = ["confidence", "competency", "thinking", "specificity", "comprehension",
                     "followups", "consistency", "facts", "voice", "face"];

interface Props {
  t: Strings;
  lang: Lang;
  state: ReviewState;
  /** Можно ли запускать, и если нет — почему (офлайн, нет моделей). */
  available: boolean;
  reason: string | null;
  /** Связь есть: без неё «запустить» обещало бы то, чего не будет. */
  online: boolean;
  onRun: () => void;
}

export function DeepReview({ t, lang, state, available, reason, online, onRun }: Props) {
  const r = t.review;
  const headId = useId();
  const running = state.status === "running";
  const failure = state.status === "failed"
    ? (state.code && r.failed[state.code]) || state.message || r.failed.generic
    : null;
  return (
    <section className="obs deep" aria-labelledby={headId} aria-busy={running}>
      <div className="obs-head">
        <h2 id={headId}><Icon name="search" /> {r.title}</h2>
        <span className="obs-badge">{r.badge}</span>
      </div>

      {state.status === "done" && state.report ? (
        <DeepReport t={t} lang={lang} report={state.report} />
      ) : (
        <>
          <p className="deep-lead">{r.lead}</p>
          <p className="deep-privacy">{r.privacy}</p>
          {running ? (
            <Progress t={t} state={state} />
          ) : (
            <div className="deep-go">
              <button type="button" className="btn primary" onClick={onRun}
                      disabled={!available || !online}
                      aria-describedby={!available && reason ? `${headId}-why` : undefined}>
                {failure ? r.retry : r.start}
              </button>
              {available ? <span className="deep-time">{r.duration}</span> : null}
            </div>
          )}
          {failure ? <p className="deep-fail" role="alert">{failure}</p> : null}
          {!available && reason ? <p className="deep-why" id={`${headId}-why`}>{reason}</p> : null}
        </>
      )}
    </section>
  );
}

function Progress({ t, state }: { t: Strings; state: ReviewState }) {
  const r = t.review;
  const value = state.total ? Math.round((state.done / state.total) * 100) : 0;
  return (
    <div className="deep-progress">
      <p aria-live="polite">
        {state.total
          ? r.running.replace("{done}", String(state.done)).replace("{total}", String(state.total))
          : r.starting}
      </p>
      <div className="deep-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100}
           aria-valuenow={value} aria-label={r.title}>
        <i style={{ width: `${value}%` }} />
      </div>
      <ul className="deep-agents">
        {AGENT_ORDER.filter((id) => r.agents[id]).map((id) => (
          <li key={id} className={state.agents.includes(id) ? "done" : undefined}>{r.agents[id]}</li>
        ))}
      </ul>
    </div>
  );
}

function Confidence({ t, value }: { t: Strings; value: number | null }) {
  if (value === null) return null;
  const level = confLevel(value);
  return (
    <span className={`deep-conf ${level}`} title={t.review.confidence.replace("{p}", String(pct(value)))}>
      {t.review.confLevels[level]} · {pct(value)}%
    </span>
  );
}

/** Одна находка: что, когда и цитата. Незнакомый код не рисуется. */
function Evidence({ t, lang, ev }: { t: Strings; lang: Lang; ev: ReviewEvidence }) {
  const label = evidenceLabel(ev, t, lang);
  if (!label && !ev.text) return null;
  const when = evidenceWhen(ev, t);
  // У «шага без объяснения» текст — пометка агента, а не слова игрока: в
  // кавычки её ставить нельзя, это была бы цитата, которой не было.
  const isNote = ev.kind === "unspoken";
  const quote = ev.quote ?? (ev.channel === "content" && !isNote ? ev.text : undefined);
  const note = ev.channel === "content" && (ev.quote || isNote) ? ev.text : ev.note;
  return (
    <li className={`deep-ev ${ev.channel}`}>
      <span className="deep-when">{when}</span>
      <span className="deep-what">
        {label ? <b>{label}</b> : null}
        {ev.kind === "filler" && ev.text ? <q>{ev.text}</q> : null}
        {quote ? <q>{quote}</q> : null}
        {ev.quote_a && typeof ev.turn_a === "number" ? (
          <span className="deep-note">
            {t.review.contradictsTurn.replace("{n}", String(ev.turn_a))}: <q>{ev.quote_a}</q>
          </span>
        ) : null}
        {note ? <span className="deep-note">{note}</span> : null}
        {ev.brief ? <span className="deep-note">{ev.brief}</span> : null}
      </span>
    </li>
  );
}

function DeepReport({ t, lang, report }: { t: Strings; lang: Lang; report: Report }) {
  const r = t.review;
  const [allTimeline, setAllTimeline] = useState(false);
  const comps = [...report.competencies];
  const timeline = allTimeline ? report.timeline : report.timeline.slice(0, TIMELINE_ROWS);
  const failedAgents = report.agents.filter((a) => !a.ok);
  return (
    <div className="deep-report">
      <p className="deep-meta">
        {r.agentsOk.replace("{ok}", String(report.agents_ok)).replace("{total}", String(report.agents_total))}
        {typeof report.took_ms === "number"
          ? ` · ${r.took.replace("{s}", String(Math.max(1, Math.round(report.took_ms / 1000))))}` : ""}
        {failedAgents.length
          ? ` · ${failedAgents.map((a) => r.agents[a.id] ?? a.id).join(", ")} — ${r.agentFailed}` : ""}
      </p>

      <ul className="deep-channels">
        {(["content", "voice", "video"] as const).map((name) => {
          const ch = report.channels[name];
          const absent = !ch || ch.state === "absent" || ch.state === "failed";
          return (
            <li key={name} className={absent ? "off" : undefined}>
              <b>{r.channels[name]}</b>
              <span>{channelText(name, ch, t, lang)}</span>
              {channelCaveats(ch, t).map((c) => <span key={c} className="deep-caveat">{c}</span>)}
            </li>
          );
        })}
      </ul>

      {comps.length ? (
        <>
          <h3>{r.competencies}</h3>
          <ul className="deep-comps">
            {comps.map((c) => (
              <li key={c.id}>
                <details>
                  <summary>
                    <span className="deep-name">{r.competencyNames[c.id] ?? c.id}</span>
                    <span className="deep-meter" aria-hidden="true"><i style={{ width: `${pct(c.score)}%` }} /></span>
                    <span className="deep-val">{pct(c.score)}%</span>
                    <Confidence t={t} value={c.confidence} />
                  </summary>
                  {c.engine !== null && c.engine_agrees !== null ? (
                    <p className={`deep-cross ${c.engine_agrees ? "agree" : "differ"}`}>
                      {(c.engine_agrees ? r.engineAgrees : r.engineDiffers).replace("{v}", `${pct(c.engine)}%`)}
                    </p>
                  ) : null}
                  {c.pro.length ? (
                    <><p className="deep-sub good">{r.pro}</p>
                      <ul className="deep-evs">{c.pro.map((ev, i) => <Evidence key={i} t={t} lang={lang} ev={ev} />)}</ul></>
                  ) : null}
                  {c.con.length ? (
                    <><p className="deep-sub bad">{r.con}</p>
                      <ul className="deep-evs">{c.con.map((ev, i) => <Evidence key={i} t={t} lang={lang} ev={ev} />)}</ul></>
                  ) : null}
                </details>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h3>{r.soft}</h3>
      <ul className="deep-soft">
        {report.soft.map((item) => {
          const { value, detail } = softValue(item, t, lang);
          return (
            <li key={item.id} className={item.value === null ? "none" : undefined}>
              <div className="deep-soft-head">
                <span className="deep-name">{r.softNames[item.id] ?? item.id}</span>
                <span className="deep-val">{value}</span>
                <Confidence t={t} value={item.confidence} />
              </div>
              <p className="deep-hint">
                {r.softHints[item.id]}{detail ? ` · ${detail}` : ""}
                {item.id === "declaration" && typeof item.questions === "number"
                  ? ` · ${r.questionsAsked.replace("{n}", String(item.questions))}` : ""}
                {item.id === "facts" && item.unchecked
                  ? ` · ${r.unchecked.replace("{n}", String(item.unchecked))}` : ""}
              </p>
              {item.examples.length ? (
                <ul className="deep-evs">{item.examples.map((ev, i) => <Evidence key={i} t={t} lang={lang} ev={ev} />)}</ul>
              ) : null}
            </li>
          );
        })}
      </ul>

      <h3>{r.convergences}</h3>
      {report.convergences.length ? (
        <>
          <p className="deep-hint">{r.convergencesLead}</p>
          <ul className="deep-conv">
            {report.convergences.map((c, i) => (
              <li key={i}>
                <span className="deep-when">
                  {evidenceWhen(c, t)}{c.tight ? <i className="deep-tight">{r.tight}</i> : null}
                </span>
                <ul className="deep-evs">{c.signals.map((ev, k) => <Evidence key={k} t={t} lang={lang} ev={ev} />)}</ul>
              </li>
            ))}
          </ul>
        </>
      ) : <p className="deep-hint">{r.noConvergences}</p>}

      {report.voice && report.voice.turns.length ? (
        <>
          <h3>{r.voice}</h3>
          <ul className="deep-voice">
            {report.voice.turns.map((v) => (
              <li key={v.turn}>
                <span className="deep-when">{r.turn.replace("{n}", String(v.turn))}</span>
                <span>
                  {[v.wpm !== null && r.voiceTurn.wpm.replace("{n}", String(v.wpm)),
                    r.voiceTurn.pauses.replace("{n}", String(v.pauses)),
                    v.longest_pause_ms && r.voiceTurn.longest.replace("{s}",
                      (Math.round(v.longest_pause_ms / 100) / 10).toFixed(1).replace(".", lang === "ru" ? "," : ".")),
                    v.pitch_jumps > 0 && r.voiceTurn.jumps.replace("{n}", String(v.pitch_jumps)),
                    v.fading && r.voiceTurn.fading].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {report.face && report.face.frames > 0 ? (
        <>
          <h3>{r.face}</h3>
          <p className="deep-hint">
            {r.faceTense.replace("{n}", String(report.face.tense_frames)).replace("{m}", String(report.face.frames))}
          </p>
          <ul className="deep-cues">
            {Object.entries(report.face.cues).filter(([code]) => r.cues[code]).sort((a, b) => b[1] - a[1])
              .map(([code, n]) => <li key={code}>{r.cues[code]} <b>{n}</b></li>)}
          </ul>
        </>
      ) : null}

      {report.timeline.length ? (
        <>
          <h3>{r.timeline}</h3>
          <ul className="deep-evs deep-timeline">
            {timeline.map((ev, i) => <Evidence key={i} t={t} lang={lang} ev={ev} />)}
          </ul>
          {report.timeline.length > TIMELINE_ROWS ? (
            <button type="button" className="btn ghost deep-more" aria-expanded={allTimeline}
                    onClick={() => setAllTimeline((v) => !v)}>
              {allTimeline ? r.less : r.more.replace("{n}", String(report.timeline.length))}
            </button>
          ) : null}
        </>
      ) : null}

      {report.dropped_quotes > 0 ? (
        <p className="deep-hint">{r.dropped.replace("{n}", String(report.dropped_quotes))}</p>
      ) : null}
    </div>
  );
}
