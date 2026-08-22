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


class _Stub:
    def __init__(self, raw):
        self.raw = raw
        self.seen = []

    def generate(self, system, user, raw=False):
        self.seen.append((system, user))
        return self.raw


@pytest.fixture
def facts():
    sess = engine.create_session("supplier", "ru")
    sess.log.append({"role": "player", "text": "Какой у вас срок оплаты?", "turn": 1})
    deb = engine.to_debrief(sess)
    return views.debrief_facts(sess, deb, "ru")


def test_off_backend_yields_nothing(facts):
    """NEGO_AI=off (the test default): the debrief keeps only engine tips."""
    assert debriefer.summarize(facts, "ru") is None


def test_parses_three_parts(monkeypatch, facts):
    monkeypatch.setattr(debriefer, "get_chat_backend", lambda: _Stub(
        '{"verdict": "Вы вели переговоры мягко и вскрыли один интерес из трёх.",'
        ' "strength": "Вопрос про срок оплаты снял напряжение.",'
        ' "growth": "Просите объективный критерий цены, а не скидку."}'))
    out = debriefer.summarize(facts, "ru")
    assert out["strength"] == "Вопрос про срок оплаты снял напряжение."
    assert out["growth"].startswith("Просите объективный критерий")
    assert len(out["verdict"]) > 20


def test_junk_and_empty_verdicts_are_refused(monkeypatch, facts):
    for raw in ("no json", "", '{"strength": "ok"}', '{"verdict": "Хорошо"}'):
        monkeypatch.setattr(debriefer, "get_chat_backend", lambda raw=raw: _Stub(raw))
        assert debriefer.summarize(facts, "ru") is None, raw


def test_overlong_verdict_is_trimmed(monkeypatch, facts):
    long = "Вы держались уверенно и задавали правильные вопросы. " * 20
    monkeypatch.setattr(debriefer, "get_chat_backend",
                        lambda: _Stub('{"verdict": "%s", "strength": "s", "growth": "g"}' % long.strip()))
    out = debriefer.summarize(facts, "ru")
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
