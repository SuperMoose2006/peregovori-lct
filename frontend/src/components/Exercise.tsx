// Exercise.tsx — один пункт курса: показать задание, принять ответ, вынести
// вердикт и объяснить.
//
// ПРАВИЛО ЭКРАНА: объяснение показывается ВСЕГДА — и когда верно, и когда нет.
// Duolingo-подобный тренажёр без разбора превращается в лотерею: человек
// угадывает и не понимает, что именно сработало.
//
// Вердикт считает `lib/course.ts` тем же движком, что и партия. Здесь нет ни
// одной собственной оценки — компонент только собирает ответ и рисует итог.
import { useMemo, useState } from "react";
import type { Strings } from "../i18n";
import type { Lang } from "../types";
import type { Exercise as Ex, ItemWithId, L } from "../lib/courseTypes";
import { check, metersOptions, reactionOptions, type Verdict } from "../lib/course";
import { previewChips } from "../lib/techniques";
import { haptic, play } from "../lib/sound";

interface Props {
  t: Strings;
  lang: Lang;
  ex: Ex;
  /** В экзамене разбор откладывается до конца, а подсказки выключены. */
  exam?: boolean;
  onDone: (correct: boolean, verdict: Verdict) => void;
  /** Капстоун открывается настоящей партией — её запускает родитель. */
  onStartDrill?: (ex: Ex) => void;
}

const say = (v: L | undefined, lang: Lang) => (v ? v[lang] : "");

