"""bench_media_stand.py — синтетические замеры стенда видеоконтура.

ЭТО НЕ ЗАДЕРЖКИ БУДУЩЕЙ МОДЕЛИ. Звук — `ToneTTS` (синтетика, без сети),
кадры — `TestcardAvatar` (рисуются локально). Прибор меряет ТОЛЬКО наш
собственный путь: оркестратор → синтез → шина → аватар. Сетевой задержки
внешнего провайдера, его разброса и бюджета 50 мс под нагрузкой здесь нет и
быть не может.

ЧАСЫ И СОБЫТИЯ (все в одном процессе, `time.perf_counter`, мс):

  t0            — вызов `on_player_turn(text)`: ход принят сервером
                  (текст уже прошёл замок хода; сети до сервера здесь нет).
  first_text    — публикация первого `response.output.delta{kind:text}`.
  first_audio   — публикация первого `response.output.delta{kind:audio}`.
  first_frame   — публикация первого `avatar.frame`.
  frame_lag     — для каждого кадра: момент его публикации минус момент
                  публикации аудиочанка, в который попадает его `pts_ms`
                  (сдвиг кадра относительно своего звука НА ШИНЕ, т.е. до сети
                  и до джиттер-буфера браузера).
  after_cancel  — перебивание в середине речи: сколько событий погашенного
                  поколения ВЫШЛО из шины после `generation.cancelled`
                  (обязано быть 0) и сколько шина отбросила сама.

Браузерную сторону (что игрок видит и слышит) прибор не меряет: там кадр
выбирается по часам проигрывателя (`AvatarFrames.at(playbackTimeMs)`), и
показанный кадр отстаёт от звука не больше чем на шаг сетки кадров (80 мс);
кадр старше 250 мс не показывается вовсе. Это свойство построения, а не замер.

    cd services/gateway && .venv/bin/python -m tools.bench_media_stand --turns 10
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import statistics
import time

from app import engine
from app.avatar.testcard import SAMPLE_RATE, TestcardAvatar
from app.orchestrator.negotiation import NegotiationOrchestrator
from app.orchestrator.tts_manager import TTSTaskManager
from app.providers.tts.base import Voice
from app.providers.tts.testtone import ToneTTS
from app.realtime.session import Layers, RealtimeSession

LINES = [
    "Что для вас важнее всего в этой поставке, кроме цены?",
    "Давайте опираться на рыночные данные: медиана независимых прайсов — 87.",
    "Если мы подпишем контракт на год, вы сможете снизить цену?",
]


def _rig(name: str):
    session = RealtimeSession(name, engine.create_session("supplier", "ru"),
                              layers=Layers(voice=True, avatar=True))
    log: list[tuple[float, dict]] = []
    publish = session.bus.publish

    def stamped(event: dict) -> None:
        log.append((time.perf_counter(), event))
        publish(event)

    session.bus.publish = stamped  # type: ignore[method-assign]
    avatar = TestcardAvatar("supplier", stamped)
    tts = TTSTaskManager(ToneTTS(), stamped, Voice(id="", lang="ru", female=True))
    return session, NegotiationOrchestrator(session, tts=tts, avatar=avatar), avatar, tts, log


async def _quiet(avatar: TestcardAvatar, tts: TTSTaskManager, seconds: float = 8.0) -> None:
    deadline = time.perf_counter() + seconds
    while time.perf_counter() < deadline:
        await asyncio.sleep(0.02)
        if avatar._queue.empty() and not (tts._sender and not tts._sender.done()):
            await asyncio.sleep(0.05)
            return


async def one_turn(i: int) -> dict:
    session, orch, avatar, tts, log = _rig(f"bench-{i}")
    t0 = time.perf_counter()
    await orch.on_player_turn(LINES[i % len(LINES)])
    await _quiet(avatar, tts)
    ms = lambda t: (t - t0) * 1000.0  # noqa: E731

    def first(pred):
        return next((ms(t) for t, e in log if pred(e)), None)

    audio = [(t, e) for t, e in log if e["type"] == "response.output.delta" and e["kind"] == "audio"]
    frames = [(t, e) for t, e in log if e["type"] == "avatar.frame"]
    # Где кончается каждый аудиочанк на часах поколения.
    spans, acc = [], 0.0
    for t, e in audio:
        n = len(base64.b64decode(e["audio"])) // 4
        spans.append((acc, acc + n * 1000.0 / SAMPLE_RATE, t))
        acc += n * 1000.0 / SAMPLE_RATE
    lags = []
    for t, f in frames:
        chunk = next((pub for lo, hi, pub in spans if lo <= f["pts_ms"] < hi), None)
        if chunk is not None:
            lags.append((t - chunk) * 1000.0)
    await avatar.close()
    session.bus.close()
    return {
        "first_text": first(lambda e: e["type"] == "response.output.delta" and e["kind"] == "text"),
        "first_audio": first(lambda e: e["type"] == "response.output.delta" and e["kind"] == "audio"),
        "first_frame": first(lambda e: e["type"] == "avatar.frame"),
        "audio_ms": acc,
        "frames": len(frames),
        "frame_lag": lags,
    }


async def one_cancel(i: int) -> dict:
    session, orch, avatar, tts, log = _rig(f"bench-cut-{i}")
    await orch.on_player_turn(LINES[i % len(LINES)])
    for _ in range(200):
        await asyncio.sleep(0.005)
        if avatar.frames_sent >= 3:
            break
    cut = session.generation_id
    await orch.interrupt(reason="barge_in")
    await asyncio.sleep(0.3)
    session.bus.close()
    events = [e async for e in session.bus.drain()]
    idx = next(k for k, e in enumerate(events) if e["type"] == "generation.cancelled")
    leaked = [e for e in events[idx + 1:] if e.get("generation_id") == cut and e["type"] != "generation.cancelled"]
    await avatar.close()
    return {"leaked": len(leaked), "dropped_on_bus": session.bus._dropped}


def _p(values: list[float], q: float) -> float:
    s = sorted(values)
    return s[min(len(s) - 1, int(round(q * (len(s) - 1))))]


async def main(turns: int) -> dict:
    runs = [await one_turn(i) for i in range(turns)]
    cuts = [await one_cancel(i) for i in range(turns)]
    lags = [x for r in runs for x in r["frame_lag"]]
    pick = lambda k: [r[k] for r in runs if r[k] is not None]  # noqa: E731
    return {
        "turns": turns,
        "first_text_ms_median": statistics.median(pick("first_text")),
        "first_audio_ms_median": statistics.median(pick("first_audio")),
        "first_frame_ms_median": statistics.median(pick("first_frame")),
        "first_frame_minus_first_audio_ms_median": statistics.median(
            [r["first_frame"] - r["first_audio"] for r in runs if r["first_frame"] and r["first_audio"]]),
        "frame_lag_ms_median": statistics.median(lags) if lags else None,
        "frame_lag_ms_p95": _p(lags, 0.95) if lags else None,
        "frame_lag_ms_max": max(lags) if lags else None,
        "frames_total": sum(r["frames"] for r in runs),
        "audio_ms_total": round(sum(r["audio_ms"] for r in runs)),
        "leaked_after_cancel_total": sum(c["leaked"] for c in cuts),
        "dropped_on_bus_total": sum(c["dropped_on_bus"] for c in cuts),
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--turns", type=int, default=10)
    args = ap.parse_args()
    print(json.dumps(asyncio.run(main(args.turns)), ensure_ascii=False, indent=2))
