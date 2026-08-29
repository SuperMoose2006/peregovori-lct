// App.tsx — screen router (home / game / debrief / campaign) with RU/EN + light/dark toggles.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CampaignView, Debrief as DebriefData, Lang, Mode, StateView } from "./types";
import { I18N } from "./i18n";
import { useNegotiation } from "./api/useNegotiation";
import { getCampaigns } from "./api/campaigns";
import { ScenarioPicker } from "./components/ScenarioPicker";
import { ScreenHeading } from "./components/ScreenHeading";
import { SideNav } from "./components/SideNav";
import type { ExamCtx } from "./components/CourseScreen";
import {
  COURSE_BLOCKS, blockById, nextStep,
} from "./lib/courseMap";
import type { Exercise as CourseExercise } from "./lib/courseTypes";
import { MASTER_ID, recordExam, recordExercise } from "./lib/progress";
import { LayersPanel } from "./components/Setup";
import { ProgressCards, MethodCard, RailCard, DailyCard, MemoryCard } from "./components/Rail";
import { dailyTable } from "./lib/daily";
import { SkillsProfile, AchievementToasts, MilestoneCard } from "./components/Gamification";
import { detectLayers, pruneLayers, sessionLayers, NO_LAYERS, type LayerId, type Layers } from "./lib/layers";
import { Karl } from "./components/Mascot";
import { LazyScreen } from "./components/LazyScreen";
import { openingOf, type TrailPoint } from "./lib/rematch";
import { SCENARIO_MAP, SCENARIOS } from "./data/scenarios";
// CampaignComplete НЕ отложен: `ScenarioPicker` тянет этот же модуль статически
// ради карты кампании на домашнем экране, и отдельным файлом он бы не стал —
// была бы граница загрузки, за которой всегда уже всё загружено.
import { CampaignComplete } from "./components/CampaignScreen";
import { applyDebrief, loadPastRun, loadProfile, savePastRun, saveProfile, setDailyGoalTarget,
         activeCampaignId, chooseNextStep, emptyCampaign, getCampaignProgress,
         recordCampaignStage, resetCampaign,
         type GameResult, type Grade, type NextStepPick, type PastRun, type Profile } from "./lib/progress";
import { initAudioUnlock, isMuted, toggleMuted } from "./lib/sound";
import { GEN_TIMEOUT_MS, genReducer } from "./lib/net";
import { scrollTo, scrollTop } from "./lib/motion";
import { useModalShell } from "./lib/modal";

type Screen = "home" | "generating" | "gen_error" | "game" | "debrief" | "campaign_done" | "profile" | "course" | "warmup";

// ЧТО ГРУЗИТСЯ ПО ТРЕБОВАНИЮ, А ЧТО СРАЗУ.
//
// Домашний экран — это выбор стола, рейл и меню. Стол, разбор, курс и итог
// кампании до первого клика не нужны ни одному человеку, а весят больше, чем
// всё остальное вместе. Каждый из них едет своим файлом (см. LazyScreen), и
// каждый обязан честно сказать «не догрузился», а не крутить точки вечно.
//
// Пути ниже — ЕДИНСТВЕННОЕ место, где они называются: тот же путь в прогреве
// ниже даёт тот же кусок сборки, разные пути дали бы два.
const loadTable = () => import("./components/Table").then((m) => ({ default: m.Table }));
const loadDebrief = () => import("./components/Debrief").then((m) => ({ default: m.Debrief }));
const loadCourse = () => import("./components/CourseScreen").then((m) => ({ default: m.CourseScreen }));
const loadWarmup = () => import("./components/Warmup").then((m) => ({ default: m.Warmup }));
const loadRematchRail = () => import("./components/Rematch").then((m) => ({ default: m.RematchRail }));

/**
 * Прогрев на простое — цена, которой оплачен инвариант 5.
 *
 * «Ленивый» экран, которого нет в кеше, без сети не откроется: это не игра
 * офлайн, а половина страницы. Поэтому после первой отрисовки, на простое,
 * недостающие куски доезжают сами — и service worker кладёт их в кеш ровно так
 * же, как раньше клал статические. Разница только в ПОРЯДКЕ: первый экран их
 * больше не ждёт.
 *
 * Отказы глушатся молча: прогрев — это оптимизация, и его провал не должен
 * ничего показывать. Настоящий отказ увидит тот, кто в этот экран пойдёт.
 */
const WARM: Array<() => Promise<unknown>> = [
  loadTable, loadDebrief, loadCourse, loadWarmup, loadRematchRail,
  // Транспорты: с сервером и без него. Второй — офлайн-ядро, ради которого всё
  // это и делается.
  () => import("./realtime/transport"),
  () => import("./mock/mockServer"),
  // Пересчёт прошлой партии и развилка «а что если» — тоже движок.
  () => import("./lib/rematchReplay"),
  () => import("./api/whatif"),
  () => import("./lib/courseCheck"),
  // Банк упражнений: предикат капстоуна и экзамен мастера. С главной он
  // ушёл ради первой отрисовки, но без сети обязан быть на месте.
  () => import("./lib/courseExam"),
];

function warmScreens() {
  for (const load of WARM) load().catch(() => {});
}

// How long the finished table stays on screen before the scorecard takes over.
// Long enough to read the closing line and the outcome stamp, short enough that
// nobody reaches for the button first.
const OUTCOME_HOLD_MS = 2200;
type Theme = "light" | "dark" | null;

const LANG_KEY = "dialog.lang.v1";
const THEME_KEY = "dialog.theme.v1";
const LAYERS_KEY = "dialog.layers.v1";

/** Выбор слоёв — настройка игрока, а не свойство одной партии: он живёт в
 *  профиле и переживает перезагрузку. Читается защищённо, как язык и тема:
 *  приватный режим бросает исключение прямо из localStorage, а «ничего не
 *  включено» всегда остаётся верным ответом. */
function loadLayerPrefs(): Layers {
  try {
    const raw = localStorage.getItem(LAYERS_KEY);
    if (!raw) return NO_LAYERS;
    const saved = JSON.parse(raw) as Partial<Layers>;
    return {
      probe: !!saved.probe, voice: !!saved.voice, camera: !!saved.camera,
      avatar: !!saved.avatar, pokerface: !!saved.pokerface,
    };
  } catch {
    return NO_LAYERS;
  }
}


