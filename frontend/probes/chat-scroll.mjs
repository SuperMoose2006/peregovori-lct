// Headless scroll regression with the real App/Table/Chat. No input events or devices.
// node frontend/probes/chat-scroll.mjs [--out /tmp/dialog-chat-scroll]
// --mutant restores the pre-fix Chat in memory; the same assertions must fail.
// --diagnose records every failure instead of stopping at the first assertion.
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
const out = resolve(arg('out', '/tmp/dialog-chat-scroll'));
const mutant = process.argv.includes('--mutant');
const diagnose = process.argv.includes('--diagnose');
const baseline = arg('baseline', 'f039081');
const oldChat = mutant ? execFileSync('git', ['show', `${baseline}:frontend/src/components/Chat.tsx`], {cwd: root, encoding: 'utf8'}) : null;
const names = ['voice', 'camera', 'avatar', 'probe', 'pokerface'];
const initialLayers = Object.fromEntries(names.map(name => [name, true]));
const messages = Array.from({length:32}, (_, index) => ({
  id: index + 1, kind: index % 2 ? 'me' : 'opp',
  text: `Реплика ${index + 1}. Давайте обсудим долгосрочный контракт, график поставок и условия предоплаты. Объём на полгода поможет планировать смены и заранее согласовать удобную цену.`,
}));
const fixture = `
import {useCallback,useMemo,useState,useRef} from 'react';
import {SCENARIO_MAP,toScenarioView} from '/src/data/scenarios.ts';
import {newSession,stateView} from '/src/mock/engine.ts';
const noop=()=>{},zero=()=>0,noFrame=()=>null,empty=[];
export function useNegotiation(lang){
 const [ready,setReady]=useState(false),[revision,setRevision]=useState(0);
 const [turn,setTurn]=useState(Number(new URLSearchParams(location.search).get('turn')||0));
 const [log,setLog]=useState(()=>turn?${JSON.stringify(messages)}:[]);
 const starts=useRef(0);
 const start=useCallback(()=>{starts.current++;if(starts.current>1){setTurn(0);setLog([])}setReady(false);setTimeout(()=>setReady(true),45)},[]);
 const reset=useCallback(()=>{setReady(false);setLog([])},[]);
 const state=useMemo(()=>ready?{...stateView(newSession(SCENARIO_MAP.supplier,lang)),turn}:null,[ready,lang,turn,revision]);
 const scenario=useMemo(()=>{
   if(!ready)return null;
   const scenario=toScenarioView(SCENARIO_MAP.supplier,lang);
   // A long but ordinary textual role makes the introductory card scrollable.
   // This exercises the real opening card without fabricated DOM or CSS.
   return turn?scenario:{...scenario,role:scenario.role+' Долгосрочные поставки и согласование графика оплаты.'.repeat(35)};
 },[ready,lang,turn]);
 window.chatScrollFixture={
   starts:starts.current,revision,
   rerender:()=>setRevision(value=>value+1),
   cloneLog:()=>setLog(value=>[...value]),
   firstOwnReply:()=>setLog(value=>[...value,{id:value.length+1,kind:'me',text:'Давайте договоримся о графике поставок и долгосрочном объёме.'}]),
   append:()=>{setTurn(value=>Math.max(1,value));setLog(value=>[...value,{id:value.length+1,kind:'opp',text:'Новая реплика. Предлагаю согласовать объём и перейти к условиям оплаты.'}])},
   stream:()=>setLog(value=>value.map((entry,index)=>index===value.length-1?{...entry,text:entry.text+' Дополнительные условия поставки требуют согласования. '.repeat(6)}:entry)),
 };
 return {kind:ready?'ws':null,scenario,state,log:ready?log:empty,
 debrief:null,busy:false,phase:null,error:null,layerFail:{},conn:'online',judgeActive:true,
 avatarState:'neutral',oppSpeaking:false,oppAudio:false,userSpeaking:false,transcript:null,observations:[],
 tells:0,tellFrames:0,tellNow:false,framesSent:0,
 capabilities:{cloud_ai:true,voice:true,camera:true,avatar:{lipsync_mode:'amplitude'}},
 start,reset,turn:noop,requestHint:noop,answerProbe:noop,clearError:noop,
 getMicLevel:zero,getSpeechLevel:zero,getVideoFrame:noFrame,getAudioBlocked:()=>false,resumeAudio:noop,setMicMuted:noop,interrupt:noop};
}`;
const results = [];
const failures = [];
const check = (condition, label) => {
  if (condition) return;
  failures.push(label);
  if (!diagnose) assert.ok(condition, label);
};
const server = await createServer({root, server:{host:'127.0.0.1',port:0,hmr:false,watch:{ignored:['**/*']}}, plugins:[{
  name:'chat-scroll-fixture',enforce:'pre',
  transform(code,id){
    if(id===root+'/src/api/useNegotiation.ts') return fixture;
    if(id===root+'/src/components/Chat.tsx' && mutant) return oldChat;
    if(id===root+'/src/App.tsx') {
      const anchor='  return (\n    // Двухколоночная оболочка';
      assert.ok(code.includes(anchor),'App fixture anchor must still exist');
      return code.replace(anchor,'  window.chatScroll={start,applyLayers,setActiveLayers,activeLayers,setMicMuted,micMuted,screen};\n'+anchor);
    }
  },
}]});
let browser;
const settle = page => page.evaluate(async()=>{
  await new Promise(resolve=>setTimeout(resolve,90));
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
});
const metrics = page => page.evaluate(()=>{
  const log=document.querySelector('.log'),parent=log.parentElement;
  const r=log.getBoundingClientRect(),p=parent.getBoundingClientRect();
  const snapshot=window.scrollSnapshot;
  return {scrollTop:log.scrollTop,scrollHeight:log.scrollHeight,clientHeight:log.clientHeight,
    gap:log.scrollHeight-log.clientHeight-log.scrollTop,logTop:r.top,parentTop:p.top,
    parentHeight:p.height,documentTop:document.documentElement.scrollTop,
    sameLog:snapshot?.log===log,sameParent:snapshot?.parent===parent,
    starts:window.chatScrollFixture.starts,layers:window.chatScroll.activeLayers};
});
const position = async(page,bottom=false)=>{
  await page.evaluate(bottom=>{
    const log=document.querySelector('.log');
    log.scrollTop=bottom?log.scrollHeight:Math.round((log.scrollHeight-log.clientHeight)*0.45);
    window.scrollSnapshot={log,parent:log.parentElement};
  },bottom);
  await settle(page);
  return metrics(page);
};
try {
  await server.listen();
  const address=server.httpServer.address();
  browser=await chromium.launch({headless:true,executablePath:browserExecutable()});
  for(const [width,height] of [[1280,800],[1440,900],[1920,1080]]) {
    for(const turn of [0,5]) {
      const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce'});
      const errors=[];
      page.on('pageerror',error=>{errors.push(error.message);console.error('pageerror:',error.message)});
      await page.route(url=>url.pathname.startsWith('/api/'),route=>route.fulfill({json:[]}));
      await page.addInitScript(layers=>{
        localStorage.setItem('dialog.layers.v1',JSON.stringify(layers));
        localStorage.setItem('dialog.lang.v1','ru');
        localStorage.setItem('dialog.theme.v1','light');
        localStorage.setItem('dialog.tutorialDone.v1','1');
        localStorage.setItem('dialog.tours.v1',JSON.stringify({enabled:false,off:[]}));
      },initialLayers);
      await page.goto(`http://127.0.0.1:${address.port}/?turn=${turn}`);
      await page.waitForFunction(()=>window.chatScroll?.screen==='home');
      await page.evaluate(()=>window.chatScroll.start('supplier'));
      await page.waitForSelector('.log');
      await page.evaluate(()=>document.fonts.ready);
      await settle(page);
      const scope=`${width}x${height}/turn${turn}`;
      let before=await position(page);
      check(before.scrollTop>20,scope+': fixture must have a scrollable middle');
      let after;
      for(const muted of [true,false]) {
        before=await position(page);
        await page.evaluate(muted=>window.chatScroll.setMicMuted(muted),muted);
        await settle(page);
        after=await metrics(page);
        const record={scope,case:`microphone-${muted?'mute':'unmute'}`,path:'actual-mic-state-handler',before,after};
        results.push(record);
        console.log(`${scope} ${record.case}: ${before.scrollTop} -> ${after.scrollTop}; same log=${after.sameLog} parent=${after.sameParent}; height ${before.clientHeight} -> ${after.clientHeight}`);
        check(Math.abs(before.scrollTop-after.scrollTop)<=1,scope+': microphone preserves middle scrollTop: '+record.case);
      }
      // A harmless parent render must not rerun a scroll-to-top opening effect.
      before=await position(page);
      await page.evaluate(()=>window.chatScrollFixture.rerender());
      await settle(page);
      after=await metrics(page);
      results.push({scope,case:'parent-rerender',before,after});
      check(Math.abs(before.scrollTop-after.scrollTop)<=1,scope+': parent rerender preserves middle scrollTop');
      for(const name of names) {
        // Enabling camera is required before independently toggling pokerface.
        if(name==='pokerface') {
          await page.evaluate(()=>window.chatScroll.setActiveLayers({...window.chatScroll.activeLayers,camera:true,pokerface:true}));
          await settle(page);
        }
        for(const enabled of [false,true]) {
          before=await position(page);
          const starts=before.starts;
          await page.evaluate(({name,enabled,turn})=>{
            const next={...window.chatScroll.activeLayers,[name]:enabled};
            // At turn 0 call the real handler, including the restart/remount.
            // Current product locks active layers after the first turn; direct
            // state exposure then isolates layout changes at the Table boundary.
            if(turn===0)window.chatScroll.applyLayers(next);
            else window.chatScroll.setActiveLayers(next);
          },{name,enabled,turn});
          await page.waitForSelector('.log');
          await settle(page);
          after=await metrics(page);
          const record={scope,case:`${name}-${enabled?'on':'off'}`,path:turn===0?'actual-applyLayers-restart':'activeLayers-layout-boundary',before,after};
          results.push(record);
          console.log(`${scope} ${record.case}: ${before.scrollTop} -> ${after.scrollTop}; same log=${after.sameLog} parent=${after.sameParent}; height ${before.clientHeight} -> ${after.clientHeight}`);
          check(after.layers[name]===enabled,scope+': requested layer applied: '+record.case);
          if(turn===0)check(after.starts===starts+1,scope+': layer toggle exercised session restart');
          check(Math.abs(before.scrollTop-after.scrollTop)<=1,scope+': layer preserves middle scrollTop: '+record.case);
        }
      }
      if(turn===5) {
        before=await position(page);
        await page.evaluate(()=>window.chatScrollFixture.append());
        await settle(page);
        after=await metrics(page);
        results.push({scope,case:'new-reply-while-reading',before,after});
        check(Math.abs(before.scrollTop-after.scrollTop)<=1,scope+': new reply preserves reading position');
        before=await position(page,true);
        await page.evaluate(()=>window.chatScrollFixture.append());
        await settle(page);
        after=await metrics(page);
        results.push({scope,case:'new-reply-at-bottom',before,after});
        check(Math.abs(after.gap)<=1,scope+': new reply follows when at bottom');
        before=after;
        await page.evaluate(()=>window.chatScrollFixture.stream());
        await settle(page);
        after=await metrics(page);
        results.push({scope,case:'stream-at-bottom',before,after});
        check(Math.abs(after.gap)<=1,scope+': streaming reply follows when at bottom');
      } else {
        // Sending the first message must reveal it even while turn is still 0.
        before=await position(page);
        await page.evaluate(()=>window.chatScrollFixture.firstOwnReply());
        await settle(page);
        after=await metrics(page);
        results.push({scope,case:'first-own-reply',before,after});
        check(Math.abs(after.gap)<=1,scope+': first own reply is revealed immediately');
      }
      before=await position(page);
      await page.evaluate(()=>window.chatScroll.start('supplier'));
      await page.waitForSelector('.log');
      await settle(page);
      after=await metrics(page);
      results.push({scope,case:'new-party',before,after});
      check(after.scrollTop===0,scope+': new party resets scroll to opening top');
      assert.deepEqual(errors,[],scope+': no browser runtime errors');
      await page.close();
    }
  }
} finally {
  await browser?.close();
  await server.close();
  mkdirSync(out,{recursive:true});
  writeFileSync(resolve(out,mutant?'mutant.json':'report.json'),JSON.stringify({mutant,baseline,
    method:'Headless Chromium, real App/Table/Chat. Deterministic hook fixture: turn 0 has a long introductory role and asynchronous scenario=null restart; turn 5 has 32 replies. Actual applyLayers at turn 0; explicit activeLayers layout boundary after turn 0 because the real handler locks layers then. No clicks, keys, pointer events or devices.',
    failures,results},null,2));
}
console.log(`${mutant?'MUTANT':'CURRENT'}: ${results.length} cases, ${failures.length} failures. Report: ${out}`);
if(failures.length)process.exitCode=1;
