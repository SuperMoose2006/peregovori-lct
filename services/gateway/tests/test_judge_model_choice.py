"""Кто судит ход — и почему именно он.

29 августа 2026 дефолт роли `judge` сменился с `google/gemini-3.5-flash-lite` на
`google/gemini-2.5-flash-lite`. Причина не в скорости и не в цене (хотя и в них
претендент не хуже), а в том, что прежняя модель НЕ ЧИТАЛА русский объективный
критерий: реплика «по рыночным данным медиана независимых прайсов 87, потому что
это отраслевой стандарт» получала у неё медиану 10 из 100 на всех 27 встречах в
эталонных партиях — все ниже `CRITERIA_EVENT_MIN`, за которым движок засчитывает
критерий событием и двигает цену. Тот же приём по-английски она же оценивала на
55. Замер и арифметика — `docs/model-bakeoff.md`.

ЧЕГО ЗДЕСЬ НЕТ И БЫТЬ НЕ МОЖЕТ: живого разброса. Набор офлайновый
(`conftest.py` ставит `NEGO_AI=off`), сети нет. Значит тест держит НАСТРОЙКУ и её
обоснование — ровно тот же приём, что в `test_judge_reproducibility.py`.

ОТДЕЛЬНО — ПРО ПРИБОР, которым решение принято. Замер стоит ровно столько,
сколько стоят его защиты, и две из них едва не подвели прямо в этом прогоне:

  * режим `games` ИГНОРИРОВАЛ `--lang`: язык всегда брался из поля `mirror`
    фикстуры, и `--lang en` возвращал русские числа. Половина замера, которой не
    было, выглядела бы сделанной — а именно английская половина и показала, что
    дефект языковой, а не рубричный;
  * счётчик вето считал КАЖДОЕ поле `false`, включая `batna_real` на репликах без
    BATNA. Такое «вето» не отменяет ничего (`judged()` — это `has(k) and not
    veto`), но давало по дюжине на партию из шести ходов у обеих моделей.

Обе защиты проверяются здесь, потому что обе — чистые функции над фикстурой.
"""

from __future__ import annotations

import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
_TOOLS = _BACKEND / "tools"
if str(_TOOLS) not in sys.path:
    sys.path.insert(0, str(_TOOLS))

from app.engine.engine import CRITERIA_EVENT_MIN  # noqa: E402
from app.orchestrator.judge import judge_enabled_for  # noqa: E402
from app.protocol import REPRODUCIBLE_MODES  # noqa: E402
from app.providers.routing import _DEFAULTS, model_for  # noqa: E402

import judge_spread as JS  # noqa: E402

DOC = _BACKEND.parents[1] / "docs" / "model-bakeoff.md"

#: Модель, снятая с роли замером. Держится константой, чтобы «вернулась молча»
#: было падением теста, а не открытием на демо.
REJECTED_JUDGE = "google/gemini-3.5-flash-lite"
CHOSEN_JUDGE = "google/gemini-2.5-flash-lite"


# ------------------------------------------------------------------ настройка

def test_the_judge_role_runs_the_model_the_bakeoff_chose():
    assert _DEFAULTS["judge"] == CHOSEN_JUDGE
    assert _DEFAULTS["judge"] != REJECTED_JUDGE, (
        "судьёй снова стоит модель, которая по-русски ставит объективному "
        "критерию 10 из 100 — ниже порога, за которым движок двигает цену")


def test_the_choice_is_argued_in_the_document_that_the_code_points_at():
    """Комментарий в `routing.py` ссылается на замер — замер обязан существовать
    и называть обе модели. Иначе через месяц останется только утверждение."""
    routing = (_BACKEND / "app" / "providers" / "routing.py").read_text(encoding="utf-8")
    assert "docs/model-bakeoff.md" in routing
    doc = DOC.read_text(encoding="utf-8")
    assert f"`{CHOSEN_JUDGE}`" in doc and f"`{REJECTED_JUDGE}`" in doc


def test_the_document_quotes_the_engine_threshold_and_not_a_memory_of_it():
    """Весь аргумент держится на одном числе: балл ниже `CRITERIA_EVENT_MIN` не
    засчитывает критерий событием. Если порог в движке подвинут, а в документе
    осталось прежнее число, обоснование говорит о другом движке."""
    doc = DOC.read_text(encoding="utf-8")
    assert f"= {CRITERIA_EVENT_MIN}" in doc or f"порог {CRITERIA_EVENT_MIN}" in doc, (
        f"документ не называет порог {CRITERIA_EVENT_MIN}, на котором стоит вывод")


def test_swapping_the_judge_model_cannot_reach_a_graded_run(monkeypatch):
    """Смена судьи касается ТОЛЬКО практики.

    В зачётной партии семантического судьи нет вовсе, что бы ни стояло в
    переменной, — значит замена модели не может сдвинуть ни один сертификат.
    Это же и цена решения: там, где грейд обязан быть воспроизводим, новый
    судья ничего не улучшает, потому что старого там тоже не было.
    """
    for model in (CHOSEN_JUDGE, REJECTED_JUDGE, "какая-угодно/модель"):
        monkeypatch.setenv("NEGO_MODEL_JUDGE", model)
        assert model_for("judge") == model
        for mode in REPRODUCIBLE_MODES:
            assert judge_enabled_for(mode) is False, (mode, model)


