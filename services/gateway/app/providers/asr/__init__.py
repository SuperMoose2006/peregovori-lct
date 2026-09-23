"""Выбор провайдера распознавания речи. См. docs/upstream-code-map.md.

ПОЧЕМУ ФАБРИКА, А НЕ ИМПОРТ КОНКРЕТНОГО КЛАССА. Провайдеров теперь два, и
выбирать между ними надо НА МОМЕНТ ПАРТИИ, а не на момент запуска: локальная
служба поднимает модель полторы минуты, и партия, начатая в эту минуту, обязана
уехать к облачному распознаванию, а не ждать.

  `NEGO_ASR=parakeet` — локальная модель, если служба ответила; иначе облако.
  `NEGO_ASR=openrouter` — только облако.
  не задано — то же, что `parakeet`: своя модель бесплатна и не отправляет
  речь наружу, поэтому она разумный выбор по умолчанию там, где есть.

Ни один из вариантов не отменяет realtime-путь OpenAI: он живёт отдельно
(`perception/realtime_voice.py`) и включается раньше — см. `realtime/endpoint.py`.
"""

from __future__ import annotations

import os

from app.providers.asr.base import ASRProvider
from app.providers.asr.openrouter import OpenRouterASR
from app.providers.asr.parakeet import ParakeetASR, service_ready


def make_asr() -> ASRProvider:
    """Провайдер для «классического» голосового пути."""
    choice = os.getenv("NEGO_ASR", "").strip().lower()
    if choice == "openrouter":
        return OpenRouterASR()
    if choice in ("", "parakeet", "auto") and service_ready():
        return ParakeetASR()
    return OpenRouterASR()


__all__ = ["ASRProvider", "OpenRouterASR", "ParakeetASR", "make_asr", "service_ready"]
