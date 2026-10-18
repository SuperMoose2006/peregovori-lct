"""Tests for the deterministic "А что если…" what-if replay endpoint.

The engine is a pure function of (scenario, ordered moves), so re-running one
pivotal turn with a better line reveals exactly how the future diverges. These
tests pin: (1) replaying the SAME text reproduces the real play bit-for-bit,
(2) a strong interest-probe alternative beats a hostile original at the same
turn, and (3) input guards return 400.

AI stays 'off' → templated opponent lines, fully offline and reproducible.
"""

import os
os.environ.setdefault("NEGO_AI", "off")

from fastapi.testclient import TestClient

from app import engine
from app.main import app

client = TestClient(app)


def _manual_replay_branch(scenario_id: str, lang: str, moves: list[str], turn_index: int) -> dict:
    """Independent reference replay through the raw engine (mirrors the WS loop),
    so we compare the endpoint against the engine itself, not against itself."""
    sess = engine.create_session(scenario_id, lang)
    result = None
    analysis = None
    for t in moves[: turn_index + 1]:
        sess.turn += 1
        analysis = engine.analyze(t)
        result = engine.apply_move(sess, analysis, t)
    line = engine.render_line(sess, result.reaction, result.closed)
    return {
        "deltas": {
            "trust": result.deltas["trust"],
            "tension": result.deltas["tension"],
            "info": result.deltas["info"],
            "leverage": result.deltas["leverage"],
        },
        "offer_opp": sess.state.offer_opp,
        "opponent_line": line,
    }


SUPPLIER_MOVES = [
    "Здравствуйте! Расскажите, с какими сложностями по загрузке вы сталкиваетесь?",
    "Понимаю вас. А что для вас важнее всего в этой сделке?",
    "Снижайте цену немедленно, иначе мы уходим к другому поставщику. Ультиматум.",
    "По рыночным данным справедливая цена ниже.",
]


def test_replaying_same_text_matches_real_play():
    """The 'original' branch (re-running moves[turnIndex]) must equal a direct
    engine replay of the same prefix+move — the deterministic guarantee."""
    body = {
        "scenarioId": "supplier", "lang": "ru", "moves": SUPPLIER_MOVES,
        "turnIndex": 2, "altText": "любой альтернативный текст",
    }
    r = client.post("/api/whatif", json=body)
    assert r.status_code == 200
    orig = r.json()["original"]

    ref = _manual_replay_branch("supplier", "ru", SUPPLIER_MOVES, 2)
    assert orig["deltas"] == ref["deltas"]
    assert orig["state"]["offer_opp"] == ref["offer_opp"]
    assert orig["opponent_line"] == ref["opponent_line"]


def test_alt_equal_to_original_text_is_identical():
    """altText == moves[turnIndex] → the two branches are byte-identical."""
    body = {
        "scenarioId": "supplier", "lang": "ru", "moves": SUPPLIER_MOVES,
        "turnIndex": 2, "altText": SUPPLIER_MOVES[2],
    }
    j = client.post("/api/whatif", json=body).json()
    assert j["original"] == j["alternative"]


def test_endpoint_is_deterministic():
    body = {
        "scenarioId": "supplier", "lang": "ru", "moves": SUPPLIER_MOVES,
        "turnIndex": 2, "altText": "А что для вас важнее всего и почему?",
    }
    a = client.post("/api/whatif", json=body).json()
    b = client.post("/api/whatif", json=body).json()
    assert a == b


