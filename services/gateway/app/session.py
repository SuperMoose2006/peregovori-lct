"""session.py — хранилище сессий в памяти с отложенным удалением.

Достаточно для одноинстансного тренажёра. Под Redis/БД меняется целиком, когда
появится подпроект персистентности.

ПОЧЕМУ ОТЛОЖЕННОЕ УДАЛЕНИЕ, А НЕ УДАЛЕНИЕ ПО ОБРЫВУ. Сокет рвётся сам по себе:
метро, вайфай, спящий ноутбук. Партия при этом никуда не девается — состояние
игры держит движок, а не соединение. Если удалять сессию по закрытию сокета,
человек после переподключения молча начинает партию заново, потеряв всё, что
наговорил. Это хуже, чем честная ошибка.

Поэтому обрыв только **освобождает** сессию: она живёт `RESUME_TTL_S` и ждёт,
что к ней вернутся с тем же идентификатором. Явное `session.close` удаляет
сразу — человек сам сказал, что закончил.
"""

from __future__ import annotations

import secrets
import time
from typing import Any

#: Сколько сессия ждёт возвращения после обрыва. Пять минут — метро, лифт,
#: перезагрузка вкладки; дольше держать смысла нет, партия уже забыта.
RESUME_TTL_S = 300


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, Any] = {}
        #: session_id → момент, после которого сессия считается брошенной.
        #: Отсутствие ключа = сессия занята живым сокетом и не истекает.
        self._expiry: dict[str, float] = {}

    def new_id(self) -> str:
        return "sess_" + secrets.token_hex(5)

    def put(self, session_id: str, session: Any) -> None:
        self._sessions[session_id] = session
        self._expiry.pop(session_id, None)
        self._reap()

    def get(self, session_id: str) -> Any | None:
        self._reap()
        return self._sessions.get(session_id)

    def drop(self, session_id: str) -> None:
        """Удалить немедленно. Только для явного завершения партии."""
        self._sessions.pop(session_id, None)
        self._expiry.pop(session_id, None)

    def release(self, session_id: str) -> None:
        """Отпустить после обрыва: сессия ждёт возвращения `RESUME_TTL_S`."""
        if session_id in self._sessions:
            self._expiry[session_id] = time.monotonic() + RESUME_TTL_S

    def claim(self, session_id: str) -> Any | None:
        """Забрать брошенную сессию обратно. None — её нет или срок вышел."""
        session = self.get(session_id)
        if session is None:
            return None
        self._expiry.pop(session_id, None)
        return session

    def _reap(self) -> None:
        if not self._expiry:
            return
        now = time.monotonic()
        for session_id in [sid for sid, deadline in self._expiry.items() if deadline <= now]:
            self._sessions.pop(session_id, None)
            self._expiry.pop(session_id, None)


store = SessionStore()
