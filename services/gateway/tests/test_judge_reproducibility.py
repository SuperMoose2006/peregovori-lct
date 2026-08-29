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
import itertools
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
    # Партия двуязычная; замер дрожи судьи идёт на русской половине — той же,
    # по которой посчитаны все числа в docs/judge-reproducibility.md.
    return next(g for g in data["ladder"]["games"] if g["id"] == "good")["lines"]["ru"]


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


# ------------------------------------------------ буква не зависит от судьи

#: Подмножество принципиальной партии на столе `supplier`: критерий с цифрой,
#: размен и закрытие пакетом — БЕЗ единого вопроса об интересах. Ровно тот
#: случай, ради которого потолок техники и заведён: хорошая цена при тонком
#: методе. Здесь же он офлайн воспроизводит живой замер: `overall` 77 во всех
#: прогонах, техника 44 или 45, а грейд до правки ходил между B и C.
_THIN_METHOD = (3, 4, 5)


def _principled_supplier_lines() -> list[str]:
    data = json.loads(_FIXTURE.read_text(encoding="utf-8"))
    return data["principled"]["supplier"]["ru"]


def _grid5(x: float) -> int:
    """Модель отвечает не по всей шкале, а по сетке кратных пяти (§1 замера)."""
    return max(0, min(100, int(round(x / 5.0)) * 5))


def _play_supplier(lines: list[str], scores: list[int]) -> dict:
    sess = engine.create_session("supplier", "ru")
    for i, text in enumerate(lines):
        if sess.state.status != "active":
            break
        sess.turn += 1
        engine.apply_move(sess, analyze(text), text, judge={"arg_score": scores[i]})
    return engine.score_session(sess)


def test_a_wobbling_judge_cannot_flip_the_letter_at_a_frozen_number():
    """Замер офлайн: одно и то же число 77 обязано давать одну и ту же букву.

    Живой прогон (36 партий, docs/judge-reproducibility.md §4) дал `overall` 74
    во ВСЕХ прогонах и грейд B×31 / C×5. Здесь тот же переворот воспроизведён
    без сети: три реплики, дрожь ±5 на ход по сетке кратных пяти, техника 44
    или 45 — то есть ровно по разные стороны потолка.

    До правки потолок сравнивал с 45 ЧИСЛО, в которое входит балл судьи, и
    буква доставалась игроку броском монеты. Теперь потолок смотрит на
    детерминированную часть техники, и буква одна на все прогоны — какая
    именно, тест не утверждает: балансу позволено меняться, случайности нет.
    """
    lines = [_principled_supplier_lines()[i] for i in _THIN_METHOD]
    grid = [_grid5(analyze(t).arg_quality) for t in lines]
    seen: dict[int, set[str]] = {}
    techniques: set[int] = set()
    for deltas in itertools.product((-5, 0, 5), repeat=len(lines)):
        d = _play_supplier(lines, [max(0, min(100, g + x))
                                   for g, x in zip(grid, deltas)])
        seen.setdefault(d["overall"], set()).add(d["grade"])
        techniques.add(d["technique"])
    assert len(techniques) > 1, (
        "дрожь судьи перестала доезжать до техники — партия больше не стоит "
        "на уступе, и тест мерит не то, что задумано")
    for overall, grades in sorted(seen.items()):
        assert len(grades) == 1, (
            f"при overall={overall} грейд поплыл: {sorted(grades)} — "
            "недетерминированный вход снова решает букву")


