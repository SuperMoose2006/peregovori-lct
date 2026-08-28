// campaigns.ts — проекция кампаний в протокольный CampaignView.
//
// САМИ КАМПАНИИ ЗДЕСЬ БОЛЬШЕ НЕ ЛЕЖАТ. Раньше литерал был переписан руками с
// бэкенда под комментарием «kept in sync» — и ничего, кроме комментария,
// синхронность не держало: тест сравнивал только длину списка на своей
// стороне. Теперь источник один (app/engine/campaigns.py), зеркало
// генерируется tools/sync_campaigns.py, расхождение валит сборку.
// campaigns.ts — narrative "career arc" campaigns over existing scenarios.
// Mirrors backend/app/engine/campaigns.py: a campaign chains authored scenarios
// into a story; between stages the player's result carries as REPUTATION (the
// backend nudges the next opponent's starting trust). This module is the OFFLINE
// source: synthCampaigns() projects the same CampaignView the REST endpoint would
// return, so `npm run dev` (and the mock path) works with no backend running.
import type { CampaignStageView, CampaignView, Lang } from "../types";
import { SCENARIO_MAP } from "./scenarios";
import { CAMPAIGN_DEFS } from "./campaigns.generated";

export { CAMPAIGN_DEFS };

// Project the campaign defs into the protocol-facing CampaignView (mirrors
// backend views.campaign_view): each stage pulls its title/icon/difficulty from
// the referenced scenario, keeping a single source for that scenario metadata.
export function synthCampaigns(lang: Lang): CampaignView[] {
  return CAMPAIGN_DEFS.map((c) => ({
    id: c.id,
    icon: c.icon,
    title: c.title[lang],
    tagline: c.tagline[lang],
    epilogue: Object.fromEntries(
      Object.entries(c.epilogue ?? {}).map(([k, v]) => [k, v[lang]]),
    ),
    stages: c.stages.map((st): CampaignStageView => {
      const def = SCENARIO_MAP[st.scenario_id];
      return {
        scenario_id: st.scenario_id,
        act: st.act[lang],
        intro: st.intro[lang],
        title: def ? def.title[lang] : st.scenario_id,
        icon: def ? def.icon : "🎯",
        difficulty: def ? def.diff : 3,
      };
    }),
  }));
}
