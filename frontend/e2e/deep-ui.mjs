// DOM actions only in our own headless process; no OS window control.
import {chromium} from 'playwright-core';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {SCENARIOS} from '../src/data/scenarios.ts';
import {MIRRORS} from '../src/data/mirrors.ts';
import {dailyTable} from '../src/lib/daily.ts';
const custom=process.argv.includes('--custom'),mirror=process.argv.includes('--mirror'),daily=process.argv.includes('--daily');
const mode=custom?'custom':process.argv.includes('--exam')?'exam':'practice',outcome=process.argv.includes('--breakdown')?'breakdown':'agreement';
const root=resolve(import.meta.dirname,'../..'),out=root+`/tmp/deep-ui-${daily?"daily":mirror?"mirror":mode}-${outcome}`;mkdirSync(out,{recursive:true});
const games=JSON.parse(readFileSync(root+'/frontend/test/fixtures/games.json','utf8')),results=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{for(const lang of ['ru','en'])for(const sc of custom?[{id:"custom",title:{ru:"",en:""}}]:mirror?MIRRORS:daily?SCENARIOS.filter(x=>x.id===dailyTable().scenarioId):SCENARIOS){
 if(process.env.AUDIT_CASE && process.env.AUDIT_CASE!==`${sc.id}/${lang}`)continue;
 const id=daily?`daily/${lang}`:mirror?`mirror/${sc.id}/${lang}`:custom?`custom-offline/${lang}`:`${mode}/${sc.id}/${lang}/${outcome}`,began=performance.now(),steps=[],errors=[];
 const context=await browser.newContext({viewport:{width:1280,height:900}}),p=await context.newPage();
 p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/api/health',r=>r.fulfill({status:503}));
 const record=async label=>{steps.push({label,text:(await p.locator('body').innerText()).slice(0,18000),ms:Math.round(performance.now()-began)});await p.screenshot({path:`${out}/${sc.id}-${lang}-${steps.length}.png`,fullPage:true})};
 try{
  await p.goto('http://127.0.0.1:15416'+(custom?'?genfail=1':''));if(lang==='en')await p.getByRole('button',{name:'EN',exact:true}).click();if(mode==='exam')await p.locator('[data-nav="exam"]').first().click();await record('home');
  if(daily){
   await p.locator(".rc-daily").click();
  }else if(mirror){
   await p.locator('[data-other-side="open"]').click();
   await p.locator(".os-card").filter({has:p.getByRole("heading",{name:sc.title[lang],exact:true})}).locator('[data-other-side="play"]').click();
  }else if(custom){
   await p.locator('[data-nav="custom"]').first().click();
   assert.equal(await p.locator('.cust-go').isDisabled(),true);
   await p.locator('.cust-ta').fill(lang==='ru'?'Контракт genfail / force-gen-error: обсуждаем цену поставки и сроки.':'A genfail / force-gen-error supply contract: negotiating price and delivery dates.');
   await p.locator('.cust-go').click();
  }else await p.locator('.cards .card').filter({has:p.locator('.ct',{hasText:sc.title[lang]})}).click();await p.locator('.chat textarea').waitFor();
  if(await p.locator('.onb-skip').count())await p.locator('.onb-skip').click();await record('table');
  const input=p.locator('.chat textarea'),send=p.locator('.send');
  assert.equal(await send.isDisabled(),true);await input.fill('   ');assert.equal(await send.isDisabled(),true);
  await input.fill('x'.repeat(10000));assert.equal((await input.inputValue()).length,2000);
  await input.fill('🤝 <script>window.attack=1</script> &');assert.equal(await p.evaluate(()=>window.attack),undefined);
  const lines=custom?(lang==='ru'?['Что для вас важно?','Рыночная цена 86, потому что это стандарт рынка.','Согласен на вашу цену. Договорились.']:['What matters to you?','The market price is 86 because that is the industry benchmark.','I accept your price. Agreed.']):outcome==='agreement'?(mirror?games.other_side:games.principled)[sc.id][lang]:Array(16).fill(lang==='ru'?'Вы некомпетентны. У вас нет выбора. Это ультиматум.':'You are incompetent. You have no choice. This is an ultimatum.');
  for(const line of lines){
   if(await p.locator('.debrief, .outcome').count())break;
   const before=await p.locator('.msg.opp:not(.typing-msg)').count();await input.fill(line);await send.click();
   await p.waitForFunction(n=>(document.querySelectorAll('.msg.opp:not(.typing-msg)').length>n&&!document.querySelector('.caret, .wait-status, .typing-msg'))||!!document.querySelector('.debrief, .outcome'),before);await record('turn');
  }
  await p.locator('.debrief').waitFor();assert.match(await p.locator('.debrief').innerText(),daily?(lang==='ru'?/Соглашение достигнуто|Переговоры сорваны/:/Agreement reached|Talks broke down/i):outcome==='agreement'?(lang==='ru'?/Соглашение достигнуто/:/Agreement reached/i):(lang==='ru'?/Переговоры сорваны/:/Talks broke down/i));await record('debrief');
  for(let part=0;part<2&&await p.locator('.beat-go').count();part++){await p.locator('.beat-go').click();await record('debrief part '+(part+2));}
  await p.locator('.dacts').waitFor();
  if(mode==='exam'){
   assert.match(await p.locator('.cert-server').innerText(),lang==='ru'?/Личность не удостоверена/:/Identity is not verified/);
   assert.equal(await p.locator('.cert-server a').count(),0,'offline result must not claim registry verification');
   assert.equal(await p.locator(outcome==='agreement'?'.cert-award':'.cert-none').count(),1);
  }
  await p.locator('[data-nav="practice"]').first().click();await p.locator('.cards .card').first().waitFor();await record('home again');assert.deepEqual(errors,[]);
  results.push({id,status:'прошёл',scope:`offline DOM ${mode}/${outcome}; composing guards only`,steps,ms:Math.round(performance.now()-began)});
 }catch(e){await record('failure').catch(()=>{});results.push({id,status:'упал',error:String(e),steps});}
 finally{await context.close();writeFileSync(out+'/results.json',JSON.stringify(results,null,2));}
 console.log(id,results.at(-1).status,results.at(-1).error||'');
}}finally{await browser.close()}
if(results.some(r=>r.status==='упал'))process.exitCode=1;
