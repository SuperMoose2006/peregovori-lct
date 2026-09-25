"""Один выбор синтеза речи на весь процесс.

Раньше порядок «OpenAI, иначе edge» был записан дважды — в сборке партии и в
`/api/health`, — и держался только комментарием «тот же порядок». Любая
правка одного места делала health неправдой о том, кто звучит.
"""
from __future__ import annotations

import os
from typing import Optional

from app.providers.tts.base import TTSProvider


def make_tts() -> Optional[TTSProvider]:
    """Провайдер, который будет звучать в партии, или None.

    ПОРЯДОК ПО ЗАМЕРУ, А НЕ ПО ЦЕНЕ. На заведомо новом тексте — а в игре каждая
    реплика новая — edge даёт медиану 2318 мс до первого звука, openai 936 мс.
    Edge остаётся запасным: он бесплатен и не требует ключа. Стендовый
    синтетический звук — только по явному `NEGO_TTS=testtone`.
    """
    if os.getenv("NEGO_TTS", "").strip().lower() == "testtone":
        from app.providers.tts.testtone import ToneTTS
        return ToneTTS()
    from app.providers.tts.edge import EdgeTTS
    from app.providers.tts.openai_speech import OpenAISpeechTTS
    for provider in (OpenAISpeechTTS(), EdgeTTS()):
        if provider.available():
            return provider
    return None
