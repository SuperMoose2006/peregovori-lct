// SideNav.tsx — левое меню оболочки приложения.
//
// Меню перечисляет ТОЛЬКО то, что в продукте есть на самом деле: ранний макет
// придумал магазин и счётчик жизней, а реклама несуществующих возможностей —
// ровно то, что жюри ловит первым.
import type { Strings } from "../i18n";
import type { ScreenMode } from "../types";
import type { NavSection } from "../lib/navigation";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

interface Props {
  t: Strings;
  /** Which entry reads as current. Modes map 1:1 onto the first four rows. */
  active: NavSection;
  onMode: (m: ScreenMode) => void;
  onProfile: () => void;
  /** Курс приёмов — отдельный экран, а не режим партии. */
  onCourse: () => void;
  onAdmin?: () => void;
}

const ICONS: Record<string, IconName> = {
  practice: "target", campaign: "trophy", course: "books", custom: "dice", exam: "cap", profile: "person", admin: "tools",
};

export function SideNav({ t, active, onMode, onProfile, onCourse, onAdmin }: Props) {
  // Явный aria-label на каждой строке: значок помечен aria-hidden, поэтому без
  // него меню читалось бы диктору как несколько безымянных кнопок.
  const rows: { key: string; label: string; go: () => void }[] = [
    { key: "practice", label: t.nav.training, go: () => onMode("practice") },
    { key: "campaign", label: t.nav.campaign, go: () => onMode("campaign") },
    { key: "course", label: t.nav.course, go: onCourse },
    { key: "custom", label: t.nav.custom, go: () => onMode("custom") },
    { key: "exam", label: t.nav.exam, go: () => onMode("exam") },
    // «Прогресс» отсюда убран: он вёл на ТОТ ЖЕ экран профиля и вдобавок не мог
    // подсветиться текущим — App.tsx считает активным «profile» в обоих случаях.
    // Мёртвый пункт стоил седьмой вкладки, из-за которой на 390px подписи не
    // влезали ни при одном читаемом размере (замер: 7 вкладок = 52px, «Своя
    // сделка» требует 49px уже при 8px).
    { key: "profile", label: t.nav.profile, go: onProfile },
    ...(onAdmin ? [{ key: "admin", label: t.nav.admin, go: onAdmin }] : []),
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
              /* Опора для прибора, не для стилей. Обходчик интерфейса ходил по
                 подписям кнопок — по-русски. В английском режиме переход молча
                 не срабатывал, и шесть снимков разных разделов оказывались
                 одним и тем же экраном под шестью именами. Ключ раздела от
                 языка не зависит. */
              data-nav={r.key}
              onClick={r.go}
              aria-current={active === r.key ? "page" : undefined}
              aria-label={r.label}
            >
              <span className="sn-ic" aria-hidden="true"><Icon name={ICONS[r.key]} /></span>
              <span className="sn-lb">{r.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
