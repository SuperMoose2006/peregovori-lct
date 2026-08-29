// route.test.ts — две вещи, которых у продукта не было:
//
//  (1) ПРОГРЕСС КАМПАНИИ ПЕРЕЖИВАЕТ ПЕРЕЗАГРУЗКУ. Он жил в состоянии React,
//      и четырёхактная арка — единственная сюжетная причина вернуться —
//      обнулялась по F5. Теперь он в профиле, ПО ИДЕНТИФИКАТОРУ: кампаний две,
//      и вход во вторую не имеет права стереть первую.
//
//  (2) МАРШРУТ. На главной девять одинаковых столов, шесть пунктов меню и пять
//      виджетов рейла — и ни одного «начни отсюда». Правило выбора обязано быть
//      чистой функцией, чтобы его можно было проверить здесь, а не глазами.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAMPAIGN_MAX_ACTS,
  activeCampaignId,
  chooseNextStep,
  emptyCampaign,
  emptyProfile,
  getCampaignProgress,
  loadProfile,
  recordCampaignStage,
  resetCampaign,
  saveProfile,
  setCampaignProgress,
  type Profile,
  type RouteInput,
} from "../src/lib/progress";
import { COURSE_BLOCKS } from "../src/lib/courseMap";
import { SCENARIOS } from "../src/data/scenarios";

// Тот же вход, что подаёт App: каталог столов, кампании и стол дня.
const INPUT: RouteInput = {
  tables: SCENARIOS.map((s) => ({ id: s.id, difficulty: s.diff })),
  campaigns: [{ id: "career", stages: 4 }, { id: "own_shop", stages: 4 }],
  dailyScenarioId: "supplier",
};

const played = (p: Profile, id: string, grade: "A" | "B" | "C" | "D" | "F", score: number): Profile => ({
  ...p,
  scenarios: { ...p.scenarios, [id]: { bestGrade: grade, bestScore: score, attempts: 1, lastPlayed: "2026-01-01T00:00:00.000Z" } },
});

/** Профиль, в котором курс сдан целиком: иначе «всё пройдено» недостижимо. */
function courseDone(p: Profile): Profile {
  const course = { ...p.course };
  for (const b of COURSE_BLOCKS) {
    course[b.id] = {
      lessons: b.lessons.map((l) => l.idx), solved: [], missed: [],
      examBest: 1, examTotal: 1, passed: true, attempts: 1,
    };
  }
  return { ...p, course };
}

// ---------------------------------------------------------------------------
// Прогресс кампаний в профиле
// ---------------------------------------------------------------------------

test("кампания: акт складывается в профиль, репутация зажата, арка не убегает за финал", () => {
  const at = new Date("2026-03-01T10:00:00.000Z");
  let p = emptyProfile();
  assert.deepEqual(getCampaignProgress(p, "career"), emptyCampaign());

  p = recordCampaignStage(p, "career", 4, "B", 80, at);
  let c = getCampaignProgress(p, "career");
  assert.equal(c.stageIndex, 1, "следующий акт — второй");
  assert.equal(c.reputation, 30, "репутация = балл − 50");
  assert.deepEqual(c.results, [{ grade: "B", overall: 80 }]);
  assert.equal(c.updatedAt, at.toISOString());

  // Потолок ±100: четыре отличных акта не должны давать «репутацию 160».
  for (let i = 0; i < 3; i++) p = recordCampaignStage(p, "career", 4, "A", 95, at);
  c = getCampaignProgress(p, "career");
  assert.equal(c.stageIndex, 4);
  assert.equal(c.reputation, 100);

  // Арка пройдена — записывать больше некуда.
  const after = recordCampaignStage(p, "career", 4, "A", 95, at);
  assert.equal(getCampaignProgress(after, "career").stageIndex, 4);
});

