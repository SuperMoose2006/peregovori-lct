"""Бейк-офф: документ против прибора и против кода.

ЗАЧЕМ ЭТОТ НАБОР. У `docs/model-bakeoff.md` долго не было прибора: каталог, из
которого взяты числа, в репозиторий не попал, и ни одна строка таблицы не
повторялась командой. Правило репозитория «числа не правятся руками» держится не
на дисциплине, а на том, что рядом лежит команда, которой мерят. Прибор теперь
есть (`tools/bakeoff.py`), и вместе с ним появляется новый способ соврать: прибор
меряет одно, документ рассказывает другое, и расхождение молчит — обе стороны
выглядят одинаково правдоподобно.

ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ — только то, о чём можно СПРОСИТЬ У КОДА:

  * модель, объявленная в документе выбранной, стоит в `providers/routing.py`.
    Именно на этом документ уже разъезжался с кодом: выбранной была объявлена
    `mistralai/mistral-nemo`, которой в коде нет ни в одной роли;
  * документ не показывает как перезамеренную модель, которую прибор не мерит,
    и не прячет модель, которую прибор мерит;
  * сети здесь нет и быть не может (`conftest.py` ставит `NEGO_AI=off`): живой
    замер — работа прибора, а не набора тестов. Тест сторожит СОГЛАСОВАННОСТЬ.

ЧЕГО ЗДЕСЬ НЕТ. Самих чисел задержки: числа приходят прогоном и правятся только
перезамером. Тест, который сверял бы «1274 мс» с чем-то в коде, краснел бы на
исправном — а прибор, краснеющий на исправном, перестают читать.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest

_BACKEND = Path(__file__).resolve().parents[1]
_TOOLS = _BACKEND / "tools"
if str(_TOOLS) not in sys.path:
    sys.path.insert(0, str(_TOOLS))

from app.providers.routing import _DEFAULTS, PREMIUM_OPPONENT  # noqa: E402

import bakeoff  # noqa: E402

DOC = _BACKEND.parents[1] / "docs" / "model-bakeoff.md"

#: Идентификатор модели OpenRouter в тексте: только в обратных кавычках, иначе
#: в улов попадают пути вида `app/ai/sanitize.py`.
_MODEL_IN_TEXT = re.compile(r"`([a-z0-9][a-z0-9-]*/[a-z0-9][a-z0-9.\-]*)`")

#: Строка таблицы «что стоит в коде сегодня»: | `роль` | `модель` | …
#: `re.MULTILINE` обязателен: без него `^` привязан к началу ВСЕГО документа,
#: findall не находит ни одной строки, и тест краснеет на исправном документе.
_ROLE_ROW = re.compile(r"^\|\s*`(opponent|judge|vision|reasoning|asr)`\s*\|\s*`([^`]+)`",
                       re.MULTILINE)

#: Заголовки разделов с ПЕРЕЗАМЕРЕННЫМИ числами → роль прибора. Раздел, которого
#: здесь нет (история, цена, выводы), под правило «только измеримое» не подпадает.
_MEASURED_SECTIONS = {
    "Перезамер: оппонент": "opponent",
    "Перезамер: судья": "judge",
    "Перезамер: разбор и генерация сценария": "reasoning",
    "Перезамер: зрение": "vision",
}


@pytest.fixture(scope="module")
def doc() -> str:
    assert DOC.is_file(), f"нет документа {DOC}"
    return DOC.read_text(encoding="utf-8")


def _sections(text: str) -> dict[str, str]:
    """Документ → {заголовок второго уровня: тело}."""
    out: dict[str, str] = {}
    title, body = "", []
    for line in text.splitlines():
        if line.startswith("## "):
            if title:
                out[title] = "\n".join(body)
            title, body = line[3:].strip(), []
        else:
            body.append(line)
    if title:
        out[title] = "\n".join(body)
    return out


# ---------------------------------------------------------------- документ ↔ код

def test_the_doc_names_the_same_models_the_code_runs(doc):
    """Выбранная в документе модель обязана стоять в коде — все пять ролей.

    Ровно этот разъезд документ уже переживал: выбранной значилась
    `mistralai/mistral-nemo`, а `_DEFAULTS` не знал её ни в одной роли. Читатель
    видел обоснование выбора модели, которая не играет.
    """
    declared = dict(_ROLE_ROW.findall(doc))
    assert declared, ("в документе нет таблицы «роль → модель» в виде "
                      "| `opponent` | `google/...` |")
    assert declared == _DEFAULTS, (
        "документ и providers/routing.py разошлись:\n"
        f"  документ: {declared}\n"
        f"  код:      {_DEFAULTS}")


def test_the_doc_names_the_instrument_and_it_exists(doc):
    """Число без команды, которой его повторить, — это память, а не замер."""
    assert "tools/bakeoff.py" in doc, "документ не называет прибор"
    assert (_TOOLS / "bakeoff.py").is_file()
    # Команда обязана стоять в блоке кода: в прозе имя сломанной команды пишут
    # ровно так же, как имя работающей.
    blocks = re.findall(r"```.*?```", doc, flags=re.DOTALL)
    assert any("tools/bakeoff.py" in b for b in blocks), \
        "прибор упомянут только в прозе — команды для повтора нет"


def test_every_measured_section_only_shows_models_the_instrument_measures(doc):
    """Документ не показывает как перезамеренную модель, которую прибор не мерит.

    Иначе в таблице снова появится строка, за которой не стоит ни одного
    прогона, — то, с чего вся правка и начиналась.
    """
    sections = _sections(doc)
    for title, role in _MEASURED_SECTIONS.items():
        assert title in sections, f"в документе нет раздела «{title}»"
        known = set(bakeoff.MODELS[role])
        seen = set(_MODEL_IN_TEXT.findall(sections[title]))
        extra = seen - known
        assert not extra, (
            f"раздел «{title}» показывает модели, которых прибор не мерит: "
            f"{sorted(extra)}. Либо добавь их в bakeoff.MODELS[{role!r}], либо "
            f"убери из раздела перезамера.")


def test_every_model_the_instrument_measures_appears_in_the_doc(doc):
    """И наоборот: прогнали — покажи. Молча выпавшая строка это тоже расхождение."""
    measured = {m for models in bakeoff.MODELS.values() for m in models}
    missing = sorted(m for m in measured if f"`{m}`" not in doc)
    assert not missing, (
        f"прибор мерит модели, которых нет в документе: {missing}")


def test_the_premium_switch_is_documented_or_absent(doc):
    """`PREMIUM_OPPONENT` — переключатель качества в коде. Он либо назван в
    документе о выборе моделей, либо его нет в коде: третьего («в коде есть,
    в обосновании выбора не упомянут») быть не должно."""
    assert f"`{PREMIUM_OPPONENT}`" in doc, (
        f"{PREMIUM_OPPONENT} стоит в routing.py как премиум-оппонент, "
        "но документ о выборе моделей о нём молчит")


def test_the_generation_budget_quoted_in_the_doc_matches_the_code(doc):
    """`GEN_BUDGET_S` в документе — это константа, а не воспоминание."""
    from app.ai.scenario_gen import GEN_BUDGET_S

    quoted = re.findall(r"GEN_BUDGET_S\s*=\s*(\d+)", doc)
    assert quoted, "документ не называет бюджет генерации"
    assert {int(q) for q in quoted} == {int(GEN_BUDGET_S)}, (
        f"документ говорит {quoted}, код — {GEN_BUDGET_S}")


# ------------------------------------------------------------------ прибор

def test_the_instrument_measures_every_role_the_routing_has():
    """Роль без измерения — это роль, выбор модели для которой снова на памяти.

    Кроме `asr`: у неё вход аудио, а не текст, и её задержка меряется голосовым
    путём в `tools/bench_latency.py` — заводить ей вторую линейку значило бы
    получить два несравнимых числа про одно и то же.
    """
    assert set(bakeoff.MODELS) | {"asr"} == set(_DEFAULTS)


def test_the_current_default_is_on_the_bench_for_its_own_role():
    """Сравнение без действующей модели ничего не решает: не с чем сравнивать."""
    for role, models in bakeoff.MODELS.items():
        assert _DEFAULTS[role] in models, (
            f"роль {role}: дефолт {_DEFAULTS[role]} не участвует в собственном замере")


def test_a_failed_call_never_becomes_a_fast_number():
    """Главная защита прибора: ноль ответов не получает медианы.

    Ошибка прибора в этом репозитории шесть раз подряд ЛЬСТИЛА, и всегда одним
    способом — быстрый отказ выглядел быстрым ответом. Модель, которой нет у
    провайдера, отвечает 404 за двести миллисекунд.
    """
    assert bakeoff._med([], 0, 3) == "— (ответов 0/3)"
    line = bakeoff._med([200.0], 1, 3)
    assert "ответов 1/3" in line, "медиана без доли ответов — приглашение соврать"


def test_an_empty_reply_is_not_a_reply():
    """Пустой ответ модели — брак, а не «прошло санитайзер»."""
    from app.ai.sanitize import sanitize

    assert sanitize("") is None
    assert sanitize("**") is None


def test_generated_scenario_validation_rejects_more_than_bad_json():
    """`{}` — валидный JSON и непригодный сценарий. Перевёрнутый `dir` — тоже.

    Считать их «валидным ответом» значило бы объявить работающей модель, у
    которой режим «своя сделка» не запускается.
    """
    ok_json = (
        '{"title":"Кофе","counterpart_name":"Игорь","dir":"lower_is_better",'
        '"opponent_open":100,"opponent_reservation":80,"player_target":85,'
        '"player_reservation":95,"hidden_interests":["a","b","c"]}')
    assert bakeoff._gen_valid(ok_json, "lower_is_better")[0] is True
    assert bakeoff._gen_valid(ok_json, "higher_is_better")[0] is False, "перевёрнутый dir прошёл"
    assert bakeoff._gen_valid("{}", "lower_is_better")[0] is False
    assert bakeoff._gen_valid("", "lower_is_better")[0] is False
    assert bakeoff._gen_valid("совершенно не JSON", "lower_is_better")[0] is False


def test_reject_reason_separates_the_three_sanitizer_rules():
    """«Не прошла» без причины не даёт решения: чужой алфавит лечится сменой
    модели, выход из роли — сменой промпта."""
    assert bakeoff._reject_reason("для нас — 携手守护, и мы идём навстречу") == "чужой алфавит"
    assert bakeoff._reject_reason("Как языковая модель, я не могу") == "выход из роли"
    assert bakeoff._reject_reason("   ") == "пустой ответ"
