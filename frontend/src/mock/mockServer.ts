// mockServer.ts — a local, in-process implementation of the turn protocol.
// Speaks the exact same ClientMsg -> ServerMsg contract as the FastAPI backend,
// driven by the deterministic mock engine. This is what makes `npm run dev`
// demonstrate the full UI end-to-end with no backend running.
import type { ClientMsg, Deltas, Lang, ServerMsg, TurningPoint } from "../types";
import type { ServerMsgHandler, Transport } from "../api/transport";
import { SCENARIO_MAP, toScenarioView, type ScenarioDef } from "../data/scenarios";
// Зеркальные столы лежат в своём файле: их длина не должна входить в
// арифметику «стола дня», а их вес — в первую отрисовку (data/mirrors.ts).
// Офлайн-транспорт отложен, поэтому импорт здесь ничего не тянет на главную.
import { MIRROR_MAP } from "../data/mirrors";
import { adjustCustom, synthCustomScenario } from "./customScenario";
import {
  analyze, applyMove, applyStartConditions, closeOnTurnLimit, greetingText, hintLine, hintText, newSession, renderLine,
  scoreSession, stateView, timeoutLine, toAnalysis, type Session,
} from "./engine";
import { NO_PROBES, nextProbe, type ProbeMemory } from "../lib/probe";
import { EPILOGUE_BANDS, REPUTATION_LINES } from "../data/campaigns.generated";

/** Зеркало views.reputation_intro. Пороги и текст — из одной таблицы с эпилогом;
 *  читается СРЕДНИЙ акт (`reputationAvg`), а не накопленная сумма. */
function reputationIntro(reputation: unknown, lang: Lang): string {
  if (typeof reputation !== "number") return "";
  for (const [threshold, key] of EPILOGUE_BANDS) {
    if (reputation >= threshold) return REPUTATION_LINES[key]?.[lang] ?? "";
  }
  return REPUTATION_LINES.burnt?.[lang] ?? "";
}

export class MockServer implements Transport {
  private onMessage: ServerMsgHandler;
  private session: Session | null = null;
  /** Своя сделка и её id: поправка чисел до первого хода (CE-01). */
  private custom = false;
  private sessionId = "";
  private closed = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  // Per-turn record of the player's own words + their meter swing, so the debrief
  // can quote the moves that mattered (stand-in for the backend's turning_points).
  private turns: Array<{ turn: number; text: string; primary: string; deltas: Deltas; reply?: string }> = [];
  /** Which optional layers this session runs with. Only `probe` is honoured — the
   *  others report themselves unavailable and never reach here. */
  private layers: { probe?: boolean } | null = null;
  /** Партия на зачёт (экзамен, капстоун) — без подсказок и без тренера, как
   *  на сервере (`reproducible_run`). */
  private graded = false;
  /** Память слоя «читай лицо» — та же, что у живого транспорта, и по той же
   *  причине: решение принимает общая чистая функция, а помнит его партия. */
  private probeMemory: ProbeMemory = { ...NO_PROBES };

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
      case "adjust":
        this.handleAdjust(msg);
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
    this.layers = msg.layers ?? null;
    this.graded = msg.mode === "exam" || msg.mode === "drill";
    this.probeMemory = { ...NO_PROBES };
    let def: ScenarioDef | undefined;
    let genDelay = 150;

    if (msg.mode === "custom") {
      // No backend to design a scenario, so synthesize one locally from the
      // user's situation text. A longer delay lets the loading screen breathe.
      def = synthCustomScenario(msg.situation ?? "", lang, msg.context);
      genDelay = 900;
    } else {
      def = SCENARIO_MAP[msg.scenarioId] ?? MIRROR_MAP[msg.scenarioId];
      if (!def) {
        this.emit({ type: "error", message: `Unknown scenario: ${msg.scenarioId}` });
        return;
      }
    }

