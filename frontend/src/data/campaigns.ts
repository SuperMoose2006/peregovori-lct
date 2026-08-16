// campaigns.ts — narrative "career arc" campaigns over existing scenarios.
// Mirrors backend/app/engine/campaigns.py: a campaign chains authored scenarios
// into a story; between stages the player's result carries as REPUTATION (the
// backend nudges the next opponent's starting trust). This module is the OFFLINE
// source: synthCampaigns() projects the same CampaignView the REST endpoint would
// return, so `npm run dev` (and the mock path) works with no backend running.
import type { CampaignStageView, CampaignView, Lang } from "../types";
import { SCENARIO_MAP } from "./scenarios";

type L = Record<Lang, string>;

interface StageDef {
  scenario_id: string;
  act: L; // short act label, e.g. "Акт I · Первый оффер"
  intro: L; // narrative setup shown before the stage
}

interface CampaignDef {
  id: string;
  icon: string;
  title: L;
  tagline: L;
  stages: StageDef[];
}

// Kept in sync with backend CAMPAIGNS (same ids/order/text) so the offline synth
// is indistinguishable from the served payload.
const CAMPAIGN_DEFS: CampaignDef[] = [
  {
    id: "career",
    icon: "🧗",
    title: { ru: "Восхождение", en: "The Climb" },
    tagline: {
      ru: "Пройдите путь от junior до фаундера — четыре переговорки, и репутация тянется за вами.",
      en: "From junior to founder — four negotiations, and your reputation follows you.",
    },
    stages: [
      {
        scenario_id: "salary",
        act: { ru: "Акт I · Первый оффер", en: "Act I · First Offer" },
        intro: {
          ru: "Вы только вышли на рынок. На столе — оффер. То, как вы проведёте этот разговор, задаст тон всей карьере.",
          en: "You are new to the market. An offer is on the table. How you handle this sets the tone for your whole career.",
        },
      },
      {
        scenario_id: "conflict",
        act: { ru: "Акт II · Тимлид", en: "Act II · Team Lead" },
        intro: {
          ru: "Пару лет спустя вы ведёте команду. Смежный отдел сорвал сроки и валит вину на вас. Репутация уже работает — на вас или против.",
          en: "A couple of years on, you lead a team. A partner team missed a deadline and blames you. Your reputation now works for — or against — you.",
        },
      },
      {
        scenario_id: "supplier",
        act: { ru: "Акт III · Закупки", en: "Act III · Procurement" },
        intro: {
          ru: "Вы отвечаете за закупки. Нужно сбить цену у надёжного поставщика, не сжигая отношения.",
          en: "You now own procurement. Drive a reliable supplier's price down without burning the relationship.",
        },
      },
      {
        scenario_id: "investor",
        act: { ru: "Акт IV · Фаундер", en: "Act IV · Founder" },
        intro: {
          ru: "Финал пути: вы — фаундер за столом с инвестором. Всё, чему вы научились, решится здесь.",
          en: "The finale: you are a founder across from an investor. Everything you've learned comes to a head.",
        },
      },
    ],
  },
];

// Project the campaign defs into the protocol-facing CampaignView (mirrors
// backend views.campaign_view): each stage pulls its title/icon/difficulty from
// the referenced scenario, keeping a single source for that scenario metadata.
export function synthCampaigns(lang: Lang): CampaignView[] {
  return CAMPAIGN_DEFS.map((c) => ({
    id: c.id,
    icon: c.icon,
    title: c.title[lang],
    tagline: c.tagline[lang],
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
