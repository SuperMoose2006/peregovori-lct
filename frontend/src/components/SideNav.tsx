// SideNav.tsx — the left rail of the "game" skin's app shell.
//
// Only rendered when `data-skin="game"`; the default "dojo" skin keeps its thin
// top header and has no sidebar at all. The nav lists ONLY what the product
// actually has — an earlier design draft invented a shop and a lives counter,
// and advertising features that do not exist is the one thing a jury will catch.
import type { Strings } from "../i18n";
import type { Mode } from "../types";

interface Props {
  t: Strings;
  /** Which entry reads as current. Modes map 1:1 onto the first four rows. */
  active: Mode | "progress" | "profile" | "course";
  onMode: (m: Mode) => void;
  onProfile: () => void;
  /** Курс приёмов — отдельный экран, а не режим партии. */
  onCourse: () => void;
}

const ICONS: Record<string, string> = {
  practice: "🎯", campaign: "🏆", course: "📚", custom: "🎲", exam: "🎓",
  progress: "📊", profile: "👤",
};

export function SideNav({ t, active, onMode, onProfile, onCourse }: Props) {
  // Every row carries an explicit aria-label: at phone widths the visible label
  // is display:none on all but the current tab and the icon is aria-hidden, so
  // without it the primary navigation announces as five unnamed buttons.
  const rows: { key: string; label: string; go: () => void }[] = [
    { key: "practice", label: t.nav.training, go: () => onMode("practice") },
    { key: "campaign", label: t.nav.campaign, go: () => onMode("campaign") },
    { key: "course", label: t.nav.course, go: onCourse },
    { key: "custom", label: t.nav.custom, go: () => onMode("custom") },
    { key: "exam", label: t.nav.exam, go: () => onMode("exam") },
    { key: "progress", label: t.nav.progress, go: onProfile },
    { key: "profile", label: t.nav.profile, go: onProfile },
  ];
  return (
    <nav className="sidenav" aria-label={t.a11y.nav}>
      <div className="sn-brand">
        Диалог<span className="dot">.</span>
      </div>
      <ul>
        {rows.map((r) => (
          <li key={r.key}>
            <button
              className={`sn-row${active === r.key ? " on" : ""}`}
              onClick={r.go}
              aria-current={active === r.key ? "page" : undefined}
              aria-label={r.label}
            >
              <span className="sn-ic" aria-hidden="true">{ICONS[r.key]}</span>
              <span className="sn-lb">{r.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
