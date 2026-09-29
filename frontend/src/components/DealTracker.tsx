// DealTracker.tsx — the headline deal visualization, drawn from the PLAYER's
// perspective. A horizontal scale marks YOUR target and YOUR red line
// (reservation), their opening price, and animates their current offer (and
// your last offer) along it each turn. Below it, a legend names every mark, and
// one line of text says where their price has gone since the opening.
//
// HONESTY: the opponent's hidden floor (reservation price) is NEVER sent to the
// client and is NEVER shown or inferred here. Every mark uses only client-known
// values: scenario.target, scenario.reservation, the first offer_opp we saw
// (their opening), the current offer_opp, and offer_player. The shaded band is
// purely the PLAYER's own acceptable range (target → red line) — and the legend
// says so, because a newcomer read it as "the range the other side accepts".
//
// ЧТО БЫЛО НЕПОНЯТНО И КАК ЭТО РАЗВЕДЕНО (разбор первого захода):
//   · одним зелёным были покрашены три разные вещи — цель, свой коридор и метка
//     «старт» (у неё был класс `opening`, тот же, что у карточки «Стол накрыт»,
//     и она рисовалась карточкой с зелёной кромкой ЗА краем шкалы). Теперь у
//     каждой метки свой цвет И своя форма, а класс метки — `start`;
//   · «красная линия» не говорила, чья она. Теперь — «ваша», везде;
//   · их цена за вашей красной линией выглядела ошибкой. Теперь строка под
//     шапкой говорит, что это значит и что делать (`priceStanding`);
//   · график, который «всё время снижался», был без подписи, и что он значит,
//     понять было нельзя. Он заменён строкой: «откуда → куда» и что это значит
//     для вас (`priceTrail`). Две цифры и направление однозначнее линии.
//
// ЛЕГЕНДА РАСКРЫТА, ПОКА ЧЕЛОВЕК НОВИЧОК. Шесть строк легенды — это ответ на
// вопрос «что здесь что», и нужен он в первой партии. Дальше она свёрнута под
// заголовок и открывается одним нажатием: иначе она навсегда отодвигала бы
// ниже сгиба рельса темы скрытых интересов, ради которых там всё и расставлено
// (см. Table.tsx). Решает `legendOpen`, стол передаёт «вводная ещё не пройдена».
import { useEffect, useRef, useState } from "react";
import type { Lang, ScenarioView, StateView } from "../types";
import type { Strings } from "../i18n";
import { formatDeal } from "../lib/format";

interface Props {
  scenario: ScenarioView;
  state: StateView | null;
  t: Strings;
  lang: Lang;
  /** Легенда раскрыта с порога. По умолчанию — да: не знаешь, кто смотрит. */
  legendOpen?: boolean;
  /** Строка «что это значит и что делать» — совет, а на экзамене советов нет:
   *  всё живое сопровождение там молчит до разбора. Шкала и легенда — факты,
   *  они остаются. */
  coaching?: boolean;
}

/** Где их цена относительно ВАШИХ границ. */
export type PriceStanding = "beyond" | "zone" | "target" | "settled";

/**
 * Одна строка «что это значит» над шкалой — чистая функция от целей игрока и
 * цены на столе. Скрытая граница второй стороны здесь не участвует и
 * участвовать не может: её у клиента нет.
 *
 * Направление выводится из самих целей (цель ниже красной линии — игрок хочет
 * меньшее число), как и у шкалы: отдельного флага движок для этого не шлёт.
 * Ровно на красной линии — ещё «коридор»: это худшая цена, на которую игрок
 * СОГЛАСЕН, а не та, на которую уже нельзя.
 */
export function priceStanding(target: number, redline: number, current: number, settled: number | null): PriceStanding {
  if (settled != null) return "settled";
  const lowerIsBetter = target < redline;
  const atLeast = (v: number, mark: number) => (lowerIsBetter ? v <= mark : v >= mark);
  if (atLeast(current, target)) return "target";
  if (atLeast(current, redline)) return "zone";
  return "beyond";
}

