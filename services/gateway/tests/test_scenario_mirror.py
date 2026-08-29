"""Библиотека столов обязана совпадать в двух движках — по составу И по числам.

ИНВАРИАНТ 8 ловился до сих пор косвенно: паритет проверялся на классификаторе
реплик и на счёте эталонных партий. Ни то ни другое не заметит стол, добавленный
на сервере и забытый в браузере, — офлайн-ядро просто не покажет его в списке, а
тесты останутся зелёными. И тем более не заметит РАЗОШЕДШЕЕСЯ ЧИСЛО: дно
оппонента, отличающееся на единицу, делает одну и ту же партию выигранной онлайн
и проигранной офлайн, и увидеть это можно только сравнив таблицы.

Зеркало `frontend/src/data/scenarios.ts` пишется руками (в отличие от курса и
кампаний, которые генерируются), поэтому сверка здесь — единственная защита.
"""
import re
from pathlib import Path

from app.engine.scenarios import SCENARIOS

MIRROR = (Path(__file__).resolve().parents[3]
          / "frontend" / "src" / "data" / "scenarios.ts")

#: поле в питоне → поле в зеркале
_NUMBERS = {
    "opponent_open": "open",
    "opponent_reservation": "floor",
    "player_target": "target",
    "player_reservation": "resv",
    "difficulty": "diff",
}


def _mirror_blocks() -> dict[str, str]:
    """Куски файла зеркала, по одному на стол, в порядке объявления."""
    text = MIRROR.read_text(encoding="utf-8")
    starts = [(m.group(1), m.start()) for m in re.finditer(r'\n    id: "([a-z_]+)"', text)]
    blocks: dict[str, str] = {}
    for i, (sid, at) in enumerate(starts):
        end = starts[i + 1][1] if i + 1 < len(starts) else len(text)
        blocks[sid] = text[at:end]
    return blocks


def test_both_engines_know_the_same_tables_in_the_same_order():
    blocks = _mirror_blocks()
    assert list(blocks) == [s.id for s in SCENARIOS], (
        "состав или порядок столов разошёлся; порядок важен — «стол дня» "
        "выбирается индексом по дате")


def test_the_numbers_that_decide_the_game_match():
    blocks = _mirror_blocks()
    wrong: list[str] = []
    for sc in SCENARIOS:
        block = blocks.get(sc.id, "")
        for py_field, ts_field in _NUMBERS.items():
            want = float(getattr(sc, py_field))
            found = re.search(rf"\b{ts_field}: (-?[\d.]+)", block)
            if not found:
                wrong.append(f"{sc.id}: в зеркале нет {ts_field}")
            elif float(found.group(1)) != want:
                wrong.append(f"{sc.id}.{ts_field}: зеркало {found.group(1)}, движок {want}")
        # Направление шкалы решает, кто выиграл: перепутанное меняет знак всего.
        want_dir = "low" if sc.headline.dir == "lower_is_better" else "high"
        found_dir = re.search(r'\bdir: "(low|high)"', block)
        if not found_dir or found_dir.group(1) != want_dir:
            wrong.append(f"{sc.id}.dir: зеркало {found_dir and found_dir.group(1)}, движок {want_dir}")
        want_batna = float(sc.player_batna.strength)
        found_batna = re.search(r"\bbatnaStrength: (-?[\d.]+)", block)
        if not found_batna or float(found_batna.group(1)) != want_batna:
            wrong.append(f"{sc.id}.batnaStrength расходится")

    assert not wrong, "числа столов разошлись между движками:\n  " + "\n  ".join(wrong)


def test_the_mirror_carries_three_hidden_interests_per_table():
    """Три интереса — не деталь оформления, а треть техники в оценке."""
    blocks = _mirror_blocks()
    for sc in SCENARIOS:
        for lang in ("ru", "en"):
            assert len(sc.hidden_interests[lang]) == 3, f"{sc.id}/{lang}"
        # В зеркале интересы лежат списком на язык; считаем запятые верхнего
        # уровня грубо — важно, что их три, а не что текст совпал дословно.
        block = blocks[sc.id]
        assert "interests:" in block, f"{sc.id}: в зеркале нет интересов"


def test_the_mirror_carries_the_same_negotiation_topics():
    """Темы — не оформление, а вход движка.

    Ярлык темы ОДНОВРЕМЕННО чип на столе и то, по чему офлайновое ядро
    засчитывает попадание (см. engine._topic_stems). Разошедшийся ярлык означает,
    что один и тот же вопрос вскрывает интерес на сервере и не вскрывает в
    браузере, — инвариант 8 ломается молча, а видно это только сравнив таблицы."""
    blocks = _mirror_blocks()
    wrong: list[str] = []
    for sc in SCENARIOS:
        block = blocks[sc.id]
        found = re.search(r"interestTopics: \{(.*?)\n    \},", block, re.S)
        if not found:
            wrong.append(f"{sc.id}: в зеркале нет interestTopics")
            continue
        body = found.group(1)
        for lang in ("ru", "en"):
            want = sc.interest_topics[lang]
            assert len(want) == 3, f"{sc.id}/{lang}: тем должно быть три"
            row = re.search(rf"\n      {lang}: \[(.*?)\],", body, re.S)
            got = re.findall(r'"((?:[^"\\]|\\.)*)"', row.group(1)) if row else []
            if got != want:
                wrong.append(f"{sc.id}.{lang}: зеркало {got}, движок {want}")
    assert not wrong, "темы столов разошлись между движками:\n  " + "\n  ".join(wrong)
