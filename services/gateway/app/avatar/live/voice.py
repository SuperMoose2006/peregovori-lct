"""voice.py — режим `text`: сервис видео говорит своим голосом, наш синтез в запасе.

ЧТО МЕНЯЕТСЯ ПРОТИВ РЕЖИМА `audio`. Там сервис рисует лицо под НАШ звук, и
голос, его задержка и защита остаются нашими. Здесь сервис получает текст
фразы и синтезирует речь сам — поэтому:

* голос — голос сервиса, а не `gpt-4o-mini-tts`; русский у него может быть
  хуже, и выбирается он на стороне сервиса (`NEGO_LIVE_VIDEO_AVATAR` /
  настройка лица), а не нашим `Voice(female=…)`;
* задержка до первого звука — синтез сервиса плюс его видео, последовательно;
  замер нашего синтеза (`make_tts`) к ней неприменим;
* сервис говорит в реальном времени, фразу за фразой, — поэтому потолок на
  фразу у синтеза здесь выше (`synthesis_timeout_s`), а сторож молчания — в
  адаптере (`TEXT_FIRST_AUDIO_MS`, `NEGO_LIVE_VIDEO_STALL_MS`);
* ОТКАЗ СЕРВИСА — ЭТО ОТКАЗ ГОЛОСА. Фраза, на которой сервис замолчал, звучит
  нашим синтезом заново целиком (короткий повтор честнее проглоченного
  предложения с ценой), и все следующие фразы партии — тоже нашим: голос не
  прыгает туда-обратно.

ЧТО НЕ МЕНЯЕТСЯ. В сервис уходит ровно тот текст, что ушёл бы в наш синтез:
он уже прошёл санитайзер по фразе (`negotiation.py::_stream_opponent`).
Отвергнутая фраза не звучит ни у нас, ни у сервиса. Реплику решает движок —
сервису запрещено отвечать самому (драйвер открывает сессию без его «мозга»).
"""

from __future__ import annotations

from typing import AsyncIterator, Optional

from app.providers.tts.base import TTSProvider, Voice

#: Сколько ждать связь к первой фразе партии, если сервис ещё подключается.
#: Дольше — первая реплика звучит нашим голосом, и дальше тоже (без прыжков).
LINK_WAIT_S = 5.0


class LiveVideoVoice(TTSProvider):
    """Синтез через сервис видео, с нашим синтезом в запасе."""

    #: Синтез отдаёт `generation_id` фразы: сервису он нужен, чтобы пометить
    #: кадры и звук своим поколением (`tts_manager.py`).
    wants_generation = True
    #: Сервис говорит в реальном времени, а фразы ждут очереди у одного лица:
    #: пятая фраза реплики начинает звучать через десяток секунд после
    #: постановки. Молчание ловит сторож адаптера, не этот потолок.
    synthesis_timeout_s = 120.0

    def __init__(self, avatar, backup: Optional[TTSProvider]) -> None:
        self._avatar = avatar
        self._backup = backup

    def available(self) -> bool:
        return True

    def describe(self) -> str:
        spare = self._backup.describe() if self._backup else "нет"
        return f"голос сервиса видео ({self._avatar.describe()}); запасной: {spare}"

    async def stream(self, text: str, voice: Voice, generation_id: str = "") -> AsyncIterator[bytes]:
        from app.avatar.live.adapter import _Utterance

        avatar = self._avatar
        if avatar.link in ("idle", "connecting") and not avatar._voice_failed:
            if not await avatar.wait_link(LINK_WAIT_S):
                avatar.fail("voice_not_connected")
        utt = avatar.open_utterance(generation_id, text) if generation_id else None
        if utt is not None:
            try:
                while True:
                    item = await utt.queue.get()
                    if item is _Utterance.CANCEL:
                        return
                    if item is _Utterance.FAILED:
                        break
                    if item.pcm:
                        yield item.pcm
                    if item.last:
                        return
            finally:
                avatar.close_utterance(utt)
        # Сервиса нет или он замолчал посреди фразы — фраза целиком нашим голосом.
        if self._backup is not None and self._backup.available():
            async for chunk in self._backup.stream(text, voice):
                yield chunk
            return
        raise RuntimeError("live video voice failed and no backup speech is configured")
