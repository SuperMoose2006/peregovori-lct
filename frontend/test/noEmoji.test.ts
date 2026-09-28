// noEmoji.test.ts — эмодзи в исходниках интерфейса больше нет, и это проверяется.
//
// ПОЧЕМУ ЭТО ПРАВИЛО, А НЕ ВКУСОВЩИНА. Эмодзи рисует шрифт операционной системы.
// Отсюда три следствия, и все три видны на экране: у значка своя палитра, мимо
// темы продукта (в тёмной теме он светится жёлтым); своя ширина, поэтому строки
// в одном списке стоят по-разному; а там, где шрифта нет, — пустой квадрат.
// Плюс четвёртое, невидимое: диктор читает эмодзи вслух его юникодным именем.
//
// Значки живут в `src/components/Icon.tsx`: штриховой SVG, `currentColor`,
// размер в `em`. Возврат эмодзи валит сборку здесь, а не всплывает на чужом
// ноутбуке во время показа.
//
// Типографика не запрещена: стрелки, галочки и звёздочки — обычные символы
// текста, у них нет ни своей палитры, ни эмодзи-презентации.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname;

/** Разрешённые не-буквенные символы: типографика, а не эмодзи. */
const ALLOWED = new Set([
  "→", "←", "↑", "↓", "↔", "⇒", "↻", "✓", "✗", "✕", "✦", "★", "▾", "➤", "◐", "◌",
  "·", "×", "—", "–", "«", "»", "…", "№", "±", "≥", "≤", "⌀",
]);

/** Диапазоны эмодзи-презентации. Сюда же — вариационный селектор VS16. */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      // vendor — перенесённый upstream-код, он живёт по своим правилам.
      if (name !== "vendor") out.push(...walk(full));
      continue;
    }
    if (/\.(ts|tsx|css)$/.test(name)) out.push(full);
  }
  return out;
}

test("в исходниках интерфейса нет эмодзи — значки рисует Icon.tsx", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const ch of line) {
        if (!EMOJI.test(ch) || ALLOWED.has(ch)) continue;
        offenders.push(`${file.slice(SRC.length)}:${i + 1}: ${line.trim().slice(0, 80)}`);
        return;
      }
    });
  }
  assert.deepEqual(offenders, [], "эмодзи вернулся в исходники:\n  " + offenders.join("\n  "));
});

test("каждое имя значка из данных нарисовано в Icon.tsx", async () => {
  const icons = readFileSync(join(SRC, "components/Icon.tsx"), "utf8");
  // Имена берём из объявления PATHS: ключ в начале строки до двоеточия.
  const known = new Set(
    (icons.match(/^\s{2}([a-z]+):\s/gm) ?? []).map((m) => m.trim().replace(":", "")),
  );
  assert.ok(known.size > 40, `в PATHS нашлось только ${known.size} значков — сломалась регулярка?`);

  const used = new Set<string>();
  for (const file of walk(SRC)) {
    if (file.endsWith("Icon.tsx")) continue;
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/(?:^|[\s{,])(?:icon|face)["']?\s*:\s*["']([a-z_]+)["']/gm)) {
      used.add(m[1]);
    }
    for (const m of text.matchAll(/<Icon\s+name="([a-z]+)"/g)) used.add(m[1]);
  }
  const missing = [...used].filter((n) => !known.has(n));
  assert.deepEqual(missing, [], `в данных есть имена, которых нет в Icon.tsx: ${missing.join(", ")}`);
});
