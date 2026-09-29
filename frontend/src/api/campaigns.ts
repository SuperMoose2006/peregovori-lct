// campaigns.ts (api) — fetch the campaign catalog over REST, mirroring the
// transport's WS-or-mock fallback: try GET /api/campaigns, and if the backend is
// unreachable (or VITE_MOCK=1 forces it) synthesize the same campaigns locally so
// the "Кампания" mode works fully offline.
import { apiFetch } from "./backend";
import type { CampaignView, Lang } from "../types";
import { synthCampaigns } from "../data/campaigns";
import { normalizeDifficulty } from "../lib/difficulty";

const FETCH_TIMEOUT_MS = 1500;

function mockForced(): boolean {
  return import.meta.env.VITE_MOCK === "1";
}

export async function getCampaigns(lang: Lang): Promise<CampaignView[]> {
  if (mockForced()) return synthCampaigns(lang);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await apiFetch(`/api/campaigns?lang=${lang}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { campaigns?: CampaignView[] };
    if (!data.campaigns || data.campaigns.length === 0) throw new Error("empty");
    return data.campaigns.map(campaign => ({ ...campaign,
      stages: campaign.stages.map(stage => ({ ...stage, difficulty: normalizeDifficulty(stage.difficulty) })),
    }));
  } catch {
    // Backend down / not running: fall back to the offline synth so the mode
    // still plays (same shape the endpoint would have returned).
    return synthCampaigns(lang);
  }
}