def test_strong_alternative_beats_hostile_original():
    """At turn 2 (a threat in the original), a Harvard-style interest probe must
    yield a strictly better trajectory: it uncovers an interest, lowers tension,
    builds trust, and moves the offer at least as far."""
    body = {
        "scenarioId": "supplier", "lang": "ru", "moves": SUPPLIER_MOVES,
        "turnIndex": 2,
        "altText": "А что для вас важнее всего в долгосрочном сотрудничестве и почему?",
    }
    j = client.post("/api/whatif", json=body).json()
    orig, alt = j["original"], j["alternative"]

    # Original is a threat: tension jumps, trust drops, no interest uncovered.
    assert orig["deltas"]["tension"] > 0
    assert orig["deltas"]["trust"] < 0
    assert orig["deltas"]["info"] == 0

    # Alternative uncovers an interest and cools the room.
    assert alt["deltas"]["info"] > 0
    assert alt["state"]["interests_found"] > orig["state"]["interests_found"]
    assert alt["deltas"]["tension"] < orig["deltas"]["tension"]
    assert alt["deltas"]["trust"] > orig["deltas"]["trust"]
    # Lower-is-better scenario: the alternative pushes the price at least as low.
    assert alt["state"]["offer_opp"] <= orig["state"]["offer_opp"]


def test_bad_turnindex_returns_400():
    for bad in (-1, 4, 99):
        r = client.post("/api/whatif", json={
            "scenarioId": "supplier", "lang": "ru", "moves": SUPPLIER_MOVES,
            "turnIndex": bad, "altText": "x",
        })
        assert r.status_code == 400


def test_empty_moves_returns_400():
    r = client.post("/api/whatif", json={
        "scenarioId": "supplier", "lang": "ru", "moves": [], "turnIndex": 0, "altText": "x",
    })
    assert r.status_code == 400


def test_unknown_scenario_returns_400():
    r = client.post("/api/whatif", json={
        "scenarioId": "does-not-exist", "lang": "ru", "moves": SUPPLIER_MOVES,
        "turnIndex": 2, "altText": "x",
    })
    assert r.status_code == 400


# ---- Аудит 17.10, F03: «Как было» обязано совпасть с сыгранным ходом ----------

def _judged_game(moves, judges, reputation=None):
    """Партия, как её ведёт оркестратор: судья → apply_move → журнал."""
    from app import views

    sess = engine.create_session("supplier", "ru")
    if reputation is not None:
        views.apply_reputation(sess, reputation)
    for text, judge in zip(moves, judges):
        sess.turn += 1
        result = engine.apply_move(sess, engine.analyze(text), text, judge=judge)
        sess.log.append({"role": "player", "text": text, "judge": judge,
                         "turn": sess.turn, "deltas": result.deltas})
    return sess


#: Первый ход с вердиктом судьи даёт ровно цифры аудита: доверие +9,
#: напряжение −7, информация +14, цена 97. Без вердикта — +5/−4/0 и «Ок,
#: слышу. Пока что 100 руб./шт» — то самое «Как было» из отчёта.
JUDGED_MOVES = [
    "Добрый день, рад знакомству!",
    "А что для вас важнее всего в этой сделке?",
]
JUDGES = [{"arg_score": 70, "interest_targeted": 0, "note": "n", "techniques": []}, None]


def test_the_debrief_carries_the_turns_as_they_were_played():
    from app import views

    sess = _judged_game(JUDGED_MOVES, JUDGES)
    log = views.debrief_view(sess).model_dump()["turn_log"]
    assert len(log) == 2
    assert log[0]["deltas"] == {k: sess.ledger[0]["deltas"][k]
                                for k in ("trust", "tension", "info", "leverage")}
    assert (log[0]["deltas"]["trust"], log[0]["deltas"]["tension"], log[0]["deltas"]["info"]) == (9, -7, 14)
    assert log[0]["offer_after"] == sess.ledger[0]["offer_after"]
    # Заметка и чипы в разбор не едут — движок их не читает.
    assert set(log[0]["judge"]) == set(views.JUDGE_REPLAY_KEYS)
    assert log[1]["judge"] is None


