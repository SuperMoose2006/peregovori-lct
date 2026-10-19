// format.test.ts — pure display helpers: locale number/deal formatting and the
// teaching-placeholder rotation. No DOM needed (Intl is in Node).
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatNumber, formatDeal, teachingPlaceholder } from "../src/lib/format.ts";

// Intl in Node uses a NON-BREAKING space (U+00A0) / narrow-nbsp for RU grouping;
// normalize any whitespace to a plain space so the intent is what we assert.
const norm = (s: string) => s.replace(/\s/g, " ");

test("formatNumber: RU uses comma decimal + space grouping", () => {
  assert.equal(norm(formatNumber(85.93, "ru")), "85,93");
  assert.equal(norm(formatNumber(1060, "ru")), "1 060");
  assert.equal(formatNumber(230, "ru"), "230");
});

test("formatNumber: EN uses dot decimal + comma grouping", () => {
  assert.equal(formatNumber(85.93, "en"), "85.93");
  assert.equal(formatNumber(1060, "en"), "1,060");
});

test("formatNumber: trailing zeros trimmed, max 2 fraction digits", () => {
  assert.equal(formatNumber(99.8, "ru").replace(/\s/g, " "), "99,8");
  assert.equal(formatNumber(15, "ru"), "15");
});

test("formatDeal: appends the unit verbatim (unit owns its own spacing)", () => {
  assert.equal(norm(formatDeal(85.93, " ₽", "ru")), "85,93 ₽");
  assert.equal(formatDeal(15, "%", "ru"), "15%");
  assert.equal(formatDeal(230, "k", "en"), "230k");
  assert.equal(norm(formatDeal(1060, "k", "ru")), "1 060k");
});

test("teachingPlaceholder: rotates a nudge per early turn, then falls back to base", () => {
  const nudges = ["ask why", "cite data", "offer a trade"];
  assert.equal(teachingPlaceholder(0, "base", nudges), "ask why");
  assert.equal(teachingPlaceholder(1, "base", nudges), "cite data");
  assert.equal(teachingPlaceholder(2, "base", nudges), "offer a trade");
  assert.equal(teachingPlaceholder(3, "base", nudges), "base", "settles to base after the nudges");
  assert.equal(teachingPlaceholder(9, "base", nudges), "base");
});

test("teachingPlaceholder: defensive — empty nudges or negative turn → base", () => {
  assert.equal(teachingPlaceholder(0, "base", []), "base");
  assert.equal(teachingPlaceholder(-1, "base", ["x"]), "base");
});

// ---------------------------------------------------------------------------
// Русская тройка форм. «1 заданий» на экране читается как недоделка, а курс,
// который учит формулировкам, обязан сам говорить грамотно.
import { plural } from "../src/lib/format";

test("plural выбирает русскую форму по последним цифрам", () => {
  const forms: [string, string, string] = ["задание", "задания", "заданий"];
  const say = (n: number) => `${n} ${plural(n, forms)}`;
  assert.equal(say(1), "1 задание");
  assert.equal(say(2), "2 задания");
  assert.equal(say(4), "4 задания");
  assert.equal(say(5), "5 заданий");
  assert.equal(say(11), "11 заданий", "одиннадцать — исключение");
  assert.equal(say(12), "12 заданий");
  assert.equal(say(21), "21 задание");
  assert.equal(say(24), "24 задания");
  assert.equal(say(111), "111 заданий");
  assert.equal(say(0), "0 заданий");
});

test("plural по-английски: единственное число только у единицы", () => {
  // Найдено после аудита 17.10: русское правило шло и в английский —
  // «21 day in a row», «21 character left», «31 game».
  const days: [string, string, string] = ["day", "days", "days"];
  assert.equal(plural(1, days), "day");
  assert.equal(plural(21, days), "days");
  assert.equal(plural(31, days), "days");
  assert.equal(plural(2, days), "days");
  assert.equal(plural(0, days), "days");
});

test("тройки форм в словаре: русские различают 2 и 5, английские нет", async () => {
  // На этом различии plural узнаёт язык. Русская тройка с одинаковыми второй
  // и третьей формой молча получила бы английское правило — и наоборот.
  const { I18N } = await import("../src/i18n");
  const triples = (node: unknown, path: string, out: [string, string[]][]) => {
    if (Array.isArray(node)) {
      if (/forms/i.test(path) && node.length === 3 && node.every((x) => typeof x === "string")) {
        out.push([path, node as string[]]);
      }
      return out;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) triples(v, `${path}.${k}`, out);
    }
    return out;
  };
  const ru = triples(I18N.ru, "ru", []);
  const en = triples(I18N.en, "en", []);
  assert.ok(ru.length >= 9 && en.length === ru.length, `${ru.length} / ${en.length}`);
  for (const [path, f] of ru) assert.notEqual(f[1], f[2], path);
  for (const [path, f] of en) assert.equal(f[1], f[2], path);
});
