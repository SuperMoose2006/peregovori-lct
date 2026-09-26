// Full React + real gateway through a severable TCP proxy.
// DOM actions stay inside our own headless browser; no operating-system input.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { createServer as tcpServer, connect } from 'node:net';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const voice=process.argv.includes('--voice');
const dom=process.argv.includes('--dom');
const root=resolve(import.meta.dirname,'..'), out=resolve(root,'../tmp/failures-rehearsal'+(voice?'-voice':'')+(dom?'-dom':''));
mkdirSync(out,{recursive:true});
const sockets=new Set();let blocked=false;
const proxy=tcpServer(client=>{
  if(blocked){client.destroy();return}
  const upstream=connect(18212,'127.0.0.1');
  for(const socket of [client,upstream]){sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>{sockets.delete(socket);client.destroy();upstream.destroy()})}
  client.pipe(upstream);upstream.pipe(client);
});
await new Promise(r=>proxy.listen(18213,'127.0.0.1',r));
const server=await createServer({root,server:{host:'127.0.0.1',port:15212,strictPort:true,
  proxy:{'/api':'http://127.0.0.1:18212','/v1/realtime':{target:'ws://127.0.0.1:18213',ws:true}}},
  plugins:[{name:'failure-actions',enforce:'pre',transform(code,id){
    if(id===root+'/src/App.tsx')return code.replace(/^  return \(/m,'  window.rehearsal={start,nego,screen,setMode};\n  return (');
  }}]});
const results=[];let browser;
const fault=async hang=>{const r=await fetch('http://127.0.0.1:18212/__test/fault',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hang})});assert.equal(r.status,200)};
try{
  await server.listen();
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args:voice?['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required','--use-file-for-fake-audio-capture='+resolve(root,'../tmp/voice-probe.wav')]:[]});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  if(voice)await page.addInitScript(()=>localStorage.setItem('dialog.layers.v1',JSON.stringify({voice:true})));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:15212');
  await page.waitForFunction(()=>!!window.rehearsal);
  const submit=async text=>{
    if(dom){await page.locator('.chat textarea').fill(text);await page.locator('.send').click();}
    else await page.evaluate(text=>window.rehearsal.nego.turn(text),text);
  };
  const start=async mode=>{
    if(dom){
      for(let i=0;i<8&&await page.locator('.milestone-go').count();i++)await page.locator('.milestone-go').click();
      await page.locator(`[data-nav="${mode==='exam'?'exam':'practice'}"]`).first().click();
      await page.locator('.cards .card').first().click();
      await page.locator('.chat textarea').waitFor();
      if(await page.locator('.onb-skip').count())await page.locator('.onb-skip').click();
    }else{
      await page.evaluate(mode=>window.rehearsal.setMode(mode),mode);
      await page.waitForTimeout(50);
      await page.evaluate(()=>window.rehearsal.start('supplier'));
    }
  };
  await fault(true);
  await start('practice');
  await page.waitForFunction(()=>window.rehearsal.nego.state?.status==='active');
  // Cut the network after the engine applies a move but before reply completion.
  await fault(true);
  if(voice){
    await page.waitForFunction(()=>window.rehearsal.nego.log.some(e=>e.kind==='me'&&e.text.includes('контракте')),{},{timeout:20000});
    assert.equal(await page.evaluate(()=>window.rehearsal.nego.busy),true);
    results.push({case:'recorded-browser-microphone',asr:'controlled transcript',busy:true});
  }else await submit('Что для вас важнее всего в этом контракте?');
  for(let i=0;i<100;i++){
    const states=await (await fetch('http://127.0.0.1:18212/__test/state')).json();
    if(states.at(-1)?.turn===1)break;
    await new Promise(r=>setTimeout(r,20));
    assert.ok(i<99,'server applied turn');
  }
  blocked=true;for(const s of sockets)s.destroy();
  await page.locator('.conn-banner').waitFor();
  assert.match(await page.locator('.conn-banner').innerText(),/Соединение потеряно/);
  const logSize=await page.evaluate(()=>window.rehearsal.nego.log.length);
  await page.evaluate(()=>window.rehearsal.nego.turn('Эта реплика не должна теряться в сети.'));
  assert.equal(await page.evaluate(()=>window.rehearsal.nego.log.length),logSize);
  assert.equal(await page.locator('.quick button[aria-label]').isDisabled(),true);
  await page.screenshot({path:out+'/network-cut.png'});
  const disconnectedAt=performance.now();
  await fault(false);blocked=false;
  await page.waitForFunction(()=>window.rehearsal.nego.conn==='online');
  await page.waitForFunction(()=>window.rehearsal.nego.state?.turn===1,{},{timeout:3000});
  assert.equal(await page.evaluate(()=>window.rehearsal.nego.busy),false);
  assert.equal(await page.evaluate(()=>window.rehearsal.nego.log.some(e=>e.kind==='me'&&e.text.includes('контракте'))),true,'confirmed spoken/typed line survives reconnect');
  assert.ok((await page.locator('body').innerText()).includes('Связь восстановлена.'));
  results.push({case:'network-resume',ms:Math.round(performance.now()-disconnectedAt),turn:1});
  // A stalled model is bounded even if the provider never throws a timeout.
  await fault(true);const slowAt=performance.now();
  await submit('По рыночным данным цена 87, это независимый стандарт.');
  await page.waitForFunction(()=>window.rehearsal.nego.busy);
  await page.screenshot({path:out+'/model-wait.png'});
  await page.waitForFunction(()=>!window.rehearsal.nego.busy&&window.rehearsal.nego.state?.turn===2,{},{timeout:19000});
  results.push({case:'model-timeout-fallback',ms:Math.round(performance.now()-slowAt),turn:2});
  await fault(false);
  await submit('Согласен на вашу цену. Договорились.');
  await page.waitForFunction(()=>window.rehearsal.screen==='debrief');
  assert.equal(await page.evaluate(()=>window.rehearsal.nego.state.turn),3);
  await page.screenshot({path:out+'/completed-after-failures.png'});
  // Real exam -> server registry -> verified printable document.
  const began=performance.now();
  await start('exam');
  await page.waitForFunction(()=>window.rehearsal.nego.state?.turn===0);
  const fixture=JSON.parse(readFileSync(resolve(root,'test/fixtures/games.json'),'utf8'));
  const moves=fixture.principled.supplier.ru;
  for(const text of moves){
    if(await page.evaluate(()=>window.rehearsal.nego.state.status!=='active'))break;
    const turn=await page.evaluate(()=>window.rehearsal.nego.state.turn);
    await submit(text);
    await page.waitForFunction(n=>!window.rehearsal.nego.busy&&window.rehearsal.nego.state.turn>n,turn);
  }
  await page.waitForFunction(()=>window.rehearsal.screen==='debrief');
  const link=page.locator('.cert-server a');await link.waitFor();
  const href=await link.getAttribute('href');
  const documentResponse=await page.request.get('http://127.0.0.1:15212'+href);
  assert.equal(documentResponse.status(),200);
  assert.match(await documentResponse.text(),/Личность не удостоверена/);
  if(dom){
    for(let i=0;i<8&&await page.locator('.milestone-go').count();i++)await page.locator('.milestone-go').click();
    const [documentPage]=await Promise.all([page.context().waitForEvent('page'),link.click()]);
    await documentPage.waitForLoadState();assert.match(await documentPage.locator('body').innerText(),/Личность не удостоверена/);
    await documentPage.screenshot({path:out+'/anonymous-certificate.png',fullPage:true});await documentPage.close();
  }
  results.push({case:'complete-exam-and-registry',ms:Math.round(performance.now()-began),grade:await page.evaluate(()=>window.rehearsal.nego.debrief.grade)});
  await page.screenshot({path:out+'/verified-exam.png'});
  // A persistent outage reaches a visible recovery panel, not an endless spinner.
  await start('practice');
  await page.waitForFunction(()=>window.rehearsal.nego.state?.turn===0);
  blocked=true;for(const s of sockets)s.destroy();
  await page.locator('.conn-lost').waitFor({timeout:18000});
  assert.match(await page.locator('.conn-lost').innerText(),/связ|соедин|подключ/i);
  assert.equal(await page.evaluate(()=>window.rehearsal.nego.busy),false);
  assert.equal(await page.evaluate(()=>window.rehearsal.nego.debrief),null);
  await page.screenshot({path:out+'/persistent-outage.png'});
  results.push({case:'persistent-outage',recoveryPanel:true});
  assert.deepEqual(errors,[]);
  writeFileSync(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser?.close();await server.close();for(const s of sockets)s.destroy();await new Promise(r=>proxy.close(r))}
