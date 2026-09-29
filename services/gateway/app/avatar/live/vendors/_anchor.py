"""_anchor.py — время кадра сервиса на шкале нашего звука (сервисы с WebRTC).

ЗАДАЧА. Сервисы на входе `audio` (Anam, Simli) возвращают поток WebRTC:
видео лица и НАШ ЖЕ звук, синхронный с видео (так они это заявляют). Метки
времени WebRTC у дорожек свои и с началом нашей реплики не связаны. Нам нужно
другое — `pts_ms` кадра от первого сэмпла поколения, которое слышит человек.

ЯКОРЬ — НАЧАЛО РЕЧИ. В нашем звуке мы знаем, на какой миллисекунде речь
впервые громче порога (`sent`). В возвращённом звуке ловим момент, когда он
впервые громче того же порога (`returned_audio`), — это та же миллисекунда
речи, уже у сервиса. Видео синхронно со своим звуком, поэтому кадр,
пришедший через Δ после этого момента, стоит на нашей шкале в
`наше_начало + Δ`. Δ считается по меткам времени видео от первого кадра после
начала речи (равномерно, без дрожания прихода), а привязка к началу — по
часам прихода.

ЧЕГО ЭТО НЕ ЗНАЕТ. Разных задержек джиттер-буферов звука и видео у нас на
сервере (aiortc выравнивания между дорожками не делает) — это постоянный
сдвиг, он снимается настройкой `NEGO_LIVE_VIDEO_PTS_OFFSET_MS` после первого
живого прогона (`tools/live_video_check.py` печатает, что видно). НЕ ПРОВЕРЕНО
на настоящем сервисе: ключа нет.
"""

from __future__ import annotations

from typing import Optional

import numpy as np

#: Порог «это речь», RMS на окне 10 мс. Речь синтеза — порядка 0.05–0.2;
#: тишина и шум кодека — меньше 0.005.
SPEECH_RMS = 0.02
WINDOW_MS = 10.0


def first_loud_ms(samples: np.ndarray, sample_rate: int) -> Optional[float]:
    """Миллисекунда внутри куска, где окно впервые громче порога. None — тихо."""
    if samples.size == 0:
        return None
    step = max(1, int(sample_rate * WINDOW_MS / 1000))
    usable = samples[: samples.size - samples.size % step] if samples.size >= step else samples
    if usable.size < step:
        rms = float(np.sqrt(np.mean(usable.astype(np.float64) ** 2)))
        return 0.0 if rms >= SPEECH_RMS else None
    windows = usable.reshape(-1, step).astype(np.float64)
    loud = np.flatnonzero(np.sqrt((windows ** 2).mean(axis=1)) >= SPEECH_RMS)
    if loud.size == 0:
        return None
    return float(loud[0]) * WINDOW_MS


class SpeechAnchor:
    """Одно поколение за раз: наш звук, возвращённый звук, кадры."""

    def __init__(self) -> None:
        self.generation = ""
        self._sent_ms = 0.0
        self._our_onset: Optional[float] = None
        self._onset_wall: Optional[float] = None
        self._video_ref: Optional[tuple[float, float]] = None   # (метка видео, приход)

    def reset(self, generation_id: str = "") -> None:
        self.generation = generation_id
        self._sent_ms = 0.0
        self._our_onset = None
        self._onset_wall = None
        self._video_ref = None

    def sent(self, generation_id: str, pcm_f32: bytes, sample_rate: int = 24000) -> None:
        """Мы отдали сервису кусок своего звука."""
        if generation_id != self.generation:
            self.reset(generation_id)
        samples = np.frombuffer(pcm_f32[: len(pcm_f32) - len(pcm_f32) % 4], dtype="<f4")
        if self._our_onset is None:
            at = first_loud_ms(samples, sample_rate)
            if at is not None:
                self._our_onset = self._sent_ms + at
        self._sent_ms += samples.size * 1000.0 / sample_rate

    def returned_audio(self, samples: np.ndarray, sample_rate: int, arrival: float) -> None:
        """Кусок звука, вернувшийся от сервиса (моно, float −1…1)."""
        if not self.generation or self._our_onset is None or self._onset_wall is not None:
            return
        at = first_loud_ms(samples, sample_rate)
        if at is None:
            return
        duration = samples.size / sample_rate
        # Кусок пришёл целиком к `arrival`; громкое место — на `at` от его начала.
        self._onset_wall = arrival - duration + at / 1000.0

    def video_pts(self, arrival: float, frame_time_s: Optional[float]) -> Optional[float]:
        """Место кадра на шкале нашего звука, мс. None — кадр не нашей речи."""
        if self._onset_wall is None or self._our_onset is None:
            return None
        if frame_time_s is None:
            delta = arrival - self._onset_wall
        else:
            if self._video_ref is None:
                if arrival < self._onset_wall:
                    return None
                self._video_ref = (frame_time_s, arrival)
            ref_time, ref_arrival = self._video_ref
            delta = (ref_arrival - self._onset_wall) + (frame_time_s - ref_time)
        pts = self._our_onset + delta * 1000.0
        if pts < 0 or pts > self._sent_ms + 500.0:
            return None
        return pts
