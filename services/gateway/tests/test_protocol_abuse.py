"""Что делает `/v1/realtime` с сообщениями, которых наш клиент не шлёт.

ЗАЧЕМ ЭТОТ ФАЙЛ. Сокет — самый дорогой вход в систему: через него идут вызовы
платных моделей, и он смотрит в интернет. Остальные тесты проверяют, что партия
играется правильно; здесь проверяется, что она НЕ ломается от мусора, от
неверных типов, от чужого порядка событий и от того, кто шлёт быстрее, чем
отвечает модель.

Три правила, которые здесь защищаются:

1. **Кривое сообщение не уносит партию.** Оно получает `error` и живёт дальше.
   Раньше любой не-JSON, `null`, массив или `text: 12345` доходил до общего
   `except` и закрывал сокет — человек терял ход, шкалы и очередь.
2. **Наружу едет код ошибки, а не текст исключения.** `str(exc)` рассказывал
   про наши типы, поля и версию pydantic, а починить по нему нечего.
3. **Никакая последовательность не заставляет платить дважды.** Подсказка
   считается по одной за раз, ход — по одному, «своя сделка» без описания не
   доходит до модели вовсе.

Офлайн: `conftest.py` держит `NEGO_AI=off`, платных вызовов здесь нет ни одного;
там, где нужен «живой» ИИ, модель подменяется.
"""

from __future__ import annotations

import asyncio
import json
import os

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.realtime.session import MAX_FRAME_B64, MAX_TURN_CHARS

client = TestClient(app)

INIT = {"type": "session.init",
        "payload": {"scenarioId": "supplier", "lang": "ru", "gameMode": "practice"}}


def _open(ws, **payload):
    assert ws.receive_json()["type"] == "session.queue_done"
    ws.send_json({"type": "session.init", "payload": {**INIT["payload"], **payload}})
    return ws.receive_json()


def _alive(ws) -> bool:
    """Сокет жив, если после мусора он всё ещё ведёт партию."""
    ws.send_json({"type": "coach.request"})
    return ws.receive_json()["type"] == "turn.coach"


# ---------------------------------------------------------------------------
# 1. Мусор
# ---------------------------------------------------------------------------

GARBAGE = [
    ("не-JSON", "не json вовсе"),
    ("пустая строка", ""),
    ("null", "null"),
    ("массив", "[1,2,3]"),
    ("строка-JSON", '"привет"'),
    ("число", "42"),
    ("глубокая вложенность", "[" * 500 + "]" * 500),
]


@pytest.mark.parametrize("name,raw", GARBAGE, ids=[g[0] for g in GARBAGE])
def test_garbage_gets_an_error_and_the_session_survives(name, raw):
    """Мусор в сокете — норма, а не исключительная ситуация: он смотрит наружу."""
    with client.websocket_connect("/v1/realtime") as ws:
        assert _open(ws)["type"] == "session.created"
        ws.send_text(raw)
        event = ws.receive_json()
        assert event["type"] == "error"
        assert event["error"]["code"] in ("bad_json", "bad_message")
        assert _alive(ws), f"«{name}» унесло партию"


def test_binary_frame_does_not_kill_the_session():
    with client.websocket_connect("/v1/realtime") as ws:
        assert _open(ws)["type"] == "session.created"
        ws.send_bytes(b"\x00\x01\x02")
        assert ws.receive_json()["error"]["code"] == "bad_json"
        assert _alive(ws)


def test_missing_and_unknown_type_are_named_not_fatal():
    with client.websocket_connect("/v1/realtime") as ws:
        assert _open(ws)["type"] == "session.created"
        ws.send_json({})
        assert ws.receive_json()["error"]["code"] == "unknown_event"
        ws.send_json({"type": "совсем.чужое"})
        assert ws.receive_json()["error"]["code"] == "unknown_event"
        ws.send_json({"type": {"вложенный": "тип"}})
        assert ws.receive_json()["error"]["code"] == "unknown_event"
        assert _alive(ws)


# ---------------------------------------------------------------------------
# 2. Неверные типы полей
# ---------------------------------------------------------------------------

BAD_INIT = [
    ("scenarioId: число", {"scenarioId": 123}),
    ("lang: список", {"lang": ["ru"]}),
    ("layers: строка", {"layers": "да"}),
    ("layers.voice: строка", {"layers": {"voice": "ага"}}),
    ("gameMode: чужой", {"gameMode": "админ"}),
    ("reputation: слово", {"reputation": "много"}),
    ("daily: число", {"daily": 42}),
    ("resume: список", {"resume": ["a"]}),
]


