"""liveavatar.py — драйвер HeyGen LiveAvatar в режиме LITE: лицо под наш звук.

Источник протокола — публичная документация docs.liveavatar.com (openapi.json,
lite-mode/events, lite-mode/lifecycle) и открытый код HeyGen
(liveavatar-web-sdk, liveavatar-starter-livekit-agent-python), прочитаны
29.09.2026. Официального Python SDK у сервиса нет, поэтому протокол здесь:

* `POST /v1/sessions/token` (заголовок `X-API-KEY`) с `mode: "LITE"`,
  `avatar_id`, `video_settings` → `session_id`, `session_token`;
* `POST /v1/sessions/start` (`Authorization: Bearer <session_token>`) →
  `livekit_url`, `livekit_agent_token`, `livekit_client_token`, `ws_url`;
* по `ws_url` — JSON-команды: ждать `session.state_updated {state:
  "connected"}` (раньше команды молча теряются), затем `agent.speak {audio:
  base64 PCM16 24 кГц моно}` (рекомендация — куски около секунды, первый
  короче), `agent.speak_end` (конец реплики, R2), `agent.interrupt`
  (сбрасывает и звук, и ещё не отрисованное видео), `session.keep_alive`
  (сессия без активности закрывается через 5 минут);
* видео и НАШ звук, синхронный с видео, — в комнате LiveKit, участник
  `heygen`; сервер подключается туда `livekit_agent_token`;
* `POST /v1/sessions/stop` — закрыть и перестать платить;
* `GET /v1/users/credits` — бесплатная проверка ключа и остатка кредитов;
* `GET /v1/avatars/public` — стоковые лица без ключа; песочница
  (`is_sandbox: true`, лицо `dd73ea75-…`, около минуты, кредиты не списываются).

ЧЕГО В ДОКУМЕНТАЦИИ НЕТ, И ЧТО ЗДЕСЬ ПРЕДПОЛОЖЕНО. Права `livekit_agent_token`
на подписку не описаны (так делает открытый пример Vision-Agents); коды
закрытия сокета не описаны; метки времени в событиях отсутствуют — время кадра
считается по началу речи в возвращённом звуке (`_anchor.py`).

НЕ ПРОВЕРЕНО С НАСТОЯЩИМ КЛЮЧОМ: ключа нет. Проверено только против подмены
сервиса (тест). Первая живая проверка — песочницей, бесплатно:
docs/INTEGRATION_LIVE_VIDEO.md.
"""

from __future__ import annotations

import asyncio
import base64
import contextlib
import json
import logging
import time
from typing import AsyncIterator, Optional

import numpy as np

from app.avatar.live.config import LiveVideoConfig
from app.avatar.live.driver import Closed, DriverError, DriverInfo, Persona, keep_stop
from app.avatar.live.media import f32_to_s16
from app.avatar.live.vendors._webrtc import WebRtcDriver, http_verdict

_log = logging.getLogger("dialog.live_video")

