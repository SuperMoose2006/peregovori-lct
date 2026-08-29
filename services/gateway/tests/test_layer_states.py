"""Четыре состояния слоёв зрения — и доказательство, что пятого нет.

У каждого слоя ровно четыре честных состояния:

  1. выключен человеком;
  2. включён, но НЕДОСТУПЕН (нет ключа, нет камеры, кончился бюджет);
  3. включён, работает, и сказать пока нечего;
  4. включён, работает и говорит.

Четвёртого вида — «выглядит настоящим, а внутри пусто» — не существует
(принцип 2). Сложнее всего различить не первое со вторым, а ВТОРОЕ С ТРЕТЬИМ:
и «модель не смотрела» и «модель посмотрела и ничего не увидела» дают пустую
ленту, пустой экран и пустой разбор. До этого набора продукт показывал их
одинаково, то есть отработавший слой был неотличим от отсутствующего.

Отдельно проверяется то, чем этот же вопрос ломался раньше: наблюдаемый признак
обязан ДОКАЗЫВАТЬ работу слоя. Открытый поток её не доказывает — он бывает
открыт, когда кадры никуда не идут. Ушедший кадр тоже не доказывает — он уходит
и в мёртвое зрение. Доказывает только ответ модели, поэтому считаются ответы.
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from app import engine
from app.main import app
from app.perception import vision as V
from app.perception.vision import VisionSampler
from app.realtime.endpoint import _attach_vision_tape
from app.realtime.session import (Layers, RealtimeSession, keep_for_resume,
                                  restore_from_resume)

client = TestClient(app)


def _session() -> RealtimeSession:
    return RealtimeSession(session_id="s",
                           engine_session=engine.create_session("supplier", "ru"))


def _created(**payload) -> dict:
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        assert ws.receive_json()["type"] == "session.queue_done"
        ws.send_json({"type": "session.init", "payload": {
            "scenarioId": "supplier", "lang": "ru", "gameMode": "practice", **payload}})
        created = ws.receive_json()
        assert created["type"] == "session.created"
        return created


# ---------------------------------------------------------------- состояние 1

def test_camera_off_promises_nothing():
    """Выключенный слой не оставляет следов ни в возможностях, ни в разборе."""
    caps = _created(layers={"probe": True})["capabilities"]
    assert caps["camera"] is False and caps["pokerface"] is False

    session = _session()
    event = {"type": "debrief", "debrief": {"grade": "B"}}
    _attach_vision_tape(event, session)
    assert "observations" not in event["debrief"]
    assert "observation_looks" not in event["debrief"]


# ---------------------------------------------------------------- состояние 2

def test_camera_on_without_a_key_is_reported_unavailable():
    """Тумблер стоит, ключа нет — сервер говорит «нет», а не молчит.

    Это единственный сигнал, по которому браузер может отличить работающий слой
    от невставшего: кадры-то он умеет отправлять в обоих случаях. Пока
    `capabilities.camera` никто не читал, партия без облачного зрения выглядела
    ровно как рабочая — камера открыта, чип горит, наблюдений нет.
    """
    caps = _created(layers={"camera": True, "pokerface": True})["capabilities"]
    assert caps["camera"] is False, "офлайн камера не может быть доступна"
    assert caps["pokerface"] is False, "покерфейс без зрения — тумблер в пустоту"


def test_pokerface_without_a_camera_is_not_offered_even_if_asked():
    assert Layers.from_dict({"pokerface": True}).pokerface is False
    caps = _created(layers={"pokerface": True})["capabilities"]
    assert caps["pokerface"] is False


@pytest.mark.asyncio
async def test_three_failed_looks_are_said_out_loud_exactly_once(monkeypatch):
    """Молчащий слой неотличим от сломанной камеры — значит, молчать нельзя.

    Но и кричать на каждом кадре нельзя: кадры идут потоком. Поэтому слой
    называет себя после третьей неудачи подряд и замолкает до следующей удачи.
    """
    seen: list[dict] = []
    sampler = VisionSampler("ru", seen.append, lambda *a, **k: None)

    class _Broken:
        async def post(self, *a, **kw):
            raise RuntimeError("сеть отвалилась")

    monkeypatch.setattr(V.orchat, "_get_client", lambda: _Broken())
    for _ in range(6):
        await sampler._look("кадр")

    errors = [e for e in seen if e.get("type") == "error"]
    assert len(errors) == 1, f"сказано {len(errors)} раз вместо одного"
    assert errors[0]["error"]["code"] == "vision_unavailable"
    assert sampler.stats.failures_in_a_row == 6
    assert sampler.stats.calls_made == 0, "сорванный взгляд — не обращение"


@pytest.mark.asyncio
async def test_a_hung_look_lets_go_of_the_layer(monkeypatch):
    """Взгляд не имеет права висеть на читательском потолке клиента.

    Пока задача взгляда не вернулась, сэмплер не смотрит на новые кадры вовсе
    (`offer` выходит на незавершённой задаче). Общий потолок чтения у клиента
    OpenRouter — шестьдесят секунд, то есть одна сетевая заминка выключала слой
    на семь тактов подряд, ничего об этом не говоря.
    """
    monkeypatch.setattr(V, "_LOOK_TIMEOUT_S", 0.05)
    sampler = VisionSampler("ru", lambda e: None, lambda *a, **k: None)

    class _Hung:
        async def post(self, *a, **kw):
            await asyncio.sleep(30)

    monkeypatch.setattr(V.orchat, "_get_client", lambda: _Hung())
    started = asyncio.get_event_loop().time()
    await sampler._look("кадр")
    assert asyncio.get_event_loop().time() - started < 5.0
    assert sampler.stats.failures_in_a_row == 1


def test_an_exhausted_budget_is_a_refusal_with_words():
    """Отказ по бюджету обязан назвать причину и сказать, что с партией."""
    from app.realtime import limits
    assert "камер" in limits.vision_rate_limited("ru").lower()
    assert "camera" in limits.vision_rate_limited("en").lower()
    # И главное: отказ обязан сказать, что с ПАРТИЕЙ. «Ошибка» без этого на
    # показе неотличима от сломанного сервера.
    assert "партию" in limits.vision_rate_limited("ru")
    assert "game" in limits.vision_rate_limited("en")


# ---------------------------------------------------------------- состояние 3

def test_a_look_that_saw_nothing_is_still_a_look():
    """«Смотрел и молчал» ≠ «не смотрел». Разница стоит одного числа.

    Кадр без наблюдения записью в ленту не становится — и правильно, пустая
    строка это не наблюдение. Но сам факт ответа модели обязан остаться, иначе
    разбор скажет «слой не поднялся» про слой, отработавший всю партию.
    """
    session = _session()
    for _ in range(4):
        session.note_vision("", turn=1, expressive=None)

    assert session.vision_notes == [], "пустой ответ не должен попадать в ленту"
    assert session.vision_looks == 4

    event = {"type": "debrief", "debrief": {"grade": "B"}}
    _attach_vision_tape(event, session)
    assert "observations" not in event["debrief"], "ленты нет — ключа нет"
    assert event["debrief"]["observation_looks"] == 4


def test_a_layer_that_never_answered_carries_no_number():
    """Ноль взглядов — это отсутствие ключа, а не «ничего не увидел».

    Ноль в разборе читался бы как наблюдение («камера смотрела ноль раз»), то
    есть как обещание, выданное за данные.
    """
    session = _session()
    event = {"type": "debrief", "debrief": {"grade": "B"}}
    _attach_vision_tape(event, session)
    assert "observation_looks" not in event["debrief"]


def test_the_silent_looks_survive_a_reconnect():
    """Партия, где камера смотрела и молчала, обязана пережить обрыв так же,
    как разговорчивая: иначе после метро разбор объявит работавший слой
    отсутствующим."""
    first = _session()
    for _ in range(3):
        first.note_vision("", turn=2, expressive=None)
    keep_for_resume(first)

    second = _session()
    restore_from_resume(second, "s")
    assert second.vision_looks == 3
    assert second.vision_notes == []


# ---------------------------------------------------------------- состояние 4

def test_a_look_that_spoke_lands_in_the_tape_and_in_the_count():
    session = _session()
    session.note_vision("", turn=1, expressive=None)
    session.note_vision("в кадре появился второй человек", turn=2, expressive=True)

    event = {"type": "debrief", "debrief": {"grade": "B"}}
    _attach_vision_tape(event, session)
    tape = event["debrief"]["observations"]
    assert len(tape) == 1 and tape[0]["turn"] == 2
    assert event["debrief"]["observation_looks"] == 2, "молчаливый взгляд тоже взгляд"


@pytest.mark.asyncio
async def test_a_calm_face_is_a_look_too(monkeypatch):
    """«Покерфейс» ответил «нет» — слой отработал, записи нет, счёт взглядов есть."""
    session = _session()
    sampler = VisionSampler("ru", lambda e: None, session.note_vision, pokerface=True)

    class _Resp:
        @staticmethod
        def raise_for_status(): pass
        @staticmethod
        def json():
            return {"choices": [{"message": {"content": "нет\nЛИЦО: нет"}}]}

    class _Client:
        async def post(self, *a, **kw): return _Resp()

    monkeypatch.setattr(V.orchat, "_get_client", lambda: _Client())
    await sampler._look("кадр", 3)

    assert session.vision_notes == [], "спокойное лицо без обстановки — не запись"
    assert session.vision_looks == 1
    assert session.tells == 0


# ------------------------------------------------- перебивание пишет в движок
#
# ЕДИНСТВЕННОЕ МЕСТО, ГДЕ СЛОЙ ПИШЕТ ВНУТРЬ СЕССИИ ДВИЖКА. `interrupt()`
# дописывает в `engine_session.log` то, что оппонент успел сказать вслух, —
# иначе он не знает, на чём его оборвали, и повторяет сказанное (в голосе это
# слышно мгновенно). Но копится этот кусок из СЫРЫХ чанков модели: санитайзер
# судит реплику целиком и только когда она дописана, а при перебивании до конца
# дело не доходит вовсе.
#
# Значит выход из роли уезжал в журнал как собственные слова оппонента — и
# оттуда в стенограмму следующего хода, где модель видела свой же выход из роли
# как прецедент, и в разбор, где его читал человек.

def test_an_interrupted_break_of_character_leaves_no_trace():
    session = _session()
    session.begin_generation()
    session.spoken_so_far = "Как языковая модель, я не могу вести переговоры"
    session.interrupt()
    assert session.engine_session.log == [], (
        "выход из роли записан в журнал как слова оппонента — оттуда он попадёт "
        "и в стенограмму следующего хода, и в разбор")


def test_an_interrupted_normal_line_is_kept_with_its_ellipsis():
    session = _session()
    session.begin_generation()
    session.spoken_so_far = "Мы не готовы двигаться по цене"
    session.interrupt()
    assert len(session.engine_session.log) == 1
    entry = session.engine_session.log[0]
    assert entry["role"] == "opp" and entry["interrupted"] is True
    assert entry["text"].endswith("…"), "оппонент не видит, что его оборвали"
    assert "Мы не готовы" in entry["text"]


def test_raw_markdown_is_cleaned_rather_than_dropped():
    """Звёздочки — не выход из роли: реплику они не отвергают, а чистятся."""
    session = _session()
    session.begin_generation()
    session.spoken_so_far = "**Мы не готовы** двигаться"
    session.interrupt()
    assert session.engine_session.log
    assert "*" not in session.engine_session.log[0]["text"]


def test_a_foreign_script_fragment_is_dropped_whole():
    session = _session()
    session.begin_generation()
    session.spoken_so_far = "Мы не готовы 我们不能"
    session.interrupt()
    assert session.engine_session.log == []
