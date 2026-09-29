// Passive, headless layout regression. Real App/Table; deterministic session fixture.
// No pointer/keyboard events, devices, network models, or changes to app sources.
// Run: node frontend/probes/chat-layout.mjs [--out /tmp/dialog-chat-layout]
// Optional: --baseline <git ref>, --phase before|after (default both).
// --state ready|waiting|transcript|denied|delayed (default ready) covers transient panels.
// --matrix checks every requested layer combination at 1280x800 without screenshots.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {browserExecutable} from '../e2e/browser.mjs';

const root = resolve(import.meta.dirname, '..');
const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};
const out = resolve(arg('out', '/tmp/dialog-chat-layout'));
const baseline = arg('baseline', '516ddf556babc6ff04df53dbe02c3c56e92d1552');
const uiState = arg('state', 'ready');
const matrix = process.argv.includes('--matrix');
const layerNames = ['voice','camera','avatar','probe','pokerface'];
const layerCases = matrix ? Array.from({length:32},(_,mask)=>({
  label:`layers-${mask.toString(2).padStart(5,'0')}`,
  layers:Object.fromEntries(layerNames.map((name,index)=>[name,!!(mask & 1<<index)])),
})) : [true,false].map(enabled=>({label:enabled?'on':'off',layers:Object.fromEntries(layerNames.map(name=>[name,enabled]))}));
assert.ok(['ready','waiting','transcript','denied','delayed'].includes(uiState));
const phases = arg('phase', 'both') === 'both' ? ['before', 'after'] : [arg('phase')];
assert.ok(phases.every(phase => ['before', 'after'].includes(phase)));
mkdirSync(out, {recursive: true});
// Keep the entire prior stylesheet, including cascade and responsive overrides.
const baselineCss = execFileSync('git', ['show', `${baseline}:frontend/src/styles.css`], {cwd: root, encoding: 'utf8'});
writeFileSync(resolve(out, 'baseline-styles.css'), baselineCss);
const messages = [
  'Нам важна предсказуемая загрузка производства. Разовая скидка без объёма не решает эту задачу.',
  'Если договоримся об объёме на полгода, сможете ли вы предложить более выгодную цену?',
  'Объём на полгода поможет планировать смены. Но мне также важно знать график оплаты.',
  'Готов обсудить частичную предоплату при условии поставки небольшими партиями.',
  'Предоплата снижает наши риски, а партии требуют дополнительной логистики. Какой график вы предлагаете?',
  'Давайте поставлять раз в месяц и согласуем прогноз заранее, чтобы избежать срочных заказов.',
  'Такой прогноз подходит. На этих условиях я могу обсуждать скидку и резервирование объёма.',
  'Тогда зафиксируем объём, график и скидку вместе. Какая цена будет приемлема для обеих сторон?',
];
const log = Array.from({length: 16}, (_, index) => ({
  id: index + 1, kind: index % 2 ? 'me' : 'opp', text: messages[index % messages.length],
}));
const fixture = `
import {useCallback,useMemo,useState} from 'react';
import {SCENARIO_MAP,toScenarioView} from '/src/data/scenarios.ts';
import {newSession,stateView} from '/src/mock/engine.ts';
const noop=()=>{}, zero=()=>0, noFrame=()=>null;
const log=${JSON.stringify(log)},empty=[];
const uiState=${JSON.stringify(uiState)};
const wantsLayers=JSON.parse(localStorage.getItem('dialog.layers.v1')||'{}').voice===true;
const transcript='Давайте обсудим долгосрочный контракт, график поставок и условия предоплаты. '.repeat(12);
export function useNegotiation(lang){
 const [ready,setReady]=useState(false);
 const start=useCallback(()=>setReady(true),[]),reset=useCallback(()=>setReady(false),[]);
 const state=useMemo(()=>ready?{...stateView(newSession(SCENARIO_MAP.supplier,lang)),turn:5}:null,[ready,lang]);
 const scenario=useMemo(()=>ready?toScenarioView(SCENARIO_MAP.supplier,lang):null,[ready,lang]);
 return {kind:ready?'ws':null,scenario,state,
 log:ready?log:empty,debrief:null,busy:['waiting','delayed'].includes(uiState),phase:['waiting','delayed'].includes(uiState)?'judging':null,error:null,
 layerFail:uiState==='denied'&&wantsLayers?{voice:'браузер не дал доступ к микрофону',camera:'браузер не дал доступ к камере'}:{},conn:'online',judgeActive:true,avatarState:'neutral',oppSpeaking:false,
 oppAudio:false,userSpeaking:uiState==='transcript',transcript:['transcript','delayed'].includes(uiState)?transcript:null,observations:['В кадре один человек.'],
 tells:0,tellFrames:6,tellNow:false,framesSent:6,
 capabilities:{cloud_ai:true,voice:true,camera:true,avatar:{lipsync_mode:'amplitude'}},
 start,reset,turn:noop,requestHint:noop,answerProbe:noop,clearError:noop,
 getMicLevel:zero,getSpeechLevel:zero,getVideoFrame:noFrame,interrupt:noop};
}
`;
const results = [];
for (const phase of phases) {
  const server = await createServer({root,server:{host:'127.0.0.1',port:0},plugins:[{
    name:'chat-layout-fixture',enforce:'pre',
    transform(code,id){
      if(id===root+'/src/api/useNegotiation.ts') return fixture;
      if(id===root+'/src/styles.css' && phase==='before') return baselineCss;
      if(id===root+'/src/components/WaitStatus.tsx' && uiState==='delayed') return code.replace('const began = performance.now();','const began = performance.now() - 36000;');
      if(id===root+'/src/App.tsx') {
        const anchor='  return (\n    // Двухколоночная оболочка';
        assert.ok(code.includes(anchor),'App fixture anchor must still exist');
        return code.replace(anchor,'  window.chatLayout={start,activeLayers,screen};\n'+anchor);
      }
    },
  }]});
  let browser;
  try {
    await server.listen();
    const address=server.httpServer.address();
    browser=await chromium.launch({headless:true,executablePath:browserExecutable()});
    for(const [width,height] of (matrix||uiState==='delayed'?[[1280,800]]:[[1440,900],[1280,800],[1920,1080]])) {
      for(const layerCase of (uiState==='delayed'?layerCases.slice(0,1):layerCases)) {
        const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce'});
        const errors=[];
        page.on('pageerror',error=>{errors.push(error.message);console.error('pageerror:',error.message)});
        page.on('console',message=>{if(message.type()==='error')console.error('browser:',message.text())});
        await page.route(url=>url.pathname.startsWith('/api/'),route=>route.fulfill({json:[]}));
        await page.addInitScript(layers=>{
          localStorage.setItem('dialog.layers.v1',JSON.stringify(layers));
          localStorage.setItem('dialog.lang.v1','ru');
          localStorage.setItem('dialog.theme.v1','light');
          localStorage.setItem('dialog.tutorialDone.v1','1');
        },layerCase.layers);
        await page.goto(`http://127.0.0.1:${address.port}`);
        await page.waitForFunction(()=>window.chatLayout?.screen==='home');
        await page.evaluate(()=>window.chatLayout.start('supplier'));
        await page.waitForSelector('.log .msg');
        if(uiState==='delayed') await page.waitForSelector('.wait-status button');
        await page.evaluate(async()=>{
          await document.fonts.ready;
          await Promise.race([Promise.all(Array.from(document.images).map(image=>image.complete?Promise.resolve():new Promise(resolve=>{image.onload=resolve;image.onerror=resolve}))),new Promise(resolve=>setTimeout(resolve,1500))]);
          await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
          const log=document.querySelector('.log');log.scrollTop=log.scrollHeight;
        });
        const metrics=await page.evaluate(()=>{
          const log=document.querySelector('.log'), rect=log.getBoundingClientRect();
          const chat=document.querySelector('.chat'),chatRect=chat.getBoundingClientRect();
          const chatInnerBottom=chatRect.bottom-parseFloat(getComputedStyle(chat).borderBottomWidth);
          const controlsBottom=document.querySelector('.chat .onb-anchor').getBoundingClientRect().bottom;
          const nodes=Array.from(log.querySelectorAll(':scope > .msg:not(.typing-msg)'));
          const top=Math.max(0,rect.top,chatRect.top),bottom=Math.min(innerHeight,rect.bottom,chatRect.bottom);
          const full=nodes.filter(node=>{const r=node.getBoundingClientRect();return r.top>=top-0.5&&r.bottom<=bottom+0.5});
          const boxes={};
          for(const selector of ['.top','.table','.chat','.hud','.ch','.log','.onb-anchor','.compose','.livebar','.wait-status','.layer-off','.side','.opp-stage']){
            const node=document.querySelector(selector);if(!node)continue;
            const r=node.getBoundingClientRect();boxes[selector]={y:r.y,height:r.height,width:r.width,bottom:r.bottom};
          }
          return {height:rect.height,visibleHeight:Math.max(0,bottom-top),width:rect.width,
            fullyVisibleReplies:full.length,partlyVisibleReplies:nodes.filter(node=>{const r=node.getBoundingClientRect();return r.bottom>top&&r.top<bottom}).length,
            totalReplies:nodes.length,scrollTop:log.scrollTop,scrollHeight:log.scrollHeight,
            chatScrollHeight:chat.scrollHeight,chatClientHeight:chat.clientHeight,
            controlsVisible:controlsBottom<=Math.min(innerHeight,chatInnerBottom)+0.5,controlsBottom,chatInnerBottom,
            minimumHeight:parseFloat(getComputedStyle(log).minHeight),
            activeLayers:window.chatLayout.activeLayers,boxes,
            documentOverflow:document.documentElement.scrollWidth>innerWidth+1,
            composerVisible:!!document.querySelector('.chat textarea')&&document.querySelector('.chat textarea').getBoundingClientRect().bottom<=Math.min(innerHeight,chatRect.bottom),
          };
        });
        assert.deepEqual(errors,[],'no browser errors');
        assert.equal(metrics.totalReplies,16,'same fixture in every case');
        const expectedLayers={...layerCase.layers,pokerface:layerCase.layers.pokerface&&layerCase.layers.camera};
        assert.deepEqual(metrics.activeLayers,expectedLayers,'all five layers follow the requested values and pokerface camera dependency');
        assert.equal(metrics.documentOverflow,false,'no horizontal document overflow');
        if(phase==='after') {
          if(uiState!=='delayed') {
            assert.equal(metrics.composerVisible,true,'composer remains within chat and viewport');
            assert.equal(metrics.controlsVisible,true,'all composer and livebar controls remain within chat and viewport');
          }
          assert.ok((uiState==='delayed'?metrics.height:metrics.visibleHeight)>=Math.min(400,Math.max(320,height*0.45))-1,'log must meet desktop height floor');
        }
        const label=`${phase}-${width}x${height}-${layerCase.label}${uiState==='ready'?'':'-'+uiState}`;
        if(!matrix) await page.screenshot({path:resolve(out,label+'.png'),fullPage:false});
        if(uiState==='delayed') {
          metrics.controlsReachableAfterScroll=await page.evaluate(()=>{
            const chat=document.querySelector('.chat');chat.scrollTop=chat.scrollHeight;
            const bottom=Math.min(innerHeight,chat.getBoundingClientRect().bottom-parseFloat(getComputedStyle(chat).borderBottomWidth));
            return document.querySelector('.chat .onb-anchor').getBoundingClientRect().bottom<=bottom+0.5;
          });
          if(phase==='after') assert.ok(metrics.controlsReachableAfterScroll,'all controls remain reachable by scrolling in extreme state');
          await page.screenshot({path:resolve(out,label+'-controls.png'),fullPage:false});
        }
        results.push({phase,uiState,viewport:`${width}x${height}`,layers:layerCase.label,requestedLayers:layerCase.layers,...metrics});
        console.log(`${label}: log=${metrics.height.toFixed(2)}px visible=${metrics.visibleHeight.toFixed(2)}px replies=${metrics.fullyVisibleReplies}/${metrics.totalReplies}`);
        await page.close();
      }
    }
  } finally {await browser?.close();await server.close()}
}
writeFileSync(resolve(out,matrix?`report-matrix-${uiState}.json`:uiState==='ready'?'report.json':`report-${uiState}.json`),JSON.stringify({baseline,uiState,method:'Headless Chromium; actual App/Table; mocked session and media state; same 16 Russian replies; fully visible reply containers at natural transcript bottom, intersected with chat and viewport; no synthetic input.',messages:log,results},null,2));
console.log(`Report and screenshots: ${out}`);
