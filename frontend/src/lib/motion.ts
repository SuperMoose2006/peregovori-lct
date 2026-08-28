// motion.ts — одно место, где решается «плавно или мгновенно».
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ. В styles.css стоит честное
// `@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto !important } }`,
// и оно НИЧЕГО не значило для восьми переходов между экранами: аргумент
// `behavior: "smooth"`, переданный в `scrollTo`/`scrollIntoView`, по спецификации
// перекрывает вычисленный `scroll-behavior` — `!important` до него не достаёт.
// Замер при включённом reduce показывал ту же четырёхсотмиллисекундную
// анимацию. Поэтому «плавно» спрашивают здесь, а не пишут константой.
export function scrollBehavior(): ScrollBehavior {
  try {
    // matchMedia нет в jsdom и в node-тестах — «мгновенно» безопаснее.
    return typeof matchMedia === "function"
      && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  } catch {
    return "auto";
  }
}

/** Наверх страницы — переход между экранами. */
export function scrollTop(): void {
  try {
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  } catch {
    /* окна может не быть вовсе (тест, серверный рендер) */
  }
}

/** Подвести элемент в поле зрения, уважая просьбу не анимировать. */
export function scrollTo(el: Element | null | undefined, opts: ScrollIntoViewOptions = {}): void {
  el?.scrollIntoView({ ...opts, behavior: scrollBehavior() });
}
