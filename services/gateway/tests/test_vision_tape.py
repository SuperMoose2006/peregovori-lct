"""test_vision_tape.py — лента наблюдений: что было видно и НА КАКОМ ХОДУ.

ЗАЧЕМ ЭТОТ НАБОР. Разбор показывал четыре последние фразы списком, ни к чему не
привязанные: человек читал «в кадре появился второй» и не мог сказать, случилось
это на приветствии или на последнем торге. Слой отвечал на вопрос «что видно», а
человеку нужен был вопрос «когда» — иначе связи между тем, что происходило за
столом, и тем, что происходило с ним, не возникает.

ГЛАВНОЕ ОГРАНИЧЕНИЕ ОСТАЛОСЬ ПРЕЖНИМ: ни ход, ни выражение лица не входят в
`score_session` и войти не могут — лента живёт в `RealtimeSession`, а счёт
принимает `engine.Session`.

Офлайн, как и весь набор: `conftest.py` держит `NEGO_AI=off`, ответ модели
подделывается тем же приёмом, что и в `test_pokerface.py`.
"""

from __future__ import annotations

import asyncio
import dataclasses
import inspect

import pytest

from app import engine
from app.perception.vision import VisionSampler
from app.realtime.endpoint import _attach_vision_tape
from app.realtime.session import MAX_VISION_NOTES, RealtimeSession


def _session() -> RealtimeSession:
    return RealtimeSession(session_id="s",
                           engine_session=engine.create_session("supplier", "ru"))


def _look(sampler: VisionSampler, answer: str, *, turn: int = 0) -> None:
    """Один взгляд с подделанным ответом модели. В сеть никто не ходит."""

    class _Resp:
        @staticmethod
        def raise_for_status(): pass

        @staticmethod
        def json():
            return {"choices": [{"message": {"content": answer}}]}

    class _Client:
        async def post(self, *a, **kw):
            return _Resp()

    from app.providers.openrouter import chat as orchat
    original = orchat._get_client
    orchat._get_client = lambda: _Client()
    try:
        asyncio.run(sampler._look("кадр", turn))
    finally:
        orchat._get_client = original


# --------------------------------------------------------------- сама запись

def test_note_carries_the_turn_and_the_time():
    sess = _session()
    sess.engine_session.turn = 4
    sess.note_vision("человек смотрит в бумаги")

    note = sess.vision_notes[0]
    assert note["turn"] == 4
    assert note["text"] == "человек смотрит в бумаги"
    assert note["at_ms"] >= 0


def test_the_prompt_still_gets_flat_strings():
    """Форма для оппонента не изменилась — и не имеет права измениться.

    Оркестратор кладёт последние три наблюдения в контекст оппонента, а промпт
    их расплющивает, потому что текст пришёл из-за границы доверия. Словарь
    вместо строки развалил бы этот путь молча — и молча же протащил бы в промпт
    служебные поля.
    """
    sess = _session()
    sess.note_vision("человек в кадре", turn=1, expressive=True)
    assert sess.observations == ["человек в кадре"]
    assert all(isinstance(x, str) for x in sess.observations)


def test_a_tell_without_an_observation_lands_on_the_tape_but_not_in_the_prompt():
    """Кадр может ничего не сказать про обстановку и всё сказать про лицо.

    В ленте это строка «здесь лицо себя выдало». В контекст оппонента — ничего:
    пустая строка там вытеснила бы настоящее наблюдение из последних трёх.
    """
    sess = _session()
    sess.note_vision("", turn=2, expressive=True)

    assert sess.observations == []
    assert len(sess.vision_notes) == 1
    assert sess.vision_notes[0] == {"turn": 2, "at_ms": sess.vision_notes[0]["at_ms"],
                                    "text": "", "expressive": True}


def test_a_quiet_frame_writes_nothing_at_all():
    """Ничего не увидено, лицо спокойно — записи нет.

    Пустая строка в ленте это не наблюдение, а его отсутствие; нарисованная,
    она была бы обещанием, выданным за наблюдение.
    """
    sess = _session()
    sess.note_vision("", turn=1, expressive=False)
    sess.note_vision("", turn=1, expressive=None)
    assert sess.vision_notes == [] and sess.observations == []


def test_silence_about_the_face_is_not_a_no():
    """`None` доезжает до ленты как `None`: молчание модели — не «спокойное лицо»."""
    sess = _session()
    sess.note_vision("человек отошёл", turn=3)
    assert sess.vision_notes[0]["expressive"] is None


def test_the_tape_is_bounded():
    """Кадры гонит клиент, а сокет открыт наружу — лента обязана иметь предел."""
    sess = _session()
    for i in range(MAX_VISION_NOTES + 40):
        sess.note_vision(f"кадр {i}", turn=i)
    assert len(sess.vision_notes) == MAX_VISION_NOTES
    assert sess.vision_notes[-1]["text"] == f"кадр {MAX_VISION_NOTES + 39}"


