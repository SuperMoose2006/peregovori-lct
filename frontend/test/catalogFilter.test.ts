import test from "node:test";
import assert from "node:assert/strict";
import { catalog } from "../src/data/scenarios";
import { filterCatalog } from "../src/lib/catalogFilter";

test("catalog search preserves the authored order and never mutates the catalog", () => {
  const rows = catalog("ru");
  const before = JSON.stringify(rows);
  assert.deepEqual(filterCatalog(rows, "  ", "all", "all"), rows);
  assert.equal(JSON.stringify(rows), before);
});

test("search matches all words across title and role, regardless of case or ё", () => {
  const rows = catalog("ru");
  assert.deepEqual(filterCatalog(rows, "ЗАРПЛАТЕ оффер", "all", "all").map((r) => r.id), ["salary"]);
  assert.equal(filterCatalog(rows, "зарплата аренда", "all", "all").length, 0);
  assert.equal(filterCatalog([{ id: "test", title: "Партнёр", role: "Совместный проект", difficulty: 2, icon: "" }], "ПАРТНЕР проект", "all", "all").length, 1);
});

test("context and difficulty combine, and clearing them restores all situations", () => {
  const rows = catalog("en");
  assert.deepEqual(filterCatalog(rows, "", "career", 1), []);
  assert.deepEqual(filterCatalog(rows, "", "career", 3).map((r) => r.id), ["salary", "conflict", "candidate_offer"]);
  assert.deepEqual(filterCatalog(rows, "", "life", 5), []);
  assert.deepEqual(filterCatalog(rows, "", "business", 5).map((r) => r.id), ["investor", "sla_renewal"]);
  assert.equal(filterCatalog(rows, "", "all", "all").length, rows.length);
});

test("everyday search words find titles written in another grammatical form", () => {
  const rows = catalog("ru");
  for (const word of ["аренда", "аренде", "аренду"]) assert.deepEqual(filterCatalog(rows, word, "all", "all").map(r => r.id), ["rent"]);
  assert.deepEqual(filterCatalog(rows, "зарплата", "all", "all").map(r => r.id), ["salary"]);
  assert.deepEqual(filterCatalog(rows, "машина", "all", "all").map(r => r.id), ["used_car"]);
});