    this.custom = msg.mode === "custom";
    const s = newSession(def, lang);
    // Репутация кампании и условие дня — общей функцией с «А что если»:
    // переигровка обязана стартовать из того же состояния. Зеркало
    // app/realtime/endpoint.py → views.apply_start_conditions.
    applyStartConditions(s, def, msg.reputation, msg.daily, msg.mode);
    this.session = s;
    this.turns = [];
    await this.delay(genDelay);
    this.sessionId = `mock-${def.id}-${Date.now()}`;
    this.emit({
      type: "greeting",
      sessionId: this.sessionId,
      scenario: toScenarioView(def, lang),
      state: stateView(s),
      // Репутация кампании была слышна ТОЛЬКО онлайн: офлайн-ядро применяло её
      // сдвиг доверия молча, и механика работала, оставаясь невидимой. Строка
      // приходит из того же сгенерированного источника, что и на сервере
      // (views.reputation_intro), поэтому разъехаться им негде.
      // Только в кампании — как на сервере (endpoint: game_mode == "campaign").
      text: [msg.mode === "campaign" ? reputationIntro(msg.reputationAvg, lang) : "", greetingText(s)]
        .filter(Boolean).join(" "),
      // Offline demo is the deterministic keyword path — the semantic judge is a
      // backend-only capability. Report it honestly so the "graded by meaning"
      // badge never appears without a live judge behind it.
      judge_active: false,
    });
  }

  /** Своя сделка, до первого хода: стол с поправленными числами — новым
   *  приветствием, как ответ сервера на `session.adjust`. Зеркало
   *  endpoint.py (CE-01). */
  private handleAdjust(msg: Extract<ClientMsg, { type: "adjust" }>): void {
    const s = this.session;
    if (!s) return;
    if (!this.custom || s.turn > 0 || this.turns.length > 0) {
      this.emit({ type: "notice", text: s.lang === "ru"
        ? "Числа можно поправить только в своей сделке до первого хода."
        : "Numbers can be corrected only in a custom deal before the first move." });
      return;
    }
    const next = adjustCustom(s.sc, msg.open, msg.target, msg.redline, s.lang);
    if (typeof next === "string") {
      this.emit({ type: "notice", text: next });
      return;
    }
    const fresh = newSession(next, s.lang);
    this.session = fresh;
    this.emit({ type: "greeting", sessionId: this.sessionId, scenario: toScenarioView(next, s.lang),
                state: stateView(fresh), text: greetingText(fresh), judge_active: false });
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
    const result = applyMove(s, raw, text);
    this.turns.push({ turn: s.turn, text, primary: raw.primary, deltas: result.deltas });

    // РАЗБОР УХОДИТ СРАЗУ И ЦЕЛИКОМ — ЗДЕСЬ ЕГО НЕЧЕГО ЖДАТЬ.
    //
    // Инвариант 8: офлайн-ядро ведёт себя так же, как сервер. Но «так же» —
    // это про поведение, а не про паузы: на сервере число ждёт судью, а тут
    // судьи нет вовсе (`judged: false`), и `applyMove` уже отработал. Значит
    // оба куска разбора готовы в один и тот же миг и оба уходят до задержки
    // на печать реплики. Раньше они лежали в `opponent` и появлялись через
    // полсекунды — офлайн отставал от онлайна на ровном месте.
    this.emit({ type: "analysis", analysis: toAnalysis(raw, text) });
    this.emit({ type: "arg_quality", value: raw.arg, judged: false });

    // Офлайн и онлайн закрывают стол одной репликой (инвариант 8).
    const timeout = closeOnTurnLimit(s, result);
    const reply = timeout ? timeoutLine(s.lang) : renderLine(s, result.reaction, result.closed);

    this.turns[this.turns.length - 1].reply = reply;
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
      // На зачёте тренера нет: на сервере эту строку пишет судья, а в
      // партии на зачёт судьи нет вовсе (инвариант 8).
      coach: timeout || this.graded ? undefined : coachLine(raw.primary, s.lang),
    });

    // Офлайн-зеркало серверного app/probe.py; общая фикстура проверяет
    // ответ и порядок вариантов. В онлайн-транспорте расчёта нет.
    if (this.layers?.probe) {
      const p = nextProbe(result.reaction, s.turn, result.closed, this.probeMemory);
      if (p) {
        this.probeMemory = { lastTurn: p.turn, lastReaction: result.reaction };
        this.emit({ type: "probe", turn: p.turn, options: p.options, answer: p.answer });
      }
    }

    if (result.closed) {
      await this.delay(650);
      const debrief = scoreSession(s);
      debrief.turning_points = synthTurningPoints(this.turns, s.lang);
      // Ответ на каждый ход — в хронику, как это делает views.turn_log.
      debrief.turn_log?.forEach((r, i) => { r.reply = this.turns[i]?.reply ?? null; });
      // Реестра свидетельств офлайн нет: экзамен честно говорит «не включена».
      debrief.attestation_enabled = false;
      this.emit({ type: "debrief", debrief });
    }
  }

  private handleHint(): void {
    const s = this.session;
    // Партия на зачёт — без подсказок; сервер на просьбу молчит так же.
    if (this.graded) return;
    if (!s || s.status !== "active") {
      this.emit({ type: "error", message: "Hint unavailable" });
      return;
    }
    this.emit({ type: "hint", text: hintText(s), line: hintLine(s) });
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

// Pick the 1-2 turns that swung the table most (by total meter movement) and
// quote the player's own words back — the debrief's "replay the tape" moment.
// Deterministic: ranked by |Δ| sum, then rendered in chronological order.
function synthTurningPoints(
  turns: Array<{ turn: number; text: string; primary: string; deltas: Deltas }>,
  lang: Lang,
): TurningPoint[] {
  const swing = (d: Deltas) =>
    Math.abs(d.trust) + Math.abs(d.tension) + Math.abs(d.info) + Math.abs(d.leverage);
  return [...turns]
    .filter((t) => swing(t.deltas) > 0)
    .sort((a, b) => swing(b.deltas) - swing(a.deltas))
    .slice(0, 2)
    .sort((a, b) => a.turn - b.turn)
    .map((t) => ({
      turn: t.turn,
      quote: t.text,
      what: describeSwing(t.deltas, lang),
      coach: coachLine(t.primary, lang),
    }));
}

// Put the meter swing into plain prose: a lead on which way the table tilted,
// then the meters that actually moved (honest numbers, engine-owned).
function describeSwing(d: Deltas, lang: Lang): string {
  const parts: string[] = [];
  const push = (ru: string, en: string, v: number) => {
    if (Math.abs(v) >= 3) parts.push(`${lang === "ru" ? ru : en} ${v > 0 ? "+" : "−"}${Math.abs(Math.round(v))}`);
  };
  push("Доверие", "Trust", d.trust);
  push("Напряжение", "Tension", d.tension);
  push("Информация", "Info", d.info);
  push("Рычаг", "Leverage", d.leverage);
  const positive = d.trust + d.info + d.leverage - d.tension >= 0;
  const lead = lang === "ru"
    ? positive ? "Ход сыграл в вашу пользу" : "Ход качнул стол против вас"
    : positive ? "This move swung the table your way" : "This move swung the table against you";
  return parts.length ? `${lead}: ${parts.join(", ")}.` : `${lead}.`;
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
