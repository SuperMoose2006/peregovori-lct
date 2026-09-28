// flows.mjs — пользовательские сценарии целиком: партия, экзамен, слои.
//
// ЧТО ДОКАЗЫВАЕТ. Юнит-тесты доказывают движок; smoke.mjs — что экраны
// открываются. Этот прибор проходит путь человека от главной до разбора и
// проверяет обещания продукта там, где их видит человек:
//
//   practice-principled  первый визит, всё с клавиатуры: Tab до оппонента,
//                        Tab до поля, реплики Enter'ом → разбор, грейд A/B
//   practice-aggressive  грубость и ультиматумы → срыв или F (инвариант 2)
//   exam                 (EN) слои из профиля погашены, шторка заперта и
//                        объясняет почему, судьи нет, экран результата
//   layers-profile       слои в профиле: офлайн голос/камера недоступны и не
//                        переключаются, «покерфейс» внутри камеры и заперт без неё
//   layers-drawer        то же в шторке за столом; включённая камера называет
//                        серверную причину; после этого партия играется текстом
//
// На каждом экране — гигиена из harness.mjs (консоль, эмодзи, alt, внешние
// запросы). Скриншоты — артефакт, не критерий.
//
// ЗАПУСК (офлайн, на своём порту и своей сборке — чужой dist не трогаем):
//   cd frontend && npx vite build --outDir /tmp/e2e-dist --emptyOutDir
//   cd services/gateway && NEGO_AI=off NEGO_FRONTEND_DIST=/tmp/e2e-dist \
//     ./.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8013
//   node e2e/flows.mjs --url http://127.0.0.1:8013 --out /tmp/e2e-flows [--only exam] [--strict]
//
// Только локально: harness отказывается от нелокального адреса.
import {
  Suite, I18N, GAMES, HOSTILE_RU, SERVER_SIDE_REASON, composer, waitTable, playLine, playUntilDebrief,
  readDebrief, escapeModals, nav, tabTo, switchState, until, focusIsVisible, describeFocus,
} from "./harness.mjs";

// ИЗВЕСТНЫЕ ОТКРЫТЫЕ ДЕФЕКТЫ. Проверка остаётся в правильной форме; дефект из
// списка печатается со снимком, но прогон не краснеет (кроме --strict).
// Починили — прибор сам скажет «больше не воспроизводится», и строку надо убрать.
const KNOWN_BUGS = {
  "layers-offline-offered":
    "Офлайн (сервер без облака, cloud_ai=false) «Голосом» и «Камера» в профиле и в шторке " +
    "выглядят доступными: переключатель активен, подпись «оценка та же». Честная причина " +
    "появляется только ПОСЛЕ включения, когда стол перезапустился и сервер ответил. " +
    "Клиент не смотрит в /api/health (cloud_ai, voice) до партии, а detectLayers знает только браузер.",
  "layer-off-wrong-advice":
    "Камеру отказал СЕРВЕР (нет облачного зрения), а строка за столом всё равно советует " +
    "«Разрешите доступ в браузере и начните заново» — совет, который не может помочь: " +
    "Table.tsx дописывает t.live.offHow к любой причине отказа, серверной тоже.",
  "voice-offline-claims-live":
    "Офлайн (NEGO_AI=off, служба parakeet не поднята) с разрешённым микрофоном «Голосом» " +
    "остаётся ВКЛЮЧЁННЫМ с подписью «оценка та же»: session.created шлёт microphone:true, " +
    "потому что ParakeetASR.available() = «адрес настроен», а не «служба ответила», — " +
    "при том что /api/health говорит voice: unavailable (NEGO_AI=off). Четвёртое состояние.",
};


const suite = new Suite("flows.mjs", KNOWN_BUGS);
await suite.start();
const ru = I18N.ru;
const en = I18N.en;