export default function App() {
  // ЯЗЫК И ТЕМА ПЕРЕЖИВАЮТ ПЕРЕЗАГРУЗКУ. Оба жили только в состоянии React:
  // англоязычный человек переключал язык, обновлял страницу — и снова видел
  // русский. Чтение защищено try/catch, как и профиль: приватный режим и
  // запрет на данные сайта бросают исключение прямо из localStorage, а
  // умолчание всегда остаётся верным ответом.
  const [lang, setLang] = useState<Lang>(() => {
    try {
      return localStorage.getItem(LANG_KEY) === "en" ? "en" : "ru";
    } catch {
      return "ru";
    }
  });
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return saved === "dark" || saved === "light" ? saved : null;
    } catch {
      return null;
    }
  });
  // Optional modality layers. `detectLayers` is the single source of truth for
  // what this environment can actually deliver — a saved preset can never switch
  // on something that does not exist (see pruneLayers).
  const layerStates = useMemo(() => detectLayers(), []);
  /** Чего хочет игрок (профиль, переживает перезагрузку) и что реально получила
   *  ИДУЩАЯ партия. Раньше это была одна переменная — и экзамен, гася слои,
   *  затирал ею выбор человека насовсем. */
  const [layerPrefs, setLayerPrefs] = useState<Layers>(() => pruneLayers(loadLayerPrefs(), layerStates));
  const [activeLayers, setActiveLayers] = useState<Layers>(NO_LAYERS);
  /** Дата «стола дня» этой партии — чтобы перезапуск (смена слоёв, переподключение)
   *  не потерял условие дня. */
  const [activeDaily, setActiveDaily] = useState<string | undefined>(undefined);
  /** Шторка слоёв. Живёт ЗДЕСЬ, а не в столе: смена слоя до первого хода
   *  перезапускает сессию, Table на это время размонтируется — и унёс бы шторку
   *  с собой ровно в тот момент, когда человек ею пользуется. */
  const [layersOpen, setLayersOpen] = useState(false);
  const closeLayers = useCallback(() => setLayersOpen(false), []);

  const [screen, setScreen] = useState<Screen>("home");
  const [mode, setMode] = useState<Mode>("practice");
  const [currentScenario, setCurrentScenario] = useState<string | null>(null);
  const [situation, setSituation] = useState("");
  // Exam mode: the name printed on the certificate (optional; falls back to a
  // placeholder on the certificate itself). Collected on the exam-mode picker.
  const [examName, setExamName] = useState("");
  // Custom-generation flow (net.genReducer): "generating" → "ready" (drop into
  // the game) or "failed" (show the retry/fallback screen). Guards a slow backend
  // racing the client timeout, and a hung generation always resolves to failure.
  const [genPhase, dispatchGen] = useReducer(genReducer, "idle");
  const [genErr, setGenErr] = useState<string | null>(null);
  // КАМПАНИЙ ДВЕ, И ОБЕ ИГРАЮТСЯ. Здесь лежит весь список, а не `cs[0]`: вторая
  // кампания («Своё дело» — четыре акта, эпилог на пять полос репутации,
  // зеркало для офлайна и тесты) была построена и не имела входа из интерфейса.
  // Прогресс каждой живёт в профиле по её идентификатору и переживает F5.
  const [campaigns, setCampaigns] = useState<CampaignView[]>([]);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  // Dedupe recording a stage result: each debrief is a fresh object, so identity
  // tells one stage's debrief from the next (and from a reset).
  const recordedDebrief = useRef<DebriefData | null>(null);
  // Retention profile (localStorage): best grades, attempts, day streak. Loaded
  // once; each debrief folds in a result and re-persists. `lastRecord` carries
  // the just-finished run's personal-best delta to the Debrief screen.
  const [profile, setProfile] = useState<Profile>(() => loadProfile());
  const [lastGame, setLastGame] = useState<GameResult | null>(null);
  // Капстоун курса: настоящая партия, запущенная из урока или экзамена блока.
  // Она идёт по обычному пути (движок судит, слои выключены), а курс узнаёт
  // результат из состояния партии — никакой отдельной «учебной» механики.
  const [drill, setDrill] = useState<{ ex: CourseExercise; blockId: string; exam?: ExamCtx } | null>(null);
  const [drillVerdict, setDrillVerdict] = useState<{ ok: boolean } | null>(null);
  const recordedDrill = useRef<DebriefData | null>(null);
  const recordedProgress = useRef<DebriefData | null>(null);
  // Sound layer: local mirror of the persisted mute flag drives the header
  // toggle's icon; the cues themselves read the flag live from lib/sound.
  const [muted, setMuted] = useState<boolean>(() => isMuted());

  // «Переиграй партию против себя вчерашнего». Три вещи, и все три — клиентские:
  //   rival     — партия, которая идёт РЯДОМ с текущей (снимается со стола при
  //               запуске; сервер между партиями ничего не помнит и не должен);
  //   trail     — состояния идущей партии по ходам, чтобы было с чем сравнивать;
  //   opening   — стартовые условия стола (turn 0). Условие дня и репутация акта
  //               меняют их ДО первого хода, и без замера переигровка встала бы
  //               на другой стол.
  const [rival, setRival] = useState<PastRun | null>(null);
  const [nextRival, setNextRival] = useState<{ past: PastRun; isThisRun: boolean } | null>(null);
  const [trail, setTrail] = useState<StateView[]>([]);
  const trailRef = useRef<StateView[]>([]);
  const [opening, setOpening] = useState<StateView | null>(null);
  const openingRef = useRef<StateView | null>(null);
  const recordedRun = useRef<DebriefData | null>(null);

  const laySheetRef = useRef<HTMLDivElement>(null);
  // Фокус внутрь, ловушка Tab, inert на фон, возврат фокуса на открывашку —
  // всё, без чего `aria-modal` на шторке был обещанием. См. lib/modal.ts.
  useModalShell(layersOpen, laySheetRef, closeLayers, { restoreTo: ".lay-open" });

  // Arm the AudioContext to unlock on the first user gesture (autoplay-safe).
  useEffect(() => {
    initAudioUnlock();
  }, []);

  // Один <video> и один <canvas> на всё приложение: провайдер медиа привязывает
  // к ним поток единожды. Пере-монтирование заставило бы браузер заново спросить
  // доступ к камере — посреди партии это выглядит как сбой.
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nego = useNegotiation(lang, { videoRef, canvasRef });
  const t = I18N[lang];

  // Apply theme to the document root (drives the CSS variables).
  useEffect(() => {
    const root = document.documentElement;
    if (theme) root.setAttribute("data-theme", theme);
    else root.removeAttribute("data-theme");
    try {
      if (theme) localStorage.setItem(THEME_KEY, theme);
      else localStorage.removeItem(THEME_KEY);
    } catch {
      /* не суметь запомнить выбор — не повод его не применить */
    }
  }, [theme]);


  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* приватный режим — выбор просто не переживёт перезагрузку */
    }
  }, [lang]);

  // Hold on the table for a beat when the debrief arrives, instead of swapping
  // the whole layout out from under the closing line. The handshake (or the
  // walk-out) is the climax of a negotiation; every game holds on the winning
  // shot before showing the box score. The player can skip the hold by pressing
  // the outcome strip's button, and the timer guarantees they never get stuck.
  useEffect(() => {
    if (!nego.debrief) return;
    const id = setTimeout(() => setScreen("debrief"), OUTCOME_HOLD_MS);
    return () => clearTimeout(id);
  }, [nego.debrief]);

  // Record every finished negotiation into the retention profile (any mode):
  // best-only-if-improved, attempts++, day streak. Deduped per debrief object.
  // Read fresh from storage before writing so the update is idempotent even if
  // React batching replays this effect.
  useEffect(() => {
    if (!nego.debrief) return;
    if (recordedProgress.current === nego.debrief) return;
    recordedProgress.current = nego.debrief;
    const scenarioId = nego.scenario?.id ?? currentScenario ?? "custom";
    const res = applyDebrief(loadProfile(), scenarioId, nego.debrief);
    saveProfile(res.profile);
    setProfile(res.profile);
    setLastGame(res);
  }, [nego.debrief, nego.scenario, currentScenario]);

  // След идущей партии: одно состояние на ход. Дедупликация по НОМЕРУ хода, а не
  // по ссылке: каждое сообщение сервера приносит новый объект состояния, и без
  // этого след раздувался бы дельтами аватара и распознавания.
  useEffect(() => {
    const st = nego.state;
    if (!st) {
      trailRef.current = [];
      openingRef.current = null;
      setTrail([]);
      setOpening(null);
      return;
    }
    if (st.turn === 0) {
      // Новая партия: стартовые условия снимаем ЗАМЕРОМ (см. lib/rematch).
      trailRef.current = [];
      openingRef.current = st;
      setTrail([]);
      setOpening(st);
      return;
    }
    const last = trailRef.current[trailRef.current.length - 1];
    if (last && last.turn >= st.turn) return;
    trailRef.current = [...trailRef.current, st];
    setTrail(trailRef.current);
  }, [nego.state]);

  // Партия закончилась — её ВХОД (стол, стартовые условия, реплики по порядку)
  // ложится в профиль. Не картинка партии: движок пересчитает её сам, потому
  // что он чистая функция от этого входа.
  //
  // Пишем только обычную практику за столом из каталога. Экзамен — никогда:
  // там нет ни подсказок, ни сопровождения, и сравнения тоже не бывает. Акт
  // кампании несёт репутацию предыдущего акта, а «своя сделка» вообще не имеет
  // сценария в каталоге — переигрывать нечем.
  useEffect(() => {
    const d = nego.debrief;
    if (!d || recordedRun.current === d) return;
    const scenarioId = nego.scenario?.id ?? currentScenario ?? "";
    const opening = openingRef.current;
    const grade = (["A", "B", "C", "D", "F"] as Grade[]).find((g) => g === d.grade);
    if (mode !== "practice" || !SCENARIO_MAP[scenarioId] || !opening || !grade) return;
    const moves = nego.log.filter((e) => e.kind === "me").map((e) => e.text);
    if (moves.length === 0) return;
    recordedRun.current = d;
    const at = new Date().toISOString();
    const stored = savePastRun({
      scenarioId, lang, at, opening: openingOf(opening), moves,
      grade, score: d.overall, economic: d.economic, relationship: d.relationship,
      technique: d.technique, dealText: d.deal_text, status: d.status,
    });
    // Соперником становится ЛУЧШАЯ партия за столом (savePastRun). Совпало
    // время — соперник и есть только что сыгранная партия, и говорить о ней
    // надо иначе: «в прошлый раз» про сегодняшнюю партию было бы неправдой.
    setNextRival({ past: stored, isThisRun: stored.at === at });
  }, [nego.debrief, nego.scenario, nego.log, currentScenario, mode, lang]);

  // Custom mode: while generating, the scenario is designed server-side (or by
  // the mock synth). Drive the outcome through the gen state machine: a greeting
  // resolves to "ready", a server error or the client timeout to "failed".
  useEffect(() => {
    if (genPhase !== "generating") return;
    if (nego.scenario) dispatchGen("greeting");
    else if (nego.error) {
      setGenErr(nego.error);
      dispatchGen("error");
    }
  }, [genPhase, nego.scenario, nego.error]);

  // Client-side timeout: a hung generation (~25s+ backend, or a silent stall)
  // must surface the failure UI, never an infinite "генерируем…".
  useEffect(() => {
    if (genPhase !== "generating") return;
    const id = setTimeout(() => {
      setGenErr(t.custom.timeout);
      dispatchGen("timeout");
    }, GEN_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [genPhase, t.custom.timeout]);

  // The gen state machine is the single source of truth for the custom sub-flow's
  // screen: generating spinner → game (ready) or the failure screen.
  useEffect(() => {
    if (genPhase === "generating") setScreen("generating");
    else if (genPhase === "ready") setScreen("game");
    else if (genPhase === "failed") setScreen("gen_error");
  }, [genPhase]);

  // Кампании грузятся СРАЗУ, а не при входе в режим: их знает ещё и карточка
  // «следующий шаг» на главной, которой надо назвать акт по имени. Перезапрос на
  // смене языка перелокализует арку; без сети приезжает офлайн-синтез.
  useEffect(() => {
    let cancelled = false;
    getCampaigns(lang).then((cs) => {
      if (cancelled) return;
      setCampaigns(cs);
      // Открытой остаётся та кампания, которую играли последней (см.
      // activeCampaignId): после перезагрузки человек обязан попасть в свою
      // арку, а не в начало чужой.
      setCampaignId((cur) => (cur && cs.some((c) => c.id === cur))
        ? cur : activeCampaignId(loadProfile(), cs.map((c) => c.id)));
    });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const campaign = useMemo(
    () => campaigns.find((c) => c.id === campaignId) ?? null, [campaigns, campaignId]);
  /** Прогресс ВЫБРАННОЙ кампании — производная профиля, а не своё состояние:
   *  иначе он снова разошёлся бы с хранилищем и снова обнулялся бы по F5. */
  const progress = useMemo(
    () => (campaignId ? getCampaignProgress(profile, campaignId) : emptyCampaign()),
    [profile, campaignId]);
  const campaignProgressOf = useCallback(
    (id: string) => getCampaignProgress(profile, id), [profile]);
  const pickCampaign = useCallback((id: string) => {
    setCampaignId(id);
    recordedDebrief.current = null;
  }, []);

  // When a campaign stage's debrief lands, record its result: push the grade,
  // advance the arc, and fold (overall − 50) into the running reputation. The
  // engine still owns scoring — reputation is only the next stage's trust nudge.
  useEffect(() => {
    if (mode !== "campaign" || !nego.debrief || !campaign || !campaignId) return;
    if (recordedDebrief.current === nego.debrief) return;
    recordedDebrief.current = nego.debrief;
    const d = nego.debrief;
    const total = campaign.stages.length;
    // Свёртка чистая и живёт в lib/progress; здесь остаётся только запись в
    // профиль. Обновление функциональное: этот эффект идёт ПОСЛЕ того, что
    // складывает XP и серию, и обязан класть акт поверх его результата.
    setProfile((prev) => {
      const next = recordCampaignStage(prev, campaignId, total, d.grade, d.overall);
      saveProfile(next);
      return next;
    });
  }, [mode, nego.debrief, campaign, campaignId]);

  // Итог капстоуна снимается с ТОГО ЖЕ состояния, что и грейд: предикат смотрит
  // только в поля движка, поэтому «сдал» здесь значит ровно то же, что в партии.
  useEffect(() => {
    if (!drill || !nego.debrief || !nego.state) return;
    if (recordedDrill.current === nego.debrief) return;
    recordedDrill.current = nego.debrief;
    const state = nego.state;
    const ex = drill;
    // БАНК УПРАЖНЕНИЙ ГРУЗИТСЯ ЗДЕСЬ, А НЕ НА ГЛАВНОЙ. Три обращения — предикат
    // капстоуна, длина экзамена мастера и его проходной балл — тянули на
    // домашний экран весь банк: 116 КБ формулировок и разборов на двух языках,
    // нужных только тому, кто уже играет упражнение курса. Момент подходящий:
    // сюда попадают ПОСЛЕ доигранной партии, файл давно в кеше от прогрева, а
    // если нет — эта же секунда всё равно уходит на разбор.
    let alive = true;
    void import("./lib/courseExam").then(({ checkDrill, COURSE_MASTER, MASTER_PASS_MARK }) => {
      if (!alive) return;
      const verdict = checkDrill(ex.ex, state);
      setDrillVerdict({ ok: verdict.ok });
      setProfile((prev) => {
        let next = ex.exam
          ? recordExam(prev, ex.blockId, ex.exam.score + (verdict.ok ? 2 : 0),
                       ex.exam.total, ex.exam.passMark).profile
          : recordExercise(prev, ex.blockId, ex.ex.id, ex.ex.xp, verdict.ok).profile;
        // Экзамен мастера считается по числу СДАННЫХ партий: две из трёх и он
        // закрыт. Отдельной попытки не заводим — переигрывать можно любую.
        if (ex.blockId === MASTER_ID) {
          const solved = next.course[MASTER_ID]?.solved.length ?? 0;
          if (solved >= MASTER_PASS_MARK && !next.course[MASTER_ID]?.passed) {
            next = recordExam(next, MASTER_ID, solved, COURSE_MASTER.length, MASTER_PASS_MARK).profile;
          }
        }
        saveProfile(next);
        return next;
      });
    });
    return () => { alive = false; };
  }, [drill, nego.debrief, nego.state]);

  // Куда именно ведёт кнопка курса: первый незакрытый урок, а не «в курс».
  const courseNext = useMemo(
    () => nextStep(COURSE_BLOCKS.map((b) => ({
      lessons: profile.course[b.id]?.lessons ?? [],
      passed: profile.course[b.id]?.passed ?? false,
    }))),
    [profile.course],
  );
  const [courseStart, setCourseStart] = useState<{ blockId: string; lesson: number | null } | null>(null);
  // Разминка перед актом кампании: блок курса, из которого берутся задания.
  const [warmupBlock, setWarmupBlock] = useState<string | null>(null);
  const openCourse = useCallback((at: { blockId: string; lesson: number | null } | null) => {
    setCourseStart(at);
    setScreen("course");
    scrollTop();
  }, []);

  const coursePassed = useMemo(
    () => COURSE_BLOCKS.filter((b) => profile.course[b.id]?.passed).length,
    [profile.course],
  );

  /**
   * «Ваш следующий шаг» — один вход вместо восьми равноправных.
   *
   * Правило выбора здесь НЕ ЖИВЁТ: его считает `chooseNextStep` — чистая функция
   * от профиля и трёх списков, поэтому оно проверяется тестом, а не глазами.
   * Всё, что нужно App, — подать ей каталог, кампании и стол дня и увести клик
   * туда, куда она показала. Считается офлайн, из localStorage (инвариант 5).
   */
  const route = useMemo(
    () => chooseNextStep(profile, {
      tables: SCENARIOS.map((sc) => ({ id: sc.id, difficulty: sc.diff })),
      campaigns: campaigns.map((c) => ({ id: c.id, stages: c.stages.length })),
      dailyScenarioId: dailyTable().scenarioId,
    }),
    [profile, campaigns],
  );

  // Прогрев экранов — после первой отрисовки и только на простое: домашний
  // экран не должен соревноваться за сеть с тем, что понадобится через минуту.
  useEffect(() => {
    const idle = (window as unknown as {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    }).requestIdleCallback;
    if (idle) { idle(warmScreens, { timeout: 4000 }); return; }
    const id = setTimeout(warmScreens, 1200);
    return () => clearTimeout(id);
  }, []);

  const isDark = theme ? theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  const toggleTheme = () => setTheme(isDark ? "light" : "dark");

  /**
   * ЕДИНСТВЕННАЯ ДВЕРЬ ЗА СТОЛ.
   *
   * Между «НАЧАТЬ →» и партией стоял полноэкранный экран подготовки: четыре
   * выключенных тумблера и инженерный инвариант «оценка та же», объяснённый
   * человеку, который ещё не сыграл ни одного хода. Экран убран, слои переехали
   * в шторку за столом и в профиль, а правило «партия на оценку идёт без слоёв»
   * больше не ветка роутера, а `sessionLayers` — чистая функция под тестом.
   *
   * Режим приходит параметром, а не из замыкания: `setMode` применяется только
   * к следующему рендеру, и клик по «столу дня» из режима «Экзамен» открывал бы
   * экзамен.
   */
  const launch = useCallback(
    (scenarioId: string, m: Mode, opts?: { daily?: string; reputation?: number; fixedOff?: boolean }) => {
      const use = sessionLayers(m, layerPrefs, layerStates, opts?.fixedOff);
      setActiveLayers(use);
      setActiveDaily(opts?.daily);
      // Соперник этой партии снимается со стола ОДИН раз, при заходе: иначе
      // запись собственного результата подменила бы соперника на самого себя
      // прямо посреди переигровки.
      setRival(loadPastRun(scenarioId));
      setNextRival(null);
      recordedRun.current = null;
      nego.start(scenarioId, m, undefined, opts?.reputation, use, opts?.daily);
      setScreen("game");
      scrollTop();
    },
    [layerPrefs, layerStates, nego],
  );

  const start = useCallback(
    (scenarioId: string) => {
      dispatchGen("reset"); // leave any stale custom-gen state behind
      setCurrentScenario(scenarioId);
      launch(scenarioId, mode);
    },
    [mode, launch],
  );

  /** Стол дня всегда обычная партия, чем бы ни был занят переключатель режима. */
  const startDaily = useCallback(
    (scenarioId: string) => {
      nego.clearError();
      setMode("practice");
      dispatchGen("reset");
      setCurrentScenario(scenarioId);
      // Дата снимается в момент клика и тут же уезжает в `session.init`: паузы,
      // в которую могла пройти полночь, между кликом и стартом больше нет.
      // Сервер всё равно сверяет её у себя.
      const today = dailyTable();
      launch(scenarioId, "practice", { daily: today.scenarioId === scenarioId ? today.day : undefined });
    },
    [nego, launch],
  );

  /** Клик по карточке маршрута. Каждый вид шага ведёт ровно туда, что назван:
   *  курс — в блок и урок, кампания — прямо в следующий акт выбранной арки,
   *  остальное — за стол. Никакого промежуточного «выберите, что дальше». */
  const goRoute = useCallback((pick: NextStepPick) => {
    if (pick.kind === "course" && pick.blockId) {
      openCourse({ blockId: pick.blockId, lesson: pick.lesson });
      return;
    }
    if (pick.kind === "campaign" && pick.campaignId) {
      const c = campaigns.find((x) => x.id === pick.campaignId) ?? null;
      setCampaignId(pick.campaignId);
      setMode("campaign");
      if (!c) { scrollTop(); return; }
      const p = getCampaignProgress(profile, pick.campaignId);
      const stage = c.stages[p.stageIndex];
      if (!stage) { setScreen("campaign_done"); return; }
      setCurrentScenario(stage.scenario_id);
      launch(stage.scenario_id, "campaign", { reputation: p.reputation });
      return;
    }
    if (!pick.scenarioId) return;
    if (pick.kind === "daily") { startDaily(pick.scenarioId); return; }
    nego.clearError();
    setMode("practice");
    dispatchGen("reset");
    setCurrentScenario(pick.scenarioId);
    launch(pick.scenarioId, "practice");
  }, [campaigns, profile, openCourse, launch, startDaily, nego]);

  const startDrill = useCallback(
    (ex: CourseExercise, ctx: { blockId: string; exam?: ExamCtx }) => {
      if (!ex.scenario_id) return;
      setDrill({ ex, blockId: ctx.blockId, exam: ctx.exam });
      setDrillVerdict(null);
      recordedDrill.current = null;
      // Слои выключены принудительно — капстоун обязан быть сравним с экзаменом.
      setMode("practice");
      setCurrentScenario(ex.scenario_id);
      launch(ex.scenario_id, "practice", { fixedOff: true });
    },
    [launch],
  );

  const backToCourse = useCallback(() => {
    // Возврат ведёт туда, откуда пришли: экзамен мастера — свой экран, иначе карта.
    setCourseStart(drill?.blockId === MASTER_ID ? { blockId: MASTER_ID, lesson: null } : null);
    setDrill(null);
    setDrillVerdict(null);
    nego.reset?.();
    setScreen("course");
  }, [drill, nego]);


  /** "прочитано n из m" — answered-correctly over asked. Counted from the log,
   *  so it needs no extra state and survives a re-render. */
  /** Same counts, shaped for the debrief card. Undefined when nothing was asked,
   *  so the card is absent rather than showing a hollow "0 / 0". */
  const probeStats = useMemo(() => {
    const asked = nego.log.filter((e) => e.kind === "probe");
    if (!asked.length) return undefined;
    return {
      asked: asked.length,
      right: asked.filter((e) => e.kind === "probe" && e.picked === e.answer).length,
    };
  }, [nego.log]);

  const probeTally = useMemo(() => {
    const asked = nego.log.filter((e) => e.kind === "probe");
    if (!asked.length) return undefined;
    const right = asked.filter((e) => e.kind === "probe" && e.picked === e.answer).length;
    return t.probe.tally.replace("{n}", String(right)).replace("{m}", String(asked.length));
  }, [nego.log, t]);

  /**
   * Слои сменились — из шторки за столом или из профиля.
   *
   * Выбор сохраняется всегда. Идущая партия перезапускается ТОЛЬКО до первого
   * хода: слои приезжают в `session.init`, менять их на лету нечем, а рвать
   * начатые переговоры ради тумблера нельзя. Что именно получит партия, решает
   * `sessionLayers`: экзамен, акт кампании и капстоун гасят слои независимо от
   * того, что стоит в профиле.
   */
  const applyLayers = useCallback((next: Layers) => {
    const use = pruneLayers(next, layerStates);
    setLayerPrefs(use);
    try {
      localStorage.setItem(LAYERS_KEY, JSON.stringify(use));
    } catch {
      /* приватный режим — выбор просто не переживёт перезагрузку */
    }
    if (screen !== "game" || !currentScenario) return;
    if ((nego.state?.turn ?? 0) > 0 || nego.debrief) return;
    const useNow = sessionLayers(mode, use, layerStates, !!drill);
    const same = (Object.keys(useNow) as LayerId[]).every((k) => useNow[k] === activeLayers[k]);
    if (same) return; // нечего менять — и незачем рвать сессию
    setActiveLayers(useNow);
    nego.start(currentScenario, mode, undefined, undefined, useNow, activeDaily);
  }, [layerStates, screen, currentScenario, nego, mode, drill, activeLayers, activeDaily]);

  const startCustom = useCallback(() => {
    if (!situation.trim()) return;
    setCurrentScenario(null);
    setGenErr(null);
    setActiveLayers(NO_LAYERS); // своя сделка идёт без слоёв — сравнимость та же
    setActiveDaily(undefined);
    nego.start("", "custom", situation);
    // dispatch drives the screen → "generating" (see the gen-phase effect above).
    dispatchGen("start");
    scrollTop();
  }, [nego, situation]);

  // gen_error fallback: abandon the custom generation and jump to the ready-made
  // scenario picker (practice mode) so a failed generation is never a dead end.
  const pickReadyScenario = useCallback(() => {
    dispatchGen("reset");
    setGenErr(null);
    nego.clearError();
    setMode("practice");
    setScreen("home");
    requestAnimationFrame(() => {
      scrollTo(document.getElementById("play"), { block: "start" });
    });
  }, [nego]);

  // Launch the current campaign act, carrying the running reputation into it. If
  // the arc is already finished, jump to the summit summary instead.
  const beginStage = useCallback(() => {
    if (!campaign) return;
    const total = campaign.stages.length;
    if (progress.stageIndex >= total) {
      setScreen("campaign_done");
      return;
    }
    const stage = campaign.stages[progress.stageIndex];
    setCurrentScenario(stage.scenario_id);
    launch(stage.scenario_id, "campaign", { reputation: progress.reputation });
  }, [campaign, progress.stageIndex, progress.reputation, launch]);

  // Debrief → advance: back to the arc overview (progress already recorded), or
  // to the summit summary after the final act.
  const nextAct = useCallback(() => {
    nego.reset();
    const total = campaign?.stages.length ?? 0;
    setScreen(progress.stageIndex >= total ? "campaign_done" : "home");
    scrollTop();
  }, [nego, campaign, progress.stageIndex]);

  const replayCampaign = useCallback(() => {
    // Обнуляется ОДНА кампания: вторая — отдельная история с отдельным прогрессом.
    if (campaignId) {
      setProfile((prev) => {
        const next = resetCampaign(prev, campaignId);
        saveProfile(next);
        return next;
      });
    }
    recordedDebrief.current = null;
    nego.reset();
    setScreen("home");
    scrollTop();
  }, [nego, campaignId]);

  // Switching modes clears a stale generation error from the custom view.
  const selectMode = useCallback(
    (m: Mode) => {
      nego.clearError();
      setMode(m);
    },
    [nego],
  );

  /** Почему тумблеры заперты — или null, если их можно трогать. */
  const layersLock =
    mode !== "practice" || drill ? t.layers.lockedMode
    : screen === "game" && ((nego.state?.turn ?? 0) > 0 || nego.debrief) ? t.layers.lockedStarted
    : null;

  const goHome = useCallback(() => {
    setLayersOpen(false);
    dispatchGen("reset");
    setGenErr(null);
    nego.reset();
    setScreen("home");
    scrollTop();
  }, [nego]);

  const openProfile = useCallback(() => {
    setScreen("profile");
    scrollTop();
  }, []);

  // Customizable daily goal: persist the chosen target (1..3). Read fresh from
  // storage so we never clobber a concurrently-recorded debrief's fields.
  const setGoalTarget = useCallback((target: number) => {
    const next = setDailyGoalTarget(loadProfile(), target);
    saveProfile(next);
    setProfile(next);
  }, []);

  // Mobile hero CTA: bring the opponent picker into view (it sits just below the
  // hero on the same home screen). Reduced-motion callers still land there.

  const retry = useCallback(() => {
    // Переподключение обязано вернуть ТУ ЖЕ партию: со «столом дня» и с
    // погашенными слоями капстоуна, а не «похожую».
    if (mode === "custom") startCustom();
    else if (currentScenario) launch(currentScenario, mode, { daily: activeDaily, fixedOff: !!drill });
  }, [mode, currentScenario, launch, startCustom, activeDaily, drill]);

  /** Прошлая партия, переигранная движком ход за ходом. Пересчёт только при
   *  смене соперника: движок — чистая функция, от времени результат не зависит.
   *
   *  Асинхронный он потому, что движок приезжает отдельным файлом (WARM выше).
   *  `null` здесь уже был честным ответом «переигрывать нечем» — панель просто
   *  не появляется, а не показывает пустую рамку (принцип 2). */
  const [rivalTrail, setRivalTrail] = useState<TrailPoint[] | null>(null);
  useEffect(() => {
    if (!rival) { setRivalTrail(null); return; }
    let alive = true;
    import("./lib/rematchReplay")
      .then((m) => { if (alive) setRivalTrail(m.replayRun(rival)); })
      .catch(() => { if (alive) setRivalTrail(null); });
    return () => { alive = false; };
  }, [rival]);
  /** Где сравнение честно: обычная практика (не капстоун курса), тот же стол и
   *  тот же язык — реплики опознаются по ключевым словам своего языка. Экзамен
   *  и акт кампании отсекаются самим режимом: там сопровождения не бывает. */
  // Локальные копии перед разметкой. Отложенный экран получает свои пропсы из
  // колбэка, а сужение `nego.scenario` в условии JSX до колбэка не доживает:
  // поле объекта TypeScript не считает неизменным, `const` — считает.
  const scenario = nego.scenario;
  const debrief = nego.debrief;

  const showRival =
    screen === "game" && mode === "practice" && !drill &&
    !!rival && !!rivalTrail && rivalTrail.length > 0 &&
    rival.scenarioId === nego.scenario?.id && rival.lang === lang;

  return (
    // Двухколоночная оболочка приложения: слева меню, справа тело.
    <div className="app">
      {/* «К содержимому» — первая остановка Tab на любом экране. Слева стоит
          навигатор на семь пунктов, и без этой ссылки каждый вход на экран
          стоил семи нажатий до первой строки содержимого. Видна только
          сфокусированной: это ориентир для клавиатуры, а не элемент макета. */}
      <a className="skip" href="#main">{t.a11y.skip}</a>
      <SideNav
        t={t}
        active={screen === "profile" ? "profile" : screen === "course" ? "course" : mode}
        onMode={(m) => { selectMode(m); if (screen !== "home") goHome(); }}
        onProfile={openProfile}
        onCourse={() => openCourse(null)}
      />
      {/* `playing` включает заполнение окна: за столом высоту раздаёт флекс, а
          не магическое число в CSS. На остальных экранах страница листается
          как страница — там это было бы вредно. */}
      <div className={`appbody${screen === "game" ? " playing" : ""}`}>
      <div className="top">
        {/* Живые счётчики так, как их показывает игра. */}
        <div className="hudstats" aria-label={t.a11y.stats}>
          <span className="st-c" title={t.streakLabel.replace("{n}", String(profile.streak))}>
            <b aria-hidden="true">🔥</b> {profile.streak}
          </span>
          <span className="st-c">
            <b aria-hidden="true">💎</b> {profile.xp} XP
          </span>
        </div>
        <div className="brand">
          <span className="mark">
            Диалог<span className="dot">.</span>
          </span>
          <span className="sub">{t.tagline}</span>
        </div>
        <div className="controls">
          <div className="seg">
            <button className={lang === "ru" ? "on" : ""} onClick={() => setLang("ru")}>
              RU
            </button>
            <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>
              EN
            </button>
          </div>
          <div className="seg">
            {/* Имя из словаря, а не «theme»: aria-label — пользовательский
                контент (инвариант 4), и русский диктор читал «тхеме». Кнопка
                ещё и НАЗЫВАЕТ текущую тему — по одному значку не понять, что
                он показывает: включённое сейчас или то, куда переключит. */}
            <button
              onClick={toggleTheme}
              aria-label={isDark ? t.a11y.themeDark : t.a11y.themeLight}
              aria-pressed={isDark}
            >
              {isDark ? "☀" : "◐"}
            </button>
          </div>
          <div className="seg">
            <button
              onClick={() => setMuted(toggleMuted())}
              aria-label={muted ? t.sound.unmute : t.sound.mute}
              aria-pressed={muted}
            >
              {muted ? "🔇" : "🔊"}
            </button>
          </div>
        </div>
      </div>

      {/* ЕДИНСТВЕННЫЙ ОРИЕНТИР MAIN. Его не было нигде, кроме стола (там он
          обнимал ленту реплик) — то есть на главной, в профиле, в кампании, на
          экзамене, в своей сделке и в курсе диктору было не с чего начать
          чтение, а ссылке «к содержимому» некуда вести. Здесь он один на всё
          приложение, а колонка стола внутри стала обычным разделом. */}
      <main id="main" className="appmain" tabIndex={-1}>

      {screen === "home" && (
        <section className="screen">
          <div className="wrap">
            {/* Оболочка приложения не показывает маркетинговую шапку: здесь продукт
                и ЕСТЬ путь, и до переговоров надо доходить без пролистывания
                полутора экранов питча. Полоса XP живёт в правом рейле, а
                заголовок остаётся для экранных дикторов. */}
            {/* `key={mode}` не украшение: экран остаётся «home» при переходе
                Тренировка → Кампания → Экзамен → Своя сделка, заголовок не
                пересобирался, фокус оставался на кнопке навигатора — содержимое
                подменялось молча. Ключ делает смену раздела монтированием, а
                `ScreenHeading` на монтировании переводит фокус на себя. */}
            <ScreenHeading as="h1" className="sr-only" key={mode}>{t.modes[mode].title}</ScreenHeading>
            {/* Трёхчастная раскладка: именно правый рейл заставляет экран
                читаться приложением, а не широким документом. */}
            <div className="withrail">
            <div id="play">
            <ScenarioPicker
              t={t}
              lang={lang}
              mode={mode}
              onStart={start}
              situation={situation}
              customError={nego.error}
              onSituationChange={setSituation}
              onStartCustom={startCustom}
              campaign={campaign}
              campaignProgress={progress}
              onBeginStage={beginStage}
              campaigns={campaigns}
              campaignProgressOf={campaignProgressOf}
              onPickCampaign={pickCampaign}
              profile={profile}
              route={route}
              onRoute={goRoute}
              examName={examName}
              onExamNameChange={setExamName}
              onCourseBlock={(blockId) => openCourse({ blockId, lesson: null })}
              onWarmup={(blockId) => { setWarmupBlock(blockId); setScreen("warmup"); }}
            />
            </div>
            <aside className="rail">
                {/* Стол дня стоит ПЕРВЫМ в рейле: это единственная карточка,
                    которая завтра будет другой, и ради неё сюда возвращаются. */}
                <DailyCard t={t} lang={lang} onPlay={startDaily} />
                {/* Сразу под столом дня: память полезнее всего там, где человек
                    выбирает, во что играть. */}
                <MemoryCard t={t} lang={lang} profile={profile} />
                <ProgressCards t={t} lang={lang} profile={profile} onSetGoal={setGoalTarget} />
                {/* Курс живёт в сайдбаре, но с домашнего экрана его надо ещё и
                    ВИДЕТЬ: строка меню не рассказывает, что внутри девять блоков. */}
                <RailCard title={t.course.title}>
                  <p className="rc-note">
                    {t.course.blocksDone.replace("{n}", String(coursePassed))
                      .replace("{total}", String(COURSE_BLOCKS.length))}
                  </p>
                  <span className="rc-bar"><i style={{ width: `${(coursePassed / COURSE_BLOCKS.length) * 100}%` }} /></span>
                  {courseNext ? (
                    <p className="rc-next">
                      {t.course.nextUp}: <b>{blockById(courseNext.blockId)?.title[lang]}</b>
                    </p>
                  ) : null}
                  <button className="btn primary rc-go" onClick={() => openCourse(courseNext)}>
                    {courseNext ? t.course.continue : t.nav.course} →
                  </button>
                </RailCard>
                <MethodCard t={t} />
            </aside>
            </div>
          </div>
        </section>
      )}

      {screen === "generating" && (
        <section className="screen">
          <div className="wrap">
            <div className="gen">
              {/* Генерация своей сделки — самое длинное молчание в продукте:
                  до этого тут светился эмодзи. Ждать вместе с кем-то живым
                  легче, чем со значком, а текст на экране прежний. */}
              <div className="karl-mid">
                <Karl state="think" name={t.mascot.karl} alt={t.mascot.alt} />
              </div>
              <div className="gen-dots" aria-hidden="true">
                <i /><i /><i />
              </div>
              <ScreenHeading as="h1" className="gen-title">{t.custom.generating}</ScreenHeading>
              <p className="gen-sub">{t.custom.generatingSub}</p>
            </div>
          </div>
        </section>
      )}

      {screen === "gen_error" && (
        <section className="screen">
          <div className="wrap">
            <div className="gen genfail">
              <div className="karl-mid">
                <Karl state="concern" name={t.mascot.karl} alt={t.mascot.alt} />
              </div>
              <ScreenHeading as="h1" className="gen-title">{t.custom.errorHead}</ScreenHeading>
              {genErr ? <p className="genfail-msg">{genErr}</p> : null}
              <p className="gen-sub">{t.custom.errorSub}</p>
              <div className="genfail-actions">
                <button className="primary" onClick={startCustom}>{t.custom.retry}</button>
                <button className="ghost" onClick={pickReadyScenario}>{t.custom.orPickReady}</button>
              </div>
            </div>
          </div>
        </section>
      )}

      {screen === "game" && scenario && (
        <>
          {/* Mid-game connection health. "reconnecting" is a calm, non-blocking
              banner; "lost" degrades to a small panel offering a restart (which
              reconnects to the backend, or continues on the offline demo) or home.
              Progress/profile are already persisted, so neither loses the player's
              standing — only the in-flight server session. */}
          {nego.conn === "reconnecting" ? (
            <div className="conn-banner" role="status">
              <span className="conn-spin" aria-hidden="true" />
              <span>{t.conn.reconnecting}</span>
            </div>
          ) : null}
          {nego.conn === "lost" ? (
            <div className="conn-lost" role="alert">
              {/* Карл без реплики: строки ниже — сообщение продукта, а не его
                  слова, и подписывать их его именем было бы выдумкой. Он даёт
                  им лицо, и только. */}
              <div className="karl-note">
                <Karl state="concern" compact name={t.mascot.karl} alt={t.mascot.alt} />
                <div className="conn-lost-body">
                  <b>{t.conn.lostTitle}</b>
                  <span>{t.conn.lostBody}</span>
                </div>
              </div>
              <div className="conn-lost-actions">
                <button className="primary" onClick={retry}>{t.conn.retry}</button>
                <button className="ghost" onClick={goHome}>{t.conn.home}</button>
              </div>
            </div>
          ) : null}
          <LazyScreen lang={lang} load={loadTable} onHome={goHome} render={(Table) => (
          <Table
            t={t}
            lang={lang}
            mode={mode}
            kind={nego.kind}
            scenario={scenario}
            state={nego.state}
            log={nego.log}
            busy={nego.busy}
            phase={nego.phase}
            judgeActive={nego.judgeActive}
            avatarState={nego.avatarState}
            oppSpeaking={nego.oppSpeaking}
            layers={activeLayers}
            onOpenLayers={() => setLayersOpen(true)}
            layersOpen={layersOpen}
            layerFail={nego.layerFail}
            framesSent={nego.framesSent}
            observations={nego.observations}
            userSpeaking={nego.userSpeaking}
            transcript={nego.transcript}
            getMicLevel={nego.getMicLevel}
            onInterrupt={nego.interrupt}
            videoRef={videoRef}
            canvasRef={canvasRef}
            onSend={nego.turn}
            onHint={nego.requestHint}
            onQuit={goHome}
            debriefReady={!!nego.debrief}
            grade={nego.debrief?.grade ?? null}
            probeTally={activeLayers.probe ? probeTally : undefined}
            onProbeAnswer={activeLayers.probe ? nego.answerProbe : undefined}
            onSeeDebrief={() => setScreen("debrief")}
          />
          )} />
          {/* Панель «вы тогда · вы сейчас». Портал в <body> по той же причине,
              что и шторка слоёв: экран партии держит собственный transform и
              стал бы опорой для `position: fixed`. Стол при этом не трогается
              вовсе — сравнение это надстройка, а не часть игры. */}
          {showRival && rival && rivalTrail ? createPortal(
            <LazyScreen lang={lang} load={loadRematchRail} silent render={(RematchRail) => (
            <RematchRail
              t={t}
              lang={lang}
              past={rival}
              pastTrail={rivalTrail}
              nowTrail={trail}
              nowMoves={nego.log.filter((e) => e.kind === "me").map((e) => e.text)}
              nowOpening={opening ? openingOf(opening) : null}
              unit={scenario.headline_unit}
              lowerBetter={scenario.target < scenario.reservation}
            />
            )} />,
            document.body,
          ) : null}
        </>
      )}

      {screen === "game" && !nego.scenario && (
        <section className="screen">
          <div className="wrap">
            {/* Пустой экран ожидания сессии: строка та же, но ждёт её теперь
                не голая типографика. */}
            <div className="karl-mid" style={{ padding: "40px 0" }}>
              <Karl state="think" line={t.connecting} name={t.mascot.karl} alt={t.mascot.alt} />
            </div>
          </div>
        </section>
      )}

      {screen === "debrief" && drillVerdict && drill ? (
        <div className="wrap">
          <div className={`drill-verdict ${drillVerdict.ok ? "ok" : "bad"}`}>
            <b>{drill.blockId === MASTER_ID
              ? (drillVerdict.ok ? t.course.masterDrillPass : t.course.masterDrillFail)
              : (drillVerdict.ok ? t.course.drillPass : t.course.drillFail)}</b>
            <span>{drill.ex.goal ? drill.ex.goal[lang] : ""}</span>
            <button className="btn primary" onClick={backToCourse}>{t.course.backToCourse}</button>
          </div>
        </div>
      ) : null}

      {screen === "debrief" && debrief && (
        <LazyScreen lang={lang} load={loadDebrief} onHome={goHome} render={(Debrief) => (
        <Debrief
          t={t}
          d={debrief}
          probeStats={activeLayers.probe ? probeStats : undefined}
          observations={activeLayers.camera ? nego.observations : undefined}
          // Карточка «покерфейса» рисуется, ТОЛЬКО если слой и правда смотрел:
          // подпись «ноль срывов» под невставшей камерой — обещание вместо
          // наблюдения. Число просмотренных кадров едет вместе со счётчиком
          // именно затем, чтобы эти два случая нельзя было спутать.
          tells={activeLayers.pokerface && nego.tellFrames > 0
            ? { count: nego.tells, frames: nego.tellFrames }
            : undefined}
          mode={mode}
          lang={lang}
          scenarioTitle={nego.scenario?.title}
          playerName={examName}
          record={lastGame}
          game={lastGame}
          onRetry={retry}
          onHome={goHome}
          // "А что если…" replay: the player's OWN lines in order (from the chat
          // log) drive the deterministic branch. Runs over the same transport the
          // game used (real backend or offline synth) via the kind passed through.
          // Развилка тянет офлайн-ядро, поэтому приезжает по нажатию, а не с
          // экраном. Отказ загрузки — это `null`, то есть карточка не
          // появляется: ровно то же, что «развилку посчитать нечем».
          runWhatIf={(req) =>
            import("./api/whatif").then((m) => m.whatIf(nego.kind, req)).catch(() => null)}
          whatIfMoves={nego.log.filter((e) => e.kind === "me").map((e) => e.text)}
          whatIfScenarioId={nego.scenario?.id ?? currentScenario ?? undefined}
          whatIfUnit={nego.scenario?.headline_unit}
          // Direction: target below reservation = the player wants a LOWER number.
          whatIfLowerBetter={
            nego.scenario ? nego.scenario.target < nego.scenario.reservation : undefined
          }
          // Visible logrolling recap: the tradeable issues + the final package.
          // terms_conceded rides on the last StateView, retained through debrief.
          secondaryIssues={nego.scenario?.secondary_issues}
          termsConceded={nego.state?.terms_conceded}
          onCourse={(blockId) => openCourse({ blockId, lesson: null })}
          // «Переиграй против себя»: соперник, которого стол получит в следующей
          // партии. Появляется только там, где партия вообще записывается —
          // экзамена и своей сделки среди них нет.
          rematch={nextRival}
          onNext={mode === "campaign" ? nextAct : undefined}
          nextLabel={
            mode === "campaign"
              ? progress.stageIndex >= (campaign?.stages.length ?? Infinity)
                ? t.campaign.seeResults
                : t.campaign.nextAct
              : undefined
          }
        />
        )} />
      )}

      {screen === "campaign_done" && campaign && (
        <CampaignComplete
          t={t}
          lang={lang}
          campaign={campaign}
          progress={progress}
          onReplay={replayCampaign}
          onHome={goHome}
        />
      )}

      {screen === "profile" && (
        <>
          <SkillsProfile t={t} lang={lang} profile={profile} onHome={goHome} />
          {/* Слои — настройка, а не ворота перед партией. Здесь стоит их дом:
              выбранное отсюда достаётся следующему столу, а править его можно и
              за столом, до первого хода. */}
          <section className="screen">
            <div className="wrap">
              <div className="prof-layers">
                <h2 className="pl-head">{t.layers.head}</h2>
                <LayersPanel
                  t={t}
                  lang={lang}
                  layers={layerPrefs}
                  states={layerStates}
                  onToggle={(id) => applyLayers({ ...layerPrefs, [id]: !layerPrefs[id] })}
                  onPreset={applyLayers}
                />
              </div>
            </div>
          </section>
        </>
      )}

      {screen === "warmup" && warmupBlock && (
        <LazyScreen lang={lang} load={loadWarmup} onHome={goHome} render={(Warmup) => (
        <Warmup
          t={t}
          lang={lang}
          profile={profile}
          onProfile={(p) => { setProfile(p); saveProfile(p); }}
          blockId={warmupBlock}
          onDone={() => { setWarmupBlock(null); beginStage(); }}
          onSkip={() => { setWarmupBlock(null); setScreen("home"); }}
        />
        )} />
      )}

      {screen === "course" && (
        <LazyScreen lang={lang} load={loadCourse} onHome={goHome} render={(CourseScreen) => (
        <CourseScreen
          t={t}
          lang={lang}
          profile={profile}
          onProfile={(p) => { setProfile(p); saveProfile(p); }}
          onStartDrill={startDrill}
          onExit={goHome}
          startAt={courseStart}
        />
        )} />
      )}

      </main>

      {/* Шторка слоёв. Портал в <body>: экран партии держит собственный transform
          ради проявления, а он становится опорой для `position: fixed` и увёл бы
          шторку вбок. Замок объясняется словами: экзамен и капстоун гасят слои
          принудительно, а начатый стол их уже получил — оба случая обязаны
          читаться как запрет, а не как исчезнувший элемент. */}
      {layersOpen ? createPortal(
        <div className="lay-wrap">
          <div className="lay-scrim" onClick={() => setLayersOpen(false)} />
          <div ref={laySheetRef} tabIndex={-1}
               className="lay-sheet" role="dialog" aria-modal="true" aria-label={t.layers.head}>
            <div className="lay-head">
              <b>{t.layers.head}</b>
              <button className="lay-x" onClick={() => setLayersOpen(false)} aria-label={t.layers.close}>×</button>
            </div>
            <LayersPanel
              t={t}
              lang={lang}
              layers={screen === "game" ? activeLayers : layerPrefs}
              states={layerStates}
              onToggle={(id) => applyLayers({ ...activeLayers, [id]: !activeLayers[id] })}
              onPreset={applyLayers}
              lockNote={layersLock}
              // Настоящие отказы идущей партии. Без них шторка отвечала
              // «Голосом ✓» над микрофоном, которого не дали (принцип 2), —
              // а честная строка про это живёт на столе, СНАРУЖИ шторки,
              // то есть при открытой шторке скрыта от диктора.
              fail={screen === "game" ? nego.layerFail : undefined}
            />
          </div>
        </div>,
        document.body,
      ) : null}

      {/* Milestone celebration rides over any screen; it self-dismisses per card and
          never repeats a milestone (the ids are deduped against the saved profile). */}
      {lastGame ? <MilestoneCard t={t} lang={lang} game={lastGame} /> : null}
      {lastGame ? <AchievementToasts t={t} lang={lang} ids={lastGame.newAchievements} /> : null}

      <div className="foot">
        <span>Диалог · Negotiation Skills Simulator</span>
        <span>{t.footRight}</span>
      </div>
      </div>
    </div>
  );
}
