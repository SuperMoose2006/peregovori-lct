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
  hint: string;
  quit: string;
  interests: string;
  interestToast: string; // celebratory toast when a hidden interest is uncovered
  coachLabel: string; // inline "coach" tag on the judge's per-turn nudge
  typingLabel: string; // opponent "typing…" indicator while a reply is pending
  batna: string;
  // mobile: label for the collapsible briefing/BATNA section in the game side strip
  moreLabel: string;
  // retention (localStorage profile): streak chip, card best-grade, debrief record
  streakLabel: string; // "🔥 {n}-day streak" ({n} substituted)
  notPlayed: string; // empty best-grade state on a scenario card
  personalBest: string; // debrief: "Personal best"
  newRecord: string; // debrief: "new record!" when the best is beaten
  placeholder: string;
  send: string;
  argLabel: string;
  connecting: string;
  usingMock: string;
  // custom ("Своя сделка") mode
  custom: {
    head: string;
    placeholder: string;
    generate: string;
    generating: string;
    generatingSub: string;
    errorHead: string;
    retry: string;
  };
  // exam mode ("Экзамен") — assessment framing
  exam: {
    eyebrow: string; // small "Certificate" kicker above the result
    resultTitle: string; // "Exam result"
    scenarioLabel: string; // "Scenario"
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
    actOf: string; // "Act {n} of {total}" — {n}/{total} substituted
    completeEyebrow: string; // kicker on the completion screen
    completeTitle: string;
    avgLabel: string; // "Average score"
    replay: string; // restart the campaign
    verdicts: Record<string, string>; // grade (A..F) → title
  };
  // first-turn coach bubble (practice/campaign/custom; withheld in exam).
  // {name} = counterpart name, substituted at render.
  firstTurnCoach: string;
  dismiss: string; // aria-label for the bubble's × close
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
  // "А что если…" — the what-if replay card in the debrief.
  whatIf: {
    title: string; // section heading
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
  };
  debriefTitle: string;
  coachTitle: string;
  retry: string;
  toHome: string;
  outcome: Record<"agreement" | "breakdown" | "active", string>;
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
    hint: "подсказка",
    quit: "выйти",
    interests: "Раскрытые интересы",
    interestToast: "Вы вскрыли интерес",
    coachLabel: "тренер",
    typingLabel: "печатает…",
    batna: "BATNA",
    moreLabel: "Брифинг и BATNA",
    streakLabel: "🔥 {n} дн. подряд",
    notPlayed: "не пройдено",
    personalBest: "Личный рекорд",
    newRecord: "новый рекорд!",
    placeholder: "Ваша реплика своими словами…",
    send: "Отправить",
    argLabel: "аргум.",
    connecting: "Соединение…",
    usingMock: "демо-режим (без сервера)",
    custom: {
      head: "Опишите вашу ситуацию",
      placeholder:
        "Опишите вашу переговорную ситуацию… Например: «Я фрилансер, клиент просит скидку 20% на проект, а я не готов опускаться ниже своей ставки. Нужно сохранить контракт и не обесценить работу.»",
      generate: "Сгенерировать сценарий →",
      generating: "Генерируем вашего оппонента…",
      generatingSub: "ИИ проектирует персону, скрытые интересы и зону торга под вашу ситуацию.",
      errorHead: "Не удалось сгенерировать сценарий",
      retry: "Попробовать снова",
    },
    exam: {
      eyebrow: "Сертификат · экзамен",
      resultTitle: "Результат экзамена",
      scenarioLabel: "Сценарий",
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
    firstTurnCoach: "💡 Начните с вопроса: узнайте, что важно для {name}. Не давите — сначала интересы.",
    dismiss: "Закрыть подсказку",
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
    whatIf: {
      title: "А что если…",
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
    },
    debriefTitle: "Разбор переговоров",
    coachTitle: "Рекомендации коуча",
    retry: "Пройти снова",
    toHome: "К сценариям",
    outcome: {
      agreement: "Соглашение достигнуто",
      breakdown: "Переговоры сорваны",
      active: "Без соглашения",
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
      skillsTitle: "Профиль навыков",
      skillsLink: "Профиль навыков",
      skillsSub: "Средняя оценка по всем играм — так видно, где вы растёте.",
      strongIn: "Силён в",
      workOn: "Подтяни",
      noGames: "Сыграйте первую переговорку, чтобы увидеть прогресс.",
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
    hint: "hint",
    quit: "leave",
    interests: "Interests uncovered",
    interestToast: "Interest uncovered",
    coachLabel: "coach",
    typingLabel: "typing…",
    batna: "BATNA",
    moreLabel: "Briefing & BATNA",
    streakLabel: "🔥 {n}-day streak",
    notPlayed: "not played",
    personalBest: "Personal best",
    newRecord: "new record!",
    placeholder: "Your line, in your own words…",
    send: "Send",
    argLabel: "arg.",
    connecting: "Connecting…",
    usingMock: "demo mode (no server)",
    custom: {
      head: "Describe your situation",
      placeholder:
        "Describe your negotiation situation… e.g. “I'm a freelancer, a client wants a 20% discount on the project, but I can't go below my rate. I need to keep the contract without devaluing my work.”",
      generate: "Generate scenario →",
      generating: "Generating your counterpart…",
      generatingSub: "The AI is designing a persona, hidden interests and a bargaining zone for your situation.",
      errorHead: "Couldn't generate a scenario",
      retry: "Try again",
    },
    exam: {
      eyebrow: "Certificate · exam",
      resultTitle: "Exam result",
      scenarioLabel: "Scenario",
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
    firstTurnCoach: "💡 Open with a question: find out what matters to {name}. Don't push — interests first.",
    dismiss: "Dismiss tip",
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
    whatIf: {
      title: "What if…",
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
    },
    debriefTitle: "Negotiation debrief",
    coachTitle: "Coach recommendations",
    retry: "Try again",
    toHome: "To scenarios",
    outcome: {
      agreement: "Agreement reached",
      breakdown: "Talks broke down",
      active: "No agreement",
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
      skillsTitle: "Skill profile",
      skillsLink: "Skill profile",
      skillsSub: "Your average across every game — so you can see where you're growing.",
      strongIn: "Strong at",
      workOn: "Work on",
      noGames: "Play your first negotiation to see your progress.",
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
