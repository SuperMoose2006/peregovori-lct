import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyDebrief, emptyProfile, loadProfile, markLessonDone, recordExercise, saveProfile,
         updateProfile, type Profile } from '../src/lib/progress';
import type { Debrief } from '../src/types';

test('fresh persisted progress wins over a mounted stale profile; failed writes retain memory', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let raw: string | null = null, failRead = false, failWrite = false;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => { if (failRead) throw Error('SecurityError'); return raw; },
    setItem: (_key: string, value: string) => { if (failWrite) throw Error('QuotaExceededError'); raw = value; },
  } });
  try {
    const stale = emptyProfile();
    const first = markLessonDone(stale, 'foundations', 1);
    saveProfile(first);
    const second = markLessonDone(loadProfile(stale), 'foundations', 3);
    assert.deepEqual(second.course.foundations.lessons, [1, 3]);
    // An existing old blob must not replace newer memory after quota failure.
    failWrite = true;
    saveProfile(second);
    const answer = recordExercise(loadProfile(second), 'foundations', 'fo-04', 10, true).profile;
    saveProfile(answer);
    assert.deepEqual(loadProfile(stale).course.foundations.lessons, [1, 3]);
    assert.equal(loadProfile().xp, 10);
    failWrite = false;
    saveProfile(answer);
    failRead = true;
    assert.equal(loadProfile(answer), answer, 'read denied keeps current profile');
    failRead = false; raw = null;
    assert.equal(loadProfile(answer), answer, 'missing storage keeps current profile');
  } finally {
    failWrite = false;
    saveProfile(emptyProfile()); // clear the failed-write fallback before leaving this test
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

// Аудит 17.10, F02: две вкладки при нуле. A: урок 1 (2/3, +20 XP). B: партия
// (+102 XP). A: урок 2 (+30 XP). Ждали 152 XP и оба урока — было 132 и
// пропавшая галочка первого: итог партии записывался из копии вкладки B,
// снятой при открытии, и стирал урок вкладки A.
test('a game finished in a stale tab keeps the lesson and XP earned in another tab', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let raw: string | null = null;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => raw,
    setItem: (_key: string, value: string) => { raw = value; },
  } });
  try {
    const now = new Date('2026-10-17T12:00:00');
    const deb: Debrief = {
      overall: 80, grade: 'B', economic: 80, relationship: 80, technique: 80, deal_text: 'ok',
      status: 'agreement', interests_found: 2, interests_total: 3, spin_stages: 2,
      objective_criteria: 1, empathy: 1, threats: 0, tradeoffs: 1, avg_arg: 60, tips: [],
    };
    const tabB: Profile = emptyProfile();              // вкладка B открыта при нуле
    const answer = (p: Profile, id: string, ok: boolean) =>
      recordExercise(p, 'foundations', id, 10, ok).profile;

    updateProfile((p) => markLessonDone(p, 'foundations', 1, now));
    updateProfile((p) => answer(p, 'fo-01', true));
    updateProfile((p) => answer(p, 'fo-02', true));
    updateProfile((p) => answer(p, 'fo-10', false));  // вкладка A: 2 из 3, +20
    const gain = applyDebrief(emptyProfile(), 'supplier', deb, now).xpGain;
    updateProfile((p) => applyDebrief(p, 'supplier', deb, now).profile, tabB);
    updateProfile((p) => markLessonDone(p, 'foundations', 2, now));
    for (const id of ['fo-03', 'fo-05', 'fo-06']) updateProfile((p) => answer(p, id, true));

    const final = loadProfile();
    assert.equal(final.xp, 20 + gain + 30);
    assert.deepEqual(final.course.foundations.lessons, [1, 2]);
    assert.equal(final.scenarios.supplier?.attempts, 1);
  } finally {
    saveProfile(emptyProfile());
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('App writes progress over the stored profile and follows other tabs', () => {
  // Сторож писателей App: изменение профиля идёт через changeProfile (свежая
  // копия из хранилища), а не поверх копии этой вкладки; запись другой
  // вкладки приходит событием storage.
  const src = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  for (const writer of ['applyDebrief', 'recordCampaignStage', 'recordExercise', 'resetCampaign', 'setDailyGoalTarget']) {
    assert.doesNotMatch(src, new RegExp(`${writer}\\(profileRef\\.current`), writer);
  }
  assert.match(src, /addEventListener\("storage"/);
});
