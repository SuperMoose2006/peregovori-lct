"""sanitize.py — защита реплики оппонента от того, что модель выдала лишнего.

Извлечено из `chat_models.py` при удалении синхронного слоя бэкендов. Сам слой
(обёртки над claude CLI, tmux, Agent SDK, ChatAnthropic, ChatOpenAI) стал
недостижим: живой путь ходит в OpenRouter через асинхронного провайдера. А эта
функция — нет: она оплачена живым бейк-оффом (docs/model-bakeoff.md) и остаётся
последним рубежом между дешёвой моделью и экраном на защите.

ТРИ ВЕЩИ, КОТОРЫЕ ОНА ЛОВИТ, И ПОЧЕМУ КАЖДАЯ ВАЖНА.

1. **Чужой алфавит.** Дешёвые мультиязычные модели роняют иероглифы посреди
   русской фразы: «для нас — 携手守护, и мы идём навстречу». Одна такая реплика на
   сцене читается как сломанный софт.

2. **Выход из роли.** «Как языковая модель, я не могу…» — оппонент ломает
   четвёртую стену. Лучше шаблонная реплика движка, чем это.

3. **Markdown и кавычки.** Модель оборачивает реплику в `**` или «…», и в пузыре
   чата появляется разметка вместо речи.

Отвергнутая реплика — не потеря: вызывающий берёт шаблонную линию движка,
которая всегда существует и всегда в характере.

НО ЭКРАН — НЕ ВСЁ. Синтез речи получает фразу, как только она сложилась, задолго
до того, как модель допишет реплику и санитайзер её осудит. Значит эта функция
одна защищала только пузырь чата: услышать выход из роли человек успевал. Для
звука есть `speakable()` — те же два правила отказа, применённые к одной фразе.
"""

from __future__ import annotations

import re
from typing import Optional

#: Потолок длины реплики. Длиннее — это уже не реплика в переговорах.
MAX_LEN = 400

#: Маркеры выхода из роли. Только многословные фразы: одиночные слова ловили бы
#: законные реплики переговорщика.
_BREAK_MARKERS = (
    "я специализируюсь", "как ии", "как искусственный интеллект", "как языковая модель",
    "виртуальный ассистент", "чем могу помочь", "как ассистент", "я — ии", "я ии,",
    "as an ai", "i'm an ai", "i am an ai", "language model", "i cannot assist",
    "i'm claude", "i am claude", "i specialize in", "how can i help", "as an assistant",
)

#: Письменности, которых в игре не бывает: CJK, корейский, арабский.
_FOREIGN_SCRIPT_RE = re.compile(r"[一-鿿぀-ヿ가-힯؀-ۿ]")

#: Знаки, которых в реплике не бывает НИКОГДА: управляющие C0/C1 (кроме тех, что
#: разбор строк уже съел), нулевой байт, мягкий перенос, невидимые склейки
#: (ZWSP/ZWNJ/ZWJ, BOM) и управление направлением письма (LRO/RLO/PDF и изоляты).
#:
#: ЗАЧЕМ ЭТО ЗДЕСЬ, ЕСЛИ ФУНКЦИЯ «НЕ ПРО БЕЗОПАСНОСТЬ». Затем, что без этого она
#: не делает и своей работы. Проверка выхода из роли ищет ПОДСТРОКУ, и невидимый
#: знак между буквами рвёт её насквозь: «как‌языковая‌модель» проезжает мимо
#: всех маркеров и попадает и на экран, и в озвучку. То же с направлением
#: письма — U+202E переставляет цифры В ГЛАЗАХ ЧИТАТЕЛЯ, то есть цена в пузыре
#: перестаёт совпадать с ценой в `engine.state`, а спорить с движком реплика не
#: имеет права.
#:
#: Чем это НЕ является: разметку (`<script>`) здесь не режут. Экран защищён
#: тем, что реплика едет в React текстовым узлом и экранируется — а не тем, что
#: её кто-то почистил. Резать теги регуляркой значило бы завести вторую,
#: неполную защиту рядом с полной и попутно ломать законное «прибыль > 10%».
_INVISIBLE_RE = re.compile(
    r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u00ad​-‏‪-‮⁠-⁤⁦-⁩﻿]"
)


