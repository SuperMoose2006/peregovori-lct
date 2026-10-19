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
#: Share of the global cap one address may hold, game or no game. Without it a
#: single address opening 128 sockets and never sending `session.init` (each
#: closed after INIT_TIMEOUT_S, reopened at once) kept every other visitor
#: out — the per-address game limit only applies at init (found after the
#: 17.10 audit). Twice the per-address game limit leaves room for takeover and
#: reconnect overlap. Local hosts are exempt, as for games (`limits.exempt`).
MAX_WEBSOCKETS_PER_HOST: int = _positive_number("NEGO_MAX_WEBSOCKETS_PER_HOST", "24", integer=True)
INIT_TIMEOUT_S: float = _positive_number("NEGO_WS_INIT_TIMEOUT_S", "10")

_lock = threading.Lock()
_live = 0
_per_host: dict[str, int] = {}


class SocketLease:
    def __init__(self, host: str = "") -> None:
        self._released = False
        self._host = host

    def release(self) -> None:
        global _live
        with _lock:
            if self._released:
                return
            self._released = True
            _live -= 1
            if self._host:
                left = _per_host.get(self._host, 0) - 1
                if left > 0:
                    _per_host[self._host] = left
                else:
                    _per_host.pop(self._host, None)


def acquire(host: str = "") -> SocketLease | None:
    """Reserve before accepting; no await between checking and reserving."""
    global _live
    from app.realtime.limits import exempt
    counted = not exempt(host)
    with _lock:
        if _live >= MAX_WEBSOCKETS:
            return None
        if counted and _per_host.get(host, 0) >= MAX_WEBSOCKETS_PER_HOST:
            return None
        _live += 1
        if counted:
            _per_host[host] = _per_host.get(host, 0) + 1
        return SocketLease(host if counted else "")


def live_websockets() -> int:
    with _lock:
        return _live


def init_timeout_message(lang: str) -> str:
    if lang == "en":
        return "The game was not initialized in time. Reconnect and try again."
    return "Не удалось вовремя начать партию. Подключитесь заново и повторите попытку."
