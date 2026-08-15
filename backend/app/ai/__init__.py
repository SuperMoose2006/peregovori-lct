"""AI dialogue layer — generates ONLY the opponent's spoken line, in character.

Hard boundary (see CLAUDE.md main invariant): this layer NEVER computes game
state or scoring. The deterministic engine owns meters, offers, ZOPA and the
final grade. On any error/timeout the layer returns None so the caller uses the
engine's templated fallback line, keeping the simulator fully playable offline.

It is deliberately DECOUPLED from engine internals: it consumes a plain `facts`
dict (not the engine/session object), so the engine can evolve independently.
"""

from .graph import run_opponent, run_opponent_sync
from .chat_models import get_chat_backend, describe_mode
from .prompts import build_prompts, build_system, build_user

__all__ = [
    "run_opponent",
    "run_opponent_sync",
    "get_chat_backend",
    "describe_mode",
    "build_prompts",
    "build_system",
    "build_user",
]
