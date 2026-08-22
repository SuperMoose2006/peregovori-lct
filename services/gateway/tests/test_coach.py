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


@pytest.fixture
def sess():
    return engine.create_session("supplier", "ru")


def test_parses_line_and_reason():
    """Тренер отдаёт готовую реплику, которую игрок может отправить как есть."""
    tip = coach.parse(
        '{"why": "нужно вскрыть интерес", "line": "Что для вас важнее всего в этой сделке?"}', "ru")
    assert tip == {"why": "нужно вскрыть интерес", "line": "Что для вас важнее всего в этой сделке?"}


def test_junk_and_stub_lines_are_refused():
    """Двухсловное «будьте твёрже» — не реплика, которую можно отправить.

    Подсказка движка полезнее такого ответа, поэтому валидация его отвергает.
    """
    for raw in ("no json here", '{"why": "x"}', '{"line": "да"}', ""):
        assert coach.parse(raw, "ru") is None, raw


def test_overlong_line_is_trimmed():
    long_line = "Давайте обсудим условия поставки подробно. " * 20
    tip = coach.parse('{"why": "w", "line": "%s"}' % long_line.strip(), "ru")
    assert tip and len(tip["line"]) <= coach.MAX_LINE + 1  # +1 на многоточие


def test_prompt_is_shared_with_the_live_path(sess):
    """Промпт строится одной функцией — иначе асинхронный путь тихо разойдётся."""
    system, user = coach.build_prompts(views.coach_facts(sess, "ru"), "ru")
    assert system and user
    assert "Ситуация" in user or "Situation" in user


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
