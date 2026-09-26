import {chromium} from 'playwright-core';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {READING_IDS} from '../src/lib/readingStore.ts';
const out=resolve(import.meta.dirname,'../../tmp/deep-reading');mkdirSync(out,{recursive:true});
const results=[],browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{for(const lang of ['ru','en']){
 const context=await browser.newContext(),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(10000);
 try{
  await p.goto('http://127.0.0.1:15416');if(lang==='en')await p.getByRole('button',{name:'EN',exact:true}).click();
  for(const game of READING_IDS[lang]){
   const steps=[];await p.locator('[data-reading="open"]').click();await p.locator('.rd-quote').waitFor();
   for(let guard=0;guard<40;guard++){
    if(await p.locator('.rd-done').count())break;
    steps.push(await p.locator('.reading').innerText());
    if(await p.locator('.rd-opt').count())await p.locator('.rd-opt').first().click();
    await p.locator('.rd-reveal').waitFor();assert.ok((await p.locator('.rd-reveal').innerText()).length>30);
    await p.locator('.rd-next').click();
   }
   await p.locator('.rd-done').waitFor();assert.match(await p.locator('.rd-tally').innerText(),/\d/);
   const stored=await p.evaluate(()=>JSON.parse(localStorage.getItem('dialog.reading.v1')));assert.ok(stored.games[game].asked>0);
   steps.push(await p.locator('.rd-done').innerText());await p.screenshot({path:`${out}/${lang}-${game}.png`,fullPage:true});
   await p.locator('.rd-x').click();assert.equal(await p.locator('.rd-shell').count(),0);assert.deepEqual(errors,[]);
   results.push({id:`reading/${game}/${lang}`,status:'прошёл',scope:'first-option answers, explanation, result, persistence, close',steps});writeFileSync(out+'/results.json',JSON.stringify(results,null,2));console.log(results.at(-1).id,'PASS');
  }
 }finally{await context.close()}
}}finally{await browser.close()}
