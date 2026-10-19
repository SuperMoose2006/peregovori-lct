"""tape.py — запись партии для «Глубокого разбора». Только в памяти.

ЗАЧЕМ ЗАПИСЬ, ЕСЛИ ЕСТЬ ЖУРНАЛ ДВИЖКА. `engine.Session.log` знает, ЧТО было
сказано, и не знает КОГДА и КАК: времени у ходов там нет, голос и клавиатура
неразличимы (так задумано — ядро слепо к модальности, CLAUDE.md, правило 1
протокола). А разбор по схеме владельца сводит смысл, голос и мимику ПО ВРЕМЕНИ:
«на ходу 4, на словах „наверное“, пауза 1,2 с и нахмуренные брови». Время,
звук и кадры поэтому пишет край — сокет, — а не движок и не оркестратор.

ЧТО ПИШЕТСЯ:
  - момент принятия каждого хода и откуда он пришёл (`text` | `voice`);
  - момент, когда собеседник договорил ответ на ход;
  - речь игрока кусками от «заговорил» до «замолчал» (+ секунда до и хвост
    после) — PCM 16 кГц, как пришла с микрофона;
  - кадр камеры не чаще раза в `FRAME_EVERY_MS`.

ПРЕДЕЛЫ — НЕ ПЕРЕСТРАХОВКА. Запись живёт в процессе гейтвея, а у его юнита
`MemoryMax=2G` и рядом чужие службы. Поэтому три потолка: на кусок речи, на
речь за партию и на всю память записей разом (`GLOBAL_MAX_BYTES`). Упёрлась
запись в потолок — она НЕ молчит об этом: флаги `audio_truncated` и `starved`
доезжают до отчёта, и разбор говорит «часть записи не сохранилась».

ЖИВЁТ ЗДЕСЬ, А НЕ В `engine.Session` — по той же причине, что и лента камеры:
`score_session` принимает сессию движка, и запись голоса и лица физически не
может оказаться на её входе (инвариант 6). После готового отчёта звук и кадры
выбрасываются (`discard_media`): хранить лицо человека дольше, чем нужно для
ответа на его вопрос, незачем.
"""

from __future__ import annotations

import weakref
from collections import deque
from dataclasses import dataclass, field
from typing import Callable, Optional

import numpy as np

SAMPLE_RATE = 16_000

#: Сколько звука ДО «заговорил» берётся в кусок. Детектор речи срабатывает с
#: запозданием (у realtime-пути — после своего окна), и без предзаписи первое
#: слово, а с ним и «э-э» в начале реплики, отрезалось бы.
PREROLL_S = 1.0

#: Хвост после «замолчал»: детектор объявляет конец речи с запасом, но
#: последний слог иногда приходит следом.
TAIL_S = 0.3

#: Потолок одного куска. Реплика длиннее — это уже монолог, и агенту голоса
#: хватит её начала; дальше кусок закрывается.
MAX_CLIP_S = 30.0

#: Потолок речи за партию. Три минуты — 5,8 МБ PCM; честная партия укладывается
#: с запасом (десять реплик по десять секунд — сто секунд).
MAX_SPEECH_S = 180.0

#: Кадр в запись — не чаще. Клиент шлёт кадр раз в 2 с (`SEND_HEARTBEAT_MS`), а
#: изменившийся — чаще; мимике хватает двух секунд.
FRAME_EVERY_MS = 1_800

#: Потолок кадров. Дальше запись прореживается через один, а интервал
#: удваивается: длинная партия остаётся покрытой целиком, только реже.
MAX_FRAMES = 150

#: Кадр больше этого в запись не берётся: 448-пиксельный JPEG — около 26 тысяч
#: знаков base64, а предел сокета (700 тысяч) рассчитан на защиту, не на норму.
MAX_FRAME_CHARS = 160_000

#: Потолок памяти всех записей процесса, байт.
GLOBAL_MAX_BYTES = 192 * 1024 * 1024

_PREROLL = int(PREROLL_S * SAMPLE_RATE)
_TAIL = int(TAIL_S * SAMPLE_RATE)

