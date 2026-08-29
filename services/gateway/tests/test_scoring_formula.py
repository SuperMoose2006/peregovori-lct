"""Инвариант 3: `overall = 0.4·economic + 0.25·relationship + 0.35·technique`.

ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ, ЕСЛИ СТОРОЖ УЖЕ БЫЛ. Был, и он пропускал правку весов.

`test_difficulty.py::test_scoring_formula_is_untouched_by_difficulty` гоняет
ОДИН стол и сравнивает с допуском `abs(overall - ожидаемое) <= 1`. Замер по
всем девяти столам: подмена весов на `0.4 / 0.26 / 0.34` двигает `overall` на
ноль или единицу (`candidate_offer` 0, `conflict` 0, `investor` 0, `supplier` 1,
`salary` 1, `freelance_rate` 1). Допуск ±1 съедает настоящую правку целиком:
мутация прошла, и единственным, кто покраснел, оказался тест свежести фикстуры —
с советом «перегенерируйте её». Совет исполним: правим оба движка,
перегенерируем — и 1413 тестов зелены на изменённых весах.

Здесь поэтому три отличия от прежнего сторожа, и каждое обязательно:

1. **Без допуска.** Формула — это равенство, а не оценка сверху. Сравнивается
   ровно то, что считает движок: `Math.floor(x + 0.5)`, потому что офлайн-ядро
   в браузере считает `Math.round`, и «половина вверх» тут не деталь.
2. **По ВСЕМ эталонным партиям**, а не по одной: восемнадцать записей фикстуры
   покрывают всю шкалу от 14 до 92, и ноль в `economic` у сорвавшихся партий
   ловит перепутанные слагаемые не хуже середины.
3. **Числа 0.4 / 0.25 / 0.35 вписаны СЮДА руками.** Это и есть смысл: сторож,
   берущий веса из проверяемого кода, доказывает лишь то, что код равен себе.
   Тот же промах уже ловили сегодня дважды — у теста утечки промпта оракул
   брался из проверяемого словаря, у теста слоёв в счёте не участвовало ни
   одного слоя.

Фикстуру считает СЕРВЕРНЫЙ движок, а сверяет с ней браузерное ядро
(`frontend/test/games.test.ts`), поэтому равенство, проверенное здесь, — это
равенство в обоих движках сразу. Симметричная проверка на стороне браузера
живёт в `frontend/test/parity.test.ts`.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from app import engine

ROOT = Path(__file__).resolve().parents[3]
FIXTURE = ROOT / "frontend" / "test" / "fixtures" / "games.scores.json"

#: Веса инварианта 3. Вписаны числом намеренно — см. шапку.
W_ECONOMIC, W_RELATIONSHIP, W_TECHNIQUE = 0.4, 0.25, 0.35


def _js_round(x: float) -> int:
    """`Math.round` из браузера: половина округляется ВВЕРХ, а не к чётному.

    Питоновский `round()` здесь не годится: `round(74.5)` даёт 74, а движок и
    офлайн-ядро дают 75. Разойтись на этом — значит уронить инвариант 8 ради
    проверки инварианта 3.
    """
    return math.floor(x + 0.5)


def _games():
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    for section in ("ladder", "principled", "first_word"):
        for name, game in data[section].items():
            yield f"{section}/{name}", game


ALL = list(_games())


def test_the_fixture_covers_more_than_the_edges():
    """Иначе проверка ниже держалась бы на двух точках.

    Замечание коммита `8c7050a` — «эталоны только F и A/B, между ними сорок
    четыре балла пустоты» — устарело: лестница пополнилась серединой. Тест
    сторожит, чтобы она оттуда не исчезла: формула, проверенная только на краях,
    проверена не полностью.
    """
    assert len(ALL) >= 18, f"эталонных партий стало {len(ALL)} — фикстура похудела"
    grades = {g["grade"] for _, g in ALL}
    assert {"A", "B", "C", "F"} <= grades, f"середина шкалы ушла из эталонов: {sorted(grades)}"


@pytest.mark.parametrize("name,game", ALL, ids=[n for n, _ in ALL])
def test_overall_is_exactly_the_weighted_sum(name: str, game: dict):
    expected = _js_round(W_ECONOMIC * game["economic"]
                         + W_RELATIONSHIP * game["relationship"]
                         + W_TECHNIQUE * game["technique"])
    assert game["overall"] == expected, (
        f"{name}: overall {game['overall']}, а "
        f"0.4·{game['economic']} + 0.25·{game['relationship']} + "
        f"0.35·{game['technique']} = {expected}")


def test_the_weights_in_the_engine_are_the_documented_ones():
    """Сама строка движка, а не только её следствия.

    Фикстуру можно перегенерировать под новые веса, и тогда проверка выше
    замолчит — она сверяет фикстуру с формулой, а обе поедут вместе. Поэтому
    рядом стоит чтение исходника: `overall` обязан складываться ровно из этих
    трёх коэффициентов, и других слагаемых у него нет.
    """
    import inspect
    import re

    src = inspect.getsource(engine.score_session)
    line = next((ln.strip() for ln in src.splitlines()
                 if re.match(r"\s*overall\s*=", ln)), None)
    assert line, "в score_session больше нет строки `overall = …` — обновите тест"

    weights = [float(x) for x in re.findall(r"(?<![\w.])(\d*\.\d+)\s*\*", line)]
    assert weights == [W_ECONOMIC, W_RELATIONSHIP, W_TECHNIQUE], (
        f"веса в движке {weights}, инвариант 3 требует "
        f"[{W_ECONOMIC}, {W_RELATIONSHIP}, {W_TECHNIQUE}]: {line}")
    for name in ("economic", "relationship", "technique"):
        assert f"* {name}" in line, f"слагаемое «{name}» ушло из формулы: {line}"


def test_the_browser_mirror_carries_the_same_weights():
    """Инвариант 8: правка формулы в одном движке — не правка формулы.

    Мутация, поставленная сразу в оба движка и закреплённая перегенерацией
    фикстуры, проходила молча. Здесь она валится: веса вписаны числом и здесь,
    и в зеркале, и совпасть «сами собой» им негде.
    """
    import re

    mirror = ROOT / "frontend" / "src" / "mock" / "engine.ts"
    line = next((ln.strip() for ln in mirror.read_text(encoding="utf-8").splitlines()
                 if re.search(r"\boverall\s*=", ln) and "*" in ln), None)
    assert line, "в mock/engine.ts не нашлось строки `overall = …` — обновите тест"

    weights = [float(x) for x in re.findall(r"(?<![\w.])(\d*\.\d+)\s*\*", line)]
    assert weights == [W_ECONOMIC, W_RELATIONSHIP, W_TECHNIQUE], (
        f"веса в офлайн-ядре {weights}, инвариант 3 требует "
        f"[{W_ECONOMIC}, {W_RELATIONSHIP}, {W_TECHNIQUE}]: {line}")
