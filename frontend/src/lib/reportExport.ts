import type { Debrief, Lang, Mode } from "../types";

export interface ReportInput {
  debrief: Debrief;
  lang: Lang;
  mode: Mode;
  scenarioTitle?: string;
  playerName?: string;
  playerMoves?: readonly string[];
  createdAt: string;
}

const LABELS = {
  ru: { title: "Диалог · Разбор переговоров", scenario: "Ситуация", player: "Участник", date: "Дата", mode: "Режим", modes: { practice: "Практика", exam: "Экзамен", campaign: "Кампания", custom: "Своя ситуация", drill: "Практика курса" }, score: "Итог", economic: "Экономика", relationship: "Отношения", technique: "Техника", deal: "Результат", interests: "Раскрытые интересы", spin: "Этапы SPIN", criteria: "Объективные критерии", empathy: "Эмпатия", tradeoffs: "Обмен уступками", threats: "Угрозы", tips: "Что попробовать в следующий раз", turning: "Поворотные моменты", moves: "Ваши реплики", mentor: "Комментарий наставника" },
  en: { title: "Dialog · Negotiation report", scenario: "Situation", player: "Participant", date: "Date", mode: "Mode", modes: { practice: "Practice", exam: "Exam", campaign: "Campaign", custom: "Custom situation", drill: "Course practice" }, score: "Overall", economic: "Economics", relationship: "Relationship", technique: "Technique", deal: "Outcome", interests: "Interests uncovered", spin: "SPIN stages", criteria: "Objective criteria", empathy: "Empathy", tradeoffs: "Trade-offs", threats: "Threats", tips: "Try next time", turning: "Turning points", moves: "Your lines", mentor: "Mentor's comment" },
};

/** Deliberate public fields: no session tokens, raw transport objects or camera data. */
export function reportSnapshot(input: ReportInput) {
  const d = input.debrief;
  return {
    version: 1,
    created_at: input.createdAt,
    language: input.lang,
    mode: input.mode,
    scenario: input.scenarioTitle ?? "",
    participant: input.playerName?.trim() ?? "",
    result: {
      grade: d.grade, overall: d.overall, economic: d.economic,
      relationship: d.relationship, technique: d.technique,
      status: d.status, deal: d.deal_text,
      interests_found: d.interests_found, interests_total: d.interests_total,
      spin_stages: d.spin_stages, objective_criteria: d.objective_criteria,
      empathy: d.empathy, tradeoffs: d.tradeoffs, threats: d.threats,
      tips: [...d.tips],
      turning_points: (d.turning_points ?? []).map(({ turn, quote, what, coach }) => ({ turn, quote, what, ...(coach ? { coach } : {}) })),
      ...(d.ai_verdict ? { mentor: d.ai_verdict } : {}),
    },
    player_moves: [...(input.playerMoves ?? [])],
  };
}

export function reportText(input: ReportInput): string {
  const l = LABELS[input.lang];
  const r = reportSnapshot(input);
  const d = r.result;
  const lines = [l.title, "", `${l.date}: ${r.created_at}`, `${l.mode}: ${l.modes[input.mode]}`];
  if (r.scenario) lines.push(`${l.scenario}: ${r.scenario}`);
  if (r.participant) lines.push(`${l.player}: ${r.participant}`);
  lines.push("", `${l.score}: ${d.grade} · ${d.overall}/100`, `${l.economic}: ${d.economic}/100`, `${l.relationship}: ${d.relationship}/100`, `${l.technique}: ${d.technique}/100`, `${l.deal}: ${d.deal}`, "", `${l.interests}: ${d.interests_found}/${d.interests_total}`, `${l.spin}: ${d.spin_stages}/3`, `${l.criteria}: ${d.objective_criteria}`, `${l.empathy}: ${d.empathy}`, `${l.tradeoffs}: ${d.tradeoffs}`, `${l.threats}: ${d.threats}`);
  if (d.tips.length) lines.push("", l.tips, ...d.tips.map((tip, i) => `${i + 1}. ${tip}`));
  if (d.turning_points.length) lines.push("", l.turning, ...d.turning_points.map((p) => `${p.turn}. «${p.quote}»\n   ${p.what}${p.coach ? `\n   ${p.coach}` : ""}`));
  if (d.mentor) lines.push("", l.mentor, d.mentor);
  if (r.player_moves.length) lines.push("", l.moves, ...r.player_moves.map((move, i) => `${i + 1}. ${move}`));
  return lines.join("\n") + "\n";
}

export function downloadReport(input: ReportInput, format: "txt" | "json"): void {
  const body = format === "txt" ? reportText(input) : JSON.stringify(reportSnapshot(input), null, 2) + "\n";
  const url = URL.createObjectURL(new Blob([body], { type: `${format === "txt" ? "text/plain" : "application/json"};charset=utf-8` }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `dialog-${input.createdAt.slice(0, 10)}.${format}`;
  document.body.appendChild(anchor);
  try { anchor.click(); }
  finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
