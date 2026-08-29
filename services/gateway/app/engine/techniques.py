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


#: Знак валюты → слово. ПОЧЕМУ ЭТО ЕСТЬ.
#:
#: `norm()` выбрасывает всё, что не буква и не цифра, — а значит «$» умирал
#: раньше, чем успевал доказать, что число рядом это цена. «I can do $500»
#: превращалось в «i can do 500», ни одного слова ценового контекста там нет,
#: и `offer_number` честно отвечал «не оффер». Русский тем же предложением
#: работал: «могу дать 500 руб» несёт СЛОВО «руб», которое нормализацию
#: переживает. Английский пишет валюту ЗНАКОМ — и терял ход целиком.
#:
#: Замерено на чужом корпусе (CraigslistBargain, 38 791 человеческая реплика,
#: см. tools/validate_against_cocoa.py): из 9124 реплик, где разметчик видел
#: названную цену, а мы не видели, 5991 (65.7%) содержали «$». Полнота
#: распознавания цены на английском была 30%, каппа согласия с их разметкой
#: 0.337; после правки — 75% и 0.776. Отчёт: docs/validation.md.
#:
#: Замена именно на слово, а не сохранение знака: «usd», «руб», «eur» уже
#: лежат и в `_MONEY_SUFFIX_RE`, и в `priceContext`. Символ, оставленный как
#: символ, потребовал бы отдельного правила «валюта ПЕРЕД числом» — в русском
#: она стоит после, в английском до. Слово снимает вопрос порядка.
_CURRENCY_WORDS = (("$", " usd "), ("\u20bd", " руб "), ("\u20ac", " eur "))


def norm(s: Optional[str]) -> str:
    s = (s or "").lower().replace("ё", "е")
    for sym, word in _CURRENCY_WORDS:
        if sym in s:
            s = s.replace(sym, word)
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


#: Ключевые слова — ОСНОВЫ, и совпадать они обязаны с НАЧАЛА слова.
#:
#: Голое вхождение подстроки засчитывало «справедливо» внутри «несправедливо»:
#: реплика «это несправедливо по отношению ко мне» получала активное слушание,
#: +8 доверия и самую тёплую реакцию. Жалоба вознаграждалась как эмпатия — а
#: английское «unfair» не давало ничего, то есть два языка вели себя
#: по-разному на одном и том же предложении.
#:
#: Хвост остаётся открытым намеренно: основы для того и написаны, чтобы ловить
#: словоформы («загрузк» → «загрузка», «загрузку»). Закрывается только начало.
def _starts_at_word(text: str, word: str) -> bool:
    start = 0
    while True:
        at = text.find(word, start)
        if at < 0:
            return False
        before = text[at - 1] if at else " "
        if not before.isalpha():
            return True
        start = at + 1


def _word_starts(t: str, word: str) -> list[int]:
    """Все позиции, где основа стоит С НАЧАЛА слова (см. `_starts_at_word`)."""
    out: list[int] = []
    start = 0
    while True:
        at = t.find(word, start)
        if at < 0:
            return out
        before = t[at - 1] if at else " "
        if not before.isalpha():
            out.append(at)
        start = at + 1


#: Сколько слов перед триггером считается «прямо перед ним».
#:
#: Три, и число замерено, а не выбрано: «no problem» кладёт отрицание за одно
#: слово, «not a problem» за два, «isn't a problem» после нормализации («isn t a
#: problem») — за три. Четвёртое слово уже перевешивает в другую сторону: «no,
#: that is a problem» — это ПОДТВЕРЖДЕНИЕ проблемы, и окно обязано его
#: пропустить.
_NEGATION_WINDOW = 3


def _negated_at(t: str, at: int) -> bool:
    """Стоит ли отрицание вплотную ПЕРЕД совпадением на позиции `at`."""
    head = t[:at].split()
    return any(w in _NEGATORS for w in head[-_NEGATION_WINDOW:])


def _has(t: str, arr: list[str]) -> bool:
    return any(_starts_at_word(t, w) for w in arr)


