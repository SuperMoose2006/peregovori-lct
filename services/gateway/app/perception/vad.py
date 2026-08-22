"""vad.py — определение речи в потоке с микрофона.

ПРОИСХОЖДЕНИЕ. Машина состояний перенесена из TEN Framework (Apache-2.0,
commit 2e56d965), файл `ai_agents/agents/ten_packages/extension/ten_vad_python/
extension.py` (классы `VADState`, метод `_check_state_transition`) вместе с
конфигурацией из `config.py` (`prefix_padding_ms=120`, `silence_duration_ms=1000`,
`vad_threshold=0.5`, `hop_size_ms=16`). Сама модель — pip-пакет `ten-vad`,
готовая нативная библиотека.

ПОЧЕМУ TEN, А НЕ SILERO. Silero есть и в MiniCPM (`vad/vad.py`), и в
Open-LLM-VTuber (`vad/silero.py`) — то есть выбор был. Решил шаг принятия
решения: 16 мс у TEN против 32 мс у Silero. Задержка barge-in измеряется именно
им: пока VAD не сказал «человек заговорил», оппонент продолжает говорить поверх.
Замерено здесь: **0.12 мс на хоп** — в 130 раз быстрее реального времени на CPU.

ЧТО ИЗМЕНЕНО ОТНОСИТЕЛЬНО ОРИГИНАЛА. У TEN это extension рантайма: наследует
`AsyncExtension`, шлёт `Cmd.create("start_of_sentence")` через `ten_env`.
Рантайм мы не берём (он тянет Agora и сборку C++/Go — см.
docs/upstream-feature-matrix.md §0.2), поэтому класс стал обычным объектом с
колбэками, а команды — событиями нашей шины. Логика переходов сохранена
дословно: «все пробы последнего окна выше порога» / «все ниже».

Требует системную `libc++1` (ставится `apt-get install libc++1`).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum, auto
from typing import Callable, Optional

import numpy as np

SAMPLE_RATE = 16000


class VADState(Enum):
    IDLE = auto()
    SPEAKING = auto()


@dataclass
class VADConfig:
    """Значения по умолчанию — из `ten_vad_python/config.py`."""

    #: Сколько подряд миллисекунд речи нужно, чтобы признать начало.
    #: Мало — VAD стартует от кашля; много — растёт задержка перебивания.
    prefix_padding_ms: int = 120
    #: Сколько тишины считать концом речи. Здесь это ЛИШЬ ПОДСКАЗКА: настоящее
    #: решение «ход закончен?» принимает `turn_detect.py`, потому что пауза
    #: посреди аргумента — это не конец хода.
    silence_duration_ms: int = 1000
    vad_threshold: float = 0.5
    hop_size_ms: int = 16


class SpeechDetector:
    """Поток PCM → события «заговорил» / «замолчал».

    Кормить кусками любого размера: внутри буфер, наружу — только переходы.
    """

    def __init__(self, config: Optional[VADConfig] = None,
                 on_speech_start: Optional[Callable[[], None]] = None,
                 on_speech_end: Optional[Callable[[], None]] = None) -> None:
        self.config = config or VADConfig()
        self.on_speech_start = on_speech_start
        self.on_speech_end = on_speech_end

        self.hop_size = self.config.hop_size_ms * SAMPLE_RATE // 1000  # 256 сэмплов
        self.silence_window_size = self.config.silence_duration_ms // self.config.hop_size_ms
        self.prefix_window_size = self.config.prefix_padding_ms // self.config.hop_size_ms
        self.window_size = max(self.silence_window_size, self.prefix_window_size)

        self.state = VADState.IDLE
        self._probe_window: list[float] = []
        self._buffer = np.empty(0, dtype=np.int16)
        self._vad = None
        self._broken = False

    # -- жизненный цикл -----------------------------------------------------

    def _ensure_model(self) -> bool:
        """Ленивая загрузка. Нет либы — детектор честно объявляет себя сломанным.

        Не бросаем исключение: отсутствие VAD должно отключить голосовой слой,
        а не уронить партию, которая прекрасно играется текстом.
        """
        if self._vad is not None:
            return True
        if self._broken:
            return False
        try:
            from ten_vad import TenVad
            self._vad = TenVad(self.hop_size)
            return True
        except Exception:
            self._broken = True
            return False

    @property
    def available(self) -> bool:
        return self._ensure_model()

    @property
    def speaking(self) -> bool:
        return self.state is VADState.SPEAKING

    def reset(self) -> None:
        self.state = VADState.IDLE
        self._probe_window.clear()
        self._buffer = np.empty(0, dtype=np.int16)

    # -- вход ---------------------------------------------------------------

    def feed(self, pcm: np.ndarray) -> None:
        """Скормить кусок. `pcm` — int16 моно 16 кГц (как отдаёт браузер)."""
        if not self._ensure_model():
            return
        if pcm.dtype != np.int16:
            pcm = (np.clip(pcm, -1.0, 1.0) * 32767).astype(np.int16)

        self._buffer = np.concatenate([self._buffer, pcm]) if self._buffer.size else pcm
        while self._buffer.size >= self.hop_size:
            hop, self._buffer = self._buffer[:self.hop_size], self._buffer[self.hop_size:]
            try:
                probability, _flag = self._vad.process(hop)
            except Exception:
                self._broken = True
                return
            self._push_probe(float(probability))

    # -- переходы (перенос `_check_state_transition` из TEN) -----------------

    def _push_probe(self, probability: float) -> None:
        self._probe_window.append(probability)
        if len(self._probe_window) > self.window_size:
            self._probe_window.pop(0)
        if len(self._probe_window) != self.window_size:
            return

        threshold = self.config.vad_threshold
        if self.state is VADState.IDLE:
            recent = self._probe_window[-self.prefix_window_size:]
            if all(p >= threshold for p in recent):
                self.state = VADState.SPEAKING
                if self.on_speech_start:
                    self.on_speech_start()
        else:
            recent = self._probe_window[-self.silence_window_size:]
            if all(p < threshold for p in recent):
                self.state = VADState.IDLE
                if self.on_speech_end:
                    self.on_speech_end()
