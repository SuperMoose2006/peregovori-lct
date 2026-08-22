"""Tests for the AI mentor's closing word on the debrief (app.ai.debriefer).

Boundary: the mentor NARRATES the engine's verdict. It never produces a score,
and if it says nothing usable the debrief renders exactly as it does offline.
"""

import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app import views  # noqa: E402
from app.ai import debriefer  # noqa: E402
from app.engine import engine  # noqa: E402
from app.protocol import Debrief  # noqa: E402


@pytest.fixture
def facts():
    sess = engine.create_session("supplier", "ru")
    sess.log.append({"role": "player", "text": "Какой у вас срок оплаты?", "turn": 1})
    deb = engine.to_debrief(sess)
    return views.debrief_facts(sess, deb, "ru")


def test_parses_three_parts():
    out = debriefer.parse(
        '{"verdict": "Вы вели переговоры мягко и вскрыли один интерес из трёх.",'
        ' "strength": "Вопрос про срок оплаты снял напряжение.",'
        ' "growth": "Просите объективный критерий цены, а не скидку."}', "ru")
    assert out["strength"] == "Вопрос про срок оплаты снял напряжение."
    assert out["growth"].startswith("Просите объективный критерий")
    assert len(out["verdict"]) > 20


def test_junk_and_empty_verdicts_are_refused():
    """Односложное «Хорошо» хуже, чем собственные подсказки движка.

    Поэтому у вердикта есть порог длины: наставник либо говорит по делу, либо
    молчит, и разбор рисуется ровно так же, как офлайн.
    """
    for raw in ("no json", "", '{"strength": "ok"}', '{"verdict": "Хорошо"}'):
        assert debriefer.parse(raw, "ru") is None, raw


def test_overlong_verdict_is_trimmed():
    long = "Вы держались уверенно и задавали правильные вопросы. " * 20
    out = debriefer.parse('{"verdict": "%s", "strength": "s", "growth": "g"}' % long.strip(), "ru")
    assert out and len(out["verdict"]) <= debriefer.MAX_VERDICT + 1


def test_mentor_sees_the_finished_scorecard_and_hidden_interests(facts):
    """It must narrate the engine's grade, not re-derive one — so it is handed
    the grade, and (game over) the interests the player never asked about."""
    blob = debriefer._user(facts, "ru")
    assert str(facts["grade"]) in blob
    assert str(facts["overall"]) in blob
    hidden = engine.by_id("supplier").hidden_interests["ru"]
    assert all(h in blob for h in hidden)


def test_debrief_schema_is_valid_without_ai_fields():
    """Offline debriefs carry none of the three — the client must still work."""
    d = Debrief(**engine.to_debrief(engine.create_session("supplier", "ru")))
    assert d.ai_verdict is None and d.ai_strength is None and d.ai_growth is None


def test_debrief_reveals_every_hidden_interest_with_its_status():
    """The count "1 of 3" teaches nothing; the two the player never asked about
    are the lesson. Deterministic — this must hold with NEGO_AI=off."""
    sess = engine.create_session("supplier", "ru")
    sess.state.interests_found.append(1)
    d = Debrief(**engine.to_debrief(sess))
    hidden = engine.by_id("supplier").hidden_interests["ru"]
    assert [i.text for i in d.interests] == list(hidden)
    assert [i.found for i in d.interests] == [False, True, False]
    assert d.interests_found == 1 and d.interests_total == len(hidden)


def test_state_view_publishes_the_settled_price_not_the_last_offer():
    """A closing screen reading `offer_opp` shows a number the deal was never
    struck at — the deal closes at the meeting point (`deal`)."""
    sess = engine.create_session("supplier", "ru")
    assert engine.to_state_view(sess)["deal"] is None  # table still open
    sess.state.deal = 86.0
    sess.state.offer_opp = 88.5
    view = engine.to_state_view(sess)
    assert view["deal"] == 86.0 and view["offer_opp"] == 88.5
