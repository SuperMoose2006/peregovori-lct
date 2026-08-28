"""Семантический судья: офлайновые пути.

Синхронная обёртка `judge_turn` из `app.ai.judge` удалена вместе со слоем
бэкендов — живой судья асинхронный (`app.orchestrator.judge`). Здесь
проверяется то, что осталось общим у обоих путей и что, собственно, защищает
движок от дешёвой модели: выключатель и ВАЛИДАЦИЯ ответа.
"""

import asyncio
import os

from app.ai.judge import _extract_json, parse_judgement
from app.orchestrator.judge import judge_enabled, judge_turn


def test_disabled_by_default(monkeypatch):
    """Явный выключатель сильнее автоопределения — в обе стороны."""
    monkeypatch.delenv("NEGO_JUDGE", raising=False)
    monkeypatch.setenv("NEGO_AI", "off")
    assert judge_enabled() is False
    monkeypatch.setenv("NEGO_JUDGE", "off")
    assert judge_enabled() is False
    for value in ("1", "on", "true", "yes"):
        monkeypatch.setenv("NEGO_JUDGE", value)
        assert judge_enabled() is True
    for value in ("0", "off", "false", "no"):
        monkeypatch.setenv("NEGO_JUDGE", value)
        assert judge_enabled() is False


def test_returns_none_without_ai(monkeypatch):
    """Без облака судья молчит, и движок берёт детерминированный keyword-балл."""
    monkeypatch.setenv("NEGO_AI", "off")
    assert asyncio.run(judge_turn("Поставщик держит цену.",
                                  "По рынку это дороже нормы.", "ru")) is None


def test_returns_none_on_empty_text():
    assert asyncio.run(judge_turn("ctx", "   ", "ru")) is None


def test_validation_clamps_and_filters(monkeypatch):
    """Валидация — то, что не даёт дешёвой модели испортить состояние игры.

    Балл зажимается в 0..100, индекс интереса проверяется по границам списка,
    приёмы выживают только из закрытого словаря.
    """
    raw = ('{"arg_score": 900, "interest_targeted": 47, "secondary_conceded": "нет-такого", '
           '"criteria_legitimate": true, "note": "ok", "techniques": ["размен", "выдумка"]}')
    got = parse_judgement(raw, "ru", interests=["a", "b"], secondary=[("term", "срок")])
    assert got["arg_score"] == 100
    assert got["interest_targeted"] is None, "индекс за границами списка обязан отсеиваться"
    assert got["secondary_conceded"] is None, "чужой id вторичного вопроса не должен проходить"
    assert got["techniques"] == ["размен"]


def test_validation_rejects_a_missing_score():
    """Без балла судить нечем — лучше keyword-путь, чем выдуманное число."""
    assert parse_judgement('{"note": "хорошо"}', "ru") is None
    assert parse_judgement("совсем не json", "ru") is None


def test_json_extraction_tolerates_fences_and_prose():
    d = _extract_json('```json\n{"arg_score": 78, "note": "хорошо", "techniques": ["критерий"]}\n```')
    assert d and d["arg_score"] == 78
    assert _extract_json("no json here") is None


def test_engine_reveals_targeted_interest_and_uses_semantic_score():
    from app import engine
    sess = engine.create_session("supplier", "ru")
    sess.state.trust = 50  # above the reveal gate
    a = engine.analyze("А что для вас важнее всего в этой сделке?")
    engine.apply_move(sess, a, judge={"arg_score": 88, "interest_targeted": 2, "criteria_legitimate": False})
    assert 2 in sess.state.interests_found          # the TARGETED interest, not index 0
    assert sess.metrics.arg_quality_sum == 88        # semantic score overrode the keyword one


def test_engine_vague_question_reveals_nothing_with_judge():
    from app import engine
    sess = engine.create_session("supplier", "ru")
    sess.state.trust = 50
    a = engine.analyze("Ну и что дальше?")
    engine.apply_move(sess, a, judge={"arg_score": 15, "interest_targeted": None})
    assert sess.state.interests_found == []          # vague → nothing uncovered