@pytest.mark.parametrize("name,patch", BAD_INIT, ids=[b[0] for b in BAD_INIT])
def test_bad_init_field_is_refused_without_losing_the_socket(name, patch):
    with client.websocket_connect("/v1/realtime") as ws:
        assert ws.receive_json()["type"] == "session.queue_done"
        ws.send_json({"type": "session.init", "payload": {**INIT["payload"], **patch}})
        event = ws.receive_json()
        assert event["type"] == "error"
        assert event["error"]["code"] == "bad_payload"
        # Сокет цел: после отказа можно начать партию по-человечески.
        assert _open_after_error(ws)["type"] == "session.created"


def _open_after_error(ws):
    ws.send_json(INIT)
    return ws.receive_json()


@pytest.mark.parametrize("payload", [[1, 2], "строка", 42])
def test_payload_that_is_not_an_object(payload):
    with client.websocket_connect("/v1/realtime") as ws:
        assert ws.receive_json()["type"] == "session.queue_done"
        ws.send_json({"type": "session.init", "payload": payload})
        assert ws.receive_json()["error"]["code"] == "bad_payload"


BAD_INPUT = [
    ("text: число", {"text": 12345}),
    ("text: словарь", {"text": {"a": 1}}),
    ("video_frames: строка", {"video_frames": "строка"}),
    ("video_frames: числа", {"video_frames": [1, 2, 3]}),
    ("frame_change: слово", {"video_frames": ["QQ=="], "frame_change": "много"}),
    ("audio: список", {"audio": [1, 2]}),
]


@pytest.mark.parametrize("name,inp", BAD_INPUT, ids=[b[0] for b in BAD_INPUT])
def test_bad_input_field_is_refused_without_losing_the_socket(name, inp):
    """`video_frames: "строка"` — не безобидная опечатка.

    Строка итерируется посимвольно, и без проверки типа последняя «буква»
    уезжала в платную модель зрения как кадр.
    """
    with client.websocket_connect("/v1/realtime") as ws:
        assert _open(ws, layers={"camera": True})["type"] == "session.created"
        ws.send_json({"type": "input.append", "input": inp})
        event = ws.receive_json()
        assert event["type"] == "error"
        assert event["error"]["code"] == "bad_input"
        assert _alive(ws)


@pytest.mark.parametrize("inp", [[1], "строка", 7])
def test_input_that_is_not_an_object(inp):
    with client.websocket_connect("/v1/realtime") as ws:
        assert _open(ws)["type"] == "session.created"
        ws.send_json({"type": "input.append", "input": inp})
        assert ws.receive_json()["error"]["code"] == "bad_input"
        assert _alive(ws)


def test_oversized_frame_is_named_and_not_forwarded():
    """Кадр уезжает в модель ЦЕЛИКОМ, поэтому предел на него — про деньги."""
    with client.websocket_connect("/v1/realtime") as ws:
        assert _open(ws, layers={"camera": True})["type"] == "session.created"
        ws.send_json({"type": "input.append",
                      "input": {"video_frames": ["A" * (MAX_FRAME_B64 + 1)]}})
        assert ws.receive_json()["error"]["code"] == "frame_too_large"
        assert _alive(ws)


# ---------------------------------------------------------------------------
# 3. Порядок
# ---------------------------------------------------------------------------

def test_anything_before_init_is_refused_by_name():
    for message in ({"type": "input.commit"},
                    {"type": "response.cancel"},
                    {"type": "coach.request"},
                    {"type": "input.append", "input": {"text": "эй"}}):
        with client.websocket_connect("/v1/realtime") as ws:
            assert ws.receive_json()["type"] == "session.queue_done"
            ws.send_json(message)
            event = ws.receive_json()
            assert event["error"]["code"] == "not_initialized", message


def test_second_init_does_not_start_a_second_game():
    with client.websocket_connect("/v1/realtime") as ws:
        first = _open(ws)
        ws.send_json(INIT)
        assert ws.receive_json()["error"]["code"] == "already_initialized"
        # Партия — прежняя: второй init не подменил её и не завёл вторую.
        ws.send_json({"type": "session.close"})
        closed = ws.receive_json()
        assert closed["session_id"] == first["session_id"]


def test_cancel_without_a_live_generation_is_silence_not_an_error():
    """Гасить нечего — значит, гасить нечего. Это не ошибка клиента."""
    with client.websocket_connect("/v1/realtime") as ws:
        assert _open(ws)["type"] == "session.created"
        ws.send_json({"type": "response.cancel"})
        ws.send_json({"type": "response.cancel"})
        assert _alive(ws)


