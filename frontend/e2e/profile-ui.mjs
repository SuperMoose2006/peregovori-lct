import {chromium} from 'playwright-core';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {I18N} from '../src/i18n.ts';
const root=resolve(import.meta.dirname,'../..'),out=root+'/tmp/deep-profile';mkdirSync(out,{recursive:true});
const games=JSON.parse(readFileSync(root+'/frontend/test/fixtures/games.json','utf8')),results=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{for(const lang of ['ru','en']){
 const t=I18N[lang],c=await browser.newContext(),p=await c.newPage(),steps=[];await c.route('**/api/health',r=>r.fulfill({status:503}));p.setDefaultTimeout(12000);
 const snapshot=async label=>{steps.push({label,text:await p.locator('body').innerText()});await p.screenshot({path:`${out}/${lang}-${steps.length}.png`,fullPage:true})};
 const overlays=async()=>{for(let i=0;i<12;i++){
  if(await p.locator('.milestone-go').count())await p.locator('.milestone-go').click();
  else if(await p.locator('.onb-next').count())await p.locator('.onb-next').click();else break;
 }};
 const probes=async()=>{for(let i=0;i<5&&await p.locator('.pb-opt:not([aria-disabled="true"])').count();i++){await p.locator('.pb-opt:not([aria-disabled="true"])').first().click();await snapshot('face answer')}};
 try{
  await p.goto('http://127.0.0.1:15416');if(lang==='en')await p.getByRole('button',{name:'EN',exact:true}).click();
  const theme=p.locator('.controls .seg').nth(1).locator('button'),sound=p.locator('.controls .seg').nth(2).locator('button');
  const wasTheme=await theme.getAttribute('aria-pressed'),wasSound=await sound.getAttribute('aria-pressed');await theme.click();await sound.click();await p.reload();
  assert.notEqual(await theme.getAttribute('aria-pressed'),wasTheme);assert.notEqual(await sound.getAttribute('aria-pressed'),wasSound);await snapshot('preferences restored');
  await p.locator('[data-nav="profile"]').first().click();await p.getByText(t.gam.noGames,{exact:true}).waitFor();assert.equal(await p.locator('.grw, .skillbars').count(),0);await snapshot('empty history');
  for(const preset of ['classic','read','call','poker','full']){
   const button=p.locator('.sp-pill').filter({hasText:t.layers.presetNames[preset]});await button.click();
   assert.equal(await button.getAttribute('aria-pressed'),'true',preset+' selected');await snapshot('preset '+preset);
  }
  await p.locator('.sp-pill').filter({hasText:t.layers.presetNames.read}).click();await p.locator('[data-nav="practice"]').first().click();
  await p.locator('.cards .card').first().click();
  for(let run=0;run<6;run++){
   await p.locator('.chat textarea').waitFor();await overlays();
   for(const line of games.principled.supplier[lang]){
    if(await p.locator('.debrief, .outcome').count())break;
    await overlays();await probes();const before=await p.locator('.msg.opp:not(.typing-msg)').count();
    await p.locator('.chat textarea').fill(line);await p.locator('.send').click();
    await p.waitForFunction(n=>(document.querySelectorAll('.msg.opp:not(.typing-msg)').length>n&&!document.querySelector('.caret, .wait-status, .typing-msg'))||!!document.querySelector('.debrief, .outcome'),before);await overlays();await probes();await snapshot('run '+run+' turn');
   }
   await p.locator('.debrief').waitFor();await overlays();
   if(run===0){await p.locator('.wi-reveal').first().click();await p.locator('.wi-diverge').waitFor();assert.equal(await p.locator('.wi-col').count(),2);await snapshot('what if');}
   for(let part=0;part<2;part++)await p.locator('.beat-go').click();await snapshot('review '+run);
   if(run<5)await p.locator('.dacts .primary').click();
  }
  await p.locator('[data-nav="profile"]').first().click();await p.locator('.grw:not(.grw-low)').waitFor();await snapshot('earned growth');assert.equal(await p.locator('.grw-low').count(),0);
  results.push({lang,status:'прошёл',steps,scope:'preferences, presets, full onboarding acknowledgements, face questions, six replays, what-if, growth'});
 }catch(e){await snapshot('failure').catch(()=>{});results.push({lang,status:'упал',error:String(e),steps})}
 finally{await c.close();writeFileSync(out+'/results.json',JSON.stringify(results,null,2))}
 console.log(lang,results.at(-1).status,results.at(-1).error||'');
}}finally{await browser.close()}
if(results.some(r=>r.status==='упал'))process.exitCode=1;
