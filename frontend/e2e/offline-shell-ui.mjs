// Production build, first visit, then total network loss. HTTP cache cannot mask a missing SW cache.
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),dist=root+'/dist',out=resolve(root,'../tmp/deep-offline-shell');mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.webm':'video/webm','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const server=createServer((req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname,file=resolve(dist,'.'+(path==='/'?'/index.html':path));
 if(!file.startsWith(dist+'/')||!existsSync(file)){res.writeHead(404);res.end();return}
 res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(readFileSync(file));
});
let browser,p;const report={stages:[],errors:[]};
try{
 await new Promise(r=>server.listen(15417,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const context=await browser.newContext();p=await context.newPage();p.on('pageerror',e=>report.errors.push(e.message));
 await p.addInitScript(()=>{window.foreignCacheReady=caches.open('other-app-audit').then(c=>c.put('/unrelated-test',new Response('preserve')))});
 await p.goto('http://127.0.0.1:15417');await p.waitForFunction(()=>!!navigator.serviceWorker.controller,undefined,{timeout:15000});
 assert.equal(await p.evaluate(async()=>{await window.foreignCacheReady;return(await caches.open('other-app-audit')).match('/unrelated-test').then(r=>r?.text())}),'preserve','activation must preserve unrelated caches');await p.waitForLoadState('networkidle');
 report.stages.push('first visit controlled by SW');report.cached=await p.evaluate(async()=>{const keys=await caches.keys();return(await Promise.all(keys.map(async k=>(await(await caches.open(k)).keys()).map(r=>new URL(r.url).pathname)))).flat()});
 await context.setOffline(true);await p.reload();await p.locator('.cards .card').first().waitFor({timeout:12000});report.stages.push('reload with network disabled');
 await p.locator('.cards .card').first().click();await p.locator('.chat textarea').waitFor();if(await p.locator('.onb-skip').count())await p.locator('.onb-skip').click();
 for(const line of ['Что для вас важно?','Рыночная цена 86, потому что это стандарт рынка.','Согласен на вашу цену. Договорились.']){
  if(await p.locator('.debrief, .outcome').count())break;
  const before=await p.locator('.msg.opp:not(.typing-msg)').count();await p.locator('.chat textarea').fill(line);await p.locator('.send').click();
  await p.waitForFunction(n=>(document.querySelectorAll('.msg.opp:not(.typing-msg)').length>n&&!document.querySelector('.caret, .wait-status, .typing-msg'))||!!document.querySelector('.debrief, .outcome'),before);
 }
 await p.locator('.debrief').waitFor();assert.match(await p.locator('.debrief').innerText(),/Соглашение достигнуто/);report.stages.push('offline debrief');report.status='прошёл';
}catch(e){report.status='упал';report.error=String(e);process.exitCode=1}
finally{if(p)await p.screenshot({path:out+'/result.png',fullPage:true}).catch(()=>{});writeFileSync(out+'/result.json',JSON.stringify(report,null,2));await browser?.close();await new Promise(r=>server.close(r))}
console.log(JSON.stringify(report));
