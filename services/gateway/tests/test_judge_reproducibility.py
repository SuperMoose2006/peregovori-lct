"""Судья невоспроизводим — тест держит то, что из этого решено.

Живой разброс здесь померить нельзя и не нужно: набор офлайновый
(`conftest.py` ставит `NEGO_AI=off`), а замер живёт в приборе
`tools/judge_spread.py` и в docs/judge-reproducibility.md. Числа оттуда:
одна и та же реплика получает разброс до 15 очков (типично 10, σ 2–5),
`temperature=0` его не убирает, усреднение пяти вызовов не снимает худший
случай и стоит +570 мс из 719.

Отсюда два решения, и они проверяются здесь, потому что оба — НАСТРОЙКА,
которую легко отменить одной строкой, не заметив последствия:

1. Температура судьи ноль и живёт в коде, а не в переменной окружения.
2. На экзамене семантического судьи НЕТ — ни в оркестраторе, ни в
   `session.created`. Сертификат обязан быть воспроизводимым: на эталонной
   партии `good` разброс судьи переворачивал грейд B↔C при `overall`,
   одинаковом во всех 36 прогонах до единицы.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import engine
from app.engine import analyze
from app.main import app
from app.orchestrator import judge as ojudge
from app.realtime.session import RealtimeSession


# --------------------------------------------------------------- температура

def test_judge_temperature_is_pinned_to_zero():
    """Ноль — и не «примерно ноль»: сравнение точное, поле не настраивается.

    Это не обещание детерминизма (замер говорит обратное), а отказ от
    креативности там, где она не нужна. Если число меняют — пусть меняют вместе
    с этим объяснением, а не мимоходом.
    """
    assert ojudge.JUDGE_TEMPERATURE == 0.0


def test_the_pinned_temperature_actually_reaches_the_provider(monkeypatch):
    """Константа, до провайдера не доехавшая, — комментарий, а не настройка."""
    seen: dict = {}

    async def fake_complete(system, user, **kw):
        seen.update(kw)
        return '{"arg_score": 60, "note": "ok", "techniques": []}'

    monkeypatch.setenv("NEGO_JUDGE", "1")
    monkeypatch.setattr(ojudge.orchat, "complete", fake_complete)

    got = asyncio.run(ojudge.judge_turn("контекст", "Почему это для вас важно?", "ru"))
    assert got is not None and got["arg_score"] == 60
    assert seen["temperature"] == ojudge.JUDGE_TEMPERATURE
    assert seen["role"] == "judge"


# ------------------------------------------------------------------- экзамен

def test_exam_never_runs_the_judge_whatever_the_env_says(monkeypatch):
    """Явный `NEGO_JUDGE=1` включает судью везде, КРОМЕ экзамена."""
    monkeypatch.setenv("NEGO_JUDGE", "1")
    assert ojudge.judge_enabled() is True
    for mode in ("practice", "campaign", "custom", None, ""):
        assert ojudge.judge_enabled_for(mode) is True, mode
    assert ojudge.judge_enabled_for("exam") is False


def test_exam_gate_is_on_the_server_not_in_the_orchestrators_head(monkeypatch):
    """Оркестратор обязан спрашивать про РЕЖИМ СТОЛА, а не про глобальный ключ.

    Проверяется вызовом: судья замещён ловушкой, экзаменационная партия делает
    настоящий ход — ловушка не должна сработать ни разу.
    """
    from app.orchestrator import negotiation

    called: list = []

    async def trap(*a, **kw):
        called.append(a)
        return {"arg_score": 99, "interest_targeted": 0, "secondary_conceded": None,
                "criteria_legitimate": None, "tradeoff_real": None, "batna_real": None}

    monkeypatch.setenv("NEGO_JUDGE", "1")
    monkeypatch.setattr(negotiation, "judge_turn", trap)

    for mode, expect in (("practice", 1), ("exam", 0)):
        sess = RealtimeSession(session_id=f"sess_{mode}",
                               engine_session=engine.create_session("supplier", "ru"),
                               lang="ru", game_mode=mode)
        orch = negotiation.NegotiationOrchestrator(sess)
        called.clear()
        asyncio.run(orch.on_player_turn("Почему для вас так важна стабильная загрузка производства?"))
        assert len(called) == expect, f"режим {mode}: судью позвали {len(called)} раз"


def test_exam_capabilities_do_not_promise_a_judge(monkeypatch):
    """Второй принцип: бейдж «судит ИИ по смыслу» рисуется только если судья есть.

    На экзамене его нет, значит `session.created.capabilities.judge` обязан
    приехать `false` — иначе интерфейс пообещает слой, которого не существует.
    """
    monkeypatch.setenv("NEGO_JUDGE", "1")
    client = TestClient(app)
    for mode, expect in (("practice", True), ("exam", False)):
        with client.websocket_connect("/v1/realtime") as ws:
            ws.send_json({"type": "session.init",
                          "payload": {"mode": "text", "scenarioId": "supplier",
                                      "lang": "ru", "gameMode": mode}})
            created = None
            for _ in range(6):
                msg = ws.receive_json()
                if msg["type"] == "session.created":
                    created = msg
                    break
            assert created is not None, f"{mode}: сессия не создалась"
            assert created["capabilities"]["judge"] is expect, mode
            ws.send_json({"type": "session.close"})


# ------------------------------------------------- почему это вообще важно

#: Эталонная партия из лестницы качества. Пять ходов — та самая длина, на
#: которой дрожь судьи ±5 очков на ход даёт размах среднего в 10 очков.
_FIXTURE = (Path(__file__).resolve().parents[3]
            / "frontend" / "test" / "fixtures" / "games.json")


def _good_game_lines() -> list[str]:
    data = json.loads(_FIXTURE.read_text(encoding="utf-8"))
    return next(g for g in data["ladder"]["games"] if g["id"] == "good")["lines"]


def _play(lines: list[str], judge_scores: list[int] | None = None) -> dict:
    sess = engine.create_session("supplier", "ru")
    for i, text in enumerate(lines):
        if sess.state.status != "active":
            break
        sess.turn += 1
        judge = None
        if judge_scores is not None:
            judge = {"arg_score": judge_scores[i], "interest_targeted": None,
                     "secondary_conceded": None, "criteria_legitimate": None,
                     "tradeoff_real": None, "batna_real": None}
        engine.apply_move(sess, analyze(text), text, judge=judge)
    return engine.score_session(sess)


def test_an_exam_replayed_twice_gives_the_same_debrief():
    """Что, собственно, куплено выключением судьи: партия без него — функция.

    Тот же сценарий и тот же порядок реплик обязаны давать разбор, совпадающий
    целиком, а не «примерно». Это и есть смысл сертификата.
    """
    lines = _good_game_lines()
    assert _play(lines) == _play(lines)


def test_a_five_point_wobble_per_turn_is_enough_to_move_the_grade():
    """Обоснование решения, записанное арифметикой, а не в комментарии.

    Баллы взяты из ЖИВОГО прогона (`tools/judge_spread.py --mode games
    --game good`): две трассы, отличающиеся на один шаг сетки модели в двух
    ходах из пяти. Ниже проверяется не грейд конкретной партии — балансу
    позволено меняться, — а сама чувствительность: среднее качество аргумента
    входит в технику через `round(14 · avg / 100)`, то есть шаг округления
    стоит 7.14 очка среднего, а на пятиходовой партии дрожь ±5 на ход даёт
    ровно такой размах. Если однажды это перестанет быть правдой — техника
    станет нечувствительной к судье, и тест обязан об этом сказать.
    """
    lines = _good_game_lines()
    low = _play(lines, [55, 65, 10, 75, 55])     # avg 52.0
    high = _play(lines, [65, 65, 10, 75, 75])    # avg 58.0
    assert high["technique"] > low["technique"], (
        "дрожь судьи перестала доезжать до техники — проверь вес avg_arg "
        "в score_session и обоснование в docs/judge-reproducibility.md")
    # …и при этом итоговое число может не шевельнуться вовсе: в замере
    # `overall` был 74 во всех 36 прогонах, а грейд ходил между B и C.
    assert abs(high["overall"] - low["overall"]) <= 1


@pytest.mark.parametrize("avg,expected_step", [(49.9, 7), (53.6, 8), (60.7, 8), (64.3, 9)])
def test_the_rounding_step_of_the_argument_term_is_7_14_points(avg, expected_step):
    """Тот самый уступ, на котором грейд и переворачивался.

    Держим его явным числом: пока шаг стоит 7.14 очка среднего, короткая партия
    с живым судьёй остаётся на границе, и выключать его на экзамене — не
    перестраховка.
    """
    from app.engine.engine import _js_round
    assert _js_round((avg / 100) * 14) == expected_step