def test_explicit_close_ends_the_game_for_good():
    """Явное `session.close` — не «отпустить», а удалить.

    Партия, брошенная обрывом, ждёт возвращения пять минут; партия, закрытая
    человеком, не ждёт никого: вернуться в неё вторым `session.close` или
    `resume` нельзя, иначе закрытый стол можно было бы дожимать вечно.
    """
    from app.session import store

    with client.websocket_connect("/v1/realtime") as ws:
        created = _open(ws)
        ws.send_json({"type": "session.close"})
        assert ws.receive_json()["type"] == "session.closed"
    assert store.get(created["session_id"]) is None

    # Возврат по тому же идентификатору начинает НОВУЮ партию, а не воскрешает.
    with client.websocket_connect("/v1/realtime") as ws:
        again = _open(ws, resume=created["session_id"])
        assert again["session_id"] != created["session_id"]
        assert again["resumed"] is False


def test_close_reason_from_the_client_is_not_echoed_unbounded():
    with client.websocket_connect("/v1/realtime") as ws:
        _open(ws)
        ws.send_json({"type": "session.close", "reason": "х" * 10_000})
        closed = ws.receive_json()
        assert len(closed["reason"]) <= 64


def test_moves_after_the_table_closed_cost_nothing():
    """Партия окончена — ход не считается и в модель не идёт.

    Проверяется не текстом ошибки, а тем, что состояние не двинулось: движок
    отвергает ход при `status != active`, и это единственная защита от того,
    чтобы дожимать закрытый стол бесконечно.
    """
    from app import engine
    from app.session import store

    with client.websocket_connect("/v1/realtime") as ws:
        created = _open(ws)
        engine_session = store.get(created["session_id"])
        engine_session.state.status = "breakdown"      # стол закрыт
        turn_before = engine_session.turn

        ws.send_json({"type": "input.append", "input": {"text": "Ну давайте ещё раз."}})
        ws.send_json({"type": "input.commit"})
        assert _alive(ws)                              # ответом идёт только подсказка
        assert engine_session.turn == turn_before


# ---------------------------------------------------------------------------
# 4. Что утекает наружу
# ---------------------------------------------------------------------------

_NEVER_IN_ERRORS = ("Traceback", "/root/", "app/realtime", "pydantic.dev",
                    "object has no attribute", "line 1 column", "sk-", "OPENAI")


@pytest.mark.parametrize("raw", ["не json", "null", '{"type":"input.append","input":7}'])
def test_error_text_never_carries_our_internals(raw):
    """Текст исключения — это отладка, а не протокол.

    Клиенту нужен код: по `bad_json` он поймёт, что сломал, а по «'list' object
    has no attribute 'get'» — только то, что сервер на питоне.
    """
    with client.websocket_connect("/v1/realtime") as ws:
        assert _open(ws)["type"] == "session.created"
        ws.send_text(raw)
        blob = json.dumps(ws.receive_json(), ensure_ascii=False)
        for needle in _NEVER_IN_ERRORS:
            assert needle not in blob, f"наружу уехало «{needle}»: {blob}"


def test_bad_payload_names_the_field_but_not_the_value():
    with client.websocket_connect("/v1/realtime") as ws:
        assert ws.receive_json()["type"] == "session.queue_done"
        ws.send_json({"type": "session.init",
                      "payload": {**INIT["payload"], "lang": ["секрет"]}})
        message = ws.receive_json()["error"]["message"]
        assert "lang" in message                       # что чинить — сказано
        assert "секрет" not in message                 # эхо ввода — нет
        assert "pydantic" not in message


def test_session_created_carries_no_engine_secrets():
    """Скрытые интересы и красная линия оппонента — ИГРОВОЙ СЕКРЕТ.

    Утечка любого из них в протоколе ломает продукт: игра ровно в том, чтобы
    вскрыть их вопросами. `target`/`reservation` в сценарии — цели ИГРОКА, они
    и так написаны в брифинге.
    """
    from app import engine

    with client.websocket_connect("/v1/realtime") as ws:
        created = _open(ws)
        blob = json.dumps(created, ensure_ascii=False)

        scenario = engine.by_id("supplier")
        for interest in scenario.hidden_interests["ru"]:
            assert interest not in blob, "скрытый интерес уехал клиенту до вскрытия"
        # Красная линия оппонента и его стартовая раскладка живут в движке и
        # НЕ ИМЕЮТ права ехать по проводу: цена двигается ходами, а не тем, что
        # клиент прочитал floor и сразу предложил ровно его.
        floor = scenario.opponent_reservation
        assert str(floor) not in json.dumps(created["state"], ensure_ascii=False)
        assert "hidden" not in blob
        assert "opponent_reservation" not in blob and "opponent_open" not in blob
        assert created["state"]["interests_found"] == 0
        ws.send_json({"type": "session.close"})


