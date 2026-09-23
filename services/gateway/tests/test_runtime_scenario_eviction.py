"""Сгенерированный стол не вытесняется из-под партии, которая на нём идёт.

ЧТО СЛОМАЛОСЬ. При слиянии двух линий `SessionStore` потерял
`active_scenario_ids()`, а реестр сгенерированных сценариев
(`engine/scenarios.py::register_runtime_scenario`) зовёт его перед каждым
вытеснением. «Своя сделка» перестала открываться вовсе: `AttributeError`
улетал из генерации в общий обработчик сокета, и человек получал безликий
`server_error` вместо стола. По проводу этот путь не проверялся ни разу: все
сокетные тесты «своей сделки» подменяют `generate_scenario` целиком и до
регистрации сценария не доходят, а тесты реестра видят поломку как
`AttributeError`, а не так, как её видит человек.

ЧТО ЗДЕСЬ ДЕРЖИТСЯ. Реестр ограничен (`RUNTIME_MAX`, `RUNTIME_TTL_S`) и обязан
вытеснять — иначе память течёт с каждой сгенерированной сделкой. Но вытеснить
стол живой партии значит оставить движок без сценария посреди игры, а вытеснить
стол партии, ждущей `resume`, — вернуть человека из метро к пустому месту. Оба
пути вытеснения (по ёмкости и по сроку) проверены для обоих видов занятости, и
отдельно — что защита снимается, как только партия действительно кончилась:
иначе она сама превратилась бы в утечку.

Генерация идёт через подменённую модель: сеть в тестах не нужна и не
допускается (conftest ставит NEGO_AI=off).
"""

from __future__ import annotations

import json
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

import app.session as session_module
from app import engine
from app.engine import scenarios as registry
from app.main import app
from app.session import SessionStore, store

#: Ответ «модели» для своей сделки. Числа нарочно не упорядочены: генератор
#: обязан сам собрать из них играбельную зону, это часть того же пути.
REPLY = json.dumps({
    "title": "Поставка упаковки", "icon": "box", "difficulty": 3,
    "role": "Вы закупщик и хотите снизить цену.",
    "counterpart_name": "Ирина", "counterpart_persona": "Держит маржу.",
    "style": "analytical", "unit": " ₽", "dir": "lower_is_better",
    "opponent_open": 120, "opponent_reservation": 90, "player_target": 95,
    "player_reservation": 110, "batna_strength": 50, "batna_note": "Есть второй поставщик.",
    "hidden_interests": ["Загрузка цеха", "Отчёт перед владельцем", "Прошлый срыв поставки"],
    "tradeoffs": ["Предоплата", "Годовой объём"],
    "briefing": "Цель 95, красная линия 110.",
}, ensure_ascii=False)

SITUATION = "Закупаю упаковку у постоянного поставщика и хочу снизить цену на год."


@pytest.fixture(autouse=True)
def isolated_registry(monkeypatch):
    # Свой реестр на каждый тест: вытеснение зависит от того, кто лежит рядом,
    # а сценарии соседних тестов сделали бы порядок вытеснения случайным.
    monkeypatch.setattr(registry, "_RUNTIME", {})
    monkeypatch.setattr(registry, "_RUNTIME_USED", {})


@pytest.fixture
def fresh_store(monkeypatch):
    """Хранилище, которое видит реестр. Реестр импортирует его лениво, по
    атрибуту модуля, — поэтому подмена атрибута и есть то, что он спросит."""
    local = SessionStore()
    monkeypatch.setattr(session_module, "store", local)
    return local


def _runtime(tag: str) -> registry.Scenario:
    scenario = replace(engine.by_id("supplier"), id=f"custom_evict_{tag}")
    registry.register_runtime_scenario(scenario)
    return scenario


def _occupy(store_: SessionStore, scenario: registry.Scenario, how: str) -> str:
    """Посадить за стол партию: живую (сокет держит) или брошенную (ждёт resume)."""
    session_id = f"sess_{scenario.id}"
    store_.put(session_id, engine.create_session(scenario.id, "ru"))
    if how == "pending":
        store_.release(session_id)
    return session_id


# ---------------------------------------------------------------- хранилище

def test_store_names_the_tables_of_live_and_resume_pending_games(fresh_store):
    live, pending, closed = _runtime("live"), _runtime("pending"), _runtime("closed")
    _occupy(fresh_store, live, "live")
    _occupy(fresh_store, pending, "pending")
    fresh_store.drop(_occupy(fresh_store, closed, "live"))
    # Запись без `scenario_id` — не повод падать: хранилище держит то, что ему дали.
    fresh_store.put("sess_foreign", object())

    assert fresh_store.active_scenario_ids() == {live.id, pending.id}, (
        "брошенная партия ждёт возвращения — её стол занят так же, как у живой")


def test_an_expired_resume_window_frees_the_table(fresh_store, monkeypatch):
    """Обратная сторона: партия, к которой не вернулись, стол больше не держит."""
    monkeypatch.setattr(session_module, "RESUME_TTL_S", 0)
    scenario = _runtime("gone")
    _occupy(fresh_store, scenario, "pending")
    assert scenario.id not in fresh_store.active_scenario_ids()


# ------------------------------------------------------------------- реестр