def _strip_invisible(text: str) -> str:
    """Убрать невидимое до того, как реплику начнут судить по содержимому."""
    return _INVISIBLE_RE.sub("", text)


def _script_ok(text: str) -> bool:
    return not _FOREIGN_SCRIPT_RE.search(text)


def rejected(s: Optional[str]) -> bool:
    """Публичная обёртка: эта фраза несёт признак, отвергающий ВСЮ реплику?

    Нужна отдельно от `speakable()`, потому что «нечего произносить» и «реплика
    испорчена» — разные вещи. Фрагмент из одних звёздочек после очистки пуст, но
    реплику не портит; фрагмент «как языковая модель,» портит.
    """
    return bool(s) and _rejected(str(s))


def _rejected(s: str) -> bool:
    """Два правила, по которым реплика отвергается целиком.

    Оба решаются ПОФРАЗНО: и маркер выхода из роли, и чужой алфавит видны в
    одном предложении, им не нужен контекст всей реплики. Именно поэтому
    существует `speakable()` — см. её шапку.
    """
    s = _strip_invisible(s)
    return any(mk in s.lower() for mk in _BREAK_MARKERS) or not _script_ok(s)


def speakable(phrase: Optional[str]) -> Optional[str]:
    """Можно ли ОЗВУЧИВАТЬ эту фразу прямо сейчас? Очищенная фраза или None.

    ЗАЧЕМ ОТДЕЛЬНАЯ ФУНКЦИЯ. `sanitize()` судит реплику целиком и вызывается,
    когда модель дописала. Синтез к этому моменту уже отзвучал: конвейер
    отдаёт фразу в озвучку, как только она сложилась, — ради этого он и
    построен (первый звук за 2.5 с вместо ожидания всего текста).

    Из-за этого санитайзер защищал только ЭКРАН. Модель, сказавшая «как
    языковая модель, я не могу вести переговоры», получала замену пузыря на
    шаблон движка — а человек эту фразу УЖЕ УСЛЫШАЛ. В голосовом режиме, то
    есть в режиме показа, звук и есть реплика; текст вторичен.

    Здесь применяются только те правила, которым не нужна вся реплика. Разбор
    длины и обрамляющих кавычек остаётся за `sanitize()`: обрезать по длине
    отдельную фразу нельзя, длину имеет смысл считать у реплики целиком.
    """
    if not phrase:
        return None
    s = _strip_invisible(phrase.replace("\r", "")).strip()
    s = s.replace("```", "")
    s = re.sub(r"[*_`]{1,3}", "", s)
    s = re.sub(r"^\s*#{1,6}\s*", "", s)
    s = re.sub(r"^\s*>+\s*", "", s)
    s = s.strip().strip("\"'«»").strip()
    if not s or _rejected(s):
        return None
    return s


#: Конец предложения: знак и пробел. Точка внутри «99.7» предложение не рвёт.
_SENTENCE_END_RE = re.compile(r"(?<=[.!?…])\s+")

#: Фразы, которыми ОППОНЕНТ объявляет сделку (нормализованный текст). Узкий
#: список, а не игроцкий `accept`: «принимаю», «мы согласны», «меня устраивает»
#: в устах оппонента — обычная речь («мы согласны, что сроки важны, но 95»).
_DEAL_CLAIM_RE = re.compile(
    r"по рукам|договорились|сделка заключена|заключаем сделку"
    r"|it s a deal|its a deal|we have a deal|deal is done|shake on it|\bagreed\b"
)
#: Отрицание вплотную перед фразой: «не договорились», «no deal».
_DEAL_NEGATED_RE = re.compile(r"(?:\bне|\bnot|\bno|\bnever)\s*$")
#: Условие или рассказ раньше в том же предложении — «если пойдёте на 90, по
#: рукам», «рад, что договорились», «if you take the volume, we have a deal» —
#: решает `_framed` ниже.
#: Слова своего предложения: число рядом с ними — обещание, а не цитата.
#: И слова СОГЛАСИЯ: «Согласна на 86», «Принимаю 99,7%», «пусть будет 260»,
#: "99.7% works for us" — оппонент берёт число игрока, и это то же обещание,
#: что «дам 86». Без них такие реплики шли «цитатой» (найдено после аудита
#: 17.10 — тот же F05 другими глаголами).
_OWN_OFFER = ["дам", "даю", "могу", "готов", "предлагаю", "отдам", "уступлю", "соглашусь",
              "сойдемся", "согласн", "принимаю", "принимаем", "устраивает", "подходит",
              "пусть будет", "давайте",
              "i can", "i ll", "i will", "give you", "we can", "we ll", "let you have",
              "accept", "works for", "fine with", "agree to", "let s"]