def test_engine_state_during_play_shows_counts_not_secrets():
    from app import engine
    from app.session import store

    with client.websocket_connect("/v1/realtime") as ws:
        created = _open(ws)
        scenario = engine.by_id("supplier")
        ws.send_json({"type": "input.append",
                      "input": {"text": "Что для вас важно помимо цены?"}})
        ws.send_json({"type": "input.commit"})
        seen = []
        for _ in range(12):
            event = ws.receive_json()
            seen.append(event)
            if event["type"] == "response.done":
                break
        blob = json.dumps(seen, ensure_ascii=False)
        for interest in scenario.hidden_interests["ru"]:
            # Интерес попадает в протокол только вскрытым — а его никто не вскрывал.
            assert interest not in blob


# ---------------------------------------------------------------------------
# 5. Ресурсы и деньги
# ---------------------------------------------------------------------------

def test_accumulated_turn_is_capped_no_matter_how_many_appends():
    """`input.append` НАКАПЛИВАЕТ, и предел стоит на накопленном.

    Предел на кусок обходится тысячей маленьких кусков — именно так его и
    обходили бы: ход целиком уезжает в платные модели.
    """
    from app.session import store

    with client.websocket_connect("/v1/realtime") as ws:
        created = _open(ws)
        for _ in range(200):
            ws.send_json({"type": "input.append", "input": {"text": "я" * 500}})
        assert _alive(ws)                      # сокет пережил 100 000 знаков
        ws.send_json({"type": "input.commit"})
        for _ in range(12):
            event = ws.receive_json()
            if event["type"] == "turn.analysis":
                assert len(event["text"]) <= MAX_TURN_CHARS
                break
        else:
            raise AssertionError("ход не дошёл до движка")


def test_a_burst_of_coach_requests_buys_one_hint(monkeypatch):
    """Подсказка — платный вызов. Пять нажатий подряд не пять счетов."""
    from app.providers.openrouter import chat as orchat

    calls: list[int] = []

    async def slow_complete(*args, **kwargs):
        calls.append(1)
        await asyncio.sleep(0.25)
        return json.dumps({"why": "подсказка", "line": "реплика"})

    monkeypatch.setattr(orchat, "available", lambda: True)
    monkeypatch.setattr(orchat, "complete", slow_complete)

    with client.websocket_connect("/v1/realtime") as ws:
        assert _open(ws)["type"] == "session.created"
        for _ in range(5):
            ws.send_json({"type": "coach.request"})
        assert ws.receive_json()["type"] == "turn.coach"
        # Следующим идёт закрытие, а не четыре оплаченные подсказки.
        ws.send_json({"type": "session.close"})
        assert ws.receive_json()["type"] == "session.closed"
    assert len(calls) == 1, f"оплачено подсказок: {len(calls)}"


def test_custom_game_without_a_situation_never_reaches_the_model(monkeypatch):
    """Генерация сценария — самый дорогой вызов в продукте.

    `{"gameMode": "custom"}` без описания — это запрос ни о чём, оплаченный
    нами. Отказ выдаётся ДО модели.
    """
    import app.ai.scenario_gen as gen

    called: list[str] = []

    async def never(situation, lang="ru", attempts=2):
        called.append(situation)
        return None

    monkeypatch.setattr(gen, "generate_scenario", never)

    for situation in (None, "", "   ", "цена"):
        with client.websocket_connect("/v1/realtime") as ws:
            assert ws.receive_json()["type"] == "session.queue_done"
            ws.send_json({"type": "session.init",
                          "payload": {"gameMode": "custom", "lang": "ru",
                                      "situation": situation}})
            assert ws.receive_json()["error"]["code"] == "init_failed"
    assert called == [], "пустое описание всё-таки уехало в модель"


