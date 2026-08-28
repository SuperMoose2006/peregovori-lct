"""«Стол дня»: одинаковый у всех, каждый день другой, и это проверяемо.

Смысл механики — причина вернуться завтра. Она держится ровно на одном: стол
обязан быть ЧИСТОЙ ФУНКЦИЕЙ ОТ ДАТЫ. Случайный стол дал бы разным людям разные
задания в один день, а «стол дня», который у соседа другой, — не стол дня.
"""
import os
os.environ.setdefault("NEGO_AI", "off")

import asyncio
from datetime import date, timedelta
from pathlib import Path

from fastapi.testclient import TestClient

from app import engine
from app.engine.daily import MODIFIERS, apply_modifier, daily_table, day_number
from app.main import app

client = TestClient(app)


def test_the_same_day_always_gives_the_same_table():
    d = date(2026, 8, 28)
    first = daily_table(d)
    for _ in range(20):
        assert daily_table(d) == first


def test_consecutive_days_differ():
    """Иначе «стол дня» — просто стол."""
    d = date(2026, 8, 28)
    seen = [daily_table(d + timedelta(days=i)) for i in range(8)]
    assert len({t.scenario_id for t in seen}) == len(engine.SCENARIOS)


def test_the_pair_of_table_and_condition_does_not_repeat_weekly():
    """Понедельник не должен быть всегда одним и тем же.

    Множитель условия взаимно прост с числом столов, поэтому пара повторяется
    через 8×4 дня, а не через 8.
    """
    d = date(2026, 1, 1)
    pairs = {(t.scenario_id, t.modifier.id)
             for t in (daily_table(d + timedelta(days=i)) for i in range(32))}
    assert len(pairs) == len(engine.SCENARIOS) * len(MODIFIERS)


def test_day_number_counts_days_since_the_unix_epoch():
    """Ровно то число, которое браузер получает из Date.UTC / 86400000."""
    assert day_number(date(1970, 1, 1)) == 0
    assert day_number(date(1970, 1, 2)) == 1
    assert day_number(date(2026, 8, 28)) == 20693


def test_every_modifier_is_bilingual_and_explained():
    import re
    cyr = re.compile(r"[а-яА-ЯёЁ]")
    for m in MODIFIERS:
        for field in (m.label, m.note):
            assert field["ru"].strip() and field["en"].strip(), m.id
            assert not cyr.search(field["en"]), f"{m.id}: кириллица в английском"


def test_the_condition_is_an_initial_state_not_a_scoring_rule():
    """Модификатор трогает вход партии и НИЧЕГО больше.

    Та же схема, что у репутации кампании: `score_session` о нём не знает и
    знать не может — иначе стол дня перестал бы быть сравним с обычным.
    """
    import inspect
    src = inspect.getsource(engine.score_session)
    for word in ("daily", "modifier", "max_turns"):
        if word == "max_turns":
            continue  # движок вправе знать длину партии — он её и так знает
        assert word not in src, f"score_session упомянул {word}"

    for m in MODIFIERS:
        sess = engine.create_session("supplier")
        before = (sess.state.trust, sess.state.tension, sess.max_turns)
        apply_modifier(sess, m)
        after = (sess.state.trust, sess.state.tension, sess.max_turns)
        if m.id == "plain":
            assert before == after, "«как обычно» обязан не менять ничего"
        else:
            assert before != after, f"{m.id} объявлен, но ничего не делает"


def test_the_condition_never_pushes_a_meter_out_of_range():
    for m in MODIFIERS:
        for start in (0.0, 50.0, 100.0):
            sess = engine.create_session("supplier")
            sess.state.trust = start
            sess.state.tension = start
            apply_modifier(sess, m)
            assert 0.0 <= sess.state.trust <= 100.0
            assert 0.0 <= sess.state.tension <= 100.0


def test_endpoint_is_bilingual_and_answers_about_a_given_day():
    for lang in ("ru", "en"):
        r = client.get(f"/api/daily?lang={lang}&day=2026-08-28")
        assert r.status_code == 200
        body = r.json()
        assert body["day"] == "2026-08-28"
        assert body["scenario"]["id"] == daily_table(date(2026, 8, 28)).scenario_id
        assert body["modifier"]["label"] and body["modifier"]["note"]


