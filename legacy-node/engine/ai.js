'use strict';

/*
 * ai.js — opponent-dialogue backend selector.
 *
 * The engine calls getOpponentReply() once per turn. It returns either a
 * real-model line (in character) or null, in which case the caller uses the
 * deterministic templated reply. Game state and scoring are NEVER produced
 * here — only the words the counterpart says.
 *
 * Backend is chosen by NEGO_AI:
 *   cli   → drive the local `claude` CLI through tmux (engine/claude-tmux.js)
 *   api   → call the Anthropic API (engine/llm.js); needs ANTHROPIC_API_KEY
 *   off   → always templated (fully offline, default)
 *
 * If NEGO_AI is unset we auto-pick: 'api' when ANTHROPIC_API_KEY is present,
 * otherwise 'off'. So `NEGO_AI=cli npm start` is all you need locally, and the
 * production swap to the hosted client is a one-line env change.
 */

const cli = require('./claude-tmux');
const { maybeLLMLine } = require('./llm');

function mode() {
  const m = (process.env.NEGO_AI || '').toLowerCase();
  if (m === 'cli' || m === 'api' || m === 'off') return m;
  return process.env.ANTHROPIC_API_KEY ? 'api' : 'off';
}

async function getOpponentReply(sess, analysis, result, fallbackLine) {
  switch (mode()) {
    case 'cli': return cli.reply(sess, analysis, result, fallbackLine).catch(() => null);
    case 'api': return maybeLLMLine(sess, analysis, result, fallbackLine).catch(() => null);
    default: return null;
  }
}

function describeMode() {
  const m = mode();
  if (m === 'cli') {
    const ok = cli.haveBinaries();
    return ok
      ? `local Claude CLI via tmux (session "${cli.SESSION}", model ${cli.MODEL})`
      : 'cli requested but tmux/claude not found → templated fallback';
  }
  if (m === 'api') return `Anthropic API (${process.env.NEGO_MODEL || 'claude-sonnet-5'})`;
  return 'offline (templated)';
}

// Best-effort warm-up so the first turn isn't slow. Returns a status string.
function warmup() {
  if (mode() === 'cli') {
    const pf = cli.preflight();
    return pf.ok ? 'tmux session ready' : `cli unavailable: ${pf.reason}`;
  }
  return null;
}

module.exports = { getOpponentReply, describeMode, warmup, mode };
