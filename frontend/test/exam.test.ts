// exam.test.ts — экран итога экзамена блока обязан существовать.
//
// ДЕФЕКТ, РАДИ КОТОРОГО НАПИСАН ЭТОТ ФАЙЛ (найден браузерным обходчиком, а не
// чтением). `drawExam` ставит капстоун последним заданием, и капстоун есть у
// всех десяти блоков. Капстоун — настоящая партия: экран курса при её запуске
// размонтируется, а возврат вёл на карту блоков. Значит счёт экзамена, разбор
// промахов и урок восстановления не видел НИКТО: провалившему сообщала об этом
// реплика оппонента в партии, а `CourseScreen.tsx` в комментарии обещал
// маршрут с разбором. Это ровно второй принцип продукта — заявлен слой,
// которого нет.
//
// Поэтому здесь два уровня. Арифметика попытки проверяется как чистая функция,
// а достижимость экрана — настоящей отрисовкой `CourseScreen`: только она
// падает, когда экран снова становится недостижим.
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CourseScreen } from "../src/components/CourseScreen";
import { Exercise } from "../src/components/Exercise";
import { COURSE_BANK, COURSE_BLOCKS, drawExam } from "../src/lib/course";
import {
  clearExamRun, examOutcome, examRunFor, loadExamRun, noteCapstone, saveExamRun,
  type ExamRunSnapshot,
} from "../src/lib/examRun";
import { emptyProfile } from "../src/lib/progress";
import { I18N } from "../src/i18n";

const t = I18N.ru;
const BLOCK = COURSE_BLOCKS[0].id;

/** Попытка «всё верно до капстоуна» / «всё мимо до капстоуна». */
function runFor(blockId: string, allRight: boolean): ExamRunSnapshot {
  const draw = drawExam(blockId, 0);
  const items = draw.items.filter((x) => x.type !== "drill");
  const capstone = draw.items[draw.items.length - 1];
  const score = allRight ? items.reduce((n, x) => n + draw.weight(x), 0) : 0;
  return examRunFor(blockId, draw, 0, score,
                    items.map((x) => ({ id: x.id, ok: allRight })), capstone.id);
}

function render(lang: "ru" | "en" = "ru"): string {
  return renderToStaticMarkup(createElement(CourseScreen, {
    t: I18N[lang], lang, profile: emptyProfile(),
    onProfile: () => {}, onStartDrill: () => {}, onExit: () => {},
  }));
}

// ---------------------------------------------------------------- достижимость

test("капстоун стоит последним заданием экзамена в КАЖДОМ блоке", () => {
  // Причина дефекта, а не украшение: пока это так, экран итога достижим ТОЛЬКО
  // через возврат из партии. Перестанет быть так — тесты ниже всё равно держат
  // оба пути, но повод помнить об этом останется здесь.
  for (const b of COURSE_BLOCKS) {
    const items = drawExam(b.id, 0).items;
    assert.equal(items[items.length - 1].type, "drill", b.id);
    assert.equal(items.filter((x) => x.type === "drill").length, 1, b.id);
  }
});

test("экзамен, законченный капстоуном, показывает счёт, разбор и маршрут", () => {
  const run = runFor(BLOCK, false);
  saveExamRun({ ...run, capstoneOk: false });
  const html = render();
  clearExamRun();

  const draw = drawExam(BLOCK, 0);
  assert.match(html, new RegExp(t.course.examFail), "провал назван словами");
  assert.ok(html.includes(t.course.examResult
    .replace("{score}", "0").replace("{total}", String(draw.total))
    .replace("{pass}", String(draw.passMark))), "счёт и порог на экране");
  assert.match(html, /class="recovery"/, "урок восстановления показан");
  assert.match(html, /class="exam-review"/, "разбор промахов показан");
  // Разбор — по каждому заданию попытки, включая капстоун.
  const rows = html.match(/<li class="(ok|bad)">/g) ?? [];
  assert.equal(rows.length, draw.items.length, "разобрано каждое задание");
});

