"""Словарь приёмов: то, что нельзя проверить чтением списка.

Три группы проверок, и у каждой своя история отказа.

1. СЛОВО, КОТОРОЕ НЕ МОЖЕТ СОВПАСТЬ НИ С ЧЕМ. Триггер сравнивается с текстом
   ПОСЛЕ `norm()`, а `norm()` меняет текст: апостроф становится пробелом,
   «ё» — «е», «$» — словом «usd». Запись, не пережившая собственную
   нормализацию, лежит в словаре мёртвой и молчит — тест её видит, глаз нет.
   Внешняя проверка нашла так «can't sustain», этот тест нашёл ещё одну:
   `"если пойдём навстречу"` в `tradeoff` не могло совпасть НИКОГДА.

2. ОТРИЦАНИЕ ПЕРЕД ТРИГГЕРОМ. «No problem» — вежливая отговорка, а движок
   засчитывал ей стадию SPIN «Проблема» и +14 к аргументации (149 случаев на
   38 791 реплике чужого корпуса). Лечится не словарём, а чтением того, что
   стоит ПЕРЕД словом.

3. ЗАКРЫТИЕ СДЕЛКИ. `accept` — приём высшего приоритета: реплика, ошибочно
   принятая за согласие, ЗАКРОЕТ СТОЛ на цене оппонента. Поэтому здесь
   проверяется не только то, что закрытие ловится, но и — подробнее — что
   НЕ ловится: вопрос, отказ и разговор О сделке.

Замер, из которого выросли все три, — docs/validation.md.
"""

from __future__ import annotations

import pytest

from app.engine.techniques import (
    LEX,
    _ACCEPT_SHORT_MAX_WORDS,
    _is_short_close,
    analyze,
    norm,
)

LEX_WORDS = [(group, word) for group, words in LEX.items() for word in words]


# ---------------------------------------------------------------------------
# 1. Слово, которое не может совпасть ни с чем
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("group,word", LEX_WORDS, ids=[f"{g}:{w}" for g, w in LEX_WORDS])
def test_every_lexicon_word_survives_its_own_normalisation(group: str, word: str) -> None:
    """Триггер обязан совпадать САМ С СОБОЙ после `norm()`.

    Сравнение идёт с нормализованным текстом, поэтому запись с апострофом
    («can't sustain»), с «ё» («если пойдём навстречу») или со знаком валюты
    («₽») не совпадает ни с чем и никогда — но выглядит в списке живой. Это
    самый дешёвый способ соврать себе о размере словаря, и стоит он ноль:
    один вызов `norm` на запись.
    """
    assert norm(word) == word, (
        f"LEX[{group}] содержит {word!r}, а после нормализации это {norm(word)!r} — "
        f"запись мертва: совпасть с текстом она не может никогда"
    )


def test_lexicon_word_lists_have_both_halves() -> None:
    """Новый ключ обязан появиться сразу на двух языках (инвариант 4).

    Полный обход с порогом «тоньше чем вдвое» делает `tools/bilingual_audit.py`;
    здесь заперт грубый случай — половины нет вовсе, — чтобы он не проехал в
    ветке, где прибор не запускали.
    """
    for group, words in LEX.items():
        if len(words) <= 2:
            continue  # «question» — приём без языка вовсе
        ru = [w for w in words if any(ord(c) > 127 for c in w)]
        en = [w for w in words if all(ord(c) < 128 for c in w)]
        assert ru and en, f"LEX[{group}]: ru {len(ru)}, en {len(en)} — половины нет"


# ---------------------------------------------------------------------------
# 2. Намерение назвать цену: разговорный контроффер
# ---------------------------------------------------------------------------

#: Формула предложения цены, число — и НИ ОДНОГО слова ценового контекста.
#: До правки `offer_number` отвечал «не оффер» на каждую из них.
OFFER_INTENT_LINES = [
    ("How about 120?", 120.0),
    ("What about 65?", 65.0),
    ("I can do 480 if you pick it up.", 480.0),
    ("I could go 4700 on it.", 4700.0),
    ("Would you take 120?", 120.0),
    ("Well 90 is lowest I will go", 90.0),
    ("I am asking 500 for it", 500.0),
    ("Как насчёт 86?", 86.0),
    ("А если 86?", 86.0),
    ("Могу дать 480, если заберёте сами.", 480.0),
    ("Мой минимум 500.", 500.0),
]