#: Короткое английское «сделка»: "You've got a deal.", "Fine, deal.", "Deal — 95
#: per unit." Существительное «deal» внутри фразы («this deal matters») — не
#: объявление, поэтому только в начале предложения, после запятой в конце или
#: в «got (yourself) a deal».
_DEAL_SHORT_RE = re.compile(r"^deal\b|,\s*deal\s*[.!]?$|\bgot (?:a|yourself a) deal\b")


def _framed(before: str) -> bool:
    """Условие или рассказ раньше в предложении — но не частица «что ж» и не
    указательное "That …" в начале: «Что ж, по рукам», «Ну что ж,
    договорились!», "That settles it, we have a deal" — объявленные сделки, а
    шли «рассказом» (найдено после аудита 17.10)."""
    words = [w.strip(".,?!-") for w in before.split()]
    for i, w in enumerate(words):
        if w in ("если", "if"):
            return True
        if w in ("когда", "что", "when", "that"):
            if i == 0:
                continue                      # начало предложения: «Что ж…», "That settles…"
            if w == "что" and (words[i - 1] == "ну" or (i + 1 < len(words) and words[i + 1].startswith("ж"))):
                continue                      # «ну что», «что ж»
            return True
    return False


def _deal_claim(sentence: str) -> bool:
    for m in _DEAL_CLAIM_RE.finditer(sentence):
        before = sentence[:m.start()]
        if _DEAL_NEGATED_RE.search(before) or _framed(before):
            continue
        return True
    m = _DEAL_SHORT_RE.search(sentence.strip())
    if m and not _DEAL_NEGATED_RE.search(sentence.strip()[:m.start()]):
        return True
    return False


def _deal_claim_any(sentence: str) -> bool:
    """Есть ли в предложении слова сделки вообще (после рукопожатия рамки
    «если» уже не бывает)."""
    return bool(_DEAL_CLAIM_RE.search(sentence) or _DEAL_SHORT_RE.search(sentence.strip()))


