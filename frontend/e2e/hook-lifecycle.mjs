// Real React StrictMode; programmatic hook calls, no synthetic window input.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '..');
const server = await createServer({ root, server: {host:'127.0.0.1',port:15211,strictPort:true},
  plugins:[{name:'hook-fixture',enforce:'pre',transform(code,id){
    if(id===root+'/src/main.tsx') return `import React,{StrictMode} from 'react';
      import {createRoot} from 'react-dom/client'; import {useNegotiation} from './api/useNegotiation';
      function Test(){window.nego=useNegotiation('ru');return null}
      createRoot(document.getElementById('root')).render(<StrictMode><Test/></StrictMode>);`;
    if(id===root+'/src/api/ws.ts') return `export function createTransport(message,kind,conn,options){
      const t={message,kind,conn,options,sent:[],send(m){this.sent.push(m)},close(){}};
      (window.transports??=[]).push(t);kind('ws');return t;}`;
  }}]});
let browser;
try {
  await server.listen();
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:15211');
  await page.waitForFunction(()=>!!window.nego);
  const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const start=async()=>{
    await page.evaluate(()=>window.nego.start('supplier','practice'));
    await page.evaluate(()=>window.transports.at(-1).message({type:'greeting',text:'hello',scenario:{id:'supplier'},state:{status:'active',turn:0}}));
    await settle();
  };
  const failures=[];
  const check=async(name,fn)=>{try{await fn();console.log('PASS '+name)}catch(e){failures.push(name+': '+e.message)}};
  await start();
  await check('one turn and hint under StrictMode',async()=>{
    await page.evaluate(()=>{window.nego.turn('hello');window.nego.turn('hello')});await settle();
    assert.equal(await page.evaluate(()=>window.transports.at(-1).sent.filter(x=>x.type==='turn').length),1);
    await page.evaluate(()=>{window.nego.requestHint();window.nego.requestHint()});await settle();
    assert.equal(await page.evaluate(()=>window.transports.at(-1).sent.filter(x=>x.type==='hint').length),1);
  });
  await check('resume greeting releases pending turn',async()=>{
    await page.evaluate(()=>window.transports.at(-1).message({type:'greeting',resumed:true,text:'resumed',scenario:{id:'supplier'},state:{status:'active',turn:1}}));await settle();
    assert.equal(await page.evaluate(()=>window.nego.busy),false);
    assert.equal(await page.evaluate(()=>window.nego.log.some(e=>e.kind==='me'&&e.text==='hello')),true);
    assert.equal(await page.evaluate(()=>window.nego.log.some(e=>e.kind==='hint'&&e.pending)),false);
  });
  await start();
  await check('disconnected actions are not displayed as delivered',async()=>{
    await page.evaluate(()=>window.transports.at(-1).conn('reconnecting'));await settle();
    const before=await page.evaluate(()=>window.transports.at(-1).sent.length);
    await page.evaluate(()=>{window.nego.turn('lost line');window.nego.requestHint()});await settle();
    assert.equal(await page.evaluate(()=>window.transports.at(-1).sent.length),before);
    assert.equal(await page.evaluate(()=>window.nego.log.length),1);
    await page.evaluate(()=>window.transports.at(-1).conn('online'));await settle();
  });
  await check('closed transport cannot contaminate new run',async()=>{
    await page.evaluate(()=>{const old=window.transports.at(-2);old.message({type:'error',message:'stale'});old.kind('mock');old.conn('lost');old.options.onTranscript('old speech',true);old.options.onCapabilities({stale:true})});await settle();
    const state=await page.evaluate(()=>({error:window.nego.error,kind:window.nego.kind,conn:window.nego.conn,log:window.nego.log.map(x=>x.text),caps:window.nego.capabilities}));
    assert.deepEqual(state,{error:null,kind:'ws',conn:'online',log:['hello'],caps:null});
  });
  await check('final speech transcript shows waiting for reply',async()=>{
    await page.evaluate(()=>window.transports.at(-1).options.onTranscript('spoken line',true));await settle();
    assert.equal(await page.evaluate(()=>window.nego.busy),true);
    assert.equal(await page.evaluate(()=>window.nego.log.at(-1).text),'spoken line');
  });
  assert.deepEqual(failures,[]);
} finally {await browser?.close();await server.close()}