/** Куда шла их цена за партию — для строки под шкалой. Чистая функция. */
export function priceTrail(hist: number[], lowerIsBetter: boolean): "moved" | "away" | "flat" {
  if (hist.length < 2) return "flat";
  const d = hist[hist.length - 1] - hist[0];
  if (d === 0) return "flat";
  return (d < 0) === lowerIsBetter ? "moved" : "away";
}

// Track their offer per turn. Reset when the scenario changes (new game).
function useOfferHistory(scenarioId: string, state: StateView | null): number[] {
  const [hist, setHist] = useState<number[]>([]);
  const lastTurn = useRef<number>(-1);
  const sid = useRef(scenarioId);

  useEffect(() => {
    if (sid.current !== scenarioId) {
      sid.current = scenarioId;
      lastTurn.current = -1;
      setHist(state ? [state.offer_opp] : []);
      if (state) lastTurn.current = state.turn;
      return;
    }
    if (!state) return;
    // Record the opening once, then one point per completed turn.
    if (hist.length === 0) {
      setHist([state.offer_opp]);
      lastTurn.current = state.turn;
    } else if (state.turn !== lastTurn.current) {
      lastTurn.current = state.turn;
      setHist((h) => [...h, state.offer_opp]);
    }
  }, [scenarioId, state, hist.length]);

  return hist;
}

/** Подпись красной линии прямо на шкале. Цель всегда левее (выгодный край
 *  слева), поэтому подпись уходит ВПРАВО от черты, пока там есть место, и
 *  влево — у правого края: так она не наезжает ни на цель, ни на рамку. */
export function redlineLabelAlign(x: number): "start" | "end" {
  return x <= 0.5 ? "start" : "end";
}

