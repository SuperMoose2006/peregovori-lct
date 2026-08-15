'use strict';

/*
 * engine.js
 * ---------
 * The deterministic negotiation engine. It owns game state, decides how the AI
 * counterpart reacts to each player move, moves the price/terms inside the ZOPA,
 * and produces a coaching debrief at the end.
 *
 * Design intent: the SAME concession the player is chasing can be earned two
 * ways — the productive way (uncover interests, use objective criteria, trade
 * across issues, keep trust high) or the destructive way (threats, hostility).
 * The engine rewards the former with better economics AND a better relationship,
 * and punishes the latter with tension that freezes concessions. That's what
 * makes the outcome depend on strategy and wording, per the task.
 */

const { analyze } = require('./techniques');
const { byId } = require('../data/scenarios');

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

function createSession(scenarioId, lang = 'ru') {
  const sc = byId(scenarioId);
  if (!sc) throw new Error('unknown scenario');
  const lowerBetter = sc.headline.dir === 'lower_is_better';

  return {
    id: 'sess_' + Math.random().toString(36).slice(2, 10),
    scenarioId,
    lang,
    lowerBetter,
    createdTurn: 0,
    maxTurns: 12,
    turn: 0,
    state: {
      trust: 40,
      tension: 25,
      info: 0, // % of hidden interests uncovered
      leverage: sc.playerBatna.strength * 0.4, // grows as you cite criteria/BATNA well
      offerOpp: sc.opponentOpen, // opponent's current number on the table
      offerPlayer: null, // player's stated number
      interestsFound: [], // indices of hiddenInterests uncovered
      tradeoffsUsed: [],
      deal: null, // final agreed number when closed
      status: 'active', // active | agreement | breakdown
    },
    // running tallies for the debrief
    metrics: {
      moveCounts: {},
      argQualitySum: 0,
      argQualityN: 0,
      threats: 0,
      hostiles: 0,
      empathy: 0,
      objectiveCriteria: 0,
      spinStages: new Set(),
      interestProbes: 0,
    },
    log: [],
  };
}

// How willing the opponent is, right now, to move toward the player (0..1).
function flexibility(sess) {
  const s = sess.state;
  const trustPart = s.trust / 100; // trust unlocks movement
  const infoPart = s.info / 100; // knowing their interests unlocks value
  const leveragePart = clamp(s.leverage) / 100;
  const tensionPenalty = s.tension / 100; // tension freezes them
  const raw = 0.45 * trustPart + 0.3 * infoPart + 0.25 * leveragePart - 0.5 * tensionPenalty;
  return clamp(raw, 0, 1);
}

// Move opponent's number a fraction of the remaining distance to their floor.
function concede(sess, fraction) {
  const sc = byId(sess.scenarioId);
  const s = sess.state;
  const floor = sc.opponentReservation;
  const dist = floor - s.offerOpp; // signed; toward player
  s.offerOpp = Math.round((s.offerOpp + dist * fraction) * 100) / 100;
}

/*
 * applyMove — the reactive core. Given the analyzed player utterance, update
 * meters, possibly move the opponent's offer, and choose a reply.
 * Returns a "reaction" descriptor the caller turns into dialogue + UI deltas.
 */
