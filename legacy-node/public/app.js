/* app.js — SPA controller for the negotiation simulator. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = {
    lang: 'ru',
    sessionId: null,
    scenario: null,
    busy: false,
    finished: false,
  };

  const t = (k) => (window.I18N[state.lang][k] ?? k);

  // ---------- i18n application ----------
  function applyI18n() {
    document.documentElement.lang = state.lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const k = el.getAttribute('data-i18n');
      const v = window.I18N[state.lang][k];
      if (v != null) el.textContent = v;
    });
    document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
      const k = el.getAttribute('data-i18n-ph');
      const v = window.I18N[state.lang][k];
      if (v != null) el.setAttribute('placeholder', v);
    });
  }

  // ---------- screen router ----------
  function show(screen) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    $('screen-' + screen).classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- API ----------
  async function api(path, body) {
    const url = path + (path.includes('?') ? '&' : '?') + 'lang=' + state.lang;
    const res = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error('api ' + res.status);
    return res.json();
  }

  // ---------- Home: scenario list ----------
  async function loadScenarios() {
    const { scenarios } = await api('/api/scenarios');
    const grid = $('scenarioGrid');
    grid.innerHTML = '';
    scenarios.forEach((sc) => {
      const card = document.createElement('div');
      card.className = 'scenario-card';
      const dots = Array.from({ length: 5 }, (_, i) => `<i class="${i < sc.difficulty ? 'on' : ''}"></i>`).join('');
      card.innerHTML = `
        <div class="sc-icon">${sc.icon}</div>
        <div class="sc-title">${esc(sc.title)}</div>
        <div class="sc-role">${esc(sc.role)}</div>
        <div class="sc-foot">
          <div class="sc-diff" title="${t('difficulty')}">${dots}</div>
          <div class="sc-start">${t('startBtn')}</div>
        </div>`;
      card.addEventListener('click', () => startGame(sc.id));
      grid.appendChild(card);
    });
  }

  // ---------- Start a game ----------
  async function startGame(scenarioId) {
    const data = await api('/api/start', { scenarioId });
    state.sessionId = data.sessionId;
    state.scenario = data.scenario;
    state.finished = false;

    // Fill side panel.
    $('oppName').textContent = data.scenario.counterpart.name;
    $('oppPersona').textContent = data.scenario.counterpart.persona;
    $('oppAvatar').textContent = avatarFor(scenarioId);
    $('playerTarget').textContent = data.scenario.target + data.scenario.headline;
    $('briefing').textContent = data.scenario.briefing;
    $('batnaNote').textContent = data.scenario.batna;

    $('chatLog').innerHTML = '';
    $('detected').innerHTML = '';
    $('inputBox').value = '';
    updateState(data.state);
    setupInterestDots(data.state);
    renderQuickMoves();

    addOppMsg(data.greeting);
    show('game');
    $('inputBox').focus();
  }

  function avatarFor(id) {
    return ({ supplier: '👩‍💼', salary: '🧔‍♂️', conflict: '😤', investor: '👩‍💻' })[id] || '🧑‍💼';
  }

  // ---------- Meters ----------
  function updateState(s) {
    setMeter('mTrust', s.trust);
    setMeter('mTension', s.tension);
    setMeter('mInfo', s.info);
    setMeter('mLeverage', s.leverage);
    $('offerOpp').textContent = s.offerOpp + state.scenario.headline;
    $('turnNum').textContent = s.turn;
    $('turnMax').textContent = s.maxTurns;
    // interest dots
    document.querySelectorAll('#interestDots i').forEach((d, i) => d.classList.toggle('on', i < s.interestsFound));
    const total = document.querySelectorAll('#interestDots i').length;
    $('interestsCount').textContent = `${s.interestsFound}/${total}`;
  }
  function setMeter(id, val) {
    $(id).style.width = Math.max(0, Math.min(100, val)) + '%';
    $(id + 'N').textContent = Math.round(val);
  }
  function setupInterestDots(s) {
    // We don't know total from state; derive from scenario target? Use 3 default, corrected by server counts.
    const total = interestTotals[state.scenario.id] || 3;
    $('interestDots').innerHTML = Array.from({ length: total }, () => '<i></i>').join('');
    updateState(s);
  }
  const interestTotals = { supplier: 3, salary: 3, conflict: 3, investor: 3 };

  // ---------- Chat rendering ----------
  function addOppMsg(text) {
    const m = document.createElement('div');
    m.className = 'msg opp';
    m.innerHTML = `<div class="bubble">${esc(text)}</div>`;
    $('chatLog').appendChild(m);
    scrollChat();
  }
  function addPlayerMsg(text, analysis, deltas) {
    const m = document.createElement('div');
    m.className = 'msg player';
    const tags = (analysis.tags || []).map((tg) => `<span class="tag ${tg.key}">${esc(tg.label)}</span>`).join('');
    const arg = `<span class="arg-mini"><b>${analysis.argQuality}</b>/100 ${t('argLabel')}</span>`;
    const dflash = renderDeltas(deltas);
    m.innerHTML = `<div class="bubble">${esc(text)}</div>
      <div class="msg-tags">${tags} ${arg}</div>${dflash}`;
    $('chatLog').appendChild(m);
    scrollChat();
  }
  function renderDeltas(d) {
    if (!d) return '';
    const parts = [];
    const push = (label, v) => {
      if (Math.abs(v) < 0.5) return;
      const cls = (label === 'Напр.' || label === 'Tens.') ? (v > 0 ? 'd-down' : 'd-up') : (v > 0 ? 'd-up' : 'd-down');
      parts.push(`<span class="${cls}">${label} ${v > 0 ? '+' : ''}${Math.round(v)}</span>`);
    };
    const L = state.lang === 'ru'
      ? { trust: 'Дов.', tension: 'Напр.', info: 'Инфо', leverage: 'Рычаг' }
      : { trust: 'Trust', tension: 'Tens.', info: 'Info', leverage: 'Lev.' };
    push(L.trust, d.trust); push(L.tension, d.tension); push(L.info, d.info); push(L.leverage, d.leverage);
    return parts.length ? `<div class="delta-flash">${parts.join('')}</div>` : '';
  }
  function addSysLine(text) {
    const m = document.createElement('div');
    m.className = 'sys-line';
    m.textContent = text;
    $('chatLog').appendChild(m);
    scrollChat();
  }
  function scrollChat() { const c = $('chatLog'); c.scrollTop = c.scrollHeight; }

  // ---------- Send a message ----------
  async function send(text) {
    if (state.busy || state.finished) return;
    text = (text || '').trim();
    if (!text) return;
    state.busy = true;
    $('sendBtn').disabled = true;
    $('inputBox').value = '';
    $('detected').innerHTML = '';

    try {
      const data = await api('/api/say', { sessionId: state.sessionId, text });
      addPlayerMsg(text, data.analysis, data.deltas);
      // slight delay so opponent "thinks"
      await wait(380);
      updateState(data.state);
      addOppMsg(data.reply);
      if (data.closed && data.debrief) {
        state.finished = true;
        await wait(700);
        showDebrief(data.debrief);
      }
    } catch (e) {
      addSysLine('⚠ ' + e.message);
    } finally {
      state.busy = false;
      $('sendBtn').disabled = false;
      if (!state.finished) $('inputBox').focus();
    }
  }

  // ---------- Live technique preview (client-side heuristic echo) ----------
  // Lightweight hint of what the server will likely detect, updates as you type.
  function livePreview() {
    const text = $('inputBox').value.toLowerCase();
    const hints = [];
    const add = (cond, key, label) => { if (cond) hints.push(`<span class="tag ${key}">${label}</span>`); };
    add(text.includes('?'), 'question', '❓');
    add(/потому что|because|так как|since/.test(text), 'criteria', '↳ arg');
    add(/рыночн|market|стандарт|benchmark|данны|data/.test(text), 'criteria', '📊');
    add(/альтернатив|другой поставщик|competitor|walk away|elsewhere/.test(text), 'batna', '🛡️');
    add(/понимаю|understand|ценю|appreciate|справедлив|fair/.test(text), 'empathy', '🤝');
    add(/взамен|в обмен|if you|in exchange|при услови/.test(text), 'tradeoff', '🔄');
    $('detected').innerHTML = hints.slice(0, 5).join('');
  }

  // ---------- Quick moves ----------
  function renderQuickMoves() {
    const wrap = $('quickMoves');
    wrap.innerHTML = '';
    (window.I18N[state.lang].quickMoves || []).forEach((qm) => {
      const b = document.createElement('button');
      b.textContent = qm.label;
      b.addEventListener('click', () => { $('inputBox').value = qm.text; $('inputBox').focus(); livePreview(); });
      wrap.appendChild(b);
    });
  }

  // ---------- Hint ----------
  async function getHint() {
    if (state.finished) return;
    try {
      const { hint } = await api('/api/hint', { sessionId: state.sessionId });
      const m = document.createElement('div');
      m.className = 'hint-bubble';
      m.textContent = '💡 ' + hint;
      $('chatLog').appendChild(m);
      scrollChat();
    } catch (e) { addSysLine(t('hintFail')); }
  }

  // ---------- Debrief ----------
  function showDebrief(d) {
    const gradeColors = { A: '#34d399', B: '#60a5fa', C: '#fbbf24', D: '#fb923c', F: '#f87171' };
    const ring = $('gradeRing');
    ring.style.setProperty('--pct', d.overall);
    ring.style.setProperty('--grade-color', gradeColors[d.grade] || '#4f8cff');
    $('gradeLetter').textContent = d.grade;
    $('gradeScore').textContent = d.overall + '/100';

    const outcomeMap = {
      agreement: t('outcomeAgreement'), breakdown: t('outcomeBreakdown'), active: t('outcomeNone'),
    };
    $('dealOutcome').innerHTML = `${outcomeMap[d.status] || ''} · <b>${esc(d.dealText)}</b>`;

    animateBar('sbEconomic', d.economic);
    animateBar('sbRelationship', d.relationship);
    animateBar('sbTechnique', d.technique);

    const SL = window.I18N[state.lang].statLabels;
    const stats = [
      { n: `${d.spinStages}/3`, l: SL.spin },
      { n: d.objectiveCriteria, l: SL.criteria },
      { n: d.empathy, l: SL.empathy },
      { n: `${d.interestsFound}/${d.interestsTotal}`, l: SL.interests },
      { n: d.tradeoffs, l: SL.tradeoffs },
      { n: d.threats, l: SL.threats },
      { n: d.avgArg, l: SL.arg },
    ];
    $('debriefStats').innerHTML = stats.map((s) =>
      `<div class="stat-cell"><div class="stat-num">${s.n}</div><div class="stat-lbl">${s.l}</div></div>`).join('');

    $('tipsList').innerHTML = d.tips.map((tp) => `<li>${esc(tp)}</li>`).join('');
    show('debrief');
  }
  function animateBar(id, val) {
    $(id + 'N').textContent = val;
    requestAnimationFrame(() => { $(id).style.width = val + '%'; });
  }

  // ---------- utils ----------
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // ---------- wire up ----------
  function init() {
    applyI18n();
    loadScenarios();

    $('langToggle').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-lang]');
      if (!b) return;
      state.lang = b.dataset.lang;
      document.querySelectorAll('#langToggle button').forEach((x) => x.classList.toggle('active', x === b));
      applyI18n();
      loadScenarios();
      if (state.scenario) renderQuickMoves();
    });

    $('sendBtn').addEventListener('click', () => send($('inputBox').value));
    $('inputBox').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send($('inputBox').value); }
    });
    $('inputBox').addEventListener('input', livePreview);
    $('hintBtn').addEventListener('click', getHint);
    $('quitBtn').addEventListener('click', () => show('home'));
    $('homeBtn').addEventListener('click', () => show('home'));
    $('retryBtn').addEventListener('click', () => state.scenario && startGame(state.scenario.id));
  }

  document.addEventListener('DOMContentLoaded', init);
})();
