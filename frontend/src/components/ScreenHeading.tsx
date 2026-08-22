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

export function ScreenHeading({ as = "h2", className, children, dangerouslySetInnerHTML }: Props) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
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