#: Сколько байт держат все живые записи. Список, а не число, — чтобы финализатор
#: записи мог вычесть свою долю, не держа саму запись живой.
_TOTAL = [0]


def held_bytes() -> int:
    """Сколько памяти занимают записи прямо сейчас (для тестов и /health)."""
    return _TOTAL[0]


def _release(cell: list[int]) -> None:
    _TOTAL[0] -= cell[0]
    cell[0] = 0


@dataclass
class Clip:
    """Кусок речи игрока."""
    #: Ходов СДЕЛАНО к началу речи — то есть реплика относится к ходу `turn + 1`.
    turn: int
    #: Начало куска, мс от начала партии (с учётом предзаписи).
    at_ms: int
    pcm: bytearray = field(default_factory=bytearray)
    closed: bool = False

    @property
    def samples(self) -> int:
        return len(self.pcm) // 2

    @property
    def dur_ms(self) -> int:
        return self.samples * 1000 // SAMPLE_RATE

    def array(self) -> np.ndarray:
        return np.frombuffer(bytes(self.pcm), dtype="<i2")


@dataclass
class Frame:
    """Кадр камеры."""
    #: Ходов СДЕЛАНО к моменту кадра (как у ленты камеры, `note_vision`).
    turn: int
    at_ms: int
    jpeg_b64: str