# ----------------------------------------------------- один взгляд — одна строка

def test_one_look_is_one_row():
    """Обстановку и лицо модель сняла с одного кадра — значит, и строка одна."""
    sess = _session()
    sampler = VisionSampler("ru", lambda e: None, sess.note_vision, pokerface=True)
    _look(sampler, "Человек откинулся на спинку.\nЛИЦО: да", turn=5)

    assert len(sess.vision_notes) == 1
    note = sess.vision_notes[0]
    assert note["turn"] == 5 and note["expressive"] is True
    assert note["text"] == "Человек откинулся на спинку."
    assert "ЛИЦО" not in note["text"]


def test_the_turn_is_the_one_the_frame_arrived_on_not_the_one_the_answer_did():
    """Пока модель смотрит, ход успевает смениться.

    Кадр пришёл на втором ходу, ответ вернулся, когда шёл уже пятый. Записать
    наблюдение пятым значило бы датировать его чужим ходом — и в ленте оно
    объясняло бы не то, что объясняет.
    """
    sess = _session()
    sess.engine_session.turn = 2
    sampler = VisionSampler("ru", lambda e: None, sess.note_vision)
    sampler.offer(["кадр"], change=0.5, turn=sess.turn_id)

    sess.engine_session.turn = 5          # человек отправил ещё три хода
    _look(sampler, "В кадре появился второй человек.", turn=2)

    assert sess.vision_notes[-1]["turn"] == 2


# ------------------------------------------------------------ лента в разборе

def test_debrief_gets_the_tape_instead_of_flat_strings():
    """Оркестратор кладёт строки, realtime-слой заменяет их лентой с ходами."""
    sess = _session()
    sess.note_vision("человек в кадре", turn=0)
    sess.note_vision("", turn=2, expressive=True)

    event = {"type": "debrief", "debrief": {"grade": "B",
                                            "observations": ["человек в кадре"]}}
    _attach_vision_tape(event, sess)

    tape = event["debrief"]["observations"]
    assert [n["turn"] for n in tape] == [0, 2]
    assert tape[1]["expressive"] is True


def test_a_camera_that_never_spoke_leaves_no_card():
    """Слой не высказался — ключа нет вовсе, а не пустой список.

    Это тот самый случай «камера не поднялась»: поток мог быть открыт, кадры
    могли идти, но модель не сказала ни слова. «Ноль наблюдений» под такой
    камерой — обещание, выданное за наблюдение (принцип 2).
    """
    sess = _session()
    event = {"type": "debrief", "debrief": {"grade": "B", "observations": ["мусор"]}}
    _attach_vision_tape(event, sess)
    assert "observations" not in event["debrief"]


def test_other_events_are_left_alone():
    event = {"type": "engine.state", "state": {}}
    _attach_vision_tape(event, _session())
    assert event == {"type": "engine.state", "state": {}}


# ------------------------------------------------------------------- инвариант 6

def test_the_tape_cannot_reach_the_score():
    """Физическая гарантия: у движка таких полей нет, а счёт их не упоминает."""
    sess = _session()
    sess.note_vision("человек в кадре", turn=1, expressive=True)

    assert not hasattr(sess.engine_session, "vision_notes")
    names = {f.name for f in dataclasses.fields(type(sess.engine_session))}
    assert "vision_notes" not in names and "observations" not in names

    source = inspect.getsource(engine.score_session).lower()
    for word in ("vision", "observation", "expressive", "tells"):
        assert word not in source


def test_exam_never_records_anything():
    """Экзамен фиксирует слои выключенными — сэмплер не создаётся, лента пуста."""
    from app.realtime.session import Layers
    sess = RealtimeSession(session_id="s", layers=Layers.for_exam(),
                           engine_session=engine.create_session("supplier", "ru"))
    assert sess.layers.camera is False and sess.vision_notes == []


@pytest.mark.asyncio
async def test_offer_without_a_turn_still_works():
    """Старый вызов без хода обязан оставаться рабочим: ход тогда нулевой."""
    sess = _session()
    sampler = VisionSampler("ru", lambda e: None, sess.note_vision)
    sess.note_vision("наблюдение")          # без turn — берётся текущий ход
    assert sess.vision_notes[0]["turn"] == sess.turn_id
    assert sampler.available() is False     # офлайн: в сеть никто не пошёл


# ---------------------------------------------------------------------------
# Через настоящий провод
# ---------------------------------------------------------------------------
#
# Офлайн модель зрения не вызывается вовсе (`NEGO_AI=off` → `available()` ложно),
# поэтому наблюдения кладутся в сессию руками — ровно так, как их положил бы
# сэмплер. Проверяется не зрение, а провод: доезжает ли лента до клиента в том
# же событии, что и разбор, и переживает ли она обрыв связи.

