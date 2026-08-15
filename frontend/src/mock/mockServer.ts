// mockServer.ts — a local, in-process implementation of the turn protocol.
// Speaks the exact same ClientMsg -> ServerMsg contract as the FastAPI backend,
// driven by the deterministic mock engine. This is what makes `npm run dev`
// demonstrate the full UI end-to-end with no backend running.
import type { ClientMsg, Lang, ServerMsg } from "../types";
import type { ServerMsgHandler, Transport } from "../api/transport";
import { SCENARIO_MAP, toScenarioView } from "../data/scenarios";
import {
  analyze, applyMove, greetingText, hintText, newSession, renderLine,
  scoreSession, stateView, toAnalysis, type Session,
} from "./engine";

export class MockServer implements Transport {
  private onMessage: ServerMsgHandler;
  private session: Session | null = null;
  private closed = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(onMessage: ServerMsgHandler) {
    this.onMessage = onMessage;
  }

  send(msg: ClientMsg): void {
    if (this.closed) return;
    switch (msg.type) {
      case "start":
        void this.handleStart(msg.scenarioId, msg.lang);
        break;
      case "turn":
        void this.handleTurn(msg.text);
        break;
      case "hint":
        this.handleHint();
        break;
    }
  }

  close(): void {
    this.closed = true;
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
  }

  private emit(msg: ServerMsg): void {
    if (!this.closed) this.onMessage(msg);
  }

  private async delay(ms: number): Promise<void> {
    // wait() but abortable via close()
    await new Promise<void>((resolve) => {
      const id = setTimeout(() => {
        this.timers.delete(id);
        resolve();
      }, ms);
      this.timers.add(id);
    });
  }

  private async handleStart(scenarioId: string, lang: Lang): Promise<void> {
    const def = SCENARIO_MAP[scenarioId];
    if (!def) {
      this.emit({ type: "error", message: `Unknown scenario: ${scenarioId}` });
      return;
    }
    const s = newSession(def, lang);
    this.session = s;
    await this.delay(150);
    this.emit({
      type: "greeting",
      sessionId: `mock-${scenarioId}-${Date.now()}`,
      scenario: toScenarioView(def, lang),
      state: stateView(s),
      text: greetingText(s),
    });
  }

  private async handleTurn(text: string): Promise<void> {
    const s = this.session;
    if (!s) {
      this.emit({ type: "error", message: "No active session" });
      return;
    }
    if (s.status !== "active") return;

    const raw = analyze(text);
    s.turn += 1;
    const result = applyMove(s, raw);

    let timeout = false;
    if (s.status === "active" && s.turn >= s.maxTurns) {
      s.status = "breakdown";
      result.closed = true;
      timeout = true;
    }

    let reply = renderLine(s, result.reaction, result.closed);
    if (timeout) {
      reply = s.lang === "ru"
        ? "У нас вышло время на сегодня. Договориться так и не удалось."
        : "We're out of time for today. We couldn't reach agreement.";
    }

    // Stream the opponent reply in a few chunks (exercises opponent_delta),
    await this.delay(220);
    const chunks = chunkText(reply);
    for (const c of chunks) {
      this.emit({ type: "opponent_delta", chunk: c });
      await this.delay(70);
    }
    // then the authoritative opponent message carrying analysis/deltas/state.
    this.emit({
      type: "opponent",
      text: reply,
      analysis: toAnalysis(raw, text),
      deltas: result.deltas,
      state: stateView(s),
    });

    if (result.closed) {
      await this.delay(650);
      this.emit({ type: "debrief", debrief: scoreSession(s) });
    }
  }

  private handleHint(): void {
    const s = this.session;
    if (!s || s.status !== "active") {
      this.emit({ type: "error", message: "Hint unavailable" });
      return;
    }
    this.emit({ type: "hint", text: hintText(s) });
  }
}

// Split a reply into word-group chunks for a streaming feel.
function chunkText(text: string): string[] {
  const words = text.split(" ");
  const out: string[] = [];
  for (let i = 0; i < words.length; i += 3) {
    const piece = words.slice(i, i + 3).join(" ");
    out.push(i + 3 >= words.length ? piece : piece + " ");
  }
  return out.length ? out : [text];
}