class Tape:
    """Запись одной партии. Переживает обрыв и смену режима вместе с лентой камеры."""

    def __init__(self, clock: Callable[[], int]) -> None:
        self._clock = clock
        #: ход → мс от начала партии, когда ход принят (`turn.analysis`).
        self.turn_at: dict[int, int] = {}
        #: ход → откуда пришёл: `text` | `voice`. Нет записи — неизвестно.
        self.turn_source: dict[int, str] = {}
        #: ход → когда собеседник договорил ответ на него (`response.done`).
        self.reply_at: dict[int, int] = {}
        self.clips: list[Clip] = []
        self.frames: list[Frame] = []
        self.frame_every_ms = FRAME_EVERY_MS
        #: Кадров было больше потолка — запись прорежена.
        self.frames_thinned = False
        #: Речь за партию упёрлась в `MAX_SPEECH_S`.
        self.audio_truncated = False
        #: Общая память записей кончилась — эта запись дальше не пишет.
        self.starved = False
        #: Звук и кадры уже выброшены после готового отчёта.
        self.media_discarded = False
        #: Готовый отчёт: повторная просьба получает его, а не второй счёт.
        self.report: Optional[dict] = None

        self._preroll: deque[np.ndarray] = deque()
        self._preroll_n = 0
        self._open: Optional[Clip] = None
        self._tail_left = 0
        self._pending_source: Optional[str] = None
        self._speech = 0
        self._cell = [0]
        weakref.finalize(self, _release, self._cell)

    def rebind(self, clock: Callable[[], int]) -> None:
        """Новые часы — после возвращения в партию (`restore_from_resume`)."""
        self._clock = clock

    @property
    def empty(self) -> bool:
        return not (self.turn_at or self.clips or self.frames or self.report)

    @property
    def speech_ms(self) -> int:
        return self._speech * 1000 // SAMPLE_RATE

    # ------------------------------------------------------------ память

    def _grow(self, n: int) -> None:
        self._cell[0] += n
        _TOTAL[0] += n

    def _room(self, n: int) -> bool:
        if _TOTAL[0] + n > GLOBAL_MAX_BYTES:
            self.starved = True
            return False
        return True

    # ------------------------------------------------------------ ходы

    def mark_source(self, source: str) -> None:
        """Край сказал, откуда придёт ближайший ход: `text` или `voice`."""
        self._pending_source = source

    def observe(self, event: dict, turn: int) -> None:
        """Наблюдатель исходящих событий (`endpoint.py::_pump`). `turn` — ходов сделано."""
        kind = event.get("type")
        if kind == "turn.analysis":
            tid = int(event.get("turn_id") or 0)
            if tid > 0:
                # Перезапись, а не первая метка: ход, отменённый обрывом до
                # принятия, придёт заново, и время у него — второе.
                self.turn_at[tid] = self._clock()
                if self._pending_source:
                    self.turn_source[tid] = self._pending_source
            self._pending_source = None
        elif kind == "response.done":
            tid = int(event.get("turn_id") or 0)
            if tid > 0:
                self.reply_at[tid] = self._clock()
        elif kind == "user.speech.started":
            self.speech_started(turn)
        elif kind == "user.speech.stopped":
            self.speech_stopped()

    # ------------------------------------------------------------ речь

    def audio(self, pcm: np.ndarray) -> None:
        """Кусок звука с микрофона — как пришёл в сокет."""
        if pcm.size == 0 or self.media_discarded:
            return
        if self._open is not None:
            self._append(pcm)
            if self._open is not None and self._tail_left:
                self._tail_left -= pcm.size
                if self._tail_left <= 0:
                    self._close()
            return
        self._preroll.append(np.array(pcm, dtype=np.int16, copy=True))
        self._preroll_n += pcm.size
        while self._preroll and self._preroll_n - self._preroll[0].size >= _PREROLL:
            self._preroll_n -= self._preroll.popleft().size

    def speech_started(self, turn: int) -> None:
        if self.media_discarded:
            return
        if self._open is not None:
            # Заговорил снова, пока писался хвост, — та же реплика с паузой.
            self._tail_left = 0
            return
        if self._speech >= MAX_SPEECH_S * SAMPLE_RATE:
            self.audio_truncated = True
            return
        pre = (np.concatenate(list(self._preroll)) if self._preroll
               else np.zeros(0, dtype=np.int16))[-_PREROLL:]
        self._preroll.clear()
        self._preroll_n = 0
        clip = Clip(turn=int(turn),
                    at_ms=max(0, self._clock() - pre.size * 1000 // SAMPLE_RATE))
        self.clips.append(clip)
        self._open = clip
        self._append(pre)

    def speech_stopped(self) -> None:
        if self._open is not None:
            self._tail_left = _TAIL

    def _append(self, pcm: np.ndarray) -> None:
        clip = self._open
        if clip is None or pcm.size == 0:
            return
        room_clip = int(MAX_CLIP_S * SAMPLE_RATE) - clip.samples
        room_game = int(MAX_SPEECH_S * SAMPLE_RATE) - self._speech
        take = min(pcm.size, room_clip, room_game)
        if room_game < pcm.size:
            self.audio_truncated = True
        if take <= 0:
            self._close()
            return
        blob = np.asarray(pcm[:take], dtype="<i2").tobytes()
        if not self._room(len(blob)):
            self._close()
            return
        clip.pcm.extend(blob)
        self._grow(len(blob))
        self._speech += take
        if take < pcm.size:
            self._close()

    def _close(self) -> None:
        if self._open is not None:
            self._open.closed = True
        self._open = None
        self._tail_left = 0

    def close_open(self) -> None:
        """Закрыть недописанный кусок — перед разбором: партия кончилась."""
        self._close()

    # ------------------------------------------------------------ кадры

    def frame(self, jpeg_b64: str, turn: int) -> None:
        if not jpeg_b64 or len(jpeg_b64) > MAX_FRAME_CHARS or self.media_discarded:
            return
        now = self._clock()
        if self.frames and now - self.frames[-1].at_ms < self.frame_every_ms:
            return
        if not self._room(len(jpeg_b64)):
            return
        self.frames.append(Frame(turn=int(turn), at_ms=now, jpeg_b64=jpeg_b64))
        self._grow(len(jpeg_b64))
        if len(self.frames) > MAX_FRAMES:
            dropped = self.frames[1::2]
            self.frames = self.frames[::2]
            self._grow(-sum(len(f.jpeg_b64) for f in dropped))
            self.frame_every_ms *= 2
            self.frames_thinned = True

    # ------------------------------------------------------------ после отчёта

    def discard_media(self) -> None:
        """Выбросить звук и кадры: отчёт готов, держать лицо и голос незачем."""
        self._close()
        freed = sum(len(c.pcm) for c in self.clips) + sum(len(f.jpeg_b64) for f in self.frames)
        for clip in self.clips:
            clip.pcm = bytearray()
        self.frames = []
        self._preroll.clear()
        self._preroll_n = 0
        self._grow(-freed)
        self.media_discarded = True
