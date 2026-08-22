// СГЕНЕРИРОВАНО. Не править руками.
// Источник: services/gateway/app/engine/techniques.py::LEX
// Обновить: cd services/gateway && python tools/sync_lexicon.py
//
// Зачем генерация: словарь приёмов обязан быть один и тот же на сервере
// (движок судит ход) и в браузере (чипы, офлайновый мок, проверка упражнений
// курса). Разъехавшиеся списки — это разный вердикт на одну реплику.

export const LEX: Record<string, string[]> = {
  question: [
    "?",
  ],
  spinSituation: [
    "как сейчас", "как у вас", "какой у вас", "сколько", "как часто", "кто у вас",
    "как устроен", "расскажите о", "что вы используете", "какой процесс",
    "how do you currently", "how many", "how often", "what is your current", "who handles",
    "tell me about your", "what process",
  ],
  spinProblem: [
    "сложно", "проблема", "мешает", "не устраивает", "трудно", "узкое место",
    "с какими сложностями", "что не устраивает", "что вас беспокоит", "болит", "difficult",
    "problem", "challenge", "frustrat", "bottleneck", "pain", "concerns you", "struggl",
  ],
  spinImplication: [
    "к чему это приводит", "чем это грозит", "сколько вы теряете", "если так продолжится",
    "как это влияет", "во что обходится", "какие последствия", "what happens if",
    "how does that affect", "what does that cost", "impact of", "consequence",
    "if this continues",
  ],
  spinNeedPayoff: [
    "было бы полезно", "что если бы", "насколько важно", "помогло бы вам", "какая ценность",
    "если бы мы решили", "это бы вам дало", "would it help", "how valuable",
    "what if you could", "would that be useful", "benefit of solving",
  ],
  interestsProbe: [
    "почему для вас", "почему именно", "почему это", "что для вас важн", "что важнее",
    "зачем вам", "какая цель", "что стоит за", "что за этим стоит", "что вами движет",
    "ради чего", "ваш интерес", "что вы хотите получить", "что для вас критично",
    "что вас беспокоит", "why is that important", "why exactly", "what matters to you",
    "what matters most", "what matters more", "what are you trying to",
    "what are you really after", "your underlying", "the real reason", "what you care about",
    "important to you", "why are you",
  ],
  acknowledge: [
    "понимаю", "я вас слышу", "я слышу", "вы правы", "справедливо", "логично", "разделяю",
    "ценю", "спасибо, что", "правильно ли я понял", "если я верно понял", "то есть вы",
    "звучит так", "я вижу, что", "i understand", "i hear you", "that makes sense", "fair point",
    "i appreciate", "if i understand", "so you are saying", "i can see that",
    "let me make sure",
  ],
  objectiveCriteria: [
    "рыночн", "по рынку", "стандарт", "бенчмарк", "независим", "медиана", "сопостав",
    "данные показывают", "исследование", "прайс", "отраслев", "практика рынка", "обзор зарплат",
    "объективн", "прецедент", "регламент", "индекс", "котировк", "официальн", "market rate",
    "market price", "benchmark", "industry standard", "the data", "research shows",
    "independent", "objective", "precedent", "comparable",
  ],
  batna: [
    "другой поставщик", "другое предложение", "альтернатив", "конкурент", "у нас есть варианты",
    "можем уйти", "рассматриваем других", "запасной вариант", "без сделки", "найдем другого",
    "второй оффер", "второй фонд", "other supplier", "another offer", "alternative",
    "competitor", "we have options", "walk away", "elsewhere", "other vendors", "fallback",
    "best alternative",
  ],
  threat: [
    "ультиматум", "иначе", "в последний раз", "мое последнее слово", "либо", "или мы уходим",
    "или мы уйдем", "или я уйд", "или я ухож", "в противном случае", "вы обязаны",
    "у вас нет выбора", "немедленно", "требую", "иначе разрываем", "это неприемлемо и точка",
    "take it or leave it", "final offer", "or else", "or i walk", "or we walk",
    "or i go elsewhere", "otherwise we", "you have no choice", "i demand", "right now or",
    "non-negotiable",
  ],
  hostile: [
    "вы не понимаете", "это глупо", "смешно", "вы обманываете", "некомпетентн", "вы врете",
    "абсурд", "вы издеваетесь", "позор", "ridiculous", "you people", "incompetent",
    "you are lying", "this is a joke", "absurd", "stupid",
  ],
  concession: [
    "готовы уступить", "можем снизить", "пойдем навстречу", "сделаем скидку", "уступим",
    "согласны на", "ок, давайте", "можем добавить", "идем на", "we can lower", "we can offer",
    "we can come down", "i can give you", "concede", "meet you", "discount", "we can throw in",
  ],
  tradeoff: [
    "если вы, то мы", "взамен", "в обмен", "при условии", "пакет", "если добавите",
    "давайте свяжем", "обменяем", "тогда мы", "в ответ на", "если мы дадим", "если мы",
    "если пойдём навстречу", "сможете подвинуться", "сможете ли вы", "готовы ли вы взамен",
    "if you, then we", "in exchange", "in return", "provided that", "package", "we could trade",
    "link", "as long as you", "if we give", "if we offer", "if you add", "can you move on",
    "can you move down", "can you move to", "would you move", "would you come down",
    "then we would", "in exchange for",
  ],
  anchor: [
    "наша цена", "мы предлагаем", "исходная", "стартуем с", "позиция такова", "we propose",
    "our price is", "starting point", "our position is", "we are asking",
  ],
  rationale: [
    "потому что", "так как", "поскольку", "причина в том", "это позволит", "за счет", "because",
    "since", "the reason", "this allows", "so that", "which means",
  ],
  rapport: [
    "рад встрече", "приятно познакомиться", "как ваши дела", "спасибо за встречу",
    "nice to meet", "good to see you", "thanks for taking the time", "how are you",
  ],
  accept: [
    "по рукам", "договорились", "принимаю", "мы согласны", "заключаем", "подписываем",
    "меня устраивает", "сделка", "deal at", "deal on", "we have a deal", "i accept", "we agree",
    "done deal", "let us sign", "i can live with", "that works for us",
  ],
};
