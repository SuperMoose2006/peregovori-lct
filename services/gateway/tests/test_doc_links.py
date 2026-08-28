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
