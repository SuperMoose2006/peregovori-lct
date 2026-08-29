"""Что продукт ПРЕДЛАГАЕТ сказать — движок обязан засчитать.

ЗАЧЕМ ЭТОТ ФАЙЛ. Карточка «Стол накрыт» печатала новичку три реплики и
подписывала их приёмами: «🎯 Интерес», «📊 Критерий», «🔄 Размен». Прогон через
движок: первая давала `interests_probe`, но реакцию `probe_vague` — вопрос без
темы; вторая и третья не давали заявленного приёма ВООБЩЕ (`open_question`).
Шесть ходов строго по подсказкам самого продукта не двигали цену ни на копейку и
кончались грейдом F. Тренажёр говорил человеку, что сказать, и не засчитывал
сказанное — а соседний виджет на том же экране (чипы композера) был сделан
правильно. Два места на одном экране учили разному.

Здесь закрыт КЛАСС, а не случай. Строки берутся ИЗ ФАЙЛА зеркала
`frontend/src/i18n.ts` регуляркой по форме «ярлык + текст», а не из списка,
переписанного руками: новая подсказка попадает под проверку в тот же момент,
когда её добавили. Ярлык обязан быть заведён в карте приёмов ниже — незнакомый
значок валит сборку, а не проходит молча.

Проверяются три источника предложений:
  · карточка «Стол накрыт» (`opening.lines`) и чипы композера (`quickMoves`) —
    прямые вставки в поле ввода;
  · шаблон вопроса по теме, который тренер цитирует (`views.compute_hint`);
    цитата тренера — тоже строка, которую продукт предлагает сказать.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app import engine, views
from app.engine import analyze
from app.engine.engine import _reveal_index_offline
from app.engine.scenarios import SCENARIOS
from app.engine.techniques import norm

I18N = (Path(__file__).resolve().parents[3] / "frontend" / "src" / "i18n.ts")

#: Значок ярлыка → приём, который движок ОБЯЗАН найти в предложенной строке.
#: Значок не переводится, поэтому карта одна на оба языка. Набор в значении —
#: «хотя бы один из»: у SPIN четыре стадии, и любая годится.
TAG_MOVES: dict[str, set[str]] = {
    "🎯": {"interests_probe"},
    "📊": {"objective_criteria"},
    "🔄": {"tradeoff"},
    "🤝": {"acknowledge"},
    "❓": {"spin_situation", "spin_problem", "spin_implication", "spin_needpayoff"},
}

#: `{ tag: "…", text: "…" }` и `{ label: "…", text: "…" }` — обе формы, в которых
#: продукт предлагает игроку готовую строку. Ищется по ВСЕМУ файлу: подсказка,
#: заведённая в новом месте, всё равно попадёт под проверку.
_SUGGESTION = re.compile(
    r'\{\s*(?:tag|label):\s*"((?:[^"\\]|\\.)*)"\s*,\s*text:\s*"((?:[^"\\]|\\.)*)"\s*\}'
)


def _suggestions() -> list[tuple[str, str]]:
    text = I18N.read_text(encoding="utf-8")
    out = [(m.group(1), m.group(2)) for m in _SUGGESTION.finditer(text)]
    assert out, "в i18n.ts не нашлось ни одной подсказки — сломалась регулярка?"
    return out


def test_every_suggested_line_earns_the_technique_it_is_labelled_with():
    """Ни одна строка из продукта не смеет обещать приём, которого не даёт."""
    broken: list[str] = []
    for tag, text in _suggestions():
        want = TAG_MOVES.get(tag[:1])
        if want is None:
            broken.append(
                f"ярлык «{tag}» не заведён в TAG_MOVES: подсказка «{text}» "
                f"осталась бы непроверенной")
            continue
        moves = set(analyze(text).moves)
        if not (moves & want):
            broken.append(f"«{tag}» → «{text}»: движок увидел {sorted(moves)}, "
                          f"а обещан один из {sorted(want)}")
    assert not broken, "подсказки продукта расходятся с движком:\n  " + "\n  ".join(broken)


def test_the_card_and_the_composer_offer_the_same_number_of_lines_in_both_languages():
    """Билингвальность (инвариант 4) — на подсказках тоже: подсказка, забытая в
    одном языке, делает половину продукта немой."""
    tags = [t[:1] for t, _ in _suggestions()]
    assert len(tags) % 2 == 0, "подсказки не парны по языкам"
    half = len(tags) // 2
    assert tags[:half] == tags[half:], (
        "набор подсказок RU и EN разошёлся по составу приёмов: "
        f"{tags[:half]} против {tags[half:]}")


def _interest_stem(lang: str) -> str:
    """Зачаток «🎯 Интерес» из карточки «Стол накрыт» на нужном языке."""
    sug = _suggestions()
    half = len(sug) // 2
    part = sug[:half] if lang == "ru" else sug[half:]
    for tag, text in part:
        if tag.startswith("🎯"):
            return text
    raise AssertionError(f"в карточке нет строки «🎯 Интерес» для {lang}")


@pytest.mark.parametrize("sc", SCENARIOS, ids=lambda s: s.id)
@pytest.mark.parametrize("lang", ["ru", "en"])
def test_the_interest_stem_plus_a_topic_actually_uncovers_that_interest(sc, lang):
    """Зачаток из карточки, достроенный ТЕМОЙ СО СТОЛА, обязан вскрывать
    интерес — на всех девяти столах и на обоих языках.

    Это и есть починенный дефект целиком: раньше вопрос по подсказке продукта
    давал `probe_vague`, потому что вскрытие требовало назвать СОДЕРЖАНИЕ
    секрета. Теперь тема видна игроку, и вопрос по ней — выбор, а не угадывание."""
    stem = _interest_stem(lang)
    for i, topic in enumerate(sc.interest_topics[lang]):
        line = f"{stem}{topic}?"
        assert "interests_probe" in analyze(line).moves, f"{sc.id}/{lang}: «{line}»"
        got = _reveal_index_offline(sc, norm(line), lang, [])
        assert got == i, (
            f"{sc.id}/{lang}: «{line}» вскрыл {got}, а тема стоит на {i}")


@pytest.mark.parametrize("sc", SCENARIOS, ids=lambda s: s.id)
@pytest.mark.parametrize("lang", ["ru", "en"])
def test_the_coach_only_quotes_lines_the_engine_recognises(sc, lang):
    """Тренер цитирует реплику в кавычках — значит, обязан цитировать
    работающую. Здесь стояло «Что для вас важнее всего в этой сделке?»: вопрос
    без темы, то есть ровно тот, на который движок отвечает `probe_vague`."""
    sess = engine.create_session(sc.id, lang)
    hint = views.compute_hint(sess, lang)
    quoted = re.search(r'[«"](.+?)[»"]', hint)
    assert quoted, f"{sc.id}/{lang}: тренер не цитирует ничего — {hint!r}"
    line = quoted.group(1)
    assert "interests_probe" in analyze(line).moves, f"{sc.id}/{lang}: «{line}»"
    assert _reveal_index_offline(sc, norm(line), lang, []) is not None, (
        f"{sc.id}/{lang}: тренер советует «{line}», а движок не вскрывает по ней "
        f"ни одного интереса")
