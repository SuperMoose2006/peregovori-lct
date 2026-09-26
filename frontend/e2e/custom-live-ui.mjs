// Explicit live-provider check of the currently installed stand, not the local branch.
import {chromium} from 'playwright-core';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const out=resolve('tmp/custom-live-ui');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),results=[];
try{for(const lang of ['ru','en']){
 const c=await browser.newContext(),p=await c.newPage(),steps=[],begin=performance.now();p.setDefaultTimeout(60000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const snap=async label=>{steps.push({label,ms:Math.round(performance.now()-begin),text:await p.locator('body').innerText()});await p.screenshot({path:`${out}/${lang}-${steps.length}.png`,fullPage:true})};
 try{
  const r=await p.goto('https://dialog.2-26-49-28.nip.io/');assert.equal(r.status(),200);
  if(lang==='en')await p.getByRole('button',{name:'EN',exact:true}).click();
  await p.locator('[data-nav="custom"]').first().click();assert.equal(await p.locator('.cust-go').isDisabled(),true);
  await p.locator('.cust-ta').fill(lang==='ru'?'Покупаем 1000 упаковок для завода. Поставщик предлагает 100 рублей за упаковку. Наша цель 86, предел 95. Обсуждаем предоплату и контракт на год.':'Buying 1000 packages for a factory. Supplier asks 100 per package. Our target is 86, limit 95. We can discuss prepayment and a year-long contract.');
  await snap('description');await p.locator('.cust-go').click();await p.locator('.chat textarea').waitFor();if(await p.locator('.onb-skip').count())await p.locator('.onb-skip').click();await snap('generated table');
  const moves=lang==='ru'?['Что для вас важнее всего в этом контракте?','Готовы обсудить предоплату и долгий контракт.','Согласен на вашу цену. Договорились.']:['What matters most to you in this contract?','We can discuss prepayment and a long contract.','I accept your price. Agreed.'];
  for(const text of moves){if(await p.locator('.debrief,.outcome').count())break;const before=await p.locator('.msg.opp:not(.typing-msg)').count();await p.locator('.chat textarea').fill(text);await p.locator('.send').click();await p.waitForFunction(n=>!!document.querySelector('.debrief,.outcome')||(document.querySelectorAll('.msg.opp:not(.typing-msg)').length>n&&!document.querySelector('.caret,.typing-msg,.wait-status')),before,{timeout:45000});await snap('turn')}
  await p.locator('.debrief').waitFor();for(let i=0;i<8&&await p.locator('.milestone-go').count();i++)await p.locator('.milestone-go').click();
  for(let i=0;i<2;i++){await snap('review');await p.locator('.beat-go').click()}await snap('last review');await p.locator('[data-nav="practice"]').first().click();await p.locator('.cards .card').first().waitFor();assert.deepEqual(errors,[]);
  results.push({id:`custom-online/${lang}`,status:'прошёл',steps,ms:Math.round(performance.now()-begin),scope:'Installed stand 20260923-b682bb4, live generation/model; NOT local branch'});
 }catch(e){await snap('failure').catch(()=>{});results.push({id:`custom-online/${lang}`,status:'упал',steps,error:String(e),errors})}
 finally{await c.close();writeFileSync(out+'/results.json',JSON.stringify(results,null,2))}
 console.log(results.at(-1).id,results.at(-1).status,results.at(-1).error||'');
}}finally{await browser.close()}
if(results.some(r=>r.status==='упал'))process.exitCode=1;
