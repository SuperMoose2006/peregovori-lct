import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyProfile, loadProfile, markLessonDone, recordExercise, saveProfile } from '../src/lib/progress';

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
