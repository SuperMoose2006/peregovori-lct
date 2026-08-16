"""Tests for the semantic argumentation judge (offline paths)."""

import os
from app.ai.judge import judge_turn, judge_enabled, _extract_json


def test_disabled_by_default(monkeypatch):
    monkeypatch.delenv("NEGO_JUDGE", raising=False)
    assert judge_enabled() is False
    for v in ("1", "on", "true", "yes"):
        monkeypatch.setenv("NEGO_JUDGE", v)
        assert judge_enabled() is True


def test_returns_none_without_ai(monkeypatch):
    monkeypatch.setenv("NEGO_AI", "off")  # OffBackend → generate returns None
    assert judge_turn("Поставщик держит цену.", "По рынку это дороже нормы.", "ru") is None


def test_returns_none_on_empty_text():
    assert judge_turn("ctx", "   ", "ru") is None


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
