"""techniques.py — faithful Python port of legacy-node/engine/techniques.js.

Heuristic, bilingual (RU/EN) analyzer that classifies a free-text player
utterance into negotiation "moves" and scores its argumentation quality.

Deliberately transparent (rule-based): runs offline, deterministically, and is
auditable for a training tool. Grounded in Harvard principled negotiation,
SPIN questioning, and BATNA.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Optional

from app.engine.numbers import spell_to_digits


def _js_round(x: float) -> int:
    """Replicate JS Math.round (round half toward +infinity)."""
    return math.floor(x + 0.5)


def norm(s: Optional[str]) -> str:
    s = (s or "").lower().replace("ё", "е")
    out = []
    for ch in s:
        if ch.isalnum() or ch.isspace() or ch in "%.,?!-":
            out.append(ch)
        else:
            out.append(" ")
    s = "".join(out)
    s = re.sub(r"\s+", " ", s).strip()
    # Числительные словами → цифры. Единственная точка, через которую проходит
    # любой ход, поэтому паритет клавиатуры и голоса обеспечивается здесь:
    # «триста тысяч» и «300 000» дают один и тот же ход. См. numbers.py.
    return spell_to_digits(s)


def _has(t: str, arr: list[str]) -> bool:
    return any(w in t for w in arr)


def _count_matches(t: str, arr: list[str]) -> int:
    return sum(1 for w in arr if w in t)


# ---- Lexicons (RU + EN) -----------------------------------------------------

LEX: dict[str, list[str]] = {
    "question": ["?"],
    "spinSituation": [
        "как сейчас", "как у вас", "какой у вас", "сколько", "как часто", "кто у вас",
        "как устроен", "расскажите о", "что вы используете", "какой процесс",
        "how do you currently", "how many", "how often", "what is your current",
        "who handles", "tell me about your", "what process",
    ],
    "spinProblem": [
        "сложно", "проблема", "мешает", "не устраивает", "трудно", "узкое место",
        "с какими сложностями", "что не устраивает", "что вас беспокоит", "болит",
        "difficult", "problem", "challenge", "frustrat", "bottleneck", "pain",
        "concerns you", "struggl",
    ],
    "spinImplication": [
        "к чему это приводит", "чем это грозит", "сколько вы теряете", "если так продолжится",
        "как это влияет", "во что обходится", "какие последствия",
        "what happens if", "how does that affect", "what does that cost", "impact of",
        "consequence", "if this continues",
    ],
    "spinNeedPayoff": [
        "было бы полезно", "что если бы", "насколько важно", "помогло бы вам",
        "какая ценность", "если бы мы решили", "это бы вам дало",
        "would it help", "how valuable", "what if you could", "would that be useful",
        "benefit of solving",
    ],
    "interestsProbe": [
        "почему для вас", "почему именно", "почему это", "что для вас важн", "что важнее",
        "зачем вам", "какая цель", "что стоит за", "что за этим стоит", "что вами движет",
        "ради чего", "ваш интерес", "что вы хотите получить", "что для вас критично",
        "что вас беспокоит",
        "why is that important", "why exactly", "what matters to you", "what matters most",
        "what matters more",
        "what are you trying to", "what are you really after", "your underlying",
        "the real reason", "what you care about", "important to you", "why are you",
    ],
    "acknowledge": [
        "понимаю", "я вас слышу", "я слышу", "вы правы", "справедливо", "логично", "разделяю",
        "ценю", "спасибо, что", "правильно ли я понял", "если я верно понял",
        "то есть вы", "звучит так", "я вижу, что",
        "i understand", "i hear you", "that makes sense", "fair point", "i appreciate",
        "if i understand", "so you are saying", "i can see that", "let me make sure",
    ],
    "objectiveCriteria": [
        "рыночн", "по рынку", "стандарт", "бенчмарк", "независим", "медиана", "сопостав",
        "данные показывают", "исследование", "прайс", "отраслев", "практика рынка",
        "обзор зарплат", "объективн", "прецедент", "регламент", "индекс", "котировк",
        "официальн",
        "market rate", "market price", "benchmark", "industry standard", "the data",
        "research shows", "independent", "objective", "precedent", "comparable",
    ],
    "batna": [
        "другой поставщик", "другое предложение", "альтернатив", "конкурент",
        "у нас есть варианты", "можем уйти", "рассматриваем других", "запасной вариант",
        "без сделки", "найдем другого", "второй оффер", "второй фонд",
        "other supplier", "another offer", "alternative", "competitor", "we have options",
        "walk away", "elsewhere", "other vendors", "fallback", "best alternative",
    ],
    "threat": [
        "ультиматум", "иначе", "в последний раз", "мое последнее слово", "либо",
        "или мы уходим", "или мы уйдем", "или я уйд", "или я ухож", "в противном случае",
        "вы обязаны", "у вас нет выбора", "немедленно", "требую", "иначе разрываем",
        "это неприемлемо и точка", "take it or leave it", "final offer", "or else",
        "or i walk", "or we walk", "or i go elsewhere", "otherwise we",
        "you have no choice", "i demand", "right now or", "non-negotiable",
    ],
    "hostile": [
        "вы не понимаете", "это глупо", "смешно", "вы обманываете", "некомпетентн",
        "вы врете", "абсурд", "вы издеваетесь", "позор",
        "ridiculous", "you people", "incompetent", "you are lying", "this is a joke",
        "absurd", "stupid",
    ],
    "concession": [
        "готовы уступить", "можем снизить", "пойдем навстречу", "сделаем скидку", "уступим",
        "согласны на", "ок, давайте", "можем добавить", "идем на",
        "we can lower", "we can offer", "we can come down", "i can give you", "concede",
        "meet you", "discount", "we can throw in",
    ],
    "tradeoff": [
        "если вы, то мы", "взамен", "в обмен", "при условии", "пакет", "если добавите",
        "давайте свяжем", "обменяем", "тогда мы", "в ответ на", "если мы дадим", "если мы",
        "если пойдём навстречу", "сможете подвинуться", "сможете ли вы", "готовы ли вы взамен",
        "if you, then we", "in exchange", "in return", "provided that", "package",
        "we could trade", "link", "as long as you", "if we give", "if we offer",
        "if you add", "can you move on", "can you move down", "can you move to",
        "would you move", "would you come down", "then we would", "in exchange for",
    ],
    "anchor": [
        "наша цена", "мы предлагаем", "исходная", "стартуем с", "позиция такова",
        "we propose", "our price is", "starting point", "our position is", "we are asking",
    ],
    "rationale": [
        "потому что", "так как", "поскольку", "причина в том", "это позволит", "за счет",
        "because", "since", "the reason", "this allows", "so that", "which means",
    ],
    "rapport": [
        "рад встрече", "приятно познакомиться", "как ваши дела", "спасибо за встречу",
        "nice to meet", "good to see you", "thanks for taking the time", "how are you",
    ],
    "accept": [
        "по рукам", "договорились", "принимаю", "мы согласны", "заключаем", "подписываем",
        "меня устраивает", "сделка", "deal at", "deal on", "we have a deal", "i accept",
        "we agree", "done deal", "let us sign", "i can live with", "that works for us",
    ],
    # Слова, при которых число в реплике — ЦЕНА, а не просто цифра. Нужны потому,
    # что «цена 300000» не содержит ни одного приёма из словарей выше, но это
    # безусловно оффер. Держать список рядом с приёмами, а не в регулярке:
    # он билингвальный и его правят те же руки.
    "priceContext": [
        "цен", "прайс", "руб", "₽", "стоит", "стоимост", "оклад", "зарплат", "аренд",
        "ставк", "тариф", "бюджет", "скидк", "платить", "плачу", "заплат", "за штук",
        "шт", "мес", "долл", "евро", "процент",
        "price", "rate", "cost", "salary", "budget", "discount", "per unit", "unit",
        "pay", "fee", "usd", "eur", "dollar", "euro", "percent",
    ],
    # Слово СРАЗУ ПОСЛЕ числа, которое доказывает: это не цена. «Мне 30 лет» и
    # «у нас 5 инженеров» становились офертой на 30 и на 5 — движок видел цифру
    # и не спрашивал, чего она. Проверка идёт первой и перебивает ценовой
    # контекст. Лежит в LEX, а не рядом: так список уезжает в браузерное
    # зеркало генератором и не может разойтись руками.
    "nonPriceUnits": [
        "лет", "год", "человек", "чел", "инженер", "сотрудник", "недел", "месяц",
        "дня", "дней", "день", "час", "минут", "штук", "раз", "пункт", "услови",
        "вариант",
        "years", "year", "people", "person", "engineer", "employee", "week",
        "month", "day", "hour", "minute", "times", "items", "points", "options",
    ],
}

#: Суффикс валюты/масштаба вплотную к числу — сам по себе доказательство цены.
_MONEY_SUFFIX_RE = re.compile(
    r"^\s*(%|руб|rub|k\b|к\b|тыс|тысяч|млн|usd|\$|€|eur|долл|евро)", re.IGNORECASE
)

# A monetary figure in the message ("we can do 85", "цена 92").
#
# Две ветки, и порядок важен. Первая — число с разделителями групп («300 000»,
# «1.500»); вторая — сплошной ряд цифр с необязательной дробной частью.
#
# Вторая ветка добавлена по найденному дефекту: прежняя регулярка требовала
# разделитель, поэтому «300000» читалось как **300**, а «64000» — как 640.
# Игрок называл цену, а движок засчитывал другую — молча. Проявлялось и при
# печати, и особенно при голосе, где числительные разворачиваются в сплошной
# ряд цифр.
#
# ЦИФРЫ ТОЛЬКО ASCII, и это не педантизм. `\d` в питоне ловит ЛЮБУЮ десятичную
# цифру юникода, а `float()` их разбирает: «٩٠» и «９０» приходили сюда как 90.
# В браузерном зеркале `\d` — это [0-9], и там та же реплика числа не несёт.
# Одна и та же строка становилась офертой на сервере и пустым звуком офлайн —
# прямой разрыв инварианта 8. Класс задан явно, чтобы разойтись было нельзя.
MONEY_RE = re.compile(
    r"(?:^|[^0-9])([0-9]{1,3}(?:[ .,][0-9]{3})+|[0-9]+(?:[.,][0-9]+)?)"
    r"(?:\s*(?:%|руб|k|к|тыс|тысяч|млн|usd|\$|€|eur))?",
    re.IGNORECASE,
)


def extract_number(text: str) -> Optional[float]:
    """Первое число реплики — БЕЗ вопроса о том, цена ли это (см. offer_number)."""
    m = MONEY_RE.search(text)
    if not m:
        return None
    raw = m.group(1).replace(" ", "").replace(",", ".", 1)
    try:
        val = float(raw)
    except ValueError:
        return None
    return val if math.isfinite(val) else None


def offer_number(t: str, moves: list[str]) -> Optional[float]:
    """Число реплики, если это ОФФЕР; иначе None.

    Цифра сама по себе ничего не значит: «Мне 30 лет, я работаю тут 5 лет»
    читалось как зарплата 30 там, где шкала 180–240, а «Ага 1.» — как цена
    1 ₽/шт. Число становится оффертой, только когда реплика несёт намерение
    назвать цену: приём (якорь, уступка, размен, закрытие), денежный суффикс
    вплотную к числу, слово из ценового контекста — или вся реплика и есть
    число. Слово-единица сразу после числа («лет», «инженеров») перебивает всё:
    это счёт чего-то, а не деньги. Масштаб сценария проверяется отдельно и
    позже — здесь сценарий неизвестен (см. engine._plausible_offer).
    """
    m = MONEY_RE.search(t)
    if not m:
        return None
    raw = m.group(1).replace(" ", "").replace(",", ".", 1)
    try:
        val = float(raw)
    except ValueError:
        return None
    if not math.isfinite(val):
        return None

    tail = t[m.end(1):]
    after = tail.strip().split(" ")[0].strip(".,?!-") if tail.strip() else ""
    if after and any(after.startswith(u) for u in LEX["nonPriceUnits"]):
        return None

    intent = any(k in moves for k in ("anchor", "concession", "accept", "tradeoff"))
    if intent:
        return val
    if _MONEY_SUFFIX_RE.match(tail):
        return val
    if _has(t, LEX["priceContext"]):
        return val
    # Вся реплика — одно число: в переговорах это цена и ничто иное.
    if len([w for w in t.split(" ") if w]) <= 1:
        return val
    return None


@dataclass
class Analysis:
    moves: list[str]
    primary: str
    number: Optional[float]
    arg_quality: int
    spin: Optional[str]
    tags: list[dict[str, str]]
    flags: dict[str, bool]
    words: int


def analyze(raw_text: Optional[str]) -> Analysis:
    t = norm(raw_text)
    moves: list[str] = []
    tags: list[dict[str, str]] = []

    def add_move(k: str) -> None:
        if k not in moves:
            moves.append(k)

    def add_tag(key: str, label: str) -> None:
        tags.append({"key": key, "label": label})

    is_question = "?" in t

    # SPIN detection (order = specificity)
    spin: Optional[str] = None
    if _has(t, LEX["spinNeedPayoff"]):
        spin = "need-payoff"; add_move("spin_needpayoff"); add_tag("spin", "SPIN · Need-payoff")
    elif _has(t, LEX["spinImplication"]):
        spin = "implication"; add_move("spin_implication"); add_tag("spin", "SPIN · Implication")
    elif _has(t, LEX["spinProblem"]):
        spin = "problem"; add_move("spin_problem"); add_tag("spin", "SPIN · Problem")
    elif _has(t, LEX["spinSituation"]):
        spin = "situation"; add_move("spin_situation"); add_tag("spin", "SPIN · Situation")

    if _has(t, LEX["interestsProbe"]):
        add_move("interests_probe"); add_tag("interests", "Probing interests")
    if _has(t, LEX["acknowledge"]):
        add_move("acknowledge"); add_tag("empathy", "Active listening")
    if _has(t, LEX["objectiveCriteria"]):
        add_move("objective_criteria"); add_tag("criteria", "Objective criteria")
    if _has(t, LEX["batna"]):
        add_move("batna"); add_tag("batna", "BATNA / leverage")
    if _has(t, LEX["tradeoff"]):
        add_move("tradeoff"); add_tag("tradeoff", "Trade-off (value creation)")
    if _has(t, LEX["threat"]):
        add_move("threat"); add_tag("threat", "Pressure / ultimatum")
    if _has(t, LEX["hostile"]):
        add_move("hostile"); add_tag("hostile", "Hostile tone")
    if _has(t, LEX["concession"]):
        add_move("concession"); add_tag("concession", "Concession")
    if _has(t, LEX["anchor"]):
        add_move("anchor"); add_tag("anchor", "Anchoring")
    if _has(t, LEX["accept"]):
        add_move("accept"); add_tag("accept", "Closing / accept")
    if _has(t, LEX["rapport"]):
        add_move("rapport"); add_tag("rapport", "Rapport")

    number = offer_number(t, moves)
    if number is not None and "accept" not in moves:
        # A bare number is an offer/counter unless it's clearly a question stat.
        if not is_question:
            add_move("offer"); add_tag("offer", "Offer / number")

    if is_question and spin is None and "interests_probe" not in moves:
        add_move("open_question"); add_tag("question", "Open question")

    # Fallback: plain statement
    if not moves:
        add_move("statement")

    # --- Argumentation quality -------------------------------------------------
    words = len([w for w in t.split(" ") if w])
    # `substance` — цифра или связка «потому что». Дешёвая проверка на то, что за
    # словом «рынок» что-то стоит: без неё «по рынку это дорого» получало ту же
    # прибавку, что и «по трём независимым прайсам медиана 88». Правило пришло из
    # браузерного зеркала движка, где оно было с самого начала, — и до этой правки
    # одна и та же реплика получала РАЗНЫЙ балл онлайн и офлайн.
    rationale_n = _count_matches(t, LEX["rationale"])
    # Цифра — ASCII, как и в MONEY_RE: `str.isdigit()` истинен для «٩», «²» и
    # прочих юникодных цифр, а `/\d/` в зеркале — нет, и один и тот же текст
    # получал +18 за критерий на сервере и не получал в браузере.
    substance = rationale_n > 0 or any("0" <= ch <= "9" for ch in t)
    arg = 20
    arg += min(20, rationale_n * 12)
    if "objective_criteria" in moves and substance:
        arg += 18
    if spin:
        arg += 14
    if "interests_probe" in moves:
        arg += 12
    if "acknowledge" in moves:
        arg += 10
    if "tradeoff" in moves and substance:
        arg += 10
    if number is not None:
        arg += 6
    if 12 <= words <= 60:
        arg += 8  # substantive but not rambling
    if words < 4:
        arg -= 15
    if "hostile" in moves:
        arg -= 30
    if "threat" in moves and "objective_criteria" not in moves and "batna" not in moves:
        arg -= 12
    arg = max(0, min(100, _js_round(arg)))

    # Primary move — priority ordering for opponent reaction.
    priority = [
        "accept", "hostile", "threat", "tradeoff", "objective_criteria", "batna",
        "interests_probe", "spin_needpayoff", "spin_implication", "spin_problem",
        "spin_situation", "acknowledge", "concession", "offer", "anchor",
        "open_question", "rapport", "statement",
    ]
    primary = next((p for p in priority if p in moves), "statement")

    return Analysis(
        moves=list(moves),
        primary=primary,
        number=number,
        arg_quality=arg,
        spin=spin,
        tags=tags,
        flags={
            "hostile": "hostile" in moves,
            "threat": "threat" in moves,
            "question": is_question,
        },
        words=words,
    )