# --- Вето приёма: судья снимает начисление, которого не заслужили ------------
#
# Балл `arg_quality` судья переписывал давно, но ПРИЁМЫ до сих пор начислялись
# по словарю: попал в LEX — получи рычаг. Ниже проверяется, что явное «нет»
# судьи (`criteria_legitimate` / `tradeoff_real` / `batna_real` = False) эти
# начисления снимает, а молчание судьи (полей нет — ответ модели постарше) не
# меняет офлайновое поведение НИ НА ЕДИНИЦУ (инварианты 5 и 8).

# Критерий с опорой: `arg_quality >= 35`, иначе движок и офлайн не считает его
# событием — сравнивать было бы нечего.
CRITERIA = ("Независимый отраслевой бенчмарк показывает медиану ниже вашей цены, "
            "потому что рынок за квартал просел и данные это подтверждают.")
BATNA = "У нас есть альтернатива: другой поставщик готов работать на этих условиях."
TRADEOFF = "Если мы дадим годовой объём, вы сможете подвинуться по цене?"


def _move(text, judge_fields=None, arg_score=None):
    """Один ход в чистой сессии. Возвращает (сессия, результат, keyword-балл).

    `judge_fields is None` — офлайн. Иначе судья зовётся с ТЕМ ЖЕ баллом, что
    дал бы словарь: сравниваем именно вето, а не разницу в arg_score.
    """
    from app import engine
    sess = engine.create_session("supplier", "ru")
    a = engine.analyze(text)
    kw = a.arg_quality
    judge = None
    if judge_fields is not None:
        judge = {"arg_score": kw if arg_score is None else arg_score,
                 "interest_targeted": None, "secondary_conceded": None,
                 "criteria_legitimate": None, "tradeoff_real": None, "batna_real": None}
        judge.update(judge_fields)
    return sess, engine.apply_move(sess, a, text, judge=judge), kw


def test_criteria_veto_zeroes_the_leverage_gain():
    """«Это не настоящий критерий» → ни рычага, ни движения цены за него."""
    _, offline, _ = _move(CRITERIA)
    _, legit, _ = _move(CRITERIA, {"criteria_legitimate": True})
    _, vetoed, _ = _move(CRITERIA, {"criteria_legitimate": False})

    assert offline.deltas["leverage"] > 0, "фикстура сломана: критерий обязан давать рычаг"
    assert legit.deltas["leverage"] == offline.deltas["leverage"]
    assert vetoed.deltas["leverage"] == 0
    # …и +0.12 к уступке уходит вместе с приёмом: события нет — цена не идёт.
    assert offline.concession_fraction > 0
    assert vetoed.concession_fraction == 0
    assert vetoed.deltas["offer_opp"] == 0


def test_batna_veto_zeroes_the_leverage_gain():
    """Пустая угроза уйти — не альтернатива, даже если слово «альтернатива» есть."""
    _, offline, _ = _move(BATNA)
    _, legit, _ = _move(BATNA, {"batna_real": True})
    _, vetoed, _ = _move(BATNA, {"batna_real": False})

    assert offline.deltas["leverage"] > 0
    assert legit.deltas["leverage"] == offline.deltas["leverage"]
    assert vetoed.deltas["leverage"] == 0
    assert vetoed.deltas["tension"] == 0, "вето снимает и напряжение от блефа"


def test_tradeoff_veto_zeroes_the_concession():
    """У размена валюта другая — доверие и уступка. Вето снимает обе."""
    _, offline, _ = _move(TRADEOFF)
    _, legit, _ = _move(TRADEOFF, {"tradeoff_real": True})
    _, vetoed, _ = _move(TRADEOFF, {"tradeoff_real": False})

    assert offline.concession_fraction > 0
    assert legit.concession_fraction == offline.concession_fraction
    assert legit.deltas["trust"] == offline.deltas["trust"]
    assert vetoed.concession_fraction == 0
    assert vetoed.deltas["trust"] == 0
    assert vetoed.deltas["offer_opp"] == 0


