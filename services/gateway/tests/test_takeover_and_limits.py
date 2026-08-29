"""Кому принадлежит партия и сколько её можно есть с одного адреса.

ДВЕ ДЫРЫ, КОТОРЫЕ ЗАКРЫВАЕТ ЭТОТ ФАЙЛ.

1. **`resume` не спрашивал, занята ли партия.** Три сокета с одним и тем же
   идентификатором получали `session.created` с одним id и играли ОДНУ сессию
   движка: ходы считались внахлёст, `session.close` с любого вынимал партию
   из-под остальных, а обрыв любого ставил живой партии срок в пять минут.
   Отказывать вернувшемуся нельзя — ради него `resume` и написан, — поэтому
   партия ВЫТЕСНЯЕТСЯ: приходящий забирает её, прежний сокет закрывается
   отдельным кодом и слышит причину словами.

2. **Число партий и вызовов зрения на адрес не было ограничено ничем.** Сто
   двадцать сокетов держатся ровно, и каждый имеет право звать платную модель
   зрения раз в восемь секунд — пятнадцать вызовов в секунду с одной машины.
   Защита была одна, пароль, а пароль на показе знают все, кому его назвали.

ПОЧЕМУ ЗДЕСЬ СВОЙ СОКЕТ, А НЕ `TestClient`. Вытеснение — это разговор двух
сокетов ВНУТРИ ОДНОГО цикла событий: приходящий гасит задачи уходящего и пишет
в его сокет. `TestClient` даёт каждому соединению свой поток и свой цикл, и
такую партию через него просто не поставить. Пределы на хост, наоборот,
проверяются настоящим `TestClient`: там межсокетного разговора нет.

Офлайн: `conftest.py` держит `NEGO_AI=off`, платных вызовов здесь нет.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import WebSocketDisconnect
from fastapi.testclient import TestClient

from app.main import app
from app.realtime import limits
from app.realtime.endpoint import (WS_RATE_LIMITED, WS_TAKEN_OVER, _OWNERS,
                                   realtime_ws)
from app.session import store

client = TestClient(app)

PAYLOAD = {"scenarioId": "supplier", "lang": "ru", "gameMode": "practice"}


@pytest.fixture(autouse=True)
def _clean_limits():
    """Пределы процессные, а тесты — нет: каждый начинает с пустого счётчика."""
    limits.reset()
    yield
    limits.reset()


# ---------------------------------------------------------------------------
# Сокет, которым можно управлять из того же цикла событий
# ---------------------------------------------------------------------------

_DISCONNECT = object()


class _FakeWS:
    """Минимальный `WebSocket`: ровно то, чем пользуется `realtime_ws`."""

    def __init__(self, host: str = "203.0.113.7", mode: str = "text") -> None:
        self.client = SimpleNamespace(host=host)
        self.query_params = {"mode": mode}
        self.cookies: dict[str, str] = {}
        self.sent: list[dict] = []
        self.close_code: int | None = None
        self.close_reason: str = ""
        self._inbox: asyncio.Queue = asyncio.Queue()

    # -- то, что зовёт эндпоинт ---------------------------------------------

    async def accept(self) -> None:
        return None

    async def send_json(self, data: dict) -> None:
        if self.close_code is not None:
            raise RuntimeError("socket is closed")
        self.sent.append(data)

    async def receive_json(self) -> dict:
        message = await self._inbox.get()
        if message is _DISCONNECT:
            raise WebSocketDisconnect(1006)
        return message

    async def close(self, code: int = 1000, reason: str = "") -> None:
        if self.close_code is None:
            self.close_code, self.close_reason = code, reason

    # -- то, чем управляет тест ---------------------------------------------

    def feed(self, message: dict) -> None:
        self._inbox.put_nowait(message)

    def drop(self) -> None:
        """Оборвать связь так, как её обрывает метро: молча."""
        self._inbox.put_nowait(_DISCONNECT)

    def types(self) -> list[str]:
        return [m.get("type") for m in self.sent]

    def last(self, type_: str) -> dict | None:
        for message in reversed(self.sent):
            if message.get("type") == type_:
                return message
        return None


async def _until(predicate, timeout: float = 3.0):
    """Дождаться условия, не завися от числа шагов планировщика."""
    deadline = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < deadline:
        value = predicate()
        if value:
            return value
        await asyncio.sleep(0.005)
    raise AssertionError("не дождались")


async def _start(ws: _FakeWS, **payload) -> tuple[asyncio.Task, dict]:
    """Поднять партию на сокете и вернуть (задача, `session.created`)."""
    task = asyncio.create_task(realtime_ws(ws))
    await _until(lambda: "session.queue_done" in ws.types())
    ws.feed({"type": "session.init", "payload": {**PAYLOAD, **payload}})
    created = await _until(lambda: ws.last("session.created"))
    return task, created


async def _finish(task: asyncio.Task) -> None:
    """Дождаться, пока сокет доживёт свой `finally`. Исключения внутри — не
    предмет этих тестов: их проверяет обстрел в test_protocol_abuse.py."""
    try:
        await asyncio.wait_for(asyncio.shield(task), timeout=3.0)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# 1. Вытеснение
# ---------------------------------------------------------------------------

def test_the_second_resume_takes_the_table_and_the_first_is_told_why():
    """Два подряд `resume` — играет второй, первый знает, что произошло.

    Раньше играли ОБА: один id, одна сессия движка, два хода внахлёст.
    """
    async def scenario():
        first = _FakeWS()
        task1, created = await _start(first)
        sid = created["session_id"]

        second = _FakeWS()
        task2, again = await _start(second, resume=sid)
        assert again["session_id"] == sid, "вернулись не в ту партию"

        closed = first.last("session.closed")
        assert closed is not None, "вытесненный не услышал ни слова"
        assert closed["reason"] == "taken_over"
        assert closed["session_id"] == sid
        # Отдельный код, а не обрыв: по нему клиент отличает «партию забрали» от
        # «связь пропала» и НЕ идёт переподключаться поверх нового владельца.
        assert first.close_code == WS_TAKEN_OVER

        # Партия жива и принадлежит второму.
        assert store.get(sid) is not None
        assert _OWNERS.get(sid) is not None

        first.drop()
        await _finish(task1)
        second.feed({"type": "session.close"})
        await _finish(task2)

    asyncio.run(scenario())


def test_closing_an_evicted_socket_does_not_end_the_live_game():
    """`session.close` с вытесненного сокета не закрывает чужой стол.

    Прежде он делал `store.drop` — то есть вынимал партию из-под того, кто
    сейчас за ней сидит.
    """
    async def scenario():
        first = _FakeWS()
        task1, created = await _start(first)
        sid = created["session_id"]
        second = _FakeWS()
        task2, _ = await _start(second, resume=sid)

        first.feed({"type": "session.close", "reason": "user_stop"})
        await _finish(task1)

        assert store.get(sid) is not None, "закрытие вытесненного унесло живую партию"
        assert _OWNERS.get(sid) is not None, "живой владелец потерял запись"

        second.feed({"type": "session.close"})
        await _finish(task2)

    asyncio.run(scenario())


def test_a_dropped_evicted_socket_does_not_put_the_live_game_on_a_clock():
    """Обрыв вытесненного не ставит живой партии срок в пять минут.

    `store.release` — правильная реакция на обрыв СВОЕГО сокета и разрушительная
    на обрыв чужого: партия, за которой сидит человек, начинала истекать.
    """
    async def scenario():
        first = _FakeWS()
        task1, created = await _start(first)
        sid = created["session_id"]
        second = _FakeWS()
        task2, _ = await _start(second, resume=sid)

        first.drop()
        await _finish(task1)

        assert store.get(sid) is not None
        # Смотрим на срок напрямую: «сессия ещё есть» ничего не доказывает —
        # она и с проставленным сроком есть, просто пять минут.
        assert sid not in store._expiry, "живой партии поставили срок"

        second.feed({"type": "session.close"})
        await _finish(task2)

    asyncio.run(scenario())


def test_a_move_from_an_evicted_socket_is_never_counted():
    """Ход вдогонку с вытесненного сокета не доходит до движка.

    Это и есть та гонка, ради которой всё делалось: два сокета на одной сессии
    двигали `engine.turn` внахлёст, и один ход считался дважды.
    """
    async def scenario():
        first = _FakeWS()
        task1, created = await _start(first)
        sid = created["session_id"]
        second = _FakeWS()
        task2, _ = await _start(second, resume=sid)

        engine_session = store.get(sid)
        turn_before = engine_session.turn

        first.feed({"type": "input.append", "input": {"text": "Давайте по 900."}})
        first.feed({"type": "input.commit"})
        await _finish(task1)          # вытесненный уходит на первом же сообщении

        assert engine_session.turn == turn_before, "вытесненный посчитал ход"

        second.feed({"type": "session.close"})
        await _finish(task2)

    asyncio.run(scenario())


def test_only_the_last_of_three_sockets_plays():
    """Три `resume` подряд: играет третий, первые два закрыты по-честному."""
    async def scenario():
        first = _FakeWS()
        task1, created = await _start(first)
        sid = created["session_id"]
        second = _FakeWS()
        task2, _ = await _start(second, resume=sid)
        third = _FakeWS()
        task3, _ = await _start(third, resume=sid)

        for ws in (first, second):
            assert ws.close_code == WS_TAKEN_OVER
            assert (ws.last("session.closed") or {}).get("reason") == "taken_over"
        assert third.close_code is None

        # Третий действительно играет: ход считается движком.
        engine_session = store.get(sid)
        turn_before = engine_session.turn
        third.feed({"type": "input.append", "input": {"text": "Предлагаю 950 за партию."}})
        third.feed({"type": "input.commit"})
        await _until(lambda: engine_session.turn > turn_before)

        for ws, task in ((first, task1), (second, task2)):
            ws.drop()
            await _finish(task)
        third.feed({"type": "session.close"})
        await _finish(task3)

    asyncio.run(scenario())


def test_a_takeover_leaves_no_owner_behind():
    """После ухода последнего сокета запись о владельце не остаётся.

    Реестр владельцев смотрит в интернет так же, как и сокет: запись, которую
    некому убрать, — это утечка на каждую партию.
    """
    async def scenario():
        first = _FakeWS()
        task1, created = await _start(first)
        sid = created["session_id"]
        second = _FakeWS()
        task2, _ = await _start(second, resume=sid)

        first.drop()
        await _finish(task1)
        second.feed({"type": "session.close"})
        await _finish(task2)

        assert sid not in _OWNERS

    asyncio.run(scenario())


def test_a_takeover_carries_the_camera_tape_over():
    """Лента наблюдений переезжает к новому владельцу.

    `RealtimeSession` при возвращении строится ЗАНОВО: ходы и шкалы держит
    движок, а всё, что видела камера, живёт в сокете. Без переноса разбор после
    вытеснения показывал бы ленту с середины партии — а дыры в ленте не видно,
    в отличие от её отсутствия.
    """
    async def scenario():
        first = _FakeWS()
        task1, created = await _start(first, layers={"camera": True})
        sid = created["session_id"]
        _OWNERS[sid].session.note_vision("человек в кадре один", turn=0)

        second = _FakeWS()
        task2, _ = await _start(second, resume=sid)
        assert _OWNERS[sid].session.observations == ["человек в кадре один"]
        assert [n["text"] for n in _OWNERS[sid].session.vision_notes] == ["человек в кадре один"]

        first.drop()
        await _finish(task1)
        second.feed({"type": "session.close"})
        await _finish(task2)

    asyncio.run(scenario())


def test_an_honest_return_after_a_real_drop_still_works():
    """Вытеснение не сломало главный сценарий: вернуться после обрыва можно."""
    async def scenario():
        first = _FakeWS()
        task1, created = await _start(first)
        sid = created["session_id"]
        engine_session = store.get(sid)
        first.feed({"type": "input.append", "input": {"text": "Предлагаю 950 за партию."}})
        first.feed({"type": "input.commit"})
        await _until(lambda: engine_session.turn > 0)
        turn = engine_session.turn

        first.drop()
        await _finish(task1)

        second = _FakeWS()
        task2, again = await _start(second, resume=sid)
        assert again["session_id"] == sid
        assert again["resumed"] is True
        assert store.get(sid).turn == turn, "ходы после возвращения разошлись"

        second.feed({"type": "session.close"})
        await _finish(task2)

    asyncio.run(scenario())


# ---------------------------------------------------------------------------
# 2. Сколько партий с одного адреса
# ---------------------------------------------------------------------------

def test_too_many_sessions_from_one_host_are_refused_by_name(monkeypatch):
    """Отказ называет причину и закрывается своим кодом, а не молчит.

    Молчаливый разрыв клиент принял бы за обрыв сети и пошёл бы
    переподключаться — один отказ превратился бы в поток.
    """
    monkeypatch.setattr(limits, "MAX_SESSIONS_PER_HOST", 2)

    with client.websocket_connect("/v1/realtime") as one, \
            client.websocket_connect("/v1/realtime") as two:
        for ws in (one, two):
            assert ws.receive_json()["type"] == "session.queue_done"
            ws.send_json({"type": "session.init", "payload": PAYLOAD})
            assert ws.receive_json()["type"] == "session.created"

        with client.websocket_connect("/v1/realtime") as three:
            assert three.receive_json()["type"] == "session.queue_done"
            three.send_json({"type": "session.init", "payload": PAYLOAD})
            refusal = three.receive_json()
            assert refusal["type"] == "error"
            assert refusal["error"]["code"] == "too_many_sessions"
            assert refusal["error"]["type"] == "rate_limited"
            # Причина словами, а не кодом: на показе «ошибка» неотличима от
            # сломанного сервера.
            assert "адрес" in refusal["error"]["message"].lower()
            with pytest.raises(WebSocketDisconnect) as exc:
                three.receive_json()
            assert exc.value.code == WS_RATE_LIMITED


def test_the_refusal_speaks_the_language_of_the_session(monkeypatch):
    monkeypatch.setattr(limits, "MAX_SESSIONS_PER_HOST", 0)
    with client.websocket_connect("/v1/realtime") as ws:
        assert ws.receive_json()["type"] == "session.queue_done"
        ws.send_json({"type": "session.init", "payload": {**PAYLOAD, "lang": "en"}})
        refusal = ws.receive_json()
        assert refusal["error"]["code"] == "too_many_sessions"
        assert "address" in refusal["error"]["message"].lower()


def test_a_finished_game_gives_its_slot_back(monkeypatch):
    """Предел на ОДНОВРЕМЕННЫЕ партии, а не на партии за всё время."""
    monkeypatch.setattr(limits, "MAX_SESSIONS_PER_HOST", 1)
    for _ in range(3):
        with client.websocket_connect("/v1/realtime") as ws:
            assert ws.receive_json()["type"] == "session.queue_done"
            ws.send_json({"type": "session.init", "payload": PAYLOAD})
            assert ws.receive_json()["type"] == "session.created"
            ws.send_json({"type": "session.close"})
            assert ws.receive_json()["type"] == "session.closed"
    assert limits.live_sessions("testclient") == 0


def test_local_addresses_are_never_limited(monkeypatch):
    """127.0.0.1 — это OpenTalking, приборы и предпоказ. Их ограничить значит
    уронить показ ровно тогда, когда к нему готовятся."""
    monkeypatch.setattr(limits, "MAX_SESSIONS_PER_HOST", 1)
    leases = [limits.acquire_session("127.0.0.1") for _ in range(50)]
    assert all(lease is not None for lease in leases)
    assert limits.acquire_session("::1") is not None
    # А чужому адресу тот же предел отказывает со второй партии.
    assert limits.acquire_session("198.51.100.9") is not None
    assert limits.acquire_session("198.51.100.9") is None


def test_a_lease_is_released_exactly_once(monkeypatch):
    """Вытеснение отпускает аренду прежнего владельца, и его же `finally`
    попробует отпустить её второй раз. Двойное списание выдало бы адресу
    лишнее место — а счётчик ушёл бы в минус."""
    monkeypatch.setattr(limits, "MAX_SESSIONS_PER_HOST", 2)
    lease = limits.acquire_session("198.51.100.9")
    assert limits.live_sessions("198.51.100.9") == 1
    lease.release()
    lease.release()
    assert limits.live_sessions("198.51.100.9") == 0


def test_the_eviction_hands_the_slot_over_instead_of_stacking(monkeypatch):
    """Возвращение по `resume` не съедает место навсегда: вытесненный отдаёт
    своё сразу, не дожидаясь, пока его читатель заметит обрыв."""
    monkeypatch.setattr(limits, "MAX_SESSIONS_PER_HOST", 2)

    async def scenario():
        first = _FakeWS(host="198.51.100.9")
        task1, created = await _start(first)
        sid = created["session_id"]
        second = _FakeWS(host="198.51.100.9")
        task2, _ = await _start(second, resume=sid)
        # Два сокета, но партия одна — и мест занято одно.
        assert limits.live_sessions("198.51.100.9") == 1

        first.drop()
        await _finish(task1)
        second.feed({"type": "session.close"})
        await _finish(task2)
        assert limits.live_sessions("198.51.100.9") == 0

    asyncio.run(scenario())


# ---------------------------------------------------------------------------
# 3. Сколько взглядов зрения с одного адреса
# ---------------------------------------------------------------------------

def test_the_vision_bucket_holds_a_burst_and_then_refuses(monkeypatch):
    monkeypatch.setattr(limits, "VISION_BURST", 5.0)
    monkeypatch.setattr(limits, "VISION_CALLS_PER_S", 1.0)
    host = "198.51.100.9"
    assert all(limits.vision_allowed(host) for _ in range(5)), "залп не прошёл"
    assert not limits.vision_allowed(host), "ведро не кончилось"
    # Локальный адрес того же предела не видит.
    assert all(limits.vision_allowed("127.0.0.1") for _ in range(50))


def test_the_vision_bucket_refills_with_time(monkeypatch):
    """Ведро наполняется само: предел — это темп, а не квота на партию."""
    import time as _time
    monkeypatch.setattr(limits, "VISION_BURST", 2.0)
    monkeypatch.setattr(limits, "VISION_CALLS_PER_S", 1000.0)
    host = "198.51.100.9"
    assert limits.vision_allowed(host)
    assert limits.vision_allowed(host)
    assert not limits.vision_allowed(host)
    _time.sleep(0.01)                     # 1000/с → десяти миллисекунд хватает
    assert limits.vision_allowed(host)


def test_an_exhausted_budget_stops_the_paid_call(monkeypatch):
    """Слой камеры не звонит в модель, когда бюджет исчерпан — и это видно по
    счётчику вызовов, а не по обещанию."""
    from app.perception.vision import VisionSampler

    sampler = VisionSampler("ru", lambda _e: None, lambda *a, **k: None,
                            budget=lambda: False)
    monkeypatch.setattr(sampler, "available", lambda: True)
    sampler.offer(["кадр" * 100], change=1.0, turn=0)
    assert sampler.stats.calls_made == 0
    assert sampler._task is None, "взгляд ушёл в модель мимо бюджета"


def test_a_full_budget_lets_the_look_through(monkeypatch):
    """Обратная сторона предыдущего: без предела слой работает как работал."""
    from app.perception.vision import VisionSampler

    async def scenario():
        sampler = VisionSampler("ru", lambda _e: None, lambda *a, **k: None,
                                budget=lambda: True)
        monkeypatch.setattr(sampler, "available", lambda: True)
        seen: list[str] = []

        async def _look(frame, turn):
            seen.append(frame)

        monkeypatch.setattr(sampler, "_look", _look)
        sampler.offer(["кадр"], change=1.0, turn=0)
        await asyncio.sleep(0)
        await sampler.aclose()
        assert seen == ["кадр"]

    asyncio.run(scenario())


def test_the_session_says_out_loud_that_vision_paused_but_only_once():
    """Молчащий слой неотличим от сломанной камеры — сказать надо. Кадры идут
    потоком — сказать надо один раз."""
    from app.realtime.endpoint import _vision_budget
    from app.realtime.session import RealtimeSession
    from app import engine

    session = RealtimeSession(session_id="sess_test",
                              engine_session=engine.create_session("supplier", "ru"),
                              client_host="198.51.100.9")
    published: list[dict] = []
    session.bus.publish = published.append          # type: ignore[method-assign]

    limits.VISION_BURST, saved_burst = 1.0, limits.VISION_BURST
    limits.VISION_CALLS_PER_S, saved_rate = 0.0001, limits.VISION_CALLS_PER_S
    try:
        assert _vision_budget(session) is True       # единственный токен
        for _ in range(10):
            assert _vision_budget(session) is False
    finally:
        limits.VISION_BURST, limits.VISION_CALLS_PER_S = saved_burst, saved_rate

    assert len(published) == 1, "поток отказов вместо одного честного слова"
    assert published[0]["error"]["code"] == "vision_rate_limited"


def test_vision_check_over_http_shares_the_same_bucket(monkeypatch):
    """Двери две — `/api/vision/check` и сокет, — а платная модель одна.
    Два бюджета значили бы, что одну дверь закрыли, а вторую забыли."""
    from app.providers.openrouter import chat as orchat

    monkeypatch.setattr(orchat, "available", lambda: True)
    monkeypatch.setattr(limits, "VISION_BURST", 0.0)
    monkeypatch.setattr(limits, "VISION_CALLS_PER_S", 0.0001)
    response = client.post("/api/vision/check", json={"frame": "x" * 100, "lang": "ru"})
    assert response.status_code == 200
    # Та же форма, что у «нет ключа»: страница проверки оборудования уже умеет
    # говорить «недоступно» словами, а не рисовать выдуманный чек-лист.
    assert response.json() == {"available": False, "reason": "rate_limited"}
