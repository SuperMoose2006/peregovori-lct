// Served production bundle + installed backend. Domain callbacks via React props;
// no click/key/dispatchEvent. Faults affect only this browser's socket.
import {chromium} from 'playwright-core';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const mode=process.argv[2]??'turn',out=resolve('tmp/deployed-final/'+mode);
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--use-file-for-fake-audio-capture='+resolve('tmp/voice-probe.wav')]});
const began=performance.now(),result={mode,steps:[],errors:[],dropped:0,audioChunks:0,stages:[]};
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 page.setDefaultTimeout(50000);page.on('pageerror',e=>result.errors.push(e.message));
 await page.addInitScript(voice=>{
  localStorage.setItem('dialog.layers.v1',JSON.stringify({voice,avatar:true}));
  window.seenStages=[];setInterval(()=>{const stage=document.querySelector('[data-wait-stage]')?.dataset.waitStage;if(stage&&window.seenStages.at(-1)!==stage)window.seenStages.push(stage)},100);
  window.propsFor=key=>{
   const root=document.getElementById('root');const marker=root?.[Object.keys(root).find(k=>k.startsWith('__reactContainer$'))];
   const visit=n=>{for(let f=n;f;f=f.sibling){if(typeof f.type==='function'&&typeof f.memoizedProps?.[key]==='function')return f.memoizedProps;const found=visit(f.child);if(found)return found}return null};
   return visit(marker?.stateNode?.current);
  };
  const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async(...args)=>{const stream=await get(...args);window.recording=stream;return stream};
 },mode==='normal');
 if(mode!=='normal')await page.routeWebSocket('**/v1/realtime*',ws=>{
  const server=ws.connectToServer();let blocked=false;
  server.onMessage(message=>{let e;try{e=JSON.parse(String(message))}catch{ws.send(message);return}
   if(blocked||(mode==='debrief'&&e.type==='debrief')){result.dropped++;return}
   ws.send(message);if(mode==='turn'&&e.type==='judge.started')blocked=true;
  });
 });
 page.on('websocket',ws=>ws.on('framereceived',f=>{try{const e=JSON.parse(String(f.payload));if(e.kind==='audio')result.audioChunks++}catch{}}));
 await page.goto('https://dialog.2-26-49-28.nip.io/');
 await page.waitForFunction(()=>!!window.propsFor('onStart'));
 await page.evaluate(()=>window.propsFor('onStart').onStart('supplier'));
 await page.waitForFunction(()=>!!window.propsFor('onSend')?.state);
 const snap=async(name)=>{result.steps.push({name,ms:Math.round(performance.now()-began)});await page.screenshot({path:out+'/'+name+'.png',fullPage:true})};
 await snap('start');
 if(mode==='normal'){
  await page.waitForFunction(()=>{const p=window.propsFor('onSend');return p?.state.turn===1&&!p.busy&&p.log.some(e=>e.kind==='me'&&/контракт/i.test(e.text))});
  await page.evaluate(()=>{window.recording?.getAudioTracks().forEach(t=>t.stop());window.peak=0;window.sample=setInterval(()=>{const p=window.propsFor('onSend');window.peak=Math.max(window.peak,p?.getSpeechLevel?.()??0)},20)});
  await snap('recorded-turn');await page.waitForTimeout(8000);
  for(const text of ['Можем обсудить долгосрочный контракт или предоплату в обмен на скидку.','Согласен на вашу цену. Договорились.']){
   const turn=await page.evaluate(()=>window.propsFor('onSend').state.turn);
   await page.evaluate(text=>{const p=window.propsFor('onSend');p.onInterrupt?.();p.onSend(text)},text);
   await page.waitForFunction(turn=>{const p=window.propsFor('onSend');return !p||(!p.busy&&p.state.turn>turn)},turn);
  }
  await page.waitForFunction(()=>document.body.innerText.includes('Разбор переговоров'));
  result.peak=await page.evaluate(()=>window.peak);assert.ok(result.audioChunks>0&&result.peak>0);
  await snap('debrief');
 }else{
  await page.evaluate(mode=>window.propsFor('onSend').onSend(mode==='turn'?'Что для вас важнее всего в этом контракте?':'Согласен на вашу цену. Договорились.'),mode);
  const selector='[data-wait-stage='+ (mode==='turn'?'judging':'debrief')+']';
  await page.waitForSelector(selector);await snap('waiting');
  const before=await page.locator('.wait-status p').innerText();
  await page.waitForTimeout(1300);assert.notEqual(await page.locator('.wait-status p').innerText(),before,'served counter ticks');
  await page.waitForSelector('.wait-status button');await snap('deadline');
  assert.ok(result.dropped>0,'real server messages withheld only in this test connection');
  assert.match(await page.locator('.wait-status').innerText(),/начать другую/);
  // Invoke domain exit, not a DOM event; verify the rendered button binds it.
  const same=await page.evaluate(()=>{const p=window.propsFor('onExit');const button=document.querySelector('.wait-status button');const props=button[Object.keys(button).find(k=>k.startsWith('__reactProps$'))];return props.onClick===p.onExit});
  assert.equal(same,true);await page.evaluate(()=>window.propsFor('onExit').onExit());
  await page.waitForFunction(()=>!!window.propsFor('onStart')&&!document.querySelector('.wait-status'));
  await snap('exit-home');
 }
 result.stages=await page.evaluate(()=>window.seenStages);
 assert.deepEqual(result.errors,[]);result.passed=true;
}catch(e){result.failure=String(e);throw e}
finally{result.totalMs=Math.round(performance.now()-began);writeFileSync(out+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close()}
