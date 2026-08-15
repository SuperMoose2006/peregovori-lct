'use strict';

/*
 * llm.js
 * ------
 * OPTIONAL opponent-dialogue generator. If ANTHROPIC_API_KEY is present, the
 * counterpart's reply is rephrased in-character by Claude for extra realism.
 * The deterministic engine still owns all game state (meters, offers, scoring),
 * so this is purely cosmetic flavor and never changes the outcome.
 *
 * With no key (or on any error) this returns null and the caller falls back to
 * the engine's templated lines — the simulator is fully functional offline.
 *
 * Uses only Node's built-in fetch (Node 18+); zero external dependencies.
 */

const { byId } = require('../data/scenarios');

const MODEL = process.env.NEGO_MODEL || 'claude-sonnet-5';

async function maybeLLMLine(sess, analysis, result, fallbackLine) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || typeof fetch !== 'function') return null;

  const sc = byId(sess.scenarioId);
  const lang = sess.lang;
  const s = sess.state;
  const name = sc.counterpart.name[lang];
  const persona = sc.counterpart.persona[lang];
  const unit = sc.headline.unit[lang];

  // We tell the model the exact game-state facts it must respect so the flavor
  // text never contradicts the engine (e.g. it must quote offerOpp, not invent).
  const sys = lang === 'ru'
    ? `Ты играешь роль оппонента на деловых переговорах. Персонаж: ${name} — ${persona}.
Отвечай ОДНОЙ короткой репликой (1-2 предложения) на языке пользователя, строго в характере.
Обязательные факты, которым нельзя противоречить:
- Твоё текущее предложение на столе: ${s.offerOpp}${unit}.
- Твой настрой сейчас: ${describeMood(result.reaction, lang)}.
- Статус сделки: ${s.status === 'agreement' ? 'СОГЛАСИЕ достигнуто' : s.status === 'breakdown' ? 'переговоры сорваны' : 'идут'}.
Не раскрывай свои скрытые интересы напрямую, если игрок их не выведал вопросами. Не выходи из роли, без пояснений и markdown.`
    : `You role-play the counterpart in a business negotiation. Character: ${name} — ${persona}.
Reply with ONE short line (1-2 sentences) in the user's language, strictly in character.
Hard facts you must not contradict:
- Your current offer on the table: ${s.offerOpp}${unit}.
- Your current mood: ${describeMood(result.reaction, lang)}.
- Deal status: ${s.status === 'agreement' ? 'AGREEMENT reached' : s.status === 'breakdown' ? 'talks broke down' : 'ongoing'}.
Do not reveal your hidden interests unless the player drew them out with questions. Stay in role, no explanations or markdown.`;

  const lastPlayer = [...sess.log].reverse().find((l) => l.role === 'player');
  const userMsg = (lang === 'ru' ? 'Реплика игрока: ' : 'Player said: ') +
    JSON.stringify(lastPlayerText(sess)) +
    (lang === 'ru' ? `\nТвоя реакция по движку (ориентир): "${fallbackLine}"` : `\nEngine reference reaction: "${fallbackLine}"`);

  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 8000);
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 120,
        system: sys,
        messages: [{ role: 'user', content: userMsg }],
      }),
    });
    clearTimeout(to);
    if (!resp.ok) return null;
    const data = await resp.json();
    const text = (data.content || []).map((b) => b.text || '').join('').trim();
    return text || null;
  } catch (_) {
    return null;
  }
}

function lastPlayerText(sess) {
  const p = [...sess.log].reverse().find((l) => l.role === 'player');
  return p ? p.text : '';
}

function describeMood(reaction, lang) {
  const map = {
    ru: {
      warmed: 'потеплел, чувствует уважение', opened_up: 'приоткрылся, делится болью',
      persuaded: 'убеждён данными, готов подвинуться', pressured: 'под давлением, насторожен',
      collaborated: 'настроен на сотрудничество', hardened: 'ожесточился от давления',
      offended: 'обижен резким тоном', neutral: 'нейтрален', not_yet: 'ещё не готов пожать руки',
      walked_out: 'встаёт из-за стола',
    },
    en: {
      warmed: 'warmed, feels respected', opened_up: 'opening up, sharing pain',
      persuaded: 'persuaded by data, ready to move', pressured: 'under pressure, wary',
      collaborated: 'in a collaborative mood', hardened: 'hardened by pressure',
      offended: 'offended by a harsh tone', neutral: 'neutral', not_yet: 'not ready to shake hands',
      walked_out: 'getting up to leave',
    },
  };
  return (map[lang] && map[lang][reaction]) || (lang === 'ru' ? 'нейтрален' : 'neutral');
}

module.exports = { maybeLLMLine };