def test_a_flood_of_commits_does_not_start_a_flood_of_turns(monkeypatch):
    """Один ход за раз. Иначе `input.commit` в цикле — это счёт за N ходов.

    И дело не только в деньгах: `on_player_turn` двигает `engine.turn`, и два
    хода внахлёст посчитали бы один ход дважды.
    """
    from app.providers.openrouter import chat as orchat
    from app.session import store

    monkeypatch.setattr(orchat, "available", lambda: True)

    async def slow_stream(*args, **kwargs):
        for chunk in ("Хорошо, ", "давайте ", "обсудим."):
            await asyncio.sleep(0.05)
            yield chunk

    monkeypatch.setattr(orchat, "stream", slow_stream)

    with client.websocket_connect("/v1/realtime") as ws:
        created = _open(ws)
        engine_session = store.get(created["session_id"])
        for i in range(8):
            ws.send_json({"type": "input.append", "input": {"text": f"Предлагаю {80 + i}."}})
            ws.send_json({"type": "input.commit"})
        busy = 0
        dones = 0
        for _ in range(80):
            event = ws.receive_json()
            if event["type"] == "error" and event["error"]["code"] == "busy":
                busy += 1
            if event["type"] == "response.done":
                dones += 1
                if dones >= 2:
                    break
        assert busy >= 1, "сокет принял к оплате все восемь ходов разом"
        assert engine_session.turn <= 3


# ---------------------------------------------------------------------------
# 6. Гонки: перебивание доходит, пока оппонент ещё говорит
# ---------------------------------------------------------------------------

def test_cancel_arrives_while_the_opponent_is_still_streaming(monkeypatch):
    """Правило протокола 2 и обещание из шапки endpoint.py.

    «Читатель никогда не блокируется на ИИ, поэтому `response.cancel` доходит
    мгновенно» — обещание было неверным: ход считался прямо в цикле чтения, и
    кнопка перебивания разбиралась уже ПОСЛЕ `response.done`. Здесь стрим
    заведомо длинный, и `generation.cancelled` обязан прийти ВМЕСТО итога, а не
    после него.
    """
    from app.providers.openrouter import chat as orchat

    monkeypatch.setattr(orchat, "available", lambda: True)

    async def long_stream(*args, **kwargs):
        for i in range(40):
            await asyncio.sleep(0.05)
            yield f"слово{i} "

    monkeypatch.setattr(orchat, "stream", long_stream)

    with client.websocket_connect("/v1/realtime") as ws:
        assert _open(ws)["type"] == "session.created"
        ws.send_json({"type": "input.append",
                      "input": {"text": "Что для вас важно помимо цены?"}})
        ws.send_json({"type": "input.commit"})
        # Ждём первую дельту — оппонент точно заговорил.
        for _ in range(20):
            event = ws.receive_json()
            if event["type"] == "response.output.delta":
                break
        else:
            raise AssertionError("оппонент так и не заговорил")

        ws.send_json({"type": "response.cancel"})
        for _ in range(60):
            event = ws.receive_json()
            if event["type"] == "generation.cancelled":
                assert event["reason"] == "client_cancel"
                break
            assert event["type"] != "response.done", \
                "перебивание разобрано только после того, как реплика дописалась"
        else:
            raise AssertionError("перебивание не дошло")


def test_cancelled_tail_never_reaches_the_socket(monkeypatch):
    """Хвост погашенного поколения отсеивается НА ВЫХОДЕ.

    Между проверкой и записью проходит время: корутина синтеза просыпается уже
    после перебивания и успевает положить чанк. Здесь стрим продолжает сыпать
    дельты после отмены — ни одна не имеет права доехать.
    """
    from app.providers.openrouter import chat as orchat

    monkeypatch.setattr(orchat, "available", lambda: True)

    async def long_stream(*args, **kwargs):
        for i in range(40):
            await asyncio.sleep(0.05)
            yield f"слово{i} "

    monkeypatch.setattr(orchat, "stream", long_stream)

    with client.websocket_connect("/v1/realtime") as ws:
        assert _open(ws)["type"] == "session.created"
        ws.send_json({"type": "input.append", "input": {"text": "Что для вас важно?"}})
        ws.send_json({"type": "input.commit"})
        cancelled_id = None
        for _ in range(20):
            event = ws.receive_json()
            if event["type"] == "response.output.delta":
                cancelled_id = event["generation_id"]
                break
        assert cancelled_id

        ws.send_json({"type": "response.cancel"})
        seen_after_cancel = []
        for _ in range(60):
            event = ws.receive_json()
            seen_after_cancel.append(event)
            if event["type"] == "generation.cancelled":
                break
        # После уведомления об отмене — новый ход, и в нём ни одной дельты
        # погашенного поколения.
        ws.send_json({"type": "coach.request"})
        assert ws.receive_json()["type"] == "turn.coach"
        tail = [e for e in seen_after_cancel
                if e["type"] == "response.output.delta"
                and e.get("generation_id") == cancelled_id]
        # Дельты, опубликованные ДО того, как отмена доехала до шины, законны;
        # событие `generation.cancelled` — последнее слово о поколении.
        assert seen_after_cancel[-1]["type"] == "generation.cancelled"
        assert all(e["type"] != "response.done" for e in seen_after_cancel), \
            "погашенное поколение всё-таки дописалось клиенту"


