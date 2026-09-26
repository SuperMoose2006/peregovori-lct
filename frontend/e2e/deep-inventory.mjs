// Generate path inventory from product catalogs; preserves prior verification records.
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {COURSE_BANK,COURSE_MASTER} from '../src/data/course.generated.ts';
import {COURSE_BLOCKS} from '../src/data/course.blocks.generated.ts';
import {SCENARIOS} from '../src/data/scenarios.ts';
import {MIRRORS} from '../src/data/mirrors.ts';
import {CAMPAIGN_DEFS} from '../src/data/campaigns.generated.ts';
import {READING_GAMES} from '../src/data/readingGames.ts';
const out=resolve(import.meta.dirname,'../../docs/deep-audit-12206/routes.json');
const old=existsSync(out)?JSON.parse(readFileSync(out,'utf8')).routes:[];
const faults=['empty','long','unicode','double-action','reload','back','two-tabs','expired-session','asr-failure','tts-failure','model-failure','network-drop','turn-35s','review-12s'];
const verification=id=>{const prior=old.find(r=>r.id===id);return prior?{status:prior.status,evidence:prior.evidence,faults:prior.faults}:{};};
const routes=[];
const add=(id,family,steps,extra={})=>routes.push({id,family,steps,status:'не проверялся',evidence:[],faults:Object.fromEntries(faults.map(f=>[f,'не проверялся'])),...extra,...verification(id)});
for(const lang of ['ru','en']){
 for(const sc of SCENARIOS)for(const outcome of ['agreement','breakdown'])add(`practice/${sc.id}/${lang}/${outcome}`,'practice',['вход','выбор стола','брифинг','переговоры',outcome,'разбор','повтор/выход'],{lang,scenario:sc.id,outcome});
 for(const sc of MIRRORS)add(`mirror/${sc.id}/${lang}`,'mirror',['вход','другая сторона','переговоры','разбор','выход'],{lang,scenario:sc.id});
 for(const c of CAMPAIGN_DEFS)add(`campaign/${c.id}/${lang}`,'campaign',['выбор кампании',...c.stages.flatMap((s,i)=>[`акт ${i+1}: ${s.scenario_id}`,'разбор акта','следующий акт']),'эпилог','повтор/выход'],{lang});
 for(const b of COURSE_BLOCKS)add(`course/${b.id}/${lang}`,'course-block',['карта курса','разблокировка блока',...b.lessons.map((_,i)=>`урок ${i+1}`),'упражнения','экзамен блока','результат','карта курса'],{lang});
 for(const ex of [...COURSE_BANK,...COURSE_MASTER])add(`exercise/${ex.id}/${lang}`,'exercise',['вход в курс','блок/экзамен',ex.type,'эталонный ответ / мини-партия','объяснение','результат','возврат'],{lang,type:ex.type,negativeBranch:'не проверялся через DOM'});
 for(const r of READING_GAMES)add(`reading/${r.id}/${lang}`,'reading',['чтение партии','вопросы по ходам','ответ/объяснение','итог','возврат'],{lang});
 for(const id of ['onboarding','custom-online','custom-offline','daily','warmup','course-remediation','master-exam','exam-pass','exam-fail','profile-progress','growth-empty','growth-history','rematch','what-if','theme-sound-language','layers-classic','layers-read','layers-call','layers-poker','layers-full','certificate-disabled','certificate-issued','certificate-verify','certificate-foreign-id','certificate-forged','certificate-duplicate'])add(`${id}/${lang}`,id,['вход',id,'ввод/выбор','результат/отказ','выход'],{lang});
}
const removed=old.filter(r=>!routes.some(n=>n.id===r.id));if(removed.length)throw Error('Review removed paths: '+removed.map(r=>r.id));
if(new Set(routes.map(r=>r.id)).size!==routes.length)throw Error('Duplicate path IDs');
mkdirSync(resolve(out,'..'),{recursive:true});writeFileSync(out,JSON.stringify({catalogBaseRevision:'b80abda',scope:'Finite paths; unit-test totals do not prove browser completion.',routes},null,2)+'\n');
console.log(JSON.stringify({routes:routes.length,exercises:COURSE_BANK.length+COURSE_MASTER.length,mirrors:MIRRORS.length}));