function applyMove(sess, analysis, rawText) {
  const sc = byId(sess.scenarioId);
  const s = sess.state;
  const m = sess.metrics;
  const style = sc.counterpart.style;

  // Snapshot for delta reporting.
  const before = { trust: s.trust, tension: s.tension, info: s.info, leverage: s.leverage, offerOpp: s.offerOpp };

  // Track metrics.
  m.moveCounts[analysis.primary] = (m.moveCounts[analysis.primary] || 0) + 1;
  m.argQualitySum += analysis.argQuality;
  m.argQualityN += 1;
  if (analysis.spin) m.spinStages.add(analysis.spin);

  const has = (k) => analysis.moves.includes(k);
  let reaction = 'neutral';
  let concessionFraction = 0;

  // --- Empathy / active listening: always cools tension, builds trust. -------
  if (has('acknowledge')) {
    s.trust = clamp(s.trust + 8);
    s.tension = clamp(s.tension - 10);
    m.empathy++;
    reaction = 'warmed';
  }

  // --- SPIN & interest probing: uncover hidden interests. --------------------
  if (analysis.spin || has('interests_probe')) {
    const gainBase = analysis.spin === 'implication' || analysis.spin === 'need-payoff' ? 22 : 14;
    // Deeper SPIN + genuine interest probing reveals more.
    const gain = gainBase + (has('interests_probe') ? 10 : 0);
    // Reveal a concrete interest if any remain.
    const total = sc.hiddenInterests[sess.lang].length;
    if (s.interestsFound.length < total && s.trust > 30) {
      s.interestsFound.push(s.interestsFound.length);
    }
    s.info = clamp(s.info + gain);
    s.trust = clamp(s.trust + 4);
    s.tension = clamp(s.tension - 3);
    if (has('interests_probe')) m.interestProbes++;
    reaction = reaction === 'warmed' ? 'warmed' : 'opened_up';
  }

  // --- Objective criteria: legitimate leverage. ------------------------------
  if (has('objective_criteria')) {
    s.leverage = clamp(s.leverage + 16);
    s.trust = clamp(s.trust + 3);
    m.objectiveCriteria++;
    // Analytical counterparts respect this the most.
    if (style === 'analytical') s.leverage = clamp(s.leverage + 6);
    reaction = 'persuaded';
  }

  // --- BATNA / alternatives: leverage, but risky. ----------------------------
  if (has('batna')) {
    const backed = has('objective_criteria') || analysis.argQuality > 55;
    s.leverage = clamp(s.leverage + (backed ? 18 : 10));
    // Naked BATNA raises tension; well-framed BATNA less so.
    s.tension = clamp(s.tension + (backed ? 4 : 14));
    if (style === 'relationship') s.tension = clamp(s.tension + 6); // dislikes threats-by-proxy
    reaction = 'pressured';
  }

  // --- Trade-off / logrolling: value creation. -------------------------------
  if (has('tradeoff')) {
    s.trust = clamp(s.trust + 6);
    s.tension = clamp(s.tension - 4);
    // Trade-offs are far more effective once interests are known.
    const bonus = 0.12 + 0.18 * (s.info / 100);
    concessionFraction += bonus;
    const tset = sc.tradeoffs[sess.lang];
    if (s.tradeoffsUsed.length < tset.length) s.tradeoffsUsed.push(s.tradeoffsUsed.length);
    reaction = 'collaborated';
  }

  // --- Threat / ultimatum: leverage up, relationship down. -------------------
  if (has('threat')) {
    m.threats++;
    s.tension = clamp(s.tension + 22);
    s.trust = clamp(s.trust - 14);
    s.leverage = clamp(s.leverage + 6);
    if (style === 'tough') s.tension = clamp(s.tension + 8); // tough counterpart digs in
    reaction = 'hardened';
  }

  // --- Hostility: pure damage. -----------------------------------------------
  if (has('hostile')) {
    m.hostiles++;
    s.tension = clamp(s.tension + 26);
    s.trust = clamp(s.trust - 22);
    reaction = 'offended';
  }

  // --- Rapport / small talk early is fine. -----------------------------------
  if (has('rapport')) {
    s.trust = clamp(s.trust + 5);
    s.tension = clamp(s.tension - 4);
  }

  // --- Player states an offer number (incl. while closing). ------------------
  if (analysis.number !== null && (has('offer') || has('anchor') || has('concession') || has('accept') || has('tradeoff'))) {
    s.offerPlayer = analysis.number;
  }

  // --- Compute concession from productive pressure. --------------------------
  // Base movement scales with current flexibility; good technique adds on top.
  // Tuned so that a strong principled game (uncover interests → objective
  // criteria → trade-offs, trust up / tension low) reaches the ZOPA in ~6-8
  // turns, while pressure-heavy or shallow play stalls short of it.
  const flex = flexibility(sess);
  concessionFraction += 0.10 + 0.34 * flex;
  if (has('objective_criteria')) concessionFraction += 0.12;
  if (analysis.spin || has('interests_probe')) concessionFraction += 0.05;
  if (has('acknowledge')) concessionFraction += 0.03;
  // Threats can force a small move but only when leverage is real and tension not maxed.
  if (has('threat') && s.leverage > 45 && s.tension < 80) concessionFraction += 0.06;
  // A named counter-offer that sits inside the ZOPA pulls the opponent toward it.
  if (s.offerPlayer !== null) {
    const gap = sess.lowerBetter ? s.offerOpp - s.offerPlayer : s.offerPlayer - s.offerOpp;
    if (gap > 0) concessionFraction += Math.min(0.08, gap * 0.01);
  }
  // High tension freezes everything.
  if (s.tension > 75) concessionFraction *= 0.25;
  else if (s.tension > 55) concessionFraction *= 0.6;
  concessionFraction = clamp(concessionFraction, 0, 0.7);

  if (concessionFraction > 0.01) concede(sess, concessionFraction);

  // --- Closing: player tries to accept / lock a deal. ------------------------
  let closed = false;
  if (has('accept')) {
    // Deal closes between the opponent's current offer and the player's number,
    // weighted by flexibility: a cooperative opponent meets you closer to your
    // number; a guarded one settles near their own. Never past their floor.
    let meeting;
    if (s.offerPlayer !== null) {
      const w = 0.3 + 0.45 * flex; // how far toward the player's number they move
      meeting = s.offerOpp + (s.offerPlayer - s.offerOpp) * w;
      // Clamp to the opponent's floor — they never cross their reservation.
      if (sess.lowerBetter) meeting = Math.max(meeting, sc.opponentReservation);
      else meeting = Math.min(meeting, sc.opponentReservation);
      meeting = Math.round(meeting * 100) / 100;
    } else {
      meeting = s.offerOpp; // player accepts what's on the table
    }
    if (acceptable(sess, meeting)) {
      s.deal = meeting;
      s.status = 'agreement';
      closed = true;
    } else {
      reaction = 'not_yet';
    }
  }

  // --- Breakdown check. ------------------------------------------------------
  if (s.tension >= 100 || s.trust <= 3) {
    s.status = 'breakdown';
    closed = true;
    reaction = 'walked_out';
  }

  const deltas = {
    trust: s.trust - before.trust,
    tension: s.tension - before.tension,
    info: s.info - before.info,
    leverage: s.leverage - before.leverage,
    offerOpp: Math.round((s.offerOpp - before.offerOpp) * 100) / 100,
  };

  return { reaction, deltas, closed, concessionFraction, analysis };
}

