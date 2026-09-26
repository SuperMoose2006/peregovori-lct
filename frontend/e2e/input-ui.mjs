import {chromium} from 'playwright-core';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const out=resolve(import.meta.dirname,'../../tmp/deep-input');mkdirSync(out,{recursive:true});
const results=[],browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{for(const lang of ['ru','en']){
 const c=await browser.newContext(),p=await c.newPage();await c.route('**/api/health',r=>r.fulfill({status:503}));
 const record=async label=>{results.push({lang,label,text:await p.locator('body').innerText()});await p.screenshot({path:`${out}/${lang}-${label}.png`,fullPage:true})};
 const enter=async page=>{await page.locator('.cards .card').first().click();await page.locator('.chat textarea').waitFor();if(await page.locator('.onb-skip').count())await page.locator('.onb-skip').click()};
 try{
  await p.goto('http://127.0.0.1:15416/?audit-history=before');await p.goto('http://127.0.0.1:15416');if(lang==='en')await p.getByRole('button',{name:'EN',exact:true}).click();await enter(p);
  await p.locator('.chat textarea').fill('a'.repeat(1999)+'🤝');
  assert.equal(await p.locator('.chat textarea').inputValue(),'a'.repeat(1999),'no split emoji at native maxlength boundary');
  const hostileMarkup='🤝 <img src=x onerror="window.attack=1"> & <script>alert(1)</script>';
  await p.locator('.chat textarea').fill(hostileMarkup);await p.locator('.send').dblclick();
  await p.waitForFunction(()=>document.querySelectorAll('.msg.opp:not(.typing-msg)').length>=2&&!document.querySelector('.typing-msg'));
  assert.equal(await p.locator('.msg.me').count(),1,'double click applies one turn');assert.equal((await p.locator('.msg.me .bub').innerText()).trim(),hostileMarkup);
  assert.equal(await p.locator('.msg.me img, .msg.me script').count(),0);assert.equal(await p.evaluate(()=>window.attack),undefined);await record('unicode-double');
  await p.locator('.chat textarea').fill('x'.repeat(10000));await p.locator('.send').click();
  await p.waitForFunction(()=>document.querySelectorAll('.msg.opp:not(.typing-msg)').length>=3&&!document.querySelector('.caret, .wait-status, .typing-msg'));
  assert.equal((await p.locator('.msg.me .bub').nth(1).innerText()).trim(),'x'.repeat(2000));
  await p.locator('.chat textarea').fill(lang==='ru'?'Согласен на вашу цену. Договорились.':'I accept your price. Agreed.');await p.locator('.send').click();
  await p.locator('.debrief').waitFor();await record('long-input-debrief');
  await p.locator('[data-nav="practice"]').first().click();await enter(p);
  const second=await c.newPage();await second.goto('http://127.0.0.1:15416');await enter(second);assert.equal(await second.locator('.msg.me').count(),0,'new tab does not inherit active transcript');await second.close();
  await p.locator('.chat textarea').fill(lang==='ru'?'Что для вас важно?':'What matters to you?');await p.locator('.send').click();await p.reload();
  await p.locator('.cards .card').first().waitFor();assert.match(await p.locator('[role=alert]').innerText(),lang==='ru'?/не восстановлена/:/not been restored/i);assert.equal(await p.locator('.debrief').count(),0);await record('reload');
  await enter(p);await p.locator('.chat textarea').fill(lang==='ru'?'Что для вас важно?':'What matters to you?');await p.locator('.send').click();
  await p.goBack();await p.locator('.cards .card').first().waitFor();assert.equal(await p.locator('.debrief,.chat textarea').count(),0);await record('browser-back');
  await p.goForward();await p.locator('.cards .card').first().waitFor();assert.equal(await p.locator('.debrief,.chat textarea').count(),0);await record('browser-forward');
  await enter(p);await p.locator('.quit').first().click();await p.locator('.cards .card').first().waitFor();await record('quit');
 }finally{await c.close()}
}}finally{await browser.close();writeFileSync(out+'/results.json',JSON.stringify(results,null,2))}
console.log('PASS RU/EN: markup rendered literally, double click once, isolated second tab, reload notice, quit');
