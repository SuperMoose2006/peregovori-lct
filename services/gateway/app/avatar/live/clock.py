"""clock.py — где сейчас звучит реплика у человека. Оценка на сервере.

ЗАЧЕМ СЕРВЕРУ ЧАСЫ КЛИЕНТА. Кадр сервиса полезен ровно в одном окне: не
раньше, чем зазвучит его звук, и не позже порога устаревшего кадра (клиент
`lib/avatarFrames.ts` показывает кадр по часам проигрывателя и выбрасывает кадр
старше порога; у живого лица порог присылает сервер — `config.stale_limit_ms`,
100 мс при 25 к/с). Сервер, не знающий, когда звук заиграет, не может решить ни
«этот кадр уже бесполезен — не гнать 30 КБ по сокету», ни «сервис молчит
дольше порога — вернуть портрет», ни «кадр пришёл слишком рано — придержать,
иначе очередь клиента в 30 кадров переполнится и потеряет свежие».

ОЦЕНКА ПОВТОРЯЕТ ПРОИГРЫВАТЕЛЬ, А НЕ ПРИДУМЫВАЕТ СВОЁ. Правило то же, что у
`realtime/vendor/audio-player.ts`: чанк, пришедший в тишину, ждёт джиттер-буфер
(`LEAD_MS` = 160 мс, `playbackDelayMs`) и стартует; чанк, пришедший во время
звучания, встаёт встык за предыдущим. Сетевую задержку оценка не знает — она
одинакова для звука и кадров, потому что они едут одним сокетом.

С живым лицом клиент не начинает звук раньше джиттер-буфера по
`response.done` (`AudioPlayer.holdOnEnd`), иначе звук шёл бы до 160 мс впереди
кадров. Приостановленный браузером звук начнётся позже оценки — это клиент
решает сам, отбрасывая по своим часам.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

#: Стартовый запас проигрывателя, мс (`AudioPlayer.playbackDelayMs` по умолчанию).
LEAD_MS = 160.0
#: Порог клиента по умолчанию — когда сервер своего не прислал (лицо без
#: живого видео). Живое лицо присылает свой (`config.stale_limit_ms`).
STALE_MS = 250.0


def frame_slot(pts_ms: float, fps: float) -> int:
    """Место кадра при прореживании до `fps`: кадр берётся, если его место
    больше места последнего взятого.

    Допуск — четверть шага. Метки времени сервиса дрожат вокруг шага (замер
    29.09 у LiveAvatar при 25 к/с: 40–44 мс), и прежнее строгое «не чаще шага»
    при родной частоте сервиса выбрасывало каждый кадр, пришедший на
    миллисекунду раньше: 13 % кадров, и губы на 80 мс вместо 40.
    """
    return math.floor(pts_ms * fps / 1000.0 + 0.25)


@dataclass
class _Segment:
    pts_start: float   # мс от первого сэмпла поколения
    pts_end: float
    wall_start: float  # секунды монотонных часов, когда начнёт звучать


class PlaybackClock:
    """Расписание звука одного поколения, каким его построит клиент."""

    def __init__(self, sample_rate: int = 24000, lead_ms: float = LEAD_MS) -> None:
        self.sample_rate = sample_rate
        self.lead_s = lead_ms / 1000.0
        self.generation = ""
        self._segments: list[_Segment] = []
        self._samples = 0

    def reset(self, generation_id: str) -> None:
        self.generation = generation_id
        self._segments = []
        self._samples = 0

    @property
    def published_ms(self) -> float:
        """Сколько звука поколения уже отдано клиенту."""
        return self._samples * 1000.0 / self.sample_rate

    def published(self, generation_id: str, samples: int, at: float) -> None:
        """Клиенту отдан кусок из `samples` сэмплов в момент `at` (сек)."""
        if samples <= 0:
            return
        if generation_id != self.generation:
            self.reset(generation_id)
        start_pts = self.published_ms
        self._samples += samples
        end_pts = self.published_ms
        prev_end = self.finished_at()
        if prev_end is not None and at <= prev_end:
            # Встык за звучащим или ждущим — один отрезок: меньше работы на
            # каждый кадр, а расписание то же.
            self._segments[-1].pts_end = end_pts
        else:
            # В тишину: джиттер-буфер проигрывателя.
            self._segments.append(_Segment(start_pts, end_pts, at + self.lead_s))

    def play_time(self, generation_id: str, pts_ms: float) -> Optional[float]:
        """Когда у клиента зазвучит миллисекунда `pts_ms`. None — её звук ещё не отдан."""
        if generation_id != self.generation:
            return None
        for seg in self._segments:
            if seg.pts_start <= pts_ms < seg.pts_end:
                return seg.wall_start + (pts_ms - seg.pts_start) / 1000.0
        return None

    def playing_pts(self, generation_id: str, now: float) -> Optional[float]:
        """Какая миллисекунда поколения звучит сейчас. None — ничего не звучит."""
        if generation_id != self.generation:
            return None
        for seg in self._segments:
            end = seg.wall_start + (seg.pts_end - seg.pts_start) / 1000.0
            if seg.wall_start <= now < end:
                return seg.pts_start + (now - seg.wall_start) * 1000.0
        return None

    def finished_at(self) -> Optional[float]:
        """Когда отзвучит всё отданное."""
        if not self._segments:
            return None
        seg = self._segments[-1]
        return seg.wall_start + (seg.pts_end - seg.pts_start) / 1000.0
