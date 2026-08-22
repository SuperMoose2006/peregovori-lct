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
from app.course.blocks import BLOCKS  # noqa: E402

TARGET = Path(__file__).resolve().parents[3] / "frontend" / "src" / "data" / "course.generated.ts"

HEADER = """// СГЕНЕРИРОВАНО. Не править руками.
// Источник: services/gateway/app/course/{blocks,bank}.py
// Обновить: cd services/gateway && python tools/sync_course.py
//
// Курс проверяется офлайн тем же движком-зеркалом, что и партия без сети,
// поэтому банк обязан быть здесь целиком. Правильность каждого пункта
// доказывается на стороне Python (tests/test_course_bank.py) — против
// настоящего analyze()/apply_move().

import type { CourseBlock, Exercise } from "../lib/courseTypes";

export const COURSE_BLOCKS: CourseBlock[] = """


def render() -> str:
    blocks = json.dumps([asdict(b) for b in BLOCKS], ensure_ascii=False, indent=2)
    bank = json.dumps(BANK, ensure_ascii=False, indent=2)
    return f"{HEADER}{blocks};\n\nexport const COURSE_BANK: Exercise[] = {bank};\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    fresh = render()
    current = TARGET.read_text(encoding="utf-8") if TARGET.is_file() else ""
    if fresh == current:
        print("курс синхронен")
        return 0
    if args.check:
        print(f"РАСХОЖДЕНИЕ: {TARGET} устарел — запустите tools/sync_course.py")
        return 1
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(fresh, encoding="utf-8")
    print(f"обновлено: {TARGET} ({len(BLOCKS)} блоков, {len(BANK)} упражнений)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
