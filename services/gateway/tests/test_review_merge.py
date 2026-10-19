"""test_review_merge.py — сводка «Глубокого разбора»: цитаты, слова собеседника, числа.

Сводка — то место, где ответ модели становится тем, что человек прочитает как
факт о своей партии. Поэтому здесь правило одно: в кавычках — только то, что
было сказано, слово в слово, и только там, где было сказано.
"""

from app.review.merge import Quotes, build_report


def _facts(lines, greeting="Здравствуйте. С чего начнём?"):
    out, turn = [], 0
    for role, text in lines:
        if role == "player":
            turn += 1
        out.append({"role": role, "turn": turn, "text": text, "interrupted": False})
    return {"lang": "ru", "greeting": greeting, "lines": out, "scorecard": {}}


def _report(facts, **content):
    base = {k: None for k in ("confidence", "competency", "thinking", "specificity",
                               "comprehension", "followups", "consistency", "facts")}
    base.update(content)
    return build_report(facts=facts, timing={}, content=base, voice=None, face=None,
                        channels={}, agents=[])


# ------------------------------------------------------------------ дословность

def test_a_short_word_is_not_found_inside_a_longer_one():
    q = Quotes({1: "Нужно снизить цену до минуса"})
    assert q.locate(1, "ну") is None, "«ну» не живёт внутри «нужно»"


def test_a_quote_that_drops_a_negation_is_not_the_player_s():
    q = Quotes({1: "Я не готов снижать цену"})
    assert q.locate(1, "я готов снижать цену") is None, "цитата без «не» переворачивает смысл"
    assert q.locate(1, "не готов снижать") == 1
    assert q.locate(1, "«Я НЕ готов, снижать цену!»") == 1, "регистр и знаки — не слова"


def test_an_answer_quote_from_another_turn_is_not_hung_on_the_answer():
    facts = _facts([("player", "Сначала о сроках."), ("opp", "А что с ценой?"),
                    ("player", "Цена 90 нас устроит.")])
    report = _report(facts, comprehension={"questions": [
        {"turn": 1, "question": "А что с ценой?", "answered": "full", "answer_turn": 2,
         "quote": "Сначала о сроках"}]})
    ev = next(s for s in report["soft"] if s["id"] == "comprehension")["examples"][0]
    assert ev["turn"] == 2 and "quote" not in ev, "цитата из хода 1 не доказывает ответ на ходу 2"


def test_a_contradiction_needs_two_different_turns():
    facts = _facts([("player", "Бюджет 90, и это всё."), ("opp", "Хорошо."),
                    ("player", "Бюджет 90, и это всё, повторю.")])
    report = _report(facts, consistency={"contradictions": [
        {"turn_a": 1, "quote_a": "Бюджет 90", "turn_b": 2, "quote_b": "и это всё, повторю", "note": "—"},
        {"turn_a": 2, "quote_a": "Бюджет 90, и это всё, повторю", "turn_b": 2, "quote_b": "повторю", "note": "—"}]})
    cons = next(s for s in report["soft"] if s["id"] == "consistency")
    assert len(cons["examples"]) == 1, "противоречие внутри одной реплики — не противоречие ходов"


# ------------------------------------------------------------------ слова собеседника

def test_a_counterpart_question_nobody_asked_is_not_shown_or_counted():
    facts = _facts([("player", "Давайте о цене."), ("opp", "А какой у вас бюджет?"),
                    ("player", "Около 90.")])
    report = _report(facts, comprehension={"questions": [
        {"turn": 0, "question": "С чего начнём?", "answered": "full", "answer_turn": 1},
        {"turn": 1, "question": "А какой у вас бюджет?", "answered": "partial", "answer_turn": 2},
        {"turn": 1, "question": "Почему вы так спешите?", "answered": "no", "answer_turn": 2}]})
    comp = next(s for s in report["soft"] if s["id"] == "comprehension")
    assert sorted(e["text"] for e in comp["examples"]) == ["А какой у вас бюджет?", "С чего начнём?"]
    assert comp["den"] == 2, "выдуманный вопрос не входит и в долю отвеченных"


def test_a_probe_the_counterpart_never_made_is_dropped():
    facts = _facts([("player", "Цена 90."), ("opp", "Это слишком мало."), ("player", "Тогда 92.")])
    report = _report(facts, followups={"followups": [
        {"turn": 1, "probe": "Это слишком мало", "handling": "conceded", "answer_turn": 2},
        {"turn": 1, "probe": "Вы уверены в своих цифрах?", "handling": "defensive", "answer_turn": 2}]})
    fol = next(s for s in report["soft"] if s["id"] == "followups")
    assert fol["den"] == 1 and [e["kind"] for e in fol["examples"]] == ["followup_conceded"]


def test_only_real_questions_count_as_the_player_s_questions():
    facts = _facts([("player", "Что для вас важнее всего?"), ("opp", "Сроки.")])
    report = _report(facts, thinking={"declared": [], "unspoken": [], "shifts": [], "questions": [
        {"turn": 1, "quote": "Что для вас важнее всего"},
        {"turn": 1, "quote": "А почему так дорого"}]})
    decl = next(s for s in report["soft"] if s["id"] == "declaration")
    assert decl["questions"] == 1, "«ваших вопросов» — только тех, что были"


# ------------------------------------------------------------------ взвешивание

def test_one_quote_does_not_buy_a_perfect_score_and_the_game_s_count_weighs_in():
    """Живая проверка на стенде 19.10: модель ставила 100% «созданию ценности»
    по одной цитате при нуле разменов в счёте партии. Сводка тянет оценку к
    середине, пока примеров мало, и сводит её со счётом там, где у оси есть пара."""
    facts = _facts([("player", "Можем взять больший объём, если цена будет 90."), ("opp", "Посмотрим.")])
    facts["scorecard"] = {"tradeoffs": 0, "interests_found": 0, "interests_total": 3}
    report = _report(facts, competency={"competencies": [
        {"id": "value", "score": 1.0, "pro": [{"turn": 1, "quote": "Можем взять больший объём"}], "con": []},
        {"id": "listening", "score": 0.9, "pro": [{"turn": 1, "quote": "если цена будет 90"},
                                                   {"turn": 1, "quote": "Можем взять больший объём"},
                                                   {"turn": 1, "quote": "больший объём"}], "con": []}]})
    comps = {c["id"]: c for c in report["competencies"]}
    value = comps["value"]
    assert value["model_score"] == 1.0, "число модели видно как есть"
    assert value["score"] < 0.5, f"одна цитата и ноль разменов — не {value['score']:.0%}"
    listening = comps["listening"]
    assert listening["score"] == listening["model_score"] == 0.9, \
        "три примера и нет пары в счёте — оценка модели остаётся как есть"
