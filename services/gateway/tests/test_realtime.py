"""Тесты realtime-архитектуры: протокол, отмена, паритет, честность слоёв.

Всё офлайн: `conftest.py` принудительно ставит `NEGO_AI=off`, чтобы набор
тестов не утащил нас в сеть и в расходы. Именно поэтому здесь проверяется в том
числе главный продуктовый инвариант — **без облака игра целиком играбельна**.
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from app.avatar.base import REACTION_TO_STATE, state_for_reaction
from app.avatar.presence import PresenceAvatar
from app.main import app
from app.realtime.bus import EventBus, new_generation_id
from app.realtime.events import output_delta
from app.realtime.session import Layers, RealtimeSession
from app import engine


# ---------------------------------------------------------------------------
# Шина и владение поколением
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_bus_delivers_live_events():
    bus = EventBus()
    bus.publish(output_delta("text", generation_id="g1", turn_id=1, text="раз"))
    bus.publish(output_delta("text", generation_id="g1", turn_id=1, text="два"))
    bus.close()

    seen = [e async for e in bus.drain()]
    assert [e["text"] for e in seen] == ["раз", "два"]


@pytest.mark.asyncio
async def test_cancelled_generation_never_reaches_the_socket():
    """Главный тест перебивания: ни один чанк погашенного поколения не выходит.

    Чанки публикуются ДО отмены — ровно так и происходит в жизни, когда синтез
    успел дописать фразу раньше, чем человек заговорил. Проверяем, что фильтр
    стоит на ВЫХОДЕ шины, а не на входе.
    """
    bus = EventBus()
    for i in range(5):
        bus.publish(output_delta("audio", generation_id="g1", turn_id=1, audio=f"чанк{i}"))
    bus.publish({"type": "engine.state", "state": {}})   # без поколения — переживёт отмену

    bus.cancel("g1")

    bus.publish(output_delta("audio", generation_id="g1", turn_id=1, audio="опоздавший"))
    bus.publish(output_delta("text", generation_id="g2", turn_id=2, text="новая реплика"))
    bus.close()

    seen = [e async for e in bus.drain()]
    assert not any(e.get("generation_id") == "g1" for e in seen), "хвост перебитого поколения протёк"
    assert any(e["type"] == "engine.state" for e in seen), "истина движка не должна гаснуть вместе с репликой"
    assert any(e.get("generation_id") == "g2" for e in seen), "новое поколение обязано проходить"


def test_generation_ids_are_unique_across_turns():
    a = new_generation_id("sess_x", 1)
    b = new_generation_id("sess_x", 1)
    assert a != b, "две попытки ответа на один ход обязаны различаться"


# ---------------------------------------------------------------------------
# Перебивание: услышанный кусок остаётся в истории
# ---------------------------------------------------------------------------

def _session(scenario_id: str = "salary") -> RealtimeSession:
    sc = engine.SCENARIOS[0] if scenario_id == "salary" else None
    eng = engine.create_session(sc.id if sc else scenario_id, "ru")
    return RealtimeSession(session_id="sess_test", engine_session=eng, lang="ru")


def test_interrupt_records_what_the_opponent_already_said():
    """Порт `heard_response` из Open-LLM-VTuber.

    Без этого оппонент не знает, что его оборвали, и следующей репликой
    повторяет ту же мысль с начала — в голосе это слышно мгновенно.
    """
    session = _session()
    session.begin_generation()
    session.spoken_so_far = "Я готов уступить, если вы"

    cancelled = session.interrupt()

    assert cancelled is not None
    assert session.bus.is_dead(cancelled)
    tail = session.engine_session.log[-1]
    assert tail["role"] == "opp"
    assert tail["interrupted"] is True
    assert "Я готов уступить" in tail["text"]
    assert session.generation_id is None


def test_interrupt_without_speech_leaves_history_clean():
    session = _session()
    session.begin_generation()
    session.interrupt()
    assert not [e for e in session.engine_session.log if e.get("interrupted")]


# ---------------------------------------------------------------------------
# Накопление ввода: модальность неразличима
# ---------------------------------------------------------------------------

def test_input_accumulates_across_appends():
    session = _session()
    session.append_input(text="Я готов обсудить цену")
    session.append_input(text="но при одном условии")
    text, _ = session.take_input()
    assert text == "Я готов обсудить цену но при одном условии"
    assert session.take_input()[0] == "", "буфер обязан очищаться после забора хода"


# ---------------------------------------------------------------------------
# Аватар: эмоцию знает движок
# ---------------------------------------------------------------------------

def test_every_engine_reaction_maps_to_an_avatar_state():
    """Лестница реакций движка обязана быть покрыта целиком.

    Если движок однажды заведёт новую реакцию, тест упадёт здесь, а не на сцене
    пустым лицом.
    """
    from app.avatar.base import AVATAR_STATES
    reactions = {"neutral", "warmed", "opened_up", "persuaded", "pressured",
                 "collaborated", "hardened", "offended", "not_yet", "probe_vague",
                 "walked_out"}
    assert reactions <= set(REACTION_TO_STATE), "реакция движка без состояния лица"
    for reaction in reactions:
        assert state_for_reaction(reaction) in AVATAR_STATES


def test_unknown_reaction_falls_back_to_listening():
    assert state_for_reaction("нечто_новое") == "listening"


@pytest.mark.asyncio
async def test_presence_avatar_never_claims_lipsync():
    """Правило честности: нет липсинка — так и сказано, в каждом событии."""
    events: list[dict] = []
    avatar = PresenceAvatar("salary", events.append)

    caps = avatar.capabilities()
    assert caps.available is True
    assert caps.lipsync is False, "presence не умеет липсинк и не должен это скрывать"
    assert caps.transport == "images"

    await avatar.react("offended")
    assert events[-1]["state"] == "offended"
    assert events[-1]["lipsync"] is False


# ---------------------------------------------------------------------------
# Слои не влияют на оценку
# ---------------------------------------------------------------------------

def test_layers_never_reach_the_score():
    """Грейд со слоями обязан совпасть с грейдом без них — до числа.

    Партия проигрывается дважды одними и теми же репликами: один раз с
    выключенными слоями, один — со всеми включёнными и с наблюдениями камеры.
    Совпадение до знака и есть тот инвариант, который делает сертификат
    экзамена сравнимым.
    """
    lines = [
        "Почему для вас важен именно этот срок?",
        "Если мы возьмём монтаж на себя, вы сможете подвинуться по цене?",
        "По рыночным данным такие объекты идут дешевле — давайте опираться на них.",
        "Предлагаю закрыть на этой цифре.",
    ]

    def play(with_layers: bool):
        eng = engine.create_session(engine.SCENARIOS[0].id, "ru")
        rt = RealtimeSession(
            session_id="s", engine_session=eng, lang="ru",
            layers=Layers(probe=True, voice=True, camera=True, avatar=True) if with_layers else Layers(),
        )
        if with_layers:
            rt.observations = ["игрок отошёл от камеры", "игрок смотрит в документы"]
        for line in lines:
            analysis = engine.analyze(line)
            eng.turn += 1
            engine.apply_move(eng, analysis, line)
            eng.log.append({"role": "player", "text": line, "turn": eng.turn})
        return engine.score_session(eng)

    bare, layered = play(False), play(True)
    assert bare["overall"] == layered["overall"]
    assert bare["grade"] == layered["grade"]
    assert bare["economic"] == layered["economic"]
    assert bare["relationship"] == layered["relationship"]
    assert bare["technique"] == layered["technique"]


def test_observations_live_outside_the_engine_session():
    """Наблюдения камеры физически не могут попасть в счёт: их там нет.

    Это сильнее договорённости — `score_session` получает `engine.Session`, а
    наблюдения лежат в `RealtimeSession`, до которого счёт не дотягивается.
    """
    session = _session()
    session.observations.append("в кадре появился второй человек")
    assert not hasattr(session.engine_session, "observations")


# ---------------------------------------------------------------------------
# Протокол целиком, офлайн (NEGO_AI=off)
# ---------------------------------------------------------------------------

def test_full_text_session_offline():
    """Партия по новому протоколу без единого сетевого вызова.

    Это и есть проверка «без сети продукт полностью играбелен»: сюда входит
    приветствие, ход, истина движка и реплика оппонента шаблоном.
    """
    client = TestClient(app)
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        assert ws.receive_json()["type"] == "session.queue_done"

        ws.send_json({"type": "session.init",
                      "payload": {"scenarioId": engine.SCENARIOS[0].id, "lang": "ru"}})
        created = ws.receive_json()
        assert created["type"] == "session.created"
        assert created["greeting"]
        assert created["state"]["trust"] >= 0
        assert created["capabilities"]["cloud_ai"] is False, "conftest держит нас офлайн"
        assert created["capabilities"]["avatar"]["available"] is False

        ws.send_json({"type": "input.append",
                      "input": {"text": "Почему для вас важен именно этот срок?"}})
        ws.send_json({"type": "input.commit"})

        seen: dict[str, dict] = {}
        for _ in range(12):
            event = ws.receive_json()
            seen.setdefault(event["type"], event)
            if event["type"] == "response.done":
                break

        assert "turn.analysis" in seen, "детерминированный разбор обязан приходить первым"
        assert "engine.state" in seen, "истина движка обязана доезжать до клиента"
        assert seen["response.done"]["text"], "оппонент обязан ответить даже офлайн"
        assert seen["engine.state"]["turn_id"] == 1

        ws.send_json({"type": "session.close", "reason": "user_stop"})


def test_turn_analysis_arrives_before_the_opponent_speaks():
    """Порядок событий — это и есть ощущение отзывчивости.

    Теги приёмов появляются под репликой игрока раньше, чем оппонент начал
    отвечать. Раньше игрок несколько секунд смотрел в пустоту.
    """
    client = TestClient(app)
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        ws.receive_json()
        ws.send_json({"type": "session.init",
                      "payload": {"scenarioId": engine.SCENARIOS[0].id, "lang": "ru"}})
        ws.receive_json()

        ws.send_json({"type": "input.append", "input": {"text": "Что для вас здесь важнее всего?"}})
        ws.send_json({"type": "input.commit"})

        order: list[str] = []
        for _ in range(12):
            order.append(ws.receive_json()["type"])
            if order[-1] == "response.done":
                break
        assert order.index("turn.analysis") < order.index("response.done")
        assert order.index("engine.state") < order.index("response.done")


def test_unknown_scenario_is_refused_without_killing_the_socket():
    client = TestClient(app)
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        ws.receive_json()
        ws.send_json({"type": "session.init", "payload": {"scenarioId": "нет-такого"}})
        err = ws.receive_json()
        assert err["type"] == "error"
        assert err["error"]["code"] == "init_failed"

        # Сокет жив: можно инициализироваться заново правильным сценарием.
        ws.send_json({"type": "session.init",
                      "payload": {"scenarioId": engine.SCENARIOS[0].id, "lang": "ru"}})
        assert ws.receive_json()["type"] == "session.created"


def test_events_before_init_are_refused():
    client = TestClient(app)
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        ws.receive_json()
        ws.send_json({"type": "input.commit"})
        err = ws.receive_json()
        assert err["error"]["code"] == "not_initialized"


def test_unsupported_mode_is_rejected():
    client = TestClient(app)
    with pytest.raises(Exception):
        with client.websocket_connect("/v1/realtime?mode=hologram") as ws:
            ws.receive_json()


@pytest.mark.asyncio
async def test_cancellation_notice_survives_its_own_filter():
    """Уведомление об отмене обязано доехать, хотя несёт мёртвый generation_id.

    Регрессия на реальную ловушку. `generation.cancelled` называет погашенное
    поколение — иначе клиент не поймёт, чей пузырь стирать, — и ровно поэтому
    попадает под собственный фильтр. Симптом был худшим из возможных: звук
    гаснет правильно, а клиент об этом не узнаёт и продолжает рисовать реплику.
    """
    bus = EventBus()
    bus.cancel("g1")
    bus.publish({"type": "generation.cancelled", "generation_id": "g1", "reason": "barge_in"})
    bus.publish(output_delta("audio", generation_id="g1", turn_id=1, audio="хвост"))
    bus.close()

    seen = [e async for e in bus.drain()]
    assert [e["type"] for e in seen] == ["generation.cancelled"]
    assert seen[0]["generation_id"] == "g1"


def test_generation_outlives_response_done():
    """Текст кончился — реплика ещё звучит, значит гасить ещё есть что.

    Регрессия: `generation_id` обнулялся на `response.done`, и человек,
    заговоривший поверх звучащей реплики, не мог её перебить.
    """
    from app.orchestrator.negotiation import NegotiationOrchestrator

    session = _session()
    orchestrator = NegotiationOrchestrator(session)
    session.begin_generation()
    session.spoken_so_far = "Я готов уступить"

    orchestrator._finish_generation()

    assert session.generation_id is not None, "поколение закрылось вместе с текстом"
    assert session.spoken_so_far == "", "иначе реплика попадёт в историю дважды"
