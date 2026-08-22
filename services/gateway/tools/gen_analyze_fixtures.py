#!/usr/bin/env python
"""gen_analyze_fixtures.py — эталон классификатора для браузерного зеркала.

ЗАЧЕМ. Движок живёт дважды: `engine/techniques.py` на сервере и `mock/engine.ts`
в браузере (офлайновая партия и проверка упражнений курса). Они обязаны выносить
ОДИН вердикт на одну реплику — иначе «правильный ответ» в уроке зависит от того,
была ли сеть.

Это не теория: расхождение уже находили. В TS-зеркале была проверка `substance`
(цифра или связка «потому что») на прибавку за критерий и размен, а в Python её
не было — одна и та же реплика получала 38 против 28.

Фикстура фиксирует ответ Python на корпусе реплик (весь банк курса плюс краевые
случаи), а `frontend/test/parity.test.ts` сверяет с ним TS.

    python tools/gen_analyze_fixtures.py [--check]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.course.bank import BANK  # noqa: E402
from app.engine.techniques import analyze  # noqa: E402

TARGET = Path(__file__).resolve().parents[3] / "frontend" / "test" / "fixtures" / "analyze.json"

#: Краевые случаи, которых в банке нет, но которые ломались исторически.
EDGE: list[str] = [
    "300000", "300 000", "триста тысяч", "64k", "88 ₽/шт",
    "Или вы даёте 230k, или я ухожу к конкуренту.",
    "Either you give me 230k or I walk to your competitor.",
    "По рыночным данным справедливая цена — 88 ₽/шт.",
    "The market rate is 88 per unit, from three independent price lists.",
    "Вы издеваетесь? Это смешно.",
    "This is a joke, you are not serious.",
    "да", "no", "",
    "Я вас слышу: сроки для вас критичны.",
    "I hear you: the dates are critical for you.",
]


def corpus() -> list[str]:
    out: list[str] = []
    for item in BANK:
        for key in ("reference", "bad_line", "player_line", "opponent_line"):
            if key in item:
                out += [item[key]["ru"], item[key]["en"]]
        for option in item.get("options", []) or []:
            if "ru" in option:
                out += [option["ru"], option["en"]]
    out += EDGE
    # Порядок стабильный, дубликаты убраны: фикстура не должна дрожать от правок
    # порядка в банке.
    return sorted(set(out))


def render() -> str:
    rows = []
    for text in corpus():
        a = analyze(text)
        rows.append({
            "text": text,
            "moves": a.moves,
            "primary": a.primary,
            "arg": a.arg_quality,
            "words": a.words,
            "number": a.number,
            "spin": a.spin,
        })
    return json.dumps({"source": "engine/techniques.py::analyze", "cases": rows},
                      ensure_ascii=False, indent=1) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    fresh = render()
    current = TARGET.read_text(encoding="utf-8") if TARGET.is_file() else ""
    if fresh == current:
        print("фикстура классификатора синхронна")
        return 0
    if args.check:
        print(f"РАСХОЖДЕНИЕ: {TARGET} устарел — запустите tools/gen_analyze_fixtures.py")
        return 1
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(fresh, encoding="utf-8")
    print(f"обновлено: {TARGET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
