"""Behavioural invariant tests — Python port of legacy-node/test/engine.test.js.

All 14 behavioural assertions ported 1:1. These lock the properties a
negotiation trainer must uphold, not brittle snapshots.

Run: /root/LCT/backend/.venv/bin/python -m pytest /root/LCT/backend/tests/ -q
"""

from __future__ import annotations

from app.engine import analyze, by_id
from app.engine import engine


def play(scenario_id, lang, msgs):
    """Drive a scenario through a list of utterances; return (sess, debrief)."""
    sess = engine.create_session(scenario_id, lang)
    for text in msgs:
        if sess.state.status != "active":
            break
        a = analyze(text)
        sess.turn += 1
        engine.apply_move(sess, a, text)
        if sess.state.status == "active" and sess.turn >= sess.max_turns:
            sess.state.status = "breakdown"
    return sess, engine.score_session(sess)


# ---- Technique classifier ---------------------------------------------------

def test_detects_spin_problem_question():
    a = analyze("С какими сложностями вы сталкиваетесь в процессе?")
    assert a.spin == "problem"


def test_detects_objective_criteria():
    a = analyze("По рыночным данным это отраслевой стандарт.")
    assert "objective_criteria" in a.moves


def test_detects_batna():
    a = analyze("У нас есть другой поставщик по хорошей цене.")
    assert "batna" in a.moves


def test_detects_conditional_tradeoff():
    a = analyze("Если мы дадим годовой контракт, сможете подвинуться по цене?")
    assert "tradeoff" in a.moves


def test_detects_hostility_and_tanks_arg_quality():
    a = analyze("Это просто смешно и некомпетентно.")
    assert "hostile" in a.moves
    assert a.arg_quality < 20


def test_rewards_rationale_connectors():
    with_reason = analyze("Цена должна быть ниже, потому что это рыночный стандарт для объёма.")
    without = analyze("Цена должна быть ниже.")
    assert with_reason.arg_quality > without.arg_quality


def test_detects_english_objective_criteria():
    a = analyze("The market rate and benchmark data put this higher.")
    assert "objective_criteria" in a.moves


# ---- Engine dynamics --------------------------------------------------------

def test_empathy_raises_trust_lowers_tension():
    sess = engine.create_session("supplier", "ru")
    before_t = sess.state.trust
    before_x = sess.state.tension
    engine.apply_move(sess, analyze("Я понимаю вас и ценю вашу позицию."), "x")
    assert sess.state.trust > before_t
    assert sess.state.tension < before_x


def test_threats_raise_tension_lower_trust():
    sess = engine.create_session("supplier", "ru")
    before_t = sess.state.trust
    before_x = sess.state.tension
    engine.apply_move(sess, analyze("У вас нет выбора, иначе мы уходим. Ультиматум."), "x")
    assert sess.state.tension > before_x
    assert sess.state.trust < before_t


def test_spin_questions_uncover_interests():
    sess = engine.create_session("supplier", "ru")
    engine.apply_move(sess, analyze("Расскажите, с какими сложностями по загрузке вы сталкиваетесь?"), "x")
    assert sess.state.info > 0


def test_opponent_never_crosses_reservation_floor():
    sess, _ = play("supplier", "ru", [
        "По рыночным данным цена ниже, потому что это стандарт. Если дадим годовой контракт, подвинетесь?"
    ] * 11)
    floor = by_id("supplier").opponent_reservation
    assert sess.state.offer_opp >= floor - 0.001, \
        f"offer {sess.state.offer_opp} below floor {floor}"


# ---- Scoring / outcomes -----------------------------------------------------

def test_principled_play_grades_higher_than_aggressive():
    _, good = play("supplier", "ru", [
        "Здравствуйте! Расскажите, с какими сложностями по загрузке вы сталкиваетесь?",
        "Понимаю вас. А что для вас важнее всего в этой сделке и почему?",
        "Чем грозит нестабильная загрузка, сколько теряете, если так продолжится?",
        "По рыночным данным справедливая цена ниже, потому что это отраслевой стандарт.",
        "Если дадим годовой контракт и предоплату, сможете подвинуться до 86?",
        "Договорились на 86.",
    ])
    _, bad = play("supplier", "ru", [
        "Ваша цена смешна и некомпетентна.",
        "У вас нет выбора, иначе уходим. Ультиматум.",
        "Требую немедленно снизить, иначе разрываем.",
    ])
    assert good["overall"] > bad["overall"], f"good={good['overall']} bad={bad['overall']}"
    assert good["grade"] in ("A", "B")


def test_higher_is_better_salary_scores_good_deal():
    _, d = play("salary", "en", [
        "How was this role band set, and what does the team need most?",
        "What matters most to you in closing this hire, and why?",
        "Market data for this role and my experience put the benchmark higher, which is what I anchor on.",
        "If we tie it to a 6-month KPI review in return, would you move on base to 230?",
        "Great, we have a deal at 225.",
    ])
    assert d["status"] == "agreement"
    assert d["economic"] > 60, f"economic={d['economic']}"


