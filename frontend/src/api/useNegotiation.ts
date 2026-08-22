// useNegotiation.ts — the single hook the UI uses to run a negotiation.
// Wraps the transport (WS or Mock), reduces the ServerMsg stream into React
// state (scenario, live meters, chat log, debrief), and exposes clean actions.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Analysis, Deltas, Lang, Mode, ScenarioView, ServerMsg, StateView } from "../types";
import type { ConnStatus, Transport, TransportKind } from "./transport";
import { createTransport } from "./ws";
import { clampInput } from "../lib/net";

export type ChatEntry =
  | { id: number; kind: "opp"; text: string; streaming?: boolean }
  | { id: number; kind: "me"; text: string; analysis?: Analysis; deltas?: Deltas }
  // `pending` marks the placeholder shown the instant 💡 is pressed. With a
  // live AI coach the answer takes seconds, and without a placeholder the
  // press produced no visible change at all.
  | { id: number; kind: "hint"; text: string; line?: string; pending?: boolean }
  // coach: the semantic judge's per-turn nudge, threaded under the exchange.
  // Rendered by Chat (hidden in exam mode) — the hook stays modality/mode-agnostic.
  // techniques / reject ride along ONLY when the live judge scored this turn (the
  // "judge-cam" chips); both absent offline/mock where no live judge ran.
  | { id: number; kind: "coach"; text: string; techniques?: string[]; reject?: boolean }
  | { id: number; kind: "sys"; text: string };

export interface NegotiationState {
  kind: TransportKind | null;
  scenario: ScenarioView | null;
  state: StateView | null;
  log: ChatEntry[];
  debrief: import("../types").Debrief | null;
  busy: boolean; // waiting for the opponent's reply
  // What the server is doing during `busy`. "judging" means the semantic judge is
  // reading the player's line (the engine cannot score the move without it, so
  // the opponent has not started composing yet); "replying" means it has. Null
  // when the server never said — the client must render fine either way.
  phase: "judging" | "replying" | null;
  error: string | null;
  // Live WS health (mock is always "online"). Drives the mid-game reconnect banner.
  conn: ConnStatus;
  // Whether the semantic judge is live for this session (from the greeting). Drives
  // the "graded by meaning" badge — false offline/mock (deterministic keyword path).
  judgeActive: boolean;
}

export interface Negotiation extends NegotiationState {
  // situation is the free-text brief for mode "custom" (ignored otherwise).
  // reputation (-100..100) carries a campaign result into the next stage's trust.
  start: (scenarioId: string, mode: Mode, situation?: string, reputation?: number) => void;
  turn: (text: string) => void;
  requestHint: () => void;
  clearError: () => void;
  reset: () => void;
}

const initialState: NegotiationState = {
  kind: null,
  scenario: null,
  state: null,
  log: [],
  debrief: null,
  busy: false,
  phase: null,
  error: null,
  conn: "online",
  judgeActive: false,
};