test("кампании независимы: вторая не стирает первую, сброс бьёт по одной", () => {
  let p = emptyProfile();
  p = recordCampaignStage(p, "career", 4, "A", 90, new Date("2026-03-01T10:00:00.000Z"));
  p = recordCampaignStage(p, "own_shop", 4, "C", 60, new Date("2026-03-02T10:00:00.000Z"));
  assert.equal(getCampaignProgress(p, "career").stageIndex, 1);
  assert.equal(getCampaignProgress(p, "own_shop").stageIndex, 1);
  assert.equal(getCampaignProgress(p, "own_shop").reputation, 10);

  // Открытой остаётся та, которую играли последней.
  assert.equal(activeCampaignId(p, ["career", "own_shop"]), "own_shop");
  assert.equal(activeCampaignId(emptyProfile(), ["career", "own_shop"]), "career",
               "нетронутый профиль открывает первую");
  assert.equal(activeCampaignId(p, []), null);

  const reset = resetCampaign(p, "own_shop");
  assert.equal(getCampaignProgress(reset, "own_shop").stageIndex, 0);
  assert.equal(getCampaignProgress(reset, "career").stageIndex, 1, "чужая арка не тронута");
});

test("F5: прогресс кампании переживает перезагрузку, испорченный блоб не роняет профиль", () => {
  const store = new Map<string, string>();
  const g = globalThis as Record<string, unknown>;
  const had = "localStorage" in g;
  const prev = g.localStorage;
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  try {
    let p = emptyProfile();
    p = recordCampaignStage(p, "own_shop", 4, "B", 78, new Date("2026-03-05T09:00:00.000Z"));
    saveProfile(p);

    // Перезагрузка страницы — ровно это и делает App при монтировании.
    const back = loadProfile();
    assert.equal(getCampaignProgress(back, "own_shop").stageIndex, 1,
                 "после F5 играется акт II, а не акт I");
    assert.equal(getCampaignProgress(back, "own_shop").reputation, 28);
    assert.deepEqual(getCampaignProgress(back, "own_shop").results, [{ grade: "B", overall: 78 }]);
    assert.deepEqual(getCampaignProgress(back, "career"), emptyCampaign(), "вторая арка не тронута");

    // Старый (v4) блоб без кампаний грузится с пустой картой, а не падает.
    store.set("dialog.progress.v1", JSON.stringify({ version: 4, xp: 120, scenarios: {} }));
    const old = loadProfile();
    assert.equal(old.xp, 120);
    assert.deepEqual(old.campaigns, {});

    // Чужой блоб: мусор в одной кампании не уносит вторую, а подделанный
    // stageIndex не открывает четвёртый акт с нуля.
    store.set("dialog.progress.v1", JSON.stringify({
      version: 5, xp: 0, scenarios: {},
      campaigns: {
        career: { stageIndex: 99, reputation: 5000, results: [{ grade: "A", overall: 91 }, { grade: "Z", overall: 5 }] },
        own_shop: "не объект",
        "": { stageIndex: 1 },
      },
    }));
    const bad = loadProfile();
    const c = getCampaignProgress(bad, "career");
    assert.equal(c.stageIndex, CAMPAIGN_MAX_ACTS, "акт не убегает за потолок");
    assert.equal(c.reputation, 100, "репутация зажата ±100");
    assert.deepEqual(c.results, [{ grade: "A", overall: 91 }], "запись с чужим грейдом отброшена");
    assert.deepEqual(Object.keys(bad.campaigns), ["career"]);

    store.set("dialog.progress.v1", "{не json");
    assert.deepEqual(loadProfile().campaigns, {});
  } finally {
    if (had) g.localStorage = prev;
    else delete g.localStorage;
  }
});

// ---------------------------------------------------------------------------
// Маршрут: пять состояний
// ---------------------------------------------------------------------------

test("маршрут · пустой профиль → самый лёгкий стол каталога", () => {
  const pick = chooseNextStep(emptyProfile(), INPUT);
  assert.equal(pick.kind, "first");
  const easiest = Math.min(...SCENARIOS.map((s) => s.diff));
  assert.equal(pick.difficulty, easiest);
  assert.equal(pick.scenarioId, SCENARIOS.find((s) => s.diff === easiest)!.id);
  // Правило воспроизводимо: тот же профиль — тот же шаг.
  assert.deepEqual(chooseNextStep(emptyProfile(), INPUT), pick);
});