def _has_unnegated(t: str, arr: list[str]) -> bool:
    """`_has`, но совпадение под отрицанием не считается.

    ЗАЧЕМ. «No problem» — это вежливая отговорка, а движок засчитывал ей стадию
    SPIN «Проблема» и +14 к аргументации. На чужом корпусе (CraigslistBargain,
    38 791 реплика) слово `problem` совпало 311 раз, и 149 из них — «no problem»
    / «not a problem» / «isn't a problem». Расширением словаря это не чинится:
    отрицание — не слово, а отношение к слову, и лежит оно ПЕРЕД ним.

    То же самое сторожит короткое закрытие: «no deal» — это отказ, а не сделка,
    и без этой проверки формула закрытия читалась бы наоборот.
    """
    return any(
        any(not _negated_at(t, at) for at in _word_starts(t, w)) for w in arr
    )


def _count_matches(t: str, arr: list[str]) -> int:
    return sum(1 for w in arr if _starts_at_word(t, w))


# ---- Lexicons (RU + EN) -----------------------------------------------------

LEX: dict[str, list[str]] = {
    "question": ["?"],
    "spinSituation": [
        "как сейчас", "как у вас", "какой у вас", "сколько", "как часто", "кто у вас",
        "как устроен", "расскажите о", "что вы используете", "какой процесс",
        # «how much» — прямое зеркало русского «сколько», которого в английской
        # половине не было: «How much food do you need?» не получала стадии
        # Situation, а «Сколько еды нужно?» получала. Найдено переносом
        # разметки переводом (§ 7 отчёта): 8 реплик выборки срабатывали только
        # по-русски, и это расхождение рецепта, а не богатство одной половины.
        "how do you currently", "how many", "how much", "how often", "what is your current",
        "who handles", "tell me about your", "what process",
    ],
    "spinProblem": [
        "сложно", "проблема", "мешает", "не устраивает", "трудно", "узкое место",
        "с какими сложностями", "что не устраивает", "что вас беспокоит", "болит",
        "difficult", "problem", "challenge", "frustrat", "bottleneck",
        # «pain» без хвоста ловил «paint», «painted», «painting»: на чужом
        # корпусе 165 срабатываний из 170 были про покраску, и реплика про
        # цвет двери получала стадию SPIN Problem и +14 к аргументации.
        "painful", "pain point",
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
        # Прямой разговорный вопрос о нужде партнёра не ловился ни на одном
        # языке: на экспертно размеченном CaSiNo «What do you need?» — 27 из
        # 27 совпадений размечены как elicit-pref, а мы видели open_question.
        "что вам нужн", "что вы предпочит",
        # «what do you need» безразлично к обращению, а русский тот же вопрос
        # раздваивает: «что вам нужно» лежало в списке, «что тебе нужно» — нет.
        # Одна английская запись против одной русской — это НЕ паритет, если
        # русских форм две.
        "что тебе нужн", "тебе что нужн", "что для тебя важн",
        "what do you need", "what do you prefer", "what are you looking for",
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
    # РУССКИЕ ОСНОВЫ ЗДЕСЬ БЫЛИ ШИРЕ АНГЛИЙСКИХ, и ультиматум получала обычная
    # речь. Тот же класс ошибки, что «pain»→«paint» и «fee»→«feel», только по
    # эту сторону словаря — а её никто не проверял чужим текстом (§ 7 отчёта):
    #
    #   «либо»   → «это должна быть либо вода, либо дрова» — перечисление
    #              вариантов становилось ультиматумом. Английского аналога у
    #              списка нет вовсе: «or else», «otherwise we» требуют второго
    #              слова. Заменено на «либо мы/вы/я» — три формы, которыми
    #              ультиматум и говорят («Либо 65, либо я снимаю у соседей»,
    #              упражнение `ul-*` курса, продолжает срабатывать).
    #   «требую» → основа с открытым хвостом ловила «требуются»: «мне требуются
    #              вода и провизия» — заявление о нужде, а не требование.
    #   «иначе»  → «может, как-то иначе договоримся?», «иначе я в минусе»,
    #              «иначе никак». Наречие, а не угроза. Осталось «иначе
    #              разрываем» и добавлено «иначе мы».
    #
    # Цена ошибки несимметрична: `threat` третий по приоритету, снимает 12 очков
    # аргументации и ведёт оппонента к самой холодной реакции.
    "threat": [
        "ультиматум", "в последний раз", "мое последнее слово",
        "либо мы", "либо вы", "либо я",
        "или мы уходим", "или мы уйдем", "или я уйд", "или я ухож", "в противном случае",
        "вы обязаны", "у вас нет выбора", "немедленно", "я требую", "мы требуем",
        "иначе мы", "иначе разрываем",
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
        # Список держался на «мы» — ровно та же беда, которую до этого нашли и
        # починили у `anchor`. Английская половина обе формы имеет («we can
        # lower» и «i can give you»), русская знала только множественное число:
        # «могу уступить до 1700» уступкой не считалось, «можем уступить» —
        # считалось. Одна и та же мысль от первого лица единственного числа
        # проваливалась в `statement`.
        "готовы уступить", "могу уступить", "готов уступить", "могу снизить",
        "могу скинуть", "можем снизить", "пойдем навстречу", "сделаем скидку", "уступим",
        "согласны на", "ок, давайте", "можем добавить", "идем на",
        "we can lower", "we can offer", "we can come down", "i can give you", "concede",
        "discount", "we can throw in",
        # «meet you» — это была не уступка, а место встречи: из 139 совпадений
        # на чужом корпусе 101 звучало как «I can meet you at the AT&T store»,
        # и «приятно познакомиться» тоже засчитывалось уступкой. Уступку
        # делает не встреча, а половина пути.
        "meet you half", "meet you in the middle", "meet in the middle",
    ],
    "tradeoff": [
        "если вы, то мы", "взамен", "в обмен", "при условии", "пакет", "если добавите",
        "давайте свяжем", "обменяем", "в ответ на", "если мы дадим", "если мы",
        "если пойдем навстречу", "сможете подвинуться", "сможете ли вы", "готовы ли вы взамен",
        "if you, then we", "in exchange", "in return", "provided that", "package",
        "we could trade", "link", "as long as you", "if we give", "if we offer",
        "if you add", "can you move on", "can you move down", "can you move to",
        "would you move", "would you come down", "then we would", "in exchange for",
    ],
    # ЗАЯВЛЕНИЕ ПОЗИЦИИ, а не цифра внутри довода. Различие рабочее, а не
    # терминологическое: с этого приёма движок считает право первого слова
    # (engine._anchor_frame), и упражнение `an-10` требует ровно его. Список
    # был вдвое короче и держался на «мы»: «я предлагаю 1080, потому что по
    # рынку столько» — та же реплика от первого лица — приёма не получала, и
    # правильный ответ курса, произнесённый своими словами, не работал в игре.
    "anchor": [
        "наша цена", "моя цена", "мы предлагаем", "я предлагаю", "наше предложение",
        "мое предложение", "исходная", "стартуем с", "начнем с цены", "позиция такова",
        "готов заплатить", "готовы заплатить", "готов предложить", "готовы предложить",
        "we propose", "i propose", "our price is", "my price is", "our offer is",
        "my offer is", "starting point", "our position is", "my position is",
        "we are asking", "i am asking", "we are offering", "i am offering",
    ],
    "rationale": [
        "потому что", "так как", "поскольку", "причина в том", "это позволит", "за счет",
        "because", "since", "the reason", "this allows", "so that", "which means",
    ],
    "rapport": [
        # «как ваши дела» требовало притяжательного местоимения, а английское
        # «how are you» ловит и «how are you doing». Голое «как дела» — самая
        # частая русская форма того же вопроса — не ловилось ничем.
        "рад встрече", "приятно познакомиться", "как ваши дела", "как дела",
        "как поживае", "спасибо за встречу",
        "nice to meet", "good to see you", "thanks for taking the time", "how are you",
        # Формулы приветствия отсутствовали в ОБЕИХ половинах: 1916 реплик
        # чужого корпуса открывались словом «hello»/«hey» и не получали
        # контакта вовсе. Приветствие — самый частый первый ход человека.
        "здравствуйте", "добрый день", "доброе утро", "добрый вечер", "привет",
        "hello", "hey", "good morning", "good afternoon",
    ],
    "accept": [
        "по рукам", "договорились", "принимаю", "мы согласны", "заключаем", "подписываем",
        "меня устраивает", "deal at", "deal on", "we have a deal", "i accept",
        "we agree", "done deal", "let us sign", "i can live with", "that works for us",
    ],
    # Закрытие, сказанное ОДНИМ СЛОВОМ. Читается только у короткой реплики и
    # только вне отрицания — см. `_is_short_close`.
    #
    # ПОЧЕМУ ОТДЕЛЬНЫМ СПИСКОМ, А НЕ ДОПИСКОЙ В `accept`. Английское «deal» —
    # обычное существительное: на чужом корпусе основа совпала 2404 раза, и это
    # «good deal», «the deal is», «dealer». Приём `accept` у нас высшего
    # приоритета и ведёт стол к закрытию, поэтому цена ошибки здесь
    # несимметрична: пропустить закрытие дешевле, чем закрыть сделку за игрока.
    # Ограничение «вся реплика — формула» снимает ровно эту двусмысленность:
    # «Deal.» закрывает, «that would be a good deal for you» — нет.
    #
    # Русская половина короче не по недосмотру: по-русски закрытие говорят
    # СВОИМИ идиомами («по рукам», «договорились»), которые ничего другого не
    # значат и потому стоят в `accept` без всяких условий. Сюда уехало то, что
    # двусмысленно и у нас: «сделка» — такое же обычное существительное, как
    # «deal» («эта сделка нам невыгодна» закрывала стол), и «годится».
    "acceptShort": [
        "сделка", "годится",
        "deal", "agreed",
    ],
    # Слова, при которых число в реплике — ЦЕНА, а не просто цифра. Нужны потому,
    # что «цена 300000» не содержит ни одного приёма из словарей выше, но это
    # безусловно оффер. Держать список рядом с приёмами, а не в регулярке:
    # он билингвальный и его правят те же руки.
    "priceContext": [
        "цен", "прайс", "руб", "стоит", "стоимост", "оклад", "зарплат", "аренд",
        "ставк", "тариф", "бюджет", "скидк", "платить", "плачу", "заплат", "за штук",
        "шт", "мес", "долл", "евро", "процент",
        "price", "rate", "cost", "salary", "budget", "discount", "per unit", "unit",
        # «fee» без хвоста ловил «feel», «feet», «feeding»: 248 из 353
        # совпадений на чужом корпусе были не про деньги, и каждое делало
        # соседнее число ценой («I gotta feed my 12 kids» → оффер на 12).
        "pay", "fees", "usd", "eur", "dollar", "euro", "percent",
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
    # НАМЕРЕНИЕ НАЗВАТЬ ЦЕНУ. Читает этот список ТОЛЬКО `offer_number` — ни
    # одного тега приёма отсюда не берётся, и это главное свойство ключа.
    #
    # ЗАЧЕМ ОН ОТДЕЛЬНЫЙ. «How about 120?» — контроффер, но не якорь (якорь
    # заявляет позицию) и не уступка (покупатель здесь не уступает). Положить
    # эти формулы в `anchor` или `concession` значило бы соврать о приёме ради
    # числа. Поэтому ключ доказывает только одно: рядом стоящее число — цена.
    #
    # ЗАМЕР. На чужом корпусе (CraigslistBargain) 3239 реплик, где разметчик
    # видел названную цену, а мы нет; во ВСЕХ 3239 число в тексте было — отказ
    # шёл от `offer_number`, не нашедшего доказательства, что число это цена.
    # Верхние формулы: «how about» 412, «i can do» 167, «i can go» 113,
    # «lowest» 89, «asking» 80, «i could do» 76. Отчёт — docs/validation.md
    # § 4.7; там же — почему «give you» (95 попаданий, второй результат) из
    # списка ВЫЛЕТЕЛА: на ней покраснел tools/bilingual_audit.py.
    #
    # Русская половина написана по симметрии, а не по замеру: русскоязычного
    # корпуса переговоров с разметкой найти не удалось. Она страдает тем же —
    # «а если 86?» тоже не оффер, — и лечится тем же списком.
    "offerIntent": [
        # ЗАМЕР РУССКОЙ ПОЛОВИНЫ (§ 7 отчёта, перенос разметки переводом).
        # Из 40 реплик, где английская формула доказывала цену, русская молчала
        # на 13. Две дыры, и обе структурные, а не «не хватило слова»:
        #
        #   ВТОРОЕ ЛИЦО. Английский список знает обе стороны стола («i can do»
        #   и «would you take»), русский знал только свою: «отдам за» было,
        #   «отдашь за 25?» — нет. Покупатель, спрашивающий цену, оставался без
        #   оффера.
        #   ГЛАГОЛЫ ПРЕДЛОЖЕНИЯ. «могу предложить 8500», «скину до 500»,
        #   «могу за 1700», «с меня 5900» — обиходные формы, которых не было ни
        #   одной.
        #
        # «СКИНУТЬ» ВЗЯТО ТОЛЬКО С «ДО», и это не педантизм. Голая основа
        # «скин» ловила и «скиньте 10 тысяч» — а это «уменьшите НА десять», а
        # не «цена десять». Наша собственная фикстура классификатора
        # («Мне это дорого, скиньте 10 тысяч») тут же начинала читаться как
        # оффер на 10 000. Полнота от сужения не пострадала ни на реплику: 37
        # из 40, как и с голой основой, — «до» в этой формуле говорят всегда.
        "как насчет", "как вам", "а если", "могу дать", "могу отдать", "могу сделать",
        "могу пойти на", "могу предложить", "могу за", "с меня",
        "скину до", "скинуть до", "скиньте до", "скинешь до",
        "отдам за", "отдашь за", "отдадите за", "возьму за", "возьмешь за",
        "возьмете за", "уступлю до", "сойдемся на",
        "давайте за", "мой минимум", "мой максимум", "не меньше", "не больше",
        "how about", "what about", "how does", "i can do", "i can go", "i could do",
        "i could go", "i ll do", "i ll go", "i ll give", "i will give", "offer you",
        "would you take", "will you take", "lowest", "asking",
        "go down to", "go up to", "come down to",
        "go as low as", "willing to go", "settle for", "sell it for", "take it for",
        "make it",
    ],
    # Отрицание ПЕРЕД словом-триггером. Не приём: служебный список для
    # `_has_unnegated`, см. `_NEGATION_WINDOW`.
    #
    # «t» — не опечатка, а осколок. Нормализация выбрасывает апостроф, поэтому
    # ВСЕ английские отрицательные стяжения («isn't», «don't», «won't»,
    # «can't») распадаются на слово и одинокую «t». Одна запись покрывает их
    # все; перечислять «isn», «don», «won» по отдельности значило бы забыть
    # ровно то стяжение, которое напишет игрок.
    "negators": [
        "не", "нет", "без",
        "no", "not", "never", "t",
    ],
}

#: Множество для `_negated_at` — список выше, но со скоростью проверки.
_NEGATORS = frozenset(LEX["negators"])

#: Длина реплики, при которой формула закрытия читается как закрытие.
#:
#: Четыре слова, и порог замерен: на чужом корпусе правило ловит 437 реплик, из
#: них в классах, которые ТОЧНО не закрытие (отказ, контроффер, вопрос), — две,
#: и обе на самом деле закрывают сделку названной ценой («$14 Deal»). При
#: восьми словах таких становится 182: длинная реплика со словом «deal» — это
#: разговор О сделке, а не закрытие ЕЁ.
_ACCEPT_SHORT_MAX_WORDS = 4


def _is_short_close(t: str) -> bool:
    """Вся реплика — формула закрытия: «Deal.», «Сделка!», «Agreed».

    Три условия, и каждое снимает свой класс ошибки: короткая реплика (в
    длинной «deal» — существительное), не вопрос («Deal?» спрашивает, а не
    закрывает) и не под отрицанием («no deal» — отказ).
    """
    if "?" in t:
        return False
    if len([w for w in t.split(" ") if w]) > _ACCEPT_SHORT_MAX_WORDS:
        return False
    return _has_unnegated(t, LEX["acceptShort"])

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
    # Формула предложения цены — такое же доказательство, как слово «цена».
    # «How about 120», «i can do 480», «а если 86» не несут ни одного слова
    # ценового контекста и ни одного приёма, но число в них — цена и ничто
    # иное. Список читается ЗДЕСЬ И ТОЛЬКО ЗДЕСЬ: он доказывает число, а не
    # называет приём (см. LEX["offerIntent"]).
    if _has(t, LEX["offerIntent"]):
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
    elif _has_unnegated(t, LEX["spinProblem"]):
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
    if _has(t, LEX["accept"]) or _is_short_close(t):
        add_move("accept"); add_tag("accept", "Closing / accept")
    if _has(t, LEX["rapport"]):
        add_move("rapport"); add_tag("rapport", "Rapport")

    number = offer_number(t, moves)
    if number is not None and "accept" not in moves:
        # A bare number is an offer/counter unless it's clearly a question stat.
        #
        # …но вопросительная форма сама по себе оффер НЕ отменяет: «How about
        # 120?» и «А если 86?» — это контроффер, произнесённый вопросом. Раньше
        # такая реплика получала число и не получала хода: `apply_move` кладёт
        # цену на стол только при `offer/anchor/concession/accept/tradeoff`, и
        # 1149 из 3239 пропущенных офферов чужого корпуса (35.5%) были именно
        # вопросами. Отменяет оффер только вопрос БЕЗ формулы предложения —
        # «сколько из 100 у вас на складе?».
        if not is_question or _has(t, LEX["offerIntent"]):
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
