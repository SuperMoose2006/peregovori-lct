// campaign.test.ts — the "Кампания" (campaign) mode over the mock path:
//  (1) the offline synth produces the full 4-act arc the overview renders, and
//  (2) a stage started in campaign mode WITH a reputation value runs the same
//      greeting → opponent → debrief loop as any other scenario.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MockServer } from "../src/mock/mockServer";
import { synthCampaigns } from "../src/data/campaigns";
import { EPILOGUE_BANDS } from "../src/data/campaigns.generated";
import { epilogueKey } from "../src/components/CampaignScreen";
import { SCENARIO_MAP } from "../src/data/scenarios";
import type { ServerMsg } from "../src/types";

function harness() {
  const messages: ServerMsg[] = [];
  let waiter: { pred: (m: ServerMsg) => boolean; resolve: (m: ServerMsg) => void } | null = null;
  const server = new MockServer((m) => {
    messages.push(m);
    if (waiter && waiter.pred(m)) {
      const w = waiter;
      waiter = null;
      w.resolve(m);
    }
  });
  const waitFor = (pred: (m: ServerMsg) => boolean, ms = 4000) =>
    new Promise<ServerMsg>((resolve, reject) => {
      const found = messages.find(pred);
      if (found) return resolve(found);
      const timer = setTimeout(() => reject(new Error("timeout waiting for message")), ms);
      waiter = {
        pred,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      };
    });
  return { server, messages, waitFor };
}

test("offline synth produces the 4-act campaign overview", () => {
  for (const lang of ["ru", "en"] as const) {
    const campaigns = synthCampaigns(lang);
    assert.ok(campaigns.length >= 1, "at least one campaign is synthesized");
    const c = campaigns[0];
    assert.ok(c.title.length > 0);
    assert.ok(c.tagline.length > 0);
    assert.equal(c.stages.length, 4, "the arc has four acts");
    for (const st of c.stages) {
      // Each stage references a real scenario and carries narrative + metadata.
      assert.ok(SCENARIO_MAP[st.scenario_id], `stage references a known scenario (${st.scenario_id})`);
      assert.ok(st.act.length > 0);
      assert.ok(st.intro.length > 0);
      assert.ok(st.title.length > 0);
      assert.ok(st.icon.length > 0);
      assert.equal(typeof st.difficulty, "number");
    }
  }
});

test("campaign stage with reputation → greeting → opponent → debrief", async () => {
  const { server, messages, waitFor } = harness();
  const stage = synthCampaigns("ru")[0].stages[0];

  // Start a campaign act carrying an inbound reputation (as the App does between
  // stages). The mock accepts it as a starting-trust nudge and plays normally.
  server.send({
    type: "start",
    scenarioId: stage.scenario_id,
    lang: "ru",
    mode: "campaign",
    reputation: 40,
  });

  const greeting = await waitFor((m) => m.type === "greeting");
  assert.equal(greeting.type, "greeting");
  if (greeting.type === "greeting") {
    assert.equal(greeting.scenario.id, stage.scenario_id);
    assert.equal(greeting.state.status, "active");
    assert.equal(greeting.state.turn, 0);
  }

  let debrief: ServerMsg | null = null;
  for (let i = 0; i < 13 && !debrief; i++) {
    const before = messages.length;
    server.send({ type: "turn", text: "Что для вас важнее всего в этой сделке и почему именно это?" });
    const opp = await waitFor((m) => messages.indexOf(m) >= before && m.type === "opponent");
    assert.equal(opp.type, "opponent");
    if (opp.type === "opponent" && opp.state.status !== "active") {
      debrief = await waitFor((m) => m.type === "debrief");
      break;
    }
    debrief = messages.find((m) => m.type === "debrief") ?? null;
  }

  assert.ok(debrief, "the campaign stage reaches a debrief");
  if (debrief && debrief.type === "debrief") {
    assert.match(debrief.debrief.grade, /^[ABCDF]$/);
    assert.ok(debrief.debrief.overall >= 0 && debrief.debrief.overall <= 100);
  }

  server.close();
});

