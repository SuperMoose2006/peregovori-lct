"""edge.py — синтез через edge-tts (голоса Microsoft Edge). Провайдер по умолчанию.

ПОЧЕМУ ИМЕННО ОН. В задании прямо сказано не жертвовать качественным русским
голосом ради «всё через OpenRouter». `ru-RU-SvetlanaNeural` и `ru-RU-DmitryNeural`
звучат как люди, стоят ноль и отдают звук чанками с первого же кадра.
OpenRouter-синтез остаётся вторым провайдером за тем же интерфейсом.

ИЗМЕРЕНО НА ЭТОЙ МАШИНЕ (см. docs/latency.md): первый чанк 0.6–3.4 с, разброс
зависит от сети до эндпоинта Microsoft. Разброс — не мелочь: именно из-за него
фразы обязаны синтезироваться **параллельно** с сохранением порядка выдачи
(`orchestrator/tts_manager.py`, порт Open-LLM-VTuber). Пока играется первая
фраза, вторая и третья уже синтезируются.

MP3 → PCM. edge-tts жёстко отдаёт `audio-24khz-48kbitrate-mono-mp3`
(`edge_tts/communicate.py:438`), выбора формата нет. Декодируем PyAV: он несёт
свои ffmpeg-библиотеки, системный ffmpeg в этом окружении отсутствует.
"""

from __future__ import annotations

import asyncio
import io
from typing import AsyncIterator

import numpy as np

from app.providers.tts.base import OUTPUT_SAMPLE_RATE, TTSProvider, Voice

#: Голоса под язык и пол. Имена — из каталога Microsoft; менять вместе с
#: проверкой на слух, а не по документации.
_VOICES = {
    ("ru", True): "ru-RU-SvetlanaNeural",
    ("ru", False): "ru-RU-DmitryNeural",
    ("en", True): "en-US-AriaNeural",
    ("en", False): "en-US-GuyNeural",
}

#: Сколько mp3-байт копим перед попыткой декодировать. Меньше ~2 КБ декодер
#: чаще всего не отдаёт ни одного кадра, и мы просто тратим вызовы впустую;
#: больше — добавляем задержку к первому звуку на ровном месте.
_DECODE_CHUNK = 2048


class EdgeTTS(TTSProvider):
    def available(self) -> bool:
        try:
            import edge_tts  # noqa: F401
        except ImportError:
            return False
        return True

    def describe(self) -> str:
        return "edge (Microsoft Edge neural voices, free, streaming)"

    def voice_name(self, voice: Voice) -> str:
        return _VOICES.get((voice.lang, voice.female), _VOICES[("ru", True)])

    async def stream(self, text: str, voice: Voice) -> AsyncIterator[bytes]:
        import edge_tts

        if not text.strip():
            return

        decoder = _Mp3Decoder()
        trimmer = _SilenceTrimmer()
        buf = bytearray()
        comm = edge_tts.Communicate(text, self.voice_name(voice))

        try:
            async for chunk in comm.stream():
                if chunk["type"] != "audio":
                    # WordBoundary — карта слов во времени. Пригодится для
                    # субтитров под аватаром; сейчас не используется.
                    continue
                buf.extend(chunk["data"])
                if len(buf) < _DECODE_CHUNK:
                    continue
                pcm = decoder.feed(bytes(buf))
                buf.clear()
                if pcm:
                    out = trimmer.feed(pcm)
                    if out:
                        yield out
        except asyncio.CancelledError:
            # Перебивание: закрываем поток тихо, наверх ничего не выбрасываем —
            # оркестратор уже знает, что поколение погашено.
            raise
        except Exception:
            # Сеть отвалилась на середине — отдаём, что успели декодировать.
            pass

        tail = decoder.feed(bytes(buf), flush=True)
        if tail:
            out = trimmer.feed(tail)
            if out:
                yield out
        rest = trimmer.flush()
        if rest:
            yield rest


