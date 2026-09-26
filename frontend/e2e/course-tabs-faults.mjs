// Full journeys in our own headless process. No seeded course progress.
// Two already-open lessons must not overwrite each other's earned progress.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { COURSE_BANK } from '../src/data/course.generated.ts';
import { I18N } from '../src/i18n.ts';

const lang = process.env.AUDIT_LANG || 'ru', t = I18N[lang];
const out = resolve(import.meta.dirname, '../../tmp/course-tabs-' + lang + (process.env.AUDIT_TAG ? '-' + process.env.AUDIT_TAG : ''));
mkdirSync(out, { recursive: true });
const steps = [], failures = [];
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const c = await browser.newContext();
await c.route('**/api/health', r => r.fulfill({ status: 503 }));
await c.route('**/api/course/coach', r => r.fulfill({ status: 503 }));
let mutatedResponses = 0;
if (process.env.AUDIT_MUTATION === 'stale-profile') {
  await c.route('**/src/components/CourseScreen.tsx*', async route => {
    const response = await route.fetch();
    const source = await response.text();
    assert.ok(source.includes('loadProfile(profile)'), 'mutation must change the served implementation');
    mutatedResponses++;
    await route.fulfill({ response, body: source.replaceAll('loadProfile(profile)', 'profile') });
  });
}
const a = await c.newPage(), b = await c.newPage();
const snapshot = async (p, label) => {
  steps.push({ label, text: await p.locator('body').innerText(), profile: await p.evaluate(() => JSON.parse(localStorage.getItem('dialog.progress.v1'))) });
  await p.screenshot({ path: `${out}/${steps.length}.png`, fullPage: true });
};
async function open(p, lesson) {
  p.setDefaultTimeout(12000);
  await p.goto(process.env.AUDIT_URL || 'http://127.0.0.1:15416');
  if (await p.locator('html').getAttribute('lang') !== lang) await p.getByRole('button', { name: lang.toUpperCase(), exact: true }).click();
  await p.locator('[data-nav="course"]').first().click();
  await p.locator('.cnode-btn').first().click();
  await p.locator('.lesson-list button').nth(lesson - 1).click();
  await p.locator('.lesson-body').waitFor();
}
async function complete(p) {
  await p.getByRole('button', { name: t.course.toTasks, exact: true }).click();
  while (await p.locator('.ex').count()) {
    const prompt = (await p.locator('.ex-prompt').innerText()).trim();
    const ex = COURSE_BANK.find(x => x.block === 'foundations' && x.prompt[lang] === prompt);
    assert.ok(ex, prompt);
    const label = ['choice', 'spot_error'].includes(ex.type) ? ex.options[ex.answer][lang]
      : ex.type === 'reaction' ? t.probe.reactions[ex.answer] : null;
    if (label) await p.locator('.ex-opt').filter({ hasText: label }).first().click();
    else if (ex.type === 'freeform') await p.locator('.ex-free textarea').fill(ex.reference[lang]);
    else throw Error('Unexpected exercise: ' + ex.type);
    await p.getByRole('button', { name: t.course.checkIt, exact: true }).click();
    await p.locator('.ex-verdict.ok').waitFor();
    await snapshot(p, `answer ${ex.id}`);
    await p.getByRole('button', { name: `${t.course.next} →`, exact: true }).click();
  }
  await p.locator('.wrap.lesson.done').waitFor();
  await snapshot(p, 'lesson complete');
  await p.locator('.wrap.lesson.done button.primary').click();
  await p.locator('.lesson-list').waitFor();
}
try {
  // B captures the empty profile before A earns lesson 1.
  await open(a, 1); await open(b, 3);
  if (process.env.AUDIT_MUTATION) assert.ok(mutatedResponses > 0, 'served implementation was mutated');
  await complete(a); await complete(b);
  const wanted = COURSE_BANK.filter(x => x.block === 'foundations' && [1, 3].includes(x.lesson));
  for (const [name, p] of [['a', a], ['b', b]]) {
    await p.reload(); await p.locator('[data-nav="course"]').first().click();
    await p.locator('.cnode-btn').first().click();
    await snapshot(p, `reload ${name}`);
    const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('dialog.progress.v1')));
    try {
      assert.deepEqual(stored.course.foundations.lessons.slice().sort(), [1, 3], 'both lessons retained');
      assert.deepEqual(stored.course.foundations.solved.slice().sort(), wanted.map(x => x.id).sort(), 'all earned answers retained');
      assert.equal(stored.xp, wanted.reduce((n, ex) => n + ex.xp, 0), 'XP retained once');
      assert.equal(await p.locator('.lesson-list li.done').count(), 2, 'both completions visible after reload');
    } catch (error) { failures.push(String(error)); }
  }
  assert.deepEqual(failures, []);
  console.log(`PASS ${lang}: two tabs → separate complete lessons → reload → combined progress and exact XP`);
} catch (error) {
  failures.push(String(error)); throw error;
} finally {
  writeFileSync(`${out}/results.json`, JSON.stringify({ lang, status: failures.length ? 'failed' : 'passed', failures, steps }, null, 2));
  await browser.close();
}
