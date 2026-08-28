// Rematch.tsx — «переиграй партию против себя вчерашнего».
//
// Две поверхности одной идеи:
//   RematchOffer — карточка разбора: за этим столом уже лежит ваша партия,
//                  сыграйте его снова;
//   RematchRail  — панель ЗА СТОЛОМ: слева «вы тогда», справа «вы сейчас»,
//                  внизу расхождение цены и шкал по ходам.
//
// Ни одно число здесь не придумано компонентом. Прошлую траекторию считает
// движок (lib/rematch.replayRun), текущую даёт сама партия; разметка только
// вычитает одно из другого. В `score_session` это не входит ничем — сравнение
// послесловие, а не вторая оценка (инварианты 3 и 6). Экзамена здесь нет
// вовсе: там сопровождение выключено до конца (App решает это, не панель).
import { useEffect, useMemo, useState } from "react";
import type { Lang, StateView } from "../types";
import type { Strings } from "../i18n";
import type { PastRun, RunOpening } from "../lib/progress";
import {
  METER_IDS, meterGaps, meterSeries, priceGap, priceOf, priceSeries, sameOpening, sparkPoints,
  type Gap, type TrailPoint,
} from "../lib/rematch";
import { formatDeal } from "../lib/format";
import { MascotImg, Tikhon } from "./Mascot";

// ---------------------------------------------------------------------------
// Карточка разбора: предложение переиграть.
// ---------------------------------------------------------------------------
export function RematchOffer({
  t, past, isThisRun, onRematch,
}: {
  t: Strings;
  /** Партия, которая станет соперником, — то, что лежит на столе ПОСЛЕ записи. */
  past: PastRun;
  /** Соперником стала только что сыгранная партия (первая за этим столом). */
  isThisRun: boolean;
  onRematch: () => void;
}) {
  const r = t.rematch;
  const body = isThisRun
    ? r.offerSame
    : r.offerBody
        .replace("{grade}", past.grade)
        .replace("{score}", String(past.score))
        .replace("{deal}", past.dealText);
  return (
    <div className="rmoffer">
      {/* Поза chart нарисована ровно под «указывает на цифру» — сравнение с
          прошлой попыткой это буквально работа памяти, а не тренера. */}
      <Tikhon state="chart" title={r.offerTitle}>{body}</Tikhon>
      <button className="btn primary rm-cta" type="button" onClick={onRematch}>
        ↻ {r.cta}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Панель за столом.
// ---------------------------------------------------------------------------
export interface RematchRailProps {
  t: Strings;
  lang: Lang;
  past: PastRun;
  /** Прошлая партия, переигранная движком ход за ходом. */
  pastTrail: TrailPoint[];
  /** Состояния ИДУЩЕЙ партии по ходам: индекс i — состояние после хода i+1. */
  nowTrail: StateView[];
  /** Реплики игрока в идущей партии, по порядку. */
  nowMoves: string[];
  /** Стартовые условия идущего стола — чтобы честно сказать, если они разошлись. */
  nowOpening: RunOpening | null;
  unit: string;
  /** Игрок хочет число НИЖЕ (покупатель) — направление «лучше» для цены. */
  lowerBetter: boolean;
}

export function RematchRail(props: RematchRailProps) {
  const { t, lang, past, pastTrail, nowTrail, nowMoves, nowOpening, unit, lowerBetter } = props;
  const r = t.rematch;
  // Открыта по умолчанию — ради неё стол и переигрывают. Но только на большом
  // экране: на телефоне стол уже занимает всё окно, и панель легла бы поверх
  // композера, то есть поверх единственного способа сделать ход.
  const [open, setOpen] = useState(() => {
    try {
      return typeof matchMedia === "function" ? matchMedia("(min-width: 861px)").matches : true;
    } catch {
      return true;
    }
  });

  // Открытая панель НЕ накрывает стол, а раздвигает его: справа живут цена,
  // BATNA и условия сделки — накрыть их значит отобрать у игрока половину
  // информации ровно тогда, когда он сравнивает себя с собой. Класс на <body>,
  // потому что панель уехала порталом и до раскладки приложения не дотягивается.
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("rm-docked");
    return () => document.body.classList.remove("rm-docked");
  }, [open]);

  // Последний СЫГРАННЫЙ ход. Сравнивать раньше нечего: до первой реплики обе
  // партии стоят на стартовых условиях.
  const turn = nowTrail.length;
  const nowState = turn > 0 ? nowTrail[turn - 1] : null;
  const thenPoint = turn > 0 ? pastTrail[turn - 1] ?? null : null;
  const nowMove = turn > 0 ? nowMoves[turn - 1] ?? "" : "";
  // Реплика, которой прошлая попытка ответит на СЛЕДУЮЩЕМ ходу. Это ваши
  // собственные слова, а не подсказка коуча: в этом весь смысл переигровки —
  // сыграть иначе, чем сыграли вы.
  const nextThen = pastTrail[turn]?.text ?? null;

  const meters = nowState && thenPoint ? meterGaps(thenPoint.state, nowState) : null;
  const price = nowState && thenPoint ? priceGap(thenPoint.state, nowState, lowerBetter) : null;

  const series = useMemo(() => {
    const thenPrices = priceSeries(pastTrail);
    const nowPrices = nowTrail.map(priceOf);
    return { price: sparkPoints(thenPrices, nowPrices) };
  }, [pastTrail, nowTrail]);

  const openingDiffers = !!nowOpening && !sameOpening(past.opening, nowOpening);

  if (!open) {
    return (
      <button
        className="rmrail-tab"
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
      >
        <MascotImg dir="tikhon" state="chart" alt="" size={28} />
        <span>{r.open}</span>
      </button>
    );
  }

  return (
    <aside className="rmrail" aria-label={r.title}>
      <div className="rm-head">
        <MascotImg dir="tikhon" state="chart" alt="" size={40} />
        <div className="rm-headtx">
          <b>{r.title}</b>
          <span className="rm-was">
            {r.resultThen}: <b>{past.grade}</b> ({past.score}) · {past.dealText}
          </span>
        </div>
        <button className="rm-x" type="button" onClick={() => setOpen(false)} aria-label={r.close}>
          ×
        </button>
      </div>

      {openingDiffers ? <p className="rm-note">{r.differentTable}</p> : null}

      <div className="rm-turn">{r.turn.replace("{n}", String(Math.max(1, turn)))}</div>

      <div className="rm-cols">
        <div className="rm-col then">
          <span className="rm-collab">{r.then}</span>
          <blockquote className="rm-q">
            {thenPoint ? `«${thenPoint.text}»` : r.pastEnded}
          </blockquote>
        </div>
        <div className="rm-col now">
          <span className="rm-collab">{r.now}</span>
          <blockquote className="rm-q">{nowMove ? `«${nowMove}»` : r.noMoveYet}</blockquote>
        </div>
      </div>

      {price && meters ? (
        <>
          <div className={`rm-price ${verdictClass(price)}`}>
            <span className="rm-plab">{r.price}</span>
            <span className="rm-pthen">{formatDeal(price.then, unit, lang)}</span>
            <span className="rm-parrow" aria-hidden="true">→</span>
            <span className="rm-pnow">{formatDeal(price.now, unit, lang)}</span>
            <span className="rm-pverdict">{verdictWord(r, price)}</span>
          </div>

          <div className="rm-meters">
            {METER_IDS.map((id) => (
              <MeterRow
                key={id}
                label={t.metersShort[id]}
                gap={meters[id]}
                then={meterSeries(pastTrail, id)}
                now={nowTrail.map((s) => s[id])}
              />
            ))}
          </div>
        </>
      ) : null}

      <div className="rm-byturns">
        <span className="rm-bylab">{r.byTurns}</span>
        <Spark points={series.price} tall />
        <span className="rm-legend">
          <i className="rm-lk then" aria-hidden="true" /> {r.then}
          <i className="rm-lk now" aria-hidden="true" /> {r.now}
        </span>
      </div>

      {nextThen ? (
        <div className="rm-next">
          <span className="rm-nextlab">{r.nextThen}</span>
          <blockquote className="rm-q">«{nextThen}»</blockquote>
        </div>
      ) : null}
    </aside>
  );
}

