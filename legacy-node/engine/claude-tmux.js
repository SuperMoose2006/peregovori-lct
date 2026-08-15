'use strict';

/*
 * claude-tmux.js
 * --------------
 * LOCAL-ONLY opponent-dialogue backend that drives the `claude` CLI through a
 * persistent tmux session. This exists so you can run the simulator against a
 * real model on your own machine using your interactive Claude login — no API
 * key, no billing wiring. In production you swap this for the API client
 * (engine/llm.js) by setting NEGO_AI=api; nothing else changes.
 *
 * Why tmux (and not a bare child_process):
 *   - `claude` runs inside a real, persistent PTY tied to your logged-in
 *     session, which behaves the same as when you use it interactively.
 *   - You can watch the AI "think" live:  tmux attach -t nego-ai
 *   - The session stays warm across turns, so there is no per-turn startup.
 *
 * Contract: same as engine/llm.js — resolves to a short in-character line, or
 * null on any problem so the caller falls back to the deterministic templated
 * reply. The engine ALWAYS owns game state (meters, offers, scoring); the CLI
 * only produces flavor text and can never change the outcome.
 *
 * Player text never touches the shell command line — it is written to a file
 * and piped into `claude` via stdin, so there is no command-injection surface.
 */

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { byId } = require('../data/scenarios');

const SESSION = process.env.NEGO_TMUX_SESSION || 'nego-ai';
const MODEL = process.env.NEGO_MODEL || 'claude-sonnet-5';
const TIMEOUT_MS = parseInt(process.env.NEGO_AI_TIMEOUT || '30000', 10);
const WORKDIR = path.join(os.tmpdir(), 'nego-ai');

let counter = 0;
let queue = Promise.resolve(); // serialize: one tmux shell handles one turn at a time
let ready = false;

function sh(cmd, args) {
  return spawnSync(cmd, args, { encoding: 'utf8', timeout: 8000 });
}

function haveBinaries() {
  return sh('which', ['tmux']).status === 0 && sh('which', ['claude']).status === 0;
}

// Create the long-lived tmux session (and its shell) once.
function ensureSession() {
  if (ready) return true;
  if (!haveBinaries()) return false;
  try { fs.mkdirSync(WORKDIR, { recursive: true }); } catch (_) {}
  const has = sh('tmux', ['has-session', '-t', SESSION]);
  if (has.status !== 0) {
    const r = sh('tmux', ['new-session', '-d', '-s', SESSION, '-x', '200', '-y', '50']);
    if (r.status !== 0) return false;
  }
  ready = true;
  return true;
}

// Send one shell command line into the tmux session (literal + Enter).
function tmuxRun(cmdLine) {
  spawnSync('tmux', ['send-keys', '-t', SESSION, '-l', cmdLine]);
  spawnSync('tmux', ['send-keys', '-t', SESSION, 'Enter']);
}

// Build a single self-contained role-play prompt (system rules + facts + turn).
function buildPrompt(sess, analysis, result, fallbackLine) {
  const sc = byId(sess.scenarioId);
  const lang = sess.lang;
  const s = sess.state;
  const name = sc.counterpart.name[lang];
  const persona = sc.counterpart.persona[lang];
  const unit = sc.headline.unit[lang];
  const mood = describeMood(result.reaction, lang);
  const status = s.status === 'agreement' ? (lang === 'ru' ? 'СОГЛАСИЕ достигнуто' : 'AGREEMENT reached')
    : s.status === 'breakdown' ? (lang === 'ru' ? 'переговоры сорваны' : 'talks broke down')
    : (lang === 'ru' ? 'идут' : 'ongoing');
  const playerLine = lastPlayerText(sess);

  if (lang === 'ru') {
    return [
      `Ты играешь роль оппонента на деловых переговорах. Персонаж: ${name} — ${persona}.`,
      `Ответь РОВНО одной короткой репликой (1-2 предложения) на русском, строго в характере, без markdown, без пояснений, без кавычек вокруг ответа.`,
      `Факты, которым нельзя противоречить:`,
      `- Твоё текущее предложение на столе: ${s.offerOpp}${unit}.`,
      `- Твой настрой сейчас: ${mood}.`,
      `- Статус сделки: ${status}.`,
      `Не раскрывай свои скрытые интересы напрямую, если игрок не вывел их вопросами.`,
      `Ориентир твоей реакции (перефразируй в характере, не копируй): "${fallbackLine}"`,
      ``,
      `Реплика игрока: ${playerLine}`,
      `Твой ответ:`,
    ].join('\n');
  }
  return [
    `You role-play the counterpart in a business negotiation. Character: ${name} — ${persona}.`,
    `Reply with EXACTLY one short line (1-2 sentences) in English, strictly in character, no markdown, no explanations, no quotes around the answer.`,
    `Facts you must not contradict:`,
    `- Your current offer on the table: ${s.offerOpp}${unit}.`,
    `- Your current mood: ${mood}.`,
    `- Deal status: ${status}.`,
    `Do not reveal your hidden interests unless the player drew them out with questions.`,
    `Reference for your reaction (rephrase in character, do not copy): "${fallbackLine}"`,
    ``,
    `Player said: ${playerLine}`,
    `Your reply:`,
  ].join('\n');
}

