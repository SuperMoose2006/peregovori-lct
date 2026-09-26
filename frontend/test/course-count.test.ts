import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CourseScreen} from '../src/components/CourseScreen';
import {COURSE_BLOCKS} from '../src/lib/course';
import {emptyProfile} from '../src/lib/progress';
import {I18N} from '../src/i18n';

test('course introduction follows actual catalog size in both languages', () => {
  const check = () => {
    for (const lang of ['ru','en'] as const) {
      const html=renderToStaticMarkup(createElement(CourseScreen,{t:I18N[lang],lang,
        profile:emptyProfile(),onProfile:()=>{},onStartDrill:()=>{},onExit:()=>{}}));
      const lead=html.match(/<p class="lead">([^<]+)<\/p>/)?.[1] ?? '';
      assert.match(lead,new RegExp(`\\b${COURSE_BLOCKS.length}\\b`),lang+' introduction must state actual count');
      assert.doesNotMatch(lead,/\{n\}/);
    }
  };
  check();
  COURSE_BLOCKS.push({...COURSE_BLOCKS[0],id:'count-regression-fixture'});
  try { check(); } finally { COURSE_BLOCKS.pop(); }
});
