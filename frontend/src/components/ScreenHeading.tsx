// ScreenHeading.tsx — a screen's primary heading that grabs keyboard focus when it
// mounts. Because each screen (home/game/debrief/profile) is conditionally rendered,
// a mount == a screen transition, so moving focus here on mount lands screen-reader
// and keyboard users at the top of the new context (an ARIA route-change pattern).
// tabIndex={-1} makes it programmatically focusable without adding it to the tab order.
import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  as?: "h1" | "h2";
  className?: string;
  children?: ReactNode;
  // Home's hero title carries inline <em>; allow the same raw-HTML seam h1 used.
  dangerouslySetInnerHTML?: { __html: string };
}

/** Первое монтирование за жизнь страницы — это ЗАГРУЗКА, а не переход.
 *
 *  Паттерн смены маршрута переводит фокус на заголовок нового экрана; на
 *  загрузке переходить не с чего, а унесённый внутрь `main` фокус делает
 *  недостижимой ссылку «к содержимому»: в прямом порядке обхода она стоит перед
 *  `main`, и первый Tab уходил уже мимо неё. (В StrictMode на `npm run dev`
 *  React монтирует дважды, поэтому там первым «переходом» окажется тот же
 *  экран — в сборке, которую видит человек, монтирование одно.) */
let booted = false;

export function ScreenHeading({ as = "h2", className, children, dangerouslySetInnerHTML }: Props) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!booted) { booted = true; return; }
    // preventScroll matters: the point is to move SCREEN-READER focus, not to
    // move the viewport. Each screen transition already scrolls itself to the
    // top, and a plain focus() fights that — under the game skin's grid shell it
    // dragged the page 715px down to the heading on first paint.
    ref.current?.focus({ preventScroll: true });
  }, []);
  const Tag = as;
  return (
    <Tag
      ref={ref}
      tabIndex={-1}
      data-screen-heading=""
      className={className}
      dangerouslySetInnerHTML={dangerouslySetInnerHTML}
    >
      {children}
    </Tag>
  );
}
