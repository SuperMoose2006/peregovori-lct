'use strict';

/*
 * techniques.js
 * -------------
 * Heuristic, bilingual (RU/EN) analyzer that classifies a free-text player
 * utterance into negotiation "moves" and scores its argumentation quality.
 *
 * This is deliberately transparent (rule-based) rather than a black-box model:
 *  - It runs offline, deterministically, and is auditable for a training tool.
 *  - Every detection can be surfaced back to the learner ("you used objective
 *    criteria here") which is the whole point of a coaching simulator.
 *
 * Grounded in three frameworks the task references:
 *  - Harvard principled negotiation (interests over positions, objective
 *    criteria, separate people from problem, invent options for mutual gain).
 *  - SPIN questioning (Situation / Problem / Implication / Need-payoff).
 *  - BATNA (leverage from your best alternative).
 */

const norm = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s%.,?!\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const has = (t, arr) => arr.some((w) => t.includes(w));
const countMatches = (t, arr) => arr.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);

// ---- Lexicons (RU + EN) -----------------------------------------------------

const LEX = {
  question: ['?'],
  // SPIN — Situation: facts about their current state
  spinSituation: [
    'как сейчас', 'как у вас', 'какой у вас', 'сколько', 'как часто', 'кто у вас',
    'как устроен', 'расскажите о', 'что вы используете', 'какой процесс',
    'how do you currently', 'how many', 'how often', 'what is your current',
    'who handles', 'tell me about your', 'what process',
  ],
  // SPIN — Problem: difficulties / dissatisfaction
  spinProblem: [
    'сложно', 'проблема', 'мешает', 'не устраивает', 'трудно', 'узкое место',
    'с какими сложностями', 'что не устраивает', 'что вас беспокоит', 'болит',
    'difficult', 'problem', 'challenge', 'frustrat', 'bottleneck', 'pain',
    'what concerns you', 'struggl',
  ],
  // SPIN — Implication: consequences of the problem
  spinImplication: [
    'к чему это приводит', 'чем это грозит', 'сколько вы теряете', 'если так продолжится',
    'как это влияет', 'во что обходится', 'какие последствия',
    'what happens if', 'how does that affect', 'what does that cost', 'impact of',
    'consequence', 'if this continues',
  ],
  // SPIN — Need-payoff: value of solving it
  spinNeedPayoff: [
    'было бы полезно', 'что если бы', 'насколько важно', 'помогло бы вам',
    'какая ценность', 'если бы мы решили', 'это бы вам дало',
    'would it help', 'how valuable', 'what if you could', 'would that be useful',
    'benefit of solving',
  ],
  // Harvard: interests (why, not what)
  interestsProbe: [
    'почему для вас', 'почему именно', 'почему это', 'что для вас важн', 'что важнее',
    'зачем вам', 'какая цель', 'что стоит за', 'что вами движет', 'ради чего',
    'ваш интерес', 'что вы хотите получить', 'что для вас критично', 'что вас беспокоит',
    'why is that important', 'why exactly', 'what matters to you', 'what matters most',
    'what are you trying to', 'your underlying', 'the real reason', 'what you care about',
    'what is important to you',
  ],
  // Empathy / active listening / acknowledgement
  acknowledge: [
    'понимаю', 'я вас слышу', 'вы правы', 'справедливо', 'логично', 'разделяю',
    'ценю', 'спасибо, что', 'правильно ли я понял', 'если я верно понял',
    'то есть вы', 'звучит так', 'я вижу, что',
    'i understand', 'i hear you', 'that makes sense', 'fair point', 'i appreciate',
    'if i understand', 'so you are saying', 'i can see that', 'let me make sure',
  ],
  // Harvard: objective criteria / legitimacy
  objectiveCriteria: [
    'рыночная цена', 'по рынку', 'стандарт', 'бенчмарк', 'независимая оценка',
    'данные показывают', 'исследование', 'прайс', 'отраслев', 'практика рынка',
    'объективн', 'прецедент', 'регламент', 'индекс', 'котировк', 'официальн',
    'market rate', 'market price', 'benchmark', 'industry standard', 'the data',
    'research shows', 'independent', 'objective', 'precedent', 'comparable',
  ],
  // BATNA / alternatives / leverage
  batna: [
    'другой поставщик', 'другое предложение', 'альтернатив', 'конкурент', 'у нас есть варианты',
    'можем уйти', 'рассматриваем других', 'запасной вариант', 'без сделки', 'найдем другого',
    'other supplier', 'another offer', 'alternative', 'competitor', 'we have options',
    'walk away', 'elsewhere', 'other vendors', 'fallback', 'best alternative',
  ],
  // Threat / pressure / ultimatum
  threat: [
    'ультиматум', 'иначе', 'в последний раз', 'мое последнее слово', 'либо', 'или мы уходим',
    'вы обязаны', 'у вас нет выбора', 'немедленно', 'требую', 'иначе разрываем',
    'это неприемлемо и точка', 'take it or leave it', 'final offer', 'or else',
    'you have no choice', 'i demand', 'right now or', 'non-negotiable',
  ],
  // Hostility / personal attack
  hostile: [
    'вы не понимаете', 'это глупо', 'смешно', 'вы обманываете', 'некомпетентн',
    'вы врете', 'абсурд', 'вы издеваетесь', 'позор',
    'ridiculous', 'you people', 'incompetent', 'you are lying', 'this is a joke',
    'absurd', 'stupid',
  ],
  // Concession language
  concession: [
    'готовы уступить', 'можем снизить', 'пойдем навстречу', 'сделаем скидку', 'уступим',
    'согласны на', 'ок, давайте', 'можем добавить', 'идем на',
    'we can lower', 'we can offer', 'we can come down', 'i can give you', 'concede',
    'meet you', 'discount', 'we can throw in',
  ],
  // Trade-off / logrolling / package (value creation) — conditional "give-to-get"
  tradeoff: [
    'если вы, то мы', 'взамен', 'в обмен', 'при условии', 'пакет', 'если добавите',
    'давайте свяжем', 'обменяем', 'тогда мы', 'в ответ на', 'если мы дадим', 'если мы',
    'если пойдём навстречу', 'сможете подвинуться', 'сможете ли вы', 'готовы ли вы взамен',
    'if you, then we', 'in exchange', 'in return', 'provided that', 'package',
    'we could trade', 'link', 'as long as you', 'if we give', 'if we offer you',
    'can you move on', 'would you move', 'then we would', 'in exchange for',
  ],
  // Anchoring / firm opening position
  anchor: [
    'наша цена', 'мы предлагаем', 'исходная', 'стартуем с', 'позиция такова',
    'we propose', 'our price is', 'starting point', 'our position is', 'we are asking',
  ],
  // Rationale / argumentation connectors
  rationale: [
    'потому что', 'так как', 'поскольку', 'причина в том', 'это позволит', 'за счет',
    'because', 'since', 'the reason', 'this allows', 'so that', 'which means',
  ],
  // Rapport / small talk
  rapport: [
    'рад встрече', 'приятно познакомиться', 'как ваши дела', 'спасибо за встречу',
    'nice to meet', 'good to see you', 'thanks for taking the time', 'how are you',
  ],
  // Accept / close the deal
  accept: [
    'по рукам', 'договорились', 'принимаю', 'мы согласны', 'заключаем', 'подписываем',
    'меня устраивает', 'сделка', 'we have a deal', 'i accept', 'we agree', 'done deal',
    'let us sign', 'i can live with', 'that works for us',
  ],
};

