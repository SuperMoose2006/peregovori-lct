// One complete real-config rehearsal. Application actions, never synthetic input.
// Requires tools/rehearse_demo_gateway.py and ignored tmp/voice-probe.wav.
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'../tmp/demo-config-rehearsal');
mkdirSync(out,{recursive:true});
const server=await createServer({root,server:{host:'127.0.0.1',port:15208,strictPort:true,
  proxy:{'/api':'http://127.0.0.1:18208','/v1/realtime':{target:'ws://127.0.0.1:18208',ws:true}}},
  plugins:[{name:'rehearsal-actions',enforce:'pre',transform(code,id){
    if(id===root+'/src/App.tsx')return code.replace(/^  return \(/m,'  window.rehearsal={start,nego,screen};\n  return (');
  }}]});
let browser;const steps=[],errors=[];let began;
try{
 await server.listen();
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required',
    '--use-file-for-fake-audio-capture='+resolve(root,'../tmp/voice-probe.wav')]});
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
   localStorage.setItem('dialog.layers.v1',JSON.stringify({voice:true,avatar:true}));
   const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
   navigator.mediaDevices.getUserMedia=async (...args)=>{const stream=await original(...args);window.recordedStream=stream;return stream};
 });
 await page.goto('http://127.0.0.1:15208');
 await page.waitForFunction(()=>!!window.rehearsal);
 const health=await (await page.request.get('http://127.0.0.1:15208/api/health')).json();
 assert.match(health.voice,/parakeet/);assert.equal(health.cloud_ai,true);assert.equal(health.judge,true);
 const snapshot=async name=>{
   const state=await page.evaluate(()=>({screen:window.rehearsal.screen,state:window.rehearsal.nego.state,
     log:window.rehearsal.nego.log,text:document.body.innerText}));
   steps.push({name,elapsed_ms:Math.round(performance.now()-began),...state});
   await page.screenshot({path:out+'/'+name+'.png'});
 };
 began=performance.now();
 await page.evaluate(()=>window.rehearsal.start('supplier'));
 await page.waitForFunction(()=>window.rehearsal.nego.state?.status==='active');
 await snapshot('01-start');
 await page.evaluate(()=>{window.audioPeak=0;window.audioTimer=setInterval(()=>window.audioPeak=Math.max(window.audioPeak,window.rehearsal.nego.getSpeechLevel()),20)});
 await page.waitForFunction(()=>window.rehearsal.nego.log.some(e=>e.kind==='me'&&/контракт/i.test(e.text)),{},{timeout:30000});
 // Stop the recorded microphone after its first real ASR result, avoid looping it.
 await page.evaluate(()=>window.recordedStream?.getAudioTracks().forEach(t=>t.stop()));
 await snapshot('02-recognized');
 await page.waitForFunction(()=>!window.rehearsal.nego.busy&&window.rehearsal.nego.state?.turn===1,{},{timeout:45000});
 await page.waitForFunction(()=>window.audioPeak>0,{},{timeout:25000});
 await page.waitForFunction(()=>!window.rehearsal.nego.oppSpeaking,{},{timeout:60000});
 await snapshot('03-first-response');
 for(const [name,text] of [['04-options','Можем обсудить разные варианты: долгосрочный контракт или предоплата в обмен на скидку.'],
                          ['05-agreement','Согласен на вашу цену. Договорились.']]){
   const turn=await page.evaluate(()=>window.rehearsal.nego.state.turn);
   await page.evaluate(text=>{window.rehearsal.nego.interrupt();window.rehearsal.nego.turn(text)},text);
   await page.waitForFunction(n=>!window.rehearsal.nego.busy&&window.rehearsal.nego.state.turn>n,turn,{timeout:45000});
   await snapshot(name);
 }
 await page.waitForFunction(()=>window.rehearsal.screen==='debrief',{},{timeout:20000});
 await snapshot('06-debrief');
 const result=await page.evaluate(()=>{clearInterval(window.audioTimer);return {peak:window.audioPeak,debrief:window.rehearsal.nego.debrief}});
 writeFileSync(out+'/result.json',JSON.stringify({health,total_ms:Math.round(performance.now()-began),steps,result,errors},null,2));
 assert.ok(result.peak>0,'real TTS reached browser audio player');
 assert.equal(result.debrief.attestation,undefined,'permanent issuance stays off');
 assert.ok(steps[1].log.some(e=>e.kind==='sys'&&/parakeet/.test(e.text)),'actual ASR visible');
 assert.deepEqual(errors,[]);
 writeFileSync(out+'/result.json',JSON.stringify({health,total_ms:Math.round(performance.now()-began),steps,result,errors},null,2));
 console.log(JSON.stringify({total_ms:Math.round(performance.now()-began),steps:steps.map(s=>({name:s.name,ms:s.elapsed_ms,turn:s.state?.turn})),peak:result.peak,grade:result.debrief.grade,errors}));
}finally{await browser?.close();await server.close()}