// ---------------------------------------------------------------------------
// 1. Принципиальная партия с клавиатуры, первый визит.
await suite.flow("practice-principled", async (f) => {
  const t = ru;
  const page = await f.open();
  await f.visit("home");
  const toCard = await tabTo(page, '[data-scenario="rent"]', 80);
  f.check(toCard.ok, "Tab доходит до карточки оппонента", `последние остановки: ${toCard.stops.slice(-5).join(" → ")}`);
  if (!toCard.ok) await page.locator('[data-scenario="rent"]').focus();
  await page.keyboard.press("Enter");
  await waitTable(page);
  await f.visit("table");
  const toBox = await tabTo(page, "main textarea", 80);
  f.check(toBox.ok, `Tab доходит до поля реплики (${toBox.presses} нажатий)`,
    `последние остановки: ${toBox.stops.slice(-5).join(" → ")}`);
  if (!toBox.ok) await composer(page).focus();
  const lines = GAMES.principled.rent.ru;
  await playUntilDebrief(f, t, lines, { max: lines.length });
  f.screen = "outcome";
  const d = await readDebrief(page, t);
  await escapeModals(f);
  await f.visit("debrief");
  f.check(["A", "B"].includes(d.grade), "принципиальная партия → грейд A/B (инвариант 2)",
    `грейд ${d.grade}, счёт ${d.score}, исход ${d.status}`);
  f.check(d.status === "agreement", "принципиальная партия закрыта сделкой", `исход ${d.status}`);
  f.check(d.grade === page.proto.debrief?.grade, "буква на экране — буква движка",
    `экран ${d.grade}, движок ${page.proto.debrief?.grade}`);
});

// ---------------------------------------------------------------------------
// 2. Агрессия → срыв / F.
await suite.flow("practice-aggressive", async (f) => {
  const t = ru;
  const page = await f.open({ tutorialDone: true });
  await f.visit("home");
  await page.locator('[data-scenario="supplier"]').click();
  await waitTable(page);
  await f.visit("table");
  await composer(page).focus();
  const played = await playUntilDebrief(f, t, HOSTILE_RU, { max: 12 });
  f.screen = "outcome";
  const d = await readDebrief(page, t);
  await escapeModals(f);
  await f.visit("debrief");
  f.check(d.grade === "F" || d.status === "breakdown", "агрессия → срыв или F (инвариант 2)",
    `грейд ${d.grade}, счёт ${d.score}, исход ${d.status}, ходов ${played}`);
  f.check(!["A", "B"].includes(d.grade), "агрессия не получает A/B", `грейд ${d.grade}`);
});