class _Mp3Decoder:
    """Инкрементальный MP3 → float32 PCM 24 кГц моно.

    Работает потому, что edge-tts отдаёт CBR 48 kbps: кадры фиксированного
    размера, и накопленный кусок почти всегда содержит целое число кадров.
    PyAV достаточно скормить очередной кусок как отдельный контейнер.
    """

    def __init__(self) -> None:
        self._leftover = b""

    def feed(self, data: bytes, flush: bool = False) -> bytes:
        import av

        raw = self._leftover + data
        if not raw:
            return b""
        self._leftover = b""
        try:
            container = av.open(io.BytesIO(raw), format="mp3")
        except Exception:
            # Неполный кадр — подождём следующего куска.
            if not flush:
                self._leftover = raw
            return b""

        out: list[np.ndarray] = []
        try:
            resampler = av.AudioResampler(format="flt", layout="mono", rate=OUTPUT_SAMPLE_RATE)
            for frame in container.decode(audio=0):
                for res in resampler.resample(frame):
                    out.append(res.to_ndarray().reshape(-1))
        except Exception:
            pass
        finally:
            container.close()

        if not out:
            if not flush:
                self._leftover = raw
            return b""
        return np.concatenate(out).astype(np.float32).tobytes()


class _SilenceTrimmer:
    """Срезает тишину по краям фразы, не ломая потоковость.

    ЗАЧЕМ. Измерено на этом же провайдере: edge-tts добавляет ~0.25 с тишины
    перед фразой и ~0.9 с после неё, независимо от её длины. Пока фраза одна,
    это незаметно. Но мы режем реплику на фразы, чтобы синтезировать их
    параллельно — и тогда паддинг умножается на число фраз:

        «Знаете, если честно, для нас важнее тихий жилец.»
          одной фразой      → 4.37 с (речи 3.29 с)
          тремя фразами     → 7.10 с

    То есть оппонент начинает делать секундные паузы между придаточными. Это
    ровно то, по чему на слух отличают робота от человека, и это обесценило бы
    весь выигрыш от параллельного синтеза.

    КАК. Начало: пропускаем сэмплы, пока не встретим первый громкий. Конец:
    держим хвост в буфере и отдаём его только тогда, когда за ним пришёл ещё
    звук; то, что осталось тишиной на момент конца потока, не отдаём вовсе.
    Запас `_TAIL_KEEP_S` оставляем, чтобы не срезать затухание согласной.
    """

    #: Порог громкости. Речь у edge-tts уверенно выше 0.01 (замерено); берём
    #: половину, чтобы не съесть тихий вдох в начале слова.
    _THRESHOLD = 0.005
    #: Сколько звука оставить после последнего громкого сэмпла.
    _TAIL_KEEP_S = 0.08

    def __init__(self) -> None:
        self._started = False
        self._hold = np.empty(0, dtype=np.float32)
        self._keep = int(_SilenceTrimmer._TAIL_KEEP_S * OUTPUT_SAMPLE_RATE)

    def feed(self, pcm_bytes: bytes) -> bytes:
        samples = np.frombuffer(pcm_bytes, dtype=np.float32)
        if samples.size == 0:
            return b""

        if not self._started:
            loud = np.flatnonzero(np.abs(samples) > self._THRESHOLD)
            if loud.size == 0:
                return b""          # вся пачка — вступительная тишина
            self._started = True
            samples = samples[loud[0]:]

        self._hold = np.concatenate([self._hold, samples]) if self._hold.size else samples
        loud = np.flatnonzero(np.abs(self._hold) > self._THRESHOLD)
        if loud.size == 0:
            return b""              # пока одна тишина — придержим
        cut = min(self._hold.size, loud[-1] + 1 + self._keep)
        out, self._hold = self._hold[:cut], self._hold[cut:]
        return out.tobytes()

    def flush(self) -> bytes:
        """Конец фразы: оставшееся — это хвостовая тишина, её не отдаём."""
        self._hold = np.empty(0, dtype=np.float32)
        return b""