export function Exercise({ t, lang, ex, exam, onDone, onStartDrill }: Props) {
  const [picked, setPicked] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [num, setNum] = useState("");
  const [order, setOrder] = useState<string[]>(() => (ex.items ?? []).map((i) => i.id));
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [activeLeft, setActiveLeft] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const chips = useMemo(
    () => (ex.type === "freeform" && !exam ? previewChips(text) : []),
    [ex.type, exam, text],
  );

  const answer = (): unknown => {
    switch (ex.type) {
      case "choice": case "spot_error": return picked;
      case "order": return order;
      case "match": return pairs;
      case "numeric": return num.trim() === "" ? null : parseFloat(num.replace(",", "."));
      case "freeform": return text;
      case "reaction": case "meters": return pick;
      default: return null;
    }
  };

  const ready = (): boolean => {
    switch (ex.type) {
      case "choice": case "spot_error": return picked !== null;
      case "numeric": return num.trim() !== "";
      case "freeform": return text.trim().length > 0;
      case "reaction": case "meters": return pick !== null;
      case "match": return Object.keys(pairs).length === (ex.left?.length ?? 0);
      default: return true;
    }
  };

  const submit = () => {
    if (verdict) return;
    const v = check(ex, answer(), lang);
    setVerdict(v);
    // Звук — часть обратной связи, а не украшение: он приходит раньше, чем глаз
    // находит цветную рамку. Глушится общим переключателем, как всё остальное.
    play(v.ok ? "correct" : "wrong");
    haptic(v.ok ? 12 : 22);
    onDone(v.ok, v);
  };

  const move = (i: number, d: number) => {
    const next = [...order];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };

  const locked = verdict !== null;

  return (
    <div className={`ex ex--${ex.type}${locked ? (verdict!.ok ? " ok" : " bad") : ""}`}>
      <div className="ex-kind">{t.course.types[ex.type]}</div>
      <p className="ex-prompt">{say(ex.prompt, lang)}</p>

      {ex.bad_line ? <blockquote className="ex-quote">«{say(ex.bad_line, lang)}»</blockquote> : null}
      {ex.opponent_line ? <blockquote className="ex-quote">«{say(ex.opponent_line, lang)}»</blockquote> : null}
      {ex.type === "reaction" && ex.player_line ? (
        <blockquote className="ex-quote mine">«{say(ex.player_line, lang)}»</blockquote>
      ) : null}
      {ex.type === "meters" ? (
        <>
          <div className="ex-state">
            {(["trust", "tension", "info", "leverage"] as const).map((k) => (
              <span key={k}><b>{t.course.meters[k]}</b> {ex.state?.[k]}</span>
            ))}
          </div>
          <blockquote className="ex-quote mine">«{say(ex.player_line, lang)}»</blockquote>
        </>
      ) : null}

      {/* ---- варианты ---- */}
      {(ex.type === "choice" || ex.type === "spot_error") ? (
        <ul className="ex-opts">
          {(ex.options ?? []).map((o, i) => {
            const right = locked && i === ex.answer;
            const wrong = locked && i === picked && i !== ex.answer;
            return (
              <li key={i}>
                <button
                  className={`ex-opt${picked === i ? " on" : ""}${right ? " right" : ""}${wrong ? " wrong" : ""}`}
                  onClick={() => !locked && setPicked(i)}
                  disabled={locked}
                >
                  {say(o as L, lang)}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {(ex.type === "reaction" || ex.type === "meters") ? (
        <ul className="ex-opts row">
          {(ex.type === "reaction" ? reactionOptions(ex) : metersOptions(ex)).map((o) => {
            const label = ex.type === "reaction"
              ? t.course.reactions[o as keyof Strings["course"]["reactions"]]
              : (t.course.meters as Record<string, string>)[o] ?? o;
            const right = locked && o === ex.answer;
            const wrong = locked && o === pick && o !== ex.answer;
            return (
              <li key={o}>
                <button
                  className={`ex-opt${pick === o ? " on" : ""}${right ? " right" : ""}${wrong ? " wrong" : ""}`}
                  onClick={() => !locked && setPick(o)}
                  disabled={locked}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {ex.type === "order" ? (
        <ol className="ex-order">
          {order.map((id, i) => {
            const item = (ex.items ?? []).find((x) => x.id === id) as ItemWithId;
            const right = locked && (ex.answer as string[])[i] === id;
            return (
              <li key={id} className={locked ? (right ? "right" : "wrong") : ""}>
                <span className="ex-ord-n">{i + 1}</span>
                <span className="ex-ord-t">{say(item, lang)}</span>
                <span className="ex-ord-btns">
                  <button onClick={() => !locked && move(i, -1)} disabled={locked || i === 0} aria-label="↑">↑</button>
                  <button onClick={() => !locked && move(i, 1)} disabled={locked || i === order.length - 1} aria-label="↓">↓</button>
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}

      {ex.type === "match" ? (
        <>
        <p className="ex-hint">{t.course.matchHint}</p>
        <div className="ex-match">
          <ul>
            {(ex.left ?? []).map((l) => (
              <li key={l.id}>
                <button
                  className={`ex-opt${activeLeft === l.id ? " on" : ""}${pairs[l.id] ? " tied" : ""}${
                    locked ? ((ex.answer as Record<string, string>)[l.id] === pairs[l.id] ? " right" : " wrong") : ""}`}
                  onClick={() => !locked && setActiveLeft(l.id)}
                  disabled={locked}
                >
                  {say(l, lang)}
                  {pairs[l.id] ? (
                    <em>→ {say((ex.right ?? []).find((r) => r.id === pairs[l.id]), lang)}</em>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          <ul>
            {(ex.right ?? []).map((r) => (
              <li key={r.id}>
                <button
                  className="ex-opt"
                  disabled={locked || !activeLeft}
                  onClick={() => {
                    if (!activeLeft) return;
                    setPairs((p) => ({ ...p, [activeLeft]: r.id }));
                    setActiveLeft(null);
                  }}
                >
                  {say(r, lang)}
                </button>
              </li>
            ))}
          </ul>
        </div>
        </>
      ) : null}

      {ex.type === "numeric" ? (
        <div className="ex-num">
          <input
            inputMode="decimal"
            value={num}
            onChange={(e) => setNum(e.target.value)}
            disabled={locked}
            placeholder="0"
            aria-label={say(ex.prompt, lang)}
          />
          <span>{say(ex.unit, lang)}</span>
        </div>
      ) : null}

      {ex.type === "freeform" ? (
        <div className="ex-free">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={locked}
            rows={3}
            placeholder={t.course.freeformHint}
          />
          {chips.length ? (
            <div className="ex-chips">
              {chips.map((c, i) => <span key={i} className={`tag ${c.key}`}>{c.label}</span>)}
            </div>
          ) : null}
        </div>
      ) : null}

      {ex.type === "drill" ? (
        <div className="ex-drill">
          <p className="ex-goal">🏁 {say(ex.goal, lang)}</p>
          <p className="ex-goal-n">{t.course.drillNote.replace("{n}", String(ex.max_turns ?? 6))}</p>
          <button className="btn primary" onClick={() => onStartDrill?.(ex)}>{t.course.drillStart}</button>
        </div>
      ) : null}

      {/* ---- итог ---- */}
      {ex.type !== "drill" ? (
        locked ? (
          <div className={`ex-verdict ${verdict!.ok ? "ok" : "bad"}`}>
            <b>{verdict!.ok ? t.course.correct : t.course.wrong}</b>
            {!verdict!.ok && verdict!.reasons.length ? (
              <ul className="ex-why">
                {verdict!.reasons.map((r) => <li key={r}>{reasonLabel(t, r)}</li>)}
              </ul>
            ) : null}
            {!exam ? (
              <>
                <p className="ex-explain">{say(ex.explain, lang)}</p>
                {ex.reference && ex.type === "freeform" ? (
                  <p className="ex-ref"><b>{t.course.reference}:</b> «{say(ex.reference, lang)}»</p>
                ) : null}
              </>
            ) : null}
          </div>
        ) : (
          <button className="btn primary ex-go" onClick={submit} disabled={!ready()}>
            {t.course.checkIt}
          </button>
        )
      ) : null}
    </div>
  );
}

/** Причина отказа — закрытый словарь ключей, а не сырой текст движка. */
function reasonLabel(t: Strings, reason: string): string {
  const [kind, arg] = reason.split(":");
  const moveName = (m: string) => (t.course.moves as Record<string, string>)[m] ?? m;
  switch (kind) {
    case "missing": return t.course.why.missing.replace("{move}", moveName(arg));
    case "missing_any": return t.course.why.missingAny.replace("{moves}", arg.split("|").map(moveName).join(" / "));
    case "forbidden": return t.course.why.forbidden.replace("{move}", moveName(arg));
    case "missing_term": return t.course.why.missingTerm;
    case "too_short": return t.course.why.tooShort;
    case "weak_argument": return t.course.why.weak;
    case "no_number": return t.course.why.noNumber;
    default: return t.course.why.generic;
  }
}
