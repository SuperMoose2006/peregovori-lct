"""realtime_voice.py — микрофон → OpenAI Realtime → ход движка.

ЗАЧЕМ ВТОРОЙ КОНВЕЙЕР, КОГДА ЕСТЬ `voice_pipeline.py`.

Старый путь честно делал своё дело, но платил за него временем. Он накапливал
звук целиком, ждал тишины по энергии, отправлял ФАЙЛ в chat-completions и только
потом получал текст: 3.3 с после того, как человек замолчал. В переговорах это
пауза, в которой собеседник успевает подумать, что связь оборвалась.

Realtime-сессия OpenAI решает ровно эту задачу: звук течёт непрерывно, VAD живёт
на их стороне, расшифровка приходит КУСКАМИ ПО ХОДУ РЕЧИ. Замер на той же
записи: первая гипотеза через 1.4 с от начала фразы, полный текст — через ~0.45 с
после того, как человек замолчал (плюс окно тишины VAD).

ЧТО ЗДЕСЬ НЕ ДЕЛАЕТСЯ, И ЭТО ГЛАВНОЕ. У OpenAI есть speech-to-speech: та же
сессия умеет сама придумать ответ и озвучить его. Мы этим НЕ пользуемся —
осознанно. Первый принцип продукта: состояние и оценку считает детерминированный
движок, а модель отвечает только за текст. Модель, которая сама решает, что
ответил оппонент, отбирает у движка ZOPA, floor и метрики. Поэтому берём ровно
одну способность — распознавание — и отдаём результат туда же, куда его отдавала
клавиатура.

ПОЧЕМУ КУСКИ СОБИРАЮТСЯ ЗДЕСЬ, А НЕ У НИХ. Серверный VAD режет речь по паузам, и
порог — компромисс. Замер на живой фразе:

    тишина 200 мс  → 3 куска, первый текст через 1.4 с  (видно, как печатается)
    тишина 700 мс  → 1 кусок,  текст через 4.6 с        (чисто, но немо)

Ход в игре — это ЦЕЛАЯ реплика, а не кусок. Поэтому берём короткий порог ради
живого текста на экране, а куски склеиваем сами и закрываем ход, когда человек
молчит `_QUIET_MS`. Так на экране печатается по ходу речи, а в движок уходит
целая мысль.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Optional

import numpy as np

log = logging.getLogger(__name__)

#: Частота нашего конвейера и частота, которую требует OpenAI. 16 кГц сессия
#: отвергает («integer below minimum value»), поэтому передискретизация
#: обязательна — отношение ровно 3:2.
SAMPLE_RATE = 16_000
OPENAI_RATE = 24_000

REALTIME_URL = "wss://api.openai.com/v1/realtime?intent=transcription"

#: Модель распознавания. `gpt-live-transcribe` отказывается работать с
#: turn_detection («Turn detection is not supported for this transcription
#: model»), а без VAD пришлось бы вернуть свой — то есть и задержку.
MODEL = os.getenv("NEGO_REALTIME_ASR_MODEL", "gpt-4o-mini-transcribe")

#: Порог тишины серверного VAD. Короткий НАМЕРЕННО — см. шапку.
VAD_SILENCE_MS = int(os.getenv("NEGO_REALTIME_VAD_MS", "200"))

#: Сколько молчания считаем концом хода. Больше, чем порог VAD: пауза внутри
#: фразы («я готов… но при одном условии») не должна рвать ход надвое.
_QUIET_MS = int(os.getenv("NEGO_REALTIME_QUIET_MS", "900"))

#: Аварийный потолок хода — забытый включённый микрофон не должен копиться вечно.
_MAX_TURN_SECONDS = 120


@dataclass
class RealtimeStats:
    segments: int = 0
    first_partial_ms: float = 0.0
    asr_ms: float = 0.0
    barge_in_ms: float = 0.0
    reconnects: int = 0
    errors: list[str] = field(default_factory=list)


def _to_24k(pcm16: np.ndarray) -> bytes:
    """16 кГц → 24 кГц. Отношение 3:2, линейная интерполяция.

    Для речи этого достаточно: полоса телефонного качества, а всё, что выше
    8 кГц, в исходнике и так отсутствует — апсемплинг не может добавить того,
    чего не было записано.
    """
    if pcm16.size == 0:
        return b""
    n_out = int(pcm16.size * OPENAI_RATE / SAMPLE_RATE)
    xi = np.linspace(0, pcm16.size - 1, n_out)
    out = np.interp(xi, np.arange(pcm16.size), pcm16.astype(np.float32))
    return out.astype(np.int16).tobytes()


class RealtimeVoicePipeline:
    """Та же поверхность, что у `VoicePipeline`: оркестратор не знает о подмене."""

    def __init__(self, lang: str,
                 on_turn: Callable[[str], Awaitable[None]],
                 on_interrupt: Callable[[], Awaitable[None]],
                 publish: Callable[[dict], None]) -> None:
        self._lang = lang
        self._on_turn = on_turn
        self._on_interrupt = on_interrupt
        self._publish = publish

        self._key = os.getenv("OPENAI_REALTIME_KEY", "").strip()
        self._ws = None
        self._reader: Optional[asyncio.Task] = None
        self._sender: Optional[asyncio.Task] = None
        self._quiet: Optional[asyncio.Task] = None
        self._outbox: Optional[asyncio.Queue] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None

        #: Куски, уже расшифрованные в рамках текущего хода.
        self._parts: list[str] = []
        #: Живая гипотеза текущего куска — то, что рисуется серым.
        self._live = ""
        self._opponent_speaking = False
        #: Говорит ли человек ПРЯМО СЕЙЧАС (по VAD). Таймер тишины считает только
        #: когда это False — иначе он срабатывал прямо посреди фразы.
        self._speaking = False
        self._speech_at: Optional[float] = None
        self._fed_samples = 0
        self.stats = RealtimeStats()

    # --------------------------------------------------------------- состояние

    @property
    def available(self) -> bool:
        return bool(self._key)

    def set_opponent_speaking(self, speaking: bool) -> None:
        self._opponent_speaking = speaking

    def reset(self) -> None:
        self._speaking = False
        self._parts.clear()
        self._live = ""
        self._fed_samples = 0
        self._cancel_quiet()

    def describe(self) -> str:
        return f"openai-realtime ({MODEL}, VAD {VAD_SILENCE_MS} мс)"

    async def close(self) -> None:
        self._cancel_quiet()
        for task in (self._reader, self._sender):
            if task and not task.done():
                task.cancel()
        ws, self._ws = self._ws, None
        if ws is not None:
            try:
                await ws.close()
            except Exception:
                pass

    # ------------------------------------------------------------------- вход

    def feed(self, pcm: np.ndarray) -> None:
        """Кусок с микрофона: int16 моно 16 кГц. Вызывается из петли сокета."""
        self._loop = self._loop or asyncio.get_running_loop()
        if self._outbox is None:
            self._outbox = asyncio.Queue(maxsize=200)
            self._loop.create_task(self._ensure_session())

        self._fed_samples += pcm.size
        if self._fed_samples > _MAX_TURN_SECONDS * SAMPLE_RATE:
            # Микрофон забыли включённым: рвём накопленное, но не соединение.
            self.reset()

        chunk = _to_24k(pcm)
        if not chunk:
            return
        try:
            self._outbox.put_nowait(chunk)
        except asyncio.QueueFull:
            # Очередь переполнена — сеть не успевает. Терять СВЕЖИЙ звук хуже,
            # чем старый: выбрасываем самый давний кусок и кладём новый.
            try:
                self._outbox.get_nowait()
                self._outbox.put_nowait(chunk)
            except Exception:
                pass

    async def force_commit(self) -> None:
        """Человек нажал «готово» — не ждём тишины."""
        await self._commit(reason="force")

    # ---------------------------------------------------------------- сессия

    async def _ensure_session(self) -> None:
        if self._ws is not None or not self._key:
            return
        try:
            import websockets
        except ImportError:                       # pragma: no cover
            log.warning("websockets не установлен — realtime-голос недоступен")
            return
        try:
            self._ws = await websockets.connect(
                REALTIME_URL,
                additional_headers={"Authorization": f"Bearer {self._key}"},
                max_size=1 << 22, open_timeout=20,
            )
        except Exception as exc:
            self.stats.errors.append(f"connect: {exc}"[:120])
            log.warning("realtime: не удалось подключиться: %s", exc)
            return

        await self._ws.send(json.dumps({
            "type": "session.update",
            "session": {
                "type": "transcription",
                "audio": {"input": {
                    "format": {"type": "audio/pcm", "rate": OPENAI_RATE},
                    "transcription": {"model": MODEL, "language": self._lang},
                    "turn_detection": {
                        "type": "server_vad", "threshold": 0.5,
                        "prefix_padding_ms": 300,
                        "silence_duration_ms": VAD_SILENCE_MS,
                    },
                }},
            },
        }))
        self._reader = asyncio.create_task(self._read_loop())
        self._sender = asyncio.create_task(self._send_loop())

    async def _send_loop(self) -> None:
        assert self._outbox is not None
        while True:
            chunk = await self._outbox.get()
            ws = self._ws
            if ws is None:
                continue
            try:
                await ws.send(json.dumps({
                    "type": "input_audio_buffer.append",
                    "audio": base64.b64encode(chunk).decode(),
                }))
            except Exception as exc:
                self.stats.errors.append(f"send: {exc}"[:120])
                self._ws = None
                return

    async def _read_loop(self) -> None:
        ws = self._ws
        if ws is None:
            return
        try:
            async for raw in ws:
                try:
                    event = json.loads(raw)
                except Exception:
                    continue
                await self._on_event(event)
        except Exception as exc:
            self.stats.errors.append(f"read: {exc}"[:120])
        finally:
            self._ws = None

    # ---------------------------------------------------------------- события

    async def _on_event(self, event: dict) -> None:
        kind = str(event.get("type") or "")

        if kind.endswith("speech_started"):
            self.stats.segments += 1
            self._speaking = True
            self._speech_at = time.perf_counter()
            self._cancel_quiet()
            self._publish({"type": "user.speech.started"})
            # Перебивание объявляем СРАЗУ, только когда оппонент молчит. Пока он
            # звучит, энергия в микрофоне может быть его же голосом сквозь
            # эхоподавление, и рвать его по ней — значит рвать самого себя.
            # Настоящее подтверждение — распознанные СЛОВА, см. ниже.
            if not self._opponent_speaking:
                await self._on_interrupt()
            return

        if kind.endswith("speech_stopped"):
            self._speaking = False
            self._publish({"type": "user.speech.stopped"})
            # Отсчёт тишины начинается ЗДЕСЬ, а не от прихода расшифровки.
            # Расшифровка отстаёт от речи почти на секунду, и таймер, заведённый
            # от неё, успевал сработать посреди следующей фразы — ход рвался на
            # три куска, каждый уходил в движок отдельным ходом.
            self._arm_quiet()
            return

        if kind.endswith("transcription.delta"):
            delta = str(event.get("delta") or "")
            if not delta:
                return
            if self.stats.first_partial_ms == 0.0 and self._speech_at:
                self.stats.first_partial_ms = (time.perf_counter() - self._speech_at) * 1000
            self._live += delta
            self._publish({"type": "user.transcript",
                           "text": self._joined(), "final": False})
            await self._maybe_barge_in(self._live)
            return

        if kind.endswith("transcription.completed"):
            text = str(event.get("transcript") or "").strip()
            self._live = ""
            if not text:
                return
            self._parts.append(text)
            if self._speech_at:
                self.stats.asr_ms = (time.perf_counter() - self._speech_at) * 1000
            self._publish({"type": "user.transcript",
                           "text": self._joined(), "final": False})
            await self._maybe_barge_in(text)
            # Кусок расшифрован. Если человек уже молчит — обновляем отсчёт;
            # если ещё говорит, таймер заведёт `speech_stopped`.
            if not self._speaking:
                self._arm_quiet()
            return

        if kind == "error":
            detail = json.dumps(event.get("error"), ensure_ascii=False)[:160]
            self.stats.errors.append(detail)
            log.warning("realtime: %s", detail)

    async def _maybe_barge_in(self, heard: str) -> None:
        """Второй рубеж защиты от самоперебивания.

        Пока оппонент говорит, поводом прервать его считаем не громкость, а
        РАСПОЗНАННЫЕ СЛОВА: эхо собственного синтеза сквозь AEC даёт всплески
        энергии, но редко даёт связный текст. Порог в три символа отсекает
        «а», «м», щелчки — и пропускает настоящую попытку вклиниться.
        """
        if not self._opponent_speaking:
            return
        if len(heard.strip()) < 3:
            return
        self._opponent_speaking = False
        if self._speech_at:
            self.stats.barge_in_ms = (time.perf_counter() - self._speech_at) * 1000
        await self._on_interrupt()

    # ------------------------------------------------------------ конец хода

    def _joined(self) -> str:
        parts = [*self._parts, self._live] if self._live else list(self._parts)
        return " ".join(p for p in parts if p).strip()

    def _arm_quiet(self) -> None:
        self._cancel_quiet()
        if self._loop:
            self._quiet = self._loop.create_task(self._quiet_timer())

    def _cancel_quiet(self) -> None:
        if self._quiet and not self._quiet.done():
            self._quiet.cancel()
        self._quiet = None

    async def _quiet_timer(self) -> None:
        try:
            await asyncio.sleep(_QUIET_MS / 1000)
        except asyncio.CancelledError:
            return
        await self._commit(reason="quiet")

    async def _commit(self, *, reason: str) -> None:
        text = self._joined()
        if not text:
            return
        self._parts.clear()
        self._live = ""
        self._fed_samples = 0
        self._publish({"type": "user.transcript", "text": text, "final": True})
        await self._on_turn(text)
