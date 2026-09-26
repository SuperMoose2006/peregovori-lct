import {chromium} from 'playwright-core';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {CAMPAIGN_DEFS} from '../src/data/campaigns.generated.ts';
const root=resolve(import.meta.dirname,'../..'),out=root+'/tmp/deep-campaign';mkdirSync(out,{recursive:true});
const games=JSON.parse(readFileSync(root+'/frontend/test/fixtures/games.json','utf8')),results=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{for(const lang of ['ru','en'])for(const campaign of CAMPAIGN_DEFS){
 const c=await browser.newContext(),p=await c.newPage(),steps=[];p.setDefaultTimeout(15000);await c.route('**/api/health',r=>r.fulfill({status:503}));
 const snap=async label=>{steps.push({label,text:await p.locator('body').innerText()});await p.screenshot({path:`${out}/${lang}-${campaign.id}-${steps.length}.png`,fullPage:true})};
 const clear=async()=>{for(let n=0;n<8&&await p.locator('.milestone-go').count();n++)await p.locator('.milestone-go').click()};
 try{
  await p.goto('http://127.0.0.1:15416');if(lang==='en')await p.getByRole('button',{name:'EN',exact:true}).click();await p.locator('[data-nav="campaign"]').first().click();
  await p.locator('.camp-pick-b').filter({hasText:campaign.title[lang]}).click();await snap('overview');
  for(const stage of campaign.stages){
   await clear();await p.locator('.camp-cta').click();await p.locator('.chat textarea').waitFor();if(await p.locator('.onb-skip').count())await p.locator('.onb-skip').click();
   for(const line of games.principled[stage.scenario_id][lang]){
    if(await p.locator('.debrief').count())break;await clear();
    const before=await p.locator('.msg.opp:not(.typing-msg)').count();await p.locator('.chat textarea').fill(line);await p.locator('.send').click();
    await p.waitForFunction(n=>(document.querySelectorAll('.msg.opp:not(.typing-msg)').length>n&&!document.querySelector('.caret, .wait-status, .typing-msg'))||!!document.querySelector('.debrief, .outcome'),before);await snap('turn '+stage.scenario_id);
   }
   await p.locator('.debrief').waitFor();await clear();
   for(let part=0;part<2;part++)await p.locator('.beat-go').click();
   await snap('review '+stage.scenario_id);await p.locator('.dacts .primary').click();
  }
  await p.locator('.camp-done-head').waitFor();assert.equal(await p.locator('.arc.final .act.done').count(),campaign.stages.length);assert.ok((await p.locator('.camp-epilogue').innerText()).length>20);await snap('epilogue');
  await clear();await p.locator('.dacts .primary').click();await p.locator('.camp-cta').waitFor();assert.equal(await p.locator('.arc .act.done').count(),0);await snap('replay reset');
  results.push({id:`campaign/${campaign.id}/${lang}`,status:'прошёл',steps});
 }catch(e){await snap('failure').catch(()=>{});results.push({id:`campaign/${campaign.id}/${lang}`,status:'упал',error:String(e),steps})}
 finally{await c.close();writeFileSync(out+'/results.json',JSON.stringify(results,null,2))}
 console.log(results.at(-1).id,results.at(-1).status,results.at(-1).error||'');
}}finally{await browser.close()}
if(results.some(x=>x.status==='упал'))process.exitCode=1;
