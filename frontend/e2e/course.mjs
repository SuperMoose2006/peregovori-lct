// course.mjs — сквозной проход блока курса ЭТАЛОННЫМИ ответами.
//
// Что он доказывает, чего не доказывают юнит-тесты: что банк, экраны и профиль
// сходятся ВМЕСТЕ. Ответы берутся из того же сгенерированного банка, который
// показывает продукт, вводятся через настоящий интерфейс (клики, ввод, drag-free
// перестановка кнопками) и обязаны быть засчитаны. Если эталонный ответ не
// зачтён — прогон падает с типом задания и причиной отказа.
//
// Затем сдаётся экзамен блока теми же ответами и проверяется, что блок стал
// пройденным, а следующий открылся.
//
// ЭКЗАМЕН БЛОКА ЗАКАНЧИВАЕТСЯ КАПСТОУНОМ, И ЕГО НАДО СЫГРАТЬ. `drawExam`
// ставит упражнения типа `drill` последними, а у капстоуна нет ни «Проверить»,
// ни «Завершить»: единственная кнопка ведёт в настоящую мини-партию. Прибор
// раньше видел капстоун и считал экзамен законченным — жал первую попавшуюся
// `button.btn.primary`, уходил в партию и уже не возвращался. Из-за этого три
// главных утверждения ниже — «экзамен сдан», «блок пройден», «следующий
// открылся» — не проверялись НИ РАЗУ.
//
// А КОГДА СТАЛИ ПРОВЕРЯТЬСЯ — нашёлся дефект, который они всё равно не ловили:
// экрана итога экзамена не существовало. Партия возвращала СРАЗУ на карту
// блоков, счёт, разбор промахов и урок восстановления не показывались никому, а
// провалившему об этом сообщала реплика оппонента. Утверждения «карта говорит
// done» держались и на этом — поэтому здесь добавлен ещё один шаг: экран итога
// обязан появиться ПОСЛЕ капстоуна и назвать счёт словами.
//
//   node e2e/course.mjs [--url http://127.0.0.1:8010] [--out /tmp/dialog-e2e]
import { chromium } from "playwright-core";
import { I18N } from "../src/i18n.ts";
import { COURSE_BANK as BANK, COURSE_MASTER } from "../src/data/course.generated.ts";
import { COURSE_BLOCKS } from "../src/data/course.blocks.generated.ts";
import { readFileSync, mkdirSync, appendFileSync, writeFileSync } from "node:fs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const LANG = arg("lang", "ru");
const T = I18N[LANG];
if (!T) throw Error("Unsupported language");
const BASE = arg("url", "http://127.0.0.1:8010");
const OUT_BASE = arg("out", "/tmp/dialog-e2e");
let OUT = OUT_BASE;
const BLOCK_COUNT = Number(arg("blocks", "1"));
if (!Number.isInteger(BLOCK_COUNT) || BLOCK_COUNT < 1) throw Error("--blocks must be a positive integer");
const EXE = process.env.CHROME_PATH
  || "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT_BASE}/steps.jsonl`, "");

// Ответы берём из сгенерированного банка — как их знает продукт.
const BLOCK_IDS = COURSE_BLOCKS.map(block => block.id);
let currentBlock;
async function currentExercise() {
  const prompt = (await p.locator(".ex-prompt").innerText()).trim();
  const quote = (await p.locator(".ex-quote").allTextContents()).join("\n");
  const candidates = BANK.filter(x => x.block === currentBlock && x.prompt[LANG] === prompt
    && (!x.player_line || !["meters", "reaction"].includes(x.type) || quote.includes(x.player_line[LANG])));
  if (candidates.length !== 1) throw Error(`Ambiguous visible exercise: ${currentBlock}, ${prompt}, candidates=${candidates.map(x=>x.id)}`);
  return candidates[0];
}

// ЛИНИЯ КАПСТОУНА БЕРЁТСЯ ИЗ ФИКСТУРЫ ЭТАЛОННЫХ ПАРТИЙ, А НЕ ПИШЕТСЯ ЗДЕСЬ.
// `frontend/test/fixtures/games.json` — тот же набор, которым
// tests/test_reference_games.py и test/games.test.ts доказывают инвариант 2 и
// инвариант 8. Своя линия «по мотивам» однажды уже перестала закрывать сделку и
// увела на полдня в поиск несуществующего дефекта движка: правки лексикона и
// баланса до неё не доходили, потому что её никто не проверял.
const GAMES = JSON.parse(
  readFileSync(new URL("../test/fixtures/games.json", import.meta.url), "utf8"));

