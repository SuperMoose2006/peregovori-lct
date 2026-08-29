#!/usr/bin/env python
"""vision_cost.py — сколько слой камеры стоит за одну партию, замером.

ЗАЧЕМ. В docs/latency.md стояла строка «обращений к модели на 200 кадров: 1», и
она была неправдой — не по злому умыслу, а потому что прибором служил тест
`test_a_flood_of_frames_does_not_become_a_flood_of_calls`. Тот предлагал двести
кадров подряд, НЕ СДВИГАЯ ЧАСЫ: восьмисекундный интервал не истекал ни разу, и
единственное обращение было первым и безусловным. Прибор мерил собственный
счётчик времени, а не политику сэмплинга. Ошибка, как всегда в этом файле,
льстила: настоящая цена оказалась в двадцать пять раз выше.

ЧТО МЕРЯЕТСЯ. Партия длиной N секунд при клиентском такте «кадр в секунду»
(`frontend/src/realtime/vendor/media-provider.ts::frameIntervalMs`), с
подставными часами и подставленной моделью: считается ПОЛИТИКА (сколько кадров
уходит наружу и сколько превращается в платные обращения), а не качество
распознавания. Сеть здесь не нужна и не используется.

Три посадки, потому что цена зависит от человека перед камерой:

  движение   доля изменившихся проб = 1.0 каждый кадр (худший случай);
  посадка    четверть кадров выше порога — обычный человек за столом;
  покой      кадр не меняется вовсе (комната без людей).

ЗАПУСК:

    cd services/gateway && .venv/bin/python tools/vision_cost.py
    .venv/bin/python tools/vision_cost.py --seconds 600
"""

from __future__ import annotations

import argparse
import asyncio
import os
import random
import sys
import types

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.perception import vision as V   # noqa: E402

#: 320-пиксельный JPEG качества 0.6 — примерно столько base64-знаков.
FRAME_B64 = 15_000

#: Такт клиента: media-provider снимает кадр раз в секунду.
CLIENT_FPS = 1.0


class _Clock:
    def __init__(self) -> None:
        self.t = 1000.0

    def monotonic(self) -> float:
        return self.t

    def perf_counter(self) -> float:
        return self.t


async def _measure(seconds: int, change, gated: bool) -> tuple[int, int]:
    """Вернуть (кадров ушло наружу, обращений к модели).

    `gated` — считать ли по-новому, когда браузер не отправляет кадр, который
    сам же признал неизменившимся (порог и такт зеркалят серверные).
    """
    clock = _Clock()
    V.time = types.SimpleNamespace(monotonic=clock.monotonic,
                                   perf_counter=clock.perf_counter)
    calls = 0
    sampler = V.VisionSampler("ru", lambda _e: None, lambda *_a, **_k: None)
    sampler.available = lambda: True                       # type: ignore[method-assign]

    async def look(_frame: str, turn: int = 0) -> None:
        nonlocal calls
        calls += 1

    sampler._look = look                                   # type: ignore[method-assign]

    sent = 0
    last_sent = -10_000.0
    for i in range(int(seconds * CLIENT_FPS)):
        clock.t += 1.0 / CLIENT_FPS
        ratio = change(i)
        if gated:
            first = last_sent < 0
            overdue = clock.t - last_sent >= V._MIN_INTERVAL_S
            if not first and not overdue and ratio < V._CHANGE_PIXELS:
                continue
            last_sent = clock.t
        sent += 1
        sampler.offer(["x" * FRAME_B64], change=ratio)
        await asyncio.sleep(0)
        if sampler._task:
            await sampler._task
    return sent, calls


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=int, default=300, help="длина партии, с")
    args = ap.parse_args()

    random.seed(7)
    seats = {
        "движение": lambda i: 1.0,
        "посадка": lambda i: (0.2 if i % 4 == 0 else 0.02),
        "покой": lambda i: 0.0,
    }
    print(f"партия {args.seconds} с · клиент снимает {CLIENT_FPS:g} кадр/с · "
          f"интервал взгляда {V._MIN_INTERVAL_S:g} с · порог {V._CHANGE_PIXELS}\n")
    head = (f"{'посадка':22s} {'кадров':>7s} {'МБ':>6s} {'обращений':>10s} "
            f"{'1 на N кадров':>14s}")
    print(head)
    print("-" * len(head))
    for label, change in seats.items():
        for gated, mark in ((False, "без гейта"), (True, "с гейтом")):
            sent, calls = asyncio.run(_measure(args.seconds, change, gated))
            ratio = f"{sent / calls:.1f}" if calls else "—"
            print(f"{label + ' · ' + mark:22s} {sent:7d} {sent * FRAME_B64 / 1e6:6.1f} "
                  f"{calls:10d} {ratio:>14s}")


if __name__ == "__main__":
    main()
