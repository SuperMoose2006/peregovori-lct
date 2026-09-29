"""simli.py — драйвер Simli на входе `audio`: лицо под наш звук.

Источник протокола — официальный Python SDK `simli-ai` 2.0.3 (читался
исходник пакета с PyPI, 29.09.2026): `SimliClient(api_key, SimliConfig(faceId,
handleSilence, maxSessionLength, maxIdleTime))`, `start()`, `send(pcm16 16 кГц)`,
`clearBuffer()` (строка `SKIP` — «немедленно замолчать и забыть присланное»),
`getVideoStreamIterator("rgb24")`, `getAudioStreamIterator()`, `stop()`.
Ключ идёт заголовком `x-simli-api-key`; `GET /compose/ice` с ним — запрос без
сессии, им ключ и проверяется при старте.

`maxIdleTime` в SDK по умолчанию 30 с: собеседник, молчащий полминуты, пока
человек думает над ходом, закрывал бы сессию. Здесь — 300 с, как в
документации сервиса по умолчанию.

Лицо обязательно (`NEGO_LIVE_VIDEO_AVATAR` = faceId): публичного каталога
стоковых лиц в SDK нет, угадывать id нельзя.

НЕ ПРОВЕРЕНО С НАСТОЯЩИМ КЛЮЧОМ: ключа нет. Проверено только, что драйвер
правильно зовёт SDK (тест с подменой SDK). Сигнал конца звука (`DONE` в
документации сервиса) не шлётся: при `handleSilence=True` сервис сам рисует
тишину, а действие `DONE` на живой сессии не проверено.
"""

from __future__ import annotations

import logging
from typing import AsyncIterator

from app.avatar.live.config import LiveVideoConfig
from app.avatar.live.driver import DriverError, DriverInfo, Persona
from app.avatar.live.media import f32_to_s16
from app.avatar.live.vendors._webrtc import WebRtcDriver, http_verdict

_log = logging.getLogger("dialog.live_video")

API = "https://api.simli.ai"
#: Оценка удержания звука по заявлению вендора («< 300 мс» до видео), не замер.
AV_DELAY_MS = 450
INPUT_RATE = 16000

_FATAL = ("INVALID_API_KEY", "BILLING_ERROR", "MISSING_BILLING_INFO", "INVALID_FACE_ID",
          "INVALID_EMOTION")


def simli_config(SimliConfig, face_id: str):
    """Сессия на партию: тишину рисует сервис, простой — до 5 минут."""
    return SimliConfig(faceId=face_id, handleSilence=True, maxSessionLength=1800, maxIdleTime=300)


class SimliDriver(WebRtcDriver):
    vendor = "simli"

    def __init__(self, cfg: LiveVideoConfig, persona: Persona) -> None:
        super().__init__(cfg, persona)
        self.info = DriverInfo(vendor="simli", input="audio", av_delay_ms=AV_DELAY_MS)
        self._client = None

    @staticmethod
    async def check_key(cfg: LiveVideoConfig) -> str:
        if not cfg.avatar:
            raise DriverError("simli: не задано лицо — NEGO_LIVE_VIDEO_AVATAR=<faceId из app.simli.com>",
                              reason="avatar", fatal=True)
        import httpx
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(f"{API}/compose/ice", headers={"x-simli-api-key": cfg.key})
        problem = http_verdict("simli", response.status_code, response.text)
        if problem:
            raise problem
        return f"ключ принят, лицо {cfg.avatar}"

    async def _open(self) -> tuple[AsyncIterator, AsyncIterator]:
        if not self._cfg.avatar:
            raise DriverError("simli: не задано лицо (NEGO_LIVE_VIDEO_AVATAR)", reason="avatar", fatal=True)
        try:
            from simli import SimliClient, SimliConfig
        except ImportError as exc:
            raise DriverError(f"simli: SDK не установлен ({exc})", reason="missing_sdk", fatal=True)
        client = SimliClient(self._cfg.key, simli_config(SimliConfig, self._cfg.avatar))
        self._client = client
        try:
            await client.start()
        except Exception as exc:
            text = str(exc)
            raise DriverError(f"simli: {text}", reason="connect",
                              fatal=any(code in text for code in _FATAL))
        return client.getVideoStreamIterator("rgb24"), client.getAudioStreamIterator()

    async def _push(self, pcm_f32: bytes) -> None:
        if self._client is None:
            raise DriverError("simli: сессия не открыта", reason="not_ready")
        await self._client.send(f32_to_s16(pcm_f32, dst_rate=INPUT_RATE))

    async def _stop_speaking(self) -> None:
        if self._client is not None:
            await self._client.clearBuffer()

    async def _shutdown(self) -> None:
        if self._client is not None:
            await self._client.stop()