def reply_verdict(text: Optional[str], facts: dict, final: bool = True) -> str:
    """Спорит ли реплика с движком: "ok", "hold" (не озвучивать, пока не
    договорит) или "bad" (реплика отвергается целиком).

    Четвёртая вещь, которую ловит этот модуль, и единственная, которой нужны
    факты стола. Аудит 17.10, F05: на SLA движок сдвинулся 99 → 99,2, а модель
    ответила «Дам 99,7% … по рукам» — эхом числа игрока. Игрок соглашался на
    99,7, движок честно отказывал (он сравнивает со СВОИМ числом), напряжение
    росло: текст реплики и состояние партии расходились, а прав всегда движок
    (первый принцип). Промпт это запрещает, но промпт — не гарантия.

    Два признака:

    1. **Обещание условий лучше стола.** Число своей шкалы (как в `_pick_offer`:
       проценты на денежном столе, деньги на процентном и границы диапазона —
       не условия) лучше для игрока, чем лежит на столе, больше чем на допуск
       закрытия движка (2% хода цены). Числа ЗА целью игрока — рынок,
       минимальная партия, «100% доступность» — обещанием считаются только
       рядом со словом своего предложения («дам», «могу»). Число игрока или
       своё прежнее — цитата, пока его не обещают («ваши 86 — нереально»);
       рядом с нынешним предложением цитировать можно всегда.
    2. **Объявленная сделка, которой нет**: «по рукам», «договорились» в
       законченном предложении не вопросом, без отрицания и без «если».

    ПОТОК (`final=False`). Делитель режет первую фразу по запятой, поэтому
    кусок судится накопленным текстом, а сомнительное ПРИДЕРЖИВАЕТСЯ, а не
    отвергается: «Ваши 86 — нереально,» ещё может закончиться «могу 95», а
    «Договорились,» — вопросом. Придержанное звучит, когда реплика сошлась, и
    не звучит никогда, если она отвергнута: «Дам 99,7%» не должно прозвучать.
    """
    if not text or not facts.get("scenario_id"):
        return "ok"
    from app.engine.engine import _plausible_offer, by_id
    from app.engine.techniques import _has, norm, number_mentions

    sc = by_id(facts["scenario_id"])
    status = facts.get("status", "active")
    text = _strip_invisible(text)
    verdict = "ok"
    if status != "agreement":
        for sentence in _SENTENCE_END_RE.split(text):
            st = norm(sentence)
            if not st or not _deal_claim(st):
                continue
            finished = final or sentence.rstrip().endswith((".", "!", "…"))
            if "?" in st:
                continue
            if finished:
                return "bad"
            verdict = "hold"

    ref = facts.get("deal") if status == "agreement" and facts.get("deal") is not None else facts.get("offer_opp")
    if ref is None:
        return verdict
    t = norm(text)
    lower_better = sc.headline.dir == "lower_is_better"
    near = 0.02 * abs(sc.opponent_open - sc.opponent_reservation)
    foreign = "money" if "%" in sc.headline.unit["ru"] else "pct"

    def priced(source: str) -> list[float]:
        out = []
        for m in number_mentions(source):
            if m.ranged or m.kind == foreign:
                continue
            p = _plausible_offer(sc, m.value)
            if p is not None:
                out.append(p)
        return out

    def beyond(v: float, mark: float) -> bool:
        return (v < mark - near) if lower_better else (v > mark + near)

    said = priced(t)
    if status == "agreement":
        # После рукопожатия число одно — сделки. «По рукам, 95 за штуку» при
        # сделке на 92 шло: проверка смотрела только «лучше стола для игрока»,
        # а 95 хуже (найдено после аудита 17.10). Объявленная сделка с ДРУГИМ
        # числом в том же предложении — спор с движком в любую сторону.
        for sentence in _SENTENCE_END_RE.split(text):
            st = norm(sentence)
            if st and _deal_claim_any(st) and any(abs(v - ref) > near for v in priced(st)):
                return "bad"
    names_ref = any(abs(v - ref) <= near for v in said)
    own_offer = _has(t, _OWN_OFFER)
    recorded = priced(norm(facts.get("player_text") or "")) + list(facts.get("offer_history") or [])
    for v in said:
        if not beyond(v, ref):
            continue                                   # не лучше стола — не обещание
        if beyond(v, sc.player_target) and not own_offer:
            continue                                   # рынок, минимум партии, «100%»
        if any(abs(v - r) <= near for r in recorded):
            if names_ref or not own_offer:
                continue                               # цитата, а не обещание
            if final:
                return "bad"
            verdict = "hold"                           # «могу 95» может ещё прийти
            continue
        return "bad"
    return verdict


def contradicts(text: Optional[str], facts: dict) -> bool:
    """Реплика целиком спорит с движком? True → в итог идёт шаблон движка."""
    return reply_verdict(text, facts, final=True) == "bad"


def sanitize(text: Optional[str]) -> Optional[str]:
    """Очистить реплику или отвергнуть её. None → вызывающий берёт шаблон движка."""
    if not text:
        return None
    s = _strip_invisible(text.replace("\r", "")).strip()

    # Служебные строки (предупреждения, заметки, баннеры в скобках) — не речь.
    good = []
    for line in s.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        if re.match(r"^(warning|note|error|\[)", stripped, re.IGNORECASE):
            continue
        good.append(stripped)
    s = " ".join(good).strip()

    # Markdown: заборы кода, выделение, заголовки, цитаты.
    s = s.replace("```", "")
    s = re.sub(r"[*_`]{1,3}", "", s)
    s = re.sub(r"^\s*#{1,6}\s*", "", s)
    s = re.sub(r"^\s*>+\s*", "", s)

    # Один слой обрамляющих кавычек, который модель любит добавлять.
    s = s.strip().strip("\"'«»").strip()
    if not s:
        return None

    if _rejected(s):
        return None

    if len(s) > MAX_LEN:
        s = re.sub(r"\s+\S*$", "", s[:MAX_LEN]) + "…"
    return s or None
