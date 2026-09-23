import type { ChatEntry, NegotiationState } from "./useNegotiation";
import type { ConnStatus, Transport } from "./transport";
import { clampInput } from "../lib/net";

/** Event-owned state: React reads snapshots; rendering never sends a command. */
export function createSessionStore(initial: NegotiationState) {
  let state = initial;
  let id = 0;
  const listeners = new Set<() => void>();
  const getSnapshot = () => state;
  const nextId = () => ++id;
  const update = (change: (previous: NegotiationState) => NegotiationState) => {
    const next = change(state);
    if (next === state) return;
    state = next;
    listeners.forEach((notify) => notify());
  };
  const subscribe = (notify: () => void) => {
    listeners.add(notify);
    return () => { listeners.delete(notify); };
  };
  const ready = () => state.conn === "online" && !state.busy &&
    state.state?.status === "active" &&
    !state.log.some((entry) => entry.kind === "probe" && entry.picked === undefined);

  const sendEntry = (transport: Transport, entry: Extract<ChatEntry, { kind: "me" | "hint" }>, hint: boolean): boolean => {
    // Log first: the offline engine can emit its analysis synchronously.
    update((p) => ({ ...p, busy: hint ? p.busy : true, phase: null, log: [...p.log, entry] }));
    try {
      const accepted = transport.send(hint ? { type: "hint" } : { type: "turn", text: entry.text });
      if (accepted !== false) return true;
    } catch {
      // Preserve the draft when the socket closes between readiness and send.
    }
    update((p) => ({ ...p, busy: false, conn: p.conn === "online" ? "lost" : p.conn,
      log: p.log.filter((item) => item.id !== entry.id) }));
    return false;
  };

  return {
    getSnapshot, update, subscribe, nextId,
    connection(conn: ConnStatus) {
      update((p) => ({ ...p, conn,
        busy: conn === "online" ? p.busy : false,
        phase: conn === "online" ? p.phase : null,
        // A coach reply belongs to the old socket; remove its abandoned spinner
        // so a resumed game can request a fresh hint.
        log: conn === "online" ? p.log : p.log.filter((e) => e.kind !== "hint" || !e.pending),
      }));
    },
    turn(text: string, transport: Transport | null): boolean {
      const trimmed = clampInput(text.trim());
      if (!transport || !trimmed || !ready()) return false;
      return sendEntry(transport, { id: nextId(), kind: "me", text: trimmed }, false);
    },
    hint(transport: Transport | null): boolean {
      if (!transport || !ready() || state.log.some((e) => e.kind === "hint" && e.pending)) return false;
      return sendEntry(transport, { id: nextId(), kind: "hint", text: "", pending: true }, true);
    },
  };
}
