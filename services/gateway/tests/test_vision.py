"""Тесты зрения: бюджет обращений и главное — камера не трогает оценку.

Офлайн: `conftest.py` держит `NEGO_AI=off`, поэтому `available()` ложно и в сеть
никто не ходит. Проверяется политика сэмплинга, а не качество распознавания.
"""

from __future__ import annotations

import asyncio

import pytest

from app.perception import vision as vision_module
from app.perception.vision import VisionSampler
from app import engine


def _sampler(monkeypatch, *, online: bool = True, interval: float = 8.0):
    """Сэмплер с подменённым обращением к модели: считаем вызовы, не ходим в сеть."""
    calls: list[str] = []
    events: list[dict] = []
    notes: list[dict] = []

    def record(text: str = "", *, turn: int = 0, expressive=None) -> None:
        notes.append({"text": text, "turn": turn, "expressive": expressive})

    sampler = VisionSampler("ru", events.append, record, min_interval_s=interval)
    monkeypatch.setattr(sampler, "available", lambda: online)

    async def fake_look(frame_b64: str, turn: int = 0) -> None:
        calls.append(frame_b64)
        sampler.stats.calls_made += 1
        record("наблюдение", turn=turn)
        events.append({"type": "vision.observation", "text": "наблюдение",
                       "turn": turn, "affects_score": False})

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


class _Clock:
    """Часы партии, которые ИДУТ.

    ЗАЧЕМ. Здесь стоял замер «двести кадров — одно обращение», и это число даже
    попало в docs/latency.md. Оно ничего не измеряло: кадры предлагались подряд
    в НУЛЕВОЕ время, поэтому восьмисекундный интервал не истекал ни разу, и
    единственное обращение было первым и безусловным. Прибор мерил сам себя —
    ровно та ошибка, о которой предупреждает раздел «чему верить» в latency.md,
    и, как всегда, она льстила: настоящая цена оказалась в двадцать пять раз
    выше.

    В партии время идёт, и мерить надо с часами.
    """

    def __init__(self) -> None:
        self.t = 1000.0

    def monotonic(self) -> float:
        return self.t

    def perf_counter(self) -> float:
        return self.t


async def _play_frames(monkeypatch, seconds: int, change) -> tuple[int, int]:
    """Прогнать партию длиной `seconds` при клиентском такте 1 кадр/с.

    Возвращает (кадров предложено, обращений к модели).
    """
    clock = _Clock()
    monkeypatch.setattr(vision_module, "time", clock)
    sampler, calls, _e, _n = _sampler(monkeypatch, interval=8.0)
    for i in range(seconds):
        clock.t += 1.0
        sampler.offer(["x" * 15_000], change=change(i))
        await _settle(sampler)
    return seconds, len(calls)


@pytest.mark.asyncio
async def test_a_flood_of_frames_does_not_become_a_flood_of_calls(monkeypatch):
    """Тридцать кадров в секунду в облако — это счёт и задержка, а не зоркость.

    Транспорт камеры и зрительный вывод — разные вещи: кадры могут идти
    непрерывно, обращения к модели — нет. Проверяется ПОТОЛОК, а не красивое
    число: за пять минут при непрерывном движении в кадре взглядов не больше,
    чем помещается тактов по восемь секунд.
    """
    frames, calls = await _play_frames(monkeypatch, 300, lambda i: 1.0)
    assert frames == 300
    assert calls <= 300 // 8 + 1, f"за 5 минут {calls} обращений — такт не держится"
    assert calls >= 30, "при непрерывном движении слой обязан смотреть, а не спать"


@pytest.mark.asyncio
async def test_a_still_room_costs_one_look_for_the_whole_game(monkeypatch):
    """Неподвижная комната — один взгляд за партию, и он первый.

    Отдельного повода «долгая тишина» здесь нет намеренно: уход из кадра сам по
    себе меняет кадр. Таймер, смотрящий в пустую комнату, платил бы за это.
    """
    _frames, calls = await _play_frames(monkeypatch, 300, lambda i: 0.0)
    assert calls == 1


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


# --------------------------------------------- «кадр изменился» считает браузер

@pytest.mark.asyncio
async def test_browser_change_ratio_decides_instead_of_the_jpeg_size_proxy(monkeypatch):
    """Доля от браузера главнее прокси по размеру — и решает противоположно ему.

    Прокси «размер JPEG изменился» ловил смену освещения и крупное движение, но
    тихий уход из кадра не ловил вовсе: пустая комната жмётся не хуже человека в
    ней. Здесь кадр ОДНОГО И ТОГО ЖЕ размера — прокси сказал бы «ничего не
    произошло», — а браузер сообщает, что изменилась пятая часть проб.
    """
    sampler, calls, _e, _n = _sampler(monkeypatch, interval=0.0)
    same = "x" * 5000

    sampler.offer([same], change=0.5)          # первый кадр смотрится всегда
    await _settle(sampler)
    assert len(calls) == 1

    sampler.offer([same], change=0.0)          # браузер: не изменилось
    await _settle(sampler)
    assert len(calls) == 1, "посмотрели на кадр, о котором сказано «то же самое»"

    sampler.offer([same], change=0.2)          # браузер: изменилось
    await _settle(sampler)
    assert len(calls) == 2, "не посмотрели на изменившийся кадр того же размера"


@pytest.mark.asyncio
async def test_without_the_browser_signal_the_old_proxy_still_works(monkeypatch):
    """Старый клиент поля не пришлёт, и слой обязан работать и с ним."""
    sampler, calls, _e, _n = _sampler(monkeypatch, interval=0.0)

    sampler.offer(["x" * 1000])                # первый — всегда
    await _settle(sampler)
    sampler.offer(["x" * 1000])                # тот же размер → прокси молчит
    await _settle(sampler)
    assert len(calls) == 1

    sampler.offer(["x" * 5000])                # размер скакнул → смотрим
    await _settle(sampler)
    assert len(calls) == 2


async def _settle(sampler) -> None:
    await asyncio.sleep(0)
    if sampler._task:
        await sampler._task


# ------------------------------------------------------- ход, на котором видно

@pytest.mark.asyncio
async def test_the_frame_carries_the_turn_it_arrived_on(monkeypatch):
    """Наблюдение без хода — фраза без места в партии.

    Ход снимается там, где кадр пришёл (`offer`), а не там, где вернулась
    модель: взгляд длится около секунды, и за неё человек успевает отправить
    ход. Записанное «текущим» номером наблюдение датировалось бы чужим ходом.
    """
    sampler, _calls, events, notes = _sampler(monkeypatch, interval=0.0)

    sampler.offer(["кадр"], change=0.5, turn=3)
    await _settle(sampler)

    assert notes and notes[0]["turn"] == 3
    assert events and events[0]["turn"] == 3
