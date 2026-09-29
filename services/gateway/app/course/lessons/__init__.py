"""lessons — учебные материалы к урокам курса: приём, фразы, пример, ошибки, границы.

Урок в `blocks.py` объясняет, как приём устроен в тренажёре. Материал отсюда
учит самому приёму так, чтобы его можно было применить в тот же день: зачем он,
как работает, КАК ЭТО ЗВУЧИТ, плохой и хороший вариант одного разговора, типичные
ошибки и где приём не работает. Схема подключения к `blocks.py` — README.md рядом.

По файлу на урок; имя файла — ключ урока: `<блок>_<номер>.py`, дефис в id блока
становится подчёркиванием (`spin-ladder`, урок 4 → `spin_ladder_4.py`). В файле
ровно одно имя, которое читает загрузчик, — `MATERIAL`. Файлы с подчёркиванием в
начале имени — служебные.
"""

from __future__ import annotations

import importlib
import pkgutil
from dataclasses import asdict

from app.course.lessons._model import LessonMaterial


def module_name(block: str, lesson: int) -> str:
    """Имя файла урока без `.py` — ключ урока в имени."""
    return f"{block.replace('-', '_')}_{lesson}"


def load_all() -> dict[tuple[str, int], LessonMaterial]:
    """Все материалы каталога по ключу `(блок, номер урока)`.

    Файл, чьё имя не совпадает с ключом внутри него, — ошибка сразу, а не
    тихий пропуск: иначе урок `spin_ladder_4.py` с `lesson=5` внутри подменил бы
    чужой урок, и на экране стоял бы не тот текст.
    """
    out: dict[tuple[str, int], LessonMaterial] = {}
    for info in pkgutil.iter_modules(__path__):
        if info.name.startswith("_"):
            continue
        mod = importlib.import_module(f"{__name__}.{info.name}")
        material = getattr(mod, "MATERIAL", None)
        if not isinstance(material, LessonMaterial):
            raise TypeError(f"{info.name}.py: нет MATERIAL типа LessonMaterial")
        expected = module_name(material.block, material.lesson)
        if info.name != expected:
            raise ValueError(f"{info.name}.py несёт урок {material.key}; файл обязан "
                             f"называться {expected}.py")
        out[material.key] = material
    return out


def material_for(block: str, lesson: int) -> LessonMaterial | None:
    """Материал к уроку или None, если его ещё не написали."""
    return load_all().get((block, lesson))


def as_dict(material: LessonMaterial | None) -> dict | None:
    """Форма для браузерного зеркала (`tools/sync_course.py`): JSON как есть.

    `moves` у фраз не выбрасываются: это те же чипы приёмов, что игрок видит под
    полем ввода, и рядом с фразой урока они говорят «в партии это засчитают
    так-то» — тем же словарём, что и стол.
    """
    return None if material is None else asdict(material)