// ---------------------------------------------------------------------------
// 3. Экзамен (EN): слои погашены при включённых в профиле, шторка заперта.
await suite.flow("exam", async (f) => {
  const t = en;
  const prefs = { probe: true, avatar: true, voice: false, camera: false, pokerface: false };
  const page = await f.open({ lang: "en", tutorialDone: true,
                              storage: { "dialog.layers.v1": JSON.stringify(prefs) } });
  await nav(page, "exam");
  await f.visit("exam-home");
  const name = "E2E Candidate";
  await page.getByLabel(t.exam.nameLabel).fill(name);
  await page.locator('[data-scenario="supplier"]').click();
  await waitTable(page);
  await f.visit("exam-table");

  const init = page.proto.inits.at(-1) ?? {};
  f.check(init.gameMode === "exam", "session.init идёт режимом exam", `gameMode=${init.gameMode}`);
  f.check(Object.values(init.layers ?? {}).every((v) => !v),
    "экзамен гасит слои, хотя в профиле включены «Читай лицо» и «Лицо оппонента»",
    JSON.stringify(init.layers));
  f.check(page.proto.caps.at(-1)?.judge === false, "на экзамене сервер не поднимает судью",
    `capabilities.judge=${page.proto.caps.at(-1)?.judge}`);
  f.check(!(await page.getByRole("button", { name: t.hint, exact: true }).count()),
    "на экзамене нет кнопки подсказки");

  const opener = page.getByRole("button", { name: t.layers.head, exact: true });
  await opener.click();
  const dlg = page.getByRole("dialog", { name: t.layers.head });
  await dlg.waitFor();
  await f.visit("exam-layers");
  f.check(await dlg.getByRole("status").filter({ hasText: t.layers.lockedMode }).count() === 1,
    "шторка экзамена называет замок словами", `ожидалось «${t.layers.lockedMode}»`);
  for (const [id, label] of Object.entries(t.layers.names)) {
    const s = await switchState(dlg, label);
    f.check(s && !s.checked && s.disabled, `экзамен: «${label}» выключен и заперт`, JSON.stringify(s));
    if (id === "probe" && s) {
      // force: запертый переключатель помечен aria-disabled, и playwright сам
      // отказывается жать. Человек жать может — проверяется, что НИЧЕГО не будет.
      await dlg.getByRole("switch", { name: label, exact: true }).click({ force: true });
      const after = await switchState(dlg, label);
      f.check(!after.checked, `экзамен: клик по «${label}» ничего не включает`);
    }
  }
  for (const label of Object.values(t.layers.presetNames)) {
    const p = dlg.getByRole("button", { name: label, exact: true });
    f.check((await p.getAttribute("aria-disabled")) === "true", `экзамен: пресет «${label}» заперт`);
  }
  f.check(page.proto.inits.length === 1, "попытка переключить слой не перезапустила экзамен",
    `session.init отправлен ${page.proto.inits.length} раз`);
  await page.keyboard.press("Escape");
  await dlg.waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
  f.check(!(await dlg.count()), "Esc закрывает шторку слоёв");
  f.check(await page.evaluate((n) => document.activeElement?.textContent?.trim() === n, t.layers.head),
    "фокус вернулся на кнопку «Слои»", await describeFocus(page));

  await composer(page).focus();
  await playUntilDebrief(f, t, GAMES.principled.supplier.en, { max: 6 });
  f.screen = "exam-outcome";
  const d = await readDebrief(page, t, { exam: true });
  await escapeModals(f);
  await f.visit("exam-result");
  f.check(["A", "B"].includes(d.grade), "принципиальный экзамен (EN) → A/B",
    `грейд ${d.grade}, счёт ${d.score}, исход ${d.status}`);
  f.check(await page.getByText(name, { exact: false }).count() > 0,
    "имя из поля экзамена стоит на результате");
});

// ---------------------------------------------------------------------------
// Слои: общие проверки для профиля и шторки.

/** Офлайн голос и камера обязаны быть «недоступно» с причиной и не переключаться. */
async function offlineLayersHonest(f, scope, t, where, { click }) {
  const bad = [];
  for (const id of ["voice", "camera"]) {
    const label = t.layers.names[id];
    const s = await switchState(scope, label);
    if (!s) { bad.push(`«${label}» не найден`); continue; }
    const honest = s.disabled && !s.checked && !!s.note && s.note !== t.layers.sameGrade;
    let flipped = false;
    if (click) {
      await scope.getByRole("switch", { name: label, exact: true }).click({ force: true });
      const after = await switchState(scope, label);
      flipped = after.checked !== s.checked;
      // Вернуть как было: остальные проверки не должны стоять на сломанном.
      if (flipped) await scope.getByRole("switch", { name: label, exact: true }).click({ force: true });
    }
    if (!honest || flipped) {
      bad.push(`«${label}»: aria-disabled=${s.disabled}, aria-checked=${s.checked}, подпись «${s.note}»` +
               (flipped ? ", клик переключил" : ""));
    }
  }
  await f.known("layers-offline-offered", bad.length === 0,
    `${where}: офлайн «Голосом» и «Камера» — «недоступно» с причиной и не переключаются`, bad.join("; "));
}

