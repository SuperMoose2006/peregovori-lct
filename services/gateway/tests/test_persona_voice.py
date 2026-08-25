"""test_persona_voice.py — оппонент обязан говорить своим голосом.

Пол персоны раньше УГАДЫВАЛСЯ по окончанию строки имени. Строка эта — «Имя,
должность», поэтому эвристика читала должность: «Ирина, глава продаж» кончается
на «продаж» → мужской голос, «Павел, основатель стартапа» → на «стартапа» →
женский. Четыре стола из восьми звучали чужим голосом, и на слух это заметно
сразу — а тестом не ловилось, потому что тестов на это не было вовсе.
"""

from __future__ import annotations

import pytest

from app import engine
from app.realtime.endpoint import _persona_is_female

#: Ожидаемый пол по КАЖДОМУ столу. Список явный: если завтра добавят сценарий,
#: тест упадёт с понятной причиной, а не промолчит.
EXPECTED = {
    "supplier": True,        # Ирина
    "salary": False,         # Дмитрий
    "conflict": False,       # Алексей
    "investor": True,        # Марина
    "rent": True,            # Наталья
    "used_car": False,       # Сергей
    "freelance_rate": False, # Павел
    "sla_renewal": False,    # Виктор
}


@pytest.mark.parametrize("scenario_id,female", sorted(EXPECTED.items()))
def test_voice_gender_matches_the_persona(scenario_id: str, female: bool) -> None:
    sc = engine.by_id(scenario_id)
    assert sc is not None, scenario_id
    assert _persona_is_female(sc) is female, (
        f"{scenario_id} ({sc.counterpart.name['ru']}): голос выбран неверно"
    )


def test_every_scenario_declares_its_gender():
    """Поле обязано быть у КАЖДОГО стола: молчаливое умолчание вернуло бы
    угадывание, из-за которого всё и началось."""
    missing = [sc.id for sc in engine.SCENARIOS
               if not isinstance(getattr(sc.counterpart, "female", None), bool)]
    assert not missing, f"без поля female: {missing}"


def test_generated_persona_falls_back_to_the_name_not_the_title():
    """У сгенерированного сценария поля может не быть — тогда догадка идёт по
    ПЕРВОМУ слову, то есть по имени, а не по должности."""
    class _CP:
        name = {"ru": "Светлана, директор по закупкам"}
    class _SC:
        counterpart = _CP()
    assert _persona_is_female(_SC()) is True

    class _CP2:
        name = {"ru": "Никита, основатель стартапа"}
    class _SC2:
        counterpart = _CP2()
    assert _persona_is_female(_SC2()) is False
