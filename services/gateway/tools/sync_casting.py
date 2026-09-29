"""sync_casting.py — перенести раскладку «персонаж → лицо» из документа в код.

Документ кастинга `AVATAR_CASTING.md` в каталоге docs пишет сессия кастинга; на стенд документы
не выкладываются, поэтому шлюз читает `app/avatar/live/casting.json`. Этот
прибор переносит пары «персонаж → UUID лица» из таблиц документа в раздел
`personas` сервиса (по умолчанию `liveavatar`), не трогая `defaults`.

    cd services/gateway && .venv/bin/python -m tools.sync_casting [--vendor liveavatar] [--check]

`--check` ничего не пишет и выходит с 1, если JSON разошёлся с документом.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from app.avatar.live.casting import BUILTIN, parse_casting_doc

ROOT = Path(__file__).resolve().parents[3]
DOC = ROOT / "docs" / "AVATAR_CASTING.md"


def persona_ids() -> set[str]:
    from app.engine.scenarios import MIRRORS, SCENARIOS
    return {s.id for s in SCENARIOS} | {m.id for m in MIRRORS}


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--vendor", default="liveavatar")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args(argv)
    if not DOC.exists():
        print(f"{DOC.relative_to(ROOT)} ещё нет — переносить нечего")
        return 0
    found = parse_casting_doc(DOC.read_text(encoding="utf-8"), persona_ids())
    data = json.loads(BUILTIN.read_text(encoding="utf-8"))
    section = data.setdefault(args.vendor, {"defaults": {}, "personas": {}})
    if args.check:
        same = section.get("personas") == found
        print("совпадает" if same else f"разошлось: в документе {found}, в JSON {section.get('personas')}")
        return 0 if same else 1
    section["personas"] = found
    BUILTIN.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    missing = sorted(persona_ids() - set(found))
    print(f"перенесено лиц: {len(found)}; без лица (возьмут лицо по умолчанию): {missing}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