# ---------------------------------------------------------------------------
# 7. Не сокет, но та же дверь: статика
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("path", [
    "/../../services/gateway/.env",
    "/..%2f..%2fservices%2fgateway%2f.env",
    "/../../../../etc/passwd",
    "/../../CLAUDE.md",
])
def test_spa_fallback_never_serves_files_outside_dist(path):
    """Раздача SPA отдавала наружу ЛЮБОЙ файл на диске — включая `.env` с ключом.

    `os.path.join(dist, "../../services/gateway/.env")` — существующий файл, и
    `isfile` на него отвечает «да». Замок на HTTP спрашивает пароль, но пароль
    на показе знают все, кому его назвали, а ключ OpenRouter — не их.
    """
    from app.main import _DIST

    if not os.path.isdir(_DIST):
        pytest.skip("frontend/dist не собран — маршрута нет")
    response = client.get(path)
    assert response.status_code == 200
    body = response.text
    assert "OPENAI_API_KEY" not in body and "root:x:0:0" not in body
    assert body.lstrip().lower().startswith("<!doctype html>")


# ---------------------------------------------------------------------------
# 8. Голосовой ход: звук приходит с улицы тем же сокетом
# ---------------------------------------------------------------------------

class _FakeVoice:
    """Микрофонный конвейер без сети: считает, что ему скормили."""

    available = True

    def __init__(self) -> None:
        self.samples: list[int] = []
        self.commits = 0

    def feed(self, pcm) -> None:
        self.samples.append(len(pcm))

    async def force_commit(self) -> None:
        self.commits += 1

    def set_opponent_speaking(self, speaking: bool) -> None:
        pass


@pytest.fixture()
def fake_voice(monkeypatch):
    """Поднять сессию с микрофоном, не поднимая ни ASR, ни синтез."""
    import app.realtime.endpoint as endpoint

    holder: list[_FakeVoice] = []
    real_wire = endpoint._wire

    def wire(session, **kwargs):
        orchestrator, _voice, vision = real_wire(session, **kwargs)
        voice = _FakeVoice()
        holder.append(voice)
        return orchestrator, voice, vision

    monkeypatch.setattr(endpoint, "_wire", wire)
    return holder


def test_audio_that_is_not_base64_is_named_not_fatal(fake_voice):
    """`np.frombuffer(base64.b64decode(...))` — две строки, две поломки.

    Не-base64 роняло декодер, нечётное число байт — `frombuffer`. Обе уносили
    сессию целиком, а звук в голосовом режиме идёт десятками кусков в секунду.
    """
    with client.websocket_connect("/v1/realtime?mode=voice") as ws:
        assert _open(ws, layers={"voice": True})["type"] == "session.created"
        ws.send_json({"type": "input.append", "input": {"audio": "не-base64!!!"}})
        assert ws.receive_json()["error"]["code"] == "bad_audio"
        assert _alive(ws)
        assert fake_voice[0].samples == []


def test_odd_length_pcm_is_trimmed_not_fatal(fake_voice):
    with client.websocket_connect("/v1/realtime?mode=voice") as ws:
        assert _open(ws, layers={"voice": True})["type"] == "session.created"
        ws.send_json({"type": "input.append", "input": {"audio": "QUJD"}})  # 3 байта
        assert _alive(ws)
        assert fake_voice[0].samples == [1]      # один сэмпл, нечётный байт отброшен


def test_oversized_audio_chunk_is_refused(fake_voice):
    import base64 as _b64

    blob = _b64.b64encode(b"\x00" * 2_000_002).decode()
    with client.websocket_connect("/v1/realtime?mode=voice") as ws:
        assert _open(ws, layers={"voice": True})["type"] == "session.created"
        ws.send_json({"type": "input.append", "input": {"audio": blob}})
        assert ws.receive_json()["error"]["code"] == "audio_too_large"
        assert fake_voice[0].samples == []