def test_the_original_branch_reproduces_a_judged_turn_exactly():
    """Без вердикта судьи переигровка давала другой ход — та самая ошибка
    аудита (доверие +5 вместо +9, информация 0 вместо +14, цена 100 вместо 97)."""
    from app import views

    sess = _judged_game(JUDGED_MOVES, JUDGES)
    log = views.debrief_view(sess).model_dump()["turn_log"]
    body = {"scenarioId": "supplier", "lang": "ru", "moves": JUDGED_MOVES, "turnIndex": 0,
            "altText": "Давайте обсудим цену."}

    blind = client.post("/api/whatif", json=body).json()["original"]
    assert (blind["deltas"], blind["state"]["offer_opp"]) != (log[0]["deltas"], log[0]["offer_after"]), (
        "сценарий теста не воспроизводит расхождение — судья ничего не менял")

    res = client.post("/api/whatif", json={**body, "judges": [e["judge"] for e in log]}).json()
    assert res["original"]["deltas"] == log[0]["deltas"]
    assert res["original"]["state"]["offer_opp"] == log[0]["offer_after"]
    assert res["original"]["state"]["interests_found"] == log[0]["interests_found"]
    assert res["original"]["judged"] is True and res["alternative"]["judged"] is False


def test_the_alternative_starts_from_the_real_pre_turn_state():
    """Ход 2 переигрывается поверх ПЕРВОГО хода с его вердиктом и с репутацией
    кампании: тем же текстом альтернатива обязана дать ровно сыгранный ход."""
    from app import views

    sess = _judged_game(JUDGED_MOVES, JUDGES, reputation=60)
    log = views.debrief_view(sess).model_dump()["turn_log"]
    res = client.post("/api/whatif", json={
        "scenarioId": "supplier", "lang": "ru", "moves": JUDGED_MOVES, "turnIndex": 1,
        "altText": JUDGED_MOVES[1], "judges": [e["judge"] for e in log], "reputation": 60,
    }).json()
    assert res["alternative"]["deltas"] == log[1]["deltas"]
    assert res["alternative"]["state"]["offer_opp"] == log[1]["offer_after"]


def test_a_foreign_judge_index_is_dropped_not_crashing():
    res = client.post("/api/whatif", json={
        "scenarioId": "supplier", "lang": "ru", "moves": JUDGED_MOVES, "turnIndex": 1,
        "altText": "Хорошо.", "judges": [{"arg_score": 900, "interest_targeted": 99}, None],
    })
    assert res.status_code == 200


def test_a_foreign_secondary_issue_id_is_dropped():
    """Чужой id предмета живой судья не возвращает никогда; движок на нём
    пропустил бы поиск по ключевым словам (ревью)."""
    from app import views

    sc = engine.by_id("supplier")
    assert views.replay_judge(sc, "ru", {"arg_score": 50, "secondary_conceded": "no-such-issue"})["secondary_conceded"] is None
    real = sc.secondary_issues[0].id
    assert views.replay_judge(sc, "ru", {"arg_score": 50, "secondary_conceded": real})["secondary_conceded"] == real


def test_too_many_judges_are_refused():
    res = client.post("/api/whatif", json={"scenarioId": "supplier", "lang": "ru", "moves": ["a"], "turnIndex": 0,
                                           "altText": "b", "judges": [None] * 25})
    assert res.status_code == 422


def test_the_turn_log_carries_each_line_and_the_reply_after_it():
    """Ход и ответ — по журналу сервера: голосом лента клиента может нести
    лишнюю реплику, и счёт по ней съезжал с записей ходов (ревью)."""
    from app import views

    sess = _judged_game(JUDGED_MOVES, JUDGES)
    first = next(i for i, e in enumerate(sess.log) if e.get("role") == "player")
    sess.log.insert(first + 1, {"role": "opp", "text": "Здравствуйте!"})  # ответ на ход 1
    sess.log.append({"role": "opp", "text": "Пока 100.", "interrupted": True})
    log = views.debrief_view(sess).model_dump()["turn_log"]
    assert [r["text"] for r in log] == JUDGED_MOVES
    assert [r["reply"] for r in log] == ["Здравствуйте!", "Пока 100."]
