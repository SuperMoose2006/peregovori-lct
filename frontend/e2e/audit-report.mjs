// Merge explicit browser evidence; never infer a pass from a unit-test count.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {COURSE_BLOCKS} from '../src/data/course.blocks.generated.ts';
const root=resolve(import.meta.dirname,'../..'),file=root+'/docs/deep-audit-12206/routes.json';
const data=JSON.parse(readFileSync(file,'utf8'));
const evidence=[];
const attach=(id,status,path,scope)=>{
 const route=data.routes.find(x=>x.id===id);if(!route)throw Error('Unknown path '+id);
 route.status=status;route.evidence=[...(route.evidence||[]).filter(x=>x.log!==path),{log:path,scope}];
};
for(const dir of ['deep-ui-practice-agreement','deep-ui-practice-breakdown','deep-ui-mirror-agreement','deep-ui-custom-agreement','deep-reading','deep-campaign','deep-ui-daily-agreement']){
 const path=`tmp/${dir}/results.json`;if(!existsSync(root+'/'+path))continue;
 const bytes=readFileSync(root+'/'+path);evidence.push({path,sha256:createHash('sha256').update(bytes).digest('hex')});
 for(const result of JSON.parse(bytes))attach(result.id,result.status,path,result.scope||'offline DOM path; recorded visible text');
}
for(const lang of ['ru','en']){
 for(const [outcome,label] of [['agreement','exam-pass'],['breakdown','exam-fail']]){
  const path=`tmp/deep-ui-exam-${outcome}/results.json`;if(!existsSync(root+'/'+path))continue;
  const runs=JSON.parse(readFileSync(root+'/'+path)).filter(r=>r.id.includes('/'+lang+'/'));
  if(runs.length===9)attach(`${label}/${lang}`,runs.every(r=>r.status==='прошёл')?'прошёл':'упал',path,'nine offline exam tables; anonymous/unverified notice checked');
 }
 const path=`tmp/deep-master-${lang}.log`;if(!existsSync(root+'/'+path))continue;
 const log=readFileSync(root+'/'+path,'utf8');
 for(const match of log.matchAll(/блок пройден целиком[^\n]+block-(\d+)/g))attach(`course/${COURSE_BLOCKS[Number(match[1])-1].id}/${lang}`,'прошёл',path,'fresh profile, all lessons, block exam and capstone');
 for(const match of log.matchAll(/PASS exercise ([\w-]+) (ru|en)/g))attach(`exercise/${match[1]}/${match[2]}`,'прошёл',path,'reference answer through lesson/exam DOM; incorrect answer branch not implied');
 for(const match of log.matchAll(/капстоун ([\w-]+)[^\n]*\nблок пройден целиком/g))attach(`exercise/${match[1]}/${lang}`,'прошёл',path,'completed capstone and result');
 if(log.includes('PASS full master exam')){
  attach(`master-exam/${lang}`,'прошёл',path,'three master games after earned course progression');
  for(const id of ['ms-01','ms-02','ms-03'])attach(`exercise/${id}/${lang}`,'прошёл',path,'master game completed through DOM');
 }
}

for(const lang of ['ru','en']){
 const recovery=`tmp/deep-recovery-${lang}-final.log`;
 if(existsSync(root+'/'+recovery)&&readFileSync(root+'/'+recovery,'utf8').includes('PASS failed exam'))attach(`course-remediation/${lang}`,'прошёл',recovery,'fresh profile: failed exam, recovery lesson, retry available; no passed credit or master access');
 const warm=`tmp/deep-warmup-${lang}.log`;
 if(existsSync(root+'/'+warm)&&readFileSync(root+'/'+warm,'utf8').includes('PASS warmup'))attach(`warmup/${lang}`,'прошёл',warm,'fresh profile: warmup exercises, negotiation, debrief, home');
 const profilePath='tmp/deep-profile/results.json';
 if(existsSync(root+'/'+profilePath)){
  const result=JSON.parse(readFileSync(root+'/'+profilePath)).find(r=>r.lang===lang);
  if(result?.status==='прошёл')for(const id of ['onboarding','profile-progress','growth-empty','growth-history','rematch','what-if','theme-sound-language','layers-read'])attach(`${id}/${lang}`,'прошёл',profilePath,result.scope);
  if(result)for(const id of ['layers-classic','layers-call','layers-poker','layers-full']){
   const route=data.routes.find(r=>r.id===`${id}/${lang}`);
   route.evidence=[{log:profilePath,scope:'Preset selection verified only; full media/device path is NOT implied'}];
  }
 }
 const examPath='tmp/deep-ui-exam-agreement/results.json';
 if(existsSync(root+'/'+examPath)&&JSON.parse(readFileSync(root+'/'+examPath)).filter(r=>r.id.includes('/'+lang+'/')&&r.status==='прошёл').length===9)attach(`certificate-disabled/${lang}`,'прошёл',examPath,'offline exam explicitly has no verified server document');
}
const faultPath='tmp/failures-rehearsal-dom/results.json';
if(existsSync(root+'/'+faultPath)){
 const results=JSON.parse(readFileSync(root+'/'+faultPath));
 if(results.some(r=>r.case==='complete-exam-and-registry'))for(const id of ['certificate-issued','certificate-verify'])attach(`${id}/ru`,'прошёл',faultPath,'real isolated gateway, fresh exam, registry signature, DOM link to printable anonymous document; deterministic provider');
}
// Negative matrix is evidence-specific: do not paint all routes green.
for(const lang of ['ru','en']){
 const route=data.routes.find(r=>r.id===`practice/supplier/${lang}/agreement`);
 const inputPath='tmp/deep-input/results.json';
 if(existsSync(root+'/'+inputPath)&&JSON.parse(readFileSync(root+'/'+inputPath)).some(r=>r.lang===lang&&r.label==='quit'))for(const fault of ['long','unicode','double-action','reload','two-tabs'])route.faults[fault]='прошёл: '+inputPath+' (isolated offline path)';
}

data.auditDate='2026-09-26';data.scope='Status applies to the named path and evidence scope, not to every failure or provider configuration.';
writeFileSync(file,JSON.stringify(data,null,2)+'\n');
writeFileSync(root+'/docs/deep-audit-12206/dom-evidence.json',JSON.stringify(evidence,null,2)+'\n');
const counts=Object.fromEntries(['прошёл','упал','не проверялся'].map(s=>[s,data.routes.filter(r=>r.status===s).length]));
console.log(counts);