# --------------------------------------------------------------------- прибор

def test_the_instrument_can_actually_play_both_languages():
    """`--lang en` обязан давать английские реплики, а не молча русские.

    Это не гигиена: вывод «дефект языковой» получен сравнением двух половин, и
    при молчащем `--lang` обе половины были бы одной.
    """
    ru_scenario, ru_lang, ru_lines = JS._fixture_lines("good", "ru")
    en_scenario, en_lang, en_lines = JS._fixture_lines("good", "en")
    assert (ru_lang, en_lang) == ("ru", "en")
    assert ru_scenario == en_scenario
    assert ru_lines != en_lines
    assert any("ы" in ln or "и" in ln for ln in ru_lines)
    assert not any("ы" in ln for ln in en_lines)

    # Без указания языка — половина `mirror`, по которой посчитаны эталоны.
    assert JS._fixture_lines("good")[2] == ru_lines


def test_the_instrument_plays_the_whole_ladder_and_every_principled_table():
    """Вывод о ПОРЯДКЕ нельзя получить по одной партии, а инвариант 2 — по
    одному столу. Обе развёртки обязаны существовать командой."""
    ladder = JS.expand_games("all")
    assert ladder[0] == "passive" and ladder[-1] == "exemplary"
    assert len(ladder) == 7
    principled = JS.expand_games("principled.all")
    assert len(principled) == 9
    assert "note" not in " ".join(principled)
    for game in ladder + principled:
        scenario, lang, lines = JS._fixture_lines(game)
        assert lines and lang == "ru", game


def test_the_reference_to_a_principled_game_is_split_not_sliced():
    """`@principled.<id>` разбирается по точке, а не срезом по длине префикса.

    Срез молча съедает букву при опечатке и подсовывает ключ, которого в
    фикстуре нет; ошибка вылезет только там, где повезёт с буквами.
    """
    assert JS._game_spec("good") == ("ladder", "good")
    assert JS._game_spec("principled.salary") == ("principled", "salary")
    assert JS._game_spec("principled.candidate_offer") == ("principled", "candidate_offer")
    # Образцовая партия лестницы — ССЫЛКА на принципиальную партию того же стола,
    # и обе развёртки обязаны дать одни и те же реплики.
    assert JS._fixture_lines("exemplary") == JS._fixture_lines("principled.supplier")


def test_only_a_veto_that_cancels_something_is_counted():
    """`batna_real: false` на реплике без BATNA не отменяет ничего.

    Первый вариант счётчика считал сырые `false` и выдавал по дюжине вето на
    партию из шести ходов у ОБЕИХ моделей — то есть «модель-цензор» получалась
    из аккуратного заполнения полей JSON. Считаем только сработавшее.
    """
    rows = [{
        "temperature": 0.0, "game": "t", "lang": "ru",
        "runs": [{"turns": [
            # Вето по приёму, который разборщик ВИДЕЛ, — считается.
            {"judge": 60, "keyword": 64, "moves": ["objective_criteria"],
             "substantive": ["objective_criteria"], "vetoed": ["criteria_legitimate"]},
            # Вето по приёму, которого в реплике НЕТ, — в счёт не идёт.
            {"judge": 60, "keyword": 30, "moves": ["tradeoff"],
             "substantive": ["tradeoff"], "vetoed": []},
        ]}],
    }]
    got = JS._disagreements(rows)
    assert got["vetoed_turns"] == 1
    assert got["vetoes"] == {"criteria_legitimate": 1}


def test_a_criterion_scored_below_the_engine_threshold_is_reported_as_killed():
    """Главный счёт замера: балл ниже порога отменяет засчитанный критерий.

    Проверяется на границе, а не «где-то ниже»: ровно `CRITERIA_EVENT_MIN` — это
    ещё событие (`>=`), на очко меньше — уже нет.
    """
    def one(score: int) -> dict:
        return {"temperature": 0.0, "game": "t", "lang": "ru", "runs": [{"turns": [
            {"judge": score, "keyword": 64, "moves": ["objective_criteria"],
             "substantive": ["objective_criteria"], "vetoed": []},
        ]}]}

    assert JS._disagreements([one(CRITERIA_EVENT_MIN)])["criteria_killed"] == 0
    assert JS._disagreements([one(CRITERIA_EVENT_MIN - 1)])["criteria_killed"] == 1
    assert JS._disagreements([one(CRITERIA_EVENT_MIN - 1)])["criteria_turns"] == 1


def test_an_empty_line_scored_above_a_technique_is_counted_as_a_contradiction():
    """Тот вопрос, с которого начался спор о моделях: пустышка выше приёма."""
    rows = [{"temperature": 0.0, "game": "t", "lang": "ru", "runs": [{"turns": [
        {"judge": 15, "keyword": 64, "moves": ["objective_criteria"],
         "substantive": ["objective_criteria"], "vetoed": []},
        {"judge": 25, "keyword": 5, "moves": ["statement"], "substantive": [], "vetoed": []},
    ]}]}]
    got = JS._disagreements(rows)
    assert got["pairs"] == 1 and got["empty_above_substantive"] == 1
    assert got["median_substantive"] == 15 and got["median_empty"] == 25
