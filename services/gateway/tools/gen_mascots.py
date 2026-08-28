#!/usr/bin/env python
"""gen_mascots.py — маскоты «Диалога»: ворон Карл и слон Тихон.

ЗАЧЕМ ДВА, А НЕ ОДИН. У Duolingo одна сова, и она делает всё — но она и
работает в продукте, где всё обучение одинаковое. У нас два принципиально
разных режима присутствия:

  Карл (ворон) — ТРЕНЕР. Живёт сбоку во время партии и комментирует ход прямо
  сейчас. Ворон выбран не случайно: умный, наблюдательный, чуть язвительный —
  ровно тот характер, который уместен в переговорах. Сова была бы мудрой и
  доброй, а нам нужен тот, кто заметит, что вы уступили после первого «нет».

  Тихон (слон) — ПАМЯТЬ. Появляется в разборе и в прогрессе, где нужно
  вспомнить прошлые партии: «в прошлый раз вы тоже подвинулись до возражения».
  Слон не забывает — это единственная ассоциация, которую не надо объяснять.

СТИЛЬ. Тот же, что у лиц оппонентов (`gen_avatar_states.py`): плоский вектор,
жирный контур, аркадная стилистика. Маскот при этом в полный рост, а не
портрет — он персонаж, а не собеседник.

ФОН. Просим белый и вырезаем его программно: маскот садится на панель, у
которой в тёмной теме фон почти чёрный, и белый прямоугольник вокруг ворона
выдал бы подделку сразу.

Запуск:
    python tools/gen_mascots.py --who karl
    python tools/gen_mascots.py --all
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import io
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.providers.openrouter import chat as orchat  # noqa: E402

IMAGE_MODEL = os.getenv("NEGO_MODEL_IMAGE", "google/gemini-3.1-flash-image")
OUT_SIZE = 512

_STYLE = (
    "flat vector illustration, arcade video-game mascot, bold clean black outlines, "
    "limited flat colour palette, soft cel shading, friendly readable silhouette, "
    "full body, centred, standing, PURE WHITE background, no shadow on the ground, "
    "no text, no watermark, square composition"
)

#: Ворон Карл — тренер. Состояния подобраны под моменты партии, а не под
#: абстрактные эмоции: каждое соответствует тому, что реально происходит.
KARL_BASE = (
    "A raven mascot character named Karl for a negotiation-training app. "
    "Glossy blue-black feathers, large friendly expressive eyes with white sclera, "
    "a neat grey beak, standing upright on two feet like a cartoon character. "
    "He wears one small accent: a fresh-green (#58cc02) bow tie. "
    "Smart, watchful, slightly wry — a coach who notices everything. "
    "Neutral attentive pose, looking at the viewer."
)
KARL_STATES: dict[str, str] = {
    "idle":     "стоит спокойно, склонив голову набок, внимательно смотрит",
    "cheer":    "радуется, крылья подняты вверх, глаза сияют — игрок сделал сильный ход",
    "think":    "задумался, крыло у клюва, взгляд вверх-вбок",
    "concern":  "обеспокоен, крылья чуть разведены, брови домиком — ход был рискованный",
    "point":    "указывает крылом вбок, подсказывает, приподнял бровь",
    "celebrate":"празднует победу, крылья широко раскинуты, вокруг маленькие искры",
    "sad":      "расстроен, крылья опущены, взгляд в пол — переговоры сорвались",
    # Позы ниже добавлены после аудита экранов: в каждое из этих мест ставили
    # соседнюю картинку, и она говорила не то. `point` вместо приветствия
    # показывает «туда», `concern` в пустом состоянии — «сломалось», хотя ничего
    # не сломано, `sad` за один плохой ход — про сорванные переговоры целиком.
    "wave":     "здоровается: одно крыло поднято вверх и машет, второе опущено вдоль тела, широкая приветливая улыбка, смотрит на зрителя",
    "shrug":    "пожимает крыльями: оба крыла разведены в стороны ладонями вверх, брови приподняты, спокойное нейтральное лицо — «данных нет», без тревоги и без огорчения",
    "study":    "изучает данные: держит крылом большую лупу у глаза и рассматривает лист бумаги во втором крыле, сосредоточенный деловой взгляд",
    "doze":     "дремлет стоя: глаза закрыты, зевает с приоткрытым клювом, крыло прикрывает клюв, над головой маленький пузырёк сна",
    "oops":     "лёгкая досада за один промах: кончик крыла прижат ко лбу, глаза прищурены, смущённая кривая улыбка — не горе, а «ой»",
}

#: Слон Тихон — память. Состояний мало: он появляется редко и по делу.
TIKHON_BASE = (
    "An elephant mascot character named Tikhon for a negotiation-training app. "
    "Soft warm grey skin, large gentle eyes, big rounded ears, short trunk, "
    "standing upright on two feet like a cartoon character, calm and unhurried. "
    "He wears one small accent: a fresh-green (#58cc02) scarf. "
    "He is the one who remembers everything that happened before. "
    "Calm neutral pose, looking at the viewer."
)
TIKHON_STATES: dict[str, str] = {
    "idle":     "стоит спокойно, хобот опущен, доброжелательно смотрит",
    "remember": "вспоминает: хобот приподнят ко лбу, глаза прикрыты, над головой маленькая мысль-облачко",
    "exam":     "торжественно вручает свиток, держит его хоботом — момент экзамена",
    # Память умеет не только хорошие новости. Без этих четырёх Тихон мог только
    # вспоминать и вручать: прерванную серию и результат хуже прошлого показывать
    # было нечем, а карточка «третий раз подряд двигаете цену первым» — это про
    # цифру, на которую надо показать.
    "concern":  "встревожен: уши опущены, брови домиком, хобот прижат к груди, смотрит с беспокойством — новость плохая",
    "chart":    "показывает хоботом на столбчатый график на планшете, который держит в другой руке, поясняющий взгляд на зрителя",
    "cheer":    "радуется: передние ноги подняты вверх, хобот задран, глаза сияют, вокруг маленькие искры — личный рекорд",
    # Пузырёк сна — БЕЗ «Zzz»: буквы в картинке это текст, который никто не
    # переведёт, а весь пользовательский контент у нас двуязычный (инвариант 4).
    "doze":     "дремлет стоя: глаза закрыты, хобот обмяк вниз, уши опущены, от головы вверх поднимаются три маленьких круглых пузырька сна (именно кружки, НЕ облачко-реплика), ни одной буквы в кадре",
}

CHARACTERS = {
    "karl":   {"base": KARL_BASE,   "states": KARL_STATES,   "dir": "karl"},
    "tikhon": {"base": TIKHON_BASE, "states": TIKHON_STATES, "dir": "tikhon"},
}


async def _generate(messages: list[dict]) -> bytes | None:
    payload = {"model": IMAGE_MODEL, "modalities": ["image", "text"], "messages": messages}
    try:
        response = await orchat._get_client().post("/chat/completions", json=payload, timeout=180.0)
        response.raise_for_status()
        message = response.json()["choices"][0]["message"]
    except Exception as exc:
        print(f"    ! запрос не удался: {exc}")
        return None
    images = message.get("images") or []
    if not images:
        print(f"    ! модель не вернула картинку: {str(message.get('content'))[:120]}")
        return None
    return base64.b64decode(images[0]["image_url"]["url"].split(",", 1)[1])


def _save(raw: bytes, path: Path) -> int:
    """Обрезать до квадрата, вырезать белый фон, сохранить PNG с альфой.

    PNG, а не WebP: маскот ложится на панель, цвет которой меняется вместе с
    темой, поэтому нужна настоящая прозрачность, а не «белое на белом».
    """
    from PIL import Image

    image = Image.open(io.BytesIO(raw)).convert("RGBA")
    side = min(image.size)
    left, top = (image.width - side) // 2, (image.height - side) // 2
    image = image.crop((left, top, left + side, top + side)).resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)

    # Заливка фона идёт от краёв, а не «все белые пиксели»: белым бывает и
    # блик в глазу, и белок — их вырезать нельзя.
    pixels = image.load()
    width, height = image.size
    stack = [(x, y) for x in range(width) for y in (0, height - 1)]
    stack += [(x, y) for y in range(height) for x in (0, width - 1)]
    seen = set()
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or not (0 <= x < width and 0 <= y < height):
            continue
        seen.add((x, y))
        r, g, b, a = pixels[x, y]
        if a == 0 or (r > 233 and g > 233 and b > 233):
            pixels[x, y] = (r, g, b, 0)
            stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]

    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)
    _derive_webp(image, path)
    return path.stat().st_size


#: Ширина мелкого варианта. Слот маскота — 92 px в рост и 34 px в ленте, то
#: есть 192 px хватает даже на экран с двойной плотностью.
SMALL_SIZE = 192


def _derive_webp(image, png_path: Path) -> None:
    """Положить рядом с PNG два webp: полный и уменьшенный.

    Раньше их делали отдельным прогоном sharp'а, поставленного мимо
    package.json, и любая новая поза приезжала в набор без них: `<picture>`
    называет три файла на кадр, а браузер выбирает webp по `type` — недостающий
    файл виден как разрыв на месте маскота. Раз кадры родятся здесь, здесь же
    им и место, иначе набор снова разъедется.
    """
    stem = png_path.with_suffix("")
    image.save(f"{stem}.webp", "WEBP", quality=80, method=6)
    from PIL import Image

    image.resize((SMALL_SIZE, SMALL_SIZE), Image.LANCZOS).save(
        f"{stem}-{SMALL_SIZE}.webp", "WEBP", quality=80, method=6)


async def build(name: str, out_root: Path, only: list[str] | None) -> dict:
    spec = CHARACTERS[name]
    folder = out_root / spec["dir"]
    print(f"\n=== {name} ===")

    base_file = folder / "idle.png"
    if base_file.is_file():
        print("  эталон: idle.png (существующий — персонаж не меняется)")
        base_raw = base_file.read_bytes()
        written: dict[str, int] = {}
    else:
        print("  базовый образ…")
        base_raw = await _generate([{"role": "user", "content":
            f"{spec['base']}\nStyle: {_STYLE}.\n"
            "CRITICAL: draw exactly ONE single character, ONE figure, alone, "
            "centred in the frame, filling most of it. Do NOT draw a grid, a sheet, "
            "a collage, multiple poses or several copies of the character. "
            "Make the silhouette distinctive and easy to reproduce."}])
        if base_raw is None:
            return {"who": name, "ok": False}
        size = _save(base_raw, base_file)
        written = {"idle": size}
        print(f"    idle.png — {size // 1024} КБ")

    base_b64 = base64.b64encode(base_raw).decode()
    states = [s for s in spec["states"] if s not in written]
    if only:
        states = [s for s in states if s in only]

    for state in states:
        print(f"  {state}…")
        variant = await _generate([{"role": "user", "content": [
            {"type": "text", "text":
                f"Redraw THIS EXACT character with one change: {spec['states'][state]}.\n"
                "Keep the same body, colours, accent and art style. Only pose and "
                "expression change. Draw exactly ONE figure, alone, centred, filling "
                "most of the frame — never a grid or several copies.\n"
                f"Style reminder: {_STYLE}."},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base_b64}"}},
        ]}])
        if variant is None:
            continue
        size = _save(variant, folder / f"{state}.png")
        written[state] = size
        print(f"    {state}.png — {size // 1024} КБ")

    # Манифест читает папку, а не журнал этого запуска. Иначе догенерация одной
    # позы (`--state wave`) переписывала список одним словом «wave», и все
    # остальные кадры пропадали из набора, продолжая лежать на диске.
    (folder / "manifest.json").write_text(json.dumps({
        "mascot": name,
        "states": sorted(p.stem for p in folder.glob("*.png")),
        "generated_by": IMAGE_MODEL,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"who": name, "ok": True, "files": len(written), "bytes": sum(written.values())}


async def main() -> None:
    parser = argparse.ArgumentParser(description="Сгенерировать маскотов")
    parser.add_argument("--who", action="append", choices=list(CHARACTERS))
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--state", action="append")
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    out_root = Path(args.out) if args.out else (
        Path(__file__).resolve().parents[3] / "frontend" / "public" / "mascots")
    who = list(CHARACTERS) if args.all else (args.who or [])
    if not who:
        parser.error("укажите --who karl|tikhon или --all")

    if not orchat.available():
        print("ИИ недоступен (нет ключа или NEGO_AI=off) — генерировать нечем.")
        return

    results = [await build(n, out_root, args.state) for n in who]
    await orchat.aclose()
    print("\n─── итог ───")
    for r in results:
        print(f"  {r['who']}: {r['files']} файлов, {r['bytes'] // 1024} КБ" if r.get("ok")
              else f"  {r['who']}: НЕ УДАЛОСЬ")


if __name__ == "__main__":
    asyncio.run(main())
