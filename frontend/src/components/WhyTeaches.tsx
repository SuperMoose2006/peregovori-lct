// WhyTeaches.tsx — the director's #8 "why this teaches" section. A cold visitor
// (hackathon jury, a skeptical adult) lands on the hero and needs proof the
// product actually teaches a method before committing to "Начать переговоры".
// This sits under the hero, ABOVE the #play picker, so it never disrupts the
// CTA's scroll target. Each panel grounds one principle in a concrete in-game
// micro-example (interest-probing moves the price, criteria = leverage, logrolling,
// BATNA-as-leverage); the framing states the honesty guarantee. The price-dot
// strip is a decorative micro-animation (reduced-motion-safe via the global rule
// + an explicit resting position).
import type { Lang } from "../types";
import type { Strings } from "../i18n";

// Method-tag → meter color, so the pedagogy reads in the same visual language as
// the live game (Information/Leverage/Trust drive these very techniques).
// ЧИТАЕМЫЕ варианты цветов шкал. Яркие (--info, --leverage) заливают полосы
// метрик, где поверх ничего не написано; тем же цветом набранный чип на белом
// даёт 2.44:1 и 2.54:1. Компонент писался до общей правки контраста и в аудит
// не попадал, потому что не показывался нигде.
const TAG_COLOR: Record<string, string> = {
  SPIN: "var(--info-ink)",
  Гарвард: "var(--brass)",
  Harvard: "var(--brass)",
  BATNA: "var(--leverage-ink)",
};

export function WhyTeaches({ t, lang }: { t: Strings; lang: Lang }) {
  return (
    <section className="teach" aria-labelledby="teach-title">
      <div className="teach-head">{t.teach.head}</div>
      <h2 className="teach-title" id="teach-title">
        {t.teach.title}
      </h2>

      {/* Micro-animation: their-offer dot easing toward the target tick as an
          interest is uncovered — the core "price moves without pressure" loop,
          in miniature. Decorative; the caption carries the meaning for SR/RM. */}
      <div className="teach-demo">
        <div className="td-track" aria-hidden="true">
          <span className="td-target" />
          <span className="td-target-lbl">{lang === "ru" ? "цель" : "target"}</span>
          <span className="td-dot">
            <span className="td-dot-lbl">{lang === "ru" ? "их цена" : "their price"}</span>
          </span>
        </div>
        <div className="teach-demo-cap">{t.teach.demoCap}</div>
      </div>

      <div className="teach-panels">
        {t.teach.panels.map((p, i) => (
          <div className="tp-panel" key={i}>
            <span className="tp-tag" style={{ color: TAG_COLOR[p.tag] || "var(--brass)" }}>
              {p.tag}
            </span>
            <div className="tp-name">{p.name}</div>
            <p className="tp-idea">{p.idea}</p>
            <p className="tp-example">{p.example}</p>
          </div>
        ))}
      </div>

      <p className="teach-framing">{t.teach.framing}</p>
    </section>
  );
}
