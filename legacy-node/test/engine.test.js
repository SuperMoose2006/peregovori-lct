'use strict';

/*
 * Lightweight, dependency-free test suite for the negotiation engine.
 * Run with: npm test   (or: node test/engine.test.js)
 *
 * These are behavioural invariants — the properties a negotiation trainer must
 * uphold — not brittle snapshot tests.
 */

const assert = require('assert');
const { analyze } = require('../engine/techniques');
const engine = require('../engine/engine');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}

// Drive a scenario through a list of utterances, return final debrief.
function play(scenarioId, lang, msgs) {
  const sess = engine.createSession(scenarioId, lang);
  let last;
  for (const text of msgs) {
    if (sess.state.status !== 'active') break;
    const a = analyze(text);
    sess.turn += 1;
    last = engine.applyMove(sess, a, text);
    if (sess.state.status === 'active' && sess.turn >= sess.maxTurns) {
      sess.state.status = 'breakdown';
      last.closed = true;
    }
  }
  return { sess, debrief: engine.scoreSession(sess) };
}

console.log('\nTechnique classifier');
test('detects SPIN problem question', () => {
  const a = analyze('С какими сложностями вы сталкиваетесь в процессе?');
  assert.strictEqual(a.spin, 'problem');
});
test('detects objective criteria', () => {
  const a = analyze('По рыночным данным это отраслевой стандарт.');
  assert(a.moves.includes('objective_criteria'));
});
test('detects BATNA', () => {
  const a = analyze('У нас есть другой поставщик по хорошей цене.');
  assert(a.moves.includes('batna'));
});
test('detects conditional trade-off', () => {
  const a = analyze('Если мы дадим годовой контракт, сможете подвинуться по цене?');
  assert(a.moves.includes('tradeoff'));
});
test('detects hostility and tanks arg quality', () => {
  const a = analyze('Это просто смешно и некомпетентно.');
  assert(a.moves.includes('hostile'));
  assert(a.argQuality < 20);
});
test('rewards rationale connectors in argumentation', () => {
  const withReason = analyze('Цена должна быть ниже, потому что это рыночный стандарт для объёма.');
  const without = analyze('Цена должна быть ниже.');
  assert(withReason.argQuality > without.argQuality);
});
test('detects English objective criteria', () => {
  const a = analyze('The market rate and benchmark data put this higher.');
  assert(a.moves.includes('objective_criteria'));
});

console.log('\nEngine dynamics');
test('empathy raises trust, lowers tension', () => {
  const sess = engine.createSession('supplier', 'ru');
  const before = { t: sess.state.trust, x: sess.state.tension };
  engine.applyMove(sess, analyze('Я понимаю вас и ценю вашу позицию.'), 'x');
  assert(sess.state.trust > before.t);
  assert(sess.state.tension < before.x);
});
test('threats raise tension, lower trust', () => {
  const sess = engine.createSession('supplier', 'ru');
  const before = { t: sess.state.trust, x: sess.state.tension };
  engine.applyMove(sess, analyze('У вас нет выбора, иначе мы уходим. Ультиматум.'), 'x');
  assert(sess.state.tension > before.x);
  assert(sess.state.trust < before.t);
});
test('SPIN questions uncover interests (info rises)', () => {
  const sess = engine.createSession('supplier', 'ru');
  engine.applyMove(sess, analyze('Расскажите, с какими сложностями по загрузке вы сталкиваетесь?'), 'x');
  assert(sess.state.info > 0);
});
test('opponent never crosses their reservation floor', () => {
  const { sess } = play('supplier', 'ru', Array(11).fill(
    'По рыночным данным цена ниже, потому что это стандарт. Если дадим годовой контракт, подвинетесь?'));
  const { byId } = require('../data/scenarios');
  const floor = byId('supplier').opponentReservation;
  assert(sess.state.offerOpp >= floor - 0.001, `offer ${sess.state.offerOpp} below floor ${floor}`);
});

console.log('\nScoring / outcomes');
test('principled play grades higher than aggressive play', () => {
  const good = play('supplier', 'ru', [
    'Здравствуйте! Расскажите, с какими сложностями по загрузке вы сталкиваетесь?',
    'Понимаю вас. А что для вас важнее всего в этой сделке и почему?',
    'Чем грозит нестабильная загрузка, сколько теряете, если так продолжится?',
    'По рыночным данным справедливая цена ниже, потому что это отраслевой стандарт.',
    'Если дадим годовой контракт и предоплату, сможете подвинуться до 86?',
    'Договорились на 86.',
  ]).debrief;
  const bad = play('supplier', 'ru', [
    'Ваша цена смешна и некомпетентна.',
    'У вас нет выбора, иначе уходим. Ультиматум.',
    'Требую немедленно снизить, иначе разрываем.',
  ]).debrief;
  assert(good.overall > bad.overall, `good=${good.overall} bad=${bad.overall}`);
  assert(good.grade === 'A' || good.grade === 'B');
});
test('higher-is-better scenario (salary) scores a good deal correctly', () => {
  const d = play('salary', 'en', [
    'How was this role band set, and what does the team need most?',
    'What matters most to you in closing this hire, and why?',
    'Market data for this role and my experience put the benchmark higher, which is what I anchor on.',
    'If we tie it to a 6-month KPI review in return, would you move on base to 230?',
    'Great, we have a deal at 225.',
  ]).debrief;
  assert(d.status === 'agreement');
  assert(d.economic > 60, `economic=${d.economic}`);
});
test('hostility drives a breakdown', () => {
  const { sess } = play('conflict', 'ru', [
    'Вы врёте и это абсурд.',
    'Вы некомпетентны, это позор.',
    'Смешно, вы издеваетесь.',
  ]);
  assert(sess.state.status === 'breakdown');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