API = "https://api.liveavatar.com"
#: Лицо песочницы из документации (sandbox-mode): бесплатно, около минуты.
SANDBOX_AVATAR = "dd73ea75-1218-4ef3-92ce-606d5f7fbc0a"
#: Удержание звука под кадры — ЗАМЕР 29.09.2026 (`tools/live_video_probe.py`,
#: две платные сессии, лица Katya и Judy, 480p): кадр приходит к нам позже
#: своего звука на 0.88–1.03 с (p50) и до 1.10 с (p95). С прежней оценкой по
#: заявлению вендора (600 мс) 98–100 % кадров показывались бы с губами позади
#: голоса или не показывались вовсе; с 1000 мс — 97.6–100 % вовремя.
AV_DELAY_MS = 1000
#: Куски звука в `agent.speak`: первый короче — быстрее первый кадр
#: (как в открытом SDK: 400 мс), дальше около секунды (рекомендация вендора).
FIRST_CHUNK_MS = 400
CHUNK_MS = 1000
#: Кусок, который ждёт продолжения дольше этого, уходит как есть: иначе
#: медленный синтез морил бы сервис голодом (`video_starvation`).
FLUSH_IDLE_S = 0.2
KEEPALIVE_S = 60.0
#: За сколько до предела длины сессии сменить её на новую. Замер 29.09: у
#: предела сервис НЕ закрывает сессию и не присылает ни ошибки, ни события —
#: он просто перестаёт говорить (реплика после предела — 370 мс речи из 4.7 с,
#: дальше простой), и лицо молчит под звучащий голос. Поэтому сессия
#: сменяется заранее, по `max_session_duration` из ответа на start.
ROTATE_MARGIN_S = 15.0
CONNECT_WAIT_S = 10.0
#: Качество видео: `medium` = 480p. Лицо у нас — 320 px, больше не нужно,
#: а декодирование на сервере и трафик от сервиса растут с каждой ступенью.
QUALITY = "medium"
AVATAR_IDENTITY = "heygen"
#: Имена из SDK LiveKit, на которые опирается драйвер. Вынесены, чтобы тест
#: сверял их с установленным пакетом: переименование в SDK — красный тест,
#: а не молчаливый портрет на показе.
LK_TRACK_EVENT = "track_subscribed"
LK_GONE_EVENT = "disconnected"
LK_VIDEO_FORMAT = "RGB24"


def _unwrap(response) -> dict:
    """Ответ API обёрнут как `{code, data, message}`; успех — по HTTP-коду."""
    problem = http_verdict("liveavatar", response.status_code, response.text)
    if problem:
        raise problem
    body = response.json()
    if not isinstance(body, dict):
        return {}
    return body.get("data") or {}


