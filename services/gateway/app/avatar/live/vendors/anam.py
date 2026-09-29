"""anam.py — драйвер Anam (Cara) на входе `audio`: лицо под наш звук.

Источник протокола — официальный Python SDK `anam` 0.11.0 (читался исходник
пакета с PyPI, 29.09.2026): `AnamClient(api_key, persona_config=
PersonaConfig(avatar_id, enable_audio_passthrough=True))`, `connect_async()`,
`create_agent_audio_input_stream(AgentAudioInputConfig("pcm_s16le", 24000, 1))`
→ `send_audio_chunk` / `end_sequence`, `interrupt()`, `video_frames()` и
`audio_frames()` (PyAV), `close()`. Из README пакета: «24 кГц моно — лучше
всего; звук возвращается синхронно с аватаром без ресэмплинга»; «без
`end_sequence()` сервис ждёт продолжения, и аватар замирает» — это и есть
сигнал конца звука (R2). Каталог лиц — `GET https://api.anam.ai/v1/avatars`
с `Authorization: Bearer`; он же — бесплатная проверка ключа при старте.

`enable_session_replay=False`: по умолчанию сервис записывает сессию, а нам
запись разговора у внешнего сервиса не нужна.

НЕ ПРОВЕРЕНО С НАСТОЯЩИМ КЛЮЧОМ: ключа нет. Проверено только, что драйвер
правильно зовёт SDK (тест с подменой SDK) и что при отказе партия
возвращает портрет. Первая живая проверка — docs/INTEGRATION_LIVE_VIDEO.md.
Вход `text` (голос Anam) не реализован: для него нужен голос персоны и
границы фраз в возвращённом звуке; режим `text` проверен заглушкой.
"""

from __future__ import annotations

import asyncio
import logging
from typing import AsyncIterator, Optional

from app.avatar.live.config import LiveVideoConfig
from app.avatar.live.driver import Closed, DriverError, DriverInfo, Persona
from app.avatar.live.media import f32_to_s16
from app.avatar.live.vendors._webrtc import WebRtcDriver, http_verdict

_log = logging.getLogger("dialog.live_video")

API = "https://api.anam.ai/v1"
#: Оценка удержания звука, не замер: ~150 мс генерации кадра (блог Cara-4),
#: запас WebRTC-буфера и сети до EU. У JS-примера passthrough вендор пишет
#: ещё про 800 мс звука до первого кадра — синтез отдаёт их быстрее реального
#: времени. Уточняется первым прогоном: `NEGO_LIVE_VIDEO_AV_DELAY_MS`.
AV_DELAY_MS = 600
#: Ждём сигнала «готов принимать TTS» после подключения, не дольше.
READY_WAIT_S = 5.0

#: Коды ошибок SDK, после которых повторять подключение бессмысленно.
_FATAL = {"authentication_error", "configuration_error", "validation_error", "no_plan_found",
          "usage_limit_reached", "spend_cap_reached"}


def _headers(key: str) -> dict:
    return {"Authorization": f"Bearer {key}"}


async def _list_avatars(key: str, *, timeout_s: float = 8.0) -> list[dict]:
    import httpx
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        response = await client.get(f"{API}/avatars", params={"page": 1, "perPage": 100},
                                    headers=_headers(key))
    problem = http_verdict("anam", response.status_code, response.text)
    if problem:
        raise problem
    data = response.json()
    return list(data.get("data") or []) if isinstance(data, dict) else []


def _stock(avatars: list[dict]) -> list[dict]:
    """Стоковые лица — не созданные организацией (`createdByOrganizationId: null`)."""
    return [a for a in avatars if isinstance(a, dict) and a.get("id")
            and a.get("createdByOrganizationId") is None]


# Настройки сессии — отдельными функциями, чтобы тест сверял их и с подменой
# SDK, и с настоящими классами пакета, если он установлен.

def persona_config(PersonaConfig, avatar_id: str):
    """Лицо под наш звук: passthrough, без «мозга» и голоса сервиса."""
    return PersonaConfig(avatar_id=avatar_id, enable_audio_passthrough=True)


def session_options(SessionOptions):
    """Без записи сессии у сервиса: запись разговора нам у них не нужна."""
    return SessionOptions(enable_session_replay=False)


def audio_config(AgentAudioInputConfig):
    """Наш синтез — 24 кГц моно; вендор советует ровно это."""
    return AgentAudioInputConfig(encoding="pcm_s16le", sample_rate=24000, channels=1)


