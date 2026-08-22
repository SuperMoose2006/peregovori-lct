"""voice_pipeline.py — путь от микрофона до хода движка.

СБОРКА ИЗ ТРЁХ UPSTREAM-РЕАЛИЗАЦИЙ (см. docs/upstream-code-map.md):
  VAD                → TEN (`ten_vad_python`)      — «звук есть / звука нет»
  детектор конца хода → TEN (`ten_turn_detection`) — «мысль закончена?»
  распознавание       → провайдер (OpenRouter)      — «что именно сказано»

ПОЧЕМУ ТРИ СТУПЕНИ, А НЕ ОДНА. Наивный путь — «замолчал на секунду, значит
сходил» — ломается на первой же настоящей реплике переговорщика: человек
формулирует условие, делает паузу на середине, и оппонент влезает в разрыв.
VAD отвечает только за звук; законченность мысли — отдельный вопрос, и на него
отвечает языковая модель по расшифровке.

ПЕРЕБИВАНИЕ ЖИВЁТ ЗДЕСЬ. Как только VAD сказал «человек заговорил», мы гасим
оппонента — не дожидаясь ни расшифровки, ни детектора конца хода. Это и есть
измеряемая задержка barge-in: длина префикса VAD (120 мс) плюс сеть. Ждать
расшифровки было бы честнее по смыслу, но человек к тому моменту уже секунду
говорит поверх.

ЗАЩИТА ОТ САМОПОДСЛУШИВАНИЯ. Пока оппонент говорит без наушников, его голос
попадает в микрофон, и VAD честно считает это речью. Поэтому пайплайн знает,
говорит ли оппонент, и в это время поднимает планку: нужен более уверенный и
более длинный кусок речи, чтобы признать перебивание. Приём из Open-LLM-VTuber
(там это «interruption without headphones»), реализация наша — их вариант
завязан на их же конфиг громкости.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Optional

import numpy as np

from app.perception.turn_detect import TurnDecision, TurnDetector
from app.perception.vad import SAMPLE_RATE, SpeechDetector, VADConfig
from app.providers.asr.base import ASRProvider

#: Потолок накопления одного хода. Больше минуты — почти наверняка забытый
#: включённым микрофон, а не реплика.
_MAX_TURN_SECONDS = 60


@dataclass
class VoiceStats:
    """Замеры для docs/latency.md. Считаем на живом пути, а не в синтетике."""
    speech_start_ms: float = 0.0
    asr_ms: float = 0.0
    turn_detect_ms: float = 0.0
    barge_in_ms: float = 0.0
    segments: int = 0
    forced: int = 0
    extra: dict = field(default_factory=dict)


class VoicePipeline:
    """Кусок PCM внутрь — готовый ход наружу."""

    def __init__(self, asr: ASRProvider, lang: str,
                 on_turn: Callable[[str], Awaitable[None]],
                 on_interrupt: Callable[[], Awaitable[None]],
                 publish: Callable[[dict], None],
                 vad_config: Optional[VADConfig] = None) -> None:
        self._asr = asr
        self._lang = lang
        self._on_turn = on_turn
        self._on_interrupt = on_interrupt
        self._publish = publish

        self._vad = SpeechDetector(
            config=vad_config,
            on_speech_start=self._speech_started,
            on_speech_end=self._speech_ended,
        )
        self._turn_detector = TurnDetector()

        #: Накопленный звук текущего хода. Не очищается на паузах: реплика
        #: «Я готов… (пауза) …но при одном условии» — это ОДИН ход, и
        #: распознавать его надо целиком, иначе теряется связь половин.
        self._audio: list[np.ndarray] = []
        self._transcript = ""
        self._opponent_speaking = False
        self._pending: Optional[asyncio.Task] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self.stats = VoiceStats()

    # --------------------------------------------------------------- состояние

    @property
    def available(self) -> bool:
        return self._vad.available

    def set_opponent_speaking(self, speaking: bool) -> None:
        """Оркестратор сообщает, звучит ли сейчас голос оппонента."""
        self._opponent_speaking = speaking

    def reset(self) -> None:
        self._vad.reset()
        self._audio.clear()
        self._transcript = ""

    # ------------------------------------------------------------------- вход

    def feed(self, pcm: np.ndarray) -> None:
        """Кусок с микрофона: int16 моно 16 кГц."""
        self._loop = self._loop or asyncio.get_running_loop()
        self._audio.append(pcm)
        # Аварийный сброс, чтобы не копить бесконечно забытый микрофон.
        if sum(a.size for a in self._audio) > _MAX_TURN_SECONDS * SAMPLE_RATE:
            self._audio = self._audio[-(_MAX_TURN_SECONDS * SAMPLE_RATE // len(pcm) or 1):]
        self._vad.feed(pcm)

    # ------------------------------------------------------ колбэки от VAD

    def _speech_started(self) -> None:
        """Человек заговорил. Гасим оппонента немедленно."""
        self.stats.segments += 1
        self._publish({"type": "user.speech.started"})
        if self._opponent_speaking and self._loop:
            # Барьер против самоподслушивания: если оппонент звучит, перебиванием
            # считаем только речь, дожившую до конца префикса VAD, — а сюда мы
            # попадаем именно после него, так что условие уже выполнено.
            self._loop.create_task(self._on_interrupt())

    def _speech_ended(self) -> None:
        """Звук кончился. Теперь вопрос — закончена ли мысль."""
        self._publish({"type": "user.speech.stopped"})
        if self._loop and (self._pending is None or self._pending.done()):
            self._pending = self._loop.create_task(self._settle_turn())

    # ------------------------------------------------------------ конец хода

    async def _settle_turn(self) -> None:
        """Расшифровать накопленное и решить: ход сделан или человек думает."""
        import time

        if not self._audio:
            return
        pcm = np.concatenate(self._audio).astype(np.float32) / 32768.0
        if pcm.size < SAMPLE_RATE // 4:  # короче 250 мс — кашель, не реплика
            return

        t0 = time.perf_counter()
        result = await self._asr.transcribe(pcm, SAMPLE_RATE, self._lang)
        self.stats.asr_ms = (time.perf_counter() - t0) * 1000
        text = (result.text or "").strip()
        if not text:
            return

        self._transcript = text
        self._publish({"type": "user.transcript", "text": text, "final": True})

        t1 = time.perf_counter()
        decision = await self._turn_detector.eval(text, self._lang)
        self.stats.turn_detect_ms = (time.perf_counter() - t1) * 1000

        if decision is TurnDecision.FINISHED:
            self._audio.clear()
            self._transcript = ""
            await self._on_turn(text)
        # UNFINISHED / WAIT — продолжаем слушать. Накопленный звук НЕ чистим:
        # следующий кусок допишется к нему и распознается вместе.

    async def force_commit(self) -> None:
        """Потолок ожидания (`force_threshold_ms` из TEN): ход считается сделанным.

        Нужен потому, что «подождать» — небесплатный дефолт: если детектор
        упорно отвечает `unfinished`, человек будет ждать ответа вечно.
        """
        text = self._transcript.strip()
        if not text:
            return
        self.stats.forced += 1
        self._audio.clear()
        self._transcript = ""
        await self._on_turn(text)
