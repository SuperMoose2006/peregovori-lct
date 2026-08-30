#!/usr/bin/env python3
"""bilingual_audit.py — где одна половина языка беднее другой? Прибор, а не мнение.

Инвариант 4 требует билингвальности ВСЕГО пользовательского контента. Проверено
и закрыто тестом это было для СЛОВАРЕЙ интерфейса — там расхождение видно глазом
на первом же экране. Содержание — эталонные партии, столы, курс, лексикон —
проверялось только формой: «у словаря есть ключ `en`». Ключ есть всегда; беднее
половина становится иначе.

ТРИ ВИДА БЕДНОСТИ, И ТОЛЬКО ПЕРВЫЙ ВИДЕН ПО ФОРМЕ

  1. ПУСТО. Половины нет вовсе: `{"ru": "...", "en": ""}`, список из нуля слов,
     раздел фикстуры, помеченный одним языком. Ловится обходом структур.
  2. ТОНЬШЕ. Половина есть, но мельче: у стола сорок русских ключевых слов и
     двенадцать английских. Форма цела, игра — нет. Меряется отношением.
  3. ДРУГАЯ ИГРА. Половины полны и обе работают, но играют РАЗНОЕ: одна и та же
     эталонная партия набирает по-русски 87, по-английски 91, потому что третья
     английская реплика попутно засчитывается активным слушанием. Это худший
     вид: он не выглядит дефектом ни в одном тесте, а сравнивать языки после
     него уже нельзя. Меряется ПРОГОНОМ ДВИЖКА — набор приёмов на каждом ходу
     обязан совпасть, иначе половины не сравнимы.

КАЛИБРОВКА. Прибор, который меряет сам себя, меряет ноль. Поэтому первым делом
он воспроизводит `games.scores.json` — числа, посчитанные движком-источником, —
по семи полям на каждую партию. Не воспроизвёл: сломан ОН, а не продукт, и
дальше не идёт (код 2). Тот же приём и та же причина, что в
`tools/scenario_audit.py`.

ЧТО БЫЛО ИЗМЕРЕНО ПРИ НАПИСАНИИ (28.08.2026, до правок). РАЗМЕР ДЫРЫ 73:
55 английских реплик лестницы качества (7 партий из 7) и 6 реплик «права первого
слова» (2 партии из 2) не существовали вовсе — оба раздела были помечены
`lang: "ru"`, из-за чего режим «Чтение стола» давал 12 партий по-русски и 9 по-
английски; плюс три эталонные партии из девяти играли разную игру на двух языках
(`salary` +1 приём у EN, `freelance_rate` +2 у RU, `rent` +1 у EN), и `salary`
расходилась счётом 87/91 при технике 65/75.

    .venv/bin/python tools/bilingual_audit.py            # полный отчёт
    .venv/bin/python tools/bilingual_audit.py --json     # то же машинно
    .venv/bin/python tools/bilingual_audit.py --strict   # тоньше-чем-вдвое тоже провал

Код возврата: 0 — дыр нет, 1 — есть (ПРОВАЛ в отчёте), 2 — сломан сам прибор.
"""
from __future__ import annotations

import argparse
import dataclasses
import json
import os
import re
import sys
from pathlib import Path

os.environ.setdefault("NEGO_AI", "off")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import views  # noqa: E402
from app.ai import coach, debriefer, judge, prompts, scenario_gen  # noqa: E402
from app.course import master  # noqa: E402
from app.course.bank import BANK  # noqa: E402
from app.course.blocks import BLOCKS  # noqa: E402
from app.engine import campaigns as campaigns_mod, daily, engine, format as fmt  # noqa: E402
from app.engine.campaigns import CAMPAIGNS  # noqa: E402
from app.engine.scenarios import SCENARIOS, MIRRORS  # noqa: E402
from app.engine.techniques import LEX, analyze  # noqa: E402
from app.perception import turn_detect, vision  # noqa: E402

