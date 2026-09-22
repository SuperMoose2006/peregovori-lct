// Read/drive the installed gateway through SSH localhost:18410. No synthetic input.
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),down=process.argv.includes('--asr-down');
const out=resolve(root,'../tmp/stand-rehearsal/'+(down?'asr-down':'recording'));
mkdirSync(out,{recursive:true});
const server=await createServer({root,server:{host:'127.0.0.1',port:15410,strictPort:true,
 proxy:{'/api':'http://127.0.0.1:18410','/v1/realtime':{target:'ws://127.0.0.1:18410',ws:true}}},
 plugins:[{name:'stand-actions',enforce:'pre',transform(code,id){
  if(id===root+'/src/App.tsx')return code.replace(/^  return \(/m,'  window.rehearsal={start,nego,screen};\n  return (');
 }}]});
let browser,page;const began=performance.now(),result={down,steps:[],events:[],audioChunks:0,audioRms:0,errors:[]};
try{
 await server.listen();
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args:['--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',
   '--use-file-for-fake-audio-capture='+resolve(root,'../tmp/voice-probe.wav')]});
 page=await browser.newPage({viewport:{width:1280,height:900}});
 page.on('pageerror',e=>result.errors.push(e.message));
 page.on('websocket',ws=>ws.on('framereceived',frame=>{
  let e;try{e=JSON.parse(String(frame.payload))}catch{return}
  if(e.kind==='audio'){
   result.audioChunks++;const b=Buffer.from(e.audio,'base64');let power=0;
   for(let i=0;i+4<=b.length;i+=4)power+=b.readFloatLE(i)**2;
   result.audioRms=Math.max(result.audioRms,Math.sqrt(power/(b.length/4)));
  }else if(['error','generation.cancelled','user.transcript','response.done','session.created'].includes(e.type)){
   result.events.push({ms:Math.round(performance.now()-began),type:e.type,code:e.error?.code,text:e.error?.message??e.text,reason:e.reason,asr:e.capabilities?.asr});
  }
 }));
 await page.addInitScript(()=>{
  localStorage.setItem('dialog.layers.v1',JSON.stringify({voice:true,avatar:true}));
  const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async(...args)=>{const s=await get(...args);window.recording=s;return s};
 });
 await page.goto('http://127.0.0.1:15410');
 await page.waitForFunction(()=>!!window.rehearsal);
 result.health=await(await page.request.get('http://127.0.0.1:15410/api/health')).json();
 assert.match(result.health.voice,/parakeet.*no automatic cloud/);
 await page.evaluate(()=>window.rehearsal.start('supplier'));
 await page.waitForFunction(()=>window.rehearsal.nego.state?.status==='active');
 await page.evaluate(()=>{window.peak=0;window.sampling=setInterval(()=>window.peak=Math.max(window.peak,window.rehearsal.nego.getSpeechLevel()),20)});
 const snap=async(name)=>{result.steps.push({name,ms:Math.round(performance.now()-began),...await page.evaluate(()=>({turn:window.rehearsal.nego.state.turn,screen:window.rehearsal.screen,text:document.body.innerText}))});await page.screenshot({path:out+'/'+name+'.png'})};
 await snap('start');
 if(down){
  await page.waitForFunction(()=>window.rehearsal.nego.log.some(e=>e.kind==='sys'&&/Распознавание недоступно/.test(e.text)),{},{timeout:30000});
  assert.equal(await page.evaluate(()=>window.rehearsal.nego.state.turn),0);
  assert.equal(await page.evaluate(()=>window.rehearsal.nego.log.some(e=>e.kind==='me')),false);
  await snap('asr-unavailable');
 }else{
  await page.waitForFunction(()=>window.rehearsal.nego.log.some(e=>e.kind==='me'&&/контракт/i.test(e.text)),{},{timeout:30000});
  await page.waitForFunction(()=>!window.rehearsal.nego.busy&&window.rehearsal.nego.state.turn===1,{},{timeout:35000});
  await snap('recorded-turn');
 }
 await page.evaluate(()=>window.recording?.getAudioTracks().forEach(t=>t.stop()));
 // Observe output once without physical microphone assumptions or repeated retries.
 await page.waitForTimeout(down?100:8000);
 if(down){
  await page.evaluate(()=>window.rehearsal.nego.turn('Что для вас важнее всего в этом контракте?'));
  await page.waitForFunction(()=>!window.rehearsal.nego.busy&&window.rehearsal.nego.state.turn===1,{},{timeout:35000});
  await snap('typed-fallback');
 }
 for(const text of ['Можем обсудить долгосрочный контракт или предоплату в обмен на скидку.','Согласен на вашу цену. Договорились.']){
  const turn=await page.evaluate(()=>window.rehearsal.nego.state.turn);
  await page.evaluate(text=>{window.rehearsal.nego.interrupt();window.rehearsal.nego.turn(text)},text);
  await page.waitForFunction(n=>!window.rehearsal.nego.busy&&window.rehearsal.nego.state.turn>n,turn,{timeout:35000});
 }
 await page.waitForFunction(()=>window.rehearsal.screen==='debrief',{},{timeout:20000});
 await snap('debrief');
 result.peak=await page.evaluate(()=>window.peak);
 if(!down){
  assert.ok(result.audioChunks>0&&result.audioRms>0,'real PCM reaches the browser');
  assert.ok(result.peak>0,'real playback envelope reaches the application');
 }
 result.debrief=await page.evaluate(()=>window.rehearsal.nego.debrief);
 assert.ok(!result.debrief.attestation);assert.deepEqual(result.errors,[]);
 result.passed=true;
}catch(e){result.failure=String(e);throw e}
finally{
 result.totalMs=Math.round(performance.now()-began);
 writeFileSync(out+'/result.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({passed:result.passed,down,ms:result.totalMs,audioChunks:result.audioChunks,audioRms:result.audioRms,peak:result.peak,failure:result.failure}));
 await browser?.close();await server.close();
}
