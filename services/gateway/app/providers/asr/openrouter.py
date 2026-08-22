"""openrouter.py — распознавание речи через OpenRouter.

У OpenRouter нет отдельной ручки `/audio/transcriptions`: аудио идёт частью
сообщения в chat-completions (`input_audio`), а моделью служит любая с `audio`
во входных модальностях. Живой запрос к `/api/v1/models` подтвердил, что такие
есть и они дёшевы — `google/gemini-3.7-flash` за $0.375 за миллион входных.

ЧЕСТНО О ЦЕНЕ ЭТОГО РЕШЕНИЯ. Так распознавание не даёт **частичных гипотез**:
ответ приходит целиком, когда модель дочитала весь кусок. Значит серый текст
«пока вы говорите» отсюда не появится, и задержка равна полному времени
запроса. Ровно поэтому распознавание — провайдер за интерфейсом: когда это
станет узким местом, сюда встанет потоковый движок (whisper.cpp локально или
Deepgram), и оркестратор не заметит подмены.

ПОЧЕМУ ВСЁ РАВНО ЭТО ДЕФОЛТ. Ход в переговорах — не диктовка: игрок
формулирует мысль, замолкает, и только тогда ход считается сделанным.
Детектор конца реплики (TEN) уже определил, что фраза закончена; распознавать
раньше нечего.
"""

from __future__ import annotations

import base64
import io
import wave

import numpy as np

from app.providers.asr.base import ASRProvider, Transcript
from app.providers.openrouter import chat as orchat
from app.providers.routing import model_for

_PROMPT = {
    "ru": ("Ты — точная система распознавания речи. Верни ДОСЛОВНУЮ расшифровку "
           "русской речи из аудио. Только текст расшифровки, без кавычек, без "
           "комментариев, без перевода. Если речи нет — верни пустую строку."),
    "en": ("You are an exact speech recognition system. Return the VERBATIM "
           "transcript of the speech in the audio. Transcript text only — no "
           "quotes, no commentary, no translation. If there is no speech, return "
           "an empty string."),
}


def pcm_to_wav_base64(pcm: np.ndarray, sample_rate: int) -> str:
    """float32 [-1,1] → base64 WAV PCM16.

    WAV, а не сырой PCM: модели нужен контейнер с частотой дискретизации в
    заголовке, иначе она угадывает и расшифровка едет по темпу.
    """
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes((np.clip(pcm, -1.0, 1.0) * 32767).astype(np.int16).tobytes())
    return base64.b64encode(buf.getvalue()).decode("ascii")


class OpenRouterASR(ASRProvider):
    def available(self) -> bool:
        return orchat.available()

    def describe(self) -> str:
        return f"openrouter ({model_for('asr')}, chat-completions audio input)"

    async def transcribe(self, pcm: np.ndarray, sample_rate: int, lang: str) -> Transcript:
        if not self.available() or pcm.size == 0:
            return Transcript(text="", final=True)

        audio_b64 = pcm_to_wav_base64(pcm, sample_rate)
        payload = {
            "model": model_for("asr"),
            "messages": [
                {"role": "system", "content": _PROMPT.get(lang, _PROMPT["ru"])},
                {"role": "user", "content": [
                    {"type": "text", "text": "Расшифруй." if lang == "ru" else "Transcribe."},
                    {"type": "input_audio", "input_audio": {"data": audio_b64, "format": "wav"}},
                ]},
            ],
            # Расшифровка не должна фантазировать: температура в ноль.
            "temperature": 0.0,
            "max_tokens": 400,
        }
        try:
            r = await orchat._get_client().post("/chat/completions", json=payload)
            r.raise_for_status()
            text = (r.json()["choices"][0]["message"]["content"] or "").strip()
        except Exception:
            # Не распознали — ход не пропадает: клиент оставляет игроку
            # возможность допечатать реплику руками.
            return Transcript(text="", final=True)

        # Модель иногда оборачивает расшифровку в кавычки, несмотря на промпт.
        text = text.strip().strip('"«»').strip()
        return Transcript(text=text, final=True)
