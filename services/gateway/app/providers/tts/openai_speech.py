"""openai_speech.py — синтез через OpenAI `/v1/audio/speech`.

ПОЧЕМУ ОН ВЫТЕСНИЛ EDGE НА ПЕРВОЕ МЕСТО. Не «потому что платный лучше», а по
замеру, и замер этот сначала обманул меня самого.

Прогон одной и той же фразы несколько раз подряд давал у edge ~570 мс до первого
звука — цифра, ради которой его и держали. Она ложная: эндпоинт Microsoft
**кэширует уже произнесённый текст**. Проверка на заведомо новых фразах (в текст
подставлялось случайное число) развела показания начисто:

    edge, текст впервые   1878 · 3331 · 2315 · 2320 мс   медиана 2318
    edge, тот же повторно  519 ·  615 мс
    openai, тот же новый  1606 · 1063 ·  597 ·  809 мс   медиана  936

В тренажёре КАЖДАЯ реплика оппонента новая — её только что сочинила модель.
Значит живой путь видит исключительно холодную ветку, и настоящая разница
не «570 против 936», а «2318 против 936»: вдвое с половиной.

ФОРМАТ СОШЁЛСЯ БЕЗ ПЕРЕХОДНИКОВ. `response_format: "pcm"` отдаёт 16-битный PCM
24 кГц моно — ровно нашу частоту (`OUTPUT_SAMPLE_RATE`). Нужна только замена
типа int16 → float32; ни передискретизации, ни декодирования mp3, из-за которого
edge тянет за собой PyAV.

EDGE ОСТАЁТСЯ. Он бесплатен и не требует ключа, поэтому служит запасным: нет
ключа или отказал запрос — говорит он. Молчащий оппонент недопустим.
"""

from __future__ import annotations

import logging
import os
from typing import AsyncIterator

import numpy as np

from app.providers import network_enabled
from app.providers.tts.base import OUTPUT_SAMPLE_RATE, TTSProvider, Voice

log = logging.getLogger(__name__)

SPEECH_URL = "https://api.openai.com/v1/audio/speech"

MODEL = os.getenv("NEGO_OPENAI_TTS_MODEL", "gpt-4o-mini-tts")

#: Голоса под пол персонажа. Русский у обоих ровный, без акцента; проверено на
#: слух и обратным распознаванием — РАЗОВЫМ прогоном, прибора у этого нет.
#:
#: Ссылка отсюда вела на docs/model-bakeoff.md как на доказательство. Она
#: неверна: тот документ голоса и распознавание МЕРИТЬ ОТКАЗЫВАЕТСЯ и говорит об
#: этом прямо — «здесь не мерится, см. „Что осталось непроверяемым“». Ссылаться
#: на документ, который сам называет это место непроверенным, значит выдавать
#: отсутствие замера за замер.
_VOICES = {True: os.getenv("NEGO_OPENAI_TTS_VOICE_F", "nova"),
           False: os.getenv("NEGO_OPENAI_TTS_VOICE_M", "onyx")}

#: `instructions` — то, чего у edge нет вовсе: тон задаётся словами. Держим его
#: НЕЙТРАЛЬНО-ДЕЛОВЫМ и не пытаемся играть эмоцию: эмоцию оппонента решает
#: движок, и подмешивать её ещё и голосом значило бы дать модели второй,
#: неучтённый канал влияния на то, что человек считывает за столом.
INSTRUCTIONS = os.getenv(
    "NEGO_OPENAI_TTS_STYLE",
    "Спокойный деловой тон. Говорите по-русски, уверенно, без спешки и без наигранности.",
)

#: Размер куска на чтении. 4 КБ при 24 кГц/16 бит — около 85 мс звука: меньше
#: даёт лишние пробуждения, больше добавляет задержку к первому звуку.
_READ_CHUNK = 4096


class OpenAISpeechTTS(TTSProvider):
    def __init__(self) -> None:
        self._key = os.getenv("OPENAI_REALTIME_KEY", "").strip()

    def available(self) -> bool:
        return bool(self._key) and network_enabled()

    def describe(self) -> str:
        return f"openai ({MODEL}, pcm 24 кГц, потоком)"

    def voice_name(self, voice: Voice) -> str:
        return _VOICES.get(voice.female, _VOICES[True])

    async def stream(self, text: str, voice: Voice) -> AsyncIterator[bytes]:
        """Чанки float32 PCM 24 кГц моно."""
        if not self.available() or not text.strip():
            return
        import httpx

        payload = {
            "model": MODEL,
            "input": text,
            "voice": self.voice_name(voice),
            "response_format": "pcm",
            "instructions": INSTRUCTIONS,
        }
        headers = {"Authorization": f"Bearer {self._key}", "Content-Type": "application/json"}
        timeout = httpx.Timeout(connect=10.0, read=60.0, write=10.0, pool=10.0)

        #: Нечётный байт на границе чанка сделал бы из int16 кашу, поэтому
        #: остаток переносим в следующий кусок.
        tail = b""
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", SPEECH_URL, json=payload, headers=headers) as resp:
                if resp.status_code >= 400:
                    body = (await resp.aread())[:200].decode("utf-8", "replace")
                    raise RuntimeError(f"openai tts {resp.status_code}: {body}")
                async for part in resp.aiter_bytes(_READ_CHUNK):
                    if not part:
                        continue
                    buf = tail + part
                    usable = len(buf) - (len(buf) % 2)
                    tail = buf[usable:]
                    if usable:
                        pcm16 = np.frombuffer(buf[:usable], dtype="<i2")
                        yield (pcm16.astype(np.float32) / 32768.0).tobytes()

        assert OUTPUT_SAMPLE_RATE == 24000, "OpenAI отдаёт 24 кГц; частоты обязаны совпадать"
