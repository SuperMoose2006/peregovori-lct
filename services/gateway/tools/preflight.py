#!/usr/bin/env python
"""preflight.py — проверка перед показом. Одна команда, тридцать секунд.

ЗАЧЕМ. На площадке ломается не логика, а окружение: не собран фронтенд, не
подхватился ключ, не докачались картинки состояний, порт занят соседом. Всё это
видно за секунду — но только если знать, куда смотреть. Этот скрипт смотрит за
вас и говорит по-русски, что именно не так.

Ничего не чинит и ничего не меняет: только смотрит и печатает.

    make preflight                 # gateway должен быть поднят
    python tools/preflight.py --url http://127.0.0.1:8010
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OK, WARN, BAD = "  ✓", "  ⚠", "  ✗"

problems: list[str] = []
warnings: list[str] = []


def fail(line: str) -> None:
    problems.append(line)
    print(f"{BAD} {line}")


def warn(line: str) -> None:
    warnings.append(line)
    print(f"{WARN} {line}")


def ok(line: str) -> None:
    print(f"{OK} {line}")


def check_files() -> None:
    print("\nфайлы")
    dist = ROOT / "frontend" / "dist" / "index.html"
    if dist.is_file():
        assets = list((ROOT / "frontend" / "dist" / "assets").glob("index-*.js"))
        ok(f"фронтенд собран ({assets[0].name if assets else 'без бандла?'})")
    else:
        fail("frontend/dist не собран — `cd frontend && npm run build`")

    fonts = list((ROOT / "frontend" / "public").rglob("nunito-*.woff2"))
    ok(f"шрифт локально: {len(fonts)} файла") if fonts else warn(
        "шрифта Nunito нет локально — на площадке демо будет ждать сеть")

    avatars = ROOT / "frontend" / "public" / "avatars"
    states = sum(1 for _ in avatars.rglob("*.webp")) if avatars.is_dir() else 0
    ok(f"лица оппонентов: {states} картинок") if states >= 60 else warn(
        f"лиц оппонентов мало ({states}) — часть состояний покажет рисованный портрет")

    mascots = ROOT / "frontend" / "public" / "mascots"
    m = sum(1 for _ in mascots.rglob("*.png")) if mascots.is_dir() else 0
    ok(f"маскоты: {m} картинок") if m >= 8 else warn(f"маскотов мало ({m})")


def check_health(url: str) -> None:
    print("\nбэкенд")
    try:
        with urllib.request.urlopen(f"{url}/api/health", timeout=5) as r:
            data = json.loads(r.read())
    except (urllib.error.URLError, OSError, ValueError) as exc:
        fail(f"{url}/api/health не отвечает ({exc}) — поднят ли `make gateway`?")
        return

    ok(f"гейтвей отвечает: {url}")
    if data.get("cloud_ai"):
        ok(f"облачный ИИ включён · оппонент: {data.get('models', {}).get('opponent', '—')}")
    else:
        warn("облачного ИИ нет — партия пойдёт на шаблонных репликах (это рабочий режим)")
    ok("судья по смыслу включён") if data.get("judge") else warn(
        "судья выключен — оценка аргумента пойдёт по ключевым словам")
    ok(f"синтез речи: {data.get('tts', '—')}")
    # Кто СЛУШАЕТ — не менее важно перед показом: запасной путь тоже работает,
    # но отвечает на три секунды дольше, и знать об этом надо заранее, а не по
    # затянувшейся паузе на сцене.
    ok(f"распознавание: {data.get('voice', '—')}")

    for path, key, name, least in (("/api/scenarios?lang=ru", "scenarios", "сценарии", 8),
                                   ("/api/campaigns?lang=ru", "campaigns", "кампании", 1)):
        try:
            with urllib.request.urlopen(f"{url}{path}", timeout=5) as r:
                payload = json.loads(r.read())
            items = payload.get(key, payload) if isinstance(payload, dict) else payload
            n = len(items)
        except Exception as exc:  # noqa: BLE001 — на площадке важна причина, а не тип
            fail(f"{name} не отдаются: {exc}")
            continue
        ok(f"{name}: {n}") if n >= least else fail(f"{name}: {n}, ожидалось хотя бы {least}")


def _plural(n: int) -> str:
    """«1 упражнение · 2 упражнения · 5 упражнений» — как и везде в продукте."""
    tens, ones = abs(n) % 100, abs(n) % 10
    if 11 <= tens <= 14:
        return "упражнений"
    return "упражнение" if ones == 1 else "упражнения" if 2 <= ones <= 4 else "упражнений"


def check_course() -> None:
    print("\nкурс")
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    try:
        from app.course.bank import BANK
        from app.course.blocks import BLOCKS
        from app.course.master import MASTER
    except Exception as exc:  # noqa: BLE001
        fail(f"курс не импортируется: {exc}")
        return
    lessons = sum(len(b.lessons) for b in BLOCKS)
    ok(f"{len(BLOCKS)} блоков · {lessons} уроков · {len(BANK)} {_plural(len(BANK))} · "
       f"экзамен мастера из {len(MASTER)} партий")

    mirror = ROOT / "frontend" / "src" / "data" / "course.generated.ts"
    if not mirror.is_file():
        fail("зеркала курса для браузера нет — `python tools/sync_course.py`")
    elif f'"id": "{BANK[-1]["id"]}"' not in mirror.read_text(encoding="utf-8"):
        fail("зеркало курса устарело — `python tools/sync_course.py`")
    else:
        ok("зеркало курса синхронно")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8010")
    args = parser.parse_args()

    print("«Диалог» — проверка перед показом")
    check_files()
    check_health(args.url.rstrip("/"))
    check_course()

    print()
    if problems:
        print(f"НЕ ГОТОВО: {len(problems)} проблем(ы). Показывать нельзя, пока не починено.")
        return 1
    if warnings:
        print(f"Готово с оговорками: {len(warnings)}. Демо пойдёт, но знайте про это.")
        return 0
    print("Готово. Можно показывать.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
