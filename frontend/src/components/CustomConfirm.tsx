// CustomConfirm.tsx — числа своей сделки на подтверждение до первого хода.
//
// Генератор выводит числа стола из описания, а модель может ошибиться: в
// описании цель 450 000, а на столе 470 000 (аудит 17.10, CE-01). Решение
// владельца 19.10: игрок видит стартовую цену собеседника, свою цель и красную
// линию и правит их. Поправку проверяет сервер (`session.adjust`) — порядок
// чисел и скрытое дно собеседника; отказ приходит строкой в ленту.
import { useState } from "react";
import type { Strings } from "../i18n";

interface Props {
  t: Strings;
  unit: string;
  open: number;
  target: number;
  redline: number;
  onApply: (open: number, target: number, redline: number) => void;
  onOk: () => void;
}

/** «470 000», «470000», «12,5» → число; мусор → NaN. */
function parse(raw: string): number {
  const v = Number(raw.replace(/[\s  ]/g, "").replace(",", "."));
  return raw.trim() ? v : NaN;
}

export function CustomConfirm({ t, unit, open, target, redline, onApply, onOk }: Props) {
  const c = t.custom.confirm;
  const [vals, setVals] = useState({ open: String(open), target: String(target), redline: String(redline) });
  const nums = { open: parse(vals.open), target: parse(vals.target), redline: parse(vals.redline) };
  const valid = Object.values(nums).every((v) => Number.isFinite(v) && v > 0);
  const changed = nums.open !== open || nums.target !== target || nums.redline !== redline;
  const field = (key: "open" | "target" | "redline", label: string) => (
    <label className="cc-field">
      <span>{label}</span>
      <span className="cc-input">
        <input
          name={`custom-${key}`} id={`custom-${key}`} inputMode="decimal" autoComplete="off"
          value={vals[key]} aria-invalid={!Number.isFinite(nums[key]) || nums[key] <= 0}
          onChange={(e) => setVals((v) => ({ ...v, [key]: e.target.value }))}
        />
        {unit ? <em>{unit.trim()}</em> : null}
      </span>
    </label>
  );
  return (
    <section className="custom-confirm" aria-label={c.title}>
      <h3>{c.title}</h3>
      <p>{c.lead}</p>
      <div className="cc-fields">
        {field("open", c.open)}
        {field("target", c.target)}
        {field("redline", c.redline)}
      </div>
      <div className="cc-actions">
        {changed ? (
          <button className="btn primary" disabled={!valid}
                  onClick={() => onApply(nums.open, nums.target, nums.redline)}>{c.apply}</button>
        ) : (
          <button className="btn primary" onClick={onOk}>{c.ok}</button>
        )}
      </div>
    </section>
  );
}
