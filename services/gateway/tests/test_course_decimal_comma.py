"""Десятичная запятая в русских текстах курса.

По-русски дробь пишется через запятую: «99,9 %», «0,4·эко». Столы и разбор это
уже соблюдают (`formatDeal`, штамп сделки), а курс писал «99.9» — так в одном
продукте одна и та же цифра выглядела двумя способами (аудит 17.10, «99.9% в
уроках курса»). Движок читает обе записи одинаково, и числовое поле упражнения
принимает запятую, поэтому правка текста ответов не меняет.

Обход идёт по ДАННЫМ курса, а не по исходникам: каждая пара `{ru, en}` из
банка, блоков, экзамена мастера и материалов уроков.
"""
import dataclasses
import re

from app.course import bank, blocks, master
from app.course import lessons

DOT = re.compile(r"\d\.\d")


def _pairs(obj, path, out, seen):
    if id(obj) in seen:
        return
    seen.add(id(obj))
    if isinstance(obj, dict):
        if set(obj) == {"ru", "en"} and isinstance(obj["ru"], str):
            out.append((path, obj["ru"]))
            return
        for k, v in obj.items():
            _pairs(v, f"{path}.{k}", out, seen)
    elif isinstance(obj, (list, tuple)):
        for i, v in enumerate(obj):
            _pairs(v, f"{path}[{i}]", out, seen)
    elif dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        for f in dataclasses.fields(obj):
            _pairs(getattr(obj, f.name), f"{path}.{f.name}", out, seen)


def _course_pairs():
    out, seen = [], set()
    for mod in (bank, blocks, master):
        for name, value in vars(mod).items():
            if not name.startswith("_"):
                _pairs(value, f"{mod.__name__}.{name}", out, seen)
    for (block, n), material in lessons.load_all().items():
        _pairs(material, f"app.course.lessons.{block}_{n}", out, seen)
    return out


def test_the_walk_reaches_the_whole_course():
    paths = [p for p, _ in _course_pairs()]
    assert len(paths) > 1000, len(paths)
    for mod in ("bank", "blocks", "master", "lessons"):
        assert any(f"app.course.{mod}" in p for p in paths), mod


def test_russian_course_texts_use_a_decimal_comma():
    bad = [f"{p}: {ru[:90]}" for p, ru in _course_pairs() if DOT.search(ru)]
    assert not bad, f"{len(bad)} строк с десятичной точкой:\n" + "\n".join(bad[:20])
