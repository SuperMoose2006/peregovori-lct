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
