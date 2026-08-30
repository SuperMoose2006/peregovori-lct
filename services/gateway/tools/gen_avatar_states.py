#!/usr/bin/env python
"""gen_avatar_states.py — офлайн-генератор лиц оппонента.

ЗАЧЕМ. Провайдер `presence` показывает лицо персонажа в том состоянии, которое
вычислил движок. Значит нужен набор картинок: персонаж × состояние. Рисовать их
руками для восьми сценариев — это ~50 иллюстраций; генерировать в рантайме
нельзя (секунды и деньги на каждый ход, плюс лицо менялось бы от партии к
партии). Поэтому: сгенерировать один раз, положить в `frontend/public/avatars/`,
закоммитить.

ПОЧЕМУ АРКАДНАЯ СТИЛИСТИКА, А НЕ ФОТОРЕАЛИЗМ. Осознанный выбор, а не уступка.
Фотореалистичное лицо без липсинка попадает в «зловещую долину» и, что важнее,
обещает то, чего нет: зритель ждёт синхронных губ. Стилизованный персонаж
ничего не обещает — он меняет ВЫРАЖЕНИЕ, и это выражение настоящее, потому что
его посчитал движок. Правило проекта «не бывает состояния, которое выглядит
настоящим, а внутри пусто» здесь соблюдено буквально.

КАК ДЕРЖИТСЯ ОДИН И ТОТ ЖЕ ЧЕЛОВЕК. Наивный путь — сгенерировать каждое
состояние по текстовому описанию — даёт восемь разных людей: модели не помнят
персонажа между вызовами. Поэтому двухшаговая схема: сперва базовый портрет,
затем КАЖДОЕ состояние генерируется image-to-image от него с инструкцией
«тот же человек, тот же стиль, меняется только выражение».

Запуск:
    python tools/gen_avatar_states.py --persona rent          # один сценарий
    python tools/gen_avatar_states.py --all                   # все восемь
    python tools/gen_avatar_states.py --persona rent --dry-run  # что и сколько
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

from app import engine  # noqa: E402
from app.providers.openrouter import chat as orchat  # noqa: E402


def _load_dotenv() -> None:
    """То же, что делает `main.py`, и по той же причине.

    Ключ картиночной модели — секрет, и место ему в `services/gateway/.env`, а
    не в командной строке: строка запуска остаётся в истории оболочки и в логах
    задач. Без этой загрузки генератор молча отвечал «ИИ недоступен» тому, у
    кого ключ лежит на диске, — и лица приходилось генерировать, вынося ключ
    туда, где ему быть не положено. Уже существующие переменные окружения
    всегда сильнее файла.
    """
    path = Path(__file__).resolve().parents[1] / ".env"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


_load_dotenv()

#: Модель для картинок. Дешевле `gemini-3-pro-image` и достаточна для
#: плоской стилизации; переопределяется переменной.
IMAGE_MODEL = os.getenv("NEGO_MODEL_IMAGE", "google/gemini-3.1-flash-image")

#: Размер стороны итоговой картинки. 512 хватает для карточки оппонента на
#: любом экране; больше — лишние мегабайты в репозитории и в загрузке демо.
OUT_SIZE = 512

#: Состояния, которые ГЕНЕРИРУЮТСЯ. Остальные из `AVATAR_STATES` переиспользуют
#: эти же картинки (см. `STATE_ALIASES`): «кивнул» и «потеплел» — это одно и то
#: же лицо, и платить за них дважды незачем.
BASE_STATES: dict[str, str] = {
    "listening":    "внимательно слушает, нейтральное доброжелательное выражение, смотрит на собеседника",
    "thinking":     "задумался, взгляд чуть в сторону, брови слегка сведены",
    "speaking":     "говорит, рот приоткрыт, живая мимика",
    "warm":         "тепло улыбается, глаза добрые, расслаблен",
    "lean_forward": "подался вперёд, заинтересован, глаза широко раскрыты",
    "lean_back":    "откинулся назад, скрестил руки, насторожен",
    "annoyed":      "раздражён, губы сжаты, брови нахмурены",
    "offended":     "обижен и задет, взгляд опущен, лицо закрылось",
    "walk_out":     "встаёт и отворачивается, разговор окончен",
}

#: Состояние → какую картинку показать. Экономия без потери смысла.
STATE_ALIASES: dict[str, str] = {
    "idle": "listening",
    "hesitation": "thinking",
    "nod": "warm",
    "smile": "warm",
    "shake_head": "annoyed",
}

#: Одежда названа НАМЕРЕННО. Весь состав продукта — люди за переговорным
#: столом, и одиннадцать персон из двенадцати модель одевала в офисное сама. На
#: двенадцатой не угадала: «composed and hard» дало тимлиду платформы
#: тактический жилет, и на экране она выпадала из семьи портретов. Гардероб —
#: часть общего стиля, а не вкус модели, поэтому он записан здесь.
_STYLE = (
    "flat vector illustration, arcade video-game character portrait, bold clean "
    "outlines, limited flat colour palette, soft shading, friendly readable shapes, "
    "modern office or business-casual clothing, head and shoulders, centred, plain "
    "light background, no text, no watermark, square composition"
)


def _persona_brief(scenario) -> str:
    """Кого рисуем. Пол берётся ИЗ ЗАПИСИ, а не угадывается моделью по имени.

    Тот же дефект, что когда-то был у голоса (`Counterpart.female` и появился
    ради него): по строке «Oksana, Platform Team Lead» картиночная модель
    нарисовала мужчину, и тимлид платформы говорил бы женским голосом с
    мужского портрета. Пол в записи уже есть — значит спрашивать о нём модель
    незачем.
    """
    counterpart = scenario.counterpart
    who = "a woman" if counterpart.female else "a man"
    return (f"{counterpart.name['en']} ({who}) — {counterpart.persona['en']} "
            f"Negotiation style: {counterpart.style}.")


async def _generate(messages: list[dict]) -> bytes | None:
    """Один вызов генерации. Возвращает байты картинки или None."""
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
    url = images[0]["image_url"]["url"]
    return base64.b64decode(url.split(",", 1)[1])


def _save(raw: bytes, path: Path) -> int:
    """Ужать до `OUT_SIZE` и сохранить в WebP. Возвращает размер файла."""
    from PIL import Image

    image = Image.open(io.BytesIO(raw)).convert("RGB")
    side = min(image.size)
    left, top = (image.width - side) // 2, (image.height - side) // 2
    image = image.crop((left, top, left + side, top + side))
    image = image.resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "WEBP", quality=86, method=6)
    return path.stat().st_size


async def build_persona(scenario, out_root: Path, only: list[str] | None = None,
                        base_from: str = "listening", regenerate_base: bool = False) -> dict:
    """Базовый портрет + вариации выражений от него.

    ПОЧЕМУ БАЗА ПЕРЕИСПОЛЬЗУЕТСЯ, А НЕ ГЕНЕРИРУЕТСЯ ЗАНОВО. Модели не помнят
    персонажа между вызовами: новый базовый портрет — это новый человек. Один
    раз это уже случилось: догенерация трёх недостающих состояний для
    `sla_renewal` создала вторую базу, и в наборе оказалось два разных вендора —
    в синем костюме с бородой и в зелёном пальто без. На экране это выглядит
    как подмена собеседника посреди партии.

    Поэтому: если `<base_from>.webp` уже лежит на диске, он и есть эталон.
    Новая база рисуется только по явному `--regenerate-base`, и тогда весь
    набор надо перегенерировать целиком.
    """
    persona_dir = out_root / scenario.id
    brief = _persona_brief(scenario)
    print(f"\n=== {scenario.id}: {scenario.counterpart.name['ru']} ===")

    written: dict[str, int] = {}
    existing_base = persona_dir / f"{base_from}.webp"

    if existing_base.is_file() and not regenerate_base:
        print(f"  эталон: {existing_base.name} (существующий — персонаж не меняется)")
        base_raw = existing_base.read_bytes()
    else:
        base_prompt = (
            f"Create a character portrait. {brief}\n"
            f"Style: {_STYLE}.\n"
            "Neutral, attentive expression. This portrait is the reference sheet for "
            "the same character in other expressions, so make the face distinctive and "
            "easy to reproduce."
        )
        print("  базовый портрет…")
        base_raw = await _generate([{"role": "user", "content": base_prompt}])
        if base_raw is None:
            return {"scenario": scenario.id, "ok": False}
        size = _save(base_raw, persona_dir / "listening.webp")
        written["listening"] = size
        print(f"    listening.webp — {size // 1024} КБ")

    base_b64 = base64.b64encode(base_raw).decode()

    states = [s for s in BASE_STATES if s not in written]
    if only:
        states = [s for s in states if s in only]

    for state in states:
        print(f"  {state}…")
        variant = await _generate([{"role": "user", "content": [
            {"type": "text", "text":
                f"Redraw THIS EXACT character with one change: {BASE_STATES[state]}.\n"
                "Keep the same face, hair, clothing, colours and art style. Only the "
                f"expression and posture change.\nStyle reminder: {_STYLE}."},
            {"type": "image_url",
             "image_url": {"url": f"data:image/jpeg;base64,{base_b64}"}},
        ]}])
        if variant is None:
            continue
        size = _save(variant, persona_dir / f"{state}.webp")
        written[state] = size
        print(f"    {state}.webp — {size // 1024} КБ")

    manifest = {
        "persona": scenario.id,
        "name": scenario.counterpart.name,
        "style": scenario.counterpart.style,
        "states": sorted(written),
        "aliases": STATE_ALIASES,
        "generated_by": IMAGE_MODEL,
        # Честная пометка прямо в манифесте: клиент не должен обещать липсинк.
        "lipsync": False,
    }
    (persona_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"scenario": scenario.id, "ok": True, "files": len(written),
            "bytes": sum(written.values())}


async def main() -> None:
    parser = argparse.ArgumentParser(description="Сгенерировать лица оппонентов")
    parser.add_argument("--persona", action="append", help="id сценария (можно несколько)")
    parser.add_argument("--all", action="store_true", help="все сценарии")
    parser.add_argument("--state", action="append", help="только эти состояния")
    parser.add_argument("--out", default=None, help="каталог назначения")
    parser.add_argument("--base-from", default="listening",
                        help="какое состояние взять эталоном, если оно уже есть")
    parser.add_argument("--regenerate-base", action="store_true",
                        help="нарисовать нового персонажа (весь набор надо будет перегенерировать)")
    parser.add_argument("--dry-run", action="store_true", help="показать план и выйти")
    args = parser.parse_args()

    out_root = Path(args.out) if args.out else (
        Path(__file__).resolve().parents[3] / "frontend" / "public" / "avatars")

    # ЗЕРКАЛЬНЫЕ СТОЛЫ ЖИВУТ ОТДЕЛЬНЫМ СПИСКОМ, и генератор о них не знал.
    #
    # Их вынесли из общей библиотеки намеренно: её длина входит в арифметику
    # «стола дня», и десятая запись сдвинула бы расписание всем. Но у персон
    # зеркал такие же лица и такие же состояния, поэтому здесь оба списка — одно
    # и то же. Без этого новые столы молча показывали рисованный портрет вместо
    # набора состояний: не ложь, но и не то, что обещает `presence`.
    from app.engine.scenarios import MIRRORS

    known = list(engine.SCENARIOS) + list(MIRRORS)
    if args.all:
        scenarios = known
    elif args.persona:
        scenarios = [s for s in known if s.id in set(args.persona)]
    else:
        parser.error("укажите --persona <id> или --all")

    if not scenarios:
        parser.error("ни один сценарий не найден")

    per_persona = len(args.state) + 1 if args.state else len(BASE_STATES)
    print(f"модель: {IMAGE_MODEL}")
    print(f"каталог: {out_root}")
    print(f"персонажей: {len(scenarios)} × картинок: {per_persona} "
          f"= {len(scenarios) * per_persona} обращений")
    if args.dry_run:
        for s in scenarios:
            print(f"  {s.id}: {s.counterpart.name['ru']} — {_persona_brief(s)}")
        return

    if not orchat.available():
        print("ИИ недоступен (нет ключа или NEGO_AI=off) — генерировать нечем.")
        return

    results = []
    for scenario in scenarios:
        results.append(await build_persona(scenario, out_root, args.state,
                                           base_from=args.base_from,
                                           regenerate_base=args.regenerate_base))
    await orchat.aclose()

    print("\n─── итог ───")
    for r in results:
        if r.get("ok"):
            print(f"  {r['scenario']}: {r['files']} файлов, {r['bytes'] // 1024} КБ")
        else:
            print(f"  {r['scenario']}: НЕ УДАЛОСЬ")


if __name__ == "__main__":
    asyncio.run(main())