@pytest.mark.parametrize("line,number", OFFER_INTENT_LINES)
def test_a_conversational_counter_offer_names_a_price(line: str, number: float) -> None:
    """Разговорная формула — такое же доказательство цены, как слово «цена».

    На чужом корпусе таких реплик 3239, и во всех число В ТЕКСТЕ ЕСТЬ: отказывал
    не разбор числа, а требование доказать, что число это цена.
    """
    a = analyze(line)
    assert a.number == number, f"{line!r} → number={a.number}"


@pytest.mark.parametrize("line,number", OFFER_INTENT_LINES)
def test_a_counter_offer_asked_as_a_question_still_reaches_the_table(
    line: str, number: float
) -> None:
    """Вопросительная форма оффер не отменяет — иначе цена не доходит до стола.

    `apply_move` кладёт число на стол только при `offer/anchor/concession/
    accept/tradeoff`. Без хода `offer` реплика «How about 120?» имела бы число и
    не имела последствий: 1149 из 3239 пропущенных офферов (35.5%) были именно
    вопросами. Числа без хода — это ровно тот случай, когда прибор доволен, а
    продукт не работает.
    """
    assert "offer" in analyze(line).moves, analyze(line).moves


def test_offer_intent_names_no_technique() -> None:
    """Ключ доказывает ЧИСЛО, а не приём: ни одного тега он не добавляет.

    «How about 120?» — контроффер: не якорь (якорь заявляет позицию) и не
    уступка (покупатель здесь не уступает). Положить формулу в `anchor` или
    `concession` значило бы соврать о приёме ради числа.
    """
    a = analyze("How about 120?")
    assert "anchor" not in a.moves and "concession" not in a.moves, a.moves
    assert a.primary == "offer", a.primary


def test_a_question_without_an_offer_formula_is_still_not_an_offer() -> None:
    """Обратная сторона правки: вопрос со статистикой офертой не становится."""
    a = analyze("Сколько из 100 у вас на складе?")
    assert a.number is None and "offer" not in a.moves, (a.number, a.moves)


# ---------------------------------------------------------------------------
# 3. Отрицание перед триггером
# ---------------------------------------------------------------------------

NOT_A_PROBLEM = [
    "No problem waiting until the end of the day.",
    "That is not a problem.",
    "That wouldn't be a problem, honestly.",
    "I have never had a problem with it.",
    "Это не проблема, подождём.",
    "Совсем не проблема, подождём.",
]

A_PROBLEM = [
    "That is a problem for us.",
    "The real problem is the lead time.",
    "Это проблема для нас.",
    "Основная проблема — сроки поставки.",
]


@pytest.mark.parametrize("line", NOT_A_PROBLEM)
def test_a_denied_problem_is_not_a_spin_stage(line: str) -> None:
    """«No problem» — отговорка, а не стадия SPIN.

    311 совпадений слова `problem` на чужом корпусе, 149 из них — отрицание.
    Каждое давало стадию Problem и +14 к аргументации: вежливость
    вознаграждалась как диагностика.
    """
    a = analyze(line)
    assert a.spin != "problem", f"{line!r} → spin={a.spin}, moves={a.moves}"


@pytest.mark.parametrize("line", A_PROBLEM)
def test_a_stated_problem_is_still_a_spin_stage(line: str) -> None:
    """…и проверка отрицания не съедает настоящую проблему."""
    assert analyze(line).spin == "problem", analyze(line).moves


def test_a_negation_further_away_does_not_cancel_the_problem() -> None:
    """Окно узкое намеренно: «no, that is a problem» ПОДТВЕРЖДАЕТ проблему."""
    assert analyze("No, that is a problem for us.").spin == "problem"


# ---------------------------------------------------------------------------
# 4. Закрытие сделки — и всё, что на него похоже
# ---------------------------------------------------------------------------

CLOSES = ["Deal", "Deal.", "Agreed.", "Ok deal", "Сделка", "Сделка!", "Годится."]

