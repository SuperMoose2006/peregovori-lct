"""Семантический судья: офлайновые пути.

Синхронная обёртка `judge_turn` из `app.ai.judge` удалена вместе со слоем
бэкендов — живой судья асинхронный (`app.orchestrator.judge`). Здесь
проверяется то, что осталось общим у обоих путей и что, собственно, защищает
движок от дешёвой модели: выключатель и ВАЛИДАЦИЯ ответа.
"""

import asyncio
import os

from app.ai.judge import _extract_json, parse_judgement
from app.orchestrator.judge import judge_enabled, judge_turn


def test_disabled_by_default(monkeypatch):
    """Явный выключатель сильнее автоопределения — в обе стороны."""
    monkeypatch.delenv("NEGO_JUDGE", raising=False)
    monkeypatch.setenv("NEGO_AI", "off")
    assert judge_enabled() is False
    monkeypatch.setenv("NEGO_JUDGE", "off")
    assert judge_enabled() is False
    for value in ("1", "on", "true", "yes"):
        monkeypatch.setenv("NEGO_JUDGE", value)
        assert judge_enabled() is True
    for value in ("0", "off", "false", "no"):
        monkeypatch.setenv("NEGO_JUDGE", value)
        assert judge_enabled() is False


def test_returns_none_without_ai(monkeypatch):
    """Без облака судья молчит, и движок берёт детерминированный keyword-балл."""
    monkeypatch.setenv("NEGO_AI", "off")
    assert asyncio.run(judge_turn("Поставщик держит цену.",
                                  "По рынку это дороже нормы.", "ru")) is None


def test_returns_none_on_empty_text():
    assert asyncio.run(judge_turn("ctx", "   ", "ru")) is None


def test_validation_clamps_and_filters(monkeypatch):
    """Валидация — то, что не даёт дешёвой модели испортить состояние игры.

    Балл зажимается в 0..100, индекс интереса проверяется по границам списка,
    приёмы выживают только из закрытого словаря.
    """
    raw = ('{"arg_score": 900, "interest_targeted": 47, "secondary_conceded": "нет-такого", '
           '"criteria_legitimate": true, "note": "ok", "techniques": ["размен", "выдумка"]}')
    got = parse_judgement(raw, "ru", interests=["a", "b"], secondary=[("term", "срок")])
    assert got["arg_score"] == 100
    assert got["interest_targeted"] is None, "индекс за границами списка обязан отсеиваться"
    assert got["secondary_conceded"] is None, "чужой id вторичного вопроса не должен проходить"
    assert got["techniques"] == ["размен"]


def test_validation_rejects_a_missing_score():
    """Без балла судить нечем — лучше keyword-путь, чем выдуманное число."""
    assert parse_judgement('{"note": "хорошо"}', "ru") is None
    assert parse_judgement("совсем не json", "ru") is None


def test_json_extraction_tolerates_fences_and_prose():
    d = _extract_json('```json\n{"arg_score": 78, "note": "хорошо", "techniques": ["критерий"]}\n```')
    assert d and d["arg_score"] == 78
    assert _extract_json("no json here") is None


def test_engine_reveals_targeted_interest_and_uses_semantic_score():
    from app import engine
    sess = engine.create_session("supplier", "ru")
    sess.state.trust = 50  # above the reveal gate
    a = engine.analyze("А что для вас важнее всего в этой сделке?")
    engine.apply_move(sess, a, judge={"arg_score": 88, "interest_targeted": 2, "criteria_legitimate": False})
    assert 2 in sess.state.interests_found          # the TARGETED interest, not index 0
    assert sess.metrics.arg_quality_sum == 88        # semantic score overrode the keyword one


def test_engine_vague_question_reveals_nothing_with_judge():
    from app import engine
    sess = engine.create_session("supplier", "ru")
    sess.state.trust = 50
    a = engine.analyze("Ну и что дальше?")
    engine.apply_move(sess, a, judge={"arg_score": 15, "interest_targeted": None})
    assert sess.state.interests_found == []          # vague → nothing uncovered
