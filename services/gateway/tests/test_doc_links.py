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