export function DealTracker({ scenario, state, t, lang, legendOpen = true, coaching = true }: Props) {
  const hist = useOfferHistory(scenario.id, state);
  const unit = scenario.headline_unit;
  const fmt = (v: number) => formatDeal(v, unit, lang);
  const target = scenario.target;
  const redline = scenario.reservation;
  // Direction is inferred from target vs red line — no engine `dir` needed and
  // nothing about the opponent's floor is used.
  const lowerIsBetter = target < redline;

  const opening = hist.length ? hist[0] : state?.offer_opp ?? redline;
  // Once the table closes, the headline is the SETTLED price, not the last thing
  // the opponent said — those differ (the deal closes at the meeting point), and
  // showing offer_opp here contradicted the outcome strip a rouble away.
  const settled = state?.status === "agreement" ? state?.deal ?? null : null;
  const current = settled ?? state?.offer_opp ?? opening;
  const yours = state?.offer_player ?? null;
  const standing = state && coaching ? priceStanding(target, redline, current, settled) : null;
  const trail = priceTrail(hist, lowerIsBetter);

  // Axis spans every known mark, padded so nothing sits on the very edge.
  const pts = [target, redline, opening, current, ...(yours != null ? [yours] : [])];
  let lo = Math.min(...pts);
  let hi = Math.max(...pts);
  if (hi === lo) hi = lo + 1;
  const pad = (hi - lo) * 0.08;
  lo -= pad;
  hi += pad;

  // Normalize to [0,1], then orient so the PLAYER's good end is always LEFT.
  const frac = (v: number) => (v - lo) / (hi - lo);
  const x = (v: number) => (lowerIsBetter ? frac(v) : 1 - frac(v));
  const pct = (v: number) => `${(x(v) * 100).toFixed(1)}%`;

  // Your range: from target (best) to red line (worst still acceptable to you).
  const gz1 = Math.min(x(target), x(redline)) * 100;
  const gz2 = Math.max(x(target), x(redline)) * 100;

  const status = standing
    ? t.tracker.status[standing]
        .replace("{red}", fmt(redline))
        .replace("{target}", fmt(target))
        .replace("{deal}", fmt(current))
    : null;

  // Single accessible summary for the scale itself: the player's own target +
  // red line and the counterpart's current offer. The hidden floor is never
  // referenced (honesty). The legend and the status line stay readable text.
  const ariaSummary = t.a11y.deal
    .replace("{target}", fmt(target))
    .replace("{redline}", fmt(redline))
    .replace("{offer}", state ? fmt(current) : "—");

  return (
    <div className="dealtracker">
      <div className="dt-title"><b>{t.tracker.title}</b></div>

      <div className="dt-head" aria-hidden="true">
        <div className="ob">
          <div className="l"><i className="sw sw-theirs" />{settled != null ? t.tracker.settled : t.tracker.theirOffer}</div>
          <div className="v">{state ? fmt(current) : "—"}</div>
        </div>
        <div className="ob">
          <div className="l"><i className="sw sw-target" />{t.tracker.target}</div>
          <div className="v tg">{fmt(target)}</div>
        </div>
      </div>

      {status ? <p className={`dt-status ${standing}`}>{status}</p> : null}

      <div className="dt-scale" role="img" aria-label={ariaSummary}>
        <div className="dt-axis" />
        <div className="dt-zone" style={{ left: `${gz1}%`, width: `${gz2 - gz1}%` }} />

        {/* their opening price — a hollow ring in THEIR colour */}
        <div className="dt-mark start" style={{ left: pct(opening) }}>
          <span className="ring" />
        </div>

        {/* your red line */}
        <div className="dt-mark redline" style={{ left: pct(redline) }}>
          <span className="tick" />
          {/* Единственная подпись на самой шкале — и именно эта: «чья это
              красная линия» было первым вопросом. Цель подписана в шапке тем
              же образцом, а две подписи на узкой шкале налезали друг на друга. */}
          <span className={`lbl al-${redlineLabelAlign(x(redline))}`}>{t.tracker.redline}</span>
        </div>

        {/* your target */}
        <div className="dt-mark target" style={{ left: pct(target) }}>
          <span className="tick" />
        </div>

        {/* your last offer, if you've made one. The mark slides (CSS transition
            on `left`); the keyed ring replays a one-shot "settle" pop on move. */}
        {yours != null ? (
          <div className="dt-mark yours" style={{ left: pct(yours) }}>
            <span className="dot" />
            <span className="settle" key={yours} />
          </div>
        ) : null}

        {/* their current offer — the animated headline mark */}
        <div className="dt-mark theirs" style={{ left: pct(current) }}>
          <span className="dot" />
          <span className="settle" key={current} />
        </div>

        <span className="dt-end good">← {t.tracker.better}</span>
        <span className="dt-end bad">{t.tracker.worse} →</span>
      </div>

      {/* ЛЕГЕНДА — КАЖДАЯ МЕТКА ШКАЛЫ, СЛОВАМИ И ЧИСЛОМ. Образцы рисуются теми
          же классами, что и сами метки (.sw-*), поэтому легенда не может
          разойтись со шкалой по цвету. */}
      <details className="dt-key" open={legendOpen}>
        <summary>{t.tracker.key}</summary>
        <ul className="dt-legend">
          <li><i className="sw sw-target" /><span><b>{t.tracker.target}</b> · {fmt(target)}</span></li>
          <li>
            <i className="sw sw-redline" />
            <span><b>{t.tracker.redline}</b> · {fmt(redline)} — {t.tracker.redlineHint}</span>
          </li>
          <li><i className="sw sw-zone" /><span>{t.tracker.zone}</span></li>
          <li><i className="sw sw-theirs" /><span><b>{settled != null ? t.tracker.settled : t.tracker.theirOffer}</b>{state ? ` · ${fmt(current)}` : ""}</span></li>
          <li><i className="sw sw-start" /><span><b>{t.tracker.opening}</b> · {fmt(opening)}</span></li>
          {yours != null ? (
            <li><i className="sw sw-yours" /><span><b>{t.tracker.yourOffer}</b> · {fmt(yours)}</span></li>
          ) : null}
        </ul>
        <p className="dt-hidden">{t.tracker.hiddenFloor}</p>
      </details>

      {hist.length >= 2 ? (
        <p className="dt-trail">
          <b>{t.tracker.history}:</b>{" "}
          {(trail === "moved" ? t.tracker.historyMoved : trail === "away" ? t.tracker.historyAway : t.tracker.historyFlat)
            .replace("{from}", fmt(hist[0]))
            .replace("{to}", fmt(hist[hist.length - 1]))}
        </p>
      ) : null}
    </div>
  );
}
