#!/usr/bin/env python
"""sync_course.py — зеркало курса для браузера.

Курс считается на клиенте тем же движком-зеркалом, что и офлайновая партия
(инвариант: без сети продукт играбелен). Значит блоки, уроки и банк упражнений
нужны в двух местах — и, значит, второе обязано быть СГЕНЕРИРОВАННЫМ, иначе оно
разъедется с первым. Тест `tests/test_course_sync.py` валит сборку, если
зеркало устарело.

    python tools/sync_course.py          # переписать зеркало
    python tools/sync_course.py --check  # только проверить
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.course.bank import BANK  # noqa: E402
from app.course.master import MASTER, PASS_MARK  # noqa: E402
from app.course.blocks import BLOCKS  # noqa: E402

DATA = Path(__file__).resolve().parents[3] / "frontend" / "src" / "data"

#: ДВА ФАЙЛА, А НЕ ОДИН — И ЭТО НЕ ОПРЯТНОСТЬ, А КИЛОБАЙТЫ.
#:
#: Домашнему экрану нужны только блоки: счётчик «пройдено N из 10» в рейле,
#: карточка следующего шага, подбор разминки к акту кампании. Банк упражнений
#: (84 пункта со всеми формулировками и разборами на двух языках) нужен только
#: тому, кто открыл курс. Пока они лежали в ОДНОМ модуле, банк ехал на главную
#: вместе с блоками: сборщик умеет не грузить лишний модуль, но не умеет резать
#: модуль пополам.
#:
#: Разделить руками нельзя — это был бы второй источник правды, ровно то, ради
#: чего написан весь этот генератор. Поэтому режет он.
BLOCKS_TARGET = DATA / "course.blocks.generated.ts"
BANK_TARGET = DATA / "course.generated.ts"

_HEAD = """// СГЕНЕРИРОВАНО. Не править руками.
// Источник: services/gateway/app/course/{blocks,bank}.py
// Обновить: cd services/gateway && python tools/sync_course.py
"""

BLOCKS_HEADER = _HEAD + """//
// ЗДЕСЬ ТОЛЬКО БЛОКИ И УРОКИ. Их знает домашний экран — ради счётчика
// пройденного и подбора следующего шага. Банк упражнений лежит отдельно
// (course.generated.ts) и на главную не едет: он нужен тому, кто открыл курс.

import type { CourseBlock } from "../lib/courseTypes";

export const COURSE_BLOCKS: CourseBlock[] = """

BANK_HEADER = _HEAD + """//
// ЗДЕСЬ БАНК УПРАЖНЕНИЙ. Курс проверяется офлайн тем же движком-зеркалом, что и
// партия без сети, поэтому банк обязан быть здесь целиком. Правильность каждого
// пункта доказывается на стороне Python (tests/test_course_bank.py) — против
// настоящего analyze()/apply_move().

import type { Exercise } from "../lib/courseTypes";

export const COURSE_BANK: Exercise[] = """


def render_blocks() -> str:
    blocks = json.dumps([asdict(b) for b in BLOCKS], ensure_ascii=False, indent=2)
    # СКОЛЬКО УПРАЖНЕНИЙ В БЛОКЕ — здесь, а не подсчётом по банку. Профиль
    # рисует шкалу «пройдено в блоке», и ради ОДНОГО ЧИСЛА на блок тянул бы
    # весь банк на домашний экран. Число считает генератор, значит второго
    # источника правды не появляется.
    sizes = {b.id: sum(1 for x in BANK if x["block"] == b.id) for b in BLOCKS}
    return (f"{BLOCKS_HEADER}{blocks};\n\n"
            "/** Число упражнений в блоке. Считает генератор — банк для этого\n"
            " *  грузить не нужно. */\n"
            f"export const COURSE_BLOCK_SIZES: Record<string, number> = "
            f"{json.dumps(sizes, ensure_ascii=False, indent=2)};\n")


def render_bank() -> str:
    bank = json.dumps(BANK, ensure_ascii=False, indent=2)
    master = json.dumps(MASTER, ensure_ascii=False, indent=2)
    return (f"{BANK_HEADER}{bank};\n\n"
            "// Экзамен мастера: три настоящие партии подряд.\n"
            f"export const COURSE_MASTER: Exercise[] = {master};\n"
            f"export const MASTER_PASS_MARK = {PASS_MARK};\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    wanted = {BLOCKS_TARGET: render_blocks(), BANK_TARGET: render_bank()}
    stale = [path for path, text in wanted.items()
             if (path.read_text(encoding="utf-8") if path.is_file() else "") != text]
    if not stale:
        print("курс синхронен")
        return 0
    if args.check:
        print("РАСХОЖДЕНИЕ: " + ", ".join(str(p) for p in stale)
              + " устарел(и) — запустите tools/sync_course.py")
        return 1
    DATA.mkdir(parents=True, exist_ok=True)
    for path, text in wanted.items():
        path.write_text(text, encoding="utf-8")
    print(f"обновлено: {len(BLOCKS)} блоков и {len(BANK)} упражнений в двух файлах")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
