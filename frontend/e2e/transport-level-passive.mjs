// Entire public Transport contract; browser execution, no synthetic input.
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..');
const ast=ts.createSourceFile('transport.ts',readFileSync(root+'/src/api/transport.ts','utf8'),ts.ScriptTarget.Latest,true);
const contract=ast.statements.find(n=>ts.isInterfaceDeclaration(n)&&n.name.text==='Transport');
assert.deepEqual(contract.members.map(m=>m.name.getText(ast)).sort(),
 ['send','close','micLevel','speechLevel','videoFrame','interrupt'].sort(),
 'A new Transport method needs a delegation assertion below');
const server=await createServer({root,server:{host:'127.0.0.1',port:15411,strictPort:true},
 plugins:[{name:'transport-fixture',enforce:'pre',transform(code,id){
  if(id===root+'/src/main.tsx')return `import {createTransport} from './api/ws';
   window.sent=[];window.closeCalls=0;window.interrupted=0;
   window.proxy=createTransport(()=>{},kind=>window.adopted=kind,()=>{});
   window.initial=[window.proxy.micLevel(),window.proxy.speechLevel(),window.proxy.videoFrame()];
   window.early={type:'turn',text:'queued'};window.proxy.send(window.early);`;
  if(id===root+'/src/realtime/transport.ts')return `export class RealtimeTransport {
   constructor(){window.inner=this;this.mic=.17;this.speech=.35;this.frame='frame-one'}
   send(m){window.sent.push(m)} close(){window.closeCalls++} interrupt(){window.interrupted++}
   micLevel(){return this.mic} speechLevel(){return this.speech} videoFrame(){return this.frame}
  }`;
  if(id===root+'/src/mock/mockServer.ts')return `export class MockServer {
   send(m){window.sent.push(m)} close(){window.closeCalls++}
  }`;
 }}]});
let browser;
try{
 await server.listen();
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 for(const online of [true,false]){
  const page=await browser.newPage();
  await page.route('**/api/health',route=>route.fulfill({status:online?200:503,json:{ok:online}}));
  await page.goto('http://127.0.0.1:15411');
  await page.waitForFunction(()=>window.adopted);
  assert.equal(await page.evaluate(()=>window.adopted),online?'ws':'mock');
  assert.deepEqual(await page.evaluate(()=>window.initial),[0,0,null]);
  assert.equal(await page.evaluate(()=>window.sent.length===1&&window.sent[0]===window.early),true,'queued send once, exact argument');
  assert.equal(await page.evaluate(()=>{const m={type:'hint'};window.proxy.send(m);return window.sent.length===2&&window.sent[1]===m}),true,'live send');
  const metrics=()=>page.evaluate(()=>[window.proxy.micLevel(),window.proxy.speechLevel(),window.proxy.videoFrame()]);
  assert.deepEqual(await metrics(),online?[.17,.35,'frame-one']:[0,0,null]);
  if(online){
   await page.evaluate(()=>Object.assign(window.inner,{mic:.54,speech:.72,frame:'frame-two'}));
   assert.deepEqual(await metrics(),[.54,.72,'frame-two'],'current values, not cached');
  }
  await page.evaluate(()=>{window.proxy.interrupt();window.proxy.close()});
  assert.equal(await page.evaluate(()=>window.interrupted),online?1:0,'interrupt');
  assert.equal(await page.evaluate(()=>window.closeCalls),1,'close');
  await page.close();
 }
 console.log('PASS six Transport methods, buffered/live send and offline defaults');
}finally{await browser?.close();await server.close()}