class LiveAvatarDriver(WebRtcDriver):
    vendor = "liveavatar"

    def __init__(self, cfg: LiveVideoConfig, persona: Persona) -> None:
        super().__init__(cfg, persona)
        self.info = DriverInfo(vendor="liveavatar", input="audio", av_delay_ms=AV_DELAY_MS)
        self.session_id: Optional[str] = None
        # Песочница принимает только своё лицо — раскладка персонажей тут не действует.
        self.avatar_id: Optional[str] = SANDBOX_AVATAR if cfg.sandbox else (cfg.avatar or None)
        self._ws = None
        self._room = None
        self._connected = asyncio.Event()
        self._buffer = bytearray()
        self._sent_in_utterance = 0
        self._flush_handle: Optional[asyncio.TimerHandle] = None
        self._send_lock = asyncio.Lock()
        #: Потолок длины сессии у сервиса, сек. None — предел тарифа. Прибор
        #: ставит его, чтобы упавший замер не жёг минуты до таймаута.
        self.max_session_s: Optional[int] = None
        #: Сессия, которую остановили, — для прибора (спросить сервис, как кончилась).
        self.closed_session_id: Optional[str] = None
        #: Предел длины сессии из ответа на start, сек.
        self.session_limit_s: Optional[float] = None
        #: Когда пройден каждый этап подключения (монотонные часы) — для замера.
        self.marks: dict[str, float] = {}

    def _mark(self, stage: str) -> None:
        self.marks.setdefault(stage, time.monotonic())

    def _on_ws_event(self, event: dict) -> None:
        """Каждое событие сокета команд. Пусто; прибор замера пишет их в журнал."""
        return None

    # -- проверка ключа при старте ------------------------------------------------------

    @staticmethod
    async def check_key(cfg: LiveVideoConfig) -> str:
        import httpx
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(f"{API}/v1/users/credits", headers={"X-API-KEY": cfg.key})
        data = _unwrap(response)
        credits = data.get("credits_left")
        note = f"кредитов осталось: {credits}" if credits is not None else "ключ принят"
        try:
            if credits is not None and float(credits) < 1 and not cfg.sandbox:
                raise DriverError(f"liveavatar: кредитов {credits} — сессия LITE не стартует без минуты",
                                  reason="quota", fatal=True)
        except ValueError:
            pass
        return note + ("; песочница включена" if cfg.sandbox else "")

    # -- сессия ------------------------------------------------------------------------

    async def _stock_avatar(self, client) -> str:
        response = await client.get(f"{API}/v1/avatars/public", params={"page": 1, "page_size": 100})
        data = _unwrap(response)
        for avatar in data.get("results") or []:
            if avatar.get("status") == "ACTIVE" and avatar.get("type") == "VIDEO" and avatar.get("id"):
                return str(avatar["id"])
        raise DriverError("liveavatar: в публичном каталоге нет активного лица, задайте NEGO_LIVE_VIDEO_AVATAR",
                          reason="avatar", fatal=True)

    async def _open(self) -> tuple[AsyncIterator, AsyncIterator]:
        try:
            import httpx
            import websockets
            from livekit import rtc
        except ImportError as exc:
            raise DriverError(f"liveavatar: не установлен модуль ({exc})", reason="missing_sdk", fatal=True)

        self._mark("open")
        async with httpx.AsyncClient(timeout=10.0) as client:
            if not self.avatar_id:
                self.avatar_id = await self._stock_avatar(client)
                _log.info("живое видео: liveavatar — лицо не задано, взято стоковое %s", self.avatar_id)
            body = {"mode": "LITE", "avatar_id": self.avatar_id, "is_sandbox": self._cfg.sandbox,
                    "video_settings": {"quality": QUALITY, "encoding": "H264"}}
            if self.max_session_s:
                body["max_session_duration"] = int(self.max_session_s)
            self._mark("token_request")
            token = _unwrap(await client.post(
                f"{API}/v1/sessions/token", headers={"X-API-KEY": self._cfg.key}, json=body))
            self._mark("token")
            self.session_id = token.get("session_id")
            session_token = token.get("session_token")
            if not session_token:
                raise DriverError("liveavatar: нет session_token в ответе", reason="protocol")
            started = _unwrap(await client.post(
                f"{API}/v1/sessions/start", headers={"Authorization": f"Bearer {session_token}"}, json={}))
            self._mark("started")
        limit = started.get("max_session_duration")
        self.session_limit_s = limit if isinstance(limit, (int, float)) and limit > 0 else None
        ws_url = started.get("ws_url")
        lk_url = started.get("livekit_url")
        lk_token = started.get("livekit_agent_token") or started.get("livekit_client_token")
        if not (ws_url and lk_url and lk_token):
            raise DriverError("liveavatar: в ответе start нет ws_url/livekit_url/токена", reason="protocol")

        self._ws = await websockets.connect(ws_url, max_size=2 ** 20, ssl=_tls(ws_url))
        self._mark("ws_open")
        loop = asyncio.get_running_loop()
        self._tasks.append(loop.create_task(self._read_ws()))
        try:
            await asyncio.wait_for(self._connected.wait(), timeout=CONNECT_WAIT_S)
        except asyncio.TimeoutError:
            raise DriverError("liveavatar: сессия не перешла в connected", reason="connect_timeout")
        self._mark("ws_connected")
        self._tasks.append(loop.create_task(self._keepalive()))
        if self.session_limit_s:
            self._tasks.append(loop.create_task(self._rotate_before_limit(self.session_limit_s)))

        room = rtc.Room()
        #: Дорожки по участникам. В комнате сервиса лицо — `heygen`, а кроме
        #: нас туда никто не входит; чужое имя принимаем, только если
        #: `heygen` так и не появился (имя в документации может смениться).
        by_who: dict[str, dict[str, object]] = {}
        got_both = asyncio.Event()

        def on_track(track, publication, participant) -> None:
            kinds = by_who.setdefault(participant.identity, {})
            if track.kind == rtc.TrackKind.KIND_VIDEO:
                kinds["video"] = track
            elif track.kind == rtc.TrackKind.KIND_AUDIO:
                kinds["audio"] = track
            if "video" in kinds and "audio" in kinds:
                got_both.set()

        def on_gone(*_args) -> None:
            if not self._closing:
                self.emit(Closed("liveavatar: комната LiveKit закрыта"))

        room.on(LK_TRACK_EVENT, on_track)
        room.on(LK_GONE_EVENT, on_gone)
        self._room = room
        await room.connect(lk_url, lk_token, options=rtc.RoomOptions(auto_subscribe=True))
        self._mark("room")
        try:
            await asyncio.wait_for(got_both.wait(), timeout=CONNECT_WAIT_S)
        except asyncio.TimeoutError:
            raise DriverError("liveavatar: лицо не опубликовало видео и звук в комнате", reason="no_tracks")
        self._mark("tracks")
        complete = {who: kinds for who, kinds in by_who.items() if "video" in kinds and "audio" in kinds}
        who = AVATAR_IDENTITY if AVATAR_IDENTITY in complete else next(iter(complete))
        if who != AVATAR_IDENTITY:
            _log.warning("живое видео: liveavatar — лицо в комнате под именем %r, не %r", who, AVATAR_IDENTITY)
        video = rtc.VideoStream(complete[who]["video"], format=getattr(rtc.VideoBufferType, LK_VIDEO_FORMAT))
        audio = rtc.AudioStream(complete[who]["audio"], sample_rate=48000, num_channels=1)
        return video, audio

    # -- кадры LiveKit ---------------------------------------------------------------------

    def _video_time(self, event) -> Optional[float]:
        stamp = getattr(event, "timestamp_us", None)
        return stamp / 1e6 if stamp else None

    def _video_rgb(self, event) -> np.ndarray:
        frame = event.frame
        data = np.frombuffer(frame.data, dtype=np.uint8)
        row = data.size // frame.height            # строка может быть выровнена
        return data[: row * frame.height].reshape(frame.height, row)[:, : frame.width * 3] \
            .reshape(frame.height, frame.width, 3)

    def _audio_mono(self, event) -> tuple[np.ndarray, int]:
        frame = event.frame
        samples = np.frombuffer(frame.data, dtype=np.int16).astype(np.float32) / 32768.0
        if frame.num_channels > 1:
            samples = samples.reshape(-1, frame.num_channels).mean(axis=1)
        return samples, int(frame.sample_rate)

    # -- команды -------------------------------------------------------------------------

    async def _send(self, message: dict) -> None:
        if self._ws is None:
            raise DriverError("liveavatar: сокет команд не открыт", reason="not_ready")
        async with self._send_lock:
            await self._ws.send(json.dumps(message))

    async def _flush(self) -> None:
        if not self._buffer:
            return
        chunk, self._buffer = bytes(self._buffer), bytearray()
        self._sent_in_utterance += len(chunk)
        await self._send({"type": "agent.speak", "audio": base64.b64encode(chunk).decode("ascii")})

    def _flush_soon(self) -> None:
        if self._flush_handle is not None:
            self._flush_handle.cancel()
        loop = asyncio.get_running_loop()

        def fire() -> None:
            task = loop.create_task(self._flush_quietly())
            self._tasks.append(task)

        self._flush_handle = loop.call_later(FLUSH_IDLE_S, fire)

    async def _flush_quietly(self) -> None:
        with contextlib.suppress(Exception):
            await self._flush()

    async def _push(self, pcm_f32: bytes) -> None:
        self._buffer.extend(f32_to_s16(pcm_f32))
        want_ms = FIRST_CHUNK_MS if self._sent_in_utterance == 0 else CHUNK_MS
        if len(self._buffer) >= int(24000 * want_ms / 1000) * 2:
            await self._flush()
        else:
            self._flush_soon()

    async def _end(self) -> None:
        if self._flush_handle is not None:
            self._flush_handle.cancel()
        await self._flush()
        await self._send({"type": "agent.speak_end"})
        self._sent_in_utterance = 0

    async def _stop_speaking(self) -> None:
        if self._flush_handle is not None:
            self._flush_handle.cancel()
        self._buffer = bytearray()
        self._sent_in_utterance = 0
        await self._send({"type": "agent.interrupt"})

    async def _rotate_before_limit(self, limit_s: float) -> None:
        await asyncio.sleep(max(5.0, limit_s - ROTATE_MARGIN_S))
        if not self._closing:
            self.emit(Closed("liveavatar: сессия подходит к пределу длины — смена сессии", planned=True))

    async def _keepalive(self) -> None:
        while True:
            await asyncio.sleep(KEEPALIVE_S)
            with contextlib.suppress(Exception):
                await self._send({"type": "session.keep_alive"})

    async def _read_ws(self) -> None:
        reason = "liveavatar: сокет команд закрыт"
        try:
            async for raw in self._ws:
                try:
                    event = json.loads(raw)
                except (TypeError, ValueError):
                    continue
                self._on_ws_event(event)
                kind = event.get("type")
                if kind == "session.state_updated":
                    state = event.get("state")
                    if state == "connected":
                        self._connected.set()
                    elif state == "disconnected":
                        reason = "liveavatar: сессия отключена сервисом"
                        break
                elif kind == "error":
                    err = event.get("error") or {}
                    _log.warning("живое видео: liveavatar ошибка %s: %s", err.get("type"), err.get("message"))
                elif kind == "warning":
                    warn = event.get("warning") or {}
                    _log.info("живое видео: liveavatar предупреждение %s: %s", warn.get("type"), warn.get("message"))
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            reason = f"liveavatar: сокет команд оборвался ({type(exc).__name__})"
        if not self._closing:
            self.emit(Closed(reason))

    def _request_stop(self) -> None:
        """Остановить сессию у сервиса — отдельной задачей, которая доживёт.

        Зовётся ПЕРВЫМ шагом закрытия, до любого `await`: закрытие партии
        ограничено секундой и может быть прервано, а запрос к API — занять
        дольше. Без явной остановки минуты идут, пока сервис не закроет сессию
        сам (замер 29.09 — через 194–210 с). Выходящий процесс ждёт этих
        запросов — `driver.finish_stops`.
        """
        if not self.session_id:
            return
        keep_stop(asyncio.get_running_loop().create_task(_stop_session(self._cfg.key, self.session_id)))
        self.closed_session_id, self.session_id = self.session_id, None

    async def close(self) -> None:
        if not self._closing:
            self._request_stop()
        await super().close()

    async def _shutdown(self) -> None:
        if self._flush_handle is not None:
            self._flush_handle.cancel()
        self._request_stop()
        if self._ws is not None:
            with contextlib.suppress(Exception):
                await self._ws.close()
        if self._room is not None:
            with contextlib.suppress(Exception):
                await self._room.disconnect()


def _tls(url: str):
    """Сертификаты — из `certifi`, как у httpx, а не из системного хранилища.

    Найдено первым живым прогоном 29.09: на macOS с Python от python.org
    системного хранилища у модуля `ssl` нет, и сокет команд падал на проверке
    сертификата, хотя REST (httpx, certifi) проходил. Сессия при этом уже
    была выдана.
    """
    if not url.startswith("wss://"):
        return None
    import ssl
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


async def _stop_session(key: str, session_id: str) -> None:
    import httpx
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(f"{API}/v1/sessions/stop", headers={"X-API-KEY": key},
                                         json={"session_id": session_id, "reason": "USER_CLOSED"})
        if response.status_code >= 400:
            _log.warning("живое видео: liveavatar не остановил сессию %s: %s", session_id, response.status_code)
    except Exception as exc:
        _log.warning("живое видео: liveavatar — остановка сессии %s не удалась: %r", session_id, exc)
