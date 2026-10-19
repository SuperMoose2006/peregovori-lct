"""Единица цены печатается после ЛЮБОГО числа — значит, она не может быть
словом, которое согласуется с числом.

Найдено после аудита 17.10: «Конфликт отделов» и его зеркало печатали « дней
сдвига» — и стол с другой стороны открывался «2 дней сдвига», а шаг цены в
полдня давал «18,5 дней сдвига». Сокращение («дн.») читается при любом числе.
"""
import re

from app.engine.format import format_deal
from app.engine.scenarios import MIRRORS, SCENARIOS

#: Существительные, форма которых зависит от числа перед ними. После косой
#: черты это ставка («k ₽/день» — «в день»), и согласовывать там нечего.
INFLECTING = re.compile(r"(?<![/\w])(дней|дня|день|недел[ьяи]|месяц\w*|час\w*|раз[а]?|ход\w*)\b", re.I)


def test_no_unit_needs_to_agree_with_its_number():
    for sc in [*SCENARIOS, *MIRRORS]:
        unit = sc.headline.unit["ru"]
        assert not INFLECTING.search(unit), (sc.id, unit)


def test_the_days_tables_read_right_at_any_offer():
    for sc in [*SCENARIOS, *MIRRORS]:
        if "сдвиг" not in sc.headline.unit["ru"]:
            continue
        for v in (2, 3, 4, 5, 21, 2.5, 18.5):
            text = format_deal(v, sc.headline.unit["ru"], "ru")
            assert "дней" not in text and "дня" not in text, (sc.id, text)


def test_russian_table_text_writes_decimals_with_a_comma():
    """Шкала цены печатает «99,8%» (format_deal по языку), а задание стола и
    заметка об альтернативе писали «99.8%» — одно число двумя способами на
    одном экране (найдено после аудита 17.10)."""
    import dataclasses

    def walk(o, ru, out):
        if isinstance(o, str):
            if ru and re.search(r"\d\.\d", o):
                out.append(o)
        elif dataclasses.is_dataclass(o):
            for f in dataclasses.fields(o):
                walk(getattr(o, f.name), ru, out)
        elif isinstance(o, dict):
            for k, v in o.items():
                walk(v, ru or k == "ru", out)
        elif isinstance(o, (list, tuple)):
            for v in o:
                walk(v, ru, out)
        return out

    for sc in [*SCENARIOS, *MIRRORS]:
        assert walk(sc, False, []) == [], sc.id