#: Модули, чьи ТАБЛИЦЫ уровня модуля несут текст для человека: реплики
#: оппонента, подписи условий «стола дня», строки разбора, промпты. Обходятся
#: целиком, а не поимённо: список имён протух бы на первой же новой таблице,
#: и половину нашли бы не тестом, а глазами игрока.
_TEXT_MODULES = (views, coach, debriefer, judge, prompts, scenario_gen, master,
                 campaigns_mod, daily, engine, fmt, turn_detect, vision)

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "frontend" / "test" / "fixtures"
GAMES = json.loads((FIXTURES / "games.json").read_text(encoding="utf-8"))
SCORES = json.loads((FIXTURES / "games.scores.json").read_text(encoding="utf-8"))
FRONT_SRC = ROOT / "frontend" / "src"
LANGS = ("ru", "en")

#: Поля, по которым сверяется калибровка. Те же семь, что у scenario_audit:
#: грейд без экономики ничего не доказывает, экономика без статуса — тоже.
_CALIBRATION_FIELDS = ("overall", "grade", "economic", "relationship",
                       "technique", "status", "interests_found")

#: Списки, которые НЕ index-aligned: это мешки синонимов, и требовать от них
#: равной длины значит требовать, чтобы у английского была русская морфология.
#: Их бедность меряется отношением (вид 2), а не разностью длин.
_BAG_KEYS = {"keywords", "hidden_interest_keywords"}


class Report:
    """Накопитель находок: провал — дыра, заметка — число для отчёта."""

    def __init__(self) -> None:
        self.fails: list[str] = []
        self.notes: list[str] = []
        self.stats: dict[str, object] = {}

    def fail(self, msg: str) -> None:
        self.fails.append(msg)
        print(f"  ✗ ПРОВАЛ: {msg}")

    def note(self, msg: str) -> None:
        self.notes.append(msg)
        print(f"  · {msg}")

    def ok(self, msg: str) -> None:
        print(f"  ✓ {msg}")


# -----------------------------------------------------------------------------
# 0. Калибровка.
# -----------------------------------------------------------------------------

def _principled() -> dict[str, dict[str, list[str]]]:
    return {k: v for k, v in GAMES["principled"].items() if k != "note"}


def _other_side() -> dict[str, dict[str, list[str]]]:
    """Зеркальные столы. Раздел отдельный от `principled`, а инвариант 4 — тот
    же: половина, которой нет, одинаково дорога и там и там."""
    return {k: v for k, v in GAMES.get("other_side", {}).items() if k != "note"}


def section_langs(section: dict) -> tuple[str, ...]:
    """Языки, на которых раздел фикстуры существует.

    Список `langs` — новая форма; одинокий `lang` — старая, одноязычная. Разница
    между ними и есть предмет измерения: раздел, помеченный `lang: "ru"`, не
    «пока не переведён», а НЕ СУЩЕСТВУЕТ по-английски.
    """
    if "langs" in section:
        return tuple(section["langs"])
    return (section.get("lang", "ru"),)


def lines_of(game: dict, lang: str, langs: tuple[str, ...] = LANGS) -> list[str] | None:
    """Реплики партии на языке. `None` — этого языка у партии нет.

    `@principled.<id>` — ссылка на соседний раздел. Ловушка, на которой прибор
    уже обжигался в scenario_audit: строка перебиралась ПО БУКВАМ, и партия
    превращалась в двадцать ходов «@», «p», «r».
    """
    if lang not in langs:
        return None
    lines = game["lines"]
    if isinstance(lines, str) and lines.startswith("@principled."):
        return _principled()[lines.split(".", 1)[1]].get(lang)
    if isinstance(lines, dict):
        return lines.get(lang)
    # Плоский список в одноязычном разделе принадлежит его единственному языку;
    # выдать его за второй значит доказать паритет, которого нет.
    return lines if len(langs) == 1 else None


def play(scenario_id: str, msgs: list[str], lang: str):
    sess = engine.create_session(scenario_id, lang)
    for text in msgs:
        if sess.state.status != "active":
            break
        sess.turn += 1
        engine.apply_move(sess, analyze(text), text)
        if sess.state.status == "active" and sess.turn >= sess.max_turns:
            sess.state.status = "breakdown"
    return sess, engine.score_session(sess)


def _mirror_lang(section: dict) -> str:
    """Язык, по которому браузерное зеркало сверяет числа (инвариант 8)."""
    return section.get("mirror") or section.get("lang") or "ru"


