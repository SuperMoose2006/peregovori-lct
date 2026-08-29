"""Чёрный ящик поверх `/v1/realtime`: полная партия через публичный протокол.

Прогоняет весь стек (endpoint → orchestrator → views → engine → фолбэк) не зная
ничего о внутренностях движка.

ПРОИСХОЖДЕНИЕ ЭТОГО ФАЙЛА. Это тот же набор проверок, что раньше стоял против
старой ручки `/ws`, переписанный под realtime-протокол. Ручка удалена, её
покрытие — нет: поведенческие инварианты (принципиальная игра → A/B, агрессия →
срыв, честное имя ожидания, отсутствие judge-метаданных без судьи) к транспорту
отношения не имеют и обязаны пережить его смену.

ИИ выключен (`conftest.py` ставит `NEGO_AI=off`), поэтому реплики оппонента —
детерминированный шаблон движка: офлайн и воспроизводимо.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _open(ws, scenario="supplier", lang="ru", mode="practice", **payload):
    """Довести сессию до `session.created` и вернуть его."""
    assert ws.receive_json()["type"] == "session.queue_done"
    ws.send_json({"type": "session.init",
                  "payload": {"scenarioId": scenario, "lang": lang,
                              "gameMode": mode, **payload}})
    created = ws.receive_json()
    assert created["type"] == "session.created"
    return created


def _turn(ws, text):
    """Сходить и собрать всё, что пришло в ответ, до `response.done`.

    Возвращает словарь по типам событий. Презентационные кадры (дельты текста)
    не влияют на результат хода, поэтому тест на них не смотрит.
    """
    ws.send_json({"type": "input.append", "input": {"text": text}})
    ws.send_json({"type": "input.commit"})
    seen: dict[str, dict] = {}
    order: list[str] = []
    for _ in range(60):
        event = ws.receive_json()
        order.append(event["type"])
        seen.setdefault(event["type"], event)
        if event["type"] == "response.done":
            break
    else:
        raise AssertionError("реплика оппонента так и не пришла")
    seen["__order__"] = order  # type: ignore[assignment]
    return seen


# ---------------------------------------------------------------------------
# REST
# ---------------------------------------------------------------------------

def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_scenarios_bilingual():
    for lang in ("ru", "en"):
        r = client.get(f"/api/scenarios?lang={lang}")
        assert r.status_code == 200
        scen = r.json()["scenarios"]
        assert len(scen) >= 4
        assert all(s["title"] and s["headline_unit"] is not None for s in scen)


# ---------------------------------------------------------------------------
# Полные партии
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("lang", ("ru", "en"))
def test_full_principled_game_reaches_agreement(lang):
    """Вскрытие интересов → объективный критерий → размен → закрытие = A или B.

    На обоих языках: интерес вскрывается попаданием в словарь тем СВОЕГО языка,
    поэтому «работает на RU» ничего не обещает про английскую сессию.
    """
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        created = _open(ws, lang=lang)
        assert created["state"]["status"] == "active"
        assert created["state"]["offer_opp"] == 100

        # Реплики — из общей фикстуры эталонных партий: партия, которую судит
        # этот тест, обязана быть той же, что судят тесты движка и курса.
        from tests.test_reference_games import PRINCIPLED
        moves = PRINCIPLED["supplier"][lang]
        debrief = None
        for move in moves:
            seen = _turn(ws, move)
            assert "turn.analysis" in seen and "engine.state" in seen
            if seen["engine.state"]["state"]["status"] != "active":
                for _ in range(10):
                    event = ws.receive_json()
                    if event["type"] == "debrief":
                        debrief = event
                        break
                break
        assert debrief is not None, "партия закрылась без разбора"
        assert debrief["debrief"]["grade"] in ("A", "B")


def test_aggressive_game_breaks_down():
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        _open(ws)
        debrief = None
        for move in ["Ваша цена смешна и некомпетентна.",
                     "У вас нет выбора, иначе уходим. Ультиматум.",
                     "Требую немедленно снизить, иначе разрываем."]:
            seen = _turn(ws, move)
            if seen["engine.state"]["state"]["status"] != "active":
                for _ in range(10):
                    event = ws.receive_json()
                    if event["type"] == "debrief":
                        debrief = event
                        break
                break
        assert debrief is not None
        assert debrief["debrief"]["status"] == "breakdown"


# ---------------------------------------------------------------------------
# Подсказка тренера
# ---------------------------------------------------------------------------

def test_hint_returns_text():
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        _open(ws, scenario="salary", lang="en")
        ws.send_json({"type": "coach.request"})
        for _ in range(10):
            event = ws.receive_json()
            if event["type"] == "turn.coach" and event.get("kind") == "hint":
                assert isinstance(event["text"], str) and event["text"]
                return
        raise AssertionError("подсказка не пришла")


# ---------------------------------------------------------------------------
# Судья: метаданные есть только когда он реально работал
# ---------------------------------------------------------------------------

def test_no_judge_means_no_coach_frame():
    """Без судьи коуч-кадра нет вовсе.

    Не пустой массив и не `false`, а ОТСУТСТВИЕ: клиент по этому различает
    «судья промолчал» и «судьи не было».
    """
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        _open(ws)
        seen = _turn(ws, "А что для вас важнее всего в этой сделке?")
        assert "turn.coach" not in seen
        assert "judge.started" not in seen


def test_judge_cam_surfaces_techniques_and_reject(monkeypatch):
    """Сильная реплика зажигает приёмы; заученный набор слов — плашку «не смысл»."""
    from app.orchestrator import negotiation as module

    monkeypatch.setattr(module, "judge_enabled_for", lambda _mode: True)

    async def fake_judge(ctx, text, lang, interests, secondary):
        if "важнее" in text:
            return {"arg_score": 82, "interest_targeted": None, "secondary_conceded": None,
                    "criteria_legitimate": True, "note": "Хороший вопрос.",
                    "techniques": ["вскрытие интереса", "объективный критерий"]}
        return {"arg_score": 18, "interest_targeted": None, "secondary_conceded": None,
                "criteria_legitimate": False, "note": "Похоже на заученную фразу.",
                "techniques": []}

    monkeypatch.setattr(module, "judge_turn", fake_judge)

    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        _open(ws)

        good = _turn(ws, "А что для вас важнее всего в этой сделке?")
        assert good["turn.coach"]["techniques"] == ["вскрытие интереса", "объективный критерий"]
        assert good["turn.coach"]["reject"] is False

        spam = _turn(ws, "Гарвардский метод BATNA SPIN win-win.")
        assert spam["turn.coach"]["techniques"] == []
        assert spam["turn.coach"]["reject"] is True


def test_judge_frames_bracket_the_wait(monkeypatch):
    """Ожидание судьи названо честно и закрыто.

    Судья работает ДО того, как оппонент может заговорить, поэтому эти секунды
    подписаны «судья читает», а не «оппонент печатает». Без судьи такого
    ожидания нет, и кадры не шлются — иначе это чистый шум.
    """
    from app.orchestrator import negotiation as module

    with client.websocket_connect("/v1/realtime?mode=text") as ws:  # судья выключен
        _open(ws)
        seen = _turn(ws, "А что для вас важнее всего?")
        assert "judge.started" not in seen and "judge.completed" not in seen

    monkeypatch.setattr(module, "judge_enabled_for", lambda _mode: True)

    async def silent_judge(*args, **kwargs):
        return None

    monkeypatch.setattr(module, "judge_turn", silent_judge)

    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        _open(ws)
        seen = _turn(ws, "А что для вас важнее всего?")
        order = seen["__order__"]
        assert "judge.started" in order and "judge.completed" in order
        assert order.index("judge.started") < order.index("judge.completed")
        assert order.index("judge.completed") < order.index("response.done")
        # Судья промолчал — коуч-кадра нет, но факт его запуска клиенту виден.
        assert seen["judge.completed"]["semantic"] is False


# ---------------------------------------------------------------------------
# Разбор: ключевые ходы
# ---------------------------------------------------------------------------

def test_turning_points_include_recognized_techniques():
    """`views.turning_points` показывает приёмы, узнанные судьёй на этом ходу."""
    from app import engine, views

    sess = engine.create_session("supplier", "ru")
    sess.log.append({
        "role": "player", "text": "А что для вас важнее всего?", "turn": 1,
        "deltas": {"trust": 8, "tension": 0, "info": 12, "leverage": 0},
        "judge": {"note": "Хороший вопрос.", "techniques": ["вскрытие интереса"]},
    })
    sess.log.append({
        "role": "player", "text": "Ну ок.", "turn": 2,
        "deltas": {"trust": 1, "tension": 0, "info": 0, "leverage": 0},
        "judge": None,
    })
    tps = views.turning_points(sess, k=2)
    tp1 = next(t for t in tps if t["turn"] == 1)
    assert tp1["coach_techniques"] == ["вскрытие интереса"]
    assert tp1["coach"] == "Хороший вопрос."
    tp2 = next((t for t in tps if t["turn"] == 2), None)
    if tp2 is not None:
        assert "coach_techniques" not in tp2


def test_exam_forces_layers_off():
    """Экзамен обязан выключать слои НА СЕРВЕРЕ, а не только в браузере.

    Правило «экзамен фиксирует слои выключенными» держит сравнимость грейдов, а
    значит и смысл сертификата. Клиент их выключает сам, но `session.init`
    приходит из браузера: пока сервер принимал присланное как есть, правило
    существовало только на честном слове проверяемого.
    """
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        ws.receive_json()                       # session.queue_done
        ws.send_json({"type": "session.init", "payload": {
            "scenarioId": "supplier", "lang": "ru", "gameMode": "exam",
            # Клиент, который «забыл» выключить слои, или просто чужой клиент.
            "layers": {"probe": True, "voice": True, "camera": True, "avatar": True},
        }})
        created = ws.receive_json()
        caps = created["capabilities"]
        assert caps["voice"] is False, "экзамен не должен включать голос"
        assert caps["camera"] is False, "экзамен не должен включать камеру"
        assert caps["avatar"]["available"] is False, "экзамен не должен включать аватар"
