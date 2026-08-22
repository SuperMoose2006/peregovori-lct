"""Паритет модальностей: голос и клавиатура дают ОДИН И ТОТ ЖЕ ход движка.

Требование пересборки, и оно не декоративное: если произнесённая реплика
оценивается иначе, чем набранная, тренажёр начинает оценивать дикцию вместо
переговоров, а грейды партий перестают быть сравнимыми.

Технически модальность неразличима по построению — распознавание отдаёт тот же
`text`, что и клавиатура, и `NegotiationOrchestrator.on_player_turn` не знает,
откуда он взялся. Здесь это проверяется, а не декларируется.

Реальный риск лежал в другом месте: в ФОРМЕ ЧИСЛА. Люди печатают «300 000», а
говорят «триста тысяч».
"""

from __future__ import annotations

import asyncio

import pytest

from app import engine
from app.engine.numbers import spell_to_digits
from app.engine.techniques import norm
from app.orchestrator.negotiation import NegotiationOrchestrator
from app.realtime.session import RealtimeSession


def _session():
    eng = engine.create_session(engine.SCENARIOS[0].id, "ru")
    return RealtimeSession(session_id="sess_parity", engine_session=eng, lang="ru")


# ---------------------------------------------------------------------------
# Форма числа
# ---------------------------------------------------------------------------

SPOKEN_VS_TYPED = [
    ("Готов платить триста тысяч рублей.", "Готов платить 300 000 рублей."),
    ("Моя цена шестьдесят четыре тысячи.", "Моя цена 64 000."),
    ("Предлагаю восемьдесят пять тысяч за штуку.", "Предлагаю 85 000 за штуку."),
    ("Полтора миллиона и ни рублём меньше.", "1 500 000 и ни рублём меньше."),
]


@pytest.mark.parametrize("spoken,typed", SPOKEN_VS_TYPED)
def test_spoken_price_equals_typed_price(spoken: str, typed: str):
    """Цена словами и цифрами обязана дать одинаковый ход — до последнего поля."""
    a, b = engine.analyze(spoken), engine.analyze(typed)
    assert a.primary == b.primary, f"«{spoken}» → {a.primary}, «{typed}» → {b.primary}"
    assert a.number == b.number, f"число разошлось: {a.number} vs {b.number}"
    assert a.arg_quality == b.arg_quality, "балл аргументации разошёлся"
    assert sorted(t["key"] for t in a.tags) == sorted(t["key"] for t in b.tags)


def test_number_without_separator_is_read_whole():
    """Регрессия: «300000» читалось как 300.

    Прежняя `MONEY_RE` требовала разделитель групп. Игрок называл одну цену,
    движок засчитывал другую, и никто об этом не узнавал.
    """
    assert engine.analyze("цена 300000").number == 300000
    assert engine.analyze("цена 64000").number == 64000
    assert engine.analyze("цена 300 000").number == 300000
    assert engine.analyze("85.5 за штуку").number == 85.5


def test_lone_numeral_is_not_a_price():
    """«Три условия» не должно внезапно стать оффером на три рубля."""
    assert engine.analyze("У меня три условия.").number is None
    assert engine.analyze("У меня три условия.").primary != "offer"
    assert engine.analyze("Три, четыре пункта").number is None


def test_group_separator_collapses_but_two_numbers_stay_apart():
    """«300 000» — одно число; «86 88» — два, и слипаться они не должны."""
    assert "300000" in norm("цена 300 000")
    assert norm("по 86 88 за штуку") == "по 86 88 за штуку"


def test_spell_to_digits_leaves_ordinary_text_alone():
    assert spell_to_digits("давайте обсудим условия") == "давайте обсудим условия"
    assert spell_to_digits("") == ""


# ---------------------------------------------------------------------------
# Оркестратор: модальности в нём просто нет
# ---------------------------------------------------------------------------

def test_orchestrator_does_not_know_the_modality():
    """Структурная гарантия: путь хода не упоминает ни микрофон, ни распознавание.

    Это сильнее теста на равенство результатов. Пока в `on_player_turn` нет ни
    одной ветки по модальности, расхождение между голосом и клавиатурой не
    может появиться — его негде создать.
    """
    import ast
    import inspect
    import textwrap

    tree = ast.parse(textwrap.dedent(inspect.getsource(NegotiationOrchestrator.on_player_turn)))
    # Комментарии и docstring вычищаются: там модальность УПОМИНАТЬ можно и
    # нужно — именно там объясняется, почему её нет в коде. Проверяем код.
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            if (node.body and isinstance(node.body[0], ast.Expr)
                    and isinstance(node.body[0].value, ast.Constant)
                    and isinstance(node.body[0].value.value, str)):
                node.body.pop(0)
    code = ast.unparse(tree).lower()

    for forbidden in ("voice", "audio", "asr", "microphone", "transcript"):
        assert forbidden not in code, \
            f"ход движка ветвится по модальности: найдено «{forbidden}»"


def test_same_text_from_either_path_produces_the_same_state():
    """Одна и та же реплика, поданная дважды, двигает движок одинаково.

    Имитируем оба пути: «клавиатура» кладёт текст через `append_input`,
    «голос» — тот же текст, как его вернуло бы распознавание. Дальше обе
    партии играются одним и тем же вызовом оркестратора.
    """
    line = "Готов платить триста тысяч рублей, если срок сдвинем на месяц."
    recognized = "Готов платить 300 000 рублей, если срок сдвинем на месяц."

    async def play(text: str):
        session = _session()
        orchestrator = NegotiationOrchestrator(session)
        await orchestrator.on_player_turn(text)
        state = session.engine_session.state
        return (state.trust, state.tension, state.info, state.leverage,
                round(state.offer_opp, 6), session.engine_session.turn)

    typed = asyncio.run(play(line))
    spoken = asyncio.run(play(recognized))
    assert typed == spoken, f"клавиатура {typed} против голоса {spoken}"


def test_layers_do_not_change_the_move():
    """Включённые слои не двигают ни одну шкалу.

    Дополняет `test_layers_never_reach_the_score`: там сравнивался финальный
    грейд, здесь — состояние после КАЖДОГО хода. Слой, который влияет только на
    последний расчёт, всё равно был бы нарушением.
    """
    from app.realtime.session import Layers

    line = "Что для вас важнее всего в этой сделке?"

    async def play(with_layers: bool):
        session = _session()
        if with_layers:
            session.layers = Layers(probe=True, voice=True, camera=True, avatar=True)
            session.observations = ["игрок отошёл от камеры"]
        orchestrator = NegotiationOrchestrator(session)
        await orchestrator.on_player_turn(line)
        state = session.engine_session.state
        return (state.trust, state.tension, state.info, state.leverage,
                round(state.offer_opp, 6))

    assert asyncio.run(play(False)) == asyncio.run(play(True))
