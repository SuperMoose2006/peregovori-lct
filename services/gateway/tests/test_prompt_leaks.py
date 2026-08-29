"""Промпт оппонента не знает того, что игрок обязан ДОБЫТЬ.

ЗАЧЕМ. Вся игра держится на том, что три интереса второй стороны скрыты, а её
красная линия — тайна. Стоит любому из этих фактов попасть в системный промпт,
и модель их выдаст: не потому, что сломается, а потому, что языковая модель
охотно пересказывает то, что ей сообщили. Упражнение при этом останется на вид
целым — реплики складные, метрики считаются, — и обесценится молча.

Сейчас `views.build_facts` собран правильно: он кладёт только УЖЕ ВЫВЕДЕННЫЕ
интересы и текущее предложение на столе. Этот файл не чинит дефект, он держит
дверь: одна лишняя строка в словаре фактов завтра — и тест назовёт её вслух.

ЧТО СЧИТАТЬ УТЕЧКОЙ, А ЧТО НЕТ. Проверяется СИСТЕМНЫЙ промпт и ориентир
реакции — то, что целиком сочинил движок. Стенограмма не проверяется намеренно:
в ней слова самого игрока, и его собственные числа оппонент слышал по-честному.
Красная линия оппонента считается утечкой, только если она не совпадает с
предложением на столе: дойдя до неё, он называет её вслух законно.
"""
from __future__ import annotations

import re

import pytest

from app.ai import build_prompts
from app.engine import engine
from app.engine.scenarios import SCENARIOS
from app.engine.techniques import analyze
from app import views

LANGS = ("ru", "en")

#: Реплики, которые ведут игру вперёд и вскрывают часть интересов, — чтобы
#: проверка шла не только по нетронутому состоянию, но и по такому, где часть
#: тайн уже раскрыта и в промпт законно попала.
MOVES = {
    "ru": ["Здравствуйте! Спасибо, что нашли время.",
           "Что для вас важнее всего в этой сделке?",
           "А почему для вас важен именно этот срок?",
           "Чем это оборачивается, если так и останется?",
           "По рынку такие условия идут дешевле.",
           "Если я возьму доставку на себя, вы сдвинетесь по цене?"],
    "en": ["Hello! Thanks for making the time.",
           "What matters most to you in this deal?",
           "Why is that timing so important for you?",
           "What does that cost you if nothing changes?",
           "The market rate for this is lower.",
           "If I cover delivery, would you move on price?"],
}


def _digits(x) -> str:
    """Число как оно попало бы в текст — без хвостового нуля у целых."""
    return str(int(x)) if float(x) == int(x) else str(x)


def _mentions(text: str, number: str) -> bool:
    """Названо ли ИМЕННО это число, а не кусок соседнего.

    Первая редакция искала простым вхождением, и красная линия «6» нашлась
    внутри «16.0», лежавшего на столе. Два стола из девяти сообщили об утечке,
    которой не было. Границей служит любой символ, не входящий в запись числа.
    """
    return re.search(rf"(?<![\d.,]){re.escape(number)}(?![\d.,])", text) is not None


@pytest.mark.parametrize("lang", LANGS)
@pytest.mark.parametrize("sc", SCENARIOS, ids=lambda s: s.id)
def test_the_prompt_never_carries_the_floor_or_an_unrevealed_interest(sc, lang: str) -> None:
    sess = engine.create_session(sc.id, lang)
    all_interests = sc.hidden_interests[lang]

    for text in MOVES[lang]:
        if sess.state.status != "active":
            break
        sess.turn += 1
        result = engine.apply_move(sess, analyze(text), text)

        facts = views.build_facts(sess, result)
        facts["fallback"] = result.fallback if hasattr(result, "fallback") else ""
        system, _user = build_prompts(facts)
        # Ориентир реакции — тоже сочинение движка, проверяем вместе с системным.
        checked = system + "\n" + str(facts.get("fallback") or "")

        # 1) Красная линия оппонента.
        floor = _digits(sc.opponent_reservation)
        if _digits(sess.state.offer_opp) != floor:
            assert not _mentions(checked, floor), (
                f"{sc.id}/{lang}, ход {sess.turn}: красная линия {floor} попала в промпт, "
                f"а на столе лежит {sess.state.offer_opp}")

        # 2) Цель и красная линия ИГРОКА — его тайна, оппонент их не знает.
        for secret, what in ((sc.player_target, "цель игрока"),
                             (sc.player_reservation, "красная линия игрока")):
            num = _digits(secret)
            if _digits(sess.state.offer_opp) != num:
                assert not _mentions(checked, num), (
                    f"{sc.id}/{lang}, ход {sess.turn}: {what} ({num}) попала в промпт")

        # 3) Интересы, которых игрок ещё не вывел.
        #
        # Список выведенных берётся ИЗ СОСТОЯНИЯ ПАРТИИ, а не из словаря
        # фактов. Первая редакция спрашивала у самого проверяемого словаря — и
        # пропустила подложенную утечку: код, положивший в промпт все три
        # интереса, заодно объявил их все выведенными, а тест ему поверил.
        # Сторож, берущий оракул у подсудимого, оправдывает всегда.
        revealed = {all_interests[i] for i in sess.state.interests_found
                    if 0 <= i < len(all_interests)}
        for i, interest in enumerate(all_interests):
            if interest in revealed:
                continue
            assert interest not in checked, (
                f"{sc.id}/{lang}, ход {sess.turn}: нераскрытый интерес №{i} "
                f"«{interest[:40]}…» попал в промпт")


@pytest.mark.parametrize("lang", LANGS)
def test_a_revealed_interest_is_allowed_in_the_prompt(lang: str) -> None:
    """Обратная сторона: выведенный интерес попасть в промпт ОБЯЗАН.

    Без этой половины предыдущий тест удовлетворился бы промптом, из которого
    выкинуто всё подряд, — и оппонент перестал бы помнить то, что игрок из него
    вытащил. Проверка «ничего не утекло» без проверки «нужное дошло» одобряет
    пустоту.
    """
    sc = SCENARIOS[0]
    sess = engine.create_session(sc.id, lang)
    sess.state.interests_found = [0]
    result = engine.apply_move(sess, analyze(MOVES[lang][1]), MOVES[lang][1])
    facts = views.build_facts(sess, result)
    system, _ = build_prompts(facts)
    assert sc.hidden_interests[lang][0] in system, (
        "выведенный интерес не дошёл до оппонента — он забыл, что сам рассказал")