function reply(sess, analysis, result, fallbackLine) {
  // Chain onto the queue so turns never overlap on the single shell.
  const task = queue.then(() => runOne(sess, analysis, result, fallbackLine).catch(() => null));
  // Keep the chain alive even if this task rejects.
  queue = task.then(() => {}, () => {});
  return task;
}

function runOne(sess, analysis, result, fallbackLine) {
  return new Promise((resolve) => {
    if (!ensureSession()) return resolve(null);
    const id = ++counter;
    const promptFile = path.join(WORKDIR, `req_${id}.txt`);
    const outFile = path.join(WORKDIR, `out_${id}.txt`);
    const errFile = path.join(WORKDIR, `err_${id}.txt`);
    const doneFile = path.join(WORKDIR, `done_${id}`);

    try {
      fs.writeFileSync(promptFile, buildPrompt(sess, analysis, result, fallbackLine));
    } catch (_) { return resolve(null); }

    // Pipe the prompt into `claude -p` from within the tmux shell; mark done.
    const model = MODEL.replace(/[^a-zA-Z0-9._-]/g, '');
    const cmd =
      `cat ${q(promptFile)} | claude -p --model ${model} --output-format text ` +
      `> ${q(outFile)} 2> ${q(errFile)}; touch ${q(doneFile)}`;
    tmuxRun(cmd);

    const started = Date.now();
    const tick = setInterval(() => {
      let done = false;
      try { done = fs.existsSync(doneFile); } catch (_) {}
      if (done) {
        clearInterval(tick);
        let text = '';
        try { text = fs.readFileSync(outFile, 'utf8'); } catch (_) {}
        cleanup([promptFile, outFile, errFile, doneFile]);
        text = sanitize(text);
        resolve(text || null);
      } else if (Date.now() - started > TIMEOUT_MS) {
        clearInterval(tick);
        cleanup([promptFile, outFile, errFile, doneFile]);
        resolve(null); // fall back to templated line
      }
    }, 150);
  });
}

// Strip stray CLI noise / quotes and keep it to a couple of sentences.
function sanitize(t) {
  if (!t) return '';
  let s = t.replace(/\r/g, '').trim();
  // Drop obvious non-dialogue lines (warnings, empty prompt echoes).
  s = s.split('\n').filter((l) => l.trim() && !/^(warning|note|error|\[)/i.test(l.trim())).join(' ').trim();
  s = s.replace(/^["'«»]+|["'«»]+$/g, '').trim();
  if (s.length > 400) s = s.slice(0, 400).replace(/\s+\S*$/, '') + '…';
  return s;
}

function cleanup(files) {
  for (const f of files) { try { fs.unlinkSync(f); } catch (_) {} }
}

function q(p) { return "'" + String(p).replace(/'/g, "'\\''") + "'"; }

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

// Warm the session at server boot (best-effort) and report availability.
function preflight() {
  if (!haveBinaries()) return { ok: false, reason: 'tmux or claude not found in PATH' };
  const ok = ensureSession();
  return { ok, reason: ok ? null : 'failed to start tmux session' };
}

module.exports = { reply, preflight, ensureSession, SESSION, MODEL, haveBinaries };