/** «Покерфейс» живёт внутри карточки камеры и заперт, пока камера выключена. */
async function pokerfaceNested(f, scope, t, where) {
  const names = t.layers.names;
  const poker = scope.getByRole("switch", { name: names.pokerface, exact: true });
  const cam = scope.getByRole("switch", { name: names.camera, exact: true });
  if (!f.check(await poker.count() === 1 && await cam.count() === 1, `${where}: есть «${names.pokerface}» и «${names.camera}»`)) return;
  const others = [];
  for (const id of ["voice", "probe", "avatar"]) {
    const h = await scope.getByRole("switch", { name: names[id], exact: true }).elementHandle();
    if (h) others.push(h);
  }
  // Наименьший общий предок «покерфейса» и камеры — это карточка камеры, если
  // «покерфейс» внутри неё. Если он соседняя карточка, общий предок — весь
  // список, и в нём окажутся чужие переключатели.
  const nested = await f.page.evaluate(([p, c, ...rest]) => {
    let a = p.parentElement;
    while (a && !a.contains(c)) a = a.parentElement;
    return !!a && rest.every((o) => !a.contains(o));
  }, [await poker.elementHandle(), await cam.elementHandle(), ...others]);
  f.check(nested, `${where}: «${names.pokerface}» — внутри карточки «${names.camera}», а не соседней карточкой`);
  const c = await switchState(scope, names.camera);
  const p = await switchState(scope, names.pokerface);
  if (!c.checked) {
    f.check(p.disabled && !p.checked, `${where}: «${names.pokerface}» заперт, пока камера выключена`, JSON.stringify(p));
    f.check(!!p.note && p.note !== t.layers.sameGrade, `${where}: под «${names.pokerface}» написано почему`, `«${p.note}»`);
    await poker.click({ force: true });
    f.check(!(await switchState(scope, names.pokerface)).checked, `${where}: клик по «${names.pokerface}» без камеры ничего не включает`);
  }
}


// ---------------------------------------------------------------------------
// 4. Слои в профиле.
await suite.flow("layers-profile", async (f) => {
  const t = ru;
  const p = await f.open({ tutorialDone: true });
  await nav(p, "profile");
  await p.getByRole("heading", { level: 2, name: t.layers.head, exact: true }).waitFor();
  await f.visit("profile");
  const scope = p.getByRole("main");
  await offlineLayersHonest(f, scope, t, "профиль", { click: true });
  await pokerfaceNested(f, scope, t, "профиль");

  // Доступный слой переключается и переживает перезагрузку (выбор — настройка профиля).
  const avatar = t.layers.names.avatar;
  await scope.getByRole("switch", { name: avatar, exact: true }).click();
  f.check((await switchState(scope, avatar)).checked, `профиль: «${avatar}» включается`);
  await p.reload({ waitUntil: "networkidle" });
  await nav(p, "profile");
  f.check((await switchState(p.getByRole("main"), avatar))?.checked, `профиль: «${avatar}» пережил перезагрузку`);
  const classic = p.getByRole("main").getByRole("button", { name: t.layers.presetNames.classic, exact: true });
  await classic.click();
  const all = await Promise.all(Object.values(t.layers.names).map((n) => switchState(p.getByRole("main"), n)));
  f.check(all.every((s) => s && !s.checked), "пресет «Классика» выключает всё",
    JSON.stringify(all.map((s) => s?.checked)));
  f.check((await classic.getAttribute("aria-pressed")) === "true", "пресет «Классика» отмечен выбранным");
  await f.visit("profile-after");
});