def test_a_broken_date_falls_back_to_today_instead_of_failing():
    """Стол дня — украшение главной, а не механика: кривой параметр не 500."""
    r = client.get("/api/daily?day=не-дата")
    assert r.status_code == 200
    assert r.json()["day"] == date.today().isoformat()


#: ОБЩИЙ КОНТРАКТ С БРАУЗЕРОМ. Ровно эта таблица продублирована в
#: `frontend/test/daily.test.ts`. Она не «ожидаемые значения», а точка встречи:
#: правку расписания придётся сделать в двух местах, и потому её нельзя сделать
#: в одном — а тихая правка в одном и есть та беда, от которой стоит инвариант 8.
SCHEDULE_CONTRACT = (
    ("2026-08-28", "used_car", "tense"),
    ("2026-08-29", "freelance_rate", "plain"),
    ("2026-08-30", "sla_renewal", "short"),
    ("2026-08-31", "supplier", "tense"),
    ("2026-09-01", "salary", "plain"),
    ("2026-09-02", "conflict", "short"),
)


def test_schedule_matches_the_contract_shared_with_the_browser():
    for iso, scenario_id, modifier_id in SCHEDULE_CONTRACT:
        t = daily_table(date.fromisoformat(iso))
        assert (t.scenario_id, t.modifier.id) == (scenario_id, modifier_id), iso


def test_the_contract_is_actually_mirrored_in_the_frontend_test():
    """Половина контракта без второй половины — не контракт."""
    mirror = (Path(__file__).resolve().parents[3]
              / "frontend" / "test" / "daily.test.ts")
    text = mirror.read_text(encoding="utf-8")
    for iso, scenario_id, modifier_id in SCHEDULE_CONTRACT:
        line = f'["{iso}", "{scenario_id}", "{modifier_id}"]'
        assert line in text, f"в зеркале нет строки {line}"


# ------------------------------------------------------ условие в живой партии

def test_the_condition_actually_lands_on_the_session():
    """Подпись «короткий стол» без применённого условия — та самая ложь.

    Проверяем не намерение, а результат: партия, начатая со «столом дня»,
    обязана нести его условие в состоянии, и `capabilities.daily` обязано это
    подтверждать. Иначе карточка обещает то, чего в игре нет.
    """
    from app.realtime.endpoint import _build_session  # noqa: PLC0415
    from app.realtime.events import SessionInit

    d = date(2026, 8, 30)                       # short: восемь ходов вместо 12
    table = daily_table(d)
    assert table.modifier.id == "short", "контракт расписания изменился"

    sess, err = asyncio.run(_build_session(SessionInit(
        scenarioId=table.scenario_id, lang="ru", daily=d.isoformat())))
    assert err is None and sess is not None
    assert sess.daily == "short"
    assert sess.engine_session.max_turns == 8


def test_a_condition_cannot_be_asked_for_on_the_wrong_table():
    """Иначе «короткий стол» выпрашивался бы на любом сценарии."""
    from app.realtime.endpoint import _build_session
    from app.realtime.events import SessionInit

    d = date(2026, 8, 30)
    other = next(s.id for s in engine.SCENARIOS if s.id != daily_table(d).scenario_id)
    sess, err = asyncio.run(_build_session(SessionInit(
        scenarioId=other, lang="ru", daily=d.isoformat())))
    assert err is None and sess is not None
    assert sess.daily is None
    assert sess.engine_session.max_turns == 12


def test_the_exam_takes_no_condition_of_the_day():
    """Сертификат опирается на сопоставимость условий — здесь буквально."""
    from app.realtime.endpoint import _build_session
    from app.realtime.events import SessionInit

    d = date(2026, 8, 30)
    table = daily_table(d)
    sess, err = asyncio.run(_build_session(SessionInit(
        scenarioId=table.scenario_id, lang="ru", gameMode="exam", daily=d.isoformat())))
    assert err is None and sess is not None
    assert sess.daily is None
    assert sess.engine_session.max_turns == 12


def test_a_broken_date_in_the_payload_is_simply_ignored():
    from app.realtime.endpoint import _build_session
    from app.realtime.events import SessionInit

    sess, err = asyncio.run(_build_session(SessionInit(
        scenarioId="supplier", lang="ru", daily="позавчера")))
    assert err is None and sess is not None and sess.daily is None
