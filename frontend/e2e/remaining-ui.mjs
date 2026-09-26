// Own headless browser. Real loopback gateway, temporary attestation registry.
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {I18N} from '../src/i18n.ts';
const only=process.env.AUDIT_ONLY,live=!!process.env.AUDIT_STAND;
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'../tmp/remaining-ui'+(live?'-stand':only?'-repeat':''));mkdirSync(out,{recursive:true});
const games=JSON.parse(readFileSync(root+'/test/fixtures/games.json','utf8'));
const server=await createServer({root,server:{host:'127.0.0.1',port:15214,strictPort:true,proxy:{'/api':'http://127.0.0.1:18212','/v1/realtime':{target:'ws://127.0.0.1:18212',ws:true}}}});
let browser;const results=[];
const snap=async(p,steps,label,id)=>{steps.push({label,text:await p.locator('body').innerText()});await p.screenshot({path:out+'/'+id.replaceAll('/','-')+'-'+steps.length+'.png',fullPage:true})};
const overlays=async p=>{for(let i=0;i<8&&await p.locator('.milestone-go,.onb-skip').count();i++)await p.locator('.milestone-go,.onb-skip').first().click()};
const send=async(p,text)=>{const n=await p.locator('.msg.opp:not(.typing-msg)').count();await p.locator('.chat textarea').fill(text);await p.locator('.send').click();await p.waitForFunction(n=>!!document.querySelector('.debrief,.outcome')||(document.querySelectorAll('.msg.opp:not(.typing-msg)').length>n&&!document.querySelector('.caret,.typing-msg,.wait-status')),n,{timeout:22000})};
try{
 if(!live)await server.listen();browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required','--use-file-for-fake-audio-capture='+resolve(root,'../tmp/voice-probe.wav')]});
 for(const lang of ['ru','en'])for(const preset of ['classic','call','poker','full','exam']){
  const id=preset==='exam'?`certificate-issued/${lang}`:`layers-${preset}/${lang}`,steps=[];
  if((only&&id!==only)||(live&&preset==='exam'))continue;
  const c=await browser.newContext(),p=await c.newPage();p.setDefaultTimeout(20000);let sessionId,attestation,capabilities={},frames=0,audioChunks=0;
  await p.addInitScript(()=>{window.auditMedia=[];const g=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async opts=>{const s=await g(opts);window.auditMedia.push(s);return s}});
  p.on('websocket',ws=>{ws.on('framesent',f=>{try{const e=JSON.parse(String(f.payload));frames+=(e.input?.video_frames?.length||0)}catch{}});ws.on('framereceived',f=>{try{const e=JSON.parse(String(f.payload));if(e.type==='session.created'){sessionId=e.session_id;capabilities=e.capabilities||{}}if(e.kind==='audio')audioChunks++;if(e.type==='debrief')attestation=e.debrief?.attestation}catch{}})});
  try{
   await p.goto(live?'https://dialog.2-26-49-28.nip.io/':'http://127.0.0.1:15214');if(lang==='en')await p.getByRole('button',{name:'EN',exact:true}).click();
   if(preset!=='exam'){await p.locator('[data-nav="profile"]').first().click();const b=p.locator('.sp-pill').filter({hasText:I18N[lang].layers.presetNames[preset]});await b.click();assert.equal(await b.getAttribute('aria-pressed'),'true');await snap(p,steps,'preset',id)}
   await p.locator(`[data-nav="${preset==='exam'?'exam':'practice'}"]`).first().click();await p.locator('.cards .card').first().click();await p.locator('.chat textarea').waitFor();await overlays(p);await snap(p,steps,'table',id);
   if(['call','full'].includes(preset)){
    await p.locator('.msg.me').first().waitFor({timeout:25000});await p.waitForFunction(()=>!document.querySelector('.wait-status,.typing-msg,.caret'));
    await p.evaluate(()=>window.auditMedia.forEach(s=>s.getAudioTracks().forEach(t=>t.stop())));await snap(p,steps,'recorded speech, controlled ASR',id);
   }
   for(const line of games.principled.supplier[lang]){
    if(await p.locator('.debrief,.outcome').count())break;
    if(await p.locator('.pb-opt:not([aria-disabled="true"])').count())await p.locator('.pb-opt:not([aria-disabled="true"])').first().click();
    await send(p,line);await overlays(p);await snap(p,steps,'turn',id);
   }
   await p.locator('.debrief').waitFor();await overlays(p);await snap(p,steps,'debrief',id);
   if(['poker','full'].includes(preset)&&capabilities.camera===true)assert.ok(frames>0,'enabled camera must send actual frames');
   if(live&&['call','full'].includes(preset))assert.ok(audioChunks>0,'live voice must receive TTS audio');
   if(preset==='exam'){
    const link=p.locator('.cert-server a');await link.waitFor();const href=await link.getAttribute('href');assert.ok(attestation&&sessionId);const signed=attestation;
    const [doc]=await Promise.all([c.waitForEvent('page'),link.click()]);await doc.waitForLoadState();assert.match(await doc.locator('body').innerText(),lang==='ru'?/Личность не удостоверена/:/Identity not verified/);await snap(doc,steps,'verified document',id);await doc.close();
    results.push({id:`certificate-verify/${lang}`,status:'прошёл',scope:'DOM link to real signed anonymous document',steps});
    const stranger=await browser.newContext(),other=await stranger.newPage();const response=await other.goto('http://127.0.0.1:15214'+href);assert.equal(response.status(),200);assert.match(await other.locator('body').innerText(),lang==='ru'?/Личность не удостоверена/:/Identity not verified/);await snap(other,steps,'public ID in unrelated profile, identity NOT verified',id);await stranger.close();
    results.push({id:`certificate-foreign-id/${lang}`,status:'прошёл',scope:'Public identifier is shareable, NOT proof of presenter identity'});
    const checked=await p.evaluate(async({id,signature})=>{const base='/api/attestations/'+id;const post=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({record:{id,overall:100,grade:'A',identity_verified:true},signature})});const missing=await fetch('/api/attestations/att_'+ '0'.repeat(32)+'/document');const original=await(await fetch(base)).json();return{post:post.status,missing:missing.status,original}},{id:signed.record.id,signature:'0'.repeat(64)});
    assert.equal(checked.post,405);assert.equal(checked.missing,404);assert.deepEqual(checked.original,{valid:true,...signed});results.push({id:`certificate-forged/${lang}`,status:'прошёл',scope:'Browser-origin forged POST rejected; unknown document 404; signed result unchanged'});
    const repeat=await p.evaluate(({sessionId,lang})=>new Promise((resolve,reject)=>{const ws=new WebSocket('ws://127.0.0.1:15214/v1/realtime?mode=text');const timer=setTimeout(()=>{ws.close();reject(Error('resume timeout'))},10000);ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='session.queue_done')ws.send(JSON.stringify({type:'session.init',payload:{scenarioId:'supplier',lang,gameMode:'practice',resume:sessionId}}));if(m.type==='debrief'){clearTimeout(timer);ws.close();resolve(m.debrief.attestation)}};ws.onerror=()=>{clearTimeout(timer);reject(Error('resume error'))}}),{sessionId,lang});
    assert.deepEqual(repeat,signed);results.push({id:`certificate-duplicate/${lang}`,status:'прошёл',scope:'Completed exam resumed with requested practice mode returns same signed identifier and result'});
   }else{
    for(let part=0;part<2;part++)await p.locator('.beat-go').click();await snap(p,steps,'full review',id);
   }
   await p.locator('[data-nav="practice"]').first().click();await p.locator('.cards .card').first().waitFor();
   results.push({id,status:'прошёл',steps,scope:live?'Installed 20260923-b682bb4, real providers, prerecorded microphone, synthetic camera; no physical-device verification':preset==='exam'?'Real gateway + temporary registry':'Synthetic media devices; real gateway; controlled ASR; TTS disabled; vision model returns no observations (controlled provider failures)',frames,audioChunks});
  }catch(e){results.push({id,status:'упал',steps,error:String(e)});await snap(p,steps,'failure',id).catch(()=>{})}
  finally{await c.close();writeFileSync(out+'/results.json',JSON.stringify(results,null,2))}
  console.log(id,results.at(-1).status,results.at(-1).error||'');
 }
}finally{await browser?.close();await server.close()}
if(results.some(r=>r.status==='упал'))process.exitCode=1;
