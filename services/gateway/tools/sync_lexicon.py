#!/usr/bin/env python
"""sync_lexicon.py — один словарь приёмов на два языка исполнения.

ПОЧЕМУ ЭТО ЕСТЬ. Классификатор хода жил дважды: `techniques.py` на сервере и
`lib/techniques.ts` в браузере (живые чипы под композером, офлайновый мок,
проверка упражнений курса). Списки разъехались молча — одна и та же реплика
получала разные приёмы на клиенте и на сервере, и «правильный ответ» в
упражнении переставал быть правильным в игре.

Теперь Python — единственный источник, а TS-файл ГЕНЕРИРУЕТСЯ. Тест
`tests/test_lex_parity.py` валит сборку, если сгенерированное разошлось с
лежащим в репозитории: словарь нельзя поправить на одной стороне и забыть.

    python tools/sync_lexicon.py          # переписать frontend-зеркало
    python tools/sync_lexicon.py --check  # только проверить (код 1, если стало)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.engine.techniques import LEX  # noqa: E402

TARGET = Path(__file__).resolve().parents[3] / "frontend" / "src" / "lib" / "lexicon.generated.ts"

HEADER = """// СГЕНЕРИРОВАНО. Не править руками.
// Источник: services/gateway/app/engine/techniques.py::LEX
// Обновить: cd services/gateway && python tools/sync_lexicon.py
//
// Зачем генерация: словарь приёмов обязан быть один и тот же на сервере
// (движок судит ход) и в браузере (чипы, офлайновый мок, проверка упражнений
// курса). Разъехавшиеся списки — это разный вердикт на одну реплику.

export const LEX: Record<string, string[]> = {
"""


def render() -> str:
    out = [HEADER]
    for key, words in LEX.items():
        out.append(f"  {key}: [\n")
        line = "   "
        for word in words:
            item = " " + json.dumps(word, ensure_ascii=False) + ","
            if len(line) + len(item) > 96:
                out.append(line + "\n")
                line = "   "
            line += item
        if line.strip():
            out.append(line + "\n")
        out.append("  ],\n")
    out.append("};\n")
    return "".join(out)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    fresh = render()
    current = TARGET.read_text(encoding="utf-8") if TARGET.is_file() else ""
    if fresh == current:
        print(f"словарь синхронен: {TARGET.name}")
        return 0
    if args.check:
        print(f"РАСХОЖДЕНИЕ: {TARGET} устарел — запустите tools/sync_lexicon.py")
        return 1
    TARGET.write_text(fresh, encoding="utf-8")
    print(f"обновлено: {TARGET} ({len(LEX)} групп)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
