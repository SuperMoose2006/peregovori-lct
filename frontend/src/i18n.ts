// i18n.ts — RU/EN string tables. Ported from legacy-node/public/i18n.js + demo.html.
// Engine/scenario content is localized at the data layer (see data/scenarios.ts).
import type { Lang, Mode } from "./types";
import type { SkillId } from "./lib/progress";

export interface QuickMove {
  label: string;
  text: string;
}

export interface MeterLabels {
  trust: string;
  tension: string;
  info: string;
  leverage: string;
}

export interface Strings {
  tagline: string;
  // header sound toggle aria-labels (action-describing: what a tap will do)
  sound: { mute: string; unmute: string };
  eyebrow: string;
  heroTitle: string; // may contain <em> for the accented word
  heroLead: string;
  heroCta: string; // mobile hero primary button → jump to the opponent picker
  principles: string[]; // may contain <b>
  // "Why this teaches" — the proof-of-method scroll section under the hero.
  // Each panel grounds one principle in a concrete in-game micro-example; the
  // framing states the honesty guarantee (deterministic engine + scored debrief).
  teach: {
    head: string; // eyebrow above the section
    title: string; // serif headline
    panels: { tag: string; name: string; idea: string; example: string }[];
    framing: string; // one/two-sentence "why it works", confident not salesy
    demoCap: string; // caption under the price-dot micro-animation
  };
  pickHead: string;
  modesHead: string;
  soon: string;
  modes: Record<Mode, { title: string; desc: string }>;
  theirOffer: string;
  yourTarget: string;
  meters: MeterLabels;
  metersShort: MeterLabels;
  // one-line explanations shown on meter hover/focus (accessible tooltips)
  meterInfo: MeterLabels;
  // deal-tracker (price scale) labels
  tracker: {
    target: string;
    redline: string;
    theirOffer: string;
    // headline label once the deal closes — the settled price, not their offer
    settled: string;
    yourOffer: string;
    opening: string;
    history: string;
  };
  // deal-terms panel (visible logrolling / the "package") — game screen + debrief
  terms: {
    title: string; // panel heading
    explainer: string; // one-line "what is logrolling" note
    onTable: string; // suffix on a traded chip ("— на столе")
    notYet: string; // muted state for an untraded issue
    debriefLabel: string; // "Размен" line label in the debrief
    debriefNone: string; // gentle nudge when tradeable issues went unused
  };
  turn: string;
  // Turn counter framing (item 5b): a BUDGET before the first move ("12 ходов"),
  // then a positive "ход {n} из {max}" once play starts — never "ход 0/12".
  turnBudget: string; // "{n} ходов" — {n} substituted
  turnOf: string;     // "ход {n} из {max}" — {n},{max} substituted
  hint: string;
  // button on a coach hint that drops its worked example into the composer
  useLine: string;
  // placeholder text while the AI coach composes its answer
  hintPending: string;
  quit: string;
  interests: string;
  interestToast: string; // celebratory toast when a hidden interest is uncovered
  coachLabel: string; // inline "coach" tag on the judge's per-turn nudge
  // "graded by meaning" badge — shown beside coaching ONLY when the live semantic
  // judge scored the move (never offline/mock, where it'd overclaim). aria explains
  // the judge scores argumentation by meaning, not keywords.
  judgeBadge: { label: string; aria: string };
  // "judge-cam" chips (item 1): struck-through chip when the LIVE judge flags the
  // line as buzzword-spam / parroting (recognized a pattern, not real meaning).
  // Only ever shown when the live judge ran — the recognized-technique chips reuse
  // the already-localized labels the judge itself returns.
  judgeReject: string;
  // rubric scorecard chips (item 2): a compact, always-offline read of the LATEST
  // turn, derived purely from the deterministic engine's analysis/deltas/flags.
  scorecard: {
    interest: string;    // info rose sharply — an interest surfaced
    criteria: string;    // an objective-criterion move landed
    tradeoff: string;    // a trade-off (logroll) move landed
    tensionUp: string;   // tension spiked this turn
    trustUp: string;     // trust rose this turn
    aggression: string;  // a hostile line
  };
  typingLabel: string; // opponent "typing…" indicator while a reply is pending
  // Shown INSTEAD of typingLabel while the semantic judge is still reading the
  // player's line. During those seconds the opponent has not started composing —
  // calling it "typing…" would be false, and naming the judge turns the wait into
  // the moment the product's differentiator is visible.
  judgingLabel: string;
  batna: string;
  // mobile: label for the collapsible briefing/BATNA section in the game side strip
  moreLabel: string;
  // retention (localStorage profile): streak chip, card best-grade, debrief record
  streakLabel: string; // "🔥 {n}-day streak" ({n} substituted)
  notPlayed: string; // empty best-grade state on a scenario card
  personalBest: string; // debrief: "Personal best"
  newRecord: string; // debrief: "new record!" when the best is beaten
  placeholder: string;
  // Teaching placeholders shown in the composer for a new player's first few turns
  // (concrete technique nudges), then it settles to `placeholder`. RU/EN.
  placeholderNudges: string[];
  send: string;
  argLabel: string;
  connecting: string;
  usingMock: string;
  // gentle composer note as the input nears the length cap — "{n}" = chars left
  composerLimit: string;
  // mid-game connection health (reconnect banner / lost-connection panel)
  conn: {
    reconnecting: string; // non-blocking banner while retrying a dropped socket
    lostTitle: string; // heading once retries are exhausted
    lostBody: string; // calm explanation + reassurance progress is saved
    retry: string; // restart the scenario (reconnects, or continues offline)
    home: string; // bail to the home screen
  };
  // custom ("Своя сделка") mode
  custom: {
    head: string;
    placeholder: string;
    generate: string;
    generating: string;
    generatingSub: string;
    errorHead: string;
    errorSub: string; // reassuring sub-line under the failure head
    timeout: string; // message shown when generation runs past the client timeout
    orPickReady: string; // fallback link → jump to the ready-made scenario picker
    retry: string;
  };
  // exam mode ("Экзамен") — assessment framing
  exam: {
    eyebrow: string; // small "Certificate" kicker above the result
    resultTitle: string; // "Exam result"
    scenarioLabel: string; // "Scenario"
    // Named, printable certificate (passing runs only).
    nameLabel: string; // label above the pre-exam name field
    namePlaceholder: string; // placeholder / default when the field is left blank
    awardedTo: string; // "Выдан" — precedes the certified name on the certificate
    dateLabel: string; // "Дата" — precedes the (browser-side) date
    download: string; // "Скачать / Печать" — triggers window.print()
    certifies: string; // one-line credibility caption on the certificate
  };
  // campaign mode ("Кампания") — narrative career arc
  campaign: {
    overviewHead: string; // section head above the arc
    begin: string; // "Begin the climb" (first act)
    continue: string; // "Continue the climb" (later acts)
    nextAct: string; // debrief primary action, non-final act
    seeResults: string; // debrief primary action, final act
    locked: string; // future-act badge
    current: string; // current-act badge
    done: string; // completed-act badge
    reputation: string; // running-reputation chip label
    startFlag: string;  // flag above the current node on the path
    actOf: string; // "Act {n} of {total}" — {n}/{total} substituted
    completeEyebrow: string; // kicker on the completion screen
    completeTitle: string;
    avgLabel: string; // "Average score"
    replay: string; // restart the campaign
    verdicts: Record<string, string>; // grade (A..F) → title
  };
  // first-turn coach bubble (practice/campaign/custom; withheld in exam).
  // {name} = counterpart name, substituted at render.
  // The debrief's three beats. It used to be one 2750px document; now it is
  // Итог → Что вы упустили → Что сказал бы мастер, one action each.
  beats: { label: string; names: string[]; next: string; more: string; less: string };
  // Right-rail widgets of the "game" skin shell.
  goal: { title: string };
  rank: { title: string; toNext: string };  // toNext: "{n} XP до «{rank}»"
  method: { title: string };
  // The optional modality layers: the pre-game setup screen, the in-log question
  // and its verdict. Reaction names double as the question's answer options.
  layers: {
    head: string;
    what: string;            // "[i] что это"
    sameGrade: string;       // caption on every toggle — the honesty guarantee
    unavailable: string;     // badge on a layer the environment cannot deliver
    presets: string;
    start: string;
    back: string;
    names: Record<"probe" | "voice" | "camera" | "avatar", string>;
    blurbs: Record<"probe" | "voice" | "camera" | "avatar", string>;
    presetNames: Record<string, string>;
    explainHead: string;
    explain: string[];
  };
  // Маскоты. Карл ничего не придумывает — эти строки только про него самого,
  // а всё содержательное он берёт из строки тренера.
  mascot: {
    karl: string;
    tikhon: string;
    greeting: string;        // единственная реплика, которую он говорит сам
    thinking: string;        // пока думает над подсказкой
    rememberTitle: string;   // заголовок карточки Тихона в разборе
  };
  // Полоса живых слоёв под композером.
  live: {
    micOn: string; hearing: string; interrupt: string;
    inFrame: string; outFrame: string; peekNote: string; peekOpen: string;
  };
  probe: {
    ask: string;             // "Что с ней сейчас?"
    readFace: string;        // label above the enlarged portrait
    blocked: string;         // composer placeholder while the question is open
    tally: string;           // "прочитано {n} из {m}"
    right: string;
    wrong: string;
    // reaction id -> the short label shown as an answer option
    reactions: Record<string, string>;
    // reaction id -> one line explaining why it was that, shown after a miss
    why: Record<string, string>;
    debriefHead: string;     // "Как вы читали её"
    observation: string;     // shared badge: "наблюдение · не влияет на оценку"
  };
  // Left sidebar of the "game" skin's app shell. Only the entries that
  // correspond to something the product actually has — inventing a shop or a
  // leaderboard here would advertise what does not exist.
  nav: {
    training: string;
    campaign: string;
    custom: string;
    course: string;
    exam: string;
    progress: string;
    profile: string;
  };
  // Курс приёмов: блоки, уроки, девять типов заданий, экзамен блока.
  // Ярлыки приёмов и реакций берутся из тех же ключей, что и в движке, —
  // чтобы разбор упражнения говорил ровно то же, что чип под репликой.
  course: {
    title: string; lead: string; blocksDone: string; blockOf: string; toTable: string;
    allBlocks: string; tasksN: string; taskForms: [string, string, string]; theory: string;
    examTitle: string; examLead: string; examBest: string; examPassed: string;
    examStart: string; examMode: string; examFinish: string; examPass: string;
    examFail: string; examResult: string;
    toTasks: string; lessonDone: string; lessonComplete: string; lessonScore: string;
    stepOf: string; next: string; checkIt: string; correct: string; wrong: string;
    reference: string; freeformHint: string; matchHint: string; examQuit: string;
    recoveryTitle: string; nextUp: string; continue: string; actTeaches: string;
    coachNote: string;
    masterTitle: string; masterLead: string; masterLocked: string; masterStart: string;
    masterAgain: string; masterAbout: string; masterNext: string; masterPassed: string;
    masterPassedBody: string; masterKarlPass: string; masterKarlFail: string;
    masterProgress: string; masterDrillPass: string; masterDrillFail: string;
    warmupTitle: string; warmupSkip: string; warmupReady: string; warmupToTable: string;
    warmupKarl: string; warmupCta: string;
    drillStart: string; drillNote: string; drillPass: string; drillFail: string;
    backToCourse: string;
    karlTheory: string; karlPerfect: string; karlOk: string;
    karlExamPass: string; karlExamFail: string;
    tikhonTitle: string; tikhonBody: string;
    types: Record<string, string>;
    meters: Record<string, string>;
    reactions: Record<string, string>;
    moves: Record<string, string>;
    why: { missing: string; missingAny: string; forbidden: string; missingTerm: string;
           tooShort: string; weak: string; noNumber: string; generic: string };
  };
  // Header control that swaps the visual skin (dojo <-> game).
  skin: { label: string; toGame: string; toDojo: string };
  firstTurnCoach: string;
  // "Table setting" card filling the empty chat at turn 0. The opening frame a
  // juror stares at longest, and the moment a first-timer decides whether they
  // know what to do — so it states the scene and offers three real first lines.
  opening: {
    title: string;
    // "{role} Напротив — {name}. Её цена: {offer}. …" — `role` is ALREADY a full
    // sentence in the player's voice ("Вы — менеджер по закупкам: …"), so the
    // template must not prefix it with another "Вы —".
    scene: string;
    hint: string;   // one line on what a strong opening does
    lines: { tag: string; text: string }[];
  };
  dismiss: string; // aria-label for the bubble's × close
  // Turn-1 suggested-reply chip: a one-tap interest-probing opener that pre-fills
  // (never auto-sends) the composer, de-blanking the first move. label = the chip
  // caption; fill = the SPIN opener dropped into the box for the player to send.
  suggestChip: { label: string; fill: string };
  // guided first-negotiation onboarding (practice, first time only). Warm-coach
  // copy for the welcome beat, the meter/composer coach-marks, the tap-to-send
  // opener, and the two event-driven reveals (interest uncovered / their price moved).
  onboarding: {
    skip: string; // "пропустить" — always available
    next: string; // advance the guided intro
    gotIt: string; // dismiss an event-driven coach-mark
    stepOf: string; // "{n}/{total}" progress caption (substituted)
    welcomeTitle: string;
    welcomeBody: string;
    metersTitle: string;
    metersBody: string;
    composeTitle: string;
    composeBody: string;
    sendOpening: string; // label on the tap-to-send opener button
    suggestedOpening: string; // the actual SPIN/interest question that gets sent
    orTypeYourself: string; // secondary action: skip the opener, write your own
    interestTitle: string;
    interestBody: string;
    dealTitle: string;
    dealBody: string;
  };
  // debrief
  turningPoints: { title: string; turn: string }; // "Ключевые ходы" / "Ход {n}"
  // "Что сказал бы мастер" (item 3): on the single weakest turning point, a
  // side-by-side of the player's line vs a principled master reformulation. The
  // SELECTION (weak turn + missing technique) is an engine fact; the reformulation
  // is a quality Harvard/SPIN template keyed to what the debrief shows was missing.
  // Move tags shown under the player's line. Both engines hardcode their labels
  // in ONE language (the backend in English, the mock in Russian), so the client
  // localizes by the tag's stable `key` and treats the server label as a
  // fallback for keys it does not know.
  tagLabels: {
    spinSituation: string;
    spinProblem: string;
    spinImplication: string;
    spinNeedPayoff: string;
    question: string;    // an open question that is not a SPIN stage
    interests: string;
    empathy: string;
    criteria: string;
    batna: string;
    tradeoff: string;
    threat: string;
    hostile: string;
    concession: string;
    anchor: string;
    accept: string;
    rapport: string;
    offer: string;
  };
  // Debrief reveal: what the counterpart was actually protecting. Deterministic,
  // shown offline too — unlike `mentor` below.
  reveal: {
    title: string;
    found: string;   // badge on an interest the player drew out
    missed: string;  // badge on one they never asked about
    allFound: string;  // line under a clean sweep
    noneFound: string; // line when they surfaced nothing
  };
  // The AI mentor's closing word on the debrief. Rendered only when the backend
  // sent one (live AI); offline the engine's tips carry the debrief alone.
  mentor: {
    title: string;     // "Слово наставника"
    strength: string;  // label above the one thing that worked
    growth: string;    // label above the one thing to change next time
  };
  master: {
    title: string;   // "Что сказал бы мастер"
    yours: string;   // "Ваша реплика"
    label: string;   // "Мастер" (the quoted reformulation's speaker)
    why: string;     // one-line rationale prefix under the master line
    // reformulations keyed to the missing technique (picked by priority)
    criteria: string;  // objective_criteria === 0 → cite a market criterion
    interest: string;  // interests_found < interests_total → probe an interest
    tradeoff: string;  // tradeoffs === 0 → propose a logroll
    threat: string;    // threats > 0 → reframe off the threat
    // rationale tails matching each reformulation
    whyCriteria: string;
    whyInterest: string;
    whyTradeoff: string;
    whyThreat: string;
  };
  // Technique-floor explanation (item 4): one honest line when a great price is
  // capped by thin method (technique < 45 & economic high) — the "price ≠ grade" rule.
  techniqueFloor: string;
  // "А что если…" — the what-if replay card in the debrief.
  whatIf: {
    title: string; // section heading
    teaser: string; // inviting one-liner at the hoisted top of the card ("Один ход решал всё →")
    intro: string; // "Вы надавили здесь. Смотрите, что было бы иначе."
    reveal: string; // button to run the replay
    loading: string; // in-flight label
    again: string; // reset to try a different alt line
    altLabel: string; // "Сильная альтернатива" (chooser label)
    customPlaceholder: string; // free-text alt input
    wasLabel: string; // column: "Как было"
    couldLabel: string; // column: "Как могло быть"
    opponentLabel: string; // "Ответ оппонента"
    offerLabel: string; // "Их цена"
    meters: { trust: string; tension: string; info: string };
    betterBanner: string; // shown when the alt is genuinely better
    neutralBanner: string; // honest fallback when it isn't clearly better
    insteadOf: string; // "вместо" — "tension −3 instead of +22"
    uncovered: string; // "вы бы вскрыли интерес"
    trustHigher: string; // "доверие выше"
    priceFurther: string; // "цена сдвинулась дальше"
    unavailable: string; // graceful note when the replay can't be computed
    presets: [string, string]; // two strong preset alternatives
    mobileCta: string; // mobile-only: tap-to-expand the collapsed what-if card
  };
  debriefTitle: string;
  coachTitle: string;
  retry: string;
  toHome: string;
  outcome: {
    agreement: string; breakdown: string; active: string;
    // The table's closing beat reuses agreement/breakdown above; `see` is the
    // primary action on it and `preparing` its waiting state while the debrief
    // (and the AI mentor's closing word) is still being built.
    see: string; preparing: string;
  };
  sb: { economic: string; relationship: string; technique: string };
  stat: {
    spin: string;
    criteria: string;
    empathy: string;
    interests: string;
    tradeoffs: string;
    threats: string;
    arg: string;
  };
  footRight: string;
  quickMoves: QuickMove[];
  // gamification (localStorage): XP/ranks, daily goal, skill mastery, achievements
  gam: {
    rankLabel: string; // "rank" kicker
    toNext: string; // "{n} XP to «{name}»" ({n},{name} substituted)
    maxRank: string; // top-rank state instead of a "to next" line
    totalXp: string; // "{n} XP" total-xp chip
    levelUp: string; // "level up!" flourish on the debrief
    xpAwardLabel: string; // caption under the +XP count-up
    xpAwardFailed: string; // sober caption when the negotiation collapsed
    lowData: string; // skill bar shown before 2 games of data exist
    dailyGoal: string; // ring label
    dailyDone: string; // goal met today
    dailyTodo: string; // goal still open today
    dailyProgress: string; // "{done}/{target}" progress under the ring
    dailyTargetLabel: string; // aria/label for the 1/2/3 target selector
    dailyTargetSet: string; // "{n}/day" title on a target button ({n} substituted)
    freezeLabel: string; // "🧊 заморозка ×{n}" — the {word} in the chip
    freezeSaved: string; // gentle note the day a freeze saved the streak
    streakSkipped: string; // honest note: a D/F run didn't count toward the mastery streak
    // near-full-screen milestone celebration (7-day streak, rank-up)
    milestone: {
      kicker: string; // small eyebrow over the card
      dismiss: string; // primary "continue" button
      streakTitle: string; // "{n} days in a row" ({n} substituted)
      streakDetail: string; // supporting line under a streak milestone
      streakUnit: string; // word under the big count-up ("days")
      rankKicker: string; // "New rank"
      rankDetail: string; // supporting line under a rank-up
      rankUnit: string; // word under the big XP count-up ("XP")
    };
    skillsTitle: string; // profile screen heading
    skillsLink: string; // home entry point to the profile
    skillsSub: string; // profile screen subheading
    strongIn: string; // "Strong at"
    workOn: string; // "Work on"
    noGames: string; // empty-state on the profile
    back: string; // back to home
    gamesCount: string; // "{n} games" under a skill bar
    achievementsTitle: string;
    unlockedToast: string; // toast prefix when a badge unlocks
    locked: string; // aria/title for a not-yet-earned badge
    skillNames: Record<SkillId, string>;
    skillHints: Record<SkillId, string>;
  };
  // Screen-reader labels for non-textual UI (meters/rings/scales/log). Templates
  // use {name}-style tokens substituted at render.
  a11y: {
    chatLog: string;      // aria-label for the chat-log live region
    gameHeading: string;  // sr-only game-screen heading — "{name}" substituted
    grade: string;        // debrief grade ring — "{grade}"/"{score}" substituted
    scoreBar: string;     // a score bar — "{label}"/"{v}" substituted
    deal: string;         // deal-tracker summary — target/redline/offer substituted
    delta: string;        // a per-turn meter delta chip — "{label}"/"{value}"
    nav: string;          // aria-label for the game skin's left sidebar
    stats: string;        // aria-label for the game skin's counter strip
    hud: string;          // aria-label for the always-visible meter strip
  };
}

