// whatif.ts — the client seam for the "А что если…" replay.
//
// Two paths behind one call, mirroring the transport split (ws.ts): when the real
// backend is live we POST /api/whatif; when we're on the offline MockServer (or
// the backend call fails) we synthesize the same deterministic branches locally
// via the mock engine. Either way the caller gets a WhatIfResponse or null — and
// null simply hides the card, never a broken one.
import { apiFetch } from "./backend";
import type { TransportKind } from "./transport";
import type { WhatIfRequest, WhatIfResponse } from "../types";
import { SCENARIO_MAP } from "../data/scenarios";
import { whatIfBranch } from "../mock/engine";

const TIMEOUT_MS = 6000;
const MAX_MOVES = 24; // mirror the backend cap (a game is <= 12 turns anyway)

// POST to the FastAPI endpoint; resolve null on any failure/timeout (graceful).
export async function whatIfRemote(req: WhatIfRequest): Promise<WhatIfResponse | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await apiFetch("/api/whatif", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as WhatIfResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Synthesize the two branches locally from the deterministic mock engine. Only
// works for the built-in scenarios (custom scenarios aren't in SCENARIO_MAP) —
// returns null otherwise so the card stays hidden rather than showing nonsense.
export function whatIfLocal(req: WhatIfRequest): WhatIfResponse | null {
  const def = SCENARIO_MAP[req.scenarioId];
  if (!def) return null;
  const moves = req.moves.slice(0, MAX_MOVES);
  if (req.turnIndex < 0 || req.turnIndex >= moves.length) return null;
  const prefix = moves.slice(0, req.turnIndex);
  return {
    turnIndex: req.turnIndex,
    original: whatIfBranch(def, req.lang, prefix, moves[req.turnIndex]),
    alternative: whatIfBranch(def, req.lang, prefix, req.altText),
  };
}

// The one entry point the UI calls. Mock transport → local synth. Real backend →
// POST, with a local-synth fallback so a flaky server still yields the demo (for
// known scenarios). Always resolves; null means "no card".
export async function whatIf(kind: TransportKind | null, req: WhatIfRequest): Promise<WhatIfResponse | null> {
  if (kind === "mock") return whatIfLocal(req);
  const remote = await whatIfRemote(req);
  return remote ?? whatIfLocal(req);
}
