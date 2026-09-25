// Real App, semantic actions only: no clicks, keys or dispatched UI events.
// The action bridge exists only in this Vite test transform, never in a build.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, '../tmp/rehearsal'+(process.argv.includes('--live')?'-live':'-offline'));
mkdirSync(out, { recursive: true });
const server = await createServer({root, optimizeDeps:{entries:['src/main.tsx','src/realtime/vendor/media-provider.ts']}, server:{host:'127.0.0.1', port:15209, strictPort:true, proxy:{'/api':process.env.AUDIT_API ?? 'http://127.0.0.1:18208','/v1/realtime':{target:'ws://127.0.0.1:18208',ws:true}}},
  plugins:[{name:'rehearsal-actions', enforce:'pre', transform(code,id){
    if (id === root+'/src/App.tsx') {
      assert.equal([...code.matchAll(/^  return \(/gm)].length,1);
      return code.replace(/^  return \(/m, '  window.__rehearsal = { start, nego, screen };\n  return (');
    }
  }}]});
let browser;
const results=[];
const live=process.argv.includes('--live');
try {
  await server.listen();
  browser=await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});
  // Explicit offline rehearsal: health refusal selects the existing offline engine.
  if(!live) { await page.route('**/api/health',r=>r.abort()); await page.route('**/api/campaigns?*',r=>r.abort()); }
  const began=performance.now();
  await page.goto('http://127.0.0.1:15209');
  await page.waitForFunction(()=>window.__rehearsal?.screen==='home');
  await page.screenshot({path:out+'/01-home.png'});
  await page.evaluate(()=>window.__rehearsal.start('supplier'));
  await page.waitForFunction(()=>window.__rehearsal.nego.state?.status==='active');
  results.push({stage:'start',ms:Math.round(performance.now()-began)});
  assert.equal(await page.evaluate(()=>window.__rehearsal.nego.kind),live?'ws':'mock');
  if(live) assert.equal(await page.evaluate(()=>window.__rehearsal.nego.judgeActive),true);
  for(const text of ['Что для вас важнее всего в этой сделке и почему именно это?',
    'Рыночная цена ниже, потому что рынок, в обмен на объём, стандарт индустрии, это справедливо.',
    'Согласен на вашу цену. Договорились.']) {
    const before=await page.evaluate(()=>window.__rehearsal.nego.state.turn);
    const t=performance.now();
    await page.evaluate(text=>{window.__rehearsal.nego.turn(text);window.__rehearsal.nego.turn(text)},text);
    await page.waitForFunction(turn=>!window.__rehearsal.nego.busy&&window.__rehearsal.nego.state.turn>turn,before);
    assert.equal(await page.evaluate(()=>window.__rehearsal.nego.state.turn),before+1,'double action must apply only one move');
    results.push({stage:'turn '+(before+1),ms:Math.round(performance.now()-t)});
    await page.screenshot({path:out+'/turn-'+(before+1)+'.png'});
  }
  await page.waitForFunction(()=>window.__rehearsal.screen==='debrief');
  assert.ok(await page.evaluate(()=>window.__rehearsal.nego.debrief));
  await page.screenshot({path:out+'/05-debrief.png'});
  results.push({stage:'whole run',ms:Math.round(performance.now()-began)});
  // Refresh mid-turn: no fictitious completion, a visible recovery explanation.
  await page.evaluate(()=>window.__rehearsal.start('supplier'));
  await page.waitForFunction(()=>window.__rehearsal.nego.state?.status==='active');
  await page.evaluate(()=>window.__rehearsal.nego.turn('Что для вас важно?'));
  await page.reload();
  await page.waitForFunction(()=>window.__rehearsal?.screen==='home');
  assert.match(await page.locator('[role=alert]').innerText(),/не восстановлена/);
  assert.equal(await page.locator('[role=alert]').evaluate(el=>getComputedStyle(el).position),'static','reload notice must not cover navigation');
  assert.equal(await page.evaluate(()=>window.__rehearsal.nego.debrief),null);
  await page.screenshot({path:out+'/06-reloaded.png'});
  const deviceReport=await page.evaluate(async()=>{
    const {MediaProvider}=await import('/src/realtime/vendor/media-provider.ts');
    const provider=new MediaProvider();
    try {return await provider.start({camera:true,mic:true})} finally {await provider.stop()}
  });
  assert.match(deviceReport.camera,/не разрешён|не найдено|в системе нет/);
  assert.match(deviceReport.mic,/не разрешён|не найдено|в системе нет/);
  results.push({stage:'devices denied',report:deviceReport});
  assert.deepEqual(errors,[]);
  writeFileSync(out+'/results.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify(results));
} finally {await browser?.close();await server.close();}
