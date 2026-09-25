// Late chunk rejection must not revive a closed negotiation. No DOM input.
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..');
const server=await createServer({root,server:{host:'127.0.0.1',port:15415,strictPort:true},plugins:[{name:'close-race',enforce:'pre',transform(code,id){
 if(id===root+'/src/main.tsx')return `import {createTransport} from './api/ws'; window.events=[]; window.proxy=createTransport(m=>events.push(m),k=>events.push(k),s=>events.push(s));`;
 if(id===root+'/src/mock/mockServer.ts')return `window.chunkStarted=true; await new Promise(r=>window.releaseChunk=r); throw new Error('controlled chunk failure'); export class MockServer {}`;
}}]});
let browser;
try{
 await server.listen();
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 for(const closed of [false,true]){
  const page=await browser.newPage();
  await page.route('**/api/health',r=>r.fulfill({status:503}));
  await page.goto('http://127.0.0.1:15415');
  await page.waitForFunction(()=>window.chunkStarted);
  await page.evaluate(closed=>{if(closed)window.proxy.close();window.releaseChunk()},closed);
  if(!closed)await page.waitForFunction(()=>window.events.includes('lost'));
  else await page.waitForTimeout(500);
  assert.deepEqual(await page.evaluate(()=>window.events),closed?[]:['lost'],'closed transport must stay silent; active transport must report chunk failure');
  await page.close();
 }
 console.log('PASS active chunk failure visible; late failure after close silent');
}finally{await browser?.close();await server.close()}
