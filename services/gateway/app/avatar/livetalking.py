"""livetalking.py — клиент цифрового человека LiveTalking (MuseTalk на GPU).

╔══════════════════════════════════════════════════════════════════════════╗
║ ИНТЕГРАЦИЯ UPSTREAM-СЕРВИСА                                              ║
║ Источник: LiveTalking, Apache-2.0                                        ║
║ Коммит:   36837f90f8db3f59e1d7fcdd111a7db3842515d0                       ║
║ Ручки:    server/routes.py — /human /interrupt_talk /set_audiotype        ║
║                              /is_speaking /offer (WebRTC)                 ║
║ Липсинк:  avatars/musetalk/* — вендоренный MuseTalk (MIT, TMElyralab)     ║
║ Полный провенанс: docs/upstream-code-map.md                              ║
╚══════════════════════════════════════════════════════════════════════════╝

ПОЧЕМУ ОТДЕЛЬНЫЙ СЕРВИС, А НЕ БИБЛИОТЕКА. LiveTalking тянет torch с CUDA,
diffusers, aiortc и веса моделей — вместе несколько гигабайт и обязательный
GPU. Гейтвей обязан подниматься за секунду на любой машине и играть партию без
единого из этих гигабайтов. Поэтому липсинк живёт за HTTP-границей: есть
GPU-хост — включили переменной, нет — слой честно говорит «недоступно».

ЧТО ЗДЕСЬ НЕ ПЕРЕПИСЫВАЕТСЯ. Ни очередь кадров, ни батчинг, ни сшивание с
фоном, ни WebRTC-треки. Всё это уже сделано в LiveTalking и работает; наша
задача — говорить с ним на его языке и правильно связать с реакцией движка.

СОСТОЯНИЕ ЛИЦА → `set_audiotype`. У LiveTalking это «хореография»: когда
персонаж не говорит, проигрывается заранее подготовленное видео с заданным
номером. Мы отображаем на эти номера состояния из реакции движка. Номер 0 —
базовый idle самого LiveTalking.

STUB(avatar-webrtc-signalling): согласование WebRTC между браузером и
  avatar-воркером через гейтвей не проброшено — клиент пока не получает
  видеопоток. Настоящим станет: проксирование `/offer` с телом SDP на воркер и
  возврат ответа клиенту (ручка у LiveTalking уже есть, `server/rtc_manager.py`),
  плюс `<video>` вместо картинки состояния в `OpponentFace.tsx`.
"""

from __future__ import annotations

import os
from typing import Callable, Optional

import httpx

from app.avatar.base import (
    AVATAR_STATES,
    AvatarCapabilities,
    AvatarProvider,
    state_for_reaction,
)

#: Куда стучаться. Пусто → провайдер объявляет себя недоступным.
AVATAR_URL = os.getenv("NEGO_AVATAR_URL", "").strip()

#: Состояние лица → номер видео в хореографии LiveTalking (`custom_config`).
#: Номера — это то, что подготовлено в `services/avatar/`; см. его README.
STATE_TO_AUDIOTYPE: dict[str, int] = {
    "idle": 0, "listening": 0, "thinking": 1, "speaking": 0, "hesitation": 1,
    "nod": 2, "shake_head": 3, "lean_back": 4, "lean_forward": 5,
    "smile": 2, "warm": 2, "annoyed": 3, "offended": 4, "walk_out": 6,
}


class LiveTalkingAvatar(AvatarProvider):
    """Фотореалистичный оппонент с липсинком. Требует GPU-воркера."""

    def __init__(self, session_id: str, publish: Callable[[dict], None],
                 url: str | None = None) -> None:
        self._url = (url or AVATAR_URL).rstrip("/")
        self._session_id = session_id
        self._publish = publish
        self._state = "idle"
        self._client: Optional[httpx.AsyncClient] = None
        #: Идентификатор сессии на стороне воркера. Выдаётся при согласовании
        #: WebRTC; до этого команды слать некуда.
        self._worker_session: str = ""

    # ------------------------------------------------------------ возможности

    def capabilities(self) -> AvatarCapabilities:
        if not self._url:
            return AvatarCapabilities(
                available=False, lipsync=False, transport="none",
                reason={
                    "ru": "нет GPU-воркера: задайте NEGO_AVATAR_URL",
                    "en": "no GPU worker: set NEGO_AVATAR_URL",
                },
            )
        # Липсинк заявляется только когда за нами реально стоит воркер. Проверка
        # живости делается при подключении, а не здесь: рукопожатие не должно
        # ждать сетевого запроса.
        return AvatarCapabilities(available=True, lipsync=True, interruptible=True,
                                  transport="webrtc", states=AVATAR_STATES)

    def describe(self) -> str:
        return f"livetalking ({self._url or 'не задан'}, MuseTalk lipsync)"

    def _http(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(base_url=self._url, timeout=10.0)
        return self._client

    async def probe(self) -> bool:
        """Жив ли воркер. Вызывается один раз при сборке сессии."""
        if not self._url:
            return False
        try:
            response = await self._http().post(
                "/is_speaking", json={"sessionid": self._worker_session})
            return response.status_code == 200
        except Exception:
            return False

    def attach(self, worker_session: str) -> None:
        """Запомнить сессию воркера, выданную при согласовании WebRTC."""
        self._worker_session = worker_session

    # ---------------------------------------------------------------- команды

    async def set_state(self, state: str, *, reaction: Optional[str] = None) -> None:
        if state not in AVATAR_STATES:
            state = "listening"
        self._state = state
        self._publish({"type": "avatar.state", "state": state, "reaction": reaction,
                       "lipsync": True, "transport": "webrtc"})
        if not self._url or not self._worker_session:
            return
        try:
            await self._http().post("/set_audiotype", json={
                "sessionid": self._worker_session,
                "audiotype": STATE_TO_AUDIOTYPE.get(state, 0),
            })
        except Exception:
            # Хореография — украшение. Не доехала — партия не страдает.
            pass

    async def react(self, reaction: str) -> None:
        await self.set_state(state_for_reaction(reaction), reaction=reaction)

    async def speak(self, pcm: bytes, *, generation_id: str) -> None:
        """Отдать речь на липсинк.

        Звук идёт к аватару ТЕМ ЖЕ потоком, что и к колонкам игрока, а не
        отдельным: два источника одного звука — это два расписания и
        гарантированный рассинхрон между тем, что слышно, и тем, что видно.

        STUB(avatar-audio-feed): передача PCM на воркер не подключена — у
          LiveTalking для этого ручка `/humanaudio` принимает файл целиком, а
          нам нужен поток. Настоящим станет: WebSocket-канал на воркер,
          принимающий те же 16 кГц чанки, что уходят в шину.
        """
        if self._state != "speaking":
            await self.set_state("speaking")

    async def interrupt(self) -> None:
        """Перебивание: погасить очередь звука аватара и вернуть его в «слушаю».

        Третий адресат `_interrupt()` оркестратора — после мозга и синтеза.
        Без него рот продолжает двигаться под уже отменённую реплику.
        """
        if self._url and self._worker_session:
            try:
                await self._http().post("/interrupt_talk",
                                        json={"sessionid": self._worker_session})
            except Exception:
                pass
        await self.set_state("listening")

    async def aclose(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
        self._client = None