let browser;
try {
  browser = await chromium.launch({ executablePath: EXE });
} catch (e) {
  console.error(`не удалось запустить chromium (${EXE}). CHROME_PATH=… или npx playwright install chromium\n${e}`);
  process.exit(2);
}
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const p = await ctx.newPage();
const errs = [];
const trace = async label => appendFileSync(`${OUT_BASE}/steps.jsonl`, JSON.stringify({label, lang:LANG, text:await p.locator("body").innerText()}) + "\n");
p.on("pageerror", (e) => errs.push(String(e)));
p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("Failed to load")) errs.push(m.text().slice(0,120)); });

await p.goto(BASE, { waitUntil: "networkidle" });
if (LANG === "en") await p.getByRole("button", { name: "EN", exact: true }).click();
// КЛЮЧ ОБУЧЕНИЯ — `dialog.tutorialDone.v1` СО ЗНАЧЕНИЕМ "1" (lib/progress.ts).
// Прибор ставил `dialog.tutorial.v1` = "done": ключ, которого продукт не знает.
// На экранах курса это ничем не пахло, а вот капстоун идёт в режиме practice —
// и вводный тур вставал ровно поперёк партии, которую прибор пришёл играть.
await p.evaluate(() => localStorage.setItem("dialog.tutorialDone.v1", "1"));
await p.reload({ waitUntil: "networkidle" });

// Отвечает верно на текущее задание, опознавая тип по разметке.
async function answer(forceWrong = false) {
  const kind = (await p.locator(".ex").getAttribute("class")) || "";
  const type = (kind.match(/ex--([a-z_]+)/) || [])[1];
  const ex = await currentExercise();
  if (type === "choice" || type === "spot_error" || type === "reaction" ||
      type === "meters" || type === "face") {
    // Верный вариант ищем по тексту: банк знает ответ, разметка знает порядок.
    let label;
    if (type === "choice" || type === "spot_error") label = ex.options[ex.answer][LANG];
    else if (type === "meters") label = T.course.meters[ex.answer];
    else label = T.probe.reactions[ex.answer];
    if(forceWrong)await p.locator(".ex-opt").filter({hasNotText:label}).first().click();
    else await p.locator(".ex-opt", { hasText: label }).first().click();
  } else if (type === "numeric") {
    await p.locator(".ex-num input").fill(String(ex.answer.value));
  } else if (type === "freeform") {
    await p.locator(".ex-free textarea").fill(ex.reference[LANG]);
  } else if (type === "order") {
    // Поднимаем каждый элемент на своё место кнопками ↑
    for (let target = 0; target < ex.answer.length; target++) {
      const want = ex.items.find((i) => i.id === ex.answer[target])[LANG];
      const rows = p.locator(".ex-order li");
      const n = await rows.count();
      let at = -1;
      for (let k = 0; k < n; k++) {
        if (((await rows.nth(k).locator(".ex-ord-t").textContent()) || "").trim() === want) { at = k; break; }
      }
      for (let k = at; k > target; k--) {
        await p.locator(".ex-order li").nth(k).locator("button").first().click();
      }
    }
  } else if (type === "match") {
    for (const [left, right] of Object.entries(ex.answer)) {
      const lt = ex.left.find((l) => l.id === left)[LANG];
      const rt = ex.right.find((r) => r.id === right)[LANG];
      await p.locator(".ex-match ul").first().locator("button", { hasText: lt }).first().click();
      await p.locator(".ex-match ul").nth(1).locator("button", { hasText: rt }).first().click();
    }
  } else if (type === "drill") {
    return "drill";
  }
  await p.getByRole("button", { name: T.course.checkIt, exact: true }).click();
  await p.waitForTimeout(300);
  const ok = (await p.locator(".ex-verdict.ok").count()) === 1;
  const rejected = forceWrong && ["choice","spot_error","reaction","meters","face"].includes(type);
  if (ok === rejected) {
    const why = await p.locator(".ex-verdict").textContent();
    throw new Error(`эталонный ответ не засчитан (${type}): ${why?.slice(0, 160)}`);
  }
  await trace(`exercise ${ex.id}: ${rejected ? "incorrect answer rejected" : "correct answer"}`);
  console.log(`${rejected ? "REJECT" : "PASS"} exercise ${ex.id} ${LANG}`);
  return type;
}

