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


# ------------------------------------------- тренер знает задание и вердикт

def test_coach_prompt_carries_the_task_and_the_verdict():
    """Иначе тренер отвечает на другой вопрос, чем предикат.

    На экране разбора упражнения сходились три сигнала: красная плашка «Не то» с
    причинами от предиката, слово тренера «отличный размен» и подпись «зачтено
    движком». Тренер честно оценивал реплику КАК РЕПЛИКУ, а предикат честно валил
    её как ответ НА ЭТО ЗАДАНИЕ — два ответа на разные вопросы в одном экране.
    """
    from app.ai.judge import build_prompts

    task = {"prompt": "Задайте вопрос ступени S", "ok": False,
            "require": ["spin_situation"]}
    _system, user = build_prompts("контекст", "реплика", "ru", None, None, task)

    assert "УПРАЖНЕНИЕ КУРСА" in user
    assert "Задайте вопрос ступени S" in user
    assert "spin_situation" in user
    assert "НЕ ЗАЧТЕНО" in user
    assert "Не пересматривай" in user


def test_a_passed_exercise_is_named_as_passed():
    from app.ai.judge import build_prompts

    _system, user = build_prompts("контекст", "реплика", "ru", None, None,
                                  {"prompt": "з", "ok": True, "require": []})
    assert "ЗАЧТЕНО" in user and "НЕ ЗАЧТЕНО" not in user


def test_english_task_block_is_english():
    import re
    from app.ai.judge import build_prompts

    _system, user = build_prompts("context", "line", "en", None, None,
                                  {"prompt": "Ask an S-stage question", "ok": False,
                                   "require": ["spin_situation"]})
    block = [ln for ln in user.splitlines() if "COURSE EXERCISE" in ln or "verdict" in ln]
    assert block, "английского блока задания нет"
    assert not any(re.search(r"[а-яё]", ln, re.I) for ln in block)


def test_a_live_turn_carries_no_task_block():
    """В партии задания нет — и промпт обязан остаться прежним."""
    from app.ai.judge import build_prompts

    _system, user = build_prompts("контекст", "реплика", "ru")
    assert "УПРАЖНЕНИЕ КУРСА" not in user and "Зачёт УЖЕ ВЫНЕСЕН" not in user
