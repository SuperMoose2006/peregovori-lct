// audit.mjs — обходчик состояний UI со встроенными проверками.
// Смысл: цикл «улучшить» слеп без прибора. Здесь прибор.
import { chromium } from "playwright-core";
import fs from "fs";

const EXE = "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const BASE = "http://127.0.0.1:5199/";
const OUT = "/tmp/ui-audit";
fs.mkdirSync(OUT, { recursive: true });

const VPS = [
  { w: 1440, h: 900, tag: "desk",      scheme: "light", attr: null },
  { w: 390,  h: 844, tag: "mob",       scheme: "light", attr: null },
  // Системная тёмная БЕЗ явного выбора — самый забываемый режим: правила под
  // [data-theme="dark"] в нём не срабатывают.
  { w: 1440, h: 900, tag: "dark-sys",  scheme: "dark",  attr: null },
  { w: 1440, h: 900, tag: "dark-attr", scheme: "dark",  attr: "dark" },
];
const findings = [];
const add = (sev, where, kind, msg) => findings.push({ sev, where, kind, msg });

// ——— проверки, которые гоняются на каждом состоянии ———
const PROBE = `(() => {
  const out = { hscroll: false, overflow: [], small: [], leak: [], dupIds: [], noAlt: 0, contrast: [] };
  const de = document.documentElement;
  out.hscroll = de.scrollWidth > de.clientWidth + 1;

  const seen = new Set();
  for (const el of document.querySelectorAll("[id]")) {
    if (seen.has(el.id)) out.dupIds.push(el.id); else seen.add(el.id);
  }
  for (const img of document.querySelectorAll("img")) if (!img.alt) out.noAlt++;

  const vis = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // текст, вылезающий за свой контейнер
  for (const el of document.querySelectorAll("body *")) {
    if (!vis(el)) continue;
    const s = getComputedStyle(el);
    if (s.overflow !== "visible" && s.overflow !== "" ) continue;
    if (el.children.length) continue;
    const p = el.parentElement; if (!p) continue;
    const ps = getComputedStyle(p);
    if (ps.overflow === "visible") continue;
    const r = el.getBoundingClientRect(), pr = p.getBoundingClientRect();
    if (r.right > pr.right + 2 || r.bottom > pr.bottom + 2) {
      out.overflow.push((el.className || el.tagName) + " :: " + (el.textContent || "").trim().slice(0, 40));
    }
  }

  // мелкие цели нажатия
  for (const el of document.querySelectorAll("button, a, [role=button], input, select, textarea")) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 44 || r.width < 24) {
      out.small.push(Math.round(r.width) + "x" + Math.round(r.height) + " " + (el.className || el.tagName) + " :: " + (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30));
    }
  }

  // утечки шаблона
  const body = document.body.innerText;
  for (const bad of ["undefined", "NaN", "{{", "[object Object]", "null "]) {
    if (body.includes(bad)) out.leak.push(bad);
  }

  // контраст текста на реальном фоне
  const lum = (c) => {
    const [r,g,b] = c;
    const f = (v) => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
    return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b);
  };
  const parse = (s) => { if (!/^rgba?\\(/.test(s)) return null; const m = s.match(/\\d+(\\.\\d+)?/g); return m ? m.slice(0,3).map(Number) : null; };
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const s = getComputedStyle(n); const c = parse(s.backgroundColor);
      const a = s.backgroundColor.startsWith("rgba") ? Number(s.backgroundColor.match(/[\\d.]+\\)$/)?.[0].slice(0,-1) ?? 1) : 1;
      if (c && a > 0.5) return c;
      n = n.parentElement;
    }
    return [255,255,255];
  };
  const checked = new Set();
  for (const el of document.querySelectorAll("body *")) {
    if (el.children.length || !vis(el)) continue;
    const txt = (el.textContent || "").trim();
    if (txt.length < 2) continue;
    if (!/[\\p{L}\\p{N}]/u.test(txt)) continue;  // только эмодзи/значок — не текст
    const s = getComputedStyle(el);
    const fg = parse(s.color); if (!fg) continue;
    const bg = bgOf(el);
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1,L2) + 0.05) / (Math.min(L1,L2) + 0.05);
    const size = parseFloat(s.fontSize), weight = +s.fontWeight || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    if (ratio < need) {
      const key = s.color + "|" + bg.join(",") + "|" + Math.round(size);
      if (checked.has(key)) continue; checked.add(key);
      out.contrast.push(ratio.toFixed(2) + ":1 (нужно " + need + ") " + Math.round(size) + "px " + s.color + " на rgb(" + bg.join(",") + ") :: " + txt.slice(0, 40));
    }
  }
  return out;
})()`;

