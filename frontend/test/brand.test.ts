// brand.test.ts — имя продукта там, где его видит человек.
//
// Продукт переименован: «Диалог» → RocketTalk (решение владельца, 19.10). Имя
// живёт не в одном словаре, а в россыпи мест, которые никакой другой тест не
// читает: заголовок вкладки, ярлык на телефоне, манифест PWA, значок, логотип
// в меню, подвал, шапка выгруженного разбора и имя файла. Пропущенное место
// не валит ничего — человек просто видит два названия у одного продукта.
//
// Технические имена (`dialog.service`, ключи `dialog.*` в localStorage, кэш
// `dialog-build-*`) остаются прежними намеренно: смена ключа хранилища стёрла
// бы людям прогресс, смена юнита — сломала бы выкладку.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { I18N } from "../src/i18n";
import { reportFileName, reportText, type ReportInput } from "../src/lib/reportExport";

const BRAND = "RocketTalk";
/** Прежнее имя в любом падеже и в английском написании. */
const OLD = /Диалог|\bDialog\b/;

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf-8");

test("вкладка, ярлык и текст без JavaScript называют продукт RocketTalk", () => {
  const html = read("index.html");
  assert.match(html, /<title>RocketTalk\b[^<]*<\/title>/);
  assert.match(html, /apple-mobile-web-app-title" content="RocketTalk"/);
  const noscript = html.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? "";
  assert.equal(noscript.split(BRAND).length - 1, 2, "имя нужно в обеих половинах — русской и английской");
  assert.doesNotMatch(html, OLD);
  assert.doesNotMatch(read("public/check.html"), OLD);
  assert.match(read("public/check.html"), /<title>RocketTalk\b/);
});

test("манифест PWA: имя при установке и под значком", () => {
  const m = JSON.parse(read("public/manifest.webmanifest"));
  assert.equal(m.short_name, BRAND);
  assert.ok(m.name.startsWith(`${BRAND} `), m.name);
});

test("значок называется RocketTalk", () => {
  // Буква на значке тоже перерисована: «Д.» → «R.» тем же штрихом.
  assert.match(read("public/icon.svg"), /aria-label="RocketTalk"/);
});

test("логотип в меню и подвал на обоих языках", () => {
  assert.match(read("src/components/SideNav.tsx"), />\s*RocketTalk<span className="dot">/);
  assert.match(read("src/App.tsx"), />\s*RocketTalk<span className="dot">/);
  for (const lang of ["ru", "en"] as const) {
    assert.ok(I18N[lang].footLeft.startsWith(`${BRAND} · `), I18N[lang].footLeft);
  }
});

test("выгруженный разбор: шапка и имя файла", () => {
  const input: ReportInput = {
    lang: "ru", mode: "practice", createdAt: "2026-10-19T08:00:00.000Z",
    debrief: { grade: "B", overall: 78, economic: 80, relationship: 90, technique: 65, status: "agreement", deal_text: "100 ₽", interests_found: 1, interests_total: 2, spin_stages: 2, objective_criteria: 1, empathy: 2, threats: 0, tradeoffs: 1, avg_arg: 60, tips: [], turning_points: [] },
  };
  for (const lang of ["ru", "en"] as const) {
    const first = reportText({ ...input, lang }).split("\n")[0];
    assert.ok(first.startsWith(`${BRAND} · `), first);
  }
  assert.equal(reportFileName(input, "txt"), "rockettalk-2026-10-19.txt");
  assert.equal(reportFileName(input, "json"), "rockettalk-2026-10-19.json");
});
