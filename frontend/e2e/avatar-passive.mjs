// Passive rendering/audio checks. No clicks, keys, dispatchEvent, or user windows.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, '../tmp/avatar-audit');
mkdirSync(output, { recursive: true });
const live = process.argv.includes('--live');
const target = process.env.AUDIT_API ?? 'http://127.0.0.1:18206';
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="root"></div><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
import {OpponentFace} from '/src/components/OpponentFace.tsx';
import {AudioPlayer} from '/src/realtime/vendor/audio-player.ts';
import {RealtimeTransport} from '/src/realtime/transport.ts';
import '/src/styles.css';
const kind=new URLSearchParams(location.search).get('case');
const result=window.audit={events:[],protocol:[],peak:0,closed:false};
const player=new AudioPlayer({playbackDelayMs:0});
let transport;
const level=()=>transport ? transport.speechLevel() : player.speechLevel();
function App(){
 const [scenario]=React.useState((kind==='missing'||kind==='exam-missing')?'missing-persona':'supplier');
 const [avatarState,setAvatarState]=React.useState('warm');
 window.nextState=()=>setAvatarState('listening');
 React.useEffect(()=>{
  if(kind==='voice'){
   player.init();player.beginTurn();
   const samples=new Float32Array(24000*4);
   for(let i=24000;i<72000;i++)samples[i]=Math.sin(i*2*Math.PI*220/24000)*.12;
   const bytes=new Uint8Array(samples.buffer);let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
   player.playChunk(btoa(binary));
   setTimeout(()=>{player.stopAll();result.closed=true},3000);
  }
  if(kind==='live'){
   transport=new RealtimeTransport(m=>{result.events.push(m);},()=>{}, {
    onProtocol:e=>result.protocol.push({type:e.type,dir:e.dir}),
    onCapabilities:c=>result.capabilities=c,
    onTranscript:(text,final)=>{if(final)result.transcript=text},
   });
   transport.send({type:'start',scenarioId:'supplier',lang:'ru',mode:'practice',layers:{voice:true,avatar:true}});
  }
  const timer=setInterval(()=>{result.peak=Math.max(result.peak,level());},20);
  return()=>{clearInterval(timer);player.stopAll();transport?.close()};
 },[]);
 return React.createElement('main',{style:{padding:32}},
  React.createElement('h1',{},'Passive avatar audit'),
  React.createElement('div',{style:{width:280,height:280}},React.createElement(OpponentFace,{
   scenarioId:scenario,avatarState,state:null,exam:kind==='exam'||kind==='exam-missing',size:280,
   speaking:kind==='missing'||kind==='recover',
   speakingLabel:'Speaking',label:'Counterpart',getSpeechLevel:level,
   amplitudeAnimation:kind==='voice'||kind==='live'||kind.startsWith('blink'),animationLabel:'Local amplitude animation'})));
}
createRoot(document.getElementById('root')).render(React.createElement(App));
window.endNegotiation=()=>{transport?.interrupt();transport?.send({type:"turn",text:"Согласен на вашу цену. Договорились."})};
window.finish=()=>{transport?.interrupt();transport?.close();player.stopAll();result.closed=true};
</script></body></html>`;

const server = await createServer({ root, server: { host:'127.0.0.1', port:15206, strictPort:true,
  proxy: { '/api':target, '/v1/realtime':{target:target.replace('http','ws'),ws:true} } },
  plugins:[{name:'passive-audit', configureServer(s) {
    s.middlewares.use('/__avatar_audit', async (req,res)=>{
      res.setHeader('Content-Type','text/html');
      res.end(await s.transformIndexHtml(req.url ?? '/',html));
    });
  }}] });
let browser;
const results=[];
try {
 await server.listen();
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:true,args:['--autoplay-policy=no-user-gesture-required',
   ...(live?['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
    '--use-file-for-fake-audio-capture='+resolve(root,'../tmp/voice-probe.wav')]:[])]});
 const only=process.argv.find(arg=>arg.startsWith('--case='))?.slice(7);
 for(const kind of only?[only]:live?['live']:['voice','motion','missing','recover','exam','reduced','blink','blink-reduced','exam-missing']) {
  const page=await browser.newPage({viewport:{width:600,height:500},
    reducedMotion:(kind==='reduced'||kind==='blink-reduced')?'reduce':'no-preference'});
  page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(kind==='recover') await page.route('**/avatars/supplier/warm.*',route=>route.fulfill({status:404,body:''}));
  await page.goto('http://127.0.0.1:15206/__avatar_audit?case='+kind);
  try { await page.waitForFunction(()=>!!window.audit, {}, {timeout:10000}); } catch(e) { console.error('page errors',errors); throw e; }
  if(kind==='voice'){
   await page.waitForFunction(()=>document.querySelector('[data-speech-mouth]'));
   await page.screenshot({path:output+'/mouth-open.png'});
   await page.waitForFunction(()=>window.audit.closed);
   await page.waitForFunction(()=>!document.querySelector('[data-speech-mouth]'));
   assert.ok(await page.evaluate(()=>window.audit.peak)>.2);

  } else if(kind==='blink'||kind==='blink-reduced'||kind==='exam-missing') {
   await page.waitForFunction(()=>document.querySelector('.av-eyes'));
   if(kind==='blink'){
    await page.waitForFunction(()=>document.querySelector('.av-eyes--blink'));
    const dimensions=await page.evaluate(()=>{
     const eyes=document.querySelector('.av-eyes');
     const animation=eyes.getAnimations().find(a=>a.animationName==='av-blink');
     if(!animation)return null;
     animation.pause();animation.currentTime=1000;
     const open=eyes.getBoundingClientRect().height;
     animation.currentTime=5684;
     const closed=eyes.getBoundingClientRect().height;
     animation.currentTime=5799;
     return {open,closed,reopened:eyes.getBoundingClientRect().height};
    });
    assert.ok(dimensions&&dimensions.open>0&&dimensions.closed<dimensions.open*.2&&dimensions.reopened>dimensions.open*.9,'blink must close and reopen actual eyes');
   }else{
    assert.equal(await page.locator('.av-eyes--blink').count(),0,'exam and reduced motion stay static');
    assert.equal(await page.locator('.av-eyes').evaluate(e=>getComputedStyle(e).animationName),'none');
   }
  } else if(kind==='motion') {
   await page.waitForFunction(()=>{const v=document.querySelector('video');return v?.readyState>=2&&v.currentTime>0});
  } else if(kind==='missing'||kind==='recover') {
   await page.waitForFunction(()=>document.querySelector('.face svg'));
   assert.equal(await page.locator('.face__voice').count(),1);
   if(kind==='recover'){
    await page.evaluate(()=>window.nextState());
    await page.waitForFunction(()=>{const v=document.querySelector('video');return v?.readyState>=2&&v.src.endsWith('listening.webm')});
   }
  } else if(kind==='live') {
   await page.waitForFunction(()=>window.audit.events.some(e=>e.type==='opponent')&&window.audit.peak>.02,{},{timeout:90000});
   await page.evaluate(()=>window.endNegotiation());
   await page.waitForFunction(()=>window.audit.events.some(e=>e.type==='debrief'),{},{timeout:60000});
   const data=await page.evaluate(()=>window.audit);
   assert.ok(data.events.some(e=>e.type==='opponent'&&e.state.turn>=1));
   assert.match(data.transcript ?? '', /важн/i);
   assert.match(data.transcript ?? '', /контракт/i);
   writeFileSync(output+'/live-result.json',JSON.stringify(data,null,2));
   await page.evaluate(()=>window.finish());
   await page.waitForFunction(()=>!document.querySelector('[data-speech-mouth]'));
  } else {
   if(kind==='exam')await page.waitForFunction(()=>document.querySelector('.face')?.dataset.motionPreference==='full');
   await page.waitForFunction(()=>document.querySelector('.face img'));
   assert.equal(await page.locator('video').count(),0);
  }
  assert.deepEqual(errors,[]);
  await page.screenshot({path:output+'/'+kind+'.png'});
  results.push({kind,passed:true,peak:await page.evaluate(()=>window.audit.peak)});
  await page.close();
 }
 writeFileSync(output+'/results.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify(results));
} finally {await browser?.close();await server.close();}
