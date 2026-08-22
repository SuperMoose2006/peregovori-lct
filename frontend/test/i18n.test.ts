// i18n.test.ts — RU и EN обязаны иметь ОДНУ форму.
//
// Типы ловят только отсутствие ключа целиком: `Record<string, string>` (ярлыки
// приёмов, реакций, шкал курса) типизирован одинаково для обоих языков, но
// ничего не знает про наличие конкретного ключа. Пропущенный `tradeoff` в
// английском словаре компилируется молча — и всплывает на экране как «tradeoff»
// вместо перевода, ровно перед жюри.
import test from "node:test";
import assert from "node:assert/strict";
import { I18N } from "../src/i18n";

type Node = unknown;

function shape(node: Node, path = ""): string[] {
  if (Array.isArray(node)) return [`${path}[]`];
  if (node && typeof node === "object") {
    return Object.entries(node as Record<string, Node>)
      .flatMap(([k, v]) => shape(v, path ? `${path}.${k}` : k));
  }
  return [path];
}

test("русский и английский словари имеют одинаковый набор ключей", () => {
  const ru = shape(I18N.ru).sort();
  const en = shape(I18N.en).sort();
  const onlyRu = ru.filter((k) => !en.includes(k));
  const onlyEn = en.filter((k) => !ru.includes(k));
  assert.deepEqual(onlyRu, [], `нет в английском: ${onlyRu.join(", ")}`);
  assert.deepEqual(onlyEn, [], `нет в русском: ${onlyEn.join(", ")}`);
});

test("ни одна строка не пустая", () => {
  for (const lang of ["ru", "en"] as const) {
    const empty: string[] = [];
    const walk = (node: Node, path: string) => {
      if (typeof node === "string") { if (!node.trim()) empty.push(path); return; }
      if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${path}[${i}]`)); return; }
      if (node && typeof node === "object") {
        for (const [k, v] of Object.entries(node as Record<string, Node>)) walk(v, path ? `${path}.${k}` : k);
      }
    };
    walk(I18N[lang], "");
    assert.deepEqual(empty, [], `${lang}: пустые строки — ${empty.join(", ")}`);
  }
});

test("плейсхолдеры совпадают в обоих языках", () => {
  // «{n} из {total}» без одного из плейсхолдеров — это молчаливая потеря числа.
  const holes = (s: string) => (s.match(/\{[a-z]+\}/gi) ?? []).sort().join(",");
  const bad: string[] = [];
  const walk = (a: Node, b: Node, path: string) => {
    if (typeof a === "string" && typeof b === "string") {
      if (holes(a) !== holes(b)) bad.push(`${path}: «${holes(a)}» ≠ «${holes(b)}»`);
      return;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      a.forEach((v, i) => walk(v, b[i], `${path}[${i}]`));
      return;
    }
    if (a && b && typeof a === "object" && typeof b === "object") {
      for (const k of Object.keys(a as Record<string, Node>)) {
        walk((a as Record<string, Node>)[k], (b as Record<string, Node>)[k], path ? `${path}.${k}` : k);
      }
    }
  };
  walk(I18N.ru, I18N.en, "");
  assert.deepEqual(bad, [], bad.join("\n"));
});