def test_the_ceiling_reads_only_what_the_engine_counted_itself():
    """Свойство, а не частный случай: балл судьи не двигает потолок.

    Прогоняем ту же партию по ВСЕЙ шкале судьи, 0…100 одним значением на все
    ходы. Техника при этом проходит сквозь старый порог 45 (38 → 52), а
    `overall` — сквозь границу B (67 → 80). До правки буква шла за числом
    судьи: C ниже 50 очков и B от 50. Метода в партии как не было, так и нет —
    ни одного вопроса об интересах, — поэтому буква обязана быть одна на всю
    шкалу.
    """
    lines = [_principled_supplier_lines()[i] for i in _THIN_METHOD]
    grades: set[str] = set()
    techniques: set[int] = set()
    for score in range(0, 101, 5):
        d = _play_supplier(lines, [score] * len(lines))
        grades.add(d["grade"])
        techniques.add(d["technique"])
    assert min(techniques) < 45 <= max(techniques), (
        "партия перестала проходить сквозь старый порог — тест мерит не то, "
        f"что задумано (техника {min(techniques)}…{max(techniques)})")
    assert grades == {"C"}, (
        f"буква пошла за баллом судьи: {sorted(grades)} на шкале 0…100")


def test_the_ceiling_still_refuses_a_price_bought_without_method():
    """Ради чего потолок существует. Цена без метода — не A/B, и точка."""
    sess = engine.create_session("supplier", "ru")
    for msg in ["Наша цена 88.", "Давайте 86.", "Ок, 86, договорились."]:
        if sess.state.status != "active":
            break
        sess.turn += 1
        engine.apply_move(sess, analyze(msg), msg, judge={"arg_score": 100})
    d = engine.score_session(sess)
    assert d["grade"] not in ("A", "B"), (
        f"цена без метода получила {d['grade']} при технике {d['technique']}")


def test_the_ceiling_threshold_is_mirrored_in_the_offline_core():
    """Инвариант 8: порог живёт в ДВУХ движках и обязан совпадать.

    Разъехаться они могут молча — браузер считает ту же партию сам, и
    расхождение всплывёт грейдом, а не ошибкой.
    """
    from app.engine.engine import TECHNIQUE_FLOOR
    mirror = (Path(__file__).resolve().parents[3]
              / "frontend" / "src" / "mock" / "engine.ts").read_text(encoding="utf-8")
    assert f"export const TECHNIQUE_FLOOR = {TECHNIQUE_FLOOR};" in mirror, (
        f"офлайн-ядро не знает порога {TECHNIQUE_FLOOR}")
    assert "techniqueMethod < TECHNIQUE_FLOOR" in mirror, (
        "офлайн-ядро сравнивает с потолком не детерминированную часть техники")


# ------------------------------------------- капстоун курса: тот же вопрос

# Решение «на экзамене судьи нет» было записано документом и проверено выше —
# и всё равно не выполнялось. Капстоун блока (`type: "drill"`) уходил в партию
# режимом `practice`, потому что режим на проводе и режим экрана были одним
# значением: экзамен по сути, обычный разбор по виду. Судья при этом двигает
# ровно те поля, по которым `course/check.py::check_drill` выносит вердикт —
# вскрытые интересы, флаги приёмов, размер уступки, — и два решающих очка
# экзамена блока доставались недетерминированному входу.
#
# Отсюда `protocol.REPRODUCIBLE_MODES`: список режимов, где итог обязан
# повторяться. Тесты ниже держат три вещи — гейт закрыт для КАЖДОГО режима из
# списка, повтор капстоуна даёт тот же вердикт, и прибор мерит не пустоту
# (та же дрожь в режиме без гейта вердикт переворачивает).

_CAPSTONE_ID = "bz-09"   # investor, 7 ходов: доля ≤ 20% · два интереса · напряжение ≤ 50


def _capstone_and_lines() -> tuple[dict, list[str]]:
    from app.course.bank import BY_ID
    item = BY_ID[_CAPSTONE_ID]
    data = json.loads(_FIXTURE.read_text(encoding="utf-8"))
    lines = data["principled"][item["scenario_id"]]["ru"][: item.get("max_turns", 8)]
    return item, lines


#: Две «настроения» судьи на одну и ту же реплику размена. Обе — законный ответ
#: модели: `tradeoff_real` это её суждение «размен настоящий или слова». Живой
#: замер (docs/judge-reproducibility.md §1) показал, что одна и та же реплика
#: получает от одной и той же модели разные ответы.
_MOOD_TRUSTS = {"arg_score": 70, "interest_targeted": None, "secondary_conceded": None,
                "criteria_legitimate": None, "tradeoff_real": None, "batna_real": None}
