// modal.ts — то, без чего `aria-modal="true"` остаётся обещанием.
//
// ЧТО БЫЛО. Атрибут стоял и на шторке слоёв, и на карточке вехи, а поведения за
// ним не было: фон не помечался `inert`, фокус оставался снаружи диалога, Tab
// давал десять остановок в фоне, в фоновое поле ввода свободно печаталось.
// Хуже всего это именно для диктора: `aria-modal` прячет от него ВСЁ вне
// диалога, и курсор оказывался в месте, которого для человека не существует.
// Зрячий видел скрим, человек с клавиатурой — открытую настежь страницу.
//
// Четыре вещи, и все четыре обязательны: фокус внутрь, ловушка Tab, `inert` на
// фон, возврат фокуса на открывашку. Живут здесь, а не в двух компонентах:
// половина этого списка — ровно то, что забывают написать во второй раз.
import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export interface ModalOpts {
  /** Что становится инертным. Диалог обязан лежать ВНЕ этого поддерева —
   *  иначе инертным станет он сам (отсюда портал в body у обоих). */
  backdrop?: string;
  /** Куда вернуть фокус, если открывашки уже нет в документе. Ориентир `main`
   *  подходит всегда; шторка слоёв называет свою кнопку, потому что смена слоя
   *  до первого хода пересобирает стол вместе с ней. */
  restoreTo?: string;
}

/**
 * @param open   диалог показан
 * @param sheet  сам диалог; ДОЛЖЕН нести `tabIndex={-1}` — на случай, когда
 *               внутри нет ни одного фокусируемого элемента
 * @param onClose как закрыть (Esc)
 */
export function useModalShell(
  open: boolean,
  sheet: RefObject<HTMLElement | null>,
  onClose: () => void,
  opts: ModalOpts = {},
): void {
  const backdropSelector = opts.backdrop ?? ".app";
  const restoreTo = opts.restoreTo ?? "#main";
  // Замыкание на onClose держим через ref: иначе эффект пересобирался бы на
  // каждый рендер родителя, а вместе с ним — перевод фокуса и снятие inert.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const root = document.querySelector<HTMLElement>(backdropSelector);
    const el = sheet.current;
    // BODY в роли «открывашки» не годится: так выглядит окно, где фокуса не
    // было вовсе (карточка вехи всплывает сама, без нажатия), и возврат туда
    // означал бы оставить фокус на BODY — ровно то, от чего лечим.
    const active = document.activeElement as HTMLElement | null;
    const opener = active && active !== document.body && active !== document.documentElement
      ? active : null;
    const focusables = () => (el
      ? Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((n) => !n.hasAttribute("disabled") && n.offsetParent !== null)
      : []);
    // Порядок важен: фокус уходит ВНУТРЬ до того, как фон становится инертным,
    // иначе браузер снимает фокус сам и он падает на BODY.
    (focusables()[0] ?? el)?.focus();
    root?.setAttribute("inert", "");

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { closeRef.current(); return; }
      if (e.key !== "Tab") return;
      const f = focusables();
      if (!f.length) { e.preventDefault(); el?.focus(); return; }
      const cur = document.activeElement;
      const inside = !!el?.contains(cur);
      if (e.shiftKey && (!inside || cur === f[0])) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (!inside || cur === f[f.length - 1])) { e.preventDefault(); f[0].focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      root?.removeAttribute("inert");
      // Открывашки может уже не быть: смена слоя до первого хода перезапускает
      // сессию, и стол пересобирается вместе со своей кнопкой.
      if (opener && document.contains(opener)) opener.focus();
      else (document.querySelector<HTMLElement>(restoreTo)
            ?? document.querySelector<HTMLElement>("#main"))?.focus();
    };
  }, [open, sheet, backdropSelector, restoreTo]);
}