// A monetary figure in the message ("we can do 85", "цена 92")
const MONEY_RE = /(?:^|[^\d])(\d{1,3}(?:[ .,]\d{3})*(?:[.,]\d+)?)(?:\s*(?:%|руб|k|к|тыс|тысяч|млн|usd|\$|€|eur))?/i;

function extractNumber(text) {
  const m = text.match(MONEY_RE);
  if (!m) return null;
  const raw = m[1].replace(/[ ]/g, '').replace(',', '.');
  const val = parseFloat(raw);
  return Number.isFinite(val) ? val : null;
}

/**
 * analyze(rawText) -> {
 *   moves: string[]           // detected move tags, most salient first
 *   primary: string           // single dominant move
 *   number: number|null       // any figure mentioned
 *   argQuality: 0..100         // argumentation richness
 *   spin: string|null          // which SPIN stage, if any
 *   tags: [{key,label}]        // human-readable technique badges
 *   flags: {hostile, threat, question}
 * }
 */
function analyze(rawText) {
  const t = norm(rawText);
  const moves = new Set();
  const tags = [];
  const addTag = (key, label) => tags.push({ key, label });

  const isQuestion = t.includes('?');

  // SPIN detection (order = specificity)
  let spin = null;
  if (has(t, LEX.spinNeedPayoff)) { spin = 'need-payoff'; moves.add('spin_needpayoff'); addTag('spin', 'SPIN · Need-payoff'); }
  else if (has(t, LEX.spinImplication)) { spin = 'implication'; moves.add('spin_implication'); addTag('spin', 'SPIN · Implication'); }
  else if (has(t, LEX.spinProblem)) { spin = 'problem'; moves.add('spin_problem'); addTag('spin', 'SPIN · Problem'); }
  else if (has(t, LEX.spinSituation)) { spin = 'situation'; moves.add('spin_situation'); addTag('spin', 'SPIN · Situation'); }

  if (has(t, LEX.interestsProbe)) { moves.add('interests_probe'); addTag('interests', 'Probing interests'); }
  if (has(t, LEX.acknowledge)) { moves.add('acknowledge'); addTag('empathy', 'Active listening'); }
  if (has(t, LEX.objectiveCriteria)) { moves.add('objective_criteria'); addTag('criteria', 'Objective criteria'); }
  if (has(t, LEX.batna)) { moves.add('batna'); addTag('batna', 'BATNA / leverage'); }
  if (has(t, LEX.tradeoff)) { moves.add('tradeoff'); addTag('tradeoff', 'Trade-off (value creation)'); }
  if (has(t, LEX.threat)) { moves.add('threat'); addTag('threat', 'Pressure / ultimatum'); }
  if (has(t, LEX.hostile)) { moves.add('hostile'); addTag('hostile', 'Hostile tone'); }
  if (has(t, LEX.concession)) { moves.add('concession'); addTag('concession', 'Concession'); }
  if (has(t, LEX.anchor)) { moves.add('anchor'); addTag('anchor', 'Anchoring'); }
  if (has(t, LEX.accept)) { moves.add('accept'); addTag('accept', 'Closing / accept'); }
  if (has(t, LEX.rapport)) { moves.add('rapport'); addTag('rapport', 'Rapport'); }

  const number = extractNumber(t);
  if (number !== null && !moves.has('accept')) {
    // A bare number is an offer/counter unless it's clearly a question stat.
    if (!isQuestion) { moves.add('offer'); addTag('offer', 'Offer / number'); }
  }

  if (isQuestion && spin === null && !moves.has('interests_probe')) {
    moves.add('open_question');
    addTag('question', 'Open question');
  }

  // Fallback: plain statement
  if (moves.size === 0) moves.add('statement');

  // --- Argumentation quality -------------------------------------------------
  // Rewards: rationale connectors, objective grounding, questions, right length,
  // specificity (numbers). Penalizes: hostility, empty ultimatums, one-word lines.
  const words = t.split(' ').filter(Boolean).length;
  let arg = 20;
  arg += Math.min(20, countMatches(t, LEX.rationale) * 12);
  if (moves.has('objective_criteria')) arg += 18;
  if (spin) arg += 14;
  if (moves.has('interests_probe')) arg += 12;
  if (moves.has('acknowledge')) arg += 10;
  if (moves.has('tradeoff')) arg += 10;
  if (number !== null) arg += 6;
  if (words >= 12 && words <= 60) arg += 8; // substantive but not rambling
  if (words < 4) arg -= 15;
  if (moves.has('hostile')) arg -= 30;
  if (moves.has('threat') && !moves.has('objective_criteria') && !moves.has('batna')) arg -= 12;
  arg = Math.max(0, Math.min(100, Math.round(arg)));

  // Primary move — priority ordering for opponent reaction.
  const priority = [
    'accept', 'hostile', 'threat', 'tradeoff', 'objective_criteria', 'batna',
    'interests_probe', 'spin_needpayoff', 'spin_implication', 'spin_problem',
    'spin_situation', 'acknowledge', 'concession', 'offer', 'anchor',
    'open_question', 'rapport', 'statement',
  ];
  const primary = priority.find((p) => moves.has(p)) || 'statement';

  return {
    moves: [...moves],
    primary,
    number,
    argQuality: arg,
    spin,
    tags,
    flags: {
      hostile: moves.has('hostile'),
      threat: moves.has('threat'),
      question: isQuestion,
    },
    words,
  };
}

module.exports = { analyze, norm };
