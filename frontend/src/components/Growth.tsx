// Growth.tsx — витрина роста: «стало ли лучше, чем было».
//
// ЧТО ЭТО ЗА ЭКРАН. Профиль навыков отвечает на вопрос «сколько у меня сейчас»
// — бегущее среднее по всем партиям. На вопрос, ради которого человек и пришёл
// в тренажёр («я расту?»), среднее ответить не может: оно помнит итог и
// забывает порядок. Здесь лежит вторая половина — лента партий и вывод о
// тенденции (`lib/growth.ts`).
//
// ГЛАВНОЕ ПРАВИЛО ЭТОГО ФАЙЛА — принцип 2. Линию по двум точкам нарисовать
// можно всегда, и выглядеть она будет ровно как настоящая. Поэтому до шести
// партий здесь НЕТ ни графика, ни стрелок: карточка честно говорит, сколько
// сыграно и сколько нужно. А когда данных хватило, вывод всё равно называет
// разброс: разница, укладывающаяся в него, объявляется шумом, а не ростом.
//
// ЧТО ОНА НЕ ДЕЛАЕТ. Не считает ничего нового. `overall` и грейд взяты из того
// же разбора, что нарисовал кольцо, шесть сигналов — из `skillSignals`, то есть
// из полей, которые движок кладёт в `score_session`. В оценку отсюда не уходит
// ничего (инвариант 6) — и карточка говорит это вслух.
import { useMemo } from "react";
import type { Lang } from "../types";
import type { Strings } from "../i18n";
import { formatNumber, plural } from "../lib/format";
import {
  growthView, loadHistory, movedMost,
  type GrowthView, type HistoryPoint, type Trend,
} from "../lib/growth";
import "../styles.growth.css";

const sub = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

/** Одно число словами локали. Десятая доля нужна: округли разницу и порог до
 *  целых — и рядом встанут «разница 11 при разбросе ±11», где вывод «шум»
 *  читается как ошибка. Показанное число обязано объяснять показанный вывод. */
const num1 = (v: number, lang: Lang) => formatNumber(Math.round(v * 10) / 10, lang);

const shortDate = (iso: string, lang: Lang) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "short" });
};

// Пороги грейда — те же, что у движка (docs/product.md). Рисуются линейками на
// графике: точка выше линии «B» — это партия на B, и это видно без подписи.
const BANDS: { at: number; label: string }[] = [
  { at: 85, label: "A" },
  { at: 70, label: "B" },
  { at: 55, label: "C" },
  { at: 40, label: "D" },
];

const dirClass = (t: Trend) => (t.dir === "up" ? "up" : t.dir === "down" ? "down" : "flat");
const dirArrow = (t: Trend) => (t.dir === "up" ? "↑" : t.dir === "down" ? "↓" : "→");
const dirWord = (t: Trend, s: Strings) =>
  t.dir === "up" ? s.growth.dirUp : t.dir === "down" ? s.growth.dirDown : s.growth.dirFlat;

/** Пояснение к вердикту: то же число, что решило вердикт, и тот же порог. */
function why(t: Trend, s: Strings, lang: Lang): string {
  const vars = { delta: num1(Math.abs(t.delta), lang), threshold: num1(t.threshold, lang) };
  return sub(t.dir === "flat" ? s.growth.noise : s.growth.grew, vars);
}

// ---------------------------------------------------------------- график

// Ось Y — ВСЕГДА 0…100, а не «от минимума до максимума данных». Подогнанная под
// данные шкала превращает разницу в три очка в обрыв: график начинает врать
// формой, не соврав ни одним числом. Ровно поэтому здесь же нарисованы пороги
// грейда — они дают глазу постоянную мерку.
const W = 320;
const H = 132;
const PAD_L = 8;
const PAD_R = 22; // место под буквы грейда справа
const PAD_T = 8;
const PAD_B = 8;

