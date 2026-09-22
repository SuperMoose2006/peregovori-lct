// Exercise the actual async transport wrapper in a browser, without input events.
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..');
const server=await createServer({root,server:{host:'127.0.0.1',port:15411,strictPort:true},
 plugins:[{name:'level-fixture',enforce:'pre',transform(code,id){
  if(id===root+'/src/main.tsx')return `import {createTransport} from './api/ws';
   window.level=.35;window.proxy=createTransport(()=>{},()=>window.adopted=true,()=>{});
   window.initial=window.proxy.speechLevel?.();`;
  if(id===root+'/src/realtime/transport.ts')return `export class RealtimeTransport {
   send(){} close(){} speechLevel(){return window.level}
  }`;
 }}]});
let browser;
try{
 await server.listen();
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const page=await browser.newPage();
 await page.route('**/api/health',route=>route.fulfill({json:{ok:true}}));
 await page.goto('http://127.0.0.1:15411');
 await page.waitForFunction(()=>window.adopted);
 assert.equal(await page.evaluate(()=>window.initial),0);
 assert.equal(await page.evaluate(()=>window.proxy.speechLevel()),.35);
 assert.equal(await page.evaluate(()=>{window.level=.72;return window.proxy.speechLevel()}),.72);
 console.log('PASS actual transport wrapper forwards live speech level');
}finally{await browser?.close();await server.close()}
