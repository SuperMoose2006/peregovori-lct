// Mounted Table, real timer ticks, controlled monotonic clock; no input events.
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const root=resolve(import.meta.dirname,'..');
const output=resolve(root,'../tmp/wait-audit');mkdirSync(output,{recursive:true});
const html=`<div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';
import {Table} from '/src/components/Table.tsx';import {I18N} from '/src/i18n.ts';
import {SCENARIO_MAP,toScenarioView} from '/src/data/scenarios.ts';
import {newSession,stateView} from '/src/mock/engine.ts';import '/src/styles.css';
const lang=new URLSearchParams(location.search).get('lang');
const original=performance.now.bind(performance);window.offset=0;performance.now=()=>original()+window.offset;
function App(){const [patch,setPatch]=React.useState({});window.patch=setPatch;
const state=stateView(newSession(SCENARIO_MAP.supplier,lang));
return React.createElement(Table,{t:I18N[lang],lang,mode:'practice',kind:'ws',scenario:toScenarioView(SCENARIO_MAP.supplier,lang),state,log:[],busy:true,phase:'judging',judgeActive:true,onSend:()=>{},onHint:()=>{},onQuit:()=>{},onSeeDebrief:()=>{},...patch})}
createRoot(document.getElementById('root')).render(React.createElement(App));
</script>`;
const server=await createServer({root,server:{host:'127.0.0.1',port:15414,strictPort:true},plugins:[{name:'wait-audit',configureServer(s){s.middlewares.use('/__wait',async(req,res)=>{res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,html))})}}]});
let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 for(const lang of ['ru','en']){
  const page=await browser.newPage({viewport:{width:lang==='ru'?1280:390,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:15414/__wait?lang='+lang);
  await page.waitForSelector('[data-wait-stage=judging]');
  await page.screenshot({path:output+'/'+lang+'-waiting.png',fullPage:true});
  const initial=await page.locator('.wait-status p').innerText();
  await page.evaluate(()=>window.offset+=3000);await page.waitForTimeout(350);
  assert.notEqual(await page.locator('.wait-status p').innerText(),initial,'elapsed indicator must update');
  await page.evaluate(()=>window.patch({phase:'replying'}));
  await page.waitForSelector('[data-wait-stage=replying]');
  assert.equal(await page.locator('.wait-status button').count(),0);
  await page.evaluate(()=>window.offset+=33000);await page.waitForTimeout(350);
  assert.equal(await page.locator('.wait-status button').count(),1,'turn ceiling must offer an exit');
  assert.match(await page.locator('.wait-status').innerText(),lang==='ru'?/начать другую/:/start another/);
  await page.screenshot({path:output+'/'+lang+'-delayed.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'wait message must not overflow viewport');
  await page.evaluate(()=>window.patch({busy:false,debriefReady:true}));
  await page.waitForFunction(()=>!document.querySelector('.wait-status'));
  // Completed turn waiting for review uses its own shorter ceiling.
  await page.evaluate(async()=>{const {newSession,stateView}=await import('/src/mock/engine.ts');const {SCENARIO_MAP}=await import('/src/data/scenarios.ts');window.patch({busy:false,state:{...stateView(newSession(SCENARIO_MAP.supplier,'ru')),status:'agreement',deal:90},debriefReady:false})});
  await page.waitForSelector('[data-wait-stage=debrief]');
  assert.equal(await page.locator('.wait-status button').count(),0,'new stage resets elapsed time');
  await page.evaluate(()=>window.offset+=13000);await page.waitForTimeout(350);
  assert.equal(await page.locator('.wait-status button').count(),1,'review ceiling must offer an exit');
  await page.evaluate(()=>window.patch({busy:false,debriefReady:true}));
  await page.waitForFunction(()=>!document.querySelector('.wait-status'));
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS Table wait: ticking, real phases, turn/review ceilings, completion, RU/EN');
}finally{await browser?.close();await server.close()}
