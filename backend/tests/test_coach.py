"""Tests for the AI coach behind the 💡 hint button (app.ai.coach).

Boundary: the coach produces TEXT ONLY. It never touches state or scoring, it
falls back to the deterministic hint on any problem, and it must not see the
hidden interests the player has yet to uncover.
"""

import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app import views  # noqa: E402
from app.ai import coach  # noqa: E402
from app.engine import engine  # noqa: E402


class _Stub:
    """Stands in for a chat backend: returns whatever raw text we hand it."""

    def __init__(self, raw):
        self.raw = raw
        self.seen = []

    def generate(self, system, user, raw=False):
        self.seen.append((system, user))
        return self.raw


@pytest.fixture
def sess():
    return engine.create_session("supplier", "ru")


def test_off_backend_yields_no_suggestion(sess):
    """NEGO_AI=off (the test default): caller keeps the deterministic hint."""
    assert coach.suggest_line(views.coach_facts(sess, "ru"), "ru") is None


def test_parses_line_and_reason(monkeypatch, sess):
    stub = _Stub('{"why": "нужно вскрыть интерес", "line": "Что для вас важнее всего в этой сделке?"}')
    monkeypatch.setattr(coach, "get_chat_backend", lambda: stub)
    tip = coach.suggest_line(views.coach_facts(sess, "ru"), "ru")
    assert tip == {"why": "нужно вскрыть интерес", "line": "Что для вас важнее всего в этой сделке?"}


def test_junk_and_stub_lines_are_refused(monkeypatch, sess):
    facts = views.coach_facts(sess, "ru")
    for raw in ("no json here", '{"why": "x"}', '{"line": "да"}', ""):
        monkeypatch.setattr(coach, "get_chat_backend", lambda raw=raw: _Stub(raw))
        assert coach.suggest_line(facts, "ru") is None, raw


def test_overlong_line_is_trimmed(monkeypatch, sess):
    long_line = "Давайте обсудим условия поставки подробно. " * 20
    monkeypatch.setattr(coach, "get_chat_backend",
                        lambda: _Stub('{"why": "w", "line": "%s"}' % long_line.strip()))
    tip = coach.suggest_line(views.coach_facts(sess, "ru"), "ru")
    assert tip and len(tip["line"]) <= coach.MAX_LINE + 1  # +1 for the ellipsis


def test_coach_never_sees_undiscovered_interests(sess):
    """The hint must not spoil what the player hasn't drawn out yet."""
    sc = engine.by_id("supplier")
    hidden = sc.hidden_interests["ru"]
    facts = views.coach_facts(sess, "ru")
    assert facts["revealed_interests"] == []
    blob = coach._user(facts, "ru")
    assert all(h not in blob for h in hidden)

    # Once one is uncovered, that one — and only that one — becomes visible.
    sess.state.interests_found.append(0)
    blob = coach._user(views.coach_facts(sess, "ru"), "ru")
    assert hidden[0] in blob
    assert all(h not in blob for h in hidden[1:])
