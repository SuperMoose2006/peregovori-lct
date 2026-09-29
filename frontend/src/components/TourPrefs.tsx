// TourPrefs.tsx — «Подсказки» в Профиле: общий переключатель туров по разделам
// и возврат тех, что отключены галочкой в карточке тура.
//
// ЗАЧЕМ ОН. Галочка «Больше не показывать» в карточке тура отключает один
// раздел. Без места, где это можно вернуть, случайная галочка стоила бы
// подсказок навсегда. Здесь же — выключить их везде одним движением.
import type { Strings } from "../i18n";
import { setToursEnabled, type TourPrefs } from "../lib/tours";

export function TourPrefsPanel({ t, prefs, onChange }:
  { t: Strings; prefs: TourPrefs; onChange: (next: TourPrefs) => void }) {
  const on = prefs.enabled;
  const offNames = prefs.off.map((s) => t.tour.names[s]);
  return (
    <div className="tour-prefs">
      <h2 className="pl-head">{t.tour.prefsTitle}</h2>
      <p className="tp-lead">{t.tour.prefsLead}</p>
      <div className="tp-row">
        <span id="tour-prefs-switch" className="tp-label">{t.tour.prefsSwitch}</span>
        {/* Тот же тумблер, что у слоёв (.ly-sw): один вид переключателя на продукт. */}
        <button
          className={`ly-sw${on ? " on" : ""}`}
          role="switch"
          aria-checked={on}
          aria-labelledby="tour-prefs-switch"
          onClick={() => onChange(setToursEnabled(prefs, !on))}
        >
          <span className="ly-knob" />
        </button>
      </div>
      {on && offNames.length ? (
        <p className="tp-off">
          {t.tour.prefsOff.replace("{list}", offNames.join(", "))}{" "}
          <button className="tp-restore" onClick={() => onChange(setToursEnabled(prefs, true))}>
            {t.tour.prefsRestore}
          </button>
        </p>
      ) : null}
    </div>
  );
}