test("маршрут · недоигранный блок курса → доучить его", () => {
  const block = COURSE_BLOCKS[1];
  let p = played(emptyProfile(), "supplier", "A", 90);
  p = { ...p, course: { ...p.course, [block.id]: {
    lessons: [block.lessons[0].idx], solved: [], missed: [], examBest: 0, examTotal: 0,
    passed: false, attempts: 0,
  } } };
  const pick = chooseNextStep(p, INPUT);
  assert.equal(pick.kind, "course");
  assert.equal(pick.blockId, block.id);
  assert.equal(pick.resumed, true, "блок начат — карточка говорит «доучите»");
  assert.equal(pick.lesson, block.lessons[1].idx, "ведёт в первый непрочитанный урок");
});

test("маршрут · слабый рекорд → переиграть самый провальный стол", () => {
  let p = played(emptyProfile(), "supplier", "A", 92);
  p = played(p, "rent", "D", 45);
  p = played(p, "investor", "F", 20);
  const pick = chooseNextStep(p, INPUT);
  assert.equal(pick.kind, "rematch");
  assert.equal(pick.scenarioId, "investor", "F ниже D");
  assert.equal(pick.grade, "F");
  assert.equal(pick.score, 20);

  // C — не провал: движок считает партию сданной, и маршрут её не переигрывает.
  const solid = chooseNextStep(played(emptyProfile(), "supplier", "C", 58), INPUT);
  assert.notEqual(solid.kind, "rematch");
});

test("маршрут · начатая кампания → следующий акт именно её", () => {
  let p = played(emptyProfile(), "supplier", "A", 92);
  p = recordCampaignStage(p, "own_shop", 4, "B", 74, new Date("2026-03-05T09:00:00.000Z"));
  const pick = chooseNextStep(p, INPUT);
  assert.equal(pick.kind, "campaign");
  assert.equal(pick.campaignId, "own_shop");
  assert.equal(pick.stageIndex, 1, "акт II, а не акт I");

  // Пройденная арка следующим шагом уже не является.
  const done = setCampaignProgress(p, "own_shop", {
    stageIndex: 4, reputation: 20, results: [], updatedAt: "2026-03-06T09:00:00.000Z" });
  assert.notEqual(chooseNextStep(done, INPUT).kind, "campaign");

  // Непочатая кампания — тоже не «следующий шаг»: начать историю это выбор.
  const untouched = played(emptyProfile(), "supplier", "A", 92);
  assert.notEqual(chooseNextStep(untouched, INPUT).kind, "campaign");
});

test("маршрут · всё пройдено → стол дня", () => {
  let p = courseDone(played(emptyProfile(), "supplier", "A", 92));
  p = setCampaignProgress(p, "career", {
    stageIndex: 4, reputation: 60, results: [], updatedAt: "2026-03-01T09:00:00.000Z" });
  p = setCampaignProgress(p, "own_shop", {
    stageIndex: 4, reputation: 40, results: [], updatedAt: "2026-03-02T09:00:00.000Z" });
  const pick = chooseNextStep(p, INPUT);
  assert.equal(pick.kind, "daily");
  assert.equal(pick.scenarioId, INPUT.dailyScenarioId);
});

test("маршрут · сыграно, но курс не тронут → первый блок курса", () => {
  const pick = chooseNextStep(played(emptyProfile(), "supplier", "A", 92), INPUT);
  assert.equal(pick.kind, "course");
  assert.equal(pick.blockId, COURSE_BLOCKS[0].id);
  assert.equal(pick.resumed, false, "блок не начат — карточка говорит «откройте»");
});

test("маршрут · экзамен на сертификат и экзамен мастера в шаг не попадают", () => {
  // Ни одно состояние профиля не имеет права выдать шаг вида «сдавайте экзамен»:
  // это отдельное решение человека, а не подсказка продукта.
  const states: Profile[] = [
    emptyProfile(),
    played(emptyProfile(), "supplier", "D", 40),
    courseDone(played(emptyProfile(), "supplier", "A", 92)),
    recordCampaignStage(played(emptyProfile(), "supplier", "A", 92), "career", 4, "B", 70),
  ];
  for (const p of states) {
    const pick = chooseNextStep(p, INPUT);
    assert.ok(["first", "course", "rematch", "campaign", "daily"].includes(pick.kind));
    assert.notEqual(pick.blockId, "master", "экзамен мастера не маршрут");
  }
});