def calibrate() -> tuple[bool, list[str]]:
    bad: list[str] = []
    for section, source in (("principled", _principled), ("other_side", _other_side)):
        for sid, want in sorted(SCORES.get(section, {}).items()):
            _, got = play(sid, source()[sid]["ru"], "ru")
            for f in _CALIBRATION_FIELDS:
                if got[f] != want[f]:
                    bad.append(f"{section}/{sid}.{f}: прибор {got[f]!r}, эталон {want[f]!r}")
    for key in ("ladder", "first_word"):
        section = GAMES[key]
        lang = _mirror_lang(section)
        for gid, want in SCORES[key].items():
            game = next(g for g in section["games"] if g["id"] == gid)
            _, got = play(section["scenario"], lines_of(game, lang, section_langs(section)) or [], lang)
            for f in _CALIBRATION_FIELDS:
                if got[f] != want[f]:
                    bad.append(f"{key}/{gid}.{f}: прибор {got[f]!r}, эталон {want[f]!r}")
    return not bad, bad


# -----------------------------------------------------------------------------
# 1. Пусто: обход структур на предмет отсутствующей половины.
# -----------------------------------------------------------------------------

def _plain(obj):
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return {f.name: _plain(getattr(obj, f.name)) for f in dataclasses.fields(obj)}
    if isinstance(obj, dict):
        return {k: _plain(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_plain(v) for v in obj]
    return obj


def walk_bilingual(obj, path: str, out: list[str], key: str = "") -> int:
    """Считает найденные пары `{ru, en}` и пишет в `out` каждую дырявую."""
    found = 0
    if isinstance(obj, dict):
        if "ru" in obj or "en" in obj:
            found = 1
            for lang in LANGS:
                if lang not in obj:
                    out.append(f"{path}: нет половины «{lang}»")
            ru, en = obj.get("ru"), obj.get("en")
            # Пусто с ОБЕИХ сторон — не дыра, а намеренное молчание: у полосы
            # репутации «средне» оппонент не говорит ничего ни на одном языке.
            # Инвариант 4 требует паритета, а не текста любой ценой.
            for lang, val, other in (("ru", ru, en), ("en", en, ru)):
                if lang in obj and not val and other:
                    out.append(f"{path}.{lang}: половина пуста, а вторая — нет")
            if (isinstance(ru, list) and isinstance(en, list)
                    and key not in _BAG_KEYS and len(ru) != len(en)):
                out.append(f"{path}: списки не выровнены — ru {len(ru)}, en {len(en)}")
            return found
        for k, v in obj.items():
            found += walk_bilingual(v, f"{path}.{k}", out, k)
        return found
    if isinstance(obj, list):
        for i, v in enumerate(obj):
            found += walk_bilingual(v, f"{path}[{i}]", out, key)
    return found


def check_forms(rep: Report) -> None:
    print("\n═══ 1. ПУСТО: есть ли обе половины ═══\n")
    total = 0
    blobs: list[tuple[str, object]] = [
        # Библиотека и зеркала вместе: у зеркального стола свой список
        # (см. scenarios.MIRRORS), и половина, которой нет, там стоит
        # ровно столько же.
        ("scenarios.py", _plain(list(SCENARIOS) + list(MIRRORS))),
        ("campaigns.py", _plain(CAMPAIGNS)),
        ("course/bank.py", _plain(BANK)),
        ("course/blocks.py", _plain(BLOCKS)),
    ]
    for mod in _TEXT_MODULES:
        tables = {
            name: value for name, value in vars(mod).items()
            if isinstance(value, (dict, list, tuple)) and not name.startswith("__")
        }
        blobs.append((f"{mod.__name__} (таблицы модуля)", _plain(tables)))
    for name, blob in blobs:
        out: list[str] = []
        found = walk_bilingual(blob, name, out)
        total += found
        if out:
            for line in out[:20]:
                rep.fail(line)
        else:
            rep.ok(f"{name}: {found} пар {{ru,en}} — обе половины на месте")
    rep.stats["bilingual_pairs"] = total


# -----------------------------------------------------------------------------
# 2. Пусто в фикстурах: раздел, которого нет на втором языке.
# -----------------------------------------------------------------------------

def check_fixture_material(rep: Report) -> None:
    print("\n═══ 2. ПУСТО: материал эталонных партий ═══\n")
    missing_games = 0
    missing_lines = 0
    per_section: dict[str, dict] = {}
    sections: list[tuple[str, list[dict], tuple[str, ...]]] = [
        ("principled",
         [{"id": sid, "lines": g} for sid, g in sorted(_principled().items())], LANGS),
        ("other_side",
         [{"id": sid, "lines": g} for sid, g in sorted(_other_side().items())], LANGS),
    ]
    for key in ("ladder", "first_word"):
        sections.append((key, GAMES[key]["games"], section_langs(GAMES[key])))

    for name, games, langs in sections:
        counts = {lang: [0, 0] for lang in LANGS}  # партий, реплик
        holes: list[str] = []
        for game in games:
            for lang in LANGS:
                lines = lines_of(game, lang, langs)
                if lines is None:
                    holes.append(f"{name}/{game['id']}: нет половины «{lang}»")
                    continue
                counts[lang][0] += 1
                counts[lang][1] += len(lines)
        gap_games = abs(counts["ru"][0] - counts["en"][0])
        gap_lines = abs(counts["ru"][1] - counts["en"][1])
        missing_games += gap_games
        missing_lines += gap_lines
        per_section[name] = {
            "ru_games": counts["ru"][0], "en_games": counts["en"][0],
            "ru_lines": counts["ru"][1], "en_lines": counts["en"][1],
        }
        line = (f"{name}: ru {counts['ru'][0]} партий / {counts['ru'][1]} реплик · "
                f"en {counts['en'][0]} / {counts['en'][1]}")
        if holes:
            rep.fail(f"{line} — недостаёт {gap_games} партий и {gap_lines} реплик")
            for h in holes[:8]:
                print(f"      {h}")
        else:
            rep.ok(line)
    rep.stats["fixture_sections"] = per_section
    rep.stats["missing_games"] = missing_games
    rep.stats["missing_lines"] = missing_lines


# -----------------------------------------------------------------------------
# 3. Другая игра: половины обязаны играть ОДНО И ТО ЖЕ.
# -----------------------------------------------------------------------------

def _recipe(lines: list[str]) -> list[tuple[str, ...]]:
    """Рецепт партии: набор приёмов на каждом ходу. Именно он обязан совпасть.

    Не текст: английские реплики намеренно НЕ перевод русских — интерес
    вскрывается попаданием в `hidden_interest_keywords[lang]`, а словари разные.
    Свобода в словах, равенство в приёмах.
    """
    return [tuple(sorted(analyze(t).moves)) for t in lines]


#: Партии, у которых рецепты расходятся по вине КЛАССИФИКАТОРА, а не фикстуры, —
#: поимённо и с причиной, как это сделано у `choice` без `expect_moves` в
#: tests/test_course_bank.py. Из фикстуры такое не чинится: обе реплики говорят
#: одно и то же, по-разному их читает `analyze`. Список закрыт с двух сторон —
#: партия, переставшая расходиться, тоже провал: причина исчезла, а запись
#: осталась бы прикрывать следующую.
_CLASSIFIER_ASYMMETRY: dict[tuple[str, str], str] = {
    ("principled", "freelance_rate"):
        "RU-ходы 5–6 получают лишний objective_criteria: «фикс-прайс» попадает в "
        "словарь критериев подстрокой «прайс». Счёт не двигается (88/88, техника "
        "67/67) — критерий уже засчитан четвёртым ходом.",
    ("principled", "rent"):
        "EN-ход 4 получает лишний offer: «64 k» читается как цена, а русское «по "
        "64» — нет. Убрать цифру из английского критерия нельзя, её требует сам "
        "рецепт («объективный критерий с цифрой»). Цена расхождения — 1 балл.",
}


def check_same_game(rep: Report, strict: bool) -> None:
    print("\n═══ 3. ДРУГАЯ ИГРА: один ли рецепт у двух половин ═══\n")
    rows: list[dict] = []
    bad = 0
    sections: list[tuple[str, str | None, list[dict], tuple[str, ...]]] = [
        ("principled", None,
         [{"id": sid, "lines": g} for sid, g in sorted(_principled().items())], LANGS),
        ("other_side", None,
         [{"id": sid, "lines": g} for sid, g in sorted(_other_side().items())], LANGS),
    ]
    for key in ("ladder", "first_word"):
        sections.append((key, GAMES[key]["scenario"], GAMES[key]["games"],
                         section_langs(GAMES[key])))

    for name, fixed_scenario, games, langs in sections:
        for game in games:
            sid = fixed_scenario or game["id"]
            halves = {lang: lines_of(game, lang, langs) for lang in LANGS}
            if not all(halves.values()):
                continue  # уже посчитано разделом 2 как пустота
            scored = {}
            for lang in LANGS:
                sess, deb = play(sid, halves[lang], lang)
                scored[lang] = (deb, sess)
            ru_rec, en_rec = _recipe(halves["ru"]), _recipe(halves["en"])
            d_over = scored["en"][0]["overall"] - scored["ru"][0]["overall"]
            d_tech = scored["en"][0]["technique"] - scored["ru"][0]["technique"]
            mismatch = [
                f"ход {i + 1}: ru {'+'.join(a) or '—'} ≠ en {'+'.join(b) or '—'}"
                for i, (a, b) in enumerate(zip(ru_rec, en_rec)) if a != b
            ]
            if len(ru_rec) != len(en_rec):
                mismatch.append(f"длина: ru {len(ru_rec)} ходов, en {len(en_rec)}")
            rows.append({
                "section": name, "id": game["id"], "scenario": sid,
                "ru_overall": scored["ru"][0]["overall"], "en_overall": scored["en"][0]["overall"],
                "ru_technique": scored["ru"][0]["technique"], "en_technique": scored["en"][0]["technique"],
                "d_overall": d_over, "d_technique": d_tech,
                "recipe_mismatch": mismatch,
            })
            label = (f"{name}/{game['id']:15} overall ru {scored['ru'][0]['overall']:3} "
                     f"en {scored['en'][0]['overall']:3} (Δ{d_over:+d}) · "
                     f"technique {scored['ru'][0]['technique']:3}/{scored['en'][0]['technique']:3} "
                     f"(Δ{d_tech:+d})")
            known = _CLASSIFIER_ASYMMETRY.get((name, game["id"]))
            if mismatch and known:
                rep.note(f"{label} — рецепт расходится по вине классификатора")
                print(f"      причина: {known}")
                for m in mismatch[:4]:
                    print(f"      {m}")
                if abs(d_over) > 1:
                    bad += 1
                    rep.fail(f"{name}/{game['id']}: названная причина стоила уже "
                             f"{abs(d_over)} баллов — это больше не мелочь")
            elif known:
                bad += 1
                rep.fail(f"{name}/{game['id']}: рецепты сошлись, а причина всё ещё "
                         "в списке _CLASSIFIER_ASYMMETRY — уберите её оттуда")
            elif mismatch:
                bad += 1
                rep.fail(f"{label} — половины играют РАЗНОЕ")
                for m in mismatch[:4]:
                    print(f"      {m}")
            elif abs(d_over) > (1 if strict else 2):
                bad += 1
                rep.fail(f"{label} — рецепт один, счёт разошёлся")
            else:
                rep.ok(label)
    rep.stats["same_game"] = rows
    rep.stats["different_game"] = bad


# -----------------------------------------------------------------------------
# 4. Тоньше: половина есть, но мельче.
# -----------------------------------------------------------------------------

def _is_ascii(s: str) -> bool:
    return all(ord(c) < 128 for c in s)


def check_thinness(rep: Report, strict: bool) -> None:
    print("\n═══ 4. ТОНЬШЕ: половина есть, но мельче ═══\n")
    thin: list[dict] = []
    #: Все замеренные отношения, а не только провалившие порог: «дыр нет» без
    #: числа рядом — это не измерение, а самочувствие прибора.
    ratios: list[dict] = []

    # 4a. Словарь приёмов: одна запись целиком в одном алфавите, поэтому
    # разделить его можно ровно так — по алфавиту, а не по вере.
    for move, words in sorted(LEX.items()):
        if not isinstance(words, list):
            continue
        ru = [w for w in words if not _is_ascii(w)]
        en = [w for w in words if _is_ascii(w)]
        if not ru or not en:
            # «?» — приём без языка вовсе; это не перекос, а отсутствие текста.
            if len(words) <= 2:
                continue
            rep.fail(f"LEX[{move}]: ru {len(ru)}, en {len(en)} — половины нет")
            continue
        ratio = min(len(ru), len(en)) / max(len(ru), len(en))
        row = {"what": f"LEX[{move}]", "ru": len(ru), "en": len(en), "ratio": round(ratio, 2)}
        ratios.append(row)
        if ratio < 0.5:
            thin.append(row)

    # 4b. Ключевые слова интересов: мешок, вскрывающий интерес офлайн.
    for sc in SCENARIOS:
        kw = sc.hidden_interest_keywords
        if not kw:
            continue
        for i, (ru, en) in enumerate(zip(kw.get("ru", []), kw.get("en", []))):
            ratio = min(len(ru), len(en)) / max(len(ru), len(en), 1)
            row = {"what": f"{sc.id}.interest[{i}]", "ru": len(ru),
                   "en": len(en), "ratio": round(ratio, 2)}
            ratios.append(row)
            if ratio < 0.5:
                thin.append(row)
        for si in sc.secondary_issues:
            ru, en = si.keywords.get("ru", []), si.keywords.get("en", [])
            ratio = min(len(ru), len(en)) / max(len(ru), len(en), 1)
            row = {"what": f"{sc.id}.{si.id}", "ru": len(ru),
                   "en": len(en), "ratio": round(ratio, 2)}
            ratios.append(row)
            if ratio < 0.5:
                thin.append(row)

    rep.stats["thin"] = thin
    rep.stats["thinnest"] = sorted(ratios, key=lambda x: x["ratio"])[:5]
    if not thin:
        worst = rep.stats["thinnest"][0] if ratios else None
        rep.ok(f"{len(ratios)} мешков синонимов замерено, тоньше чем вдвое — ни одного"
               + (f"; самый перекошенный {worst['what']}: ru {worst['ru']}, en {worst['en']}"
                  f" ({worst['ratio']})" if worst else ""))
    for t in sorted(thin, key=lambda x: x["ratio"])[:20]:
        msg = f"{t['what']}: ru {t['ru']}, en {t['en']} — тоньше в {round(1 / t['ratio'], 1)} раза"
        (rep.fail if strict else rep.note)(msg)


# -----------------------------------------------------------------------------
# 5. Каталоги, собранные из фикстур: режим «Чтение стола».
# -----------------------------------------------------------------------------

_LANG_BLOCK = re.compile(r"\b(ru|en)\s*:\s*\[", re.M)


def check_reading_catalogue(rep: Report) -> None:
    print("\n═══ 5. КАТАЛОГИ: что из этого доходит до игрока ═══\n")
    src = (FRONT_SRC / "data" / "readingGames.ts").read_text(encoding="utf-8")
    # Каталог — литерал; считаем не парсером TS, а по границам записей: у каждой
    # партии свой `id:`, а внутри — блоки `ru: [` / `en: [`.
    entries = re.split(r"\n  \{\n", src)[1:]
    counts = {"ru": 0, "en": 0}
    for entry in entries:
        for lang in set(m.group(1) for m in _LANG_BLOCK.finditer(entry)):
            counts[lang] += 1
    store = (FRONT_SRC / "lib" / "readingStore.ts").read_text(encoding="utf-8")
    declared = {}
    for lang in LANGS:
        m = re.search(rf"\n  {lang}: \[(.*?)\]", store, re.S)
        declared[lang] = len(re.findall(r'"', m.group(1))) // 2 if m else 0
    rep.stats["reading"] = {"catalogue": counts, "declared": declared}
    line = (f"«Чтение стола»: ru {counts['ru']} партий, en {counts['en']} "
            f"(объявлено в хранилище: ru {declared['ru']}, en {declared['en']})")
    if counts["ru"] != counts["en"]:
        rep.fail(line + f" — англоговорящему недоступно {counts['ru'] - counts['en']} партий")
    else:
        rep.ok(line)
    for lang in LANGS:
        if counts[lang] != declared[lang]:
            rep.fail(f"каталог и хранилище разошлись на «{lang}»: "
                     f"{counts[lang]} против {declared[lang]}")


# -----------------------------------------------------------------------------
# 6. Курс: пункт, у которого второй язык не проверяется.
# -----------------------------------------------------------------------------

def check_course(rep: Report) -> None:
    print("\n═══ 6. КУРС: пункты и уроки ═══\n")
    pairs = 0
    identical: list[str] = []
    for item in BANK:
        out: list[str] = []
        pairs += walk_bilingual(item, item["id"], out)
        if out:
            rep.fail(f"{item['id']}: " + "; ".join(out[:3]))
        for key in ("reference", "bad_line", "player_line", "opponent_line", "prompt"):
            val = item.get(key)
            if isinstance(val, dict) and isinstance(val.get("ru"), str):
                if val["ru"].strip() == val.get("en", "").strip() and any(ord(c) > 127 for c in val["ru"]):
                    identical.append(f"{item['id']}.{key}")
    rep.stats["course_pairs"] = pairs
    rep.stats["course_untranslated"] = identical
    if identical:
        for x in identical[:10]:
            rep.fail(f"{x}: английская половина — русский текст")
    else:
        rep.ok(f"банк курса: {len(BANK)} пунктов, {pairs} пар {{ru,en}}, "
               "непереведённых нет")


# -----------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--strict", action="store_true",
                    help="мешок тоньше чем вдвое — тоже провал")
    ap.add_argument("--force", action="store_true",
                    help="считать даже при несошедшейся калибровке")
    args = ap.parse_args()

    if not args.json:
        print("\n═══ КАЛИБРОВКА ПРИБОРА ═══\n")
    ok, bad = calibrate()
    n_games = (len(SCORES["principled"]) + len(SCORES.get("other_side", {}))
               + len(SCORES["ladder"]) + len(SCORES["first_word"]))
    if ok:
        if not args.json:
            print(f"  ✓ {n_games} эталонных партий воспроизведены балл в балл "
                  f"по {len(_CALIBRATION_FIELDS)} полям")
    else:
        print(f"  ✗ ПРИБОР СЛОМАН: {len(bad)} расхождений с games.scores.json")
        for b in bad[:12]:
            print(f"      {b}")
        if not args.force:
            print("\n  Считать нечего: прибор играет не ту игру, что продукт.\n"
                  "  Баланс менялся намеренно — сперва tools/gen_game_scores.py.\n")
            return 2

    rep = Report()
    check_forms(rep)
    check_fixture_material(rep)
    check_same_game(rep, args.strict)
    check_thinness(rep, args.strict)
    check_reading_catalogue(rep)
    check_course(rep)

    print("\n═══ ИТОГ ═══\n")
    hole = (int(rep.stats.get("missing_lines", 0))
            + int(rep.stats.get("missing_games", 0))
            + int(rep.stats.get("different_game", 0)))
    print(f"  пар {{ru,en}} обойдено: {rep.stats.get('bilingual_pairs')} "
          f"+ {rep.stats.get('course_pairs')} в банке курса")
    print(f"  реплик, которых нет на втором языке: {rep.stats.get('missing_lines')}")
    print(f"  партий, которых нет на втором языке: {rep.stats.get('missing_games')}")
    print(f"  партий, играющих РАЗНУЮ игру на двух языках: {rep.stats.get('different_game')}")
    print(f"  мешков синонимов тоньше чем вдвое: {len(rep.stats.get('thin', []))}"
          f"{'' if args.strict else '  (заметка, не провал — см. --strict)'}")
    print(f"\n  РАЗМЕР ДЫРЫ: {hole}")
    print(f"  провалов: {len(rep.fails)}\n")

    if args.json:
        print(json.dumps({"stats": rep.stats, "fails": rep.fails, "notes": rep.notes},
                         ensure_ascii=False, indent=1))
    return 1 if rep.fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
