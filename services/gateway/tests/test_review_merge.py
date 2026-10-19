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