import app.realtime.endpoint as endpoint_module

_BREAKDOWN = ["Ваша цена смешна и некомпетентна.",
              "У вас нет выбора, иначе уходим. Ультиматум.",
              "Требую немедленно снизить, иначе разрываем."]


@pytest.fixture()
def live(monkeypatch):
    """Клиент к настоящему сокету + доступ к живой `RealtimeSession`.

    Сессия наружу не торчит (в хранилище лежит сессия ДВИЖКА — наблюдений там
    нет и быть не должно), поэтому её перехватывает подмена сборщика.
    """
    from fastapi.testclient import TestClient
    from app.main import app

    built: list = []
    original = endpoint_module._build_session

    async def spy(payload):
        session, problem = await original(payload)
        if session is not None:
            built.append(session)
        return session, problem

    monkeypatch.setattr(endpoint_module, "_build_session", spy)
    return TestClient(app), built


def _open(ws, **payload) -> dict:
    assert ws.receive_json()["type"] == "session.queue_done"
    ws.send_json({"type": "session.init", "payload": {
        "scenarioId": "supplier", "lang": "ru", **payload}})
    created = ws.receive_json()
    assert created["type"] == "session.created"
    return created


def _play(ws, moves: list[str]) -> dict | None:
    """Сходить перечисленными репликами и вернуть разбор, если партия закрылась."""
    for move in moves:
        ws.send_json({"type": "input.append", "input": {"text": move}})
        ws.send_json({"type": "input.commit"})
        closed = False
        for _ in range(60):
            event = ws.receive_json()
            if event["type"] == "engine.state":
                closed = event["state"]["status"] != "active"
            if event["type"] == "debrief":
                return event
            if event["type"] == "response.done":
                break
        if closed:
            for _ in range(10):
                event = ws.receive_json()
                if event["type"] == "debrief":
                    return event
    return None


def test_the_tape_reaches_the_client_with_the_debrief(live):
    client, built = live
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        _open(ws, layers={"camera": True, "pokerface": True})
        built[0].note_vision("человек в кадре, смотрит в бумаги", turn=0)
        built[0].note_vision("", turn=2, expressive=True)
        debrief = _play(ws, _BREAKDOWN)

    assert debrief is not None, "партия закрылась без разбора"
    tape = debrief["debrief"]["observations"]
    assert [n["turn"] for n in tape] == [0, 2]
    assert tape[0]["text"] == "человек в кадре, смотрит в бумаги"
    assert tape[1]["expressive"] is True
    # Грейд при этом посчитал движок, и ничего из ленты в него не вошло.
    assert debrief["debrief"]["status"] == "breakdown"


def test_a_session_without_a_camera_carries_no_tape(live):
    """Слоя не было — ключа нет вовсе. Пустая карточка это тоже обещание."""
    client, _built = live
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        _open(ws)
        debrief = _play(ws, _BREAKDOWN)

    assert debrief is not None
    assert "observations" not in debrief["debrief"]


def test_the_tape_survives_a_dropped_socket(live):
    """Метро, лифт, спящий ноутбук — партия продолжается, лента не начинается заново.

    Возвращение строит НОВУЮ `RealtimeSession` вокруг старой сессии движка:
    ходы и шкалы возвращает движок, а наблюдения возвращать некому. Без этого
    разбор показывал ленту с середины партии — и молчал о том, что начала он не
    знает. Дыра в ленте хуже её отсутствия: дыры не видно.
    """
    client, built = live
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        created = _open(ws, layers={"camera": True})
        session_id = created["session_id"]
        built[0].note_vision("человек в кадре", turn=0)
        _play(ws, _BREAKDOWN[:1])           # один ход — партия ещё идёт

    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        _open(ws, layers={"camera": True}, resume=session_id)
        built[-1].note_vision("человек вернулся", turn=1)
        debrief = _play(ws, _BREAKDOWN[1:])

    assert debrief is not None
    tape = debrief["debrief"]["observations"]
    assert [n["text"] for n in tape] == ["человек в кадре", "человек вернулся"], \
        "лента обязана начинаться там же, где партия"
    # Время в ленте не идёт назад: часы продолжились, а не начались заново.
    assert tape[1]["at_ms"] >= tape[0]["at_ms"]


def test_an_explicitly_closed_session_keeps_nothing(live):
    """Человек сам сказал «закончил» — партии больше нет, ленту держать не за чем.

    Обрыв и завершение — разные вещи: первое ждёт возвращения, второе нет.
    """
    from app.realtime.session import _KEPT

    client, built = live
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        created = _open(ws, layers={"camera": True})
        built[0].note_vision("человек в кадре", turn=0)
        ws.send_json({"type": "session.close", "reason": "user_stop"})
        assert ws.receive_json()["type"] == "session.closed"

    assert created["session_id"] not in _KEPT
