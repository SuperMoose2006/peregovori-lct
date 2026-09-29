"""Three negotiation modes, with non-destructive legacy five-level reads.

Keep calibrated wire values 1/3/5. Legacy 2/4 are equidistant: choose the
middle mode (2→3, 4→3), preserving meaningful trade-offs on authored tables.
This is NOT the course exercise's independent 1..3 difficulty scale.
Mirror: frontend/src/lib/difficulty.ts.
"""
from __future__ import annotations

import math

DIFFICULTY_MODES = (1, 3, 5)


def normalize_difficulty(value: int | float) -> int:
    """Resolve stored/internal values; API validation still rejects bad input."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return 3
    return min(DIFFICULTY_MODES, key=lambda mode: (abs(mode - value), abs(mode - 3)))


def difficulty_name(value: int | float, lang: str = "ru") -> str:
    names = ({1: "Больше уступок", 3: "Умеренные уступки", 5: "Меньше уступок"}
             if lang == "ru" else
             {1: "More concessions", 3: "Moderate concessions", 5: "Fewer concessions"})
    return names[normalize_difficulty(value)]
