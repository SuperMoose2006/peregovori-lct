import type { Lang, ScenarioView } from "../types";
import { apiFetch } from "../api/backend";
import { normalizeDifficulty } from "./difficulty";

export const ADMIN_DRAFT_KEY = "dialog.adminContext.v1";
export const DOMAINS = ["procurement", "career", "property", "investment", "team", "freelance"] as const;
export const TONES = ["collaborative", "analytical", "firm"] as const;
export const GOALS = ["price", "timing", "certainty"] as const;
export type AdminDomain = typeof DOMAINS[number];
export type AdminTone = typeof TONES[number];
export type AdminGoal = typeof GOALS[number];
export interface AdminDraft {
  domain: AdminDomain;
  topic: string;
  difficulty: number;
  tone: AdminTone;
  opponentRole: string;
  opponentGoals: AdminGoal[];
}
export interface AdminPreview {
  scenario: ScenarioView;
  context: AdminDraft & { lang: Lang };
  sourceScenarioId: string;
  sourceTitle: string;
  effects: string[];
}
export const ADMIN_LABELS = {
  ru: {
    domains: { procurement: "Закупки", career: "Карьера", property: "Аренда", investment: "Инвестиции", team: "Работа команды", freelance: "Услуги" },
    tones: { collaborative: "Открыт к сотрудничеству", analytical: "Аналитичный", firm: "Требовательный" },
    goals: { price: "Защитить цену", timing: "Согласовать сроки", certainty: "Получить гарантии" },
  },
  en: {
    domains: { procurement: "Procurement", career: "Career", property: "Rent", investment: "Investment", team: "Teamwork", freelance: "Services" },
    tones: { collaborative: "Cooperative", analytical: "Analytical", firm: "Firm" },
    goals: { price: "Protect the price", timing: "Agree on timing", certainty: "Secure certainty" },
  },
};
const PRESETS: Record<AdminDomain, { ru: [string, string]; en: [string, string]; difficulty: number; tone: AdminTone; goals: AdminGoal[] }> = {
  procurement: { ru: ["Цена поставки на следующий квартал", "Руководитель отдела продаж"], en: ["Supply price for the next quarter", "Head of Sales"], difficulty: 2, tone: "collaborative", goals: ["price", "certainty"] },
  career: { ru: ["Пересмотр зарплаты после успешного проекта", "Руководитель команды"], en: ["Salary review after a successful project", "Team Manager"], difficulty: 3, tone: "analytical", goals: ["price"] },
  property: { ru: ["Условия аренды на новый год", "Собственник помещения"], en: ["Rental terms for the next year", "Property Owner"], difficulty: 2, tone: "collaborative", goals: ["certainty"] },
  investment: { ru: ["Инвестиции для следующего этапа роста", "Инвестор"], en: ["Funding the next stage of growth", "Investor"], difficulty: 4, tone: "analytical", goals: ["price", "certainty"] },
  team: { ru: ["Сроки совместного проекта", "Руководитель смежной команды"], en: ["A shared project deadline", "Partner Team Lead"], difficulty: 3, tone: "firm", goals: ["timing"] },
  freelance: { ru: ["Стоимость и график нового контракта", "Представитель заказчика"], en: ["Price and schedule of a new contract", "Client Representative"], difficulty: 3, tone: "analytical", goals: ["timing", "certainty"] },
};
export function adminPreset(domain: AdminDomain, lang: Lang): AdminDraft {
  const p = PRESETS[domain];
  return { domain, topic: p[lang][0], opponentRole: p[lang][1], difficulty: normalizeDifficulty(p.difficulty), tone: p.tone, opponentGoals: [...p.goals] };
}
export function translateAdminPreset(draft: AdminDraft, from: Lang, to: Lang): AdminDraft {
  const preset = adminPreset(draft.domain, from);
  const untouched = draft.topic === preset.topic && draft.opponentRole === preset.opponentRole
    && normalizeDifficulty(draft.difficulty) === preset.difficulty && draft.tone === preset.tone
    && [...draft.opponentGoals].sort().join() === [...preset.opponentGoals].sort().join();
  return untouched ? adminPreset(draft.domain, to) : draft;
}
export function validAdminDraft(value: unknown): value is AdminDraft {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(key => !["domain", "topic", "difficulty", "tone", "opponentRole", "opponentGoals", "lang"].includes(key))) return false;
  if (v.lang !== undefined && v.lang !== "ru" && v.lang !== "en") return false;
  const validText = (text: unknown, min: number, max: number) => typeof text === "string" && text.trim().length >= min && text.length <= max && !/[\u0000-\u001f\u007f]/u.test(text);
  return DOMAINS.includes(v.domain as AdminDomain) && TONES.includes(v.tone as AdminTone)
    && validText(v.topic, 3, 120) && validText(v.opponentRole, 2, 80)
    && Number.isInteger(v.difficulty) && Number(v.difficulty) >= 1 && Number(v.difficulty) <= 5
    && Array.isArray(v.opponentGoals) && v.opponentGoals.length >= 1 && v.opponentGoals.length <= 3
    && new Set(v.opponentGoals).size === v.opponentGoals.length
    && v.opponentGoals.every(g => GOALS.includes(g));
}
export function loadAdminDraft(lang: Lang, storage?: Pick<Storage, "getItem">): AdminDraft {
  try {
    const raw = storage?.getItem(ADMIN_DRAFT_KEY);
    if (raw && raw.length <= 4096) {
      const draft: unknown = JSON.parse(raw);
      if (validAdminDraft(draft)) return { ...draft, difficulty: normalizeDifficulty(draft.difficulty) };
    }
  } catch { /* A blocked or corrupt local draft must not prevent configuration. */ }
  return adminPreset("procurement", lang);
}
export function saveAdminDraft(draft: AdminDraft, storage?: Pick<Storage, "setItem">): boolean {
  if (!storage || !validAdminDraft(draft)) return false;
  try { storage.setItem(ADMIN_DRAFT_KEY, JSON.stringify({ ...draft, difficulty: normalizeDifficulty(draft.difficulty) })); return true; }
  catch { return false; }
}
export function adminPreviewIsCurrent(preview: AdminPreview | null, draft: AdminDraft, lang: Lang): boolean {
  if (!preview || preview.context.lang !== lang) return false;
  const c = preview.context;
  return c.domain === draft.domain && c.topic === draft.topic.trim()
    && normalizeDifficulty(c.difficulty) === normalizeDifficulty(draft.difficulty)
    && c.tone === draft.tone && c.opponentRole === draft.opponentRole.trim()
    && [...c.opponentGoals].sort().join() === [...draft.opponentGoals].sort().join();
}
export async function requestAdminPreview(draft: AdminDraft, lang: Lang, signal: AbortSignal): Promise<AdminPreview> {
  const response = await apiFetch("/api/admin/scenarios/preview", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...draft, difficulty: normalizeDifficulty(draft.difficulty), lang }), signal,
  });
  if (!response.ok) throw new Error(response.status === 429 ? "rate" : response.status === 401 ? "auth" : response.status === 422 ? "invalid" : "server");
  const data: unknown = await response.json();
  const result = data as AdminPreview;
  if (!result || !validAdminDraft(result.context) || !result.scenario?.id?.startsWith("admin_")
      || typeof result.scenario.briefing !== "string" || !Array.isArray(result.effects)) throw new Error("server");
  return { ...result,
    context: { ...result.context, difficulty: normalizeDifficulty(result.context.difficulty) },
    scenario: { ...result.scenario, difficulty: normalizeDifficulty(result.scenario.difficulty) },
  };
}