def test_hostility_drives_breakdown():
    sess, _ = play("conflict", "ru", [
        "Вы врёте и это абсурд.",
        "Вы некомпетентны, это позор.",
        "Смешно, вы издеваетесь.",
    ])
    assert sess.state.status == "breakdown"


def test_repeated_line_barely_moves_opponent():
    """Anti-gaming: spamming the same line should not keep conceding."""
    from app import engine
    from app.engine.techniques import analyze as _an
    sess = engine.create_session("supplier", "ru")
    line = "По рыночным данным цена ниже, потому что это отраслевой стандарт."
    sess.turn += 1
    r1 = engine.apply_move(sess, _an(line), line)
    first_move = abs(r1.deltas["offer_opp"])
    sess.turn += 1
    r2 = engine.apply_move(sess, _an(line), line)  # exact repeat
    second_move = abs(r2.deltas["offer_opp"])
    assert second_move < first_move * 0.5  # repeat concedes far less


# ---- New content-library scenarios: playable opening + valid ZOPA -----------

def test_new_scenarios_have_playable_opening_and_valid_zopa():
    """Additive: each newer scenario must boot into an active, coherent state
    with a ZOPA that respects its direction (opponent floor reachable from the
    player's reservation, target between the two)."""
    for sid in ("rent", "used_car", "freelance_rate", "sla_renewal"):
        sc = by_id(sid)
        assert sc is not None, f"missing scenario {sid}"
        assert len(sc.hidden_interests["ru"]) == 3
        assert len(sc.hidden_interests["en"]) == 3
        sess = engine.create_session(sid, "ru")
        view = engine.to_state_view(sess)
        assert view["status"] == "active"
        assert view["offer_opp"] == sc.opponent_open
        assert view["interests_total"] == 3
        if sc.headline.dir == "lower_is_better":
            assert sc.opponent_reservation < sc.player_target < sc.player_reservation
        else:
            assert sc.player_reservation < sc.player_target < sc.opponent_reservation


# ---- Structured logrolling (secondary issues) -------------------------------

def _trade(scenario_id, line, trust=45):
    """One trade-off turn on a fresh session; return (offer swing, terms conceded)."""
    sess = engine.create_session(scenario_id, "ru")
    sess.state.trust = trust  # fix starting flexibility so runs are comparable
    sess.turn += 1
    r = engine.apply_move(sess, analyze(line), line)
    return abs(r.deltas["offer_opp"]), list(sess.state.terms_conceded)


def test_high_value_concession_moves_opponent_more_than_low_value():
    """A genuine second axis: conceding the issue the opponent values MORE
    (supplier's annual contract, opp_value 0.85) must move price more than a
    lower-value one (prepayment, opp_value 0.55), from an identical state."""
    high, high_terms = _trade("supplier", "Если дадим годовой контракт с гарантией объёма, сможете подвинуться?")
    low, low_terms = _trade("supplier", "Если добавим предоплату вперёд, сможете подвинуться?")
    assert high_terms == ["annual_contract"]
    assert low_terms == ["prepay"]
    assert high > low, f"high-value move {high} should exceed low-value {low}"


def test_terms_conceded_records_the_issue():
    """The engine logs which secondary issue was traded, and only once."""
    sess = engine.create_session("salary", "en")
    sess.state.trust = 50
    line = "If we tie it to a 6-month KPI review in return, would you move on base?"
    sess.turn += 1
    engine.apply_move(sess, analyze(line), line)
    assert sess.state.terms_conceded == ["kpi_review"]
    assert engine.to_state_view(sess)["terms_conceded"] == ["kpi_review"]
    # Re-offering the same issue does not double-count it.
    sess.turn += 1
    engine.apply_move(sess, analyze(line), line + " please")
    assert sess.state.terms_conceded == ["kpi_review"]


def test_scenario_without_secondary_issues_is_unaffected():
    """A scenario with no secondary_issues never records a concession and its
    scoring path is untouched (the package signal is skipped entirely)."""
    sc = by_id("rent")
    assert sc.secondary_issues == []
    sess = engine.create_session("rent", "ru")
    sess.turn += 1
    line = "Если подпишем договор на 11 месяцев, в обмен сможете подвинуться?"
    assert "tradeoff" in analyze(line).moves  # it IS a trade-off move
    engine.apply_move(sess, analyze(line), line)
    assert sess.state.terms_conceded == []     # but nothing structured is recorded
    assert engine.to_state_view(sess)["terms_conceded"] == []


def test_technique_floor_caps_grade_at_C_when_method_ignored():
    """A great number with no method (technique < 45) can't buy an A/B."""
    from app import engine
    from app.engine.techniques import analyze as _an
    sess = engine.create_session("supplier", "ru")
    # Land a strong price purely by naming numbers / conceding — little real technique.
    for msg in ["Наша цена 88.", "Давайте 86.", "Ок, 85, договорились."]:
        if sess.state.status != "active":
            break
        sess.turn += 1
        engine.apply_move(sess, _an(msg), msg)
    d = engine.score_session(sess)
    if d["technique"] < 45:
        assert d["grade"] in ("C", "D", "F"), f"low technique but grade {d['grade']}"
