// tours.ts — подсказки по разделам: какие шаги, когда показывать, как отключить.
//
// ЗАЧЕМ. Жюри заходит на стенд впервые и без пояснений команды, а тур был один —
// по главной, и показывался один раз. Самое непонятное — игровой стол — не
// объяснялось ничем. Теперь у каждого раздела свой короткий тур по ЕГО
// элементам, и показывается он при входе в раздел, пока человек сам не отключит.
//
// ТРИ ПРАВИЛА ПОКАЗА (решение — здесь, чистыми функциями, под тестом):
//   1. Раздел показывает тур при входе — но ОДИН РАЗ ЗА СЕАНС ВКЛАДКИ. Ушёл и
//      вернулся, перезагрузил страницу — второй раз не всплывает (sessionStorage).
//      Новая вкладка или новый заход в браузер — снова покажет: это и есть
//      «каждый вход», не превращённый в «каждый клик по меню».
//   2. Галочка «Больше не показывать» в карточке тура отключает ЭТОТ раздел.
//   3. Общий переключатель в Профиле выключает подсказки везде и возвращает
//      отключённые галочкой — без него случайная галочка стоила бы подсказок
//      навсегда.
// Кнопка «Как здесь всё устроено?» запускает тур текущего раздела всегда,
// невзирая на всё перечисленное: это прямая просьба человека.
//
// Хранилище своё, новое: старый флаг dialog.tutorialDone.v1 («home» / «1») им не
// читается вовсе, поэтому прошедшие старый тур видят новые туры — для них это
// новое. Сам старый флаг по-прежнему решает подсветки за столом в первой партии.

export type TourSection = "home" | "table" | "course" | "custom" | "admin" | "campaign" | "exam" | "profile";

export const TOUR_SECTIONS: TourSection[] = ["home", "table", "course", "custom", "admin", "campaign", "exam", "profile"];

export interface TourStep { id: string; selector: string }

/**
 * Шаги каждого тура — классы НАСТОЯЩИХ элементов раздела. Шаг, чьей цели на
 * экране нет (экзамен прячет шкалы, у нового профиля нет графика роста),
 * выпадает, а не висит ободком над пустотой. `test/tours.test.ts` сверяет,
 * что каждый класс объявлен в разметке, — переименование иначе молча убило бы шаг.
 */
export const TOURS: Record<TourSection, TourStep[]> = {
  home: [
    { id: "intro", selector: ".practice-intro" },
    { id: "start", selector: ".route" },
    { id: "nav", selector: ".sidenav" },
    { id: "progress", selector: ".rail-progress" },
  ],
  table: [
    { id: "meters", selector: ".hud" },
    { id: "price", selector: ".dealtracker" },
    { id: "interests", selector: ".interests-rail" },
    { id: "batna", selector: ".batna" },
    { id: "terms", selector: ".side-more-toggle" },
    { id: "composer", selector: ".compose" },
    { id: "exit", selector: ".side-acts" },
  ],
  course: [
    { id: "path", selector: ".course-path" },
    { id: "current", selector: ".cnode.current" },
    { id: "redo", selector: ".redo-card" },
    { id: "master", selector: ".master-card" },
    { id: "why", selector: ".course-why" },
  ],
  custom: [
    { id: "vs", selector: ".cust-vs" },
    { id: "text", selector: ".cust-ta" },
    { id: "examples", selector: ".cust-ex" },
    { id: "context", selector: ".cust-context" },
    { id: "go", selector: ".cust-go" },
  ],
  admin: [
    { id: "vs", selector: ".admin-vs" },
    { id: "presets", selector: ".admin-presets" },
    { id: "fields", selector: ".admin-fields" },
    { id: "preview", selector: ".admin-preview" },
    { id: "actions", selector: ".admin-actions" },
  ],
  campaign: [
    { id: "pick", selector: ".camp-pick" },
    { id: "arc", selector: ".arc" },
    { id: "current", selector: ".act.current" },
    { id: "rep", selector: ".camp-rep" },
    { id: "cta", selector: ".camp-cta" },
  ],
  exam: [
    { id: "intro", selector: ".exam-intro" },
    { id: "name", selector: ".exam-name" },
    { id: "catalog", selector: ".catalog-browser" },
  ],
  profile: [
    { id: "rank", selector: ".skills-head" },
    { id: "skills", selector: ".skillbars" },
    { id: "growth", selector: ".grw" },
    { id: "layers", selector: ".prof-layers" },
    { id: "tips", selector: ".tour-prefs" },
  ],
};

