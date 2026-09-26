// Revisit all numeric/freeform exercises with input faults through complete lessons.
// Each case is a separate Node and headless-browser process. Unlocks are restored
// ONLY from the previously earned course.mjs --blocks 11 --master snapshots,
// documented in docs/deep-audit-12206/README.md and final-evidence.json. This is
// not a new proof of unlocking, XP earning, examinations or model quality.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { COURSE_BANK as BANK } from '../src/data/course.generated.ts';
import { COURSE_BLOCKS } from '../src/data/course.blocks.generated.ts';
import { I18N } from '../src/i18n.ts';

const arg = (key, fallback) => { const i = process.argv.indexOf(`--${key}`); return i < 0 ? fallback : process.argv[i + 1]; };
const root = resolve(import.meta.dirname, '../..');
const base = arg('url', 'http://127.0.0.1:15418');
const out = resolve(arg('out', `${root}/tmp/course-input-faults`));
const id = arg('id', null);
const faultNames = ['empty', 'long', 'unicode', 'double'];
const targets = BANK.filter(ex => ['numeric', 'freeform'].includes(ex.type));
mkdirSync(out, { recursive: true });

if (!id) {
  const wantedLang = arg('lang', null), wantedFault = arg('fault', null);
  const cases = (wantedLang ? [wantedLang] : ['ru', 'en']).flatMap(lang =>
    targets.flatMap(ex => (wantedFault ? [wantedFault] : faultNames).map(fault => ({ lang, id: ex.id, type: ex.type, fault }))));
  const result = [];
  let next = 0;
  const worker = async () => {
    while (next < cases.length) {
      const item = cases[next++], caseName = `${item.lang}-${item.id}-${item.fault}`;
      const code = await new Promise((done, reject) => {
        const child = spawn(process.execPath, [...process.execArgv, import.meta.filename, '--id', item.id, '--lang', item.lang,
          '--fault', item.fault, '--url', base, '--out', out], { stdio: ['ignore', 'pipe', 'pipe'] });
        let log = '';
        child.stdout.on('data', data => { log += data; });
        child.stderr.on('data', data => { log += data; });
        child.on('error', reject);
        child.on('exit', code => { writeFileSync(`${out}/${caseName}.log`, log); done(code); });
      });
      result.push({ ...item, status: code === 0 ? 'passed' : 'failed', exitCode: code });
      writeFileSync(`${out}/summary.json`, JSON.stringify({ planned: cases.length, completed: result.length,
        passed: result.filter(x => x.status === 'passed').length, failed: result.filter(x => x.status === 'failed').length, cases: result }, null, 2));
      console.log(`${code === 0 ? 'PASS' : 'FAIL'} ${caseName} (${result.length}/${cases.length})`);
    }
  };
  await Promise.all(Array.from({ length: Number(arg('jobs', '2')) }, worker));
  if (result.some(x => x.status !== 'passed')) process.exitCode = 1;
} else {
  const lang = arg('lang', 'ru'), fault = arg('fault', 'empty'), t = I18N[lang];
  const target = targets.find(ex => ex.id === id);
  assert.ok(target && t && faultNames.includes(fault), 'valid case required');
  const caseName = `${lang}-${id}-${fault}`, dir = `${out}/${caseName}`;
  mkdirSync(dir, { recursive: true });
  const snapshotPath = `${root}/tmp/deep-master-${lang}/storage.json`;
  const snapshotText = readFileSync(snapshotPath, 'utf8');
  const saved = JSON.parse(snapshotText);
  assert.equal(saved.origins.length, 1, 'earned snapshot must have a single origin');
  const profile = JSON.parse(saved.origins[0].localStorage.find(x => x.name === 'dialog.progress.v1').value);
  assert.ok(COURSE_BLOCKS.every(block => profile.course[block.id]?.passed), 'previously earned completed blocks required');
  // Only the origin changes for our isolated server; all earned values remain intact.
  saved.origins[0].origin = new URL(base).origin;
  const evidence = { caseName, id, lang, fault, type: target.type, status: 'running', steps: [],
    provenance: { snapshotPath, sha256: createHash('sha256').update(snapshotText).digest('hex'), origin: 'http://127.0.0.1:15416',
      scope: 'Revisit full lesson with existing earned progress; no claim of fresh unlocking or XP.' } };
  let browser, p;
  const errors = [];
  const record = async label => evidence.steps.push({ label, text: await p.locator('body').innerText() });
  const clearScrims = async () => {
    for (let i = 0; i < 6 && await p.locator('.milestone-scrim').count(); i++) await p.locator('.milestone-go').first().click();
  };
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH
      || '/Users/pozitiv4500/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
    const ctx = await browser.newContext({ storageState: saved, viewport: { width: 1280, height: 950 } });
    // Deterministic local checking must survive unavailable backend and coach.
    await ctx.route(url => url.pathname.startsWith('/api/'), route => route.fulfill({ status: 503, body: 'offline input audit' }));
    p = await ctx.newPage(); p.setDefaultTimeout(12000);
    p.on('pageerror', error => errors.push(String(error)));
    p.on('dialog', async dialog => { errors.push(`Unexpected dialog ${dialog.message()}`); await dialog.dismiss(); });
    await p.goto(base);
    if (await p.locator('html').getAttribute('lang') !== lang) await p.getByRole('button', { name: lang.toUpperCase(), exact: true }).click();
    await p.locator('[data-nav="course"]').first().click();
    await p.locator('.cnode-btn').nth(COURSE_BLOCKS.findIndex(x => x.id === target.block)).click();
    const block = COURSE_BLOCKS.find(x => x.id === target.block);
    await p.locator('.lesson-list button').nth(block.lessons.findIndex(x => x.idx === target.lesson)).click();
    await p.locator('.lesson-body').waitFor(); await record('lesson theory');
    await p.getByRole('button', { name: t.course.toTasks, exact: true }).click();
    let correct = 0, asked = 0, visited = false;
    while (await p.locator('.ex').count()) {
      await clearScrims();
      const prompt = (await p.locator('.ex-prompt').innerText()).trim();
      const quote = (await p.locator('.ex-quote').allTextContents()).join('\n');
      const candidates = BANK.filter(ex => ex.block === target.block && ex.lesson === target.lesson && ex.prompt[lang] === prompt
        && (!ex.player_line || !['meters', 'reaction'].includes(ex.type) || quote.includes(ex.player_line[lang])));
      assert.equal(candidates.length, 1, 'unique visible exercise');
      const ex = candidates[0]; asked++;
      const isTarget = ex.id === target.id;
      if (ex.type === 'drill') {
        // A lesson drill is optional, and is outside this input-only scope.
        await p.getByRole('button', { name: `${t.course.next} →`, exact: true }).click();
        continue;
      }
      const check = p.getByRole('button', { name: t.course.checkIt, exact: true });
      let expectCorrect = true;
      if (isTarget) {
        visited = true;
        const input = p.locator(ex.type === 'numeric' ? '.ex-num input' : '.ex-free textarea');
        if (fault === 'empty') {
          assert.equal(await check.isDisabled(), true, 'blank answer disabled');
          await input.press(ex.type === 'numeric' ? 'Enter' : 'Control+Enter');
          assert.equal(await p.locator('.ex-verdict').count(), 0, 'empty shortcut does not submit');
          await input.fill(' \t \n '.replace(ex.type === 'numeric' ? /\n/g : /$^/g, ' '));
          assert.equal(await check.isDisabled(), true, 'whitespace answer disabled');
          await input.press(ex.type === 'numeric' ? 'Enter' : 'Control+Enter');
          assert.equal(await p.locator('.ex-verdict').count(), 0, 'whitespace shortcut does not submit');
          await record('empty and whitespace rejected without submission');
          await input.fill(ex.type === 'numeric' ? String(ex.answer.value) : ex.reference[lang]);
        } else if (fault === 'long') {
          const text = ex.type === 'numeric' ? '9'.repeat(10000) : 'x'.repeat(10000);
          await input.fill(text);
          assert.equal(await input.inputValue(), text, 'course currently accepts full 10,000-character input');
          evidence.inputLength = text.length; expectCorrect = false;
        } else if (fault === 'unicode') {
          const text = '👩🏽‍💻 e\u0301 \u00a0 <img src=x onerror="window.__courseFault=1"><script>window.__courseFault=2</script> & " \' １２３';
          await input.fill(text);
          assert.equal(await input.inputValue(), text, 'Unicode/markup retained literally');
          evidence.input = text; expectCorrect = false;
        } else {
          await input.fill(ex.type === 'numeric' ? String(ex.answer.value) : ex.reference[lang]);
        }
      } else if (['choice', 'spot_error', 'reaction', 'meters', 'face'].includes(ex.type)) {
        const label = ['choice', 'spot_error'].includes(ex.type) ? ex.options[ex.answer][lang]
          : ex.type === 'meters' ? t.course.meters[ex.answer] : t.probe.reactions[ex.answer];
        await p.locator('.ex-opt').filter({ hasText: label }).first().click();
      } else if (ex.type === 'numeric') await p.locator('.ex-num input').fill(String(ex.answer.value));
      else if (ex.type === 'freeform') await p.locator('.ex-free textarea').fill(ex.reference[lang]);
      else if (ex.type === 'order') {
        for (let targetIndex = 0; targetIndex < ex.answer.length; targetIndex++) {
          const want = ex.items.find(item => item.id === ex.answer[targetIndex])[lang];
          const labels = await p.locator('.ex-ord-t').allTextContents();
          for (let i = labels.findIndex(label => label.trim() === want); i > targetIndex; i--) await p.locator('.ex-order li').nth(i).locator('button').first().click();
        }
      } else if (ex.type === 'match') {
        for (const [left, right] of Object.entries(ex.answer)) {
          await p.locator('.ex-match ul').first().locator('button').filter({ hasText: ex.left.find(x => x.id === left)[lang] }).first().click();
          await p.locator('.ex-match ul').nth(1).locator('button').filter({ hasText: ex.right.find(x => x.id === right)[lang] }).first().click();
        }
      } else throw Error(`Unsupported exercise ${ex.type}`);
      if (isTarget && fault === 'double') await check.dblclick(); else await check.click();
      await p.locator('.ex-verdict').waitFor();
      assert.equal(await p.locator('.ex-verdict').count(), 1, 'one verdict only');
      assert.equal(await p.locator('.ex-verdict.ok').count(), expectCorrect ? 1 : 0, `expected verdict: ${ex.id}`);
      if (expectCorrect) correct++;
      if (isTarget) {
        assert.equal(await p.locator(ex.type === 'numeric' ? '.ex-num input' : '.ex-free textarea').isDisabled(), true, 'answer locked');
        assert.equal(await p.evaluate(() => window.__courseFault), undefined, 'markup never executed');
        await record('target checked exactly once');
        await p.screenshot({ path: `${dir}/target.png`, fullPage: true });
      }
      await p.getByRole('button', { name: `${t.course.next} →`, exact: true }).click();
    }
    assert.equal(visited, true, 'target reached');
    await p.locator('.wrap.lesson.done').waitFor();
    assert.equal(await p.locator('.wrap.lesson.done .lead').innerText(), t.course.lessonScore.replace('{n}', String(correct)).replace('{total}', String(asked)), 'exact lesson score, no double count');
    await record('lesson completed');
    await p.locator('.wrap.lesson.done button.primary').click();
    await p.locator('.lesson-list').waitFor();
    await p.getByRole('button', { name: `← ${t.course.allBlocks}`, exact: true }).click();
    await p.locator('.course-path').waitFor();
    await record('returned to course map');
    await p.screenshot({ path: `${dir}/returned.png`, fullPage: true });
    assert.deepEqual(errors, [], 'no JavaScript errors or dialogs');
    evidence.status = 'passed'; evidence.exercisesTraversed = asked;
    console.log(`PASS ${caseName}: full lesson → correct total → map`);
  } catch (error) {
    evidence.status = 'failed'; evidence.error = String(error); evidence.pageErrors = errors; process.exitCode = 1;
    if (p) { evidence.bodyAtFailure = await p.locator('body').innerText().catch(() => 'unavailable'); await p.screenshot({ path: `${dir}/failed.png`, fullPage: true }).catch(() => {}); }
    console.error(error);
  } finally {
    writeFileSync(`${dir}/result.json`, JSON.stringify(evidence, null, 2));
    await browser?.close();
  }
}
