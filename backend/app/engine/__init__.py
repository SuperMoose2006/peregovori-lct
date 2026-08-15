"""Deterministic negotiation-game engine (Python port of legacy-node/engine).

Public API mirrors the engine contract in the design doc §3.
"""

from .techniques import Analysis, analyze, norm
from .scenarios import Scenario, SCENARIOS, by_id
from .engine import (
    Session,
    GameState,
    MoveResult,
    create_session,
    apply_move,
    render_line,
    score_session,
    flexibility,
    to_state_view,
    to_debrief,
)

__all__ = [
    "Analysis",
    "analyze",
    "norm",
    "Scenario",
    "SCENARIOS",
    "by_id",
    "Session",
    "GameState",
    "MoveResult",
    "create_session",
    "apply_move",
    "render_line",
    "score_session",
    "flexibility",
    "to_state_view",
    "to_debrief",
]
