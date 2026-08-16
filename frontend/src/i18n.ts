// i18n.ts — RU/EN string tables. Ported from legacy-node/public/i18n.js + demo.html.
// Engine/scenario content is localized at the data layer (see data/scenarios.ts).
import type { Lang, Mode } from "./types";

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
  eyebrow: string;
  heroTitle: string; // may contain <em> for the accented word
  heroLead: string;
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
  turn: string;
  hint: string;
  quit: string;
  interests: string;
  interestToast: string; // celebratory toast when a hidden interest is uncovered
  coachLabel: string; // inline "coach" tag on the judge's per-turn nudge
  batna: string;
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
  // debrief
  turningPoints: { title: string; turn: string }; // "Ключевые ходы" / "Ход {n}"
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
}

export const I18N: Record<Lang, Strings> = {
  ru: {
    tagline: "переговорный додзё",
    eyebrow: "Гарвардский метод · SPIN · BATNA",
    heroTitle: "Учитесь <em>договариваться</em> — за столом, а не по учебнику.",
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
    turn: "ход",
    hint: "подсказка",
    quit: "выйти",
    interests: "Раскрытые интересы",
    interestToast: "Вы вскрыли интерес",
    coachLabel: "тренер",
    batna: "BATNA",
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
    turningPoints: { title: "Ключевые ходы", turn: "Ход" },
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
    eyebrow: "Harvard method · SPIN · BATNA",
    heroTitle: "Learn to <em>negotiate</em> — at the table, not from a textbook.",
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
    turn: "turn",
    hint: "hint",
    quit: "leave",
    interests: "Interests uncovered",
    interestToast: "Interest uncovered",
    coachLabel: "coach",
    batna: "BATNA",
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
    turningPoints: { title: "Turning points", turn: "Turn" },
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