// Is a proposed number acceptable to the opponent given their floor?
function acceptable(sess, number) {
  const sc = byId(sess.scenarioId);
  if (sess.lowerBetter) return number >= sc.opponentReservation - 0.001;
  return number <= sc.opponentReservation + 0.001;
}

// -----------------------------------------------------------------------------
// Dialogue generation (templated, in-character). An optional LLM adapter can
// override this; the templates guarantee the app works fully offline.
// -----------------------------------------------------------------------------

const LINES = {
  ru: {
    warmed: [
      'Приятно, что вы это понимаете. Тогда давайте по делу.',
      'Спасибо, редко кто слышит нашу сторону. Продолжим.',
    ],
    opened_up: [
      'Хороший вопрос… Честно говоря, для нас критично {interest}.',
      'Раз уж вы спросили — нас правда беспокоит {interest}.',
    ],
    persuaded: [
      'С такими данными спорить сложно. Могу подвинуться — сейчас {offer}{unit}.',
      'Ладно, цифры говорят сами за себя. Пусть будет {offer}{unit}.',
    ],
    pressured: [
      'Слышал про ваши альтернативы. Но давайте без ультиматумов — {offer}{unit}.',
      'Понимаю, что у вас есть варианты. Готов обсуждать, {offer}{unit}.',
    ],
    collaborated: [
      'Вот это уже интересно. Если так, то {offer}{unit} — реально.',
      'Такой размен нам подходит. Тогда {offer}{unit}.',
    ],
    hardened: [
      'Давление здесь не поможет. Моя позиция прежняя — {offer}{unit}.',
      'В таком тоне мне сложно двигаться. Остаюсь на {offer}{unit}.',
    ],
    offended: [
      'Я бы попросил без перехода на личности.',
      'Так мы точно ни о чём не договоримся.',
    ],
    neutral: [
      'Хорошо, я вас понял. Пока моё предложение — {offer}{unit}.',
      'Принято. На данный момент — {offer}{unit}.',
    ],
    not_yet: [
      'Пока рано пожимать руки — {offer}{unit} моё текущее предложение.',
      'Ещё не сходимся. Сейчас у меня {offer}{unit}.',
    ],
    walked_out: [
      'Знаете, наверное, нам стоит взять паузу. На этом остановимся.',
      'Боюсь, продолжать в таком ключе бессмысленно. Всего доброго.',
    ],
    agreement: [
      'По рукам! Договорились на {deal}{unit}. Рад иметь с вами дело.',
      'Отлично, фиксируем {deal}{unit}. Было приятно вести переговоры.',
    ],
  },
  en: {
    warmed: [
      "I appreciate that you get it. Let's get to business.",
      'Thanks — few people hear our side. Go on.',
    ],
    opened_up: [
      'Good question… Honestly, what matters to us is {interest}.',
      "Since you ask — we really care about {interest}.",
    ],
    persuaded: [
      "Hard to argue with those numbers. I can move — {offer}{unit} now.",
      "Fair, the data speaks for itself. Let's say {offer}{unit}.",
    ],
    pressured: [
      "I hear you have alternatives. But no ultimatums — {offer}{unit}.",
      "I know you have options. Happy to talk, {offer}{unit}.",
    ],
    collaborated: [
      "Now that's interesting. On those terms, {offer}{unit} is doable.",
      "That trade works for us. Then {offer}{unit}.",
    ],
    hardened: [
      "Pressure won't help here. My position stands — {offer}{unit}.",
      "I can't move in that tone. Staying at {offer}{unit}.",
    ],
    offended: [
      "I'd ask you to keep this professional.",
      "This isn't going anywhere like that.",
    ],
    neutral: [
      "Understood. For now my offer is {offer}{unit}.",
      "Noted. At this point — {offer}{unit}.",
    ],
    not_yet: [
      "Too early to shake hands — {offer}{unit} is where I am.",
      "We're not there yet. Right now I'm at {offer}{unit}.",
    ],
    walked_out: [
      "You know, maybe we should take a break. Let's stop here.",
      "I'm afraid there's no point continuing like this. Good day.",
    ],
    agreement: [
      "Deal! {deal}{unit} it is. A pleasure doing business.",
      "Great, we lock {deal}{unit}. Good negotiating with you.",
    ],
  },
};

