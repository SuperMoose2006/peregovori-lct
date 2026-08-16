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
  turn: string;
  hint: string;
  quit: string;
  interests: string;
  batna: string;
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
  // debrief
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
    turn: "ход",
    hint: "подсказка",
    quit: "выйти",
    interests: "Раскрытые интересы",
    batna: "BATNA",
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
    quickMoves: [
      {
        label: "❓ Вопрос SPIN",
        text: "Расскажите, как сейчас устроен процесс и с какими сложностями вы сталкиваетесь?",
      },
      { label: "🎯 Интерес", text: "А что для вас важнее всего в этой сделке и почему именно это?" },
      {
        label: "📊 Критерий",
        text: "По рыночным данным справедливое значение иное, потому что это отраслевой стандарт.",
      },
      {
        label: "🤝 Эмпатия",
        text: "Я вас понимаю и ценю вашу позицию. Давайте найдём решение для обеих сторон.",
      },
      {
        label: "🔄 Размен",
        text: "Если мы пойдём навстречу по срокам и объёму, сможете подвинуться в ответ?",
      },
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
    turn: "turn",
    hint: "hint",
    quit: "leave",
    interests: "Interests uncovered",
    batna: "BATNA",
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
    quickMoves: [
      {
        label: "❓ SPIN question",
        text: "Tell me how this process works for you today and what difficulties you run into?",
      },
      { label: "🎯 Interest", text: "What matters most to you in this deal, and why exactly that?" },
      {
        label: "📊 Criterion",
        text: "Market data puts the fair value elsewhere, because that is the industry standard.",
      },
      {
        label: "🤝 Empathy",
        text: "I understand you and appreciate your position. Let us find a solution for both sides.",
      },
      { label: "🔄 Trade-off", text: "If we move on timing and volume, could you move in return?" },
    ],
  },
};
