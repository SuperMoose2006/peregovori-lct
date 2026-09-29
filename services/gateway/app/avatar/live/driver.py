"""driver.py — узкий интерфейс ОДНОГО сервиса живого видео собеседника.

ЗАЧЕМ ОТДЕЛЬНЫЙ СЛОЙ ПОД `AvatarProvider`. Интерфейс лица (`avatar/base.py`)
говорит на языке партии: состояние по реакции движка, PCM того поколения, что
слышит человек, перебивание. Внешний сервис говорит на своём: сессия, токен,
WebRTC, свои сообщения. Раньше между ними не было ничего, и каждый будущий
адаптер обязан был заново решать одни и те же вопросы — когда звук отдать
человеку, что делать с опоздавшим кадром, что считать отказом и как вернуть
рисованный портрет посреди реплики. Эти вопросы не зависят от сервиса, поэтому
живут ОДИН раз в `adapter.py`, а сервису остаётся шесть глаголов ниже.

ДРАЙВЕР НЕ ЗНАЕТ НИЧЕГО О ПАРТИИ. Ни движка, ни реакций, ни шины: только
«подключись, возьми звук или текст, отдавай кадры, замолчи, закройся». Имя
сервиса нигде выше этого файла не участвует в решениях — только в логах и в
`/api/health`.

ДВА ВИДА СЕРВИСОВ — ДВА ВХОДА (`DriverInfo.input`):

* `audio` — сервис берёт НАШ звук (тот же PCM, что слышит человек) и рисует
  под него лицо. Голос остаётся нашим: тот же синтез, та же защита санитайзером
  до озвучки, та же задержка до первого звука плюс удержание `av_delay_ms`.
* `text` — сервис берёт текст фразы и говорит САМ, своим синтезом. Тогда голос
  и его задержка — сервиса; наш синтез остаётся запасным (`voice.py`). В сервис
  уходит ровно тот текст, что ушёл бы в наш синтез: уже проверенный
  санитайзером, по фразе (`orchestrator/negotiation.py::_stream_opponent`).
  Режим «сервис сам придумывает ответ» запрещён тем же первым принципом, что и
  speech-to-speech у OpenAI: реплику решает движок, а не чужая модель.

ЕДИНСТВЕННОЕ ТРЕБОВАНИЕ К КАДРУ — ЕГО ВРЕМЯ. `VideoFrame.pts_ms` — место кадра
в звуке СВОЕГО поколения, в миллисекундах от первого сэмпла, который слышит
человек. В режиме `audio` это звук, поданный драйверу; в режиме `text` — звук,
который драйвер сам отдал. Как драйвер это время получает (номер кадра, метки
WebRTC, начало речи в возвращённом звуке) — его дело: у каждого сервиса своё.
Кадр с неверным временем здесь не отличить от верного, поэтому калибровка
вынесена в настройку `NEGO_LIVE_VIDEO_PTS_OFFSET_MS` (`config.py`).
"""

from __future__ import annotations

import abc
import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import AsyncIterator, Optional, Union

#: Формат звука внутри продукта: float32 little-endian, 24 кГц, моно
#: (`providers/tts/base.py::OUTPUT_SAMPLE_RATE`). Драйвер, которому нужен
#: другой, переводит сам (`audio.py`).
SAMPLE_RATE = 24000

#: Потолок очереди событий драйвера. Кадры идут десятками в секунду; если
#: потребитель отстал на столько, копить дальше незачем — поздний кадр всё
#: равно не будет показан.
EVENT_QUEUE_MAX = 512


@dataclass(frozen=True)
class DriverInfo:
    """Что драйвер умеет и сколько ему нужно времени. Честно, как `capabilities`."""

    #: Имя реализации. Только для логов и `/api/health`: ни одно решение выше
    #: драйвера от него не зависит.
    vendor: str
    #: `audio` — рисует лицо под наш звук; `text` — говорит сам своим голосом.
    input: str = "audio"
    #: Кадры синтетические (заглушка): интерфейс обязан подписать поток как
    #: тестовый, иначе заглушка выглядела бы продуктом.
    synthetic: bool = False
    #: На сколько придержать звук человеку, чтобы кадр успевал к своему звуку.
    #: Оценка по заявлениям сервиса, не замер; переопределяется
    #: `NEGO_LIVE_VIDEO_AV_DELAY_MS` после первого замера.
    av_delay_ms: int = 0


@dataclass(frozen=True)
class Persona:
    """Кого рисовать. Сервису нужен id лица; заглушке — наш портрет."""

    scenario_id: str
    lang: str = "ru"
    female: bool = True
    #: Портрет персонажа на диске (`frontend/public/avatars/<стол>/listening.webp`).
    portrait: Optional[Path] = None


@dataclass(frozen=True)
class VideoFrame:
    generation_id: str
    #: Место кадра в звуке своего поколения, мс от его первого сэмпла.
    pts_ms: float
    jpeg: bytes


@dataclass(frozen=True)
class IdleFrame:
    """Кадр лица между репликами (слушает, дышит, моргает). Без места в звуке:
    клиент показывает его, пока реплика не звучит, вместо рисованного портрета."""

    jpeg: bytes


@dataclass(frozen=True)
class VoiceChunk:
    """Режим `text`: кусок голоса сервиса для фразы `utterance`."""

    generation_id: str
    utterance: int
    #: float32 LE 24 кГц моно — тот же формат, что у нашего синтеза.
    pcm: bytes
    #: Фраза отзвучала целиком; после этого куска её звука больше не будет.
    last: bool = False


