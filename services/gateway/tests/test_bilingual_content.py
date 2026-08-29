"""Инвариант 4: билингвальность RU/EN во всём пользовательском контенте.

ЧТО СТОРОЖИЛИ ДО ЭТОГО ФАЙЛА И ЧЕГО НЕ СТОРОЖИЛИ. Правило «английская строка
написана по-русски» появилось сегодня (`9d8fa6d`) и закрыло словарь фронтенда:
до него три теста сверяли одинаковый набор ключей, непустоту и совпадение
подстановок — и ни один не смотрел, на каком ЯЗЫКЕ написан текст. Все три
условия выполняются у строки «Карл наблюдает», лежащей в английской половине, а
именно её и читали английскому пользователю вслух.

Юрисдикция того правила кончается на `frontend/src/i18n.ts`. Проверено
подлогом на текущем коде — три мутации, каждая по отдельности:

  * `scenarios.py`: `title["en"]` и `persona["en"]` → русский текст;
  * `scenarios.py`: `hidden_interests["en"][0]` → «Стабильная загрузка…»;
  * `engine.py`: `LINES["en"]["warmed"]["base"][0]` → русская реплика.

Каждая давала **1413 passed** и зелёный фронтенд. То есть библиотека столов и
банк реплик оппонента — самый читаемый и самый слышимый текст продукта — были
открыты настежь. `test_scenario_mirror.py` тут не спасает: он сверяет числа,
направление шкалы и темы, поэтому одинаково неправильный перевод в обоих
движках проходит.

ПРАВИЛО ВЗЯТО ГОТОВЫМ у `frontend/test/i18n.test.ts`, вместе с обеими его
сторонами и с проверкой самого правила на подложных строках. Второе направление
тоньше первого: «{n} XP» законна, «Your turn» — нет.
"""

from __future__ import annotations

import dataclasses
import re

import pytest

from app import views
from app.engine.engine import LINES
from app.engine.scenarios import SCENARIOS

CYR = re.compile(r"[А-Яа-яЁё]")
LETTER = re.compile(r"[A-Za-zА-Яа-яЁё]")

#: Имя продукта пишется одинаково на обоих языках, поэтому кириллицу в
#: английской строке оно не оправдывает — но и не создаёт.
BRAND = re.compile(r"«?Диалог»?")
#: Латиница, законная в русском тексте: термины метода и единица опыта.
#: Список закрытый — он оправдывает конкретные строки, а не открывает дверь.
TERMS = re.compile(r"\b(SPIN|BATNA|ZOPA|XP|k)\b")


def en_has_russian(value: str) -> bool:
    return bool(CYR.search(BRAND.sub("", value)))


def ru_has_forgotten_english(value: str) -> bool:
    rest = TERMS.sub("", re.sub(r"\{[^}]*\}", "", value))
    return bool(LETTER.search(rest)) and not CYR.search(rest)


def test_the_rule_itself_tells_a_missing_translation_from_a_lawful_exception():
    """Сторож, проверенный только на здоровом словаре, доказывает, что словарь
    здоров, — и ничего больше. Поэтому правило проверяется на подлогах, включая
    самый коварный случай: имя продукта не должно прикрывать собой кириллицу,
    стоящую с ним в одной фразе."""
    assert en_has_russian("The «Диалог» trainer certifies the method.") is False
    assert en_has_russian("Карл наблюдает") is True
    assert en_has_russian("The «Диалог» trainer. Ваш ход.") is True
    assert en_has_russian("Supplier Contract") is False

    assert ru_has_forgotten_english("{n} XP") is False
    assert ru_has_forgotten_english("k ₽") is False
    assert ru_has_forgotten_english("SPIN и BATNA") is False
    assert ru_has_forgotten_english("Annual volume commitment") is True
    assert ru_has_forgotten_english("Годовой контракт") is False


#: Ключевые слова — НЕ пользовательский текст: это словарь совпадений, и в
#: русской половине латиница там законна, потому что человек её и печатает
#: («kpi», «sign-on», «senior»). Обратное направление проверяется: кириллица в
#: английском списке — запись, которая не совпадёт никогда.
_MATCHING_VOCABULARY = ("hidden_interest_keywords", "keywords")