def test_missing_veto_fields_behave_exactly_like_offline():
    """Ответ модели без новых полей = keyword-путь, число в число.

    Это и есть страховка инварианта 5: старый (или урезанный) ответ судьи не
    имеет права тихо отобрать у игрока приём. Нет мнения — работает словарь.
    """
    from dataclasses import asdict
    for text in (CRITERIA, BATNA, TRADEOFF):
        off_sess, off, kw = _move(text)
        # Судья вернул ТОЛЬКО старые поля — как модель до расширения контракта.
        j_sess, judged, _ = _move(text, {})
        assert judged.deltas == off.deltas, text
        assert judged.concession_fraction == off.concession_fraction, text
        assert asdict(j_sess.state) == asdict(off_sess.state), text
        assert j_sess.metrics.objective_criteria == off_sess.metrics.objective_criteria


def test_validation_keeps_vetoes_tri_state():
    """False — вето, отсутствие поля — молчание. Их нельзя путать."""
    strict = parse_judgement(
        '{"arg_score": 40, "criteria_legitimate": false, "tradeoff_real": false, '
        '"batna_real": false}', "ru")
    assert (strict["criteria_legitimate"], strict["tradeoff_real"], strict["batna_real"]) \
        == (False, False, False)
    silent = parse_judgement('{"arg_score": 40}', "ru")
    assert silent["criteria_legitimate"] is None
    assert silent["tradeoff_real"] is None
    assert silent["batna_real"] is None
    junk = parse_judgement('{"arg_score": 40, "criteria_legitimate": "да"}', "ru")
    assert junk["criteria_legitimate"] is None, "строка — не мнение, это шум"


#: Абзац переговорных клише: все три приёма по словарю, ни одной цифры и ни
#: одного конкретного обязательства. Четыре варианта — чтобы партия не
#: упиралась в анти-повтор и мерялось именно вето.
SPAM_LINES = (
    "По рынку и по отраслевым стандартам эта цена завышена, у нас есть альтернатива.",
    "Независимые данные показывают другую медиану, конкурент готов работать взамен на объём.",
    "Отраслевой бенчмарк и прайс рынка говорят сами за себя, другое предложение уже лежит.",
    "Объективный критерий очевиден: рыночная практика ниже, а запасной вариант у нас есть в обмен.",
)


def _spam_game(mode: str, turns: int = 8):
    from app import engine
    sess = engine.create_session("supplier", "ru")
    for i in range(turns):
        text = SPAM_LINES[i % len(SPAM_LINES)]
        a = engine.analyze(text)
        judge = None
        if mode != "offline":
            # Балл тот же, что дал бы словарь: разница в итоге — это ТОЛЬКО вето.
            judge = {"arg_score": a.arg_quality, "interest_targeted": None,
                     "secondary_conceded": None, "criteria_legitimate": None,
                     "tradeoff_real": None, "batna_real": None}
            if mode == "strict":
                judge.update(criteria_legitimate=False, tradeoff_real=False, batna_real=False)
        engine.apply_move(sess, a, text, judge=judge)
    return sess, engine.score_session(sess)


def test_keyword_spam_loses_its_payoff_under_a_strict_judge():
    """Главная проверка: спам ключевыми словами перестаёт двигать цену."""
    off_sess, off_score = _spam_game("offline")
    silent_sess, silent_score = _spam_game("silent")
    strict_sess, strict_score = _spam_game("strict")

    # Судья без новых полей — ровно офлайн: сравнение честное.
    assert silent_score == off_score
    assert silent_sess.state.offer_opp == off_sess.state.offer_opp

    start = off_sess.state.offer_opp  # supplier: чем ниже, тем лучше игроку
    assert off_sess.state.leverage > strict_sess.state.leverage + 50
    assert strict_sess.metrics.objective_criteria == 0
    assert strict_score["technique"] < off_score["technique"]
    assert strict_score["overall"] < off_score["overall"]
    # Цена: спам выдавливал из оппонента уступку, при вето — ноль движения.
    assert off_sess.state.offer_opp < strict_sess.state.offer_opp
    assert strict_sess.state.offer_opp == 100, "вето → оппонент не двинулся вовсе"
    assert start < 100
