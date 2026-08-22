"""base.py — интерфейс синтеза речи.

ПРОИСХОЖДЕНИЕ: Open-LLM-VTuber (MIT, commit 992309c0),
`src/open_llm_vtuber/tts/tts_interface.py`.

ЧТО ИЗМЕНЕНО И ПОЧЕМУ. Оригинал возвращает **путь к файлу**: синтезировал —
сохранил wav — отдал имя. Для аниме-компаньона это нормально, у него реплика
короткая и играется целиком. Для переговоров нет: пока файл дописывается,
человек сидит в тишине, а перебить оппонента на середине фразы нельзя — файла
ещё нет.

Поэтому интерфейс отдаёт **поток PCM-чанков**. Три следствия, ради которых всё
и менялось:
  1. первый звук уходит клиенту, не дожидаясь конца фразы;
  2. перебивание рвёт поток, а не ждёт готовности файла;
  3. те же чанки без конвертации уходят в аватар на липсинк.

Формат — float32 PCM 24 кГц моно. Это ровно то, что ест портированный
`AudioPlayer` из MiniCPM-o, поэтому клиентская часть работает без переходников.
"""

from __future__ import annotations

import abc
from dataclasses import dataclass
from typing import AsyncIterator

#: Частота выходного звука. Совпадает с `outputSampleRate` в
#: `static/duplex/lib/realtime-session.js` — менять только вместе с клиентом.
OUTPUT_SAMPLE_RATE = 24000


@dataclass
class Voice:
    """Голос персонажа. Пол берётся из сценария, а не выдумывается синтезом."""
    id: str
    lang: str
    female: bool


class TTSProvider(abc.ABC):
    """Синтез речи. Реализации: edge (по умолчанию), openrouter."""

    @abc.abstractmethod
    def available(self) -> bool:
        """Может ли провайдер сейчас говорить.

        Честный ответ обязателен: при `False` слой голоса объявляет себя
        недоступным, а не изображает синтез тишиной.
        """

    @abc.abstractmethod
    async def stream(self, text: str, voice: Voice) -> AsyncIterator[bytes]:
        """Чанки float32 PCM 24 кГц моно (сырые байты, little-endian)."""

    @abc.abstractmethod
    def describe(self) -> str:
        """Строка для `/api/health` — на демо видно, кто именно говорит."""


def pick_voice(lang: str, female: bool) -> Voice:
    """Голос под язык и пол персонажа.

    Отдельная функция, а не поле провайдера: имена голосов у провайдеров разные,
    а решение «женский голос для Марины» принимается сценарием один раз.
    """
    return Voice(id="", lang=lang, female=female)