def _pairs(obj, path: str, out: list, lang: str | None = None) -> None:
    """Все строки продукта вместе с языком, которому они принадлежат."""
    if isinstance(obj, dict):
        if set(obj) == {"ru", "en"}:
            for code in ("ru", "en"):
                _pairs(obj[code], f"{path}.{code}", out, code)
            return
        for key, value in obj.items():
            _pairs(value, f"{path}.{key}", out, lang)
    elif isinstance(obj, (list, tuple)):
        for i, value in enumerate(obj):
            _pairs(value, f"{path}[{i}]", out, lang)
    elif dataclasses.is_dataclass(obj):
        for field in dataclasses.fields(obj):
            _pairs(getattr(obj, field.name), f"{path}.{field.name}", out, lang)
    elif isinstance(obj, str) and lang:
        out.append((path, lang, obj))


def _all_strings() -> list[tuple[str, str, str]]:
    out: list[tuple[str, str, str]] = []
    for scenario in SCENARIOS:
        _pairs(scenario, scenario.id, out)
    for code in ("ru", "en"):
        _pairs(LINES[code], f"engine.LINES.{code}", out, code)
    #: Колонка «с той стороны стола» и подписи шкал в разборе — прозаический
    #: текст, появившийся сегодня и никем на язык не проверявшийся.
    for name in ("_HER", "_METER_LABELS", "_PRICE_LABEL", "_MOODS",
                 "_STILL_CLOSED", "_MISSED", "_MISSED_NONE", "_ASK", "_ASK_NO_TOPIC"):
        _pairs(getattr(views, name), f"views.{name}", out)
    return out


ALL = _all_strings()


def test_the_sweep_actually_reaches_the_text():
    """Обход, который ничего не нашёл, и обход, которому нечего искать,
    выглядят одинаково. Здесь проверяется второе: если структура столов
    изменится и обход промахнётся мимо строк, тест обязан сказать это сам, а не
    молча позеленеть."""
    assert len(ALL) > 900, f"обход собрал всего {len(ALL)} строк — он промахнулся"
    langs = {lang for _, lang, _ in ALL}
    assert langs == {"ru", "en"}, f"обход видит языки {langs}"
    assert any(p.startswith("supplier.hidden_interests") for p, _, _ in ALL), \
        "скрытые интересы не попали в обход — а именно на них ловилась мутация"
    assert any(p.startswith("engine.LINES.en") for p, _, _ in ALL), \
        "банк реплик оппонента не попал в обход"


def test_the_english_half_of_the_product_is_written_in_english():
    bad = [f"{path} = {value!r}" for path, lang, value in ALL
           if lang == "en" and en_has_russian(value)]
    assert not bad, ("английскому игроку показывают русский текст:\n  "
                     + "\n  ".join(bad))


def test_the_russian_half_has_no_forgotten_english():
    bad = [f"{path} = {value!r}" for path, lang, value in ALL
           if lang == "ru"
           and not any(part in path for part in _MATCHING_VOCABULARY)
           and ru_has_forgotten_english(value)]
    assert not bad, ("русскому игроку показывают английский текст:\n  "
                     + "\n  ".join(bad))


@pytest.mark.parametrize("scenario", SCENARIOS, ids=[s.id for s in SCENARIOS])
def test_both_halves_of_a_table_are_the_same_size(scenario):
    """Пропущенный перевод в СПИСКЕ языковая проверка не поймает: список просто
    короче. Три скрытых интереса по-русски и два по-английски — это не текст на
    чужом языке, это отсутствующий текст, и заметен он только счётом."""
    for name in ("hidden_interests", "tradeoffs", "interest_topics"):
        value = getattr(scenario, name)
        assert len(value["ru"]) == len(value["en"]), (
            f"{scenario.id}.{name}: по-русски {len(value['ru'])}, "
            f"по-английски {len(value['en'])}")
    assert len(scenario.hidden_interests["ru"]) == 3, (
        f"{scenario.id}: скрытых интересов "
        f"{len(scenario.hidden_interests['ru'])}, планка CLAUDE.md требует три")