// ---------------------------------------------------------------------------
// 5. Шторка слоёв за столом.
await suite.flow("layers-drawer", async (f) => {
  const t = ru;
  const p = await f.open({ tutorialDone: true });
  await p.locator('[data-scenario="rent"]').click();
  await waitTable(p);
  await f.visit("table");
  const caps0 = p.proto.caps.at(-1) ?? {};
  f.check(caps0.cloud_ai === false, "офлайн-шлюз сообщает cloud_ai=false (прогон идёт там, где надо)",
    `cloud_ai=${caps0.cloud_ai}`);

  const opener = p.getByRole("button", { name: t.layers.head, exact: true });
  await opener.focus();
  await p.keyboard.press("Enter");
  const dlg = p.getByRole("dialog", { name: t.layers.head });
  await dlg.waitFor();
  await f.visit("drawer");
  f.check(await dlg.evaluate((el) => el.contains(document.activeElement)), "фокус внутри шторки после открытия",
    await describeFocus(p));
  const vis = await focusIsVisible(p);
  f.check(vis.ok, "фокус в шторке виден", vis.why);
  f.check(!(await dlg.getByRole("status").filter({ hasText: t.layers.lockedMode }).count()),
    "в тренировке до первого хода шторка не заперта");
  await offlineLayersHonest(f, dlg, t, "шторка", { click: false });
  await pokerfaceNested(f, dlg, t, "шторка");

  // Человек всё-таки просит камеру: сервер без зрения обязан сказать это словами.
  const camLabel = t.layers.names.camera;
  const inits = p.proto.inits.length;
  await dlg.getByRole("switch", { name: camLabel, exact: true }).click();
  let cam = null;
  await until(async () => {
    cam = await switchState(p.getByRole("dialog", { name: t.layers.head }), camLabel);
    return cam && cam.disabled && cam.note && cam.note !== t.layers.sameGrade;
  }, 8000, "камера назвала причину").catch(() => {});
  await f.visit("drawer-camera-asked");
  f.check(cam && !cam.checked && cam.disabled && cam.note && cam.note !== t.layers.sameGrade,
    "запрошенная офлайн камера: выключена, заперта и названа причина", JSON.stringify(cam));
  if (p.proto.inits.length > inits) {
    f.check(cam?.note?.includes(SERVER_SIDE_REASON.camera.ru), "причина камеры — серверная (нет облачного зрения)",
      `«${cam?.note}»`);
  }
  const poker = await switchState(dlg, t.layers.names.pokerface);
  f.check(poker && poker.disabled && !poker.checked, "без камеры «Покерфейс» так и заперт", JSON.stringify(poker));

  // И голос. Микрофон браузер отдаёт (поддельное устройство, как у человека,
  // нажавшего «Разрешить») — значит честность здесь целиком на сервере.
  const voiceLabel = t.layers.names.voice;
  const created = p.proto.caps.length;
  await dlg.getByRole("switch", { name: voiceLabel, exact: true }).click();
  await until(() => p.proto.caps.length > created, 8000, "стол перезапустился со слоем голоса").catch(() => {});
  await p.waitForTimeout(1500);
  const voice = await switchState(dlg, voiceLabel);
  const capsV = p.proto.caps.at(-1) ?? {};
  await f.visit("drawer-voice-asked");
  await f.known("voice-offline-claims-live",
    voice && !voice.checked && voice.disabled && voice.note && voice.note !== t.layers.sameGrade,
    "офлайн «Голосом» после включения честно недоступен",
    `aria-checked=${voice?.checked}, подпись «${voice?.note}», session.created.microphone=${capsV.microphone}, ` +
    `/api/health voice=«${suite.health.voice}»`);

  await p.keyboard.press("Escape");
  await dlg.waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
  f.check(!(await dlg.count()), "Esc закрывает шторку");
  f.check(await p.evaluate((n) => document.activeElement?.textContent?.trim() === n, t.layers.head),
    "фокус вернулся на кнопку «Слои»", await describeFocus(p));

  // Строка отказа на столе: причина серверная — совет «разрешите в браузере» лишний.
  const off = p.getByRole("main").getByRole("status").filter({ hasText: SERVER_SIDE_REASON.camera.ru });
  const offText = (await off.count()) ? (await off.first().innerText()).replace(/\s+/g, " ") : "";
  f.check(!!offText, "стол называет отказ камеры строкой статуса", "строки со серверной причиной нет");
  if (offText) {
    await f.known("layer-off-wrong-advice", !offText.includes(t.live.offHow),
      "отказ сервера не советует разрешить доступ в браузере", `«${offText}»`);
  }

  // После всех отказов партия играется текстом.
  await composer(p).focus();
  await playLine(f, t, "Что для вас важно помимо цены?");
  f.ok("после отказов слоёв ход текстом проходит");
  await f.visit("table-after-layers");
});

await suite.finish();