function pick(arr, seed) {
  return arr[seed % arr.length];
}

function renderLine(sess, reaction, closed) {
  const sc = byId(sess.scenarioId);
  const s = sess.state;
  const lang = sess.lang;
  const unit = sc.headline.unit[lang];
  const bank = LINES[lang];
  let key = reaction;
  if (closed && s.status === 'agreement') key = 'agreement';
  if (closed && s.status === 'breakdown') key = 'walked_out';
  const arr = bank[key] || bank.neutral;
  let line = pick(arr, sess.turn + s.interestsFound.length);
  const interestList = sc.hiddenInterests[lang];
  const lastInterest = s.interestsFound.length
    ? interestList[s.interestsFound[s.interestsFound.length - 1]]
    : interestList[0];
  return line
    .replace('{offer}', s.offerOpp)
    .replace('{deal}', s.deal != null ? s.deal : s.offerOpp)
    .replace('{unit}', unit)
    .replace('{interest}', (lastInterest || '').toLowerCase());
}

// -----------------------------------------------------------------------------
// Scoring & debrief
// -----------------------------------------------------------------------------

function scoreSession(sess) {
  const sc = byId(sess.scenarioId);
  const s = sess.state;
  const m = sess.metrics;
  const lang = sess.lang;

  // 1) Economic score: where did we land inside the ZOPA?
  let economic = 0;
  let dealText;
  const unit = sc.headline.unit[lang];
  if (s.status === 'agreement' && s.deal != null) {
    // Map deal between player's reservation (0) and player's target (100).
    const t = sc.playerTarget, r = sc.playerReservation;
    let ratio = (s.deal - r) / (t - r); // works for both directions by sign of (t-r)
    economic = clamp(Math.round(ratio * 100));
    dealText = `${s.deal}${unit}`;
  } else if (s.status === 'breakdown') {
    economic = 0;
    dealText = lang === 'ru' ? 'Сделка сорвалась' : 'Deal broke down';
  } else {
    // No deal reached in time — score the standing gap.
    economic = 10;
    dealText = lang === 'ru' ? 'Без соглашения' : 'No agreement';
  }

  // 2) Relationship score.
  const relationship = clamp(Math.round(s.trust - s.tension * 0.6 + 30));

  // 3) Technique score — variety and appropriateness.
  const spinCount = m.spinStages.size;
  const avgArg = m.argQualityN ? m.argQualitySum / m.argQualityN : 0;
  let technique = 0;
  technique += Math.min(24, spinCount * 8); // up to 3 SPIN stages
  technique += m.objectiveCriteria > 0 ? 16 : 0;
  technique += m.interestProbes > 0 ? 14 : 0;
  technique += s.interestsFound.length >= sc.hiddenInterests[lang].length ? 12 : s.interestsFound.length * 4;
  technique += s.tradeoffsUsed.length > 0 ? 12 : 0;
  technique += m.empathy > 0 ? 8 : 0;
  technique += Math.round((avgArg / 100) * 14);
  technique -= m.hostiles * 12;
  technique -= Math.max(0, m.threats - 1) * 6; // one firm push ok, spamming bad
  technique = clamp(Math.round(technique));

  const overall = clamp(Math.round(0.4 * economic + 0.25 * relationship + 0.35 * technique));

  // Letter grade.
  const grade = overall >= 85 ? 'A' : overall >= 70 ? 'B' : overall >= 55 ? 'C' : overall >= 40 ? 'D' : 'F';

  // Coaching tips — what to do differently.
  const tips = [];
  const T = (ru, en) => tips.push(lang === 'ru' ? ru : en);
  if (spinCount < 2) T('Задавайте больше вопросов по SPIN (Проблема → Последствия), чтобы вскрыть боль второй стороны.', 'Ask more SPIN questions (Problem → Implication) to surface the other side\'s pain.');
  if (m.objectiveCriteria === 0) T('Опирайтесь на объективные критерии (рыночные данные, стандарты) — это легитимный рычаг по Гарвардскому методу.', 'Anchor on objective criteria (market data, standards) — legitimate leverage per the Harvard method.');
  if (s.interestsFound.length < sc.hiddenInterests[lang].length) T('Вы вскрыли не все скрытые интересы. За позициями всегда стоят интересы — ищите «почему».', 'You didn\'t surface every hidden interest. Behind positions lie interests — dig for the "why".');
  if (m.interestProbes === 0) T('Переходите от позиций к интересам: спрашивайте, что и почему важно для оппонента.', 'Move from positions to interests: ask what matters to them and why.');
  if (s.tradeoffsUsed.length === 0) T('Создавайте ценность разменом по нескольким вопросам (логроллинг), а не только торгом по цене.', 'Create value by trading across issues (logrolling), not just haggling on price.');
  if (m.empathy === 0) T('Используйте активное слушание — отражайте слова оппонента, чтобы снизить напряжение.', 'Use active listening — paraphrase them to lower tension.');
  if (m.threats > 1 || m.hostiles > 0) T('Меньше давления и перехода на личности: напряжение замораживает уступки.', 'Less pressure and personal attacks: tension freezes concessions.');
  if (sc.playerBatna.strength > 55 && (m.moveCounts['batna'] || 0) === 0) T('У вас была сильная BATNA — стоило её аккуратно упомянуть как рычаг.', 'You had a strong BATNA — worth citing it carefully as leverage.');
  if (tips.length === 0) T('Отличная работа — чистое применение принципиальных переговоров.', 'Excellent — a clean application of principled negotiation.');

  return {
    overall, grade, economic, relationship, technique,
    dealText,
    status: s.status,
    interestsFound: s.interestsFound.length,
    interestsTotal: sc.hiddenInterests[lang].length,
    spinStages: spinCount,
    objectiveCriteria: m.objectiveCriteria,
    empathy: m.empathy,
    threats: m.threats,
    hostiles: m.hostiles,
    tradeoffs: s.tradeoffsUsed.length,
    avgArg: Math.round(avgArg),
    tips,
  };
}

module.exports = {
  createSession, applyMove, renderLine, scoreSession, flexibility, analyze,
};
