// useNegotiation.ts — the single hook the UI uses to run a negotiation.
// Wraps the transport (WS or Mock), reduces the ServerMsg stream into React
// state (scenario, live meters, chat log, debrief), and exposes clean actions.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Analysis, Deltas, Lang, Mode, ScenarioView, ServerMsg, StateView } from "../types";
import type { Transport, TransportKind } from "./transport";
import { createTransport } from "./ws";

export type ChatEntry =
  | { id: number; kind: "opp"; text: string; streaming?: boolean }
  | { id: number; kind: "me"; text: string; analysis?: Analysis; deltas?: Deltas }
  | { id: number; kind: "hint"; text: string }
  | { id: number; kind: "sys"; text: string };

export interface NegotiationState {
  kind: TransportKind | null;
  scenario: ScenarioView | null;
  state: StateView | null;
  log: ChatEntry[];
  debrief: import("../types").Debrief | null;
  busy: boolean; // waiting for the opponent's reply
  error: string | null;
}

export interface Negotiation extends NegotiationState {
  // situation is the free-text brief for mode "custom" (ignored otherwise).
  start: (scenarioId: string, mode: Mode, situation?: string) => void;
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
  error: null,
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
      transportRef.current = createTransport(handle, (kind) =>
        setS((p) => ({ ...p, kind })),
      );
    }
    return transportRef.current;
  }, [handle]);

  const start = useCallback(
    (scenarioId: string, mode: Mode, situation?: string) => {
      teardown();
      setS({ ...initialState });
      const t = ensureTransport();
      t.send({ type: "start", scenarioId, lang: langRef.current, mode, situation });
    },
    [ensureTransport, teardown],
  );

  const turn = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setS((prev) => {
      if (prev.busy || !prev.state || prev.state.status !== "active") return prev;
      const entry: ChatEntry = { id: nextId(), kind: "me", text: trimmed };
      transportRef.current?.send({ type: "turn", text: trimmed });
      return { ...prev, busy: true, log: [...prev.log, entry] };
    });
  }, []);

  const requestHint = useCallback(() => {
    transportRef.current?.send({ type: "hint" });
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
      return { ...prev, state: msg.state, busy: false, log };
    }

    case "debrief":
      return { ...prev, debrief: msg.debrief, busy: false };

    case "hint":
      return { ...prev, log: [...prev.log, { id: nextId(), kind: "hint", text: msg.text }] };

    case "error":
      return { ...prev, busy: false, error: msg.message };

    default:
      return prev;
  }
}
