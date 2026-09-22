// Real mounted React component, asynchronous registry failures, no UI input.
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..');
const html=`<div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';
import {ServerCertificate} from '/src/components/ServerCertificate.tsx';
const fetchOriginal=window.fetch.bind(window);window.settled=0;
window.fetch=async(...args)=>{try{return await fetchOriginal(...args)}finally{window.settled++}};
function App(){const [id,setId]=React.useState('att_'+ 'a'.repeat(32));window.changeRecord=setId;
return React.createElement(ServerCertificate,{lang:new URLSearchParams(location.search).get('lang'),evidence:{record:{id,grade:'A',overall:100,issued_at:'2099-01-01'},signature:'client-forgery'}})}
createRoot(document.getElementById('root')).render(React.createElement(App));
</script>`;
const server=await createServer({root,server:{host:'127.0.0.1',port:15413,strictPort:true},plugins:[{name:'registry-audit',configureServer(s){s.middlewares.use('/__registry',async(req,res)=>{res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,html))})}}]});
let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 for(const lang of ['ru','en'])for(const failure of ['network','503','invalid-json','invalid-record']){
  const page=await browser.newPage();let release;
  const gate=new Promise(r=>release=r);let requested=false;
  await page.route('**/api/attestations/*',async route=>{
   const id=route.request().url().split('/').at(-1);
   if(id.endsWith('a'.repeat(32)))return route.fulfill({json:{valid:true,record:{id,grade:'B',overall:72,issued_at:'2026-09-22'},signature:'server-fixture'}});
   requested=true;await gate;
   if(failure==='network')return route.abort('failed');
   if(failure==='503')return route.fulfill({status:503,json:{error:'unavailable'}});
   if(failure==='invalid-json')return route.fulfill({body:'broken JSON',contentType:'application/json'});
   return route.fulfill({json:{valid:false,record:{id,grade:'A',overall:100},signature:'unverified'}});
  });
  await page.goto('http://127.0.0.1:15413/__registry?lang='+lang);
  await page.waitForFunction(()=>document.querySelector('a'));
  assert.match(await page.locator('body').innerText(),/72\/100/);
  assert.doesNotMatch(await page.locator('body').innerText(),/2099|100\/100/);
  await page.evaluate(()=>window.changeRecord('att_'+ 'b'.repeat(32)));
  await page.waitForFunction(()=>!document.querySelector('a'));
  assert.equal(requested,true);
  assert.match(await page.locator('body').innerText(),lang==='ru'?/не подтверждено/:/not been confirmed/);
  release();await page.waitForFunction(()=>window.settled===2);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert.equal(await page.locator('a').count(),0,'registry failure must never expose a verified document');
  const text=await page.locator('body').innerText();
  assert.doesNotMatch(text,/72\/100|100\/100|2099/,'neither stale nor client evidence is verified');
  assert.match(text,lang==='ru'?/Личность не удостоверена/:/Identity is not verified/);
  await page.close();
 }
 console.log('PASS async registry failure: 4 outcomes x RU/EN; stale/client evidence hidden');
}finally{await browser?.close();await server.close()}
