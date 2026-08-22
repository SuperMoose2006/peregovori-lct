"""base.py — интерфейс распознавания речи.

ПРОИСХОЖДЕНИЕ: Open-LLM-VTuber (MIT, commit 992309c0),
`src/open_llm_vtuber/asr/asr_interface.py` — там же одиннадцать реализаций
(Whisper, sherpa-onnx, FunASR, Azure, Groq…), что и доказывает: абстракция
нужного размера, раз в неё влезло столько разных движков.

ЧТО ИЗМЕНЕНО. Оригинал принимает `np.ndarray` и возвращает строку. Мы добавили
`final` в результат, потому что realtime-протоколу нужно различать
промежуточную гипотезу и окончательную расшифровку: первая рисуется серым и
может измениться, вторая уходит в движок как ход и изменению не подлежит.

ПОЧЕМУ ЭТО ПРОВАЙДЕР, А НЕ ЖЁСТКАЯ СВЯЗЬ. В задании прямо: «ASR — provider, не
hardcode». Причина практическая: распознавание через chat-completions даёт
задержку и не даёт частичных гипотез. Когда это станет мешать, меняется один
класс, а оркестратор не узнаёт.
"""

from __future__ import annotations

import abc
from dataclasses import dataclass

import numpy as np


@dataclass
class Transcript:
    text: str
    final: bool = True
    #: Уверенность, если провайдер её сообщает. Для UI: низкая уверенность —
    #: повод показать расшифровку редактируемой перед отправкой хода.
    confidence: float | None = None


class ASRProvider(abc.ABC):
    """Речь → текст."""

    @abc.abstractmethod
    def available(self) -> bool:
        ...

    @abc.abstractmethod
    async def transcribe(self, pcm: np.ndarray, sample_rate: int, lang: str) -> Transcript:
        """Распознать кусок речи. `pcm` — float32 моно в диапазоне [-1, 1]."""

    @abc.abstractmethod
    def describe(self) -> str:
        ...
