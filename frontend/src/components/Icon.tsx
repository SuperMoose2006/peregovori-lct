// Icon.tsx — единственный источник значков в интерфейсе.
//
// ПОЧЕМУ НЕ ЭМОДЗИ. Эмодзи рисует шрифт операционной системы, и это не
// придирчивость к стилю: один и тот же символ приезжает жёлтым кружком на одной
// платформе, плоским глифом на другой и пустым квадратом там, где шрифта нет.
// Цвет темы на них не действует — в тёмной теме они светятся собственной
// палитрой. Ширина тоже своя, поэтому строка с эмодзи и строка без него в одном
// списке стоят по-разному.
//
// Здесь вместо них штриховой SVG: viewBox 24×24, обводка `currentColor`,
// размер в `em`. Значок наследует цвет и кегль от текста рядом, поэтому в
// тёмной теме он тёмный, в запертой карточке — приглушённый, и никакой отдельной
// раскраски не требует.
//
// КАК ДОБАВЛЯТЬ. Новый значок — новая строка в `PATHS`. Имя описывает ПРЕДМЕТ
// («handshake»), а не место («deal-badge»): один предмет переиспользуется
// разными экранами, и имя по месту заставило бы заводить дубликаты.
//
// Значок декоративен: он всегда `aria-hidden`, а смысл несёт текст рядом. Если
// текста рядом нет, вызывающий обязан дать `title` — тогда значок получает роль
// картинки и доступное имя.
import type { ReactNode } from "react";

/** Имена значков. Расширяется по мере надобности; строковый союз держит опечатки. */
export type IconName =
  | "flame" | "gem" | "sun" | "moon" | "sound" | "mute" | "bulb" | "lock" | "unlock"
  | "mountain" | "scales" | "masks" | "cross" | "send" | "star" | "crown" | "cap"
  | "flag" | "dice" | "refresh" | "trophy" | "print" | "search" | "chair" | "mirror"
  | "camera" | "face" | "ice" | "mic" | "smile" | "target" | "books" | "book" | "person"
  | "tools" | "shield" | "clipboard" | "sliders" | "handshake" | "door" | "bolt"
  | "climb" | "ladder" | "chart" | "anchor" | "bricks" | "factory" | "briefcase"
  | "bank" | "laptop" | "building" | "worried" | "angry" | "key" | "box" | "rocket"
  | "house" | "car" | "satellite" | "pen" | "belt" | "question" | "map" | "check"
  | "warning" | "chat" | "clock";