test("higher reputation raises the stage's starting trust", async () => {
  // The reputation carry should visibly nudge the opening trust in the mock,
  // demonstrating multi-stage progression (a strong prior act → warmer opponent).
  async function startTrust(reputation: number): Promise<number> {
    const { server, waitFor } = harness();
    server.send({ type: "start", scenarioId: "salary", lang: "ru", mode: "campaign", reputation });
    const g = await waitFor((m) => m.type === "greeting");
    server.close();
    return g.type === "greeting" ? g.state.trust : -1;
  }
  const low = await startTrust(-100);
  const high = await startTrust(100);
  assert.ok(high > low, `reputation carry lifts starting trust (${high} > ${low})`);
});

// ——— эпилог ———————————————————————————————————————————————————————————

test("полосы эпилога берутся из одного источника с бэкендом", () => {
  // Пороги генерируются из app/engine/campaigns.py::_EPILOGUE_BANDS вместе с
  // самими кампаниями. Тест сторожит не арифметику, а то, что список вообще
  // доехал: пустой массив молча уронил бы всех в «burnt».
  assert.equal(EPILOGUE_BANDS.length, 4);
  assert.deepEqual(EPILOGUE_BANDS.map(([, k]) => k),
    ["triumph", "solid", "mixed", "strained"]);
});

test("репутация ложится в полосу так же, как на сервере", () => {
  // Средний акт (средний балл минус 50), пороги по грейдам: A ≥ 85 → 35,
  // B ≥ 70 → 20, C ≥ 55 → 5, D ≥ 40 → −10 (решение владельца 19.10).
  const table: [number | null, string][] = [
    [50, "triumph"], [35, "triumph"], [34.9, "solid"], [20, "solid"],
    [19.9, "mixed"], [5, "mixed"], [4.9, "strained"], [-10, "strained"],
    [-10.1, "burnt"], [-50, "burnt"], [null, "mixed"],
  ];
  for (const [rep, want] of table) {
    assert.equal(epilogueKey(rep), want, `репутация ${rep}`);
  }
});

test("у каждой кампании эпилог полон на обоих языках", () => {
  for (const lang of ["ru", "en"] as const) {
    for (const c of synthCampaigns(lang)) {
      const keys = Object.keys(c.epilogue ?? {}).sort();
      assert.deepEqual(keys, ["burnt", "mixed", "solid", "strained", "triumph"],
        `кампания ${c.id} (${lang})`);
      for (const [k, v] of Object.entries(c.epilogue!)) {
        assert.ok(v.trim().length > 40, `${c.id}/${k}/${lang} слишком короток`);
      }
    }
  }
});

test("английский эпилог не протёк кириллицей", () => {
  for (const c of synthCampaigns("en")) {
    assert.ok(!/[а-яё]/i.test(c.tagline), c.id);
    for (const [k, v] of Object.entries(c.epilogue ?? {})) {
      assert.ok(!/[а-яё]/i.test(v), `${c.id}/${k}`);
    }
    for (const st of c.stages) {
      assert.ok(!/[а-яё]/i.test(st.act) && !/[а-яё]/i.test(st.intro), st.scenario_id);
    }
  }
});

test("офлайн-ядро знает обе кампании и не делит столы", () => {
  const cs = synthCampaigns("ru");
  assert.equal(cs.length, 2, "вторая кампания не доехала до офлайн-ядра");
  const sets = cs.map((c) => new Set(c.stages.map((s) => s.scenario_id)));
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const shared = [...sets[i]].filter((x) => sets[j].has(x));
      assert.equal(shared.length, 0, `кампании делят столы: ${shared}`);
    }
  }
});

test("каждый акт указывает на настоящий стол", () => {
  for (const c of synthCampaigns("ru")) {
    for (const st of c.stages) {
      assert.ok(SCENARIO_MAP[st.scenario_id], `${c.id}: нет стола ${st.scenario_id}`);
      assert.ok(st.title && st.title !== st.scenario_id, `${c.id}/${st.scenario_id} без названия`);
    }
  }
});