/**
 * Убирает модальные вехи, если продукт их показал.
 *
 * «Веха» (`.milestone-scrim`) — полноэкранный диалог про серию и повышение
 * ранга; он всплывает по накопленному XP, то есть ровно посреди прохода курса.
 * Playwright не жмёт сквозь него и падает по таймауту с «intercepts pointer
 * events» — а выглядит это как «кнопки капстоуна нет». Вех может прийти
 * несколько подряд (кнопка подписана «1/2»), поэтому закрываем в цикле.
 */
async function clearScrims() {
  for (let i = 0; i < 6; i++) {
    if (!(await p.locator(".milestone-scrim").count())) return;
    await p.locator(".milestone-go").first().click({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(400);
  }
}

/**
 * Доигрывает капстоун: настоящая мини-партия эталонной линией.
 *
 * Ждать фиксированные паузы здесь нельзя — ход идёт в модель, и на живом
 * шлюзе он занимает от секунды до десятка. Ждём СОБЫТИЯ: появления новой
 * реплики оппонента, а на последнем ходу — вердикта капстоуна.
 */
async function playCapstone(masterExercise) {
  await clearScrims();
  const ex = masterExercise ?? await currentExercise();
  const lines = GAMES.principled?.[ex.scenario_id]?.[LANG];
  if (!lines) throw new Error(
    `нет эталонной линии для стола «${ex.scenario_id}» в test/fixtures/games.json`);
  console.log(`  капстоун ${ex.id}: стол «${ex.scenario_id}», ${lines.length} реплик`);

  await p.locator(masterExercise ? ".wrap.lesson > button.btn.primary" : ".ex-drill button.btn.primary").click();
  await p.waitForSelector(".chat textarea", { timeout: 40000 });
  for (const line of lines) {
    if (await p.locator(".drill-verdict, .debrief").count()) break;
    await clearScrims();
    const before = await p.locator(".msg.opp").count();
    await p.locator(".chat textarea").fill(line);
    await p.locator(".send").click({ timeout: 20000 });
    // Либо оппонент ответил, либо партия закрылась — обоих ждём одним условием.
    await p.waitForFunction(
      (n) => document.querySelectorAll(".msg.opp").length > n
             || document.querySelector(".drill-verdict, .debrief") !== null,
      before, { timeout: 120000 });
    await trace(`drill ${ex.id}: turn`);
  }
  await p.waitForSelector(".drill-verdict", { timeout: 120000 });
  await clearScrims();
  const ok = (await p.locator(".drill-verdict.ok").count()) === 1;
  const verdict = ((await p.locator(".drill-verdict b").textContent()) || "").trim();
  await p.screenshot({ path: `${OUT}/block-03-capstone.png`, fullPage: true });
  // «← В курс» с экрана вердикта ведёт на экран курса; ждущая попытка экзамена
  // (lib/examRun.ts) открывает его СРАЗУ на итоге экзамена, а не на карте.
  await p.locator(".drill-verdict button.btn.primary").click();
  await p.waitForTimeout(1200);
  return { ok, verdict };
}

/**
 * Экран итога экзамена: то, ради чего человек сдавал.
 *
 * Ждём именно разбор (`.exam-review`), а не любой экран курса: карта блоков
 * тоже «экран курса», и на ней прибор молчал бы ровно так же, как молчал
 * раньше.
 */
async function examResult() {
  await clearScrims();
  await p.waitForSelector(".exam-review", { timeout: 15000 });
  const head = ((await p.locator(".wrap.lesson.done h1").textContent()) || "").trim();
  const lead = ((await p.locator(".wrap.lesson.done .lead").textContent()) || "").trim();
  const rows = await p.locator(".exam-review li").count();
  const recovery = await p.locator(".recovery li button").count();
  const exit = ((await p.locator(".exam-exit").textContent()) || "").trim();
  await p.screenshot({ path: `${OUT}/block-04-exam-result.png`, fullPage: true });
  if(process.argv.includes("--remediation")){
    if(head!==T.course.examFail||!recovery)throw Error("Failed exam must offer relevant recovery lessons");
    await p.locator('.recovery li button').first().click();await trace('recovery lesson');
    await p.getByRole('button',{name:T.course.toTasks,exact:true}).click();
    while(await p.locator('.ex').count()){
      await answer();await p.getByRole('button',{name:`${T.course.next} →`,exact:true}).click();await p.waitForTimeout(300);
    }
    await p.locator('.wrap.lesson.done button.primary').click();
    await p.getByRole('button',{name:T.course.examStart,exact:true}).waitFor();await trace('recovered lesson, retry available');
    await p.getByRole('button',{name:`← ${T.course.allBlocks}`,exact:true}).click();await p.locator('.course-path').waitFor();
  }else{await p.locator(".exam-exit").click();await p.waitForTimeout(900);}
  return { head, lead, rows, recovery, exit };
}

try {
if (process.argv.includes("--warmup")) {
  await p.locator('[data-nav="campaign"]').first().click();
  await p.locator('.act-course-b.warm').first().click();
  await p.locator('.warm-head').waitFor();
  const title=await p.locator('.warm-head').innerText();
  const block=COURSE_BLOCKS.find(x=>title.includes(x.title[LANG]));
  if(!block)throw Error("Warmup block not identified from its visible title");
  currentBlock=block.id;
  await p.locator('.ex').waitFor();
  while(await p.locator('.ex').count()){
    const before=await p.locator('.lesson-step').innerText();await answer();
    await p.getByRole('button',{name:`${T.course.next} →`,exact:true}).click();
    await p.waitForFunction(before=>!!document.querySelector('.wrap.lesson.done')||document.querySelector('.lesson-step')?.textContent!==before,before);
  }
  await p.locator('.wrap.lesson.done button.primary').click();await p.locator('.chat textarea').waitFor();
  for(const line of GAMES.principled.salary[LANG]){
    if(await p.locator('.debrief, .outcome').count())break;
    const before=await p.locator('.msg.opp:not(.typing-msg)').count();
    await p.locator('.chat textarea').fill(line);await p.locator('.send').click();
    await p.waitForFunction(n=>(document.querySelectorAll('.msg.opp:not(.typing-msg)').length>n&&!document.querySelector('.caret, .wait-status, .typing-msg'))||!!document.querySelector('.debrief, .outcome'),before);
    await trace('warmup campaign turn');
  }
  await p.locator('.debrief').waitFor();await trace('warmup debrief');
  await p.locator('[data-nav="practice"]').first().click();await p.locator('.cards .card').first().waitFor();
  console.log('PASS warmup exercises → negotiation → debrief → home '+LANG);
} else for (let blockIndex = 0; blockIndex < BLOCK_COUNT; blockIndex++) {
currentBlock = BLOCK_IDS[blockIndex];
if (!currentBlock) throw Error("Requested more blocks than the catalog contains");
OUT = `${OUT_BASE}/block-${blockIndex + 1}`;
mkdirSync(OUT, { recursive: true });
// По ключу раздела, а не по русской подписи: см. смоук.
await p.locator('[data-nav="course"]').click();
await p.waitForTimeout(400);
await p.locator(".cnode.current .cnode-btn").click();
await p.waitForTimeout(300);

const lessons = await p.locator(".lesson-list button").count();
for (let i = 0; i < lessons; i++) {
  await clearScrims();
  await p.locator(".lesson-list button").nth(i).click();
  await p.waitForTimeout(300);
  await trace(`lesson ${currentBlock}/${i+1}`);
  await p.getByRole("button", {name:T.course.toTasks, exact:true}).or(p.getByRole("button", {name:T.course.lessonDone, exact:true})).first().click();
  await p.waitForTimeout(350);
  while (await p.locator(".ex").count()) {
    // Капстоун ВНУТРИ УРОКА необязателен: рядом с ним стоит «Дальше →», и его
    // можно пройти мимо. Раньше здесь стоял `break`, и он уносил не только
    // капстоун, но и все задания урока после него.
    await answer();
    const next = p.getByRole("button", {name:`${T.course.next} →`, exact:true}).first();
    if (!(await next.count())) break;
    await next.click();
    await p.waitForTimeout(300);
  }
  // Экран «Урок пройден» уводит кнопкой ← <блок>; если его нет — кнопкой назад.
  const doneBtn = p.locator(".wrap.lesson.done button.primary").first();
  if (await doneBtn.count()) { await doneBtn.click(); }
  else { const back = p.locator("button.back").first(); if (await back.count()) await back.click(); }
  await p.waitForTimeout(400);
}
await p.screenshot({ path: `${OUT}/block-01-done.png`, fullPage: true });

// Экзамен блока — те же эталонные ответы
await clearScrims();
await p.getByRole("button", {name:T.course.examStart, exact:true}).click();
await p.waitForTimeout(400);
let capstone = null;
let result = null;
let asked = 0;
while (await p.locator(".ex").count()) {
  const type = await answer(process.argv.includes("--remediation"));
  asked += 1;
  if (type === "drill") {
    await p.screenshot({ path: `${OUT}/block-02-exam.png`, fullPage: true });
    capstone = await playCapstone();
    result = await examResult();
    break;
  }
  const next = p.getByRole("button", {name:`${T.course.next} →`, exact:true}).or(p.getByRole("button", {name:T.course.examFinish, exact:true})).first();
  if (!(await next.count())) break;
  await next.click();
  await p.waitForTimeout(350);
}
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/block-05-map.png`, fullPage: true });

if(process.argv.includes("--remediation")){
  if(!capstone?.ok||result?.head!==T.course.examFail||!result?.recovery)throw Error('Remediation route incomplete');
  if(await p.locator('.cnode.done').count()!==0||!await p.locator('.master-card button').isDisabled())throw Error('Failed exam must not earn a passed block or unlock master exam');
  console.log('PASS failed exam → recovery lesson → retry available '+LANG);continue;
}

// УТВЕРЖДЕНИЯ СНИМАЮТСЯ С КАРТЫ, А НЕ СО СЧЁТЧИКОВ. `.cnode` идут в порядке
// курса, поэтому «первый пройден» и «второй открылся» проверяются по позиции:
// счётчик «хотя бы один done» держался бы и на чужом блоке.
const nodes = await p.locator(".cnode").evaluateAll(
  (els) => els.map((e) => e.className.replace("cnode", "").trim()));
const onMap = await p.locator(".course-path").count() === 1;
const problems = [];
if (!capstone) {
  problems.push("экзамен блока не дошёл до капстоуна — раньше здесь прибор молча " +
                "считал экзамен законченным и не проверял ничего из нижнего");
} else if (!capstone.ok) {
  // Капстоун сдан ЭТАЛОННОЙ линией — той же, которой tests/test_reference_games
  // доказывает инвариант 2. Не сдан — это находка, а не случайность прогона.
  problems.push(`капстоун не сдан эталонной линией: «${capstone.verdict}»`);
}
// ИТОГ ЭКЗАМЕНА — ОТДЕЛЬНОЕ УТВЕРЖДЕНИЕ. «Оказались на карте» его не заменяет:
// на карте прибор оказывался и тогда, когда итога не существовало вовсе.
if (!result) {
  problems.push("после капстоуна не показан итог экзамена: ни счёта, ни разбора, " +
                "ни урока восстановления — человек узнаёт результат только репликой в партии");
} else {
  if (!result.head) problems.push("у экрана итога нет заголовка «сдан / не сдан»");
  if (!/\d+/.test(result.lead)) problems.push(`итог не называет счёт: «${result.lead}»`);
  if (result.rows !== asked) {
    problems.push(`разобрано ${result.rows} заданий из ${asked} — разбор неполный`);
  }
  if (!result.exit) problems.push("с экрана итога некуда уйти");
}
if (!onMap) problems.push("после итога экзамена не вернулись на карту блоков");
if (nodes[blockIndex] !== "done") {
  problems.push(`экзамен блока не сдан: первый узел карты «${nodes[blockIndex]}», ожидалось «done»`);
}
if (blockIndex + 1 < nodes.length && nodes[blockIndex + 1] !== "current") {
  problems.push(`следующий блок не открылся: второй узел карты «${nodes[blockIndex + 1]}», ожидалось «current»`);
}
if (errs.length) problems.push(...errs);
if (problems.length) {
  console.error("ПРОБЛЕМЫ:\n" + problems.join("\n"));
  throw new Error(problems.join("\n"));
}
console.log(`блок пройден целиком, капстоун сдан («${capstone.verdict}»), ` +
            `итог экзамена показан («${result.head}» · ${result.lead}), ` +
            `следующий блок открыт · скриншоты: ${OUT}`);

}
if (process.argv.includes("--master")) {
  await clearScrims();
  await p.locator(".master-card button").click();
  for (const ex of COURSE_MASTER) {
    OUT = `${OUT_BASE}/${ex.id}`; mkdirSync(OUT, {recursive:true});
    const result = await playCapstone(ex);
    if (!result.ok) throw Error(`Master drill failed: ${ex.id}: ${result.verdict}`);
  }
  if (await p.locator(".master-list li.done").count() !== COURSE_MASTER.length) throw Error("Master progress not recorded");
  await p.screenshot({path:`${OUT_BASE}/master-complete.png`,fullPage:true});
  console.log("PASS full master exam after earned course progression");
}
} finally { await ctx.storageState({path:`${OUT_BASE}/storage.json`}); await browser.close(); }
