"""Ссылка на документ, которого нет, — хуже отсутствия ссылки.

Пять мест в коде ссылались на `docs/modalities.md` как на источник правила про
оценку, и файла не было: инвариант ссылался сам на себя. Читатель кода при этом
видел аккуратную ссылку и верил, что где-то лежит разбор.

Тест гоняется по исходникам и требует, чтобы каждый упомянутый `docs/*.md`
существовал. Ловит и обратную беду — переименовали документ, а ссылки остались.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]

#: Где ищем ссылки. Сборочные каталоги и чужой код не наши, их не судим.
_SKIP = {"node_modules", "dist", ".git", ".venv", "__pycache__", "vendor",
         ".upstream", ".claude", "dist-mock", "legacy-node"}
_SUFFIXES = {".py", ".ts", ".tsx", ".md", ".css"}

_LINK = re.compile(r"docs/[A-Za-z0-9_.-]+\.md")


def _sources():
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.suffix not in _SUFFIXES:
            continue
        if any(part in _SKIP for part in path.parts):
            continue
        yield path


def test_every_doc_reference_resolves():
    missing: dict[str, list[str]] = {}
    for path in _sources():
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for ref in set(_LINK.findall(text)):
            if not (ROOT / ref).exists():
                missing.setdefault(ref, []).append(str(path.relative_to(ROOT)))

    assert not missing, "ссылки на несуществующие документы:\n" + "\n".join(
        f"  {ref} ← {', '.join(sorted(where))}" for ref, where in sorted(missing.items()))


def test_the_layer_invariant_has_a_written_source():
    """Именно этот документ — тот, на который ссылается правило про оценку."""
    doc = ROOT / "docs" / "modalities.md"
    assert doc.exists()
    text = doc.read_text(encoding="utf-8")
    assert "score_session" in text
    assert "Экзамен фиксирует слои выключенными" in text


# --------------------------------------------------------------- числа курса

#: Где документация называет объём курса. Числа здесь ГНИЮТ первыми: банк
#: растёт, а «54 упражнения» остаётся в README, в докладе и в продуктовом
#: описании — и на демонстрации звучит цифра, которой уже нет.
_VOLUME_DOCS = ("README.md", "docs/demo.md", "docs/product.md", "docs/course.md")

_STALE = re.compile(r"(\d+)\s+(?:упражнени\w*|exercises)")


def test_documented_exercise_count_matches_the_bank():
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.course.bank import BANK

    real = len(BANK)
    wrong: list[str] = []
    for name in _VOLUME_DOCS:
        path = ROOT / name
        if not path.exists():
            continue
        for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for match in _STALE.finditer(line):
                if int(match.group(1)) != real:
                    wrong.append(f"{name}:{line_no} говорит {match.group(1)}, в банке {real}")

    assert not wrong, "объём курса в документации разошёлся с банком:\n  " + "\n  ".join(wrong)


def test_documented_layers_are_the_layers_that_exist():
    """Список слоёв в докладе обязан совпадать с реальным.

    Слой, забытый в документе, — это возможность, о которой никто не узнает;
    слой, оставшийся в документе после удаления, — обещание, которого продукт
    не выполняет. Оба видны только сверкой, потому что таблица выглядит
    одинаково правдоподобно в обоих случаях.
    """
    import dataclasses
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.realtime.session import Layers

    doc = (ROOT / "docs" / "product.md").read_text(encoding="utf-8")
    #: Как слой называется в таблице докладной записки.
    names = {"probe": "Читай лицо", "voice": "Голосом", "camera": "Камера",
             "avatar": "Лицо оппонента", "pokerface": "Покерфейс"}

    real = {f.name for f in dataclasses.fields(Layers)}
    assert real == set(names), (
        "список слоёв изменился — обновите и таблицу в docs/product.md, "
        f"и этот тест: {sorted(real ^ set(names))}")
    for layer, title in names.items():
        assert title in doc, f"слой «{layer}» ({title}) не назван в docs/product.md"


def test_documented_table_and_campaign_counts_are_real():
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.engine.campaigns import CAMPAIGNS
    from app.engine.scenarios import SCENARIOS

    doc = (ROOT / "docs" / "product.md").read_text(encoding="utf-8")
    words = {8: "восемь", 9: "девять", 2: "Две", 4: "четыре"}
    assert words[len(SCENARIOS)] in doc, f"столов {len(SCENARIOS)}, а в докладе иначе"
    assert words[len(CAMPAIGNS)] in doc, f"кампаний {len(CAMPAIGNS)}, а в докладе иначе"
    for c in CAMPAIGNS:
        assert len(c.stages) == 4, f"{c.id}: актов {len(c.stages)}, доклад обещает четыре"


def test_maps_of_the_repo_list_every_backend_package():
    """Оба дерева — в README и в CLAUDE.md — обязаны называть все пакеты.

    `course/` не был перечислен ни в одном ни дня с момента появления — а это
    девять блоков, банк упражнений и половина продукта. Дерево, которому можно
    не верить, хуже отсутствующего: читатель считает его картой и не идёт
    смотреть сам. CLAUDE.md здесь важнее README: по нему ориентируется тот, кто
    правит код.
    """
    app = ROOT / "services" / "gateway" / "app"
    packages = {d.name for d in app.iterdir()
                if d.is_dir() and (d / "__init__.py").exists() and d.name != "vendor"}
    for name in ("README.md", "CLAUDE.md"):
        text = (ROOT / name).read_text(encoding="utf-8")
        missing = sorted(pkg for pkg in packages if f"{pkg}/" not in text)
        assert not missing, f"{name} не называет пакеты: {missing}"


def test_readme_does_not_advertise_routes_that_were_removed():
    """Ручка /ws удалена вместе с протоколом «запрос-ответ»."""
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert "WS /ws" not in readme, "README обещает удалённую ручку /ws"


def test_the_typecheck_trap_is_written_down():
    """`npx tsc --noEmit` во фронтенде всегда возвращает ноль — и это ловушка.

    Корневой tsconfig.json содержит `"files": []` и только ссылки на проекты,
    поэтому в обычном (не `-b`) режиме компилятору не передан ни один файл: он
    отвечает «чисто» на код, который не собирается. На эту команду тянет руку у
    каждого, кто работал с другими репозиториями, а ошибка тихая.

    Тест сторожит две вещи сразу: что предупреждение не выпало из CLAUDE.md, и
    что причина никуда не делась (появится в корневом конфиге настоящий список
    файлов — предупреждение станет ложью, и его надо будет убрать).
    """
    import json

    config = json.loads((ROOT / "frontend" / "tsconfig.json").read_text(encoding="utf-8"))
    trap_still_there = config.get("files") == [] and config.get("references")
    doc = (ROOT / "CLAUDE.md").read_text(encoding="utf-8")
    warned = "npx tsc --noEmit" in doc and "npm run typecheck" in doc

    if trap_still_there:
        assert warned, "ловушка на месте, а предупреждения в CLAUDE.md нет"
    else:
        assert not warned, "ловушки больше нет — предупреждение стало ложью, уберите его"


def test_docs_do_not_reference_missing_screenshots():
    """Ссылка на несуществующий снимок — сломанная картинка в докладе.

    СВЕЖЕСТЬ снимков здесь НЕ проверяется, и это осознанно: сравнение по времени
    правки styles.css краснеет от любой, даже несвязанной правки оформления, и
    тест, который краснеет не по делу, приучает себя не читать. Свежесть
    напоминает `make preflight` — там она и нужна, перед показом.
    """
    import re

    referenced: set[str] = set()
    for doc in (ROOT / "docs").glob("*.md"):
        referenced |= set(re.findall(r"screenshots/([A-Za-z0-9_.-]+\.png)",
                                     doc.read_text(encoding="utf-8")))
    shots = ROOT / "docs" / "screenshots"
    missing = sorted(name for name in referenced if not (shots / name).exists())
    assert not missing, f"документация ссылается на несуществующие снимки: {missing}"
