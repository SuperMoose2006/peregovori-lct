"""adapter.py — живое видео собеседника поверх любого сервиса.

Это `AvatarProvider` для оркестратора и шины и потребитель `LiveVideoDriver`
для сервиса. Всё, что не зависит от сервиса, решается здесь и только здесь:

1. ПОДКЛЮЧЕНИЕ И ОБРЫВ. Сессия сервиса открывается в фоне при сборке партии
   (`start()`), не задерживая `session.created`. Обрыв, истёкшая сессия,
   отказ при подключении — лицо сразу возвращается к рисованному портрету
   (`_degrade`), партия идёт дальше, а подключение пробуется снова с паузой.
   Отказ, который повтор не лечит (ключ, минуты, лицо не найдено), —
   портрет до конца партии и закрытая сессия: минуты не тратятся впустую.

2. ОБЩИЙ БУФЕР ЗВУКА И КАДРОВ (замечание R1). Сервису нужно время: наш звук
   уходит к нему, кадр возвращается через сотни миллисекунд, а клиент
   показывает кадр, только пока тот не старше 250 мс от звучащего звука. Без
   буфера кадр опаздывал бы всегда. Поэтому звук человеку придерживается на
   `av_delay_ms` (`audio_out`), а сервис получает его сразу (`speak`). Кадры
   отдаются клиенту не раньше, чем за `LOOKAHEAD_MS` до своего звука, и не
   отдаются вовсе, если их звук уже отзвучал больше чем на 250 мс назад:
   такой кадр клиент всё равно выбросит, а 30 КБ по сокету уже ушли бы.

3. СИГНАЛ КОНЦА ЗВУКА (замечание R2). `end_of_speech` приходит от синтеза,
   когда реплика дописана и её звук весь отдан; драйвер переводит его в
   `speak_end` / `endSequence` / `flush` своего сервиса.

4. СТОРОЖ. Если во время звучащей реплики последний показанный кадр отстал от
   звука больше чем на `NEGO_LIVE_VIDEO_STALL_MS` — сервис молчит или
   опаздывает, и лицо возвращается к рисованному портрету. Это ОТКАЗ С
   ВОЗВРАТОМ: следующая реплика снова пробует видео, если связь жива. После
   `NEGO_LIVE_VIDEO_MAX_FAILURES` отказов за партию — портрет до конца.

5. ГОЛОС ВАЖНЕЕ ЛИЦА. Ни один путь отказа не теряет звук: придержанное
   отдаётся клиенту сразу и по порядку (`_flush_held`), дальше звук идёт без
   задержки. Ни один вызов со стороны синтеза не ждёт сеть сервиса: `speak`
   кладёт звук в очередь и возвращается.

Что видит клиент — только два режима, и оба ему уже знакомы: `video`
(`avatar.frame` по часам звука, между кадрами — портрет того же персонажа) и
`amplitude` (рисованный портрет, рот по громкости). Переход — событие
`avatar.state` с `lipsync_mode`; клиент перестраивается по нему сам
(`frontend/src/realtime/transport.ts`).
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import math
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Callable, Optional

from app.avatar.base import AVATAR_STATES, AvatarCapabilities, AvatarProvider
from app.avatar.frames import avatar_frame
from app.avatar.live.clock import STALE_MS, PlaybackClock
from app.avatar.live.config import LiveVideoConfig
from app.avatar.live.driver import (Closed, DriverError, LiveVideoDriver, Persona, VideoFrame,
                                    VoiceChunk)

_log = logging.getLogger("dialog.live_video")

#: Кадр уходит клиенту не раньше, чем за столько до своего звука. Очередь
#: клиента держит 30 кадров; 800 мс — это 12 кадров при 15 к/с и 20 при 25:
#: запас есть, переполнения нет даже у сервиса, рисующего быстрее реального
#: времени.
LOOKAHEAD_MS = 800.0
#: Сколько кадров держим до их звука. Больше — сервис убежал вперёд настолько,
#: что старые кадры полезнее выбросить.
PENDING_MAX = 120
#: Пауза перед повторным подключением, по номеру попытки.
RECONNECT_BACKOFF_S = (1.0, 3.0, 8.0)
#: Шаг сторожа и выпуска кадров, пока реплика жива.
TICK_S = 0.02
#: Очередь звука и текста к сервису. Переполнилась — сервис не принимает
#: данные быстрее, чем синтез их отдаёт; лицо под эту реплику уже не успеет.
TO_DRIVER_MAX = 400
#: Режим `text`: первый звук сервиса по фразе ждём дольше порога сторожа —
#: сервис сначала синтезирует речь, потом рисует.
TEXT_FIRST_AUDIO_MS = 4000


@dataclass
class Stats:
    """Счётчики для прибора (`tools/live_video_check.py`) и тестов."""

    frames_in: int = 0
    frames_sent: int = 0
    frames_late: int = 0
    frames_foreign: int = 0     # чужое/погашенное поколение или режим портрета
    frames_invalid: int = 0
    frames_thinned: int = 0     # прорежены до NEGO_LIVE_VIDEO_FPS
    frames_overflow: int = 0
    audio_held: int = 0
    audio_direct: int = 0
    degrades: list[str] = field(default_factory=list)
    recoveries: int = 0
    connects: int = 0
    first_frame_lag_ms: list[float] = field(default_factory=list)


class _Utterance:
    """Режим `text`: одна фраза, которую сервис говорит своим голосом."""

    CANCEL = object()
    FAILED = object()

    def __init__(self, generation_id: str, index: int, text: str) -> None:
        self.generation_id = generation_id
        self.index = index
        self.text = text
        self.queue: asyncio.Queue = asyncio.Queue()
        self.done = False


class LiveVideoAvatar(AvatarProvider):
    """Лицо, которое рисует внешний сервис. Имя сервиса здесь не участвует ни в чём."""

    def __init__(self, persona: Persona, publish: Callable[[dict], None],
                 driver_factory: Callable[[], LiveVideoDriver], cfg: LiveVideoConfig,
                 *, now: Callable[[], float] = time.monotonic) -> None:
        self._persona = persona
        self._publish = publish
        self._make_driver = driver_factory
        self._cfg = cfg
        self._now = now
        self._driver: Optional[LiveVideoDriver] = None
        self._info = None
        probe = driver_factory()          # конструктор драйвера не ходит в сеть
        self._driver = probe
        self._info = probe.info
        self.input = probe.info.input
        delay = cfg.av_delay_ms if cfg.av_delay_ms is not None else probe.info.av_delay_ms
        self._av_delay_s = max(0, delay) / 1000.0
        self._min_gap_ms = 1000.0 / cfg.fps

        #: Что сказано клиенту: `video` или `amplitude`.
        self.mode = "video"
        #: Связь с сервисом: idle · connecting · ready · lost · dead.
        self.link = "idle"
        self.failures = 0
        self._state = "idle"
        self._closed = False
        self._voice_failed = False

        self.clock = PlaybackClock()
        self._gen = ""
        self._cancelled: deque[str] = deque(maxlen=64)
        self._held: deque[tuple[float, dict]] = deque()
        self._pending: list[VideoFrame] = []
        self._last_in_pts: Optional[float] = None
        self._covered_pts: Optional[float] = None
        self._first_audio_at: Optional[float] = None

        self._utterances: dict[tuple[str, int], _Utterance] = {}
        self._utterance_seq: dict[str, int] = {}
        self._voice_progress_at: Optional[float] = None
        self._voice_heard = False

        self._to_driver: Optional[asyncio.Queue] = None
        self._sender: Optional[asyncio.Task] = None
        self._supervisor: Optional[asyncio.Task] = None
        self._ticker: Optional[asyncio.Task] = None
        self._wake: Optional[asyncio.Event] = None
        self._side_tasks: set[asyncio.Task] = set()
        self.stats = Stats()

    # ------------------------------------------------------------ жизненный цикл

    def start(self) -> None:
        """Начать подключение к сервису в фоне. Без цикла событий — отложить."""
        if self._closed or self._supervisor is not None:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        self._wake = asyncio.Event()
        self._to_driver = asyncio.Queue(maxsize=TO_DRIVER_MAX)
        self._supervisor = loop.create_task(self._supervise())
        self._ticker = loop.create_task(self._tick_loop())
        self._sender = loop.create_task(self._send_loop())

    def _ensure_started(self) -> None:
        if self._supervisor is None:
            self.start()

    async def close(self) -> None:
        if self._closed:
            return
        # Сначала звук: всё придержанное — человеку, по порядку.
        self._flush_held()
        self._closed = True
        self._release_utterances(_Utterance.CANCEL)
        tasks = [t for t in (self._supervisor, self._ticker, self._sender, *self._side_tasks) if t]
        for task in tasks:
            task.cancel()
        for task in tasks:
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task
        await self._close_driver()
        self.link = "dead"

    async def _close_driver(self) -> None:
        driver, self._driver = self._driver, None
        if driver is None:
            return
        with contextlib.suppress(Exception):
            await asyncio.wait_for(driver.close(), timeout=1.0)

    # ------------------------------------------------------------- возможности

    def capabilities(self) -> AvatarCapabilities:
        if self.mode == "video":
            return AvatarCapabilities(
                available=True, lipsync=True, lipsync_mode="video", interruptible=True,
                transport="jpeg", states=AVATAR_STATES,
                synthetic=bool(self._info and self._info.synthetic))
        return AvatarCapabilities(available=True, lipsync=True, lipsync_mode="amplitude",
                                  interruptible=True, transport="local", states=AVATAR_STATES)

    def describe(self) -> str:
        vendor = self._info.vendor if self._info else "?"
        return f"live video ({vendor}, вход {self.input}, режим {self.mode}, связь {self.link})"

    # ---------------------------------------------------------------- состояние

    def _state_event(self, *, reason: Optional[str] = None, detail: Optional[str] = None,
                     reaction: Optional[str] = None) -> dict:
        video = self.mode == "video"
        event = {
            "type": "avatar.state", "state": self._state, "reaction": reaction,
            "persona": self._persona.scenario_id, "lipsync": True,
            "lipsync_mode": "video" if video else "amplitude",
            "transport": "jpeg" if video else "local",
        }
        if video and self._info and self._info.synthetic:
            event["synthetic"] = True
        if reason:
            event["reason"] = reason
        if detail:
            event["detail"] = detail
        return event

    async def set_state(self, state: str, *, reaction: Optional[str] = None) -> None:
        self._ensure_started()
        self._state = state if state in AVATAR_STATES else "listening"
        reason = None
        if self.mode == "amplitude" and self._can_recover():
            self.mode = "video"
            self.stats.recoveries += 1
            self._covered_pts = None
            reason = "provider_recovered"
            _log.info("живое видео: %s снова рисует лицо", self._info.vendor)
        self._publish(self._state_event(reason=reason, reaction=reaction))
        if self.mode == "video" and self.link == "ready" and self._driver is not None:
            self._background(self._driver.set_mood(self._state, reaction))

    def _can_recover(self) -> bool:
        if self.input != "audio" or self._voice_failed or self.link != "ready":
            return False
        if self.failures >= self._cfg.max_failures:
            return False
        # Только между репликами: посреди звучащей речи лицо не меняет стиль.
        return not self._held and self.clock.playing_pts(self._gen, self._now()) is None

    def _degrade(self, reason: str, *, strike: bool = True, fatal: bool = False) -> None:
        """Вернуть рисованный портрет. Звук не теряется ни при каком исходе."""
        if strike:
            self.failures += 1
        if self.input == "text":
            # Режим `text`: сервис — это и лицо, и ГОЛОС. Отказал один —
            # голос переходит на наш синтез до конца партии: менять голос
            # туда-обратно между репликами хуже, чем остаться без лица.
            # Фраза, оборванная на середине, звучит нашим синтезом заново.
            fatal = True
            self._voice_failed = True
            self._release_utterances(_Utterance.FAILED)
        if fatal or self.failures >= self._cfg.max_failures:
            self._give_up()
        if self._to_driver is not None:
            while not self._to_driver.empty():
                self._to_driver.get_nowait()
        if self.mode == "video":
            self.mode = "amplitude"
            self.stats.degrades.append(reason)
            self._flush_held()
            self._pending.clear()
            self._publish(self._state_event(reason="provider_failed", detail=reason))
            _log.warning("живое видео: %s — лицо вернулось к портрету (%s, отказов %d/%d)",
                         self._info.vendor if self._info else "?", reason, self.failures,
                         self._cfg.max_failures)
            if self._driver is not None and self.link == "ready":
                self._background(self._driver.interrupt())
        self._kick()

    def _give_up(self) -> None:
        """Больше не подключаться в этой партии и закрыть сессию: минуты платные."""
        if self.link == "dead":
            return
        self.link = "dead"
        current = None
        with contextlib.suppress(RuntimeError):
            current = asyncio.current_task()
        if self._supervisor is not None and current is not self._supervisor:
            # Надзор может висеть в ожидании событий живого соединения —
            # сам он из этого ожидания не выйдет.
            self._supervisor.cancel()
        self._background(self._close_driver())

    def fail(self, reason: str, *, fatal: bool = False) -> None:
        """Отказ, замеченный снаружи адаптера (голос сервиса в режиме `text`)."""
        self._degrade(reason, fatal=fatal)

    # -------------------------------------------------------------------- звук

    def flush_audio(self) -> None:
        self._flush_held()

    def audio_out(self, event: dict) -> None:
        """Аудиособытие клиенту — вместо прямой публикации синтезом.

        В режиме видео звук придерживается на `av_delay_ms`, чтобы кадр
        успевал к нему; в режиме портрета уходит сразу, как без адаптера.
        """
        gen = str(event.get("generation_id") or "")
        if gen != self._gen:
            self._begin(gen)
        if (self.mode != "video" or (self._av_delay_s <= 0 and not self._held)
                or self._ticker is None or self._ticker.done()):
            # Придержать можно, только если есть кому отпустить: звук,
            # оставленный в очереди без живого выпускающего, — потерянный голос.
            self._flush_held()
            self._release_audio(event)
            self.stats.audio_direct += 1
            return
        self._held.append((self._now() + self._av_delay_s, event))
        self.stats.audio_held += 1
        self._kick()

    def _release_audio(self, event: dict) -> None:
        self._publish(event)
        b64 = str(event.get("audio") or "")
        nbytes = len(b64) * 3 // 4 - (2 if b64.endswith("==") else 1 if b64.endswith("=") else 0)
        self.clock.published(str(event.get("generation_id") or ""), nbytes // 4, self._now())

    def _flush_held(self) -> None:
        while self._held:
            _, event = self._held.popleft()
            self._release_audio(event)

    def _begin(self, generation_id: str) -> None:
        """Первое звучание нового поколения."""
        self._flush_held()
        self._gen = generation_id
        self.clock.reset(generation_id)
        self._pending.clear()
        self._last_in_pts = None
        self._covered_pts = None
        self._first_audio_at = self._now()
        if self.mode == "video" and self.input == "audio" and self.link != "ready":
            # Сервис не на связи к началу реплики — кадров под неё не будет
            # вовсе. Честнее сразу рисованный рот, чем фото с немым голосом;
            # связь не виновата в этой реплике, отказ не засчитывается.
            self._degrade("not_connected", strike=False)

    async def speak(self, pcm: bytes, *, generation_id: str) -> None:
        """Тот же PCM, что ушёл человеку. Только в очередь — сеть ждёт отправщик."""
        if generation_id != self._gen:
            self._begin(generation_id)
        if self.input != "audio" or self.mode != "video" or self.link != "ready":
            return
        if self._to_driver is None:
            return
        try:
            self._to_driver.put_nowait(("audio", generation_id, pcm))
        except asyncio.QueueFull:
            self._degrade("driver_backlog")

    async def end_of_speech(self, generation_id: str) -> None:
        if self._to_driver is None or self.link != "ready" or generation_id != self._gen:
            return
        with contextlib.suppress(asyncio.QueueFull):
            self._to_driver.put_nowait(("end", generation_id, None))

    async def interrupt(self) -> None:
        if self._gen:
            self._cancelled.append(self._gen)
        # Придержанный звук принадлежит погашенному поколению — шина выбросила
        # бы его на выходе; здесь он просто не доходит до шины.
        self._held.clear()
        self._pending.clear()
        self._gen = ""
        self.clock.reset("")
        if self._to_driver is not None:
            while not self._to_driver.empty():
                self._to_driver.get_nowait()
        self._release_utterances(_Utterance.CANCEL)
        if self._driver is not None and self.link == "ready":
            self._background(self._driver.interrupt())
        self._state = "listening"
        self._publish(self._state_event())

    # ------------------------------------------------------ голос сервиса (text)

    def voice_for(self, fallback):
        if self.input != "text":
            return fallback
        from app.avatar.live.voice import LiveVideoVoice
        return LiveVideoVoice(self, fallback)

    def voice_ready(self) -> bool:
        return (self.input == "text" and not self._voice_failed and self.mode == "video"
                and self.link == "ready")

    async def wait_link(self, timeout_s: float) -> bool:
        """Подождать связь, если она ещё поднимается (первая реплика партии)."""
        self._ensure_started()
        deadline = self._now() + timeout_s
        while self.link in ("idle", "connecting") and not self._closed and self._now() < deadline:
            await asyncio.sleep(0.05)
        return self.voice_ready()

    def open_utterance(self, generation_id: str, text: str) -> Optional[_Utterance]:
        if not self.voice_ready() or self._to_driver is None:
            return None
        index = self._utterance_seq.get(generation_id, 0)
        self._utterance_seq[generation_id] = index + 1
        if len(self._utterance_seq) > 64:
            self._utterance_seq.pop(next(iter(self._utterance_seq)))
        utt = _Utterance(generation_id, index, text)
        self._utterances[(generation_id, index)] = utt
        if index == 0:
            # Новая реплика: первый звук сервиса снова получает запас на синтез.
            self._voice_heard = False
            self._voice_progress_at = self._now()
        elif self._voice_progress_at is None:
            self._voice_progress_at = self._now()
        try:
            self._to_driver.put_nowait(("text", generation_id, (index, text)))
        except asyncio.QueueFull:
            self._utterances.pop((generation_id, index), None)
            self.fail("driver_backlog")
            return None
        self._kick()
        return utt

    def close_utterance(self, utt: _Utterance) -> None:
        utt.done = True
        self._utterances.pop((utt.generation_id, utt.index), None)
        if not self._utterances:
            self._voice_progress_at = None

    def _release_utterances(self, marker) -> None:
        for utt in list(self._utterances.values()):
            utt.queue.put_nowait(marker)
        self._utterances.clear()
        self._voice_progress_at = None

    # ----------------------------------------------------------- фоновые задачи

    def _background(self, coro) -> None:
        try:
            task = asyncio.get_running_loop().create_task(self._bounded(coro))
        except RuntimeError:
            coro.close()
            return
        self._side_tasks.add(task)
        task.add_done_callback(self._side_tasks.discard)
        # Задачу могли погасить до первого шага (закрытие партии) — тогда
        # вложенная корутина не стартовала, и её надо закрыть явно.
        task.add_done_callback(lambda _t: coro.close())

    @staticmethod
    async def _bounded(coro) -> None:
        with contextlib.suppress(Exception):
            await asyncio.wait_for(coro, timeout=2.0)

    def _kick(self) -> None:
        if self._wake is not None:
            self._wake.set()

    async def _supervise(self) -> None:
        """Подключение, приём событий, переподключение. Одна задача на партию."""
        attempt = 0
        while not self._closed and self.link != "dead":
            driver = self._driver or self._make_driver()
            self._driver = driver
            self.link = "connecting"
            try:
                await asyncio.wait_for(driver.connect(), timeout=self._cfg.connect_timeout_s)
            except asyncio.CancelledError:
                raise
            except DriverError as exc:
                self.link = "lost"
                self._degrade(f"connect: {exc.reason}", fatal=exc.fatal)
                _log.warning("живое видео: подключение не удалось: %s", exc)
            except asyncio.TimeoutError:
                self.link = "lost"
                self._degrade("connect_timeout")
            except Exception as exc:
                self.link = "lost"
                self._degrade(f"connect: {type(exc).__name__}")
                _log.warning("живое видео: подключение упало: %r", exc)
            else:
                self.link = "ready"
                self.stats.connects += 1
                attempt = 0
                _log.info("живое видео: %s на связи", driver.info.vendor)
                closed = await self._pump(driver)
                if self.link != "dead":
                    self.link = "lost"
                if self._to_driver is not None:
                    # Недоотправленное принадлежит прошлой сессии сервиса.
                    while not self._to_driver.empty():
                        self._to_driver.get_nowait()
                if closed is not None and not self._closed:
                    self._degrade(f"closed: {closed.reason}", fatal=closed.fatal)
            await self._close_driver()
            if self._closed or self.link == "dead":
                break
            if attempt >= len(RECONNECT_BACKOFF_S):
                self.link = "dead"
                break
            await asyncio.sleep(RECONNECT_BACKOFF_S[attempt])
            attempt += 1
        if self.link == "dead" and self.mode == "video" and not self._closed:
            self._degrade("gave_up", strike=False)

    async def _pump(self, driver: LiveVideoDriver) -> Optional[Closed]:
        try:
            async for event in driver.events():
                if isinstance(event, VideoFrame):
                    self._on_frame(event)
                elif isinstance(event, VoiceChunk):
                    self._on_voice(event)
                elif isinstance(event, Closed):
                    return event
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            return Closed(reason=f"driver_error: {type(exc).__name__}")
        return Closed(reason="stream_ended")

    async def _send_loop(self) -> None:
        """Отправщик к сервису: строго по порядку, сеть ждёт здесь, а не синтез."""
        assert self._to_driver is not None
        while True:
            kind, gen, payload = await self._to_driver.get()
            driver = self._driver
            if driver is None or self.link != "ready" or gen in self._cancelled:
                continue
            try:
                if kind == "audio":
                    await driver.send_audio(payload, gen)
                elif kind == "text":
                    index, text = payload
                    await driver.send_text(text, gen, index)
                elif kind == "end":
                    await driver.end_of_speech(gen)
            except asyncio.CancelledError:
                raise
            except DriverError as exc:
                if self.input == "text":
                    self.fail(f"send: {exc.reason}", fatal=exc.fatal)
                else:
                    self._degrade(f"send: {exc.reason}", fatal=exc.fatal)
            except Exception as exc:
                if self.input == "text":
                    self.fail(f"send: {type(exc).__name__}")
                else:
                    self._degrade(f"send: {type(exc).__name__}")

    # ------------------------------------------------------------------- кадры

    def _on_frame(self, frame: VideoFrame) -> None:
        self.stats.frames_in += 1
        if (self.mode != "video" or not frame.generation_id or frame.generation_id != self._gen
                or frame.generation_id in self._cancelled):
            self.stats.frames_foreign += 1
            return
        pts = frame.pts_ms + self._cfg.pts_offset_ms
        if not math.isfinite(pts) or pts < 0 or not frame.jpeg:
            self.stats.frames_invalid += 1
            return
        if self._last_in_pts is not None:
            if pts < self._last_in_pts:
                self.stats.frames_invalid += 1
                return
            if pts - self._last_in_pts < self._min_gap_ms * 0.999:
                self.stats.frames_thinned += 1
                return
        self._last_in_pts = pts
        self._pending.append(VideoFrame(frame.generation_id, pts, frame.jpeg))
        if len(self._pending) > PENDING_MAX:
            self._pending.pop(0)
            self.stats.frames_overflow += 1
        self._kick()

    def _release_frames(self, now: float) -> None:
        while self._pending:
            frame = self._pending[0]
            at = self.clock.play_time(self._gen, frame.pts_ms)
            if at is None:
                finished = self.clock.finished_at()
                if not self._held and finished is not None and now > finished:
                    # Реплика отзвучала, а кадры остались за её концом (сервис
                    # дорисовывает закрытие рта): показывать их не по чему.
                    self.stats.frames_late += len(self._pending)
                    self._pending.clear()
                return      # звук под этот кадр ещё не отдан клиенту
            if now > at + STALE_MS / 1000.0:
                self._pending.pop(0)
                self.stats.frames_late += 1
                continue
            if now < at - LOOKAHEAD_MS / 1000.0:
                return
            self._pending.pop(0)
            try:
                event = avatar_frame(frame.jpeg, generation_id=frame.generation_id, pts_ms=frame.pts_ms)
            except ValueError:
                self.stats.frames_invalid += 1
                continue
            if self._covered_pts is None and self._first_audio_at is not None:
                self.stats.first_frame_lag_ms.append((now - self._first_audio_at) * 1000.0)
            self._publish(event)
            self.stats.frames_sent += 1
            self._covered_pts = frame.pts_ms

    def _on_voice(self, chunk: VoiceChunk) -> None:
        utt = self._utterances.get((chunk.generation_id, chunk.utterance))
        self._voice_progress_at = self._now()
        self._voice_heard = True
        if utt is None:
            return
        utt.queue.put_nowait(chunk)

    # ----------------------------------------------------------------- сторож

    def _release_due_audio(self, now: float) -> None:
        while self._held and self._held[0][0] <= now:
            _, event = self._held.popleft()
            self._release_audio(event)

    def _watchdog(self, now: float) -> None:
        if self.mode != "video":
            return
        if self.input == "text" and self._utterances and self._voice_progress_at is not None:
            limit = (self._cfg.stall_ms if self._voice_heard else
                     max(self._cfg.stall_ms, TEXT_FIRST_AUDIO_MS)) / 1000.0
            if now - self._voice_progress_at > limit:
                self.fail("voice_stalled")
                return
        playing = self.clock.playing_pts(self._gen, now)
        if playing is None:
            return
        covered = self._covered_pts if self._covered_pts is not None else 0.0
        if playing - covered > self._cfg.stall_ms:
            self._degrade("frames_stalled" if self._covered_pts is not None else "no_frames")

    def _active(self) -> bool:
        return bool(self._held or self._pending or self._utterances
                    or (self._gen and self.clock.finished_at() is not None
                        and self.clock.finished_at() > self._now()))

    async def _tick_loop(self) -> None:
        assert self._wake is not None
        while not self._closed:
            try:
                now = self._now()
                self._release_due_audio(now)
                self._release_frames(now)
                self._watchdog(now)
                active = self._active()
            except Exception:
                # Сбой выпускающего не должен оставить голос в очереди:
                # отдаём придержанное и уходим в портрет.
                _log.exception("живое видео: сбой выпуска звука и кадров")
                self._flush_held()
                self._degrade("ticker_error")
                active = False
            if active:
                await asyncio.sleep(TICK_S)
            else:
                self._wake.clear()
                with contextlib.suppress(asyncio.TimeoutError):
                    await asyncio.wait_for(self._wake.wait(), timeout=1.0)