_MOOD_VETOES = {**_MOOD_TRUSTS, "arg_score": 65, "tradeoff_real": False}


def _play_capstone(mode: str, moods: list[dict], monkeypatch) -> dict:
    """Партия капстоуна ЧЕРЕЗ ОРКЕСТРАТОР — тем же путём, каким её играет
    человек. Возвращает вердикт `check_drill`, то есть ровно то, что видит
    экзамен блока."""
    import asyncio as _asyncio

    from app import views
    from app.course.check import check_drill
    from app.orchestrator import negotiation

    item, lines = _capstone_and_lines()
    queue = list(moods)

    async def wobbling_judge(*a, **kw):
        return queue.pop(0) if queue else dict(_MOOD_TRUSTS)

    monkeypatch.setenv("NEGO_JUDGE", "1")
    monkeypatch.setattr(negotiation, "judge_turn", wobbling_judge)

    sess = RealtimeSession(session_id=f"capstone_{mode}_{id(moods)}",
                           engine_session=engine.create_session(item["scenario_id"], "ru"),
                           lang="ru", game_mode=mode)
    orch = negotiation.NegotiationOrchestrator(sess)
    for line in lines:
        if sess.engine_session.state.status != "active":
            break
        _asyncio.run(orch.on_player_turn(line))
    return check_drill(item, views.state_view(sess.engine_session).model_dump())


def test_the_gate_covers_every_mode_that_promises_reproducibility(monkeypatch):
    """Список режимов — один, и гейт обязан читать именно его.

    Проверка `== "exam"` выглядела достаточной ровно до тех пор, пока зачётный
    режим был один. Теперь их два, и вопрос «эта партия на зачёт?» решается в
    одном месте.
    """
    from app.protocol import REPRODUCIBLE_MODES

    monkeypatch.setenv("NEGO_JUDGE", "1")
    assert ojudge.judge_enabled() is True
    assert "drill" in REPRODUCIBLE_MODES, "капстоун курса выпал из списка зачётных"
    for mode in sorted(REPRODUCIBLE_MODES):
        assert ojudge.judge_enabled_for(mode) is False, mode
    for mode in ("practice", "campaign", "custom", None, ""):
        assert ojudge.judge_enabled_for(mode) is True, mode


def test_the_capstone_never_calls_the_judge(monkeypatch):
    """Тот же вызов-ловушка, что и для экзамена: обещание проверяется ходом."""
    from app.orchestrator import negotiation

    called: list = []

    async def trap(*a, **kw):
        called.append(a)
        return dict(_MOOD_TRUSTS)

    monkeypatch.setenv("NEGO_JUDGE", "1")
    monkeypatch.setattr(negotiation, "judge_turn", trap)

    for mode, expect in (("practice", 1), ("drill", 0)):
        sess = RealtimeSession(session_id=f"drill_{mode}",
                               engine_session=engine.create_session("investor", "ru"),
                               lang="ru", game_mode=mode)
        orch = negotiation.NegotiationOrchestrator(sess)
        called.clear()
        asyncio.run(orch.on_player_turn("Почему для вас так важен размер раунда?"))
        assert len(called) == expect, f"режим {mode}: судью позвали {len(called)} раз"


def test_a_capstone_played_twice_gives_the_same_verdict(monkeypatch):
    """ГЛАВНОЕ. Экзамен блока, пройденный дважды одинаковыми репликами, обязан
    дать одинаковые очки — иначе «пройден» ничего не значит.

    Судья здесь дрожит по-настоящему: два прогона получают РАЗНЫЕ суждения на
    одну и ту же реплику, как получил их живой замер. В зачётном режиме его
    никто не спрашивает, поэтому вердикт обязан совпасть целиком.
    """
    first = _play_capstone("drill", [dict(_MOOD_TRUSTS)] * 6, monkeypatch)
    second = _play_capstone("drill", [dict(_MOOD_VETOES)] * 6, monkeypatch)
    assert first == second, (
        f"тот же капстоун, те же реплики, разный вердикт: {first} ≠ {second}")
    assert first["ok"] is True, (
        "принципиальная игра перестала проходить капстоун — тест мерит не то, "
        f"что задумано: {first}")


