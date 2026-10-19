"""voice_pipeline.py — путь от микрофона до хода движка.

СБОРКА ИЗ ТРЁХ UPSTREAM-РЕАЛИЗАЦИЙ (см. docs/upstream-code-map.md):
  VAD                → TEN (`ten_vad_python`)      — «звук есть / звука нет»
  детектор конца хода → TEN (`ten_turn_detection`) — «мысль закончена?»
  распознавание       → провайдер (NEGO_ASR)      — «что именно сказано»

ПОЧЕМУ ТРИ СТУПЕНИ, А НЕ ОДНА. Наивный путь — «замолчал на секунду, значит
сходил» — ломается на первой же настоящей реплике переговорщика: человек
формулирует условие, делает паузу на середине, и оппонент влезает в разрыв.
VAD отвечает только за звук; законченность мысли — отдельный вопрос, и на него
отвечает языковая модель по расшифровке.

ПЕРЕБИВАНИЕ ЖИВЁТ ЗДЕСЬ. Как только VAD сказал «человек заговорил», мы гасим
оппонента — не дожидаясь ни расшифровки, ни детектора конца хода. Это и есть
измеряемая задержка barge-in: длина префикса VAD (120 мс) плюс сеть. Ждать
расшифровки было бы честнее по смыслу, но человек к тому моменту уже секунду
говорит поверх.

ЗАЩИТА ОТ САМОПОДСЛУШИВАНИЯ — ДВА РУБЕЖА. Пока оппонент говорит без наушников,
его голос попадает в микрофон, и VAD честно считает это речью.

  1. Основной рубеж — в браузере: `echoCancellation: true` в getUserMedia. Это
     настоящий AEC, он вычитает то, что играет в колонках, из того, что слышит
     микрофон. Всё остальное — надстройка над ним.
  2. Здесь — второй рубеж: пока оппонент звучит, планка выше. Мало «VAD сказал
     речь» — речь должна продержаться `_ECHO_GUARD_MS`. Короткий всплеск
     утечки не переживёт это окно, а настоящая реплика человека переживёт.

Приём из Open-LLM-VTuber (там это «interruption without headphones»),
реализация наша: их вариант завязан на их же конфиг громкости.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Optional

import numpy as np

from app.perception.turn_detect import TurnDecision, TurnDetector
from app.perception.vad import SAMPLE_RATE, SpeechDetector, VADConfig
from app.providers.asr.base import ASRProvider

#: Потолок накопления одного хода. Больше минуты — почти наверняка забытый
#: включённым микрофон, а не реплика.
_MAX_TURN_SECONDS = 60

#: Сколько речь должна продержаться, чтобы считаться перебиванием, ПОКА ОППОНЕНТ
#: ГОВОРИТ. Подобрано как компромисс: столько живёт утечка из колонок сквозь AEC,
#: и настолько же вырастает задержка barge-in в самом неудобном случае.
_ECHO_GUARD_MS = 180

#: Сколько звука ДО первой речи хода держать. VAD объявляет начало речи с
#: опозданием: решений нет, пока не наполнится его окно (`silence_duration_ms`
#: 1000 + `prefix_padding_ms` 120), — и на первой фразе после сброса начало
#: слова приходит с отставанием больше секунды. Первая редакция держала 400 мс
#: и на живом стенде съела «Знаете,» в начале реплики. Всё, что раньше
#: запаса, — тишина и эхо голоса оппонента между ходами, и в распознавание оно
#: не идёт (найдено после аудита 17.10).
_PREROLL_MS = 1500


@dataclass
class VoiceStats:
    """Замеры для docs/latency.md. Считаем на живом пути, а не в синтетике."""
    speech_start_ms: float = 0.0
    asr_ms: float = 0.0
    turn_detect_ms: float = 0.0
    barge_in_ms: float = 0.0
    segments: int = 0
    forced: int = 0
    extra: dict = field(default_factory=dict)


class VoicePipeline:
    """Кусок PCM внутрь — готовый ход наружу."""

    def __init__(self, asr: ASRProvider, lang: str,
                 on_turn: Callable[[str], Awaitable[None]],
                 on_interrupt: Callable[[], Awaitable[None]],
                 publish: Callable[[dict], None],
                 vad_config: Optional[VADConfig] = None) -> None:
        self._asr = asr
        self._lang = lang
        self._on_turn = on_turn
        self._on_interrupt = on_interrupt
        self._publish = publish

        self._vad = SpeechDetector(
            config=vad_config,
            on_speech_start=self._speech_started,
            on_speech_end=self._speech_ended,
        )
        self._turn_detector = TurnDetector()

        #: Накопленный звук текущего хода. Не очищается на паузах: реплика
        #: «Я готов… (пауза) …но при одном условии» — это ОДИН ход, и
        #: распознавать его надо целиком, иначе теряется связь половин.
        self._audio: list[np.ndarray] = []
        #: Была ли речь в звуке, который ещё не стал ходом. Пока нет — копится
        #: только запас `_PREROLL_MS`, а не тишина и эхо между ходами.
        self._heard = False
        #: Сколько кусков `_audio` покрыто последней расшифровкой и сколько
        #: сегментов речи было к тому моменту: ход уносит ровно свой снимок, а
        #: сказанное позже остаётся следующему ходу.
        self._snapshot = 0
        self._snapshot_segments = 0
        #: Конец речи пришёл, пока прежний снимок ещё в пути (распознавание,
        #: детектор, сам ход): досчитать его сразу после.
        self._settle_again = False
        self._closed = False
        self._transcript = ""
        self._opponent_speaking = False
        #: Момент, когда VAD увидел речь поверх говорящего оппонента. Пока он
        #: выставлен, перебивание ещё не объявлено — идёт окно проверки.
        self._guard_started_at: Optional[float] = None
        self._pending: Optional[asyncio.Task] = None
        #: Потолок ожидания. Пока он тикает, детектор уже сказал «не договорил»,
        #: а человек молчит. Досчитает — ход уедет сам.
        self._ceiling: Optional[asyncio.Task] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self.stats = VoiceStats()

    # --------------------------------------------------------------- состояние

    @property
    def available(self) -> bool:
        return self._asr.available() and self._vad.available

    def set_opponent_speaking(self, speaking: bool) -> None:
        """Оркестратор сообщает, звучит ли сейчас голос оппонента.

        Без этого вызова второй рубеж защиты мёртв, а перебивание — наоборот,
        работает всегда: `interrupt()` сам по себе безвреден, когда гасить
        нечего.
        """
        self._opponent_speaking = speaking
        if not speaking:
            self._guard_started_at = None

    def reset(self) -> None:
        self._cancel_ceiling()
        self._vad.reset()
        self._audio.clear()
        self._heard = False
        self._snapshot = 0
        self._transcript = ""

    # ------------------------------------------------------------------- вход

    def feed(self, pcm: np.ndarray) -> None:
        """Кусок с микрофона: int16 моно 16 кГц."""
        import time as _time

        self._loop = self._loop or asyncio.get_running_loop()
        self._audio.append(pcm)
        # Аварийный сброс, чтобы не копить бесконечно забытый микрофон.
        if sum(a.size for a in self._audio) > _MAX_TURN_SECONDS * SAMPLE_RATE:
            self._audio = self._audio[-(_MAX_TURN_SECONDS * SAMPLE_RATE // len(pcm) or 1):]
        self._vad.feed(pcm)
        if not self._heard:
            self._trim_to_preroll()

        # Окно проверки перебивания: речь поверх говорящего оппонента должна
        # продержаться, а не мигнуть. Проверяем здесь, а не по таймеру, потому
        # что решать надо по свежему состоянию VAD, а не по обещанию из прошлого.
        if self._guard_started_at is not None:
            if not self._vad.speaking:
                self._guard_started_at = None          # мигнуло — это была утечка
            elif (_time.perf_counter() - self._guard_started_at) * 1000 >= _ECHO_GUARD_MS:
                self._guard_started_at = None
                self.stats.barge_in_ms = _ECHO_GUARD_MS
                if self._loop:
                    self._loop.create_task(self._on_interrupt())

    # ------------------------------------------------------ колбэки от VAD

    def _speech_started(self) -> None:
        """Человек заговорил.

        Если оппонент молчит — гасим сразу (гасить нечего, вызов безвреден, но
        он же покрывает случай «оппонент только что начал»). Если оппонент
        звучит — открываем окно проверки: настоящее перебивание его переживёт,
        утечка из колонок сквозь AEC — нет.
        """
        import time as _time

        self.stats.segments += 1
        self._heard = True
        self._publish({"type": "user.speech.started"})
        # Человек продолжил — значит детектор был прав, и торопить его нечем.
        self._cancel_ceiling()
        if not self._loop:
            return
        if self._opponent_speaking:
            self._guard_started_at = _time.perf_counter()
        else:
            self._loop.create_task(self._on_interrupt())

    def _speech_ended(self) -> None:
        """Звук кончился. Теперь вопрос — закончена ли мысль."""
        self._publish({"type": "user.speech.stopped"})
        self._guard_started_at = None
        if not self._loop:
            return
        if self._pending is None or self._pending.done():
            self._pending = self._loop.create_task(self._settle_turn())
        else:
            # Прежний снимок ещё в пути — этот конец речи не выбрасывается, а
            # досчитывается следом (раньше он терялся молча).
            self._settle_again = True

    # ------------------------------------------------------------- снимки звука

    def _trim_to_preroll(self) -> None:
        """До первой речи хода — только запас перед словом."""
        keep = _PREROLL_MS * SAMPLE_RATE // 1000
        total = 0
        for i in range(len(self._audio) - 1, -1, -1):
            total += self._audio[i].size
            if total >= keep:
                if i > 0:
                    del self._audio[:i]
                return

    def _drop_snapshot(self, chunks: int, segments: int) -> None:
        """Ход унёс свой снимок: убрать ровно его куски, сказанное позже оставить.

        `_audio.clear()` здесь стирал и звук, пришедший, пока шли распознавание
        и детектор, — вторая реплика человека пропадала целиком."""
        del self._audio[:chunks]
        self._snapshot = 0
        self._heard = self._vad.speaking or self.stats.segments > segments
        if not self._heard:
            self._trim_to_preroll()

    # ------------------------------------------------------------ конец хода

    async def _settle_turn(self) -> None:
        """Расшифровать накопленное и решить: ход сделан или человек думает.

        Конец речи, пришедший пока этот снимок в пути, досчитывается сразу
        после — следующим снимком, со своим звуком."""
        try:
            await self._settle_snapshot()
        finally:
            if self._settle_again and not self._closed and self._loop:
                self._settle_again = False
                self._pending = self._loop.create_task(self._settle_turn())

    async def _settle_snapshot(self) -> None:
        import time

        if not self._audio:
            return
        chunks, segments = len(self._audio), self.stats.segments
        pcm = np.concatenate(self._audio[:chunks]).astype(np.float32) / 32768.0
        if pcm.size < SAMPLE_RATE // 4:  # короче 250 мс — кашель, не реплика
            return

        t0 = time.perf_counter()
        try:
            result = await self._asr.transcribe(pcm, SAMPLE_RATE, self._lang)
        except Exception:
            # Do not commit stale partial text or change the audio recipient.
            self._cancel_ceiling()
            self._drop_snapshot(chunks, segments)
            self._transcript = ""
            self._publish({"type": "error", "error": {
                "code": "asr_unavailable",
                "message": ("Распознавание недоступно. Ход не отправлен. Повторите или введите текст; другой ASR автоматически не подключается."
                            if self._lang == "ru" else
                            "Speech recognition unavailable. Turn not sent. Retry or type your message; ASR providers are never switched automatically."),
            }})
            return
        self.stats.asr_ms = (time.perf_counter() - t0) * 1000
        text = (result.text or "").strip()
        if not text:
            # Ни слова — шум или эхо: копить его к следующей реплике незачем.
            self._drop_snapshot(chunks, segments)
            return

        self._transcript = text
        self._snapshot, self._snapshot_segments = chunks, segments
        # ФИНАЛ — ТОЛЬКО КОГДА ХОД УХОДИТ. Финальная расшифровка публиковалась
        # ДО решения детектора конца реплики: «Я готов уступить…» признавалось
        # недоговорённым, а клиент уже ставил пузырь «вы» и занятость; договорив,
        # человек получал ВТОРОЙ финал всего буфера — два пузыря на один ход, и
        # первый так и оставался без чипов (найдено после аудита 17.10). Пока
        # детектор думает — это предпросмотр, как у realtime-конвейера.
        self._publish({"type": "user.transcript", "text": text, "final": False})

        t1 = time.perf_counter()
        decision = await self._turn_detector.eval(text, self._lang)
        self.stats.turn_detect_ms = (time.perf_counter() - t1) * 1000

        if decision is TurnDecision.FINISHED:
            self._cancel_ceiling()
            self._drop_snapshot(chunks, segments)
            self._transcript = ""
            self._publish({"type": "user.transcript", "text": text, "final": True})
            await self._on_turn(text)
            return

        # UNFINISHED / WAIT — продолжаем слушать. Накопленный звук НЕ чистим:
        # следующий кусок допишется к нему и распознается вместе.
        #
        # Но ждать бесконечно нельзя, и вот почему. `eval` возвращает
        # UNFINISHED не только когда человек правда не договорил, — это ещё и
        # ответ на ЛЮБУЮ свою беду: таймаут, отмену, исключение, отсутствие
        # ключа. То есть при сетевой заминке микрофон работает, расшифровка
        # на экране, а ход не уезжает — и снаружи это неотличимо от «нас
        # слушают». Ровно четвёртое состояние, которого по принципу 2 не
        # существует.
        #
        # Потолок отсчитывается от КОНЦА РЕЧИ, а не от начала хода: пять
        # секунд тишины после того, как человек замолчал, — однозначны, а
        # пять секунд от начала фразы обрезали бы длинную мысль на середине.
        self._arm_ceiling()

    def _cancel_ceiling(self) -> None:
        if self._ceiling and not self._ceiling.done():
            self._ceiling.cancel()
        self._ceiling = None

    def _arm_ceiling(self) -> None:
        """Взвести потолок ожидания, если он включён и ещё не тикает."""
        if not self._turn_detector.force_chat_enabled() or not self._loop:
            return
        if self._ceiling and not self._ceiling.done():
            return  # уже тикает с прошлого «не договорил» — перезапуск сдвинул
                    # бы срок каждым новым решением, и потолка снова бы не было
        self._ceiling = self._loop.create_task(self._ceiling_wait())

    async def _ceiling_wait(self) -> None:
        ms = self._turn_detector.config.force_threshold_ms
        try:
            await asyncio.sleep(ms / 1000)
        except asyncio.CancelledError:
            return
        # Проверяем ещё раз здесь, а не только при взводе: пока мы спали, ход
        # мог уехать обычным путём, и тогда `_transcript` уже пуст.
        if self._transcript.strip():
            # Потолок РЕШИЛ — дальше это уже отправка хода, а не ожидание. Задача
            # отцепляется от `_ceiling`, иначе новая речь (`_speech_started`) или
            # следующий снимок (`_cancel_ceiling`) отменяли её вместе с ходом,
            # ждущим очереди, — и первая мысль пропадала молча (живая проверка
            # стенда 19.10).
            self._ceiling = None
            await self.force_commit()

    async def close(self) -> None:
        """Партия кончилась. Та же поверхность, что у realtime-конвейера.

        Своего соединения наружу здесь нет — распознавание ходит запросом на
        каждый ход, — но незаконченная оценка конца реплики и её запрос к
        модели пережили бы сокет и досчитались бы в пустоту, уже за деньги.
        """
        self._closed = True
        self._turn_detector.cancel()
        self._cancel_ceiling()
        if self._pending and not self._pending.done():
            self._pending.cancel()
        self._pending = None

    async def force_commit(self) -> None:
        """Потолок ожидания (`force_threshold_ms` из TEN): ход считается сделанным.

        Нужен потому, что «подождать» — небесплатный дефолт: если детектор
        упорно отвечает `unfinished`, человек будет ждать ответа вечно.
        """
        text = self._transcript.strip()
        if not text:
            return
        self.stats.forced += 1
        self._cancel_ceiling()
        # Ход уносит то, что расшифровано, — сказанное после остаётся.
        self._drop_snapshot(self._snapshot or len(self._audio), self._snapshot_segments)
        self._transcript = ""
        self._publish({"type": "user.transcript", "text": text, "final": True})
        await self._on_turn(text)
