"""Three modes preserve old records and use the same rules on every boundary."""
from copy import deepcopy
from dataclasses import asdict, replace

import pytest

from app import views
from app.admin_context import AdminContext, build_scenario
from app.engine import engine
from app.engine.difficulty import DIFFICULTY_MODES, normalize_difficulty
from app.engine.scenarios import SCENARIOS, MIRRORS, by_id, register_runtime_scenario
from app.protocol import ScenarioContext
from tests.test_reference_games import PRINCIPLED


@pytest.mark.parametrize("old,new", [(1, 1), (2, 3), (3, 3), (4, 3), (5, 5)])
def test_old_contexts_load_without_rewriting_the_input(old, new):
    raw = {"difficulty": old, "topic": "Existing meeting", "style": "tough"}
    before = deepcopy(raw)
    custom = ScenarioContext.model_validate(raw)
    assert raw == before
    assert custom.difficulty == custom.model_dump()["difficulty"] == new
    assert custom.topic == raw["topic"] and custom.style == raw["style"]

    admin_raw = {"domain": "career", "topic": "Existing meeting", "difficulty": old,
                 "tone": "firm", "opponentRole": "Director", "opponentGoals": ["price"]}
    before = deepcopy(admin_raw)
    admin = AdminContext.model_validate(admin_raw)
    scenario, _ = build_scenario(admin)
    assert admin_raw == before
    assert admin.difficulty == scenario.difficulty == new


@pytest.mark.parametrize("old,new", [(2, 3), (4, 3)])
def test_legacy_custom_scenario_keeps_id_and_all_other_content(old, new):
    source = by_id("salary")
    restored = replace(source, id=f"legacy_difficulty_{old}", difficulty=old)
    assert restored.difficulty == new
    original_fields = asdict(source)
    restored_fields = asdict(restored)
    for key in original_fields.keys() - {"id", "difficulty"}:
        assert restored_fields[key] == original_fields[key]
    register_runtime_scenario(restored)
    assert by_id(restored.id) is restored
    assert views.scenario_view(restored, "ru").difficulty == new
    assert engine.create_session(restored.id).difficulty == new


@pytest.mark.parametrize("old,new", [(2, 3), (4, 3)])
def test_legacy_session_uses_the_whole_canonical_game_not_only_its_label(old, new):
    sessions = []
    for difficulty in (old, new):
        session = engine.create_session("salary", "ru")
        # Old in-memory session or external legacy override.
        session.difficulty = difficulty
        for line in PRINCIPLED["salary"]["ru"]:
            session.turn += 1
            engine.apply_move(session, engine.analyze(line), line)
        sessions.append(session)
    assert sessions[0].state == sessions[1].state
    assert engine.score_session(sessions[0]) == engine.score_session(sessions[1])


def test_catalog_and_mirrors_expose_only_three_modes():
    assert DIFFICULTY_MODES == (1, 3, 5)
    for scenario in [*SCENARIOS, *MIRRORS]:
        assert scenario.difficulty in DIFFICULTY_MODES
        assert views.scenario_view(scenario, "en").difficulty in DIFFICULTY_MODES


@pytest.mark.parametrize("value,want", [(-4, 1), (99, 5), (None, 3), (True, 3),
    (float("nan"), 3), (float("inf"), 3)])
def test_internal_legacy_normalization_has_a_finite_safe_default(value, want):
    assert normalize_difficulty(value) == want
