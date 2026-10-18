"""Своя сделка приходит с темами скрытых интересов.

Аудит 17.10, CE-02: брифинг и панель обещали темы, а сгенерированный стол
показывал «0 / 3» и ни одной — модель о них не спрашивали. Без тем и без
ключевых слов вскрыть интерес было нечем, кроме судьи.
"""
from __future__ import annotations

import asyncio
import json

import app.ai.scenario_gen as gen
from app.engine import engine


def _reply(**extra) -> str:
    base = {
        "title": "Ремонт квартиры", "icon": "house", "difficulty": 3,
        "role": "Вы — заказчик ремонта.", "counterpart_name": "Олег",
        "counterpart_persona": "Подрядчик.", "style": "analytical", "unit": " ₽",
        "dir": "lower_is_better", "opponent_open": 530000, "opponent_reservation": 440000,
        "player_target": 450000, "player_reservation": 500000,
        "batna_strength": 50, "batna_note": "Другой подрядчик.",
        "hidden_interests": ["Боится штрафа за просрочку", "Хочет отзыв для портфолио", "Нужна предоплата на материалы"],
        "tradeoffs": ["отзыв", "предоплата"], "briefing": "Цель — 450 000.",
    }
    base.update(extra)
    return json.dumps(base, ensure_ascii=False)


def _generate(monkeypatch, raw: str):
    from app.providers.openrouter import chat as orchat

    async def complete(*args, **kwargs):
        return raw

    monkeypatch.setattr(orchat, "complete", complete)
    return asyncio.run(gen.generate_scenario("Ремонт: остаток 500 000, компенсация 50 000", "ru"))


def test_generated_table_carries_its_interest_topics(monkeypatch):
    sc = _generate(monkeypatch, _reply(interest_topics=["Сроки", "Портфолио", "Оплата"]))
    assert sc is not None
    assert sc.interest_topics["ru"] == ["Сроки", "Портфолио", "Оплата"]
    # Вопрос по теме теперь вскрывает интерес и без судьи — как на любом столе.
    sess = engine.create_session(sc.id, "ru")
    sess.turn = 1
    line = "Что для вас важно в оплате?"
    engine.apply_move(sess, engine.analyze(line), line)
    assert 2 in sess.state.interests_found


def test_an_incomplete_topic_list_is_not_used(monkeypatch):
    """Две темы на три интереса сдвинули бы вскрытие на чужой интерес."""
    sc = _generate(monkeypatch, _reply(interest_topics=["Сроки", "Оплата"]))
    assert sc is not None and not sc.interest_topics


def test_the_prompt_asks_for_topics_in_both_languages():
    for lang in ("ru", "en"):
        assert '"interest_topics"' in gen._sys_prompt(lang)


def test_topics_given_as_one_string_are_not_split_into_letters(monkeypatch):
    sc = _generate(monkeypatch, _reply(interest_topics="Сроки, Портфолио, Оплата"))
    assert sc is not None and not sc.interest_topics


def test_the_prompt_derives_table_numbers_from_the_description():
    """Аудит 17.10, CE-01: «остаток 500 000, компенсация 50 000» — цель 470 000
    при 50 000 в брифинге. Промпт велит выводить числа из описания и называть
    их в брифинге теми же, что в полях. Гарантии это не даёт — снижает частоту."""
    assert "ВЫВОДИ ИЗ НИХ" in gen._sys_prompt("ru") and "450 000" in gen._sys_prompt("ru")
    assert "DERIVE the table numbers" in gen._sys_prompt("en")
