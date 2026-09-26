import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'../tmp/expired-resume-ui');mkdirSync(out,{recursive:true});
const server=await createServer({root,server:{host:'127.0.0.1',port:15215,strictPort:true,proxy:{'/api':'http://127.0.0.1:18212','/v1/realtime':{target:'ws://127.0.0.1:18212',ws:true}}}});let browser;const results=[];
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 for(const lang of ['ru','en']){
  const c=await browser.newContext(),p=await c.newPage();let client,remote,reconnect=false;const states=[];const steps=[];
  await p.routeWebSocket('**/v1/realtime*',ws=>{client=ws;const upstream=ws.connectToServer();remote=upstream;
   ws.onMessage(message=>{let e;try{e=JSON.parse(String(message))}catch{upstream.send(message);return}if(reconnect&&e.type==='session.init')e.payload.resume='expired-audit-absent-id';upstream.send(JSON.stringify(e))});
   upstream.onMessage(message=>{try{const e=JSON.parse(String(message));if(e.type==='session.created')states.push(e.state)}catch{}ws.send(message)});
  });
  const snap=async label=>{steps.push({label,text:await p.locator('body').innerText()});await p.screenshot({path:`${out}/${lang}-${steps.length}.png`,fullPage:true})};
  try{
   await p.goto('http://127.0.0.1:15215');if(lang==='en')await p.getByRole('button',{name:'EN',exact:true}).click();await p.locator('.cards .card').first().click();await p.locator('.chat textarea').waitFor();if(await p.locator('.onb-skip').count())await p.locator('.onb-skip').click();
   await p.locator('.chat textarea').fill(lang==='ru'?'Что для вас важно?':'What matters to you?');await p.locator('.send').click();await p.waitForFunction(()=>document.querySelectorAll('.msg.opp:not(.typing-msg)').length>1&&!document.querySelector('.wait-status,.caret,.typing-msg'));await snap('confirmed turn');
   reconnect=true;client.close({code:1012,reason:'audit reconnect'});remote.close();
   await p.getByText(lang==='ru'?'Предыдущая попытка недоступна. Начата новая попытка; прошлый результат не восстановлен.':'The previous attempt is unavailable. A new attempt has started; the previous result was not restored.',{exact:true}).waitFor({timeout:10000});
   assert.equal(await p.locator('.msg.me').count(),0,'old transcript must not attach to the new attempt');assert.equal(states.length,2);assert.equal(states[1].turn,0);await snap('new attempt explicitly disclosed');
   await p.locator('.chat textarea').fill(lang==='ru'?'Согласен на вашу цену. Договорились.':'I accept your price. Agreed.');await p.locator('.send').click();await p.locator('.debrief').waitFor();await snap('new attempt completed');
   results.push({id:`expired-resume/${lang}`,status:'прошёл',steps,scope:'Real gateway: reconnect with missing/expired identifier, new session disclosure, continued through debrief'});
  }catch(e){await snap('failure').catch(()=>{});results.push({id:`expired-resume/${lang}`,status:'упал',error:String(e),steps})}
  finally{await c.close();writeFileSync(out+'/results.json',JSON.stringify(results,null,2))}
  console.log(results.at(-1).id,results.at(-1).status,results.at(-1).error||'');
 }
}finally{await browser?.close();await server.close()}
if(results.some(r=>r.status==='упал'))process.exitCode=1;
