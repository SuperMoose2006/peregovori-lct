// mockServer.ts — a local, in-process implementation of the turn protocol.
// Speaks the exact same ClientMsg -> ServerMsg contract as the FastAPI backend,
// driven by the deterministic mock engine. This is what makes `npm run dev`
// demonstrate the full UI end-to-end with no backend running.
import type { ClientMsg, Lang, ServerMsg } from "../types";
import type { ServerMsgHandler, Transport } from "../api/transport";
import { SCENARIO_MAP, toScenarioView, type ScenarioDef } from "../data/scenarios";
import { synthCustomScenario } from "./customScenario";
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
        void this.handleStart(msg);
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

  private async handleStart(msg: Extract<ClientMsg, { type: "start" }>): Promise<void> {
    const lang: Lang = msg.lang;
    let def: ScenarioDef | undefined;
    let genDelay = 150;

    if (msg.mode === "custom") {
      // No backend to design a scenario, so synthesize one locally from the
      // user's situation text. A longer delay lets the loading screen breathe.
      def = synthCustomScenario(msg.situation ?? "", lang);
      genDelay = 900;
    } else {
      def = SCENARIO_MAP[msg.scenarioId];
      if (!def) {
        this.emit({ type: "error", message: `Unknown scenario: ${msg.scenarioId}` });
        return;
      }
    }

    const s = newSession(def, lang);
    // Campaign reputation carries into this stage as a starting-trust nudge
    // (mirrors backend views.apply_reputation: ±15 max, initial condition only —
    // never scoring). Lets the offline demo show the carry-over take effect.
    if (typeof msg.reputation === "number") {
      const nudge = Math.max(-15, Math.min(15, msg.reputation * 0.12));
      s.trust = Math.max(0, Math.min(100, s.trust + nudge));
    }
    this.session = s;
    await this.delay(genDelay);
    this.emit({
      type: "greeting",
      sessionId: `mock-${def.id}-${Date.now()}`,
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
    // coach: a short per-turn nudge (stands in for the backend's semantic judge)
    // so the demo exercises the live-coaching UI. Hidden client-side in exam mode.
    this.emit({
      type: "opponent",
      text: reply,
      analysis: toAnalysis(raw, text),
      deltas: result.deltas,
      state: stateView(s),
      coach: timeout ? undefined : coachLine(raw.primary, s.lang),
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

// A short coaching nudge keyed to the player's primary move (mock stand-in for
// the backend's semantic judge). Undefined = nothing worth saying this turn.
function coachLine(primary: string, lang: Lang): string | undefined {
  const ru: Record<string, string> = {
    hostile: "Грубость рушит доверие — вернитесь к сути и объективным критериям.",
    threat: "Ультиматум повышает напряжение. Обоснуйте позицию критерием или BATNA.",
    tradeoff: "Хороший размен — свяжите уступку с ответным шагом другой стороны.",
    objective_criteria: "Сильно: объективный критерий убеждает лучше давления.",
    batna: "BATNA как рычаг — но подавайте её спокойно, не как угрозу.",
    interests_probe: "Отлично — вы копаете к интересам за позицией.",
    spin_needpayoff: "Вопрос на ценность — подведите оппонента к выгоде решения.",
    spin_implication: "Хорошо: вы раскрываете последствия проблемы.",
    spin_problem: "Вы нащупали проблему — дальше усильте её последствиями.",
    spin_situation: "Ситуационный вопрос собран — переходите к проблемам.",
    acknowledge: "Активное слушание снижает напряжение — так и держите.",
    offer: "Число названо — подкрепите его обоснованием, а не только позицией.",
    open_question: "Открытый вопрос — хорошо; направьте его к скрытым интересам.",
    statement: "Задайте вопрос: вскрывайте интересы, а не только заявляйте позицию.",
  };
  const en: Record<string, string> = {
    hostile: "Hostility burns trust — return to substance and objective criteria.",
    threat: "An ultimatum raises tension. Anchor your stance in a criterion or BATNA.",
    tradeoff: "Nice trade — tie your concession to a matching move from them.",
    objective_criteria: "Strong: an objective criterion persuades better than pressure.",
    batna: "BATNA is leverage — but present it calmly, not as a threat.",
    interests_probe: "Good — you're digging toward the interest behind the position.",
    spin_needpayoff: "A need-payoff question — lead them to the value of solving it.",
    spin_implication: "Good: you're surfacing the consequences of the problem.",
    spin_problem: "You found a problem — now amplify it with its implications.",
    spin_situation: "Situation mapped — move on to the problems.",
    acknowledge: "Active listening eases tension — keep it up.",
    offer: "A number's on the table — back it with rationale, not just a stance.",
    open_question: "Open question — good; steer it toward hidden interests.",
    statement: "Ask a question: surface interests, don't just assert a position.",
  };
  const table = lang === "ru" ? ru : en;
  return table[primary];
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