export const I18N: Record<Lang, Strings> = {
  ru: {
    tagline: "переговорный додзё",
    sound: { mute: "Выключить звук", unmute: "Включить звук" },
    eyebrow: "Гарвардский метод · SPIN · BATNA",
    heroTitle: "Учитесь <em>договариваться</em> — за столом, а не по учебнику.",
    heroCta: "Начать переговоры",
    heroLead:
      "Живой диалог с ИИ-оппонентом, у которого есть скрытые интересы, красная линия и характер. Исход зависит от вашей стратегии, формулировок и аргументов — каждая реплика разбирается в реальном времени.",
    principles: [
      "<b>Позиции ≠ интересы</b> — вскрывайте вопросами",
      "<b>Объективные критерии</b> вместо давления",
      "<b>BATNA</b> как рычаг",
      "<b>Размен</b> создаёт ценность",
    ],
    teach: {
      head: "Почему это учит",
      title: "Не тренинг по слайдам — стол, где решает метод.",
      panels: [
        {
          tag: "SPIN",
          name: "Позиции ≠ интересы",
          idea: "За жёсткой позицией всегда стоит интерес. Найдите его вопросом — и появится, о чём договариваться.",
          example:
            "Не «дайте скидку», а «почему для вас важен объём?» → интерес вскрыт, шкала «Информация» растёт, и их цена двигается — без давления.",
        },
        {
          tag: "Гарвард",
          name: "Объективные критерии",
          idea: "Спор мнений выигрывает тот, кто громче. Спор по критерию — тот, кто прав.",
          example:
            "«По рыночным данным справедливая ставка — X» → это законный рычаг: шкала «Рычаг» растёт, а уступка не выглядит капитуляцией.",
        },
        {
          tag: "Гарвард",
          name: "Размен создаёт ценность",
          idea: "Уступайте то, что дёшево для вас, но ценно для них. Так из одной суммы получаются две победы.",
          example:
            "«Если подвинемся по срокам — сможете по цене?» → размен (логроллинг) двигает сделку там, где лобовой торг застревает.",
        },
        {
          tag: "BATNA",
          name: "Запасной вариант как рычаг",
          idea: "Ваша лучшая альтернатива — источник спокойствия, а не дубина.",
          example:
            "Знаете свой запасной вариант — торгуетесь увереннее. Но угроза «уйду» в лоб бьёт по доверию: BATNA — рычаг, а не таран.",
        },
      ],
      framing:
        "Здесь не победить общими словами: исход считает детерминированный движок, а каждую реплику разбирают по смыслу — по стратегии, формулировке и аргументу. В конце вы получаете честную, воспроизводимую оценку с грейдом и разбором ключевых ходов.",
      demoCap: "Вскрыли интерес — их цена поехала к вашей цели.",
    },
    pickHead: "Выберите оппонента за столом",
    modesHead: "Режим тренировки",
    soon: "скоро",
    modes: {
      practice: { title: "🥋 Практика", desc: "Один сценарий из библиотеки. Подсказки включены." },
      campaign: { title: "📖 Кампания", desc: "Сюжетная карьерная арка, последствия переносятся." },
      custom: { title: "🎯 Своя сделка", desc: "Генерация сценария под вашу ситуацию." },
      exam: { title: "🏆 Экзамен", desc: "Без подсказок. Оценка, сертификат, рейтинг." },
    },
    theirOffer: "их цена",
    yourTarget: "ваша цель",
    meters: { trust: "Доверие", tension: "Напряжение", info: "Информация", leverage: "Рычаг" },
    metersShort: { trust: "Дов", tension: "Напр", info: "Инфо", leverage: "Рыч" },
    meterInfo: {
      trust: "Доверие: растёт от эмпатии и честной аргументации, падает от давления и угроз.",
      tension: "Напряжение: растёт от давления, угроз и грубости; спадает, когда вы признаёте интересы.",
      info: "Информация: растёт, когда вы вскрываете скрытые интересы вопросами (SPIN).",
      leverage: "Рычаг: растёт от BATNA и объективных критериев, а не от эмоций.",
    },
    tracker: {
      target: "цель",
      redline: "красная линия",
      theirOffer: "их цена",
      settled: "сделка",
      yourOffer: "ваша цена",
      opening: "старт",
      history: "динамика их цены",
    },
    terms: {
      title: "Условия сделки",
      explainer: "Уступая то, что дёшево для вас, но ценно для них, вы двигаете цену — это размен (логроллинг).",
      onTable: "на столе",
      notYet: "ещё не предложено",
      debriefLabel: "Размен",
      debriefNone: "Вы не использовали размен — это упущенная ценность.",
    },
    turn: "ход",
    turnBudget: "{n} ходов",
    turnOf: "ход {n} из {max}",
    hint: "подсказка",
    useLine: "Вставить",
    hintPending: "Коуч подбирает реплику…",
    quit: "выйти",
    interests: "Раскрытые интересы",
    interestToast: "Вы вскрыли интерес",
    coachLabel: "тренер",
    judgeBadge: {
      label: "судит ИИ по смыслу",
      aria: "Семантический ИИ-судья оценивает аргументацию по смыслу, а не по ключевым словам.",
    },
    judgeReject: "распознал шаблон, не смысл",
    scorecard: {
      interest: "вскрыли интерес",
      criteria: "объективный критерий",
      tradeoff: "размен",
      tensionUp: "↑ напряжение",
      trustUp: "↑ доверие",
      aggression: "агрессия",
    },
    typingLabel: "печатает…",
    judgingLabel: "ИИ-судья разбирает вашу реплику…",
    batna: "BATNA",
    moreLabel: "Брифинг и BATNA",
    streakLabel: "🔥 {n} дн. подряд",
    notPlayed: "не пройдено",
    personalBest: "Личный рекорд",
    newRecord: "новый рекорд!",
    placeholder: "Ваша реплика своими словами…",
    placeholderNudges: [
      "Спросите, ПОЧЕМУ это важно для них…",
      "Сошлитесь на рыночные данные или объективный критерий…",
      "Предложите размен: «если…, то…»…",
    ],
    send: "Отправить",
    argLabel: "аргум.",
    connecting: "Соединение…",
    usingMock: "демо-режим (без сервера)",
    composerLimit: "Осталось {n} символов",
    conn: {
      reconnecting: "Соединение потеряно — переподключаемся…",
      lostTitle: "Связь с сервером прервана",
      lostBody: "Не удалось переподключиться. Можно перезапустить сценарий — ваш прогресс и профиль сохранены.",
      retry: "Перезапустить сценарий",
      home: "На главную",
    },
    custom: {
      head: "Опишите вашу ситуацию",
      placeholder:
        "Опишите вашу переговорную ситуацию… Например: «Я фрилансер, клиент просит скидку 20% на проект, а я не готов опускаться ниже своей ставки. Нужно сохранить контракт и не обесценить работу.»",
      generate: "Сгенерировать сценарий →",
      generating: "Генерируем вашего оппонента…",
      generatingSub: "ИИ проектирует персону, скрытые интересы и зону торга под вашу ситуацию.",
      errorHead: "Не удалось сгенерировать сценарий",
      errorSub: "Иногда генерация не удаётся. Попробуйте ещё раз или начните с готового сценария.",
      timeout: "Генерация заняла слишком много времени. Возможно, сервер перегружен — попробуйте снова.",
      orPickReady: "…или выберите готовый сценарий",
      retry: "Попробовать снова",
    },
    exam: {
      eyebrow: "Сертификат · экзамен",
      resultTitle: "Результат экзамена",
      scenarioLabel: "Сценарий",
      nameLabel: "Имя для сертификата",
      namePlaceholder: "Участник",
      awardedTo: "Выдан",
      dateLabel: "Дата",
      download: "Скачать / Печать",
      certifies: "Тренажёр «Диалог» удостоверяет владение методом переговоров.",
    },
    campaign: {
      overviewHead: "Ваша карьерная арка",
      begin: "Начать восхождение →",
      continue: "Продолжить восхождение →",
      nextAct: "Следующий акт →",
      seeResults: "Итоги восхождения →",
      locked: "закрыто",
      current: "сейчас",
      done: "пройдено",
      reputation: "Репутация",
    startFlag: "Старт",
      actOf: "Акт {n} из {total}",
      completeEyebrow: "Восхождение · итог",
      completeTitle: "Путь пройден",
      avgLabel: "Средний балл",
      replay: "Пройти заново",
      verdicts: {
        A: "Мастер переговоров",
        B: "Уверенный переговорщик",
        C: "Крепкий середняк",
        D: "Есть над чем поработать",
        F: "Ещё учиться",
      },
    },
    beats: {
      label: "Части разбора",
      names: ["Итог", "Что вы упустили", "Что сказал бы мастер"],
      next: "Дальше: {name} →",
      more: "Подробный разбор ▾",
      less: "Свернуть подробности ▴",
    },
    goal: { title: "Цель дня" },
    rank: { title: "Ваш ранг", toNext: "{n} XP до «{rank}»" },
    method: { title: "Метод" },
    layers: {
      head: "Слои",
      what: "что это",
      sameGrade: "оценка та же",
      unavailable: "недоступно",
      presets: "Пресеты",
      start: "Начать переговоры",
      back: "к выбору оппонента",
      names: { probe: "Читай лицо", voice: "Голосом", camera: "Камера", avatar: "Лицо оппонента" },
      blurbs: {
        probe: "Игра спросит, что чувствует оппонент",
        voice: "Говорите вслух — и слышите ответ. Можно перебивать",
        camera: "Сигналы присутствия: кто в кадре, куда смотрите",
        avatar: "Оппонент меняется в лице по реакции движка",
      },
      presetNames: { classic: "Классика", read: "Читай лицо", call: "Видеозвонок", full: "Полный контакт" },
      explainHead: "Что это даёт",
      explain: [
        "Слои меняют состав разбора после партии, но никогда не влияют на грейд.",
        "Любой сценарий проходится с выключенными слоями.",
        "В экзамене слои выключены, чтобы сертификаты были сравнимы.",
      ],
    },
    mascot: {
      karl: "Карл",
      tikhon: "Тихон",
      greeting: "Не торопитесь с ценой. Сначала выясните, что для неё важно.",
      thinking: "Секунду, смотрю…",
      rememberTitle: "Тихон помнит",
    },
    live: {
      micOn: "микрофон активен",
      hearing: "слышу вас",
      interrupt: "перебить",
      inFrame: "камера · в кадре",
      outFrame: "камера · вне кадра",
      peekNote: "видно только вам",
      peekOpen: "проверить свет",
    },
    probe: {
      ask: "Что с ней сейчас?",
      readFace: "Читайте лицо",
      blocked: "Ответьте на вопрос, чтобы продолжить",
      tally: "прочитано {n} из {m}",
      right: "Верно.",
      wrong: "Мимо.",
      reactions: {
        warmed: "Потеплела", opened_up: "Приоткрылась", persuaded: "Убеждена данными",
        collaborated: "Готова сотрудничать", neutral: "Держит нейтралитет",
        not_yet: "Ещё не готова", pressured: "Под давлением",
        hardened: "Закрылась", offended: "Обиделась", walked_out: "Встаёт из-за стола",
      },
      why: {
        warmed: "Доверие выросло — вы попали в её интерес.",
        opened_up: "Информация подскочила: она поделилась тем, что скрывала.",
        persuaded: "Рычаг вырос — её убедил объективный критерий, а не нажим.",
        collaborated: "Напряжение упало, доверие выросло: вы предложили размен.",
        neutral: "Счётчики почти не двинулись — ход прошёл мимо неё.",
        not_yet: "Она не отказала, но и не сдвинулась: рано закрывать.",
        pressured: "Напряжение выросло — она восприняла это как нажим.",
        hardened: "Напряжение выросло, доверие упало — она закрылась.",
        offended: "Доверие обвалилось: резкий тон бьёт сильнее аргумента.",
        walked_out: "Она встаёт из-за стола — напряжение дошло до предела.",
      },
      debriefHead: "Как вы читали её",
      observation: "наблюдение · не влияет на оценку",
    },
    nav: { training: "Тренировка", campaign: "Кампания", custom: "Своя сделка",
           course: "Курс", exam: "Экзамен", progress: "Прогресс", profile: "Профиль" },
    course: {
      title: "Курс приёмов",
      lead: "Девять блоков: вопрос → эмоция → легитимность → сила → числа → создание ценности → защита → закрытие. В каждом уроки, задания и экзамен.",
      blocksDone: "Сдано блоков: {n} из {total}",
      blockOf: "блок {n} из {total}",
      toTable: "За стол →",
      allBlocks: "Все блоки",
      tasksN: "{n} заданий",
      taskForms: ["задание", "задания", "заданий"],
      theory: "теория",
      examTitle: "Экзамен блока",
      examLead: "{n} заданий, порог {pass} из {total} очков. Подсказки выключены, разбор — после сдачи.",
      examBest: "Лучший результат: {best} из {total}",
      examPassed: "сдан",
      examStart: "Сдавать экзамен",
      examMode: "экзамен",
      examFinish: "Завершить",
      examPass: "Экзамен сдан",
      examFail: "Экзамен не сдан",
      examResult: "{score} из {total} очков, порог — {pass}. Пересдать можно сразу: выборка будет другой.",
      toTasks: "К заданиям →",
      lessonDone: "Урок пройден",
      lessonComplete: "Урок пройден",
      lessonScore: "Верно: {n} из {total}",
      stepOf: "задание {n} из {total}",
      next: "Дальше",
      checkIt: "Проверить",
      correct: "Верно",
      wrong: "Не то",
      reference: "Как можно было",
      freeformHint: "Напишите реплику своими словами…",
      matchHint: "Выберите слева, затем справа — пара свяжется.",
      examQuit: "Прервать экзамен",
      recoveryTitle: "Повторить перед пересдачей",
      nextUp: "Дальше",
      continue: "Продолжить курс",
      actTeaches: "Приём этого акта",
      coachNote: "зачтено движком · комментарий тренера",
      masterTitle: "Экзамен мастера",
      masterLead: "Три партии подряд на столах, которых не было в блоках. Слои выключены.",
      masterLocked: "Откроется, когда сданы все девять блоков.",
      masterStart: "Начать",
      masterAgain: "Пройти снова",
      masterAbout: "{n} настоящие партии подряд, каждая со своим условием. Зачёт — от {pass} из {n}. Приёмы никто не подсказывает: реальные переговоры тоже не сообщают, какой из них сейчас нужен.",
      masterNext: "Партия {n} из {total} →",
      masterPassed: "Экзамен мастера сдан",
      masterPassedBody: "Три стола, ни одной подсказки, оценка тем же движком, что и всё остальное. Это и есть сравнимый результат.",
      masterKarlPass: "Сдано. Теперь то же самое — но за настоящим столом.",
      masterKarlFail: "Пока не сдано. Пройдите заново — партии те же, но играть их придётся иначе.",
      masterProgress: "Партия {n} из {total}",
      masterDrillPass: "Партия экзамена сдана",
      masterDrillFail: "Партия экзамена не сдана",
      warmupTitle: "Разминка",
      warmupSkip: "Пропустить",
      warmupReady: "Разминка пройдена",
      warmupToTable: "За стол",
      warmupKarl: "Теперь то же самое — но живьём, и цена будет двигаться по-настоящему.",
      warmupCta: "⚡ Разминка · 2 задания",
      drillStart: "Начать мини-переговоры",
      drillNote: "Настоящая партия на {n} ходов. Оценивает движок — как всегда.",
      drillPass: "Капстоун сдан",
      drillFail: "Капстоун не сдан",
      backToCourse: "← В курс",
      karlTheory: "Прочитали — теперь проверим на заданиях. Теория без применения выветривается за день.",
      karlPerfect: "Ни одной ошибки. Это и есть навык.",
      karlOk: "Нормально. Ошибка в тренажёре стоит дешевле, чем за столом.",
      karlExamPass: "Сдано. Следующий блок открыт.",
      karlExamFail: "Пока нет. Разберите промахи и заходите снова — выборка будет другой.",
      tikhonTitle: "Тихон помнит",
      tikhonBody: "Курс и партии живут в одном профиле: XP, ранги и стрик общие. Экзамен блока идёт без слоёв — чтобы результаты были сравнимы.",
      types: {
        choice: "Выбор реплики", spot_error: "Найти ошибку", order: "Порядок",
        match: "Соответствие", numeric: "Расчёт", freeform: "Своими словами",
        reaction: "Читай реакцию", meters: "Предскажи шкалы", drill: "Капстоун",
      },
      meters: { trust: "Доверие", tension: "Напряжение", info: "Информация",
                leverage: "Рычаг", up: "Вырастет", down: "Упадёт" },
      reactions: {
        walked_out: "Встала из-за стола", offended: "Оскорблена", hardened: "Закрылась",
        pressured: "Под давлением", not_yet: "Пока не готова", neutral: "Нейтральна",
        collaborated: "Готова сотрудничать", persuaded: "Убеждена данными",
        opened_up: "Приоткрылась", warmed: "Потеплела",
      },
      moves: {
        interests_probe: "вскрытие интереса", acknowledge: "активное слушание",
        objective_criteria: "объективный критерий", batna: "альтернатива",
        tradeoff: "размен", threat: "ультиматум", hostile: "грубость",
        accept: "закрытие", concession: "уступка", anchor: "якорь", offer: "предложение цены",
        spin_situation: "SPIN · ситуация", spin_problem: "SPIN · проблема",
        spin_implication: "SPIN · последствия", spin_needpayoff: "SPIN · выгода",
        open_question: "открытый вопрос", statement: "заявление", rapport: "контакт",
      },
      why: {
        missing: "Не хватает приёма: {move}",
        missingAny: "Нужен хотя бы один из: {moves}",
        forbidden: "Здесь нельзя: {move}",
        missingTerm: "Не назван вторичный вопрос, который вы разменивали",
        tooShort: "Слишком коротко — движку не из чего судить",
        weak: "Аргумент слабый: нет обоснования, цифры или источника",
        noNumber: "Нужна конкретная цифра",
        generic: "Ответ не подошёл",
      },
    },
    skin: { label: "Оформление", toGame: "Игровое оформление", toDojo: "Оформление «додзё»" },
    opening: {
      title: "Стол накрыт",
      scene: "{role} Напротив — {name}. Её цена: {offer}. Ваша цель: {target}, красная линия: {red}.",
      hint: "У неё три скрытых интереса. Пока вы их не вскрыли, спор идёт только о цене — а там выигрывает тот, кто сильнее давит.",
      lines: [
        { tag: "🎯 Интерес", text: "Что для вас важнее всего в этой сделке — и почему именно это?" },
        { tag: "📊 Критерий", text: "Прежде чем спорить о цифре: на какие данные мы оба могли бы опереться?" },
        { tag: "🔄 Размен", text: "Что вам дешевле уступить — сроки или объём? Возможно, нам есть чем обменяться." },
      ],
    },
    firstTurnCoach: "💡 Начните с интересов: узнайте, что важно второй стороне. Не давите ценой — сначала спрашивайте.",
    dismiss: "Закрыть подсказку",
    suggestChip: {
      label: "Спросите, что для них важно →",
      fill: "Что для вас важнее всего в этой сделке?",
    },
    onboarding: {
      skip: "Пропустить",
      next: "Далее →",
      gotIt: "Понятно",
      stepOf: "{n}/{total}",
      welcomeTitle: "Добро пожаловать за стол",
      welcomeBody:
        "Это тренажёр переговоров. Ведите диалог своими словами — исход зависит от того, ЧТО и КАК вы говорите. Секрет прост: не давите — сначала спрашивайте.",
      metersTitle: "Четыре шкалы стола",
      metersBody:
        "Доверие, Напряжение, Информация, Рычаг. Ведите доверие и информацию вверх, а напряжение — вниз. Наведитесь на любую, чтобы понять, что её двигает.",
      composeTitle: "Ваш ход — своими словами",
      composeBody:
        "Пишите как в жизни. Не знаете, с чего начать? Начните с вопроса — вскройте, что важно для собеседника.",
      sendOpening: "❓ Задать этот вопрос",
      suggestedOpening: "Что для вас важнее всего в этой сделке и почему?",
      orTypeYourself: "или напишу сам",
      interestTitle: "Вы вскрыли интерес",
      interestBody:
        "За позицией всегда стоит интерес. Вы спросили — и шкала «Информация» выросла. Так вы находите, о чём реально договариваться.",
      dealTitle: "Их цена поехала",
      dealBody:
        "Смотрите: их цена сдвинулась к вашей цели. Каждый удачный ход двигает её — следите за этой шкалой.",
    },
    turningPoints: { title: "Ключевые ходы", turn: "Ход" },
    tagLabels: {
      spinSituation: "SPIN · Ситуация",
      spinProblem: "SPIN · Проблема",
      spinImplication: "SPIN · Последствия",
      spinNeedPayoff: "SPIN · Выгода",
      question: "Открытый вопрос",
      interests: "Вскрытие интересов",
      empathy: "Активное слушание",
      criteria: "Объективный критерий",
      batna: "BATNA / рычаг",
      tradeoff: "Размен",
      threat: "Давление",
      hostile: "Грубость",
      concession: "Уступка",
      anchor: "Якорь",
      accept: "Закрытие",
      rapport: "Контакт",
      offer: "Оффер / число",
    },
    reveal: {
      title: "Что на самом деле было важно для второй стороны",
      found: "вы это вскрыли",
      missed: "вы не спросили",
      allFound: "Вы вскрыли всё, что она скрывала, — за столом вы играли с открытыми картами.",
      noneFound: "Вы вели переговоры вслепую — ни один из интересов так и не прозвучал.",
    },
    mentor: {
      title: "Слово наставника",
      strength: "Что сработало",
      growth: "Что изменить в следующий раз",
    },
    master: {
      title: "Что сказал бы мастер",
      yours: "Ваша реплика",
      label: "Мастер",
      why: "Почему сильнее:",
      criteria: "Давайте опираться не на позиции, а на объективный критерий: какая цена справедлива по рыночным данным для таких сделок?",
      interest: "Прежде чем говорить о цене — что для вас здесь важнее всего и почему? Хочу понять ваш интерес, а не только позицию.",
      tradeoff: "Давайте разменяем: если я уступлю в сроках, готовы ли вы двинуться по цене? Свяжем уступки в пакет.",
      threat: "Уберём давление со стола. Предлагаю решать по существу: какой критерий был бы честным для нас обоих?",
      whyCriteria: "объективный критерий убеждает сильнее позиционного торга (Гарвардский метод).",
      whyInterest: "интерес за позицией открывает пространство для сделки (Гарвардский метод, SPIN).",
      whyTradeoff: "размен по разным по ценности вопросам создаёт ценность, а не делит её (логроллинг).",
      whyThreat: "уход от угроз к критериям снижает напряжение и сохраняет отношения.",
    },
    techniqueFloor: "Отличная цена, но грейд ограничен: A/B нужно заслужить методом — интересы, критерии, размен, — а не только торгом.",
    whatIf: {
      title: "А что если…",
      teaser: "Один ход решал всё →",
      intro: "Ваш самый дорогой ход. Смотрите, что было бы, спроси вы иначе — с той же точки.",
      reveal: "Показать, что было бы иначе",
      loading: "Считаю развилку…",
      again: "Другая реплика",
      altLabel: "Сильная альтернатива",
      customPlaceholder: "…или впишите свою реплику",
      wasLabel: "Как было",
      couldLabel: "Как могло быть",
      opponentLabel: "Ответ оппонента",
      offerLabel: "Их цена",
      meters: { trust: "Доверие", tension: "Напряжение", info: "Информация" },
      betterBanner: "Так было бы лучше",
      neutralBanner: "Сравните исходы",
      insteadOf: "вместо",
      uncovered: "вы бы вскрыли интерес",
      trustHigher: "доверие выше",
      priceFurther: "цена сдвинулась дальше",
      unavailable: "Развилку для этого сценария посчитать не удалось.",
      presets: [
        "А что для вас важнее всего в этой сделке и почему?",
        "Давайте сверимся с рыночными данными — какая цена была бы справедливой?",
      ],
      mobileCta: "Показать развилку",
    },
    debriefTitle: "Разбор переговоров",
    coachTitle: "Рекомендации коуча",
    retry: "Пройти снова",
    toHome: "К сценариям",
    outcome: {
      agreement: "Соглашение достигнуто",
      breakdown: "Переговоры сорваны",
      active: "Без соглашения",
      see: "Смотреть разбор →",
      preparing: "Готовим разбор…",
    },
    sb: { economic: "Экономика сделки", relationship: "Отношения", technique: "Техника переговоров" },
    stat: {
      spin: "этапов SPIN",
      criteria: "критериев",
      empathy: "слушания",
      interests: "интересов",
      tradeoffs: "разменов",
      threats: "угроз",
      arg: "аргументация",
    },
    footRight: "исход зависит от вашей стратегии",
    gam: {
      rankLabel: "ранг",
      toNext: "{n} XP до «{name}»",
      maxRank: "высший ранг достигнут",
      totalXp: "{n} XP",
      levelUp: "уровень повышен!",
      xpAwardLabel: "опыт за переговоры",
      xpAwardFailed: "переговоры сорвались",
      lowData: "мало данных — сыграйте ещё",
      dailyGoal: "цель дня",
      dailyDone: "цель дня выполнена",
      dailyTodo: "проведите одну переговорку",
      dailyProgress: "{done}/{target}",
      dailyTargetLabel: "Цель на день",
      dailyTargetSet: "{n} в день",
      freezeLabel: "заморозка",
      freezeSaved: "🧊 Заморозка сохранила вашу серию — пропущенный день не в счёт.",
      streakSkipped: "Этот результат не засчитан в серию — она растёт за грейд C и выше.",
      milestone: {
        kicker: "Веха",
        dismiss: "Продолжить",
        streakTitle: "{n} дней подряд",
        streakDetail: "Неделя за столом. Привычка договариваться закрепляется.",
        streakUnit: "дней",
        rankKicker: "Новый ранг",
        rankDetail: "Вы растёте как переговорщик — так держать.",
        rankUnit: "XP",
      },
      skillsTitle: "Профиль навыков",
      skillsLink: "Профиль навыков",
      skillsSub: "Средняя оценка по всем играм — так видно, где вы растёте.",
      strongIn: "Силён в",
      workOn: "Подтяни",
      noGames: "Сыграйте первую переговорку, чтобы увидеть, где вы растёте.",
      back: "← Назад",
      gamesCount: "{n} игр",
      achievementsTitle: "Достижения",
      unlockedToast: "Достижение получено",
      locked: "ещё не получено",
      skillNames: {
        questions: "Вопросы / SPIN",
        interests: "Интересы",
        criteria: "Объективные критерии",
        listening: "Активное слушание",
        tradeoff: "Размен",
        tension: "Управление напряжением",
      },
      skillHints: {
        questions: "Вскрываете суть вопросами, а не давлением",
        interests: "Находите скрытые интересы за позицией",
        criteria: "Опираетесь на объективные критерии",
        listening: "Признаёте интересы другой стороны",
        tradeoff: "Создаёте ценность разменом уступок",
        tension: "Держите доверие и не даёте напряжению расти",
      },
    },
    a11y: {
      nav: "Разделы",
      stats: "Ваш прогресс",
      hud: "Счётчики переговоров",
      chatLog: "Ход переговоров",
      gameHeading: "Переговоры: {name}",
      grade: "Оценка {grade}, {score} из 100",
      scoreBar: "{label}: {v} из 100",
      deal: "Сделка. Ваша цель {target}, красная линия {redline}, их текущая цена {offer}.",
      delta: "{label}: {value}",
    },
    // Stems, not finished moves: the chip drops a sentence STARTER into the box
    // that the player must complete in their own words (a full worked example
    // lives behind the 💡 hint). Leaving the scoring to the player, not the chip.
    quickMoves: [
      { label: "❓ Вопрос SPIN", text: "Расскажите, как сейчас устроен " },
      { label: "🎯 Интерес", text: "Почему для вас важно именно " },
      { label: "📊 Критерий", text: "По рыночным данным справедливая величина — " },
      { label: "🤝 Эмпатия", text: "Я понимаю, что для вас важно " },
      { label: "🔄 Размен", text: "Если мы пойдём навстречу по срокам, сможете ли вы " },
    ],
  },
  en: {
    tagline: "negotiation dojo",
    sound: { mute: "Mute sound", unmute: "Unmute sound" },
    eyebrow: "Harvard method · SPIN · BATNA",
    heroTitle: "Learn to <em>negotiate</em> — at the table, not from a textbook.",
    heroCta: "Start negotiating",
    heroLead:
      "A live dialogue with an AI counterpart who has hidden interests, a red line and a personality. The outcome depends on your strategy, wording and arguments — every line is analyzed in real time.",
    principles: [
      "<b>Positions ≠ interests</b> — surface them with questions",
      "<b>Objective criteria</b> over pressure",
      "<b>BATNA</b> as leverage",
      "<b>Trade-offs</b> create value",
    ],
    teach: {
      head: "Why this teaches",
      title: "Not a slide deck — a table where method decides.",
      panels: [
        {
          tag: "SPIN",
          name: "Positions ≠ interests",
          idea: "Behind every hard position sits an interest. Surface it with a question — and now there's something to negotiate.",
          example:
            "Not “give me a discount,” but “why does volume matter to you?” → the interest is uncovered, the Information meter rises, and their price moves — without pressure.",
        },
        {
          tag: "Harvard",
          name: "Objective criteria",
          idea: "A clash of opinions is won by the loudest. A clash of criteria, by whoever's right.",
          example:
            "“By market data, the fair rate is X” → that's legitimate leverage: the Leverage meter rises, and a concession doesn't read as surrender.",
        },
        {
          tag: "Harvard",
          name: "Trade-offs create value",
          idea: "Concede what's cheap for you but valuable to them. That turns one number into two wins.",
          example:
            "“If we move on timing, can you move on price?” → a trade-off (logrolling) advances the deal where head-on haggling stalls.",
        },
        {
          tag: "BATNA",
          name: "Your fallback as leverage",
          idea: "Your best alternative is a source of calm, not a club.",
          example:
            "Know your fallback and you bargain with confidence. But a blunt “I'll walk” hits trust: BATNA is leverage, not a battering ram.",
        },
      ],
      framing:
        "You can't win here with nice words: a deterministic engine owns the outcome and every line is analyzed on its merits — strategy, wording, argument. At the end you get an honest, reproducible score with a grade and a breakdown of your key moves.",
      demoCap: "Uncover an interest — their price slides toward your target.",
    },
    pickHead: "Choose your counterpart",
    modesHead: "Training mode",
    soon: "soon",
    modes: {
      practice: { title: "🥋 Practice", desc: "A single scenario from the library. Hints on." },
      campaign: { title: "📖 Campaign", desc: "A narrative career arc; consequences carry over." },
      custom: { title: "🎯 Custom deal", desc: "Generate a scenario for your own situation." },
      exam: { title: "🏆 Exam", desc: "No hints. Score, certificate, ranking." },
    },
    theirOffer: "their offer",
    yourTarget: "your target",
    meters: { trust: "Trust", tension: "Tension", info: "Information", leverage: "Leverage" },
    metersShort: { trust: "Trust", tension: "Tens", info: "Info", leverage: "Lev" },
    meterInfo: {
      trust: "Trust: rises with empathy and fair arguments, falls under pressure and threats.",
      tension: "Tension: rises with pressure, threats and rudeness; eases when you acknowledge interests.",
      info: "Information: grows as you surface the counterpart's hidden interests with questions (SPIN).",
      leverage: "Leverage: grows from BATNA and objective criteria, not from emotion.",
    },
    tracker: {
      target: "target",
      redline: "red line",
      theirOffer: "their offer",
      settled: "settled at",
      yourOffer: "your offer",
      opening: "opening",
      history: "their price over time",
    },
    terms: {
      title: "Deal terms",
      explainer: "Concede what's cheap for you but valuable to them and the price moves — that's a trade-off (logrolling).",
      onTable: "on the table",
      notYet: "not offered yet",
      debriefLabel: "Trade-offs",
      debriefNone: "You didn't use trade-offs — that's value left on the table.",
    },
    turn: "turn",
    turnBudget: "{n} turns",
    turnOf: "turn {n} of {max}",
    hint: "hint",
    useLine: "Use it",
    hintPending: "Your coach is picking a line…",
    quit: "leave",
    interests: "Interests uncovered",
    interestToast: "Interest uncovered",
    coachLabel: "coach",
    judgeBadge: {
      label: "graded by meaning",
      aria: "A semantic AI judge scores your argumentation by meaning, not by keywords.",
    },
    judgeReject: "recognized a pattern, not meaning",
    scorecard: {
      interest: "surfaced an interest",
      criteria: "objective criterion",
      tradeoff: "trade-off",
      tensionUp: "↑ tension",
      trustUp: "↑ trust",
      aggression: "aggression",
    },
    typingLabel: "typing…",
    judgingLabel: "the AI judge is reading your line…",
    batna: "BATNA",
    moreLabel: "Briefing & BATNA",
    streakLabel: "🔥 {n}-day streak",
    notPlayed: "not played",
    personalBest: "Personal best",
    newRecord: "new record!",
    placeholder: "Your line, in your own words…",
    placeholderNudges: [
      "Ask WHY this matters to them…",
      "Cite market data or an objective criterion…",
      "Offer a trade: “if…, then…”…",
    ],
    send: "Send",
    argLabel: "arg.",
    connecting: "Connecting…",
    usingMock: "demo mode (no server)",
    composerLimit: "{n} characters left",
    conn: {
      reconnecting: "Connection lost — reconnecting…",
      lostTitle: "Lost connection to the server",
      lostBody: "We couldn't reconnect. You can restart the scenario — your progress and profile are saved.",
      retry: "Restart scenario",
      home: "Home",
    },
    custom: {
      head: "Describe your situation",
      placeholder:
        "Describe your negotiation situation… e.g. “I'm a freelancer, a client wants a 20% discount on the project, but I can't go below my rate. I need to keep the contract without devaluing my work.”",
      generate: "Generate scenario →",
      generating: "Generating your counterpart…",
      generatingSub: "The AI is designing a persona, hidden interests and a bargaining zone for your situation.",
      errorHead: "Couldn't generate a scenario",
      errorSub: "Generation sometimes fails. Try again, or start from a ready-made scenario.",
      timeout: "Generation took too long. The server may be busy — please try again.",
      orPickReady: "…or pick a ready-made scenario",
      retry: "Try again",
    },
    exam: {
      eyebrow: "Certificate · exam",
      resultTitle: "Exam result",
      scenarioLabel: "Scenario",
      nameLabel: "Name for the certificate",
      namePlaceholder: "Candidate",
      awardedTo: "Awarded to",
      dateLabel: "Date",
      download: "Download / Print",
      certifies: "The «Диалог» trainer certifies command of the negotiation method.",
    },
    campaign: {
      overviewHead: "Your career arc",
      begin: "Begin the climb →",
      continue: "Continue the climb →",
      nextAct: "Next act →",
      seeResults: "See the summit →",
      locked: "locked",
      current: "now",
      done: "cleared",
      reputation: "Reputation",
    startFlag: "Start",
      actOf: "Act {n} of {total}",
      completeEyebrow: "The Climb · summary",
      completeTitle: "The climb is complete",
      avgLabel: "Average score",
      replay: "Climb again",
      verdicts: {
        A: "Master negotiator",
        B: "Confident negotiator",
        C: "Solid middleweight",
        D: "Room to grow",
        F: "Still learning",
      },
    },
    beats: {
      label: "Debrief sections",
      names: ["Outcome", "What you missed", "What a master would say"],
      next: "Next: {name} →",
      more: "Full breakdown ▾",
      less: "Hide details ▴",
    },
    goal: { title: "Daily goal" },
    rank: { title: "Your rank", toNext: "{n} XP to \u00ab{rank}\u00bb" },
    method: { title: "Method" },
    layers: {
      head: "Layers",
      what: "what is this",
      sameGrade: "same grading",
      unavailable: "unavailable",
      presets: "Presets",
      start: "Start the negotiation",
      back: "back to opponents",
      names: { probe: "Read the face", voice: "By voice", camera: "Camera", avatar: "Their face" },
      blurbs: {
        probe: "The game will ask what your counterpart feels",
        voice: "Speak aloud — and hear the reply. You can cut in",
        camera: "Presence signals: who is in frame, where you look",
        avatar: "Their expression follows the engine's reaction",
      },
      presetNames: { classic: "Classic", read: "Read the face", call: "Video call", full: "Full contact" },
      explainHead: "What this changes",
      explain: [
        "Layers change what the debrief shows — never the grade.",
        "Every scenario is playable with all layers off.",
        "The exam keeps them off so certificates stay comparable.",
      ],
    },
    mascot: {
      karl: "Karl",
      tikhon: "Tikhon",
      greeting: "Don't rush to the number. Find out what matters to her first.",
      thinking: "One moment, looking…",
      rememberTitle: "Tikhon remembers",
    },
    live: {
      micOn: "microphone live",
      hearing: "hearing you",
      interrupt: "cut in",
      inFrame: "camera · in frame",
      outFrame: "camera · out of frame",
      peekNote: "only you can see this",
      peekOpen: "check your light",
    },
    probe: {
      ask: "What is she feeling now?",
      readFace: "Read the face",
      blocked: "Answer the question to continue",
      tally: "read {n} of {m}",
      right: "Correct.",
      wrong: "Missed.",
      reactions: {
        warmed: "Warmed up", opened_up: "Opened up", persuaded: "Persuaded by data",
        collaborated: "Ready to cooperate", neutral: "Staying neutral",
        not_yet: "Not ready yet", pressured: "Under pressure",
        hardened: "Closed off", offended: "Offended", walked_out: "Leaving the table",
      },
      why: {
        warmed: "Trust rose — you hit her actual interest.",
        opened_up: "Information jumped: she shared what she had been holding back.",
        persuaded: "Leverage rose — an objective criterion convinced her, not pressure.",
        collaborated: "Tension fell and trust rose: you offered a trade.",
        neutral: "The meters barely moved — the move passed her by.",
        not_yet: "She did not refuse, but did not move either: too early to close.",
        pressured: "Tension rose — she read that as a push.",
        hardened: "Tension rose and trust fell — she closed off.",
        offended: "Trust collapsed: a harsh tone hits harder than any argument.",
        walked_out: "She is getting up — tension hit its limit.",
      },
      debriefHead: "How well you read her",
      observation: "observation · does not affect the grade",
    },
    nav: { training: "Training", campaign: "Campaign", custom: "Your deal",
           course: "Course", exam: "Exam", progress: "Progress", profile: "Profile" },
    course: {
      title: "Technique course",
      lead: "Nine blocks: question → emotion → legitimacy → power → numbers → value creation → defence → closing. Each has lessons, drills and an exam.",
      blocksDone: "Blocks passed: {n} of {total}",
      blockOf: "block {n} of {total}",
      toTable: "To the table →",
      allBlocks: "All blocks",
      tasksN: "{n} tasks",
      taskForms: ["task", "tasks", "tasks"],
      theory: "theory",
      examTitle: "Block exam",
      examLead: "{n} tasks, pass mark {pass} of {total} points. Hints off, review after you finish.",
      examBest: "Best result: {best} of {total}",
      examPassed: "passed",
      examStart: "Take the exam",
      examMode: "exam",
      examFinish: "Finish",
      examPass: "Exam passed",
      examFail: "Exam not passed",
      examResult: "{score} of {total} points, pass mark {pass}. Retake right away — the draw will differ.",
      toTasks: "To the tasks →",
      lessonDone: "Lesson done",
      lessonComplete: "Lesson complete",
      lessonScore: "Correct: {n} of {total}",
      stepOf: "task {n} of {total}",
      next: "Next",
      checkIt: "Check",
      correct: "Correct",
      wrong: "Not quite",
      reference: "One way to say it",
      freeformHint: "Write the line in your own words…",
      matchHint: "Pick on the left, then on the right — the pair links.",
      examQuit: "Leave the exam",
      recoveryTitle: "Revisit before the retake",
      nextUp: "Next up",
      continue: "Continue the course",
      actTeaches: "The technique this act trains",
      coachNote: "scored by the engine · comment by the coach",
      masterTitle: "Master exam",
      masterLead: "Three negotiations in a row, on tables the blocks never used. Layers off.",
      masterLocked: "Unlocks once all nine blocks are passed.",
      masterStart: "Start",
      masterAgain: "Run it again",
      masterAbout: "{n} real negotiations in a row, each with its own condition. You pass at {pass} of {n}. Nobody names the technique for you: real negotiations do not either.",
      masterNext: "Negotiation {n} of {total} →",
      masterPassed: "Master exam passed",
      masterPassedBody: "Three tables, no hints, scored by the same engine as everything else. That is what makes the result comparable.",
      masterKarlPass: "Passed. Now the same thing — at a real table.",
      masterKarlFail: "Not passed yet. Run it again — same tables, but they will have to be played differently.",
      masterProgress: "Negotiation {n} of {total}",
      masterDrillPass: "Exam negotiation passed",
      masterDrillFail: "Exam negotiation not passed",
      warmupTitle: "Warm-up",
      warmupSkip: "Skip",
      warmupReady: "Warm-up done",
      warmupToTable: "To the table",
      warmupKarl: "Now the same thing — live, and the price will actually move.",
      warmupCta: "⚡ Warm-up · 2 tasks",
      drillStart: "Start the mini-negotiation",
      drillNote: "A real {n}-turn negotiation. Scored by the engine, as always.",
      drillPass: "Capstone passed",
      drillFail: "Capstone not passed",
      backToCourse: "← Back to the course",
      karlTheory: "Read it — now let us test it. Theory without practice evaporates in a day.",
      karlPerfect: "Not a single miss. That is what a skill looks like.",
      karlOk: "Fine. A mistake here costs less than one at the table.",
      karlExamPass: "Passed. The next block is open.",
      karlExamFail: "Not yet. Read the misses and come back — the draw will differ.",
      tikhonTitle: "Tikhon remembers",
      tikhonBody: "Course and games share one profile: XP, ranks and the streak are the same. Block exams run with no layers, so results stay comparable.",
      types: {
        choice: "Pick the line", spot_error: "Spot the error", order: "Put in order",
        match: "Match pairs", numeric: "Compute", freeform: "In your own words",
        reaction: "Read the reaction", meters: "Predict the meters", drill: "Capstone",
      },
      meters: { trust: "Trust", tension: "Tension", info: "Information",
                leverage: "Leverage", up: "Rises", down: "Falls" },
      reactions: {
        walked_out: "Walked out", offended: "Offended", hardened: "Hardened",
        pressured: "Pressured", not_yet: "Not yet", neutral: "Neutral",
        collaborated: "Ready to cooperate", persuaded: "Persuaded by data",
        opened_up: "Opened up", warmed: "Warmed up",
      },
      moves: {
        interests_probe: "interest probe", acknowledge: "active listening",
        objective_criteria: "objective criterion", batna: "alternative",
        tradeoff: "trade", threat: "ultimatum", hostile: "rudeness",
        accept: "closing", concession: "concession", anchor: "anchor", offer: "price offer",
        spin_situation: "SPIN · situation", spin_problem: "SPIN · problem",
        spin_implication: "SPIN · implication", spin_needpayoff: "SPIN · need-payoff",
        open_question: "open question", statement: "statement", rapport: "rapport",
      },
      why: {
        missing: "Missing move: {move}",
        missingAny: "At least one of these is needed: {moves}",
        forbidden: "Not allowed here: {move}",
        missingTerm: "The secondary issue you were trading is not named",
        tooShort: "Too short — the engine has nothing to judge",
        weak: "Weak argument: no grounding, number or source",
        noNumber: "A concrete number is required",
        generic: "That answer did not pass",
      },
    },
    skin: { label: "Look", toGame: "Game look", toDojo: "Dojo look" },
    opening: {
      title: "The table is set",
      scene: "{role} Across from you: {name}. Their price: {offer}. Your target: {target}, red line: {red}.",
      hint: "They have three hidden interests. Until you surface them the argument is only about price — and there the harder pusher wins.",
      lines: [
        { tag: "🎯 Interest", text: "What matters most to you in this deal — and why exactly that?" },
        { tag: "📊 Criterion", text: "Before we argue about the number: what data could we both anchor on?" },
        { tag: "🔄 Trade-off", text: "What's cheaper for you to give — timing or volume? We may have something to trade." },
      ],
    },
    firstTurnCoach: "💡 Start with interests: find out what matters to the other side. Don't push on price — ask first.",
    dismiss: "Dismiss tip",
    suggestChip: {
      label: "Ask what matters most to them →",
      fill: "What matters most to you in this deal?",
    },
    onboarding: {
      skip: "Skip",
      next: "Next →",
      gotIt: "Got it",
      stepOf: "{n}/{total}",
      welcomeTitle: "Welcome to the table",
      welcomeBody:
        "This is a negotiation trainer. Talk in your own words — the outcome depends on WHAT you say and HOW. The secret is simple: don't push — ask first.",
      metersTitle: "The table's four meters",
      metersBody:
        "Trust, Tension, Information, Leverage. Keep trust and information rising and tension low. Hover any one to see what moves it.",
      composeTitle: "Your move — in your own words",
      composeBody:
        "Write like you would in real life. Not sure how to open? Start with a question — surface what matters to them.",
      sendOpening: "❓ Ask this question",
      suggestedOpening: "What matters most to you in this deal, and why?",
      orTypeYourself: "or I'll write my own",
      interestTitle: "You uncovered an interest",
      interestBody:
        "Behind every position sits an interest. You asked — and the Information meter rose. That's how you find what's really worth negotiating over.",
      dealTitle: "Their price is moving",
      dealBody:
        "Look: their price slid toward your target. Every good move nudges it — keep an eye on this scale.",
    },
    turningPoints: { title: "Turning points", turn: "Turn" },
    tagLabels: {
      spinSituation: "SPIN · Situation",
      spinProblem: "SPIN · Problem",
      spinImplication: "SPIN · Implication",
      spinNeedPayoff: "SPIN · Need-payoff",
      question: "Open question",
      interests: "Probing interests",
      empathy: "Active listening",
      criteria: "Objective criteria",
      batna: "BATNA / leverage",
      tradeoff: "Trade-off",
      threat: "Pressure",
      hostile: "Hostile tone",
      concession: "Concession",
      anchor: "Anchoring",
      accept: "Closing",
      rapport: "Rapport",
      offer: "Offer / number",
    },
    reveal: {
      title: "What the other side actually cared about",
      found: "you drew this out",
      missed: "you never asked",
      allFound: "You surfaced everything they were protecting — you played that table with open cards.",
      noneFound: "You negotiated blind — not one of their interests ever came up.",
    },
    mentor: {
      title: "A word from your mentor",
      strength: "What worked",
      growth: "What to change next time",
    },
    master: {
      title: "What a master would say",
      yours: "Your line",
      label: "Master",
      why: "Why it's stronger:",
      criteria: "Let's anchor on an objective criterion rather than positions: what price is fair by market data for deals like this?",
      interest: "Before we talk price — what matters most to you here, and why? I want to understand your interest, not just your position.",
      tradeoff: "Let's trade: if I move on the timeline, could you move on price? Let's package the concessions together.",
      threat: "Let's take the pressure off the table and decide on the merits: what criterion would be fair to us both?",
      whyCriteria: "an objective criterion persuades better than positional bargaining (Harvard method).",
      whyInterest: "the interest behind the position opens room for a deal (Harvard method, SPIN).",
      whyTradeoff: "trading across issues of differing value creates value instead of splitting it (logrolling).",
      whyThreat: "moving from threats to criteria lowers tension and preserves the relationship.",
    },
    techniqueFloor: "Great price, but the grade is capped: an A/B is earned with method — interests, criteria, trade-offs — not by bargaining alone.",
    whatIf: {
      title: "What if…",
      teaser: "One move changed everything →",
      intro: "Your most costly move. See what would have happened had you asked differently — from the same moment.",
      reveal: "Show what would have happened",
      loading: "Replaying the branch…",
      again: "Try another line",
      altLabel: "A stronger line",
      customPlaceholder: "…or write your own line",
      wasLabel: "What happened",
      couldLabel: "What could have been",
      opponentLabel: "Opponent's reply",
      offerLabel: "Their price",
      meters: { trust: "Trust", tension: "Tension", info: "Info" },
      betterBanner: "This would have gone better",
      neutralBanner: "Compare the outcomes",
      insteadOf: "instead of",
      uncovered: "you'd have uncovered an interest",
      trustHigher: "trust higher",
      priceFurther: "the price moved further",
      unavailable: "Couldn't compute the branch for this scenario.",
      presets: [
        "What matters most to you in this deal, and why?",
        "Let's check the market data — what price would be fair?",
      ],
      mobileCta: "Show the branch",
    },
    debriefTitle: "Negotiation debrief",
    coachTitle: "Coach recommendations",
    retry: "Try again",
    toHome: "To scenarios",
    outcome: {
      agreement: "Agreement reached",
      breakdown: "Talks broke down",
      active: "No agreement",
      see: "See the debrief →",
      preparing: "Building your debrief…",
    },
    sb: { economic: "Deal economics", relationship: "Relationship", technique: "Negotiation technique" },
    stat: {
      spin: "SPIN stages",
      criteria: "criteria",
      empathy: "listening",
      interests: "interests",
      tradeoffs: "trade-offs",
      threats: "threats",
      arg: "argumentation",
    },
    footRight: "the outcome depends on your strategy",
    gam: {
      rankLabel: "rank",
      toNext: "{n} XP to “{name}”",
      maxRank: "top rank reached",
      totalXp: "{n} XP",
      levelUp: "level up!",
      xpAwardLabel: "earned this negotiation",
      xpAwardFailed: "talks broke down",
      lowData: "not enough data — play more",
      dailyGoal: "daily goal",
      dailyDone: "daily goal met",
      dailyTodo: "play one negotiation",
      dailyProgress: "{done}/{target}",
      dailyTargetLabel: "Daily goal",
      dailyTargetSet: "{n}/day",
      freezeLabel: "freeze",
      freezeSaved: "🧊 A freeze saved your streak — the missed day doesn't count.",
      streakSkipped: "This result didn't count toward your streak — it grows on a grade C or better.",
      milestone: {
        kicker: "Milestone",
        dismiss: "Continue",
        streakTitle: "{n} days in a row",
        streakDetail: "A week at the table. The habit of negotiating is sticking.",
        streakUnit: "days",
        rankKicker: "New rank",
        rankDetail: "You're growing as a negotiator — keep it up.",
        rankUnit: "XP",
      },
      skillsTitle: "Skill profile",
      skillsLink: "Skill profile",
      skillsSub: "Your average across every game — so you can see where you're growing.",
      strongIn: "Strong at",
      workOn: "Work on",
      noGames: "Play your first negotiation to see where you're growing.",
      back: "← Back",
      gamesCount: "{n} games",
      achievementsTitle: "Achievements",
      unlockedToast: "Achievement unlocked",
      locked: "not yet earned",
      skillNames: {
        questions: "Questions / SPIN",
        interests: "Interests",
        criteria: "Objective criteria",
        listening: "Active listening",
        tradeoff: "Trade-offs",
        tension: "Tension management",
      },
      skillHints: {
        questions: "Surface the substance with questions, not pressure",
        interests: "Find the hidden interests behind the position",
        criteria: "Ground your case in objective criteria",
        listening: "Acknowledge what matters to the other side",
        tradeoff: "Create value by trading concessions",
        tension: "Keep trust up and tension from rising",
      },
    },
    a11y: {
      nav: "Sections",
      stats: "Your progress",
      hud: "Negotiation meters",
      chatLog: "Negotiation transcript",
      gameHeading: "Negotiation: {name}",
      grade: "Grade {grade}, {score} out of 100",
      scoreBar: "{label}: {v} out of 100",
      deal: "Deal. Your target {target}, red line {redline}, their current offer {offer}.",
      delta: "{label}: {value}",
    },
    // Stems, not finished moves — the player completes each in their own words
    // (the full worked example stays behind the 💡 hint button).
    quickMoves: [
      { label: "❓ SPIN question", text: "Tell me how you currently handle " },
      { label: "🎯 Interest", text: "Why does it matter to you that " },
      { label: "📊 Criterion", text: "By market data, the fair value is " },
      { label: "🤝 Empathy", text: "I understand that what matters to you is " },
      { label: "🔄 Trade-off", text: "If we move on timing, could you " },
    ],
  },
};