function Chart({ points, trend, t }: {
  points: HistoryPoint[]; trend: Trend | null; t: Strings;
}) {
  const n = points.length;
  const x = (i: number) => PAD_L + (n < 2 ? (W - PAD_L - PAD_R) / 2 : ((W - PAD_L - PAD_R) * i) / (n - 1));
  const y = (v: number) => PAD_T + (H - PAD_T - PAD_B) * (1 - v / 100);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.overall).toFixed(1)}`).join(" ");
  const k = trend?.n ?? 0;

  return (
    <svg
      className="grw-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={sub(t.growth.chartAria, {
        n,
        before: trend ? Math.round(trend.before) : "—",
        after: trend ? Math.round(trend.after) : "—",
      })}
    >
      {BANDS.map((b) => (
        <g key={b.label}>
          <line className="grw-band" x1={PAD_L} x2={W - PAD_R} y1={y(b.at)} y2={y(b.at)} />
          <text className="grw-band-l" x={W - PAD_R + 4} y={y(b.at) + 3.5}>{b.label}</text>
        </g>
      ))}

      {/* Две горизонтали — средние половин окна. Именно их разницу и обсуждает
          вердикт рядом, поэтому они нарисованы ровно над своими партиями. */}
      {trend && k > 0 ? (
        <>
          <line
            className="grw-mean before"
            x1={x(0)} x2={x(k - 1)} y1={y(trend.before)} y2={y(trend.before)}
          />
          <line
            className={`grw-mean after ${dirClass(trend)}`}
            x1={x(n - k)} x2={x(n - 1)} y1={y(trend.after)} y2={y(trend.after)}
          />
        </>
      ) : null}

      <polyline className="grw-line" points={line} pathLength={1} fill="none" />
      {points.map((p, i) => (
        <circle key={i} className="grw-dot" cx={x(i)} cy={y(p.overall)} r={2.6} />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------- карточка

export function Growth({ t, lang, view }: { t: Strings; lang: Lang; view?: GrowthView }) {
  // История читается один раз на открытие экрана: она не меняется, пока человек
  // на неё смотрит. `view` перекрывается в тестах и на снимках.
  const v = useMemo(() => view ?? growthView(loadHistory()), [view]);
  const moved = useMemo(() => movedMost(v), [v]);

  if (!v.enough) {
    return (
      <section className="grw grw-low" aria-labelledby="grw-h">
        <h2 className="grw-h" id="grw-h">{t.growth.title}</h2>
        <p className="grw-low-t">{t.growth.lowTitle}</p>
        <p className="grw-low-b">{sub(t.growth.lowBody, { played: v.played, need: v.need })}</p>
        {/* Полоска «сколько уже есть» — единственное, что здесь можно показать
            честно: это счётчик партий, а не оценка. */}
        <div className="grw-fill" role="progressbar" aria-valuenow={v.played} aria-valuemin={0} aria-valuemax={v.need}>
          <i style={{ width: `${Math.round((Math.min(v.played, v.need) / v.need) * 100)}%` }} />
        </div>
      </section>
    );
  }

  const o = v.overall!;
  return (
    <section className="grw" aria-labelledby="grw-h">
      <h2 className="grw-h" id="grw-h">{t.growth.title}</h2>
      <p className="grw-sub">{t.growth.sub}</p>

      <div className="grw-top">
        <span className="grw-top-l">{t.growth.overallLabel}</span>
        <span className={`grw-chip ${dirClass(o)}`}>
          <b aria-hidden="true">{dirArrow(o)}</b> {dirWord(o, t)}
        </span>
      </div>

      <Chart points={v.window} trend={o} t={t} />

      <p className="grw-note">
        <b>{sub(t.growth.thenNow, { before: Math.round(o.before), after: Math.round(o.after) })}</b>
        {" · "}
        {why(o, t, lang)}
      </p>
      <p className="grw-win">
        {sub(t.growth.windowNote, {
          n: v.window.length,
          form: plural(v.window.length, t.forms.games),
          from: shortDate(v.from, lang),
          to: shortDate(v.to, lang),
        })}
      </p>

      <h3 className="grw-sh">{t.growth.skillsHead}</h3>
      <ul className="grw-skills">
        {v.skills.map(({ id, trend }) => (
          <li className={`grw-row ${dirClass(trend)}`} key={id}>
            <span className="grw-name">{t.gam.skillNames[id]}</span>
            <span className="grw-then">
              {sub(t.growth.thenNow, { before: Math.round(trend.before), after: Math.round(trend.after) })}
            </span>
            <span className={`grw-chip ${dirClass(trend)}`}>
              <b aria-hidden="true">{dirArrow(trend)}</b> {dirWord(trend, t)}
            </span>
            <span className="grw-why">{why(trend, t, lang)}</span>
          </li>
        ))}
      </ul>

      <p className="grw-moved">
        {moved.up ? (
          <>
            <span className="up">{t.growth.movedUp}:</span> <b>{t.gam.skillNames[moved.up.id]}</b>
          </>
        ) : null}
        {moved.up && moved.down ? " · " : null}
        {moved.down ? (
          <>
            <span className="down">{t.growth.movedDown}:</span> <b>{t.gam.skillNames[moved.down.id]}</b>
          </>
        ) : null}
        {!moved.up && !moved.down ? t.growth.noMoves : null}
      </p>

      <p className="grw-honest">{t.growth.notScored}</p>
    </section>
  );
}

export default Growth;
