// _layers.mjs — вход за стол и включение слоёв, общее для медийных приборов.
//
// ЧТО ЗДЕСЬ БЫЛО СЛОМАНО. Приборы `mediacheck`, `rtvoice`, `bargein`, `remote`
// и `denied` включали слои так:
//
//   await p.locator(".card .go, .card button").first().click().catch(()=>{});
//   await p.locator(".layer",{hasText:"Голосом"}).locator(".ly-sw").click().catch(()=>{});
//   await p.locator("button:has-text('НАЧАТЬ'), button:has-text('ЗА СТОЛ')").first().click().catch(()=>{});
//
// Полноэкранный экран подготовки из продукта убрали: карточка ведёт СРАЗУ за
// стол (это отдельно проверяет audit.mjs), а слои переехали в шторку, которую
// открывает кнопка `.lay-open` изнутри стола. Значит второй и третий клики
// промахивались — и `.catch(()=>{})` глотал промах молча. Прибор отыгрывал
// партию БЕЗ слоёв и честно печатал «включены слои: » (пусто), «getUserMedia:
// []», «ошибок: 0» — то есть докладывал об успехе замера, которого не делал.
//
// Отсюда правило этого модуля: ни одного `.catch(()=>{})` на пути, который
// что-то включает. Промах — исключение с внятной строкой, а не тишина.

/** Карточка стола ведёт СРАЗУ за стол: между ней и полем ввода экранов нет. */
export async function enterTable(page, { timeout = 40000 } = {}) {
  const card = page.locator(".card").first();
  if (!(await card.count())) throw new Error("на домашнем экране нет ни одной карточки стола");
  await card.click({ timeout: 15000 });
  await page.waitForSelector(".chat textarea", { timeout });
}

/**
 * Включает названные слои через шторку стола и ПРОВЕРЯЕТ, что они горят.
 *
 * `require: false` — для `denied.mjs`, где отказ устройства и есть предмет
 * замера: там слой обязан НЕ загореться, и это не поломка прибора.
 * Возвращает список включившихся — вызывающий печатает его сам.
 */
export async function enableLayers(page, names, { require = true } = {}) {
  const open = page.locator(".lay-open");
  if (!(await open.count())) throw new Error("за столом нет кнопки слоёв (.lay-open)");
  await open.click({ timeout: 15000 });
  await page.waitForSelector(".lay-sheet", { timeout: 10000 });

  for (const name of names) {
    const row = page.locator(".lay-sheet .layer", { hasText: name }).first();
    if (!(await row.count())) throw new Error(`в шторке слоёв нет строки «${name}»`);
    const sw = row.locator(".ly-sw").first();
    if (!(await sw.evaluate((e) => e.classList.contains("on")))) {
      await sw.click({ timeout: 10000 });
      await page.waitForTimeout(400);
    }
  }

  const state = await page.locator(".lay-sheet .layer").evaluateAll((els) =>
    els.map((e) => ({
      name: e.querySelector(".ly-txt b")?.textContent?.trim() ?? "?",
      on: !!e.querySelector(".ly-sw.on"),
      note: e.querySelector(".ly-note")?.textContent?.trim().slice(0, 70) ?? "",
    })));

  await page.locator(".lay-x").click({ timeout: 10000 }).catch(() => {});
  // Смена слоя до первого хода перезапускает сессию — стол монтируется заново.
  await page.waitForSelector(".chat textarea", { timeout: 40000 });

  const on = state.filter((s) => s.on).map((s) => s.name);
  if (require) {
    const dead = names.filter((n) => !on.some((o) => o.includes(n) || n.includes(o)));
    if (dead.length) {
      const why = state.filter((s) => dead.some((d) => s.name.includes(d)))
                       .map((s) => `${s.name}: ${s.note}`).join(" · ");
      throw new Error(`слои не включились: ${dead.join(", ")} — ${why || "причина не показана"}`);
    }
  }
  return state;
}
