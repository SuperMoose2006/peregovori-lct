"""Historical difficulty replays must survive canonicalizing production modes."""

from dataclasses import asdict
import json
from types import SimpleNamespace

import pytest

from tools import calibrate_difficulty as calibration


def fixtures():
    return {k: v for k, v in json.loads(calibration.FIXTURE.read_text())["principled"].items()
            if k != "note"}


def test_baseline_replays_original_scenario_difficulties_without_mutating_catalog():
    inputs = fixtures()
    original_lookup = calibration.eng.by_id
    before = {sid: asdict(original_lookup(sid)) for sid in inputs}
    baseline = json.loads(calibration.BASELINE.read_text())
    with calibration.configuration("baseline"):
        assert calibration.reference_check(inputs, baseline) == 9
        assert {sid: calibration.eng.create_session(sid).difficulty for sid in inputs} == baseline["scenario_difficulties"]
        assert calibration.eng.by_id("supplier").difficulty == 2
        assert calibration.eng.by_id("conflict").difficulty == 4
    assert calibration.eng.by_id is original_lookup
    assert {sid: asdict(original_lookup(sid)) for sid in inputs} == before
    assert original_lookup("supplier").difficulty == 3
    assert original_lookup("conflict").difficulty == 3


def test_nested_historical_profile_restores_parent_and_production_after_error():
    original_lookup = calibration.eng.by_id
    original_normalize = calibration.eng.normalize_difficulty
    with pytest.raises(RuntimeError, match="interrupted replay"):
        with calibration.configuration("opening10"):
            assert calibration.OPENING_SLOPE == .10
            with calibration.configuration("baseline"):
                assert calibration.OPENING_SLOPE == 0
                assert calibration.eng.DIFFICULTY_CONCESSION_K == .06
            assert calibration.OPENING_SLOPE == .10
            assert calibration.eng.DIFFICULTY_CONCESSION_K == .12
            assert calibration.LEVELS == (1, 2, 3, 4, 5)
            raise RuntimeError("interrupted replay")
    assert calibration.OPENING_SLOPE == 0
    assert calibration.LEVELS == (1, 3, 5)
    assert calibration.eng.by_id is original_lookup
    assert calibration.eng.normalize_difficulty is original_normalize
    assert calibration.eng.normalize_difficulty(2) == 3
    assert calibration.eng.normalize_difficulty(4) == 3


def test_current_measurement_counts_three_modes_and_correct_holm_family(tmp_path):
    output = tmp_path / "current.json"
    rendered = tmp_path / "current.md"
    with calibration.configuration("current"):
        calibration.run(SimpleNamespace(profile="current", json=output, markdown=rendered))
    data = json.loads(output.read_text())
    assert data["measured_levels"] == [1, 3, 5]
    assert len(data["games"]) == 972
    assert {row["difficulty"] for row in data["games"]} == {1, 3, 5}
    for policy in calibration.POLICIES:
        assert {level: row["n"] for level, row in data["summaries"][policy].items()} == {"1": 108, "3": 108, "5": 108}
        comparisons = data["comparisons"][policy]
        assert [row["pair"] for row in comparisons] == ["1→3", "3→5"]
        assert comparisons == data["three_levels"][policy]
    assert [row["p_holm"] for row in data["comparisons"]["early_close"]] == [.0078125, .0078125]
    assert "| Срез | 1 | 3 | 5 |" in rendered.read_text()
