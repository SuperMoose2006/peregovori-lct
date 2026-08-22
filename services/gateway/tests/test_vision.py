"""Тесты зрения: бюджет обращений и главное — камера не трогает оценку.

Офлайн: `conftest.py` держит `NEGO_AI=off`, поэтому `available()` ложно и в сеть
никто не ходит. Проверяется политика сэмплинга, а не качество распознавания.
"""

from __future__ import annotations

import asyncio

import pytest

from app.perception.vision import VisionSampler
from app import engine


def _sampler(monkeypatch, *, online: bool = True, interval: float = 8.0):
    """Сэмплер с подменённым обращением к модели: считаем вызовы, не ходим в сеть."""
    calls: list[str] = []
    events: list[dict] = []
    notes: list[str] = []

    sampler = VisionSampler("ru", events.append, notes.append, min_interval_s=interval)
    monkeypatch.setattr(sampler, "available", lambda: online)

    async def fake_look(frame_b64: str) -> None:
        calls.append(frame_b64)
        sampler.stats.calls_made += 1
        notes.append("наблюдение")
        events.append({"type": "vision.observation", "text": "наблюдение",
                       "affects_score": False})

    monkeypatch.setattr(sampler, "_look", fake_look)
    return sampler, calls, events, notes


@pytest.mark.asyncio
async def test_first_frame_is_always_examined(monkeypatch):
    """Начало партии — единственный момент, когда смотреть надо безусловно."""
    sampler, calls, _events, _notes = _sampler(monkeypatch)
    sampler.offer(["кадр" * 100])
    await asyncio.sleep(0)
    if sampler._task:
        await sampler._task
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_a_flood_of_frames_does_not_become_a_flood_of_calls(monkeypatch):
    """Тридцать кадров в секунду в облако — это счёт и задержка, а не зоркость.

    Транспорт камеры и зрительный вывод — разные вещи: кадры могут идти
    непрерывно, обращения к модели — нет.
    """
    sampler, calls, _events, _notes = _sampler(monkeypatch, interval=8.0)
    for i in range(200):
        sampler.offer([f"кадр-{i}" + "x" * (i * 7)])   # размер всё время меняется
        await asyncio.sleep(0)
        if sampler._task:
            await sampler._task
    assert len(calls) == 1, f"за 200 кадров сделано {len(calls)} обращений вместо одного"


@pytest.mark.asyncio
async def test_offline_camera_never_calls_anything(monkeypatch):
    """Без облака слой зрения молчит — и говорит об этом честно, а не имитирует."""
    sampler, calls, events, _notes = _sampler(monkeypatch, online=False)
    for _ in range(10):
        sampler.offer(["кадр"])
    await asyncio.sleep(0)
    assert calls == [] and events == []


@pytest.mark.asyncio
async def test_observation_is_labelled_as_not_affecting_the_score(monkeypatch):
    """Плашка едет вместе с наблюдением, чтобы клиент не помнил правило сам."""
    sampler, _calls, events, _notes = _sampler(monkeypatch)
    sampler.offer(["кадр"])
    await asyncio.sleep(0)
    if sampler._task:
        await sampler._task
    assert events and events[0]["affects_score"] is False


def test_camera_observations_cannot_reach_score_session():
    """Сильнее договорённости: счёт просто не видит наблюдений.

    `score_session` принимает `engine.Session`, а наблюдения живут в
    `RealtimeSession`. Чтобы камера начала влиять на грейд, кто-то должен был бы
    сознательно протащить их через границу — а не забыть про фильтр.
    """
    import inspect
    source = inspect.getsource(engine.score_session)
    assert "observation" not in source
    assert "camera" not in source.lower()
