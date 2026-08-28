// mascot.test.ts — маскот обязан быть честным и двуязычным.
//
// Два бага, ради которых тест написан.
//
// 1. `karl/celebrate` был НЕДОСТИЖИМ. Стол звал `karlState` с жёстко вбитым
//    `grade: null`, а праздник в самой функции открыт только на A/B — то есть
//    любая закрытая сделка оставляла ворона в idle. Картинка лежала в наборе и
//    не рисовалась ни разу.
// 2. alt-тексты картинок были вбиты по-русски. Английскому диктору вслух
//    читали «Карл наблюдает» — инвариант 4 (билингвальность ВСЕГО
//    пользовательского контента) при этом падал молча, потому что типы про
//    строку в разметке ничего не знают.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { karlState, type KarlState } from "../src/components/Mascot";
import { I18N } from "../src/i18n";

const D = (o: Partial<{ trust: number; tension: number; info: number; leverage: number }>) =>
  ({ trust: 0, tension: 0, info: 0, leverage: 0, ...o });

test("сделка на A и B — праздник, сделка на C и D — нет", () => {
  assert.equal(karlState({ status: "agreement", grade: "A" }), "celebrate");
  assert.equal(karlState({ status: "agreement", grade: "B" }), "celebrate");
  assert.equal(karlState({ status: "agreement", grade: "C" }), "idle");
  assert.equal(karlState({ status: "agreement", grade: "D" }), "idle");
  // Разбор ещё не доехал — праздновать нечего: сделка бывает и на D.
  assert.equal(karlState({ status: "agreement", grade: null }), "idle");
});

test("срыв важнее всего остального", () => {
  assert.equal(karlState({ status: "breakdown" }), "sad");
  assert.equal(karlState({ status: "breakdown", hintPending: true, grade: "A" }), "sad");
});

test("порядок веток: подсказка важнее судьи, судья важнее шкал", () => {
  assert.equal(karlState({ hintPending: true, busy: true, phase: "judging" }), "point");
  assert.equal(karlState({ busy: true, phase: "judging", deltas: D({ trust: 9 }) }), "think");
  // «replying» — это уже не судья: молчит, пока оппонент печатает.
  assert.equal(karlState({ busy: true, phase: "replying" }), "idle");
});

test("шкалы двигают лицо только за порогом в 5 пунктов", () => {
  assert.equal(karlState({ deltas: D({ tension: 6 }) }), "concern");
  assert.equal(karlState({ deltas: D({ trust: 6 }) }), "cheer");
  assert.equal(karlState({ deltas: D({ info: 9 }) }), "cheer");
  assert.equal(karlState({ deltas: D({ trust: 4, tension: 4, info: 7 }) }), "idle");
  // Напряжение перевешивает доверие: предупредить важнее, чем похвалить.
  assert.equal(karlState({ deltas: D({ trust: 9, tension: 9 }) }), "concern");
  assert.equal(karlState({}), "idle");
});

test("стол зовёт karlState с настоящим грейдом, а не с константой", () => {
  // Сам баг жил не в функции, а в её вызове: `grade: null` прямо в разметке
  // стола. Проверять поведение karlState и не проверять аргумент — значит
  // оставить дыру ровно того размера, из которой всё и вылезло.
  const call = readFileSync("src/components/Table.tsx", "utf8").match(/karlState\(\{[^}]*\}\)/s);
  assert.ok(call, "вызов karlState в Table.tsx не найден — тест устарел вместе с кодом");
  assert.doesNotMatch(call[0], /grade:\s*(null|undefined)/,
    "грейд снова вбит константой — celebrate за столом опять недостижим");
  assert.match(call[0], /grade/, "грейд вообще не передан");
});

const STATES: KarlState[] = ["idle", "think", "cheer", "concern", "point", "celebrate", "sad"];

test("у каждого состояния есть подпись на обоих языках", () => {
  for (const lang of ["ru", "en"] as const) {
    assert.deepEqual(Object.keys(I18N[lang].mascot.alt).sort(), [...STATES].sort(),
      `${lang}: набор подписей разошёлся с набором состояний`);
  }
});

test("в английских подписях нет кириллицы", () => {
  const cyr = /[А-Яа-яЁё]/;
  const bad = Object.entries(I18N.en.mascot.alt).filter(([, v]) => cyr.test(v));
  assert.deepEqual(bad, [], `английскому диктору читают по-русски: ${bad.map(([k]) => k).join(", ")}`);
});

test("ни один alt в разметке не вбит текстом на одном языке", () => {
  // Именно так и жил баг: `alt="Тихон помнит"` мимо словаря. Пустой alt
  // разрешён — это декоративная картинка, у которой имя написано рядом.
  const cyr = /[А-Яа-яЁё]/;
  const bad: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${e.name}`;
      if (e.isDirectory()) { walk(full); continue; }
      if (!e.name.endsWith(".tsx")) continue;
      const src = readFileSync(full, "utf8");
      for (const m of src.matchAll(/alt=\{?["'`]([^"'`]*)["'`]/g)) {
        if (cyr.test(m[1])) bad.push(`${full}: alt="${m[1]}"`);
      }
    }
  };
  walk("src");
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("в самом Mascot.tsx не осталось ни одной строки на одном языке", () => {
  // Второй половиной бага была таблица `KARL_ALT` с русскими подписями: она
  // не «вбита в alt=» и предыдущую проверку прошла бы насквозь. Весь код
  // компонента — включая любые словари — обязан быть без пользовательского
  // текста: он приходит пропсами. Комментарии по-русски, как и везде.
  const src = readFileSync("src/components/Mascot.tsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  const cyr = src.match(/[А-Яа-яЁё][^\n]*/g);
  assert.equal(cyr, null, `текст в коде компонента: ${(cyr ?? []).join(" | ")}`);
});

test("у каждой картинки маскота есть webp — и полный, и мелкий", () => {
  // <picture> называет три файла на кадр. Недостающий webp браузер выберет по
  // type и покажет разрыв: тут промах дороже, чем обычная опечатка в пути.
  const missing: string[] = [];
  for (const dir of ["karl", "tikhon"]) {
    const root = `public/mascots/${dir}`;
    for (const f of readdirSync(root)) {
      if (!f.endsWith(".png")) continue;
      const stem = f.slice(0, -4);
      for (const v of [`${stem}.webp`, `${stem}-192.webp`]) {
        if (!existsSync(`${root}/${v}`)) missing.push(`${dir}/${v}`);
      }
    }
  }
  assert.deepEqual(missing, [], `нет webp: ${missing.join(", ")}`);
});
