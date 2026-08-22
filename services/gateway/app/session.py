"""session.py — in-memory session store.

Fine for a single-instance training tool. Swap for Redis/DB when the
persistence sub-project lands (see docs spec §1). Keyed by opaque session id.
"""

from __future__ import annotations

import secrets
from typing import Any


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, Any] = {}

    def new_id(self) -> str:
        return "sess_" + secrets.token_hex(5)

    def put(self, session_id: str, session: Any) -> None:
        self._sessions[session_id] = session

    def get(self, session_id: str) -> Any | None:
        return self._sessions.get(session_id)

    def drop(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)


store = SessionStore()
