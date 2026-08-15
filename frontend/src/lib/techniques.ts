// techniques.ts — shared negotiation-technique lexicon + text helpers.
// Ported from legacy-node/public/demo.html. Used by the composer's live preview
// (client-side, works against any backend) and by the MockServer engine.

export const LEX: Record<string, string[]> = {
  spinSituation: [
    "как сейчас", "как у вас", "какой у вас", "сколько", "как часто", "как устроен",
    "расскажите о", "что вы используете", "какой процесс", "how do you currently",
    "how many", "how often", "what is your current", "tell me about your", "what process",
  ],
  spinProblem: [
    "сложно", "проблема", "мешает", "не устраивает", "трудно", "узкое место",
    "с какими сложностями", "что вас беспокоит", "болит", "difficult", "problem",
    "challenge", "frustrat", "bottleneck", "pain", "struggl", "concerns you",
  ],
  spinImplication: [
    "к чему это приводит", "чем это грозит", "сколько вы теряете", "если так продолжится",
    "как это влияет", "во что обходится", "какие последствия", "what happens if",
    "how does that affect", "what does that cost", "impact of", "consequence", "if this continues",
  ],
  spinNeedPayoff: [
    "было бы полезно", "что если бы", "насколько важно", "помогло бы вам", "какая ценность",
    "если бы мы решили", "would it help", "how valuable", "what if you could", "would that be useful",
  ],
  interestsProbe: [
    "почему для вас", "почему именно", "почему это", "что для вас важн", "что важнее",
    "зачем вам", "какая цель", "что стоит за", "что вами движет", "ради чего", "ваш интерес",
    "что для вас критично", "что вас беспокоит", "why is that important", "why exactly",
    "what matters to you", "what matters most", "the real reason", "what you care about", "important to you",
  ],
  acknowledge: [
    "понимаю", "я вас слышу", "вы правы", "справедливо", "логично", "разделяю", "ценю",
    "правильно ли я понял", "если я верно понял", "то есть вы", "я вижу, что", "i understand",
    "i hear you", "that makes sense", "fair point", "i appreciate", "if i understand", "i can see that",
  ],
  objectiveCriteria: [
    "рыночная цена", "по рынку", "стандарт", "бенчмарк", "независимая оценка", "данные показывают",
    "исследование", "отраслев", "практика рынка", "объективн", "прецедент", "индекс", "market rate",
    "market price", "benchmark", "industry standard", "the data", "research shows", "independent",
    "objective", "precedent", "comparable",
  ],
  batna: [
    "другой поставщик", "другое предложение", "альтернатив", "конкурент", "у нас есть варианты",
    "можем уйти", "рассматриваем других", "запасной вариант", "без сделки", "второй оффер",
    "второй фонд", "other supplier", "another offer", "alternative", "competitor", "we have options",
    "walk away", "elsewhere", "other vendors", "fallback", "best alternative",
  ],
  threat: [
    "ультиматум", "иначе", "в последний раз", "мое последнее слово", "либо", "или мы уходим",
    "вы обязаны", "у вас нет выбора", "немедленно", "требую", "иначе разрываем",
    "take it or leave it", "final offer", "or else", "you have no choice", "i demand", "non-negotiable",
  ],
  hostile: [
    "вы не понимаете", "это глупо", "смешно", "вы обманываете", "некомпетентн", "вы врете",
    "абсурд", "вы издеваетесь", "позор", "ridiculous", "incompetent", "you are lying",
    "this is a joke", "absurd", "stupid",
  ],
  concession: [
    "готовы уступить", "можем снизить", "пойдем навстречу", "сделаем скидку", "уступим",
    "согласны на", "можем добавить", "идем на", "we can lower", "we can offer", "we can come down",
    "i can give you", "discount",
  ],
  tradeoff: [
    "если вы, то мы", "взамен", "в обмен", "при условии", "пакет", "если добавите", "давайте свяжем",
    "тогда мы", "в ответ на", "если мы дадим", "если мы", "если пойдём навстречу", "сможете подвинуться",
    "сможете ли вы", "if you, then we", "in exchange", "in return", "provided that", "if we give",
    "if we offer", "can you move on", "would you move", "then we would", "in exchange for",
  ],
  anchor: [
    "наша цена", "мы предлагаем", "исходная", "стартуем с", "позиция такова", "we propose",
    "our price is", "starting point", "our position is",
  ],
  rationale: [
    "потому что", "так как", "поскольку", "причина в том", "это позволит", "за счет", "because",
    "since", "the reason", "this allows", "so that", "which means",
  ],
  rapport: [
    "рад встрече", "приятно познакомиться", "как ваши дела", "спасибо за встречу", "nice to meet",
    "good to see you", "thanks for taking the time",
  ],
  accept: [
    "по рукам", "договорились", "принимаю", "мы согласны", "заключаем", "подписываем",
    "меня устраивает", "сделка", "we have a deal", "i accept", "we agree", "let us sign",
    "i can live with", "that works for us", "deal at", "deal on",
  ],
};

export const norm = (s: string): string =>
  (s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s%.,?!\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export const has = (t: string, arr: string[]): boolean => arr.some((w) => t.includes(w));
export const cnt = (t: string, arr: string[]): number =>
  arr.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);

const MONEY = /(?:^|[^\d])(\d{1,3}(?:[ .,]\d{3})*(?:[.,]\d+)?)/;
export function extractNum(t: string): number | null {
  const m = t.match(MONEY);
  if (!m) return null;
  const v = parseFloat(m[1].replace(/ /g, "").replace(",", "."));
  return isFinite(v) ? v : null;
}

// Lightweight, client-side preview chips shown live while the player types.
// (Independent of the engine so it works even against the real backend.)
export interface PreviewChip {
  key: string; // maps to the CSS tag color classes
  label: string;
}
export function previewChips(raw: string): PreviewChip[] {
  const x = norm(raw);
  const out: PreviewChip[] = [];
  const add = (cond: boolean, key: string, label: string) => {
    if (cond) out.push({ key, label });
  };
  add(x.includes("?"), "spin", "❓");
  add(has(x, LEX.rationale), "criteria", "↳ arg");
  add(has(x, LEX.objectiveCriteria), "criteria", "📊");
  add(has(x, LEX.batna), "batna", "🛡");
  add(has(x, LEX.acknowledge) || has(x, LEX.interestsProbe), "empathy", "🤝");
  add(has(x, LEX.tradeoff), "tradeoff", "🔄");
  add(has(x, LEX.threat), "threat", "⚠");
  return out.slice(0, 6);
}