test("сданный экзамен говорит другое и ведёт в другое место", () => {
  saveExamRun({ ...runFor(BLOCK, true), capstoneOk: true });
  const pass = render();
  clearExamRun();
  // Порог 80%: провал — это именно промахи по заданиям, а не один капстоун.
  saveExamRun({ ...runFor(BLOCK, false), capstoneOk: false });
  const fail = render();
  clearExamRun();

  assert.match(pass, new RegExp(t.course.examPass));
  assert.doesNotMatch(pass, /class="recovery"/, "сдавшему нечего восстанавливать");
  assert.match(fail, new RegExp(t.course.examFail));

  // Дверь у сдачи и провала РАЗНАЯ: сдавшему — карта, где открылся следующий
  // блок; провалившему — блок, где рядом уроки и пересдача.
  const exit = (html: string) => (html.match(/class="btn primary exam-exit">([^<]*)</) ?? [])[1];
  assert.ok(exit(pass), "у экрана итога есть дверь");
  assert.notEqual(exit(pass), exit(fail), "сдача и провал ведут в разные места");
  assert.ok(exit(pass)?.includes(t.course.allBlocks), exit(pass));
  assert.ok(exit(fail)?.includes(COURSE_BLOCKS[0].title.ru), exit(fail));
});

test("итог экзамена билингвален (инвариант 4)", () => {
  for (const lang of ["ru", "en"] as const) {
    saveExamRun({ ...runFor(BLOCK, false), capstoneOk: false });
    const html = render(lang);
    clearExamRun();
    const s = I18N[lang];
    assert.ok(html.includes(s.course.examFail), `${lang}: заголовок итога`);
    assert.ok(html.includes(s.course.recoveryTitle), `${lang}: урок восстановления`);
    // React экранирует `&` в разметке — сверяемся с уже экранированным текстом.
    const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    assert.ok(html.includes(esc(COURSE_BLOCKS[0].title[lang])), `${lang}: дверь названа блоком`);
  }
});

test("недоигранный капстоун не рисует итог: прерванная попытка не тратит счётчик", () => {
  saveExamRun(runFor(BLOCK, true)); // capstoneOk === null
  const html = render();
  assert.doesNotMatch(html, /class="exam-review"/);
  assert.equal(loadExamRun(), null, "снимок выброшен, а не оставлен висеть");
});

// ------------------------------------------------------------------ арифметика

test("капстоун весит два очка и решает сдачу", () => {
  const run = runFor(BLOCK, true);
  const draw = drawExam(BLOCK, 0);
  const won = examOutcome({ ...run, capstoneOk: true });
  const lost = examOutcome({ ...run, capstoneOk: false });
  assert.equal(won.score - lost.score, 2);
  assert.equal(won.score, draw.total);
  assert.equal(won.passed, true);
  assert.equal(lost.passed, draw.total - 2 >= draw.passMark);
  // Разбор получает и капстоун — он такое же задание попытки.
  assert.equal(won.results.length, draw.items.length);
  assert.equal(won.results[won.results.length - 1].ok, true);
});

test("итог чужой партии в экзамен не попадает", () => {
  const run = runFor(BLOCK, true);
  saveExamRun(run);
  noteCapstone("нет-такого-упражнения", true);
  assert.equal(loadExamRun()?.capstoneOk, null, "партия из урока не дописывает экзамен");
  noteCapstone(run.capstoneId, true);
  assert.equal(loadExamRun()?.capstoneOk, true);
  // Второй раз итог не переписывается: разбор партии приходит и на повторном
  // монтировании эффекта.
  noteCapstone(run.capstoneId, false);
  assert.equal(loadExamRun()?.capstoneOk, true);
  clearExamRun();
  assert.equal(loadExamRun(), null);
});

// ------------------------------------------------- обещание бюджета капстоуна

test("капстоун не обещает партии длиной в свой срок", () => {
  // Бюджет хода в партию не передаётся: `App.startDrill` открывает обычную
  // партию практики, и стол выдаёт свои двенадцать ходов. Значит «настоящая
  // партия на 6 ходов» рядом со счётчиком «1 из 12» — заявление того, чего нет.
  // Срок цели при этом настоящий: `checkDrill` заваливает капстоун при
  // `turn > max_turns`.
  const drills = COURSE_BANK.filter((x) => x.type === "drill");
  assert.ok(drills.length >= 10);
  for (const lang of ["ru", "en"] as const) {
    for (const ex of drills) {
      const html = renderToStaticMarkup(createElement(Exercise, {
        t: I18N[lang], lang, ex, onDone: () => {},
      }));
      const promise = I18N[lang].course.drillNote.split("{n}")[0].trim();
      assert.ok(!html.includes(promise),
                `${ex.id}/${lang}: капстоун снова обещает партию на N ходов`);
      assert.ok(html.includes(`≤ ${ex.max_turns}`),
                `${ex.id}/${lang}: срок цели не показан`);
    }
  }
});
