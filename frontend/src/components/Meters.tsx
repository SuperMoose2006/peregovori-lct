// Meters.tsx — полоса из четырёх шкал, приколотая к верху карточки ленты.
//
// Шкал в продукте было две штуки: панель на рельсе (полные подписи, подсказки)
// и эта полоса (обрубки «Дов · Напр · Инфо · Рыч»). Панель прятал `display:none`
// — то есть подписи и объяснения были написаны, переведены и недостижимы, а
// человек читал четыре сокращения без единой зацепки, что они значат.
// Осталась ОДНА полоса, и она несёт всё: полную подпись там, где та влезает,
// обрубок там, где нет, и объяснение `meterInfo` подсказкой при наведении и
// доступным именем для диктора.
//
// Место выбрано не случайно: рельс — вложенный скроллер, и на 1280×800 все
// четыре шкалы уезжали за его край. Эта полоса не уезжает ни при какой ширине.
import type { Deltas, StateView } from "../types";
import type { MeterLabels } from "../i18n";

type MeterKey = "trust" | "tension" | "info" | "leverage";
const ORDER: MeterKey[] = ["trust", "tension", "info", "leverage"];

interface Props {
  state: StateView;
  /** Полные подписи — «Доверие», «Напряжение». */
  labels: MeterLabels;
  /** Обрубки — «Дов», «Напр». Показываются, когда полная подпись не влезает. */
  short: MeterLabels;
  /** Однострочное объяснение: что это и от чего растёт. */
  info: MeterLabels;
  /** Имя всей полосы для диктора. */
  groupLabel: string;
  /** Дельты прошлого хода — только чтобы подсветить шкалу, которая двинулась. */
  deltas?: Deltas | null;
}

// Какая шкала двинулась сильнее всех (подсветка). null — если движение
// незначимо, чтобы тихий ход ничем не мигал.
function loudestKey(deltas?: Deltas | null): MeterKey | null {
  if (!deltas) return null;
  let best: MeterKey | null = null;
  let mag = 0.5; // sub-half nudges don't count
  for (const k of ORDER) {
    const m = Math.abs(deltas[k]);
    if (m > mag) {
      mag = m;
      best = k;
    }
  }
  return best;
}

export function Meters({ state, labels, short, info, groupLabel, deltas }: Props) {
  const loud = loudestKey(deltas);
  return (
    <div className="hud" role="group" aria-label={groupLabel}>
      {ORDER.map((k) => {
        const v = Math.round(state[k]);
        return (
          <span
            className={`hud-m ${k}`}
            key={k}
            // Фокусируемая: на сенсорном экране наведения нет, и подсказка,
            // доступная только мышью, — это подсказка, которой нет.
            tabIndex={0}
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={v}
            // Диктор читает полное имя и объяснение независимо от того, какая
            // из двух подписей сейчас на экране.
            aria-label={`${labels[k]} ${v}. ${info[k]}`}
            title={info[k]}
          >
            <b>
              <span className="hud-full">{labels[k]}</span>
              <span className="hud-abbr">{short[k]}</span>
            </b>
            <i className="hud-bar">
              <i style={{ width: `${Math.max(0, Math.min(100, state[k]))}%` }} />
            </i>
            <u>{v}</u>
            {/* Подсветка обводит ВСЮ ячейку, а не полоску: у полоски
                `overflow: hidden` (иначе заливка вылезает из скругления), и
                кольцо в -2px внутри неё просто обрезалось бы. */}
            {loud === k ? <span className="pulse-glow" key={state.turn} /> : null}
          </span>
        );
      })}
    </div>
  );
}