test("офлайн оппонент кампании тоже ссылается на репутацию", async () => {
  // Механика переноса репутации работала офлайн и была НЕ ВИДНА: сдвиг доверия
  // применялся молча, а «наслышан о вас» говорил только живой сервер. Игрок,
  // проходящий кампанию без сети, не имел ни одного признака, что прошлый акт
  // на что-то повлиял.
  const { MockServer } = await import("../src/mock/mockServer");

  const greet = async (reputationAvg: number | undefined, lang: "ru" | "en") => {
    let text: string | null = null;
    const srv = new MockServer((m: { type: string; text?: string }) => {
      if (m.type === "greeting") text = m.text ?? "";
    });
    srv.send({ type: "start", scenarioId: "supplier", lang, mode: "campaign",
               reputation: reputationAvg, reputationAvg } as never);
    for (let i = 0; i < 60 && text === null; i++) await new Promise((r) => setTimeout(r, 10));
    return text as string | null;
  };

  const warm = await greet(40, "ru");
  assert.ok(warm && /рассказывали|Говорят/.test(warm), `нет упоминания репутации: ${warm}`);

  const cold = await greet(-30, "ru");
  assert.ok(cold && /рассказывали|Говорят/.test(cold), `нет упоминания репутации: ${cold}`);
  assert.notEqual(warm, cold, "хорошая и дурная слава звучат одинаково");

  // Нейтральная репутация (ровное C) — это ОТСУТСТВИЕ слухов, а не слух о
  // нейтральности.
  const neutral = await greet(10, "ru");
  const none = await greet(undefined, "ru");
  assert.equal(neutral, none, "нейтральная репутация что-то добавила в приветствие");

  const warmEn = await greet(40, "en");
  assert.ok(warmEn && !/[а-яё]/i.test(warmEn), `кириллица в английском: ${warmEn}`);
});

test("итог кампании не называет чужую кампанию", async () => {
  // После аудита 17.10: экран итога общий, а говорил «Восхождение · итог» /
  // "The Climb · summary" и "Climb again" — и на «Своём деле».
  const { I18N } = await import("../src/i18n");
  for (const lang of ["ru", "en"] as const) {
    const c = I18N[lang].campaign;
    for (const s of [c.completeEyebrow, c.completeTitle, c.replay]) {
      assert.ok(!/восхожд|climb/i.test(s), `${lang}: «${s}» показывается и на «Своём деле»`);
    }
  }
});

test("офлайн: репутация вне кампании молчит, как на сервере", async () => {
  // Сервер добавляет реплику о репутации только при game_mode == "campaign";
  // офлайн-ядро — при любом присланном числе (инвариант 8).
  for (const [mode, heard] of [["practice", false], ["campaign", true]] as const) {
    let text: string | null = null;
    const srv = new MockServer((m: ServerMsg) => { if (m.type === "greeting") text = m.text; });
    srv.send({ type: "start", scenarioId: "salary", lang: "ru", mode, reputation: 80, reputationAvg: 40 } as never);
    for (let i = 0; i < 100 && text === null; i++) await new Promise((r) => setTimeout(r, 10));
    srv.close();
    const intro = Object.values((await import("../src/data/campaigns.generated")).REPUTATION_LINES)
      .some((line) => !!(line as { ru: string })?.ru && String(text).includes((line as { ru: string }).ru));
    assert.equal(intro, heard, `${mode}: «${text}»`);
  }
});

test("эпилог и приветствие читают средний акт, а не сумму (решение владельца 19.10)", async () => {
  // Пороги рассчитаны на один акт, а читалась сумма четырёх: ровное C (62 на
  // каждом акте) давало «триумф», как четыре A.
  const { campaignMood } = await import("../src/lib/progress");
  const evenC = [62, 62, 62, 62].map((overall) => ({ overall }));
  const fourA = [88, 90, 86, 92].map((overall) => ({ overall }));
  assert.equal(epilogueKey(campaignMood(evenC)), "mixed");
  assert.equal(epilogueKey(campaignMood(fourA)), "triumph");
  assert.equal(campaignMood([]), null, "до первого акта — ни полосы, ни приветствия");
  const { MockServer } = await import("../src/mock/mockServer");
  let text: string | null = null;
  const srv = new MockServer((m: { type: string; text?: string }) => { if (m.type === "greeting") text = m.text ?? ""; });
  srv.send({ type: "start", scenarioId: "supplier", lang: "ru", mode: "campaign", reputation: 36, reputationAvg: 12 } as never);
  for (let i = 0; i < 60 && text === null; i++) await new Promise((r) => setTimeout(r, 10));
  assert.ok(text && (text as string).startsWith("Здравствуйте"), `ровное C здоровается без «наслышан»: ${text}`);
});
