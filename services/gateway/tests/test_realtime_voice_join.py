"""test_realtime_voice_join.py — склейка кусков расшифровки.

Серверный VAD режет речь по паузам ВНУТРИ фразы, и каждый кусок расшифровывается
как самостоятельное высказывание: с заглавной буквы и точкой в конце. Наивная
склейка через пробел давала реплики, разорванные там, где человек просто
перевёл дыхание:

    «По рыночным данным. Справедливый ориентир. восемьдесят шесть»

Реплика уходит и в движок, и на экран, поэтому шов виден человеку и может
сбить разбор хода.
"""

from __future__ import annotations

import pytest

from app.perception.realtime_voice import RealtimeVoicePipeline


def _join(parts: list[str], live: str = "") -> str:
    pipe = RealtimeVoicePipeline.__new__(RealtimeVoicePipeline)
    pipe._parts, pipe._live = list(parts), live
    return pipe._joined()


def test_lowercase_continuation_heals_the_seam():
    """Строчная буква после точки — фраза продолжается, точку снимаем."""
    assert _join(["По рыночным данным.", "Справедливый ориентир.", "восемьдесят шесть"]) \
        == "По рыночным данным. Справедливый ориентир восемьдесят шесть"


def test_real_sentence_boundary_survives():
    """Заглавная после точки — вероятно, новое предложение. Не трогаем."""
    assert _join(["Здравствуйте.", "Меня зовут Ирина."]) == "Здравствуйте. Меня зовут Ирина."


def test_question_mark_is_not_swallowed_before_a_capital():
    assert _join(["А почему?", "Для вас важен срок."]) == "А почему? Для вас важен срок."


@pytest.mark.parametrize("parts,live,expected", [
    ([], "", ""),
    (["  "], "", ""),
    (["Одна реплика"], "", "Одна реплика"),
    (["Начало."], "продолжение", "Начало продолжение"),
])
def test_edges(parts, live, expected):
    """Пустое, пробельное и живая гипотеза на хвосте."""
    assert _join(parts, live) == expected