/** Геометрия каждого значка. Только обводка — заливку задаёт отдельный список. */
const PATHS: Record<IconName, ReactNode> = {
  flame: <path d="M12 3c3 3.5 5 6 5 9a5 5 0 0 1-10 0c0-1.6.7-3 2-4.4.3 1.4.9 2.2 1.8 2.4C10.4 8 11 5.6 12 3Z" />,
  gem: <path d="M6 4h12l3 5-9 11L3 9l3-5ZM3 9h18M9 4l-1 5 4 11 4-11-1-5" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></>,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  sound: <path d="M4 9v6h4l5 4V5L8 9H4Zm12-1a5 5 0 0 1 0 8m2.5-11a8.5 8.5 0 0 1 0 14" />,
  mute: <path d="M4 9v6h4l5 4V5L8 9H4Zm12 1 5 5m0-5-5 5" />,
  bulb: <path d="M9 18h6m-5 3h4m-5-6c-2-1.4-3-3.3-3-5.5a6 6 0 0 1 12 0c0 2.2-1 4.1-3 5.5v1H9v-1Z" />,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  unlock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 7.5-2" /></>,
  mountain: <path d="M2 19h20L15 6l-4 7-2-3-7 9Zm13-13 2.5 4.5" />,
  scales: <path d="M12 4v16m-4 0h8M4 8h16m-8-4-8 4m8-4 8 4M1.5 14a3 3 0 0 0 5 0L4 8.5 1.5 14Zm16 0a3 3 0 0 0 5 0L20 8.5 17.5 14Z" />,
  masks: <path d="M3 5h9v7a4.5 4.5 0 0 1-9 0V5Zm3 3.5h.01M9 8.5h.01M5.5 13c1.3 1 3.7 1 5 0M12 5h9v7a4.5 4.5 0 0 1-9 0" />,
  cross: <path d="M5 5l14 14M19 5 5 19" />,
  send: <path d="M3 12 21 4l-7 17-2.5-7L3 12Z" />,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
  crown: <path d="M3 8l3.5 4L12 5l5.5 7L21 8l-2 11H5L3 8Zm2 7h14" />,
  cap: <path d="M12 4 2 9l10 5 10-5-10-5Zm-6 7.5V17c0 1.4 2.7 3 6 3s6-1.6 6-3v-5.5M20 9.5v5" />,
  flag: <path d="M6 21V4m0 1h12l-2.5 4.5L18 14H6" />,
  dice: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01" /></>,
  refresh: <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" />,
  trophy: <path d="M7 4h10v6a5 5 0 0 1-10 0V4Zm0 2H4v2a3 3 0 0 0 3 3m10-5h3v2a3 3 0 0 1-3 3m-5 5v3m-4 2h8" />,
  print: <><path d="M7 9V3h10v6M7 19H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M7 15h10v6H7z" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 5 5" /></>,
  chair: <path d="M6 3h12v9H6V3Zm-2 9h16v3H4v-3Zm2 3v6m12-6v6" />,
  mirror: <><ellipse cx="12" cy="10" rx="6" ry="8" /><path d="M12 18v3m-3 0h6" /></>,
  camera: <><rect x="2" y="7" width="20" height="13" rx="2" /><circle cx="12" cy="13.5" r="3.5" /><path d="M8 7l1.5-3h5L16 7" /></>,
  face: <><circle cx="12" cy="12" r="9" /><path d="M8.5 10h.01M15.5 10h.01M8.5 15h7" /></>,
  ice: <path d="M12 2v20M4 7l16 10M20 7 4 17M12 6l-2.5-2.5M12 6l2.5-2.5M12 18l-2.5 2.5M12 18l2.5 2.5" />,
  mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4m-3 0h6" /></>,
  smile: <><circle cx="12" cy="12" r="9" /><path d="M8.5 10h.01M15.5 10h.01M8 14c1 1.6 2.4 2.4 4 2.4s3-.8 4-2.4" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" /></>,
  books: <path d="M4 5h5v15H4V5Zm6 0h5v15h-5V5Zm7.5.6 3.9 1 -3.4 14-3.9-1 3.4-14Z" />,
  book: <path d="M4 4h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v14h-6a3 3 0 0 0-2 1 3 3 0 0 0-2-1H4V4Zm8 1v14" />,
  person: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" /></>,
  tools: <path d="m14 7 3-3 3 3-3 3-3-3Zm-1 4 7 7-2.5 2.5-7-7M9 3 4 8l3 3 5-5-3-3ZM4 20l5-5" />,
  shield: <path d="M12 3l8 3v6c0 4.6-3.2 8-8 9-4.8-1-8-4.4-8-9V6l8-3Z" />,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" /></>,
  sliders: <path d="M5 3v8m0 4v6m7-18v4m0 4v10m7-18v11m0 4v3M2.5 12h5m2-5h5m2 8h5" />,
  handshake: <path d="M2 10.5 6 8l4 3M22 10.5 18 8l-4 3m-4 0-1.5 1.5a1.5 1.5 0 0 0 2 2.2l.5-.4 2 1.8a1.5 1.5 0 0 0 2.2-2m-3.2-3.1 1.5 1.3m-5.5-1.5L6 8m8 3 4-3M2 10.5v3l3 2.5m17-5.5v3l-3 2.5" />,
  door: <path d="M5 3h11v18H5V3Zm11 2h3v14h-3M12 12h.01" />,
  bolt: <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />,
  climb: <path d="M5 21 9 9l5-3 4 4-4 2-1 3 5 6M12 4.5A1.5 1.5 0 1 0 12 4.4" />,
  ladder: <path d="M7 2v20M17 2v20M7 7h10M7 12h10M7 17h10" />,
  chart: <path d="M3 21h18M6 21V10m5 11V4m5 17v-8" />,
  anchor: <path d="M12 8v13M8 5a4 4 0 0 1 8 0 4 4 0 0 1-8 0ZM4 14a8 8 0 0 0 16 0m-16 0h3m13 0h3" />,
  bricks: <path d="M3 5h18v14H3V5Zm0 4.7h18M3 14.3h18M9.5 5v4.7M15.5 5v4.7M6.5 9.7v4.6M12.5 9.7v4.6M18.5 9.7v4.6M9.5 14.3V19M15.5 14.3V19" />,
  factory: <path d="M3 21V10l5 3V10l5 3V7l8 4v10H3Zm4-4h2m4 0h2" />,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" /></>,
  bank: <path d="M3 9 12 4l9 5H3Zm2 2v8m5-8v8m4-8v8m5-8v8M3 21h18" />,
  laptop: <path d="M5 5h14v11H5V5ZM2 19h20l-2-3H4l-2 3Z" />,
  building: <><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 7h2m4 0h.5M9 11h2m4 0h.5M9 15h2m4 0h.5M10 21v-3h4v3" /></>,
  worried: <><circle cx="12" cy="12" r="9" /><path d="M8.5 10h.01M15.5 10h.01M8.5 16c1-1.4 2.2-2 3.5-2s2.5.6 3.5 2" /></>,
  angry: <><circle cx="12" cy="12" r="9" /><path d="m7 8.5 3 1.5m7-1.5-3 1.5M8.5 16h7" /></>,
  key: <><circle cx="8" cy="12" r="4" /><path d="M12 12h9m-3 0v3m-2-3v2" /></>,
  box: <path d="M3 8l9-5 9 5v8l-9 5-9-5V8Zm0 0 9 5m0 0 9-5m-9 5v8" />,
  rocket: <path d="M12 2c3 2.5 5 6 5 10l-2 3H9l-2-3c0-4 2-7.5 5-10Zm0 7.5h.01M7 15l-2 5 4-1.5M17 15l2 5-4-1.5" />,
  house: <path d="M3 11 12 3l9 8M6 10v10h12V10M10 20v-6h4v6" />,
  car: <path d="M4 16v3H2v-3m20 0v3h-2v-3M3 16h18l-1-5-2-4H7L5 11l-2 5Zm3-5h12M7 16h.01M17 16h.01" />,
  satellite: <path d="m7 7 4-4 3 3-4 4-3-3Zm3 3-4 4 3 3 4-4M3 21c4 0 7-3 7-7m6-9 3-3m-1 8a6 6 0 0 0-6-6" />,
  pen: <path d="M3 21l1-5L16 4l4 4L8 20l-5 1Zm11-16 4 4" />,
  belt: <path d="M3 9h18v6H3V9Zm7 0v6m4-6v6M2 12h1m18 0h1" />,
  question: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.7-.8 1.3v.6M12 17h.01" /></>,
  map: <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15" />,
  check: <path d="m4 13 5 5L20 6" />,
  warning: <path d="M12 3 2 20h20L12 3Zm0 6v6m0 3h.01" />,
  chat: <path d="M4 5h16v11H9l-5 4V5Zm4 4h8m-8 4h5" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
};

/** Значки, которым идёт заливка, а не обводка: у них силуэт читается лучше. */
const FILLED = new Set<IconName>(["flame", "star", "send", "bolt", "shield"]);

export function Icon({ name, title, className = "" }: {
  name: IconName;
  /** Доступное имя. Нужно ТОЛЬКО там, где рядом нет текста. */
  title?: string;
  className?: string;
}) {
  const filled = FILLED.has(name);
  return (
    <svg
      className={`ico${className ? ` ${className}` : ""}`}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={filled ? undefined : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name]}
    </svg>
  );
}

/** Значок по строке из данных: сценарии и блоки курса хранят ИМЯ, а не символ.
 *  Неизвестное имя не должно ронять экран — вместо него нейтральная метка. */
export function DataIcon({ name, className }: { name: string; className?: string }) {
  const known = name in PATHS ? (name as IconName) : "target";
  return <Icon name={known} className={className} />;
}