export function useNegotiation(lang: Lang): Negotiation {
  const [s, setS] = useState<NegotiationState>(initialState);
  const transportRef = useRef<Transport | null>(null);
  const idRef = useRef(0);
  const langRef = useRef(lang);
  langRef.current = lang;
  const nextId = () => ++idRef.current;

  const teardown = useCallback(() => {
    transportRef.current?.close();
    transportRef.current = null;
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const handle = useCallback((msg: ServerMsg) => {
    setS((prev) => reduce(prev, msg, nextId));
  }, []);

  const ensureTransport = useCallback((): Transport => {
    if (!transportRef.current) {
      transportRef.current = createTransport(
        handle,
        (kind) => setS((p) => ({ ...p, kind })),
        (conn) =>
          setS((p) => ({
            ...p,
            conn,
            // A drop or a lost connection must never leave the typing indicator
            // spinning — clear busy so the reconnect banner owns the messaging.
            busy: conn === "online" ? p.busy : false,
          })),
      );
    }
    return transportRef.current;
  }, [handle]);

  const start = useCallback(
    (scenarioId: string, mode: Mode, situation?: string, reputation?: number) => {
      teardown();
      setS({ ...initialState });
      const t = ensureTransport();
      t.send({ type: "start", scenarioId, lang: langRef.current, mode, situation, reputation });
    },
    [ensureTransport, teardown],
  );

  const turn = useCallback((text: string) => {
    // Trim guards empty/whitespace sends; clampInput is a backstop against an
    // over-long payload even if the composer's own cap were bypassed.
    const trimmed = clampInput(text.trim());
    if (!trimmed) return;
    setS((prev) => {
      if (prev.busy || !prev.state || prev.state.status !== "active") return prev;
      const entry: ChatEntry = { id: nextId(), kind: "me", text: trimmed };
      transportRef.current?.send({ type: "turn", text: trimmed });
      return { ...prev, busy: true, phase: null, log: [...prev.log, entry] };
    });
  }, []);

  const requestHint = useCallback(() => {
    setS((prev) => {
      // One outstanding request at a time: repeated taps must not queue up a
      // column of placeholders (or a column of answers when they all land).
      if (prev.log.some((e) => e.kind === "hint" && e.pending)) return prev;
      transportRef.current?.send({ type: "hint" });
      const entry: ChatEntry = { id: nextId(), kind: "hint", text: "", pending: true };
      return { ...prev, log: [...prev.log, entry] };
    });
  }, []);

  const clearError = useCallback(() => {
    setS((p) => (p.error ? { ...p, error: null } : p));
  }, []);

  const reset = useCallback(() => {
    teardown();
    setS({ ...initialState });
  }, [teardown]);

  return { ...s, start, turn, requestHint, clearError, reset };
}

// Pure reducer over the ServerMsg stream.
function reduce(prev: NegotiationState, msg: ServerMsg, nextId: () => number): NegotiationState {
  switch (msg.type) {
    case "greeting":
      return {
        ...prev,
        scenario: msg.scenario,
        state: msg.state,
        error: null,
        judgeActive: !!msg.judge_active,
        log: [{ id: nextId(), kind: "opp", text: msg.text }],
      };

    case "opponent_delta": {
      const log = [...prev.log];
      const last = log[log.length - 1];
      if (last && last.kind === "opp" && last.streaming) {
        log[log.length - 1] = { ...last, text: last.text + msg.chunk };
      } else {
        log.push({ id: nextId(), kind: "opp", text: msg.chunk, streaming: true });
      }
      return { ...prev, log };
    }

    case "opponent": {
      const log = [...prev.log];
      // Attach analysis + deltas to the most recent player message.
      for (let i = log.length - 1; i >= 0; i--) {
        const e = log[i];
        if (e.kind === "me" && !e.analysis) {
          log[i] = { ...e, analysis: msg.analysis, deltas: msg.deltas };
          break;
        }
      }
      // Finalize (or add) the opponent bubble with the authoritative text.
      const last = log[log.length - 1];
      if (last && last.kind === "opp" && last.streaming) {
        log[log.length - 1] = { id: last.id, kind: "opp", text: msg.text };
      } else {
        log.push({ id: nextId(), kind: "opp", text: msg.text });
      }
      // The judge's coaching (if any) rides under the exchange. Chat decides
      // whether to show it (exam withholds all live feedback). We also raise a
      // coach entry when the live judge returned recognized-technique labels or a
      // reject flag even without a text nudge — so the "judge-cam" chips can show.
      const techniques = msg.coach_techniques?.length ? msg.coach_techniques : undefined;
      const reject = msg.coach_reject === true ? true : undefined;
      const coachText = msg.coach?.trim() ?? "";
      if (coachText || techniques || reject) {
        log.push({ id: nextId(), kind: "coach", text: coachText, techniques, reject });
      }
      return { ...prev, state: msg.state, busy: false, phase: null, log };
    }

    case "debrief":
      return { ...prev, debrief: msg.debrief, busy: false };

    case "phase":
      return { ...prev, phase: msg.phase };

    case "hint": {
      // Fill the placeholder in place if one is waiting, so the hint appears
      // where the player was already looking rather than below the spinner.
      const i = prev.log.findIndex((e) => e.kind === "hint" && e.pending);
      const filled: ChatEntry = i >= 0
        ? { ...(prev.log[i] as ChatEntry & { kind: "hint" }), text: msg.text, line: msg.line, pending: false }
        : { id: nextId(), kind: "hint", text: msg.text, line: msg.line };
      const log = i >= 0 ? prev.log.map((e, k) => (k === i ? filled : e)) : [...prev.log, filled];
      return { ...prev, log };
    }

    case "error":
      return { ...prev, busy: false, error: msg.message };

    default:
      return prev;
  }
}
