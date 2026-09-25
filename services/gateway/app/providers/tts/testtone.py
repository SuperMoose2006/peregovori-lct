"""Стенд синтеза: синтетический звук вместо речи — для проверки медиаконтура.

ЗАЧЕМ ОН ЕСТЬ. Видеоконтур (кадры по аудиочасам, перебивание, отброс хвостов
погашенного поколения) держится на звуке: без звука нет ни часов
проигрывателя, ни кадров. А офлайн — в тестах, на стенде без ключей — синтеза
речи нет вовсе: edge ходит в сеть, OpenAI требует ключ. Этот провайдер даёт
звук, похожий на речь по ритму (слоги, паузы между словами, длина по тексту),
но это НЕ речь, и называет себя так же в `/api/health`.

Включается только явно: `NEGO_TTS=testtone`. Сам он не выбирается никогда —
иначе на показе вместо голоса оппонента зазвучал бы гудок. Чем станет: ничем —
это прибор стенда, а не провайдер продукта.
"""
from __future__ import annotations

import math
from typing import AsyncIterator

import numpy as np

from app.providers.tts.base import TTSProvider, Voice

SAMPLE_RATE = 24000
#: Кусок, которым звук уходит в трубу, — как у настоящего синтеза.
CHUNK_MS = 100
#: Длительность на символ и потолок фразы: ритм речи, а не её смысл.
MS_PER_CHAR = 55
MAX_PHRASE_MS = 6000


def _phrase(text: str, female: bool) -> np.ndarray:
    base = 210.0 if female else 135.0
    words = [w for w in text.split() if w] or ["…"]
    parts: list[np.ndarray] = []
    total_ms = 0.0
    for wi, word in enumerate(words):
        ms = min(max(len(word) * MS_PER_CHAR, 120), 900)
        if total_ms + ms > MAX_PHRASE_MS:
            break
        n = int(SAMPLE_RATE * ms / 1000)
        t = np.arange(n) / SAMPLE_RATE
        # Слоги — огибающая с периодом ~180 мс; высота тона плывёт от слова к слову.
        pitch = base * (1.0 + 0.08 * math.sin(wi * 1.7))
        syllables = 0.5 - 0.5 * np.cos(2 * np.pi * t / 0.18)
        tone = np.sin(2 * np.pi * pitch * t) + 0.35 * np.sin(2 * np.pi * pitch * 2 * t)
        parts.append((0.22 * syllables * tone).astype(np.float32))
        gap = np.zeros(int(SAMPLE_RATE * 0.07), dtype=np.float32)
        parts.append(gap)
        total_ms += ms + 70
    return np.concatenate(parts) if parts else np.zeros(0, dtype=np.float32)


class ToneTTS(TTSProvider):
    def available(self) -> bool:
        return True

    async def stream(self, text: str, voice: Voice) -> AsyncIterator[bytes]:
        audio = _phrase(text or "", voice.female)
        step = int(SAMPLE_RATE * CHUNK_MS / 1000)
        for i in range(0, len(audio), step):
            yield audio[i:i + step].astype("<f4").tobytes()

    def describe(self) -> str:
        return "testtone: синтетический звук стенда, не речь (NEGO_TTS=testtone)"
