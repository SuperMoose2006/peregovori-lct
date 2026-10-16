"""Шаблонные реплики собеседника не знают его пола — и не должны его выдавать.

Пять столов из девяти — собеседница, у зеркальных столов напротив вообще другой
человек, а банк реплик один на всех. Аудит 16.10 поймал Ирину на «Понял вас» и
мужчин на «услышала»: род гулял от реплики к реплике. Тащить пол в движок
нельзя (список полей записи заперт `test_other_side.py`), поэтому банки
написаны нейтрально, а здесь это сторожится — в движке, в адаптере `views` и
в офлайн-ядре браузера, которое обязано говорить то же самое.
"""
import re
from pathlib import Path

from app import views
from app.engine import engine

GENDERED = {
    "понял", "поняла", "услышал", "услышала", "слышал", "слышала", "рад", "рада",
    "готов", "готова", "согласен", "согласна", "обязан", "обязана", "дошёл", "дошла",
    "закончил", "закончила", "ушёл", "ушла", "передумал", "передумала", "уступил",
    "уступила", "привык", "привыкла", "расположен", "расположена", "попросил",
    "попросила", "пересчитал", "пересчитала", "уверен", "уверена", "доволен", "довольна",
}
WORD = re.compile(r"[а-яё]+", re.I)
MOCK = Path(__file__).resolve().parents[3] / "frontend" / "src" / "mock" / "engine.ts"


def _ru_strings(obj, out, ru=False):
    if isinstance(obj, str):
        if ru:
            out.append(obj)
    elif isinstance(obj, dict):
        for k, v in obj.items():
            _ru_strings(v, out, ru or k == "ru")
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            _ru_strings(v, out, ru)
    return out


def _gendered(lines):
    return [l for l in lines if GENDERED & {w.lower() for w in WORD.findall(l)}]


def test_engine_bank_is_gender_neutral():
    assert _gendered(_ru_strings(engine.LINES["ru"], [], ru=True)) == []


def test_views_bank_is_gender_neutral():
    assert _gendered(_ru_strings(views._HER, [])) == []


def test_offline_core_bank_is_gender_neutral():
    src = MOCK.read_text(encoding="utf-8")
    lines = src[src.index("const LINES"):src.index("const OS_BLIND")]
    her = src[src.index("const HER: HerBank"):src.index("const HER_METER_LABELS")]
    code = "\n".join(l for l in (lines + her).splitlines() if not l.lstrip().startswith("//"))
    literals = re.findall(r'"([^"\n]*[а-яё][^"\n]*)"', code, re.I)
    assert len(literals) > 100, "банк офлайн-ядра не нашёлся — проверка мерила бы пустоту"
    assert _gendered(literals) == []