async function probe(page, where, tag) {
  const r = await page.evaluate(PROBE);
  if (r.hscroll) add("BAD", where, "hscroll", "горизонтальная прокрутка документа");
  for (const o of r.overflow.slice(0, 4)) add("BAD", where, "overflow", "текст вылезает: " + o);
  if (tag === "mob") for (const s of r.small.slice(0, 6)) add("WARN", where, "target", "мелкая цель " + s);
  for (const l of r.leak) add("BAD", where, "leak", "в тексте видно «" + l + "»");
  for (const d of r.dupIds.slice(0, 3)) add("WARN", where, "dupid", "повтор id: " + d);
  if (r.noAlt) add("WARN", where, "alt", r.noAlt + " img без alt");
  for (const c of r.contrast.slice(0, 6)) add("WARN", where, "contrast", c);
  await page.screenshot({ path: `${OUT}/${tag}-${where.replace(/[^\w-]/g, "_")}.png`, fullPage: tag === "desk" });
}

const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });

for (const vp of VPS) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, colorScheme: vp.scheme });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => add("BAD", "*", "js", "PAGEERROR " + String(e).slice(0, 120)));
  page.on("console", (m) => { if (m.type() === "error" && !/WebSocket|favicon/.test(m.text())) add("BAD", "*", "js", m.text().slice(0, 120)); });
  await page.addInitScript(() => { try { localStorage.setItem("dialog.tutorialDone.v1", "1"); } catch {} });
  if (vp.attr) await page.addInitScript((a) => {
    document.addEventListener("DOMContentLoaded", () => document.documentElement.setAttribute("data-theme", a));
  }, vp.attr);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);

  await probe(page, "home", vp.tag);

  // Кампания
  await page.click('text=КАМПАНИЯ').catch(()=>{});
  await page.waitForTimeout(1400); await probe(page, "campaign", vp.tag);
  // Курс
  await page.click('text=КУРС').catch(()=>{});
  await page.waitForTimeout(1400); await probe(page, "course", vp.tag);
  // Своя сделка
  await page.click('text=СВОЯ СДЕЛКА').catch(()=>{});
  await page.waitForTimeout(1200); await probe(page, "custom", vp.tag);
  // Экзамен
  await page.click('text=ЭКЗАМЕН').catch(()=>{});
  await page.waitForTimeout(1200); await probe(page, "exam", vp.tag);
  // Прогресс
  await page.click('text=ПРОГРЕСС').catch(()=>{});
  await page.waitForTimeout(1200); await probe(page, "progress", vp.tag);
  // Профиль
  await page.click('text=ПРОФИЛЬ').catch(()=>{});
  await page.waitForTimeout(1200); await probe(page, "profile", vp.tag);

  await ctx.close();
}
await browser.close();

const bad = findings.filter(f => f.sev === "BAD");
const warn = findings.filter(f => f.sev === "WARN");
console.log(`\n=== НАЙДЕНО: ${bad.length} ошибок, ${warn.length} замечаний ===\n`);
const group = (list) => {
  const m = new Map();
  for (const f of list) { const k = `${f.sev} ${f.kind}`; if (!m.has(k)) m.set(k, []); m.get(k).push(f); }
  for (const [k, v] of m) { console.log(`— ${k} (${v.length})`); for (const f of v.slice(0, 8)) console.log(`   [${f.where}] ${f.msg}`); }
};
group(bad); group(warn);
fs.writeFileSync("/tmp/ui-audit/findings.json", JSON.stringify(findings, null, 1));