function MeterRow({ label, gap, then, now }: {
  label: string;
  gap: Gap;
  then: number[];
  now: number[];
}) {
  const points = sparkPoints(then, now);
  return (
    <div className={`rm-meter ${verdictClass(gap)}`}>
      <span className="rm-mlab">{label}</span>
      <span className="rm-mnum">
        {gap.then} <i aria-hidden="true">→</i> {gap.now}
      </span>
      <span className="rm-mdelta">{signed(gap.delta)}</span>
      <Spark points={points} />
    </div>
  );
}

/** Две полилинии в одной системе координат: прошлое пунктиром, настоящее сплошной. */
function Spark({ points, tall }: { points: { a: string; b: string }; tall?: boolean }) {
  return (
    <svg
      className={`rm-spark${tall ? " tall" : ""}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <polyline className="rm-sp-then" points={points.a} />
      <polyline className="rm-sp-now" points={points.b} />
    </svg>
  );
}

function verdictClass(g: Gap): string {
  return g.better === null ? "even" : g.better ? "ahead" : "behind";
}

function verdictWord(r: Strings["rematch"], g: Gap): string {
  return g.better === null ? r.even : g.better ? r.ahead : r.behind;
}

/** «+5» / «−3» / «0» — типографский минус, как в разборе. */
function signed(v: number): string {
  const n = Math.round(v);
  if (n === 0) return "0";
  return `${n > 0 ? "+" : "−"}${Math.abs(n)}`;
}