#: ГЛАВНАЯ таблица файла. `accept` ведёт стол к закрытию на цене оппонента,
#: поэтому ложное срабатывание дороже пропуска — и каждая строка здесь взята с
#: чужого корпуса или из наших же фикстур, а не выдумана.
NOT_CLOSES = [
    "no deal",                                    # отказ
    "Sorry! No deal",                             # отказ
    "Deal?",                                      # вопрос, а не закрытие
    "Сделка?",                                    # то же по-русски
    "That would be a good deal for you honestly.",  # разговор О сделке
    "I got it from a dealer last year.",          # «dealer» — не «deal»
    "The deal is that I need it by Friday.",      # «deal» как существительное
    "Сделка закроется на 80 — вы же согласились",  # рассказ о будущей сделке
    "Эта сделка нам совсем невыгодна.",           # прямой отказ
]


@pytest.mark.parametrize("line", CLOSES)
def test_a_one_word_close_closes(line: str) -> None:
    """Люди закрывают сделку одним словом, и продукт обязан это слышать.

    Полнота по классу `agree` чужого корпуса была 2.9%: «Deal» не значило
    ничего, потому что словарь знал только «deal at» и «we have a deal».
    """
    assert "accept" in analyze(line).moves, analyze(line).moves


@pytest.mark.parametrize("line", NOT_CLOSES)
def test_what_looks_like_a_close_but_is_not(line: str) -> None:
    """Цена ошибки здесь несимметрична: ложное «согласие» ЗАКРОЕТ СТОЛ.

    Основа `deal` совпадает на чужом корпусе 2404 раза, и почти всегда это
    «good deal», «the deal is», «dealer». Поэтому закрытие одним словом читается
    только у короткой реплики, не у вопроса и не под отрицанием.
    """
    assert "accept" not in analyze(line).moves, analyze(line).moves


def test_a_long_line_with_a_closing_word_is_not_a_close() -> None:
    """Порог длины — часть правила, а не оптимизация.

    При восьми словах вместо четырёх число реплик, попавших в закрытие из
    классов «отказ / контроффер / вопрос», росло с двух до 182: длинная реплика
    со словом «deal» — это разговор о сделке, а не закрытие её.
    """
    long_line = " ".join(["deal"] + ["слово"] * _ACCEPT_SHORT_MAX_WORDS)
    assert not _is_short_close(norm(long_line))


def test_unambiguous_closings_still_work_in_a_long_line() -> None:
    """Порог длины не трогает идиомы, которые ничего другого не значат.

    «По рукам» и «we have a deal» остались безусловными: они лежат в `accept`,
    а не в `acceptShort`, — в короткий список уехало только то, что двусмысленно
    само по себе.
    """
    assert "accept" in analyze(
        "Хорошо, по рукам, готовьте документы на подпись к утру."
    ).moves
    assert "accept" in analyze(
        "All right, we have a deal, let us get the paperwork moving today."
    ).moves


# ---------------------------------------------------------------------------
# 4. Русская половина: асимметрии, найденные переносом разметки переводом
# ---------------------------------------------------------------------------
#
# Первые три группы выросли из английских корпусов. Эта — из суррогата
# (docs/validation.md § 7): размеченные экспертами реплики CaSiNo и
# CraigslistBargain переведены на русский, и спрошено, срабатывает ли русская
# половина там, где английская срабатывает на оригинале. Метод оптимистичен и
# ничего не доказывает про живую речь — но найденные им дыры настоящие, и
# заперты они здесь, а не в приборе: прибор стоит платных вызовов и в `make
# test` не ходит.

#: Русские разговорные формулы предложения цены. Из 40 реплик выборки, где
#: английская формула доказывала цену, русская молчала на 13 — и все 13
#: распадались на две структурные дыры, а не на «не хватило синонима».
RU_OFFER_INTENT_LINES = [
    # Глаголы предложения от первого лица, которых не было ни одного.
    ("Могу предложить 8500.", 8500.0),
    ("Скину до 500.", 500.0),
    ("С меня 5900.", 5900.0),
    ("Могу за 1700, если заберёте сами.", 1700.0),
    # ВТОРОЕ ЛИЦО. Английский список знает обе стороны стола («i can do» и
    # «would you take»), русский знал только свою: покупатель, спрашивающий
    # цену, оставался без оффера.
    ("Отдашь за 25?", 25.0),
    ("Возьмёшь за 1200?", 1200.0),
]


