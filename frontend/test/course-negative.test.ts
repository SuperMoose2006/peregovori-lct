import test from 'node:test';
import assert from 'node:assert/strict';
import {COURSE_BANK,COURSE_MASTER} from '../src/data/course.generated';
import {check} from '../src/lib/courseCheck';
import {SCENARIO_MAP} from '../src/data/scenarios';
import {newSession,stateView} from '../src/mock/engine';

for(const lang of ['ru','en'] as const)for(const type of new Set([...COURSE_BANK,...COURSE_MASTER].map(x=>x.type))) {
  test(`wrong course answers are rejected: ${type}/${lang}`,()=>{
    for(const ex of [...COURSE_BANK,...COURSE_MASTER].filter(x=>x.type===type)){
      let wrong:unknown;
      switch(type){
        case 'choice': case 'spot_error': wrong=((ex.answer as number)+1)%ex.options!.length;break;
        case 'order': wrong=[...(ex.answer as string[])].reverse();assert.notDeepEqual(wrong,ex.answer);break;
        case 'match': {
          const pairs=Object.entries(ex.answer as Record<string,string>);
          assert.ok(pairs.length>1);
          wrong=Object.fromEntries(pairs.map(([key],i)=>[key,pairs[(i+1)%pairs.length][1]]));break;
        }
        case 'numeric': wrong=1e9;break;
        case 'freeform': wrong='';break;
        case 'reaction': case 'face': wrong=ex.answer==='neutral'?'offended':'neutral';break;
        case 'meters': wrong=ex.answer==='trust'?'tension':'trust';break;
        case 'drill': wrong={...stateView(newSession(SCENARIO_MAP[ex.scenario_id!],lang)),status:'breakdown',turn:999,trust:0,tension:100,deal:null};break;
      }
      assert.equal(check(ex,wrong,lang).ok,false,`${ex.id}: a wrong or unfinished answer must not earn credit`);
    }
  });
}

test("«назови условие» судится по нормализованной реплике и с начала слова, как движок", async () => {
  // Найдено после аудита 17.10: проверка курса смотрела в сырой текст, а ключи
  // хранятся нормализованными — «гарантию объёма» (через ё) не засчитывалась,
  // хотя движок её засчитывает; «полугодовой» засчитывался как «годовой».
  const { COURSE_BANK } = await import("../src/lib/course");
  const { checkFreeform } = await import("../src/lib/courseCheck");
  const ex = COURSE_BANK.find((x) => x.id === "lr-07")!;
  const yo = "Если мы дадим гарантию объёма, сможете подвинуться по цене за штуку?";
  assert.deepEqual(checkFreeform(ex, yo, "ru").reasons, checkFreeform(ex, yo.replace(/ё/g, "е"), "ru").reasons);
  assert.ok(checkFreeform(ex, "Если подпишем полугодовой контракт, сможете подвинуться по цене за штуку?", "ru")
    .reasons.some((r) => r.startsWith("missing_term")), "«полугодовой» засчитан как годовой контракт");
});