def test_without_the_gate_the_same_capstone_verdict_flips(monkeypatch):
    """Прибор обязан что-то мерить. Та же дрожь в режиме БЕЗ гейта — а именно
    так капстоун и уходил в партию до правки, режимом `practice`, — переворачивает
    вердикт: вето размена стоит сделки целиком.

    Это и есть цена вопроса: два очка экзамена блока решались тем, каким
    настроением модель прочитала одну реплику.
    """
    first = _play_capstone("practice", [dict(_MOOD_TRUSTS)] * 6, monkeypatch)
    second = _play_capstone("practice", [dict(_MOOD_VETOES)] * 6, monkeypatch)
    assert first != second, (
        "судья перестал доезжать до вердикта капстоуна — тест больше не "
        "объясняет, зачем нужен гейт")
    assert first["ok"] and not second["ok"], (first, second)


def _created_for(ws) -> dict:
    """Дождаться `session.created` — или сдаться на `error`.

    Без ветки на `error` тест не падал бы, а ВИС: отвергнутый `session.init`
    (например, режим, которого сервер не знает) не присылает ничего, и приёмник
    ждёт вечно. Молчащий тест хуже красного.
    """
    for _ in range(8):
        msg = ws.receive_json()
        if msg["type"] == "session.created":
            return msg
        if msg["type"] == "error":
            raise AssertionError(f"сервер отверг session.init: {msg}")
    raise AssertionError("session.created не пришёл")


def test_the_capstone_forces_layers_off_like_the_exam(monkeypatch):
    """Третий принцип на том же режиме: слои гасит СЕРВЕР, а не браузер."""
    client = TestClient(app)
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        ws.send_json({"type": "session.init", "payload": {
            "scenarioId": "investor", "lang": "ru", "gameMode": "drill",
            "layers": {"probe": True, "voice": True, "camera": True, "avatar": True},
        }})
        caps = _created_for(ws)["capabilities"]
        assert caps["voice"] is False, "капстоун не должен включать голос"
        assert caps["camera"] is False, "капстоун не должен включать камеру"
        assert caps["avatar"]["available"] is False, "капстоун не должен включать аватар"


def test_capstone_capabilities_do_not_promise_a_judge(monkeypatch):
    """Второй принцип: бейдж «судит ИИ по смыслу» на капстоуне рисовать нечем."""
    monkeypatch.setenv("NEGO_JUDGE", "1")
    client = TestClient(app)
    with client.websocket_connect("/v1/realtime") as ws:
        ws.send_json({"type": "session.init",
                      "payload": {"mode": "text", "scenarioId": "investor",
                                  "lang": "ru", "gameMode": "drill"}})
        assert _created_for(ws)["capabilities"]["judge"] is False
        ws.send_json({"type": "session.close"})


def test_the_daily_modifier_never_touches_a_graded_table():
    """Условие «стола дня» — вход партии (лимит ходов, стартовые шкалы). На
    капстоуне это меняло бы задание, доказанное прогоном движка, поэтому
    зачётная партия его не принимает — как не принимала экзаменационная."""
    from datetime import date

    from app.engine.daily import daily_table
    from app.realtime.endpoint import _build_session
    from app.realtime.events import SessionInit

    table = daily_table(date.today())
    for mode, expect_applied in (("practice", True), ("drill", False), ("exam", False)):
        sess, err = asyncio.run(_build_session(SessionInit(
            scenarioId=table.scenario_id, lang="ru", gameMode=mode,
            daily=date.today().isoformat())))
        assert err is None and sess is not None, (mode, err)
        assert (sess.daily is not None) is expect_applied, mode