@pytest.mark.parametrize("line,number", RU_OFFER_INTENT_LINES)
def test_russian_counter_offer_formulas_name_a_price(line: str, number: float) -> None:
    """То же требование, что к английским формулам, — и к русским тоже.

    Инвариант 4 нарушается не только пустой половиной: список, где у одного
    языка есть обе стороны диалога, а у другого одна, полон по форме и беден
    по делу.
    """
    a = analyze(line)
    assert a.number == number, f"{line!r} → number={a.number}"
    assert "offer" in a.moves, a.moves


@pytest.mark.parametrize("line", [
    "Могу уступить до 1700.",
    "Готов уступить до 120.",
    "Могу скинуть до 2800, если подпишете договор на три года.",
])
def test_a_concession_in_the_first_person_singular_is_a_concession(line: str) -> None:
    """`concession` держался на «мы» — та же беда, что раньше нашли у `anchor`.

    Английская половина имеет обе формы («we can lower» и «i can give you»),
    русская знала только множественное число. «Могу уступить до 1700» уходило
    в `statement`, «можем уступить» — считалось уступкой.
    """
    a = analyze(line)
    assert "concession" in a.moves, a.moves
    assert a.number is not None, "уступка обязана донести цифру до стола"


@pytest.mark.parametrize("line", [
    "Думаю, это должна быть либо вода, либо дрова.",   # перечисление, не ультиматум
    "Мне требуются вода и еда.",                        # «требую» ловило «требуются»
    "Может, как-то иначе договоримся?",                 # наречие, не угроза
    "Иначе я останусь в минусе.",                       # обоснование, не угроза
])
def test_ordinary_russian_speech_is_not_an_ultimatum(line: str) -> None:
    """Русские основы `threat` были ШИРЕ английских, и ультиматум получала речь.

    Тот же класс ошибки, что «pain»→«paint» и «fee»→«feel», только по эту
    сторону словаря — а её не проверял чужой текст. Цена несимметрична:
    `threat` третий по приоритету, снимает 12 очков аргументации и ведёт
    оппонента к самой холодной реакции.
    """
    assert "threat" not in analyze(line).moves, analyze(line).moves


@pytest.mark.parametrize("line", [
    "Либо 65, либо я снимаю у соседей — решайте.",
    "Либо вы соглашаетесь на 18%, либо мы прекращаем разговор.",
    "Либо выходите на 215, либо мы берём другого финалиста — это ультиматум.",
    "Я требую пересмотреть условия.",
    "Мы требуем пересмотреть условия.",
    "Иначе мы уходим к другому поставщику.",
])
def test_a_real_russian_ultimatum_is_still_a_threat(line: str) -> None:
    """Обратная сторона сужения: упражнения курса про ультиматум обязаны жить.

    Первые три реплики — дословно из банка курса (`app/course/bank.py`), где
    правильный ответ и есть «это ультиматум». Правило 9: правильный ответ в
    упражнении обязан быть правильным в игре.
    """
    assert "threat" in analyze(line).moves, analyze(line).moves


@pytest.mark.parametrize("ru,en,move", [
    # Английское обращение одно, русских два — значит одной записи МАЛО.
    ("Что тебе нужно?", "What do you need?", "interests_probe"),
    ("Что вам нужно?", "What do you need?", "interests_probe"),
    # «как ваши дела» требовало местоимения, «how are you» — нет.
    ("Как дела?", "How are you?", "rapport"),
    # «сколько» покрывает и how many, и how much; английская половина знала
    # только первое.
    ("Сколько еды нужно?", "How much food do you need?", "spin_situation"),
])
def test_the_same_question_gets_the_same_move_in_both_halves(
    ru: str, en: str, move: str
) -> None:
    """Одна мысль — один приём, независимо от языка (инвариант 4).

    Каждая пара здесь когда-то расходилась: половины были полны по форме и
    играли разное. Полный обход делает `tools/bilingual_audit.py`; здесь
    заперты именно те пары, на которых он молчал, — расхождение жило внутри
    одного ключа, а не между ключами.
    """
    assert move in analyze(ru).moves, (ru, analyze(ru).moves)
    assert move in analyze(en).moves, (en, analyze(en).moves)
