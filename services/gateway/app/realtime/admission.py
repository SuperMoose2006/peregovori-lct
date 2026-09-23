"""Bound all public WebSockets, including sockets that never initialize a game.

The cap is per gateway process, not per IP; local clients count too. Run one
Uvicorn worker for a single shared cap (multiple workers each have this budget).
This lease is separate from the per-IP game lease: takeover may release a game
before its old socket handler has finished closing.
"""

from __future__ import annotations

import math
import os
import threading


def _positive_number(name: str, default: str, *, integer: bool = False):
    raw = os.getenv(name, "").strip() or default
    value = int(raw) if integer else float(raw)
    if not math.isfinite(value) or value <= 0:
        raise ValueError(f"{name} must be a finite positive number")
    return value


# Conservative public pilot defaults; no unbounded/disabled sentinel values.
MAX_WEBSOCKETS: int = _positive_number("NEGO_MAX_WEBSOCKETS", "128", integer=True)
INIT_TIMEOUT_S: float = _positive_number("NEGO_WS_INIT_TIMEOUT_S", "10")

_lock = threading.Lock()
_live = 0


class SocketLease:
    def __init__(self) -> None:
        self._released = False

    def release(self) -> None:
        global _live
        with _lock:
            if self._released:
                return
            self._released = True
            _live -= 1


def acquire() -> SocketLease | None:
    """Reserve before accepting; no await between checking and reserving."""
    global _live
    with _lock:
        if _live >= MAX_WEBSOCKETS:
            return None
        _live += 1
        return SocketLease()


def live_websockets() -> int:
    with _lock:
        return _live


def init_timeout_message(lang: str) -> str:
    if lang == "en":
        return "The game was not initialized in time. Reconnect and try again."
    return "Не удалось вовремя начать партию. Подключитесь заново и повторите попытку."