class AnamDriver(WebRtcDriver):
    vendor = "anam"

    def __init__(self, cfg: LiveVideoConfig, persona: Persona) -> None:
        super().__init__(cfg, persona)
        self.info = DriverInfo(vendor="anam", input="audio", av_delay_ms=AV_DELAY_MS)
        self._client = None
        self._session = None
        self._stream = None
        #: Какое лицо взяли — для лога и прибора.
        self.avatar_id: Optional[str] = cfg.avatar or None

    # -- проверка ключа при старте (бесплатно: каталог лиц) --------------------------

    @staticmethod
    async def check_key(cfg: LiveVideoConfig) -> str:
        avatars = await _list_avatars(cfg.key)
        if cfg.avatar:
            if not any(a.get("id") == cfg.avatar for a in avatars):
                return (f"лицо {cfg.avatar} не найдено на первой странице каталога "
                        f"({len(avatars)} лиц) — если оно своё и новое, это может быть нормой")
            return f"лицо {cfg.avatar} есть в каталоге"
        stock = _stock(avatars)
        if not stock:
            raise DriverError("anam: в каталоге нет стоковых лиц, а NEGO_LIVE_VIDEO_AVATAR пуст",
                              reason="avatar", fatal=True)
        return f"лицо не задано — возьмём стоковое {stock[0]['id']} ({stock[0].get('displayName', '?')})"

    # -- сессия ------------------------------------------------------------------------

    async def _open(self) -> tuple[AsyncIterator, AsyncIterator]:
        try:
            from anam import (AgentAudioInputConfig, AnamClient, AnamError, AnamEvent,
                              PersonaConfig, SessionOptions)
        except ImportError as exc:
            raise DriverError(f"anam: SDK не установлен ({exc})", reason="missing_sdk", fatal=True)

        if not self.avatar_id:
            stock = _stock(await _list_avatars(self._cfg.key))
            if not stock:
                raise DriverError("anam: нет стокового лица и не задан NEGO_LIVE_VIDEO_AVATAR",
                                  reason="avatar", fatal=True)
            self.avatar_id = str(stock[0]["id"])
            _log.info("живое видео: anam — лицо не задано, взято стоковое %s", self.avatar_id)

        ready = asyncio.Event()
        client = AnamClient(api_key=self._cfg.key, persona_config=persona_config(PersonaConfig, self.avatar_id))

        async def on_ready() -> None:
            ready.set()

        async def on_closed(code: str, reason: Optional[str]) -> None:
            # Истёкшая по тарифу сессия (5 мин на Starter) — тоже сюда: не
            # фатально, адаптер переподключится между репликами.
            if not self._closing:
                self.emit(Closed(f"anam: {code} {reason or ''}".strip()))

        client.add_listener(AnamEvent.SESSION_READY, on_ready)
        client.add_listener(AnamEvent.CONNECTION_CLOSED, on_closed)
        self._client = client
        try:
            session = await client.connect_async(session_options(SessionOptions))
        except AnamError as exc:
            code = getattr(getattr(exc, "code", None), "value", "")
            raise DriverError(f"anam: {exc}", reason=code or "connect", fatal=code in _FATAL)
        self._session = session
        try:
            await asyncio.wait_for(ready.wait(), timeout=READY_WAIT_S)
        except asyncio.TimeoutError:
            # Сигнал готовности не пришёл — SDK сам его не требует; пробуем так.
            _log.warning("живое видео: anam не прислал session_ready за %.0f с", READY_WAIT_S)
        self._stream = session.create_agent_audio_input_stream(audio_config(AgentAudioInputConfig))
        return session.video_frames(), session.audio_frames()

    async def _push(self, pcm_f32: bytes) -> None:
        if self._stream is None:
            raise DriverError("anam: поток звука не открыт", reason="not_ready")
        await self._stream.send_audio_chunk(f32_to_s16(pcm_f32))

    async def _end(self) -> None:
        if self._stream is not None:
            await self._stream.end_sequence()

    async def _stop_speaking(self) -> None:
        # Вендор: `interrupt` вызывать вместе с `endSequence` в режиме passthrough.
        if self._session is not None:
            await self._session.interrupt()
        if self._stream is not None:
            await self._stream.end_sequence()

    async def _shutdown(self) -> None:
        if self._session is not None:
            await self._session.close()
        elif self._client is not None:
            await self._client.close()