@pytest.mark.parametrize("how", ["live", "pending"])
def test_capacity_eviction_skips_the_table_in_play(fresh_store, monkeypatch, how):
    monkeypatch.setattr(registry, "RUNTIME_MAX", 2)
    in_play, idle = _runtime("in_play"), _runtime("idle")
    _occupy(fresh_store, in_play, how)
    # Стол в игре — самый старый: без защиты вытеснение по давности взяло бы
    # именно его. Срок ставится явно, а не выводится из порядка вызовов.
    registry._RUNTIME_USED[in_play.id] = registry._RUNTIME_USED[idle.id] - 10

    newcomer = _runtime("newcomer")

    assert registry.by_id(in_play.id) is in_play, "стол вытеснен из-под партии"
    assert registry.by_id(idle.id) is None, "вытеснять было кого — ёмкость не соблюдена"
    assert registry.by_id(newcomer.id) is newcomer


@pytest.mark.parametrize("how", ["live", "pending"])
def test_ttl_pruning_skips_the_table_in_play_until_the_game_ends(fresh_store, how):
    scenario = _runtime("long_game")
    session_id = _occupy(fresh_store, scenario, how)
    registry._RUNTIME_USED[scenario.id] -= registry.RUNTIME_TTL_S + 1

    assert registry.by_id(scenario.id) is scenario, "срок аренды вышел посреди партии"

    fresh_store.drop(session_id)
    registry._RUNTIME_USED[scenario.id] -= registry.RUNTIME_TTL_S + 1
    assert registry.by_id(scenario.id) is None, "защита пережила партию — это утечка"


def test_an_abandoned_game_does_not_pin_its_table_forever(fresh_store, monkeypatch):
    monkeypatch.setattr(registry, "RUNTIME_MAX", 1)
    monkeypatch.setattr(session_module, "RESUME_TTL_S", 0)
    abandoned = _runtime("abandoned")
    _occupy(fresh_store, abandoned, "pending")

    newcomer = _runtime("after")

    assert registry.by_id(abandoned.id) is None
    assert registry.by_id(newcomer.id) is newcomer


# ------------------------------------------------------------------- провод

def _fake_model(monkeypatch):
    from app.providers.openrouter import chat

    async def complete(*_args, **_kwargs):
        return REPLY

    monkeypatch.setattr(chat, "complete", complete)


def _init_custom(ws, **extra) -> dict:
    assert ws.receive_json()["type"] == "session.queue_done"
    ws.send_json({"type": "session.init", "payload": {
        "gameMode": "custom", "lang": "ru", "situation": SITUATION, **extra}})
    return ws.receive_json()


def _turn(ws, text: str) -> list[dict]:
    ws.send_json({"type": "input.append", "input": {"text": text}})
    ws.send_json({"type": "input.commit"})
    events = [ws.receive_json()]
    while events[-1]["type"] not in ("response.done", "error"):
        events.append(ws.receive_json())
    return events


def test_a_custom_deal_opens_over_the_wire_through_the_real_registry(monkeypatch):
    """Ровно тот путь, что упал при слиянии: генерация → регистрация → стол."""
    _fake_model(monkeypatch)
    with TestClient(app).websocket_connect("/v1/realtime") as ws:
        created = _init_custom(ws)
        assert created["type"] == "session.created", created
        scenario_id = created["scenario"]["id"]
        assert scenario_id.startswith("custom_") and scenario_id in registry._RUNTIME, (
            "стол не прошёл через реестр — тест проверяет не тот путь")
        assert scenario_id in store.active_scenario_ids()
        ws.send_json({"type": "session.close"})


def test_a_resumed_custom_deal_finds_its_table_after_the_registry_churned(monkeypatch):
    monkeypatch.setattr(registry, "RUNTIME_MAX", 2)
    _fake_model(monkeypatch)
    client = TestClient(app)
    with client.websocket_connect("/v1/realtime") as ws:
        created = _init_custom(ws)
        assert created["type"] == "session.created", created
        session_id, scenario_id = created["session_id"], created["scenario"]["id"]
        assert any(e["type"] == "engine.state" for e in _turn(ws, "Что для вас важнее всего?"))
    # Сокет оборвался без `session.close` — партия ждёт возвращения. Пока её
    # нет, другие организаторы собирают свои столы и забивают реестр до потолка.
    for n in range(4):
        _runtime(f"churn_{n}")

    with client.websocket_connect("/v1/realtime") as ws:
        resumed = _init_custom(ws, resume=session_id)
        assert resumed["type"] == "session.created", resumed
        assert resumed["resumed"] is True and resumed["session_id"] == session_id
        assert resumed["scenario"]["id"] == scenario_id, "вернулись не к своему столу"
        events = _turn(ws, "По рыночным данным медиана цены 95, это отраслевой стандарт.")
        assert all(e["type"] != "error" for e in events), events
        ws.send_json({"type": "session.close"})


def test_a_full_registry_refuses_by_name_and_keeps_the_game_in_play(monkeypatch):
    """Все места заняты живыми партиями — отказ `init_failed` словами, а не
    `server_error`, и идущая партия не теряет стол ради новой."""
    monkeypatch.setattr(registry, "RUNTIME_MAX", 1)
    _fake_model(monkeypatch)
    client = TestClient(app)
    with client.websocket_connect("/v1/realtime") as first:
        created = _init_custom(first)
        assert created["type"] == "session.created", created
        with client.websocket_connect("/v1/realtime") as second:
            refused = _init_custom(second)
            assert refused["type"] == "error"
            assert refused["error"]["code"] == "init_failed", refused
            assert "сгенерировать" in refused["error"]["message"]
        assert registry.by_id(created["scenario"]["id"]) is not None
        assert any(e["type"] == "engine.state" for e in _turn(first, "Что для вас важнее всего?"))
        first.send_json({"type": "session.close"})