/** Чего дождаться, прежде чем искать цели: стол и редактор едут отдельными
 *  файлами, а стол ещё и ждёт ответа сервера. */
export const TOUR_READY: Partial<Record<TourSection, string>> = {
  table: ".dealtracker",
  course: ".course-path",
  admin: ".admin-presets",
  campaign: ".arc",
  profile: ".prof-layers",
};

// ---- Настройки (переживают перезагрузку) ---------------------------------------

export interface TourPrefs {
  enabled: boolean;          // общий переключатель в Профиле
  off: TourSection[];        // разделы, отключённые галочкой в карточке
}

export const DEFAULT_TOUR_PREFS: TourPrefs = { enabled: true, off: [] };
const PREFS_KEY = "dialog.tours.v1";
const SEEN_KEY = "dialog.toursSeen.v1";

/** Разбор сохранённых настроек. Нет записи, чужой формат, мусор — «всё
 *  включено»: подсказки по умолчанию есть, и ничего из этого не бросает. */
export function parseTourPrefs(raw: string | null): TourPrefs {
  if (!raw) return { ...DEFAULT_TOUR_PREFS, off: [] };
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const enabled = typeof v?.enabled === "boolean" ? v.enabled : true;
    const off = Array.isArray(v?.off)
      ? TOUR_SECTIONS.filter((s) => (v.off as unknown[]).includes(s))
      : [];
    return { enabled, off };
  } catch {
    return { ...DEFAULT_TOUR_PREFS, off: [] };
  }
}

export function loadTourPrefs(): TourPrefs {
  try {
    return parseTourPrefs(typeof localStorage !== "undefined" ? localStorage.getItem(PREFS_KEY) : null);
  } catch {
    return { ...DEFAULT_TOUR_PREFS, off: [] };
  }
}

export function saveTourPrefs(p: TourPrefs): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // закрытое хранилище — выбор просто не переживёт перезагрузку
  }
}

/** Галочка в карточке тура: этот раздел — выключить или вернуть. */
export function setSectionOff(p: TourPrefs, section: TourSection, off: boolean): TourPrefs {
  const rest = p.off.filter((s) => s !== section);
  return { ...p, off: off ? [...rest, section] : rest };
}

/** Общий переключатель в Профиле. Включение возвращает и разделы, отключённые
 *  галочкой: иначе переключатель горел бы, а подсказок всё равно не было. */
export function setToursEnabled(p: TourPrefs, enabled: boolean): TourPrefs {
  return enabled ? { enabled: true, off: [] } : { ...p, enabled: false };
}

// ---- Сеанс: один показ на раздел за вкладку ------------------------------------

export function seenThisSession(): TourSection[] {
  try {
    const raw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(SEEN_KEY) : null;
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? TOUR_SECTIONS.filter((s) => v.includes(s)) : [];
  } catch {
    return [];
  }
}

export function markSeenThisSession(section: TourSection): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    const seen = new Set(seenThisSession());
    seen.add(section);
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // без sessionStorage тур покажется при следующем входе ещё раз — не беда
  }
}

/** Показать ли тур раздела САМИМ, при входе. Чистая: решает весь порядок. */
export function shouldAutoRunTour(section: TourSection, prefs: TourPrefs, seen: TourSection[]): boolean {
  return prefs.enabled && !prefs.off.includes(section) && !seen.includes(section);
}