@dataclass(frozen=True)
class Closed:
    """Соединение с сервисом кончилось. После него событий нет."""

    reason: str
    #: Повторять подключение бессмысленно: ключ отвергнут, кончились минуты,
    #: лицо не найдено. Иначе — обрыв сети или истёкшая сессия, и попытка
    #: переподключиться имеет смысл.
    fatal: bool = False
    #: Закрытие запланировано самим драйвером (сессия подходит к пределу длины
    #: тарифа) — это смена сессии, а не отказ: в счёт отказов партии не идёт.
    planned: bool = False


DriverEvent = Union[VideoFrame, IdleFrame, VoiceChunk, Closed]


class DriverError(Exception):
    """Отказ сервиса словами, которые можно показать в логе и health."""

    def __init__(self, message: str, *, reason: str = "error", fatal: bool = False) -> None:
        super().__init__(message)
        self.reason = reason
        self.fatal = fatal


class LiveVideoDriver(abc.ABC):
    """Шесть глаголов одного сервиса. Всё остальное — `adapter.py`.

    Правила, которые адаптер от драйвера ждёт:

    * конструктор не ходит в сеть;
    * `connect()` возвращается, когда сервис готов принимать звук или текст,
      и бросает `DriverError` (с `fatal=True`, если повтор бессмыслен);
    * `send_audio`/`send_text` не блокируют дольше, чем нужно, чтобы отдать
      данные в сокет; медленная сеть — забота драйвера, а не синтеза;
    * `interrupt()` гасит и звук, и ещё не отрисованные кадры;
    * обрыв сообщается событием `Closed`, а не исключением из ниоткуда;
    * `close()` идемпотентна и укладывается в секунду.
    """

    info: DriverInfo

    @classmethod
    def from_env(cls, cfg, persona: Persona) -> "LiveVideoDriver":
        """Собрать драйвер из настроек (`config.LiveVideoConfig`). Без сети."""
        return cls(cfg, persona)

    def __init__(self) -> None:
        self._events: asyncio.Queue[DriverEvent] = asyncio.Queue(maxsize=EVENT_QUEUE_MAX)
        self._closed_sent = False
        #: Сколько событий выброшено переполнением — для прибора и health.
        self.dropped_events = 0

    # -- глаголы ---------------------------------------------------------------

    @abc.abstractmethod
    async def connect(self) -> None:
        """Открыть сессию у сервиса. Бросает `DriverError`."""

    async def send_audio(self, pcm: bytes, generation_id: str) -> None:
        """Режим `audio`: кусок нашего PCM (float32 LE 24 кГц моно)."""
        raise DriverError(f"{self.info.vendor}: звук на вход не принимается", reason="unsupported")

    async def send_text(self, text: str, generation_id: str, utterance: int) -> None:
        """Режим `text`: фраза, которую сервис скажет своим голосом."""
        raise DriverError(f"{self.info.vendor}: текст на вход не принимается", reason="unsupported")

    async def end_of_speech(self, generation_id: str) -> None:
        """Звука этого поколения больше не будет (`speak_end`, `endSequence`, `flush`)."""
        return None

    @abc.abstractmethod
    async def interrupt(self) -> None:
        """Замолчать и выбросить всё, что ещё не отрисовано."""

    @abc.abstractmethod
    async def close(self) -> None:
        """Закрыть сессию сервиса. Идемпотентно."""

    async def set_mood(self, state: str, reaction: Optional[str]) -> None:
        """Реакция, уже посчитанная движком. Необязательно: не каждый сервис
        умеет эмоции, а у кого умеет — это подсказка игре лица, не решение."""
        return None

    # -- события ---------------------------------------------------------------

    def emit(self, event: DriverEvent) -> None:
        """Положить событие для адаптера. Не блокирует и не бросает."""
        if self._closed_sent:
            return
        if isinstance(event, Closed):
            self._closed_sent = True
            # Закрытие не должно потеряться из-за переполнения: без него
            # адаптер ждал бы кадров от мёртвого соединения до сторожа.
            while self._events.full():
                self._events.get_nowait()
                self.dropped_events += 1
            self._events.put_nowait(event)
            return
        try:
            self._events.put_nowait(event)
        except asyncio.QueueFull:
            # Выбрасываем САМОЕ СТАРОЕ: из двух кадров полезнее свежий.
            self._events.get_nowait()
            self.dropped_events += 1
            self._events.put_nowait(event)

    async def events(self) -> AsyncIterator[DriverEvent]:
        """Поток событий до `Closed` включительно."""
        while True:
            event = await self._events.get()
            yield event
            if isinstance(event, Closed):
                return


# ------------------------------------------------- остановка сессии у сервиса

#: Запросы «остановить сессию у сервиса», которые переживают закрытие партии:
#: оно ограничено секундой, а запрос к API бывает дольше. Процесс, который
#: выходит, — прибор или шлюз при остановке — обязан их дождаться
#: (`finish_stops`): запрос, отменённый вместе с циклом событий, оставляет
#: сессию открытой, пока сервис не закроет её сам. Замер 29.09: LiveAvatar
#: закрыл две такие сессии через 194 и 210 с (`ZOMBIE_SESSION_REAP`), и эти
#: минуты списаны.
PENDING_STOPS: set[asyncio.Task] = set()


def keep_stop(task: asyncio.Task) -> None:
    PENDING_STOPS.add(task)
    task.add_done_callback(PENDING_STOPS.discard)


async def finish_stops(timeout: float = 5.0) -> int:
    """Дождаться запросов остановки этого цикла событий. Сколько не успело."""
    loop = asyncio.get_running_loop()
    pending = [t for t in PENDING_STOPS if not t.done() and t.get_loop() is loop]
    if pending:
        await asyncio.wait(pending, timeout=timeout)
    return sum(1 for t in pending if not t.done())
