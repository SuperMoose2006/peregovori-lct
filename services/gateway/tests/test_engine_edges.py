"""test_engine_edges.py — углы движка, до которых не доходит обычная партия.

Обычные тесты движка играют осмысленные партии. Здесь наоборот: последовательности
собираются машиной и специально уводят состояние в край — двенадцать грубостей
подряд, закрытие и хамство в одной реплике, цифры на всех девяти столах и на
обеих шкалах. Инварианты 1, 2 и 8 обязаны держаться и там.
"""

from __future__ import annotations

import random
import re
from pathlib import Path

import pytest

from app import engine
from app.engine import analyze
from app.engine.scenarios import SCENARIOS
from app.engine.techniques import analyze as analyze_raw

MIRROR = (Path(__file__).resolve().parents[3]
          / "frontend" / "src" / "data" / "scenarios.ts")

#: Реплики, из которых собираются случайные партии. Сюда намеренно попали и
#: пустая строка, и голая цифра, и строки, несущие сразу два приёма.
CORPUS = [
    "Почему для вас это важно?",
    "Я вас понимаю, справедливо.",
    "По рынку медиана 88, данные показывают это.",
    "У нас есть альтернатива, конкурент даёт дешевле потому что объём.",
    "Взамен мы дадим предоплату, если вы подвинетесь.",
    "Иначе мы уходим.",
    "Это смешно, вы некомпетентны.",
    "Наша цена 90.",
    "Договорились.",
    "Сколько вы сейчас теряете?",
    "Что вас беспокоит больше всего?",
    "Рад встрече!",
    "",
    "?",
    "Ага 1.",
    "Готовы уступить до 95.",
    "Договорились, иначе мы уходим.",
    "По рукам, вы врете, но ладно.",
    "Договорились на 84.",
]


def _play(scenario_id: str, lines: list[str], lang: str = "ru",
          difficulty: int | None = None) -> engine.Session:
    sess = engine.create_session(scenario_id, lang)
    if difficulty is not None:
        sess.difficulty = difficulty
    for text in lines:
        if sess.state.status != "active":
            break
        sess.turn += 1
        engine.apply_move(sess, analyze(text), text)
    return sess


# --- Инвариант 1: оппонент никогда не переходит свой floor -------------------

def test_opponent_stays_between_anchor_and_floor_under_random_play():
    """Уступка — доля пути до дна, откат — доля пути до якоря. Значит цена обязана
    жить в отрезке [открытие, дно] при ЛЮБОЙ последовательности, включая ту, где
    щедрый стол (сложность 1) двенадцать ходов подряд получает поводы уступить."""
    rng = random.Random(20240828)
    problems: list[str] = []
    for sc in SCENARIOS:
        lower = sc.headline.dir == "lower_is_better"
        lo = min(sc.opponent_open, sc.opponent_reservation)
        hi = max(sc.opponent_open, sc.opponent_reservation)
        for difficulty in (1, 2, 3, 4, 5):
            for _ in range(40):
                lines = [rng.choice(CORPUS) for _ in range(rng.randint(1, 14))]
                sess = _play(sc.id, lines, difficulty=difficulty)
                offer = sess.state.offer_opp
                if not (lo - 1e-9 <= offer <= hi + 1e-9):
                    problems.append(f"{sc.id}/d{difficulty}: {offer} вне [{lo}, {hi}] на {lines}")
                deal = sess.state.deal
                if deal is not None:
                    ok = (deal >= sc.opponent_reservation - 1e-3) if lower else (
                        deal <= sc.opponent_reservation + 1e-3)
                    if not ok:
                        problems.append(f"{sc.id}/d{difficulty}: сделка {deal} за дном "
                                        f"{sc.opponent_reservation} на {lines}")
    assert not problems, "оппонент вышел за свой коридор:\n  " + "\n  ".join(problems[:10])


def test_meters_stay_inside_their_scales_under_random_play():
    """Доверие, напряжение, информация и рычаг — шкалы 0..100, а не счётчики."""
    rng = random.Random(31337)
    problems: list[str] = []
    for sc in SCENARIOS:
        for difficulty in (1, 3, 5):
            for _ in range(40):
                lines = [rng.choice(CORPUS) for _ in range(rng.randint(1, 14))]
                s = _play(sc.id, lines, difficulty=difficulty).state
                for name, value in (("trust", s.trust), ("tension", s.tension),
                                    ("info", s.info), ("leverage", s.leverage)):
                    if not 0 <= value <= 100:
                        problems.append(f"{sc.id}/d{difficulty}: {name}={value} на {lines}")
    assert not problems, "шкала вышла за 0..100:\n  " + "\n  ".join(problems[:10])


# --- Срыв старше рукопожатия -------------------------------------------------

def test_breakdown_in_the_same_move_leaves_no_deal_on_the_table():
    """Одна реплика умеет закрыть сделку и сорвать переговоры одновременно.

    «По рукам, вы врете» — `accept` записывает сделку, хамство в той же строке
    добивает напряжение до ста. Раньше `status` был `breakdown`, а `deal` оставался
    числом: стол показывал цену сделки, которой нет. Второй принцип запрещает
    именно это."""
    sess = engine.create_session("supplier", "ru")
    sess.state.tension = 92          # два хамства позади — стол на грани
    sess.turn += 1
    line = "По рукам, вы врете, но ладно."
    result = engine.apply_move(sess, analyze(line), line)

    assert sess.state.status == "breakdown"
    assert result.closed is True
    assert sess.state.deal is None, "сделки на сорванном столе быть не может"
    debrief = engine.score_session(sess)
    assert debrief["economic"] == 0
    assert engine.to_state_view(sess)["deal"] is None


# --- Инвариант 8: числа читаются одинаково в обоих ядрах ---------------------

@pytest.mark.parametrize("text", [
    "наша цена ٩٠",      # арабо-индийские цифры
    "наша цена ９０",      # полноширинные цифры
    "наша цена ௧௰",      # тамильские
])
def test_non_ascii_digits_are_not_prices(text: str):
    """`\\d` в питоне ловит любую десятичную цифру юникода, `float()` их разбирает.

    В браузерном зеркале `\\d` — это [0-9]. Пока классы расходились, одна и та же
    реплика была офертой на сервере и пустым звуком офлайн (инвариант 8)."""
    assert analyze_raw(text).number is None


def test_substance_bonus_needs_an_ascii_digit():
    """`str.isdigit()` истинен для «٩» и «²» — а `/\\d/` в зеркале нет.

    Разница стоила 18 баллов аргументации, а 35 баллов — порог, за которым
    критерий начинает двигать цену. То есть расходилась не оценка, а цифра на столе."""
    assert analyze_raw("по рынку ١٢٣ это норма").arg_quality == \
        analyze_raw("по рынку это норма").arg_quality
    assert analyze_raw("по рынку 123 это норма").arg_quality > \
        analyze_raw("по рынку это норма").arg_quality


def test_mirror_carries_the_same_number_of_tradeoff_hints():
    """`tradeoffs_used` упирается в ДЛИНУ списка разменов сценария.

    Список живёт в двух файлах, и в зеркале их было по два против трёх на сервере:
    после третьего размена разбор писал «3» онлайн и «2» офлайн, а `_line_seed`
    выбирал разные реплики оппонента на одной и той же партии."""
    text = MIRROR.read_text(encoding="utf-8")
    starts = [(m.group(1), m.start()) for m in re.finditer(r'\n    id: "([a-z_]+)"', text)]
    wrong: list[str] = []
    for i, (sid, at) in enumerate(starts):
        end = starts[i + 1][1] if i + 1 < len(starts) else len(text)
        block = text[at:end]
        sc = next((s for s in SCENARIOS if s.id == sid), None)
        if sc is None:
            continue
        chunk = re.search(r"tradeoffs: \{(.*?)\n    \},|tradeoffs: \{(.*?)\},",
                          block, re.S)
        assert chunk, f"{sid}: в зеркале не найден блок tradeoffs"
        body = chunk.group(1) or chunk.group(2)
        for lang in ("ru", "en"):
            found = re.search(rf"{lang}: \[(.*?)\]", body, re.S)
            assert found, f"{sid}/{lang}: в зеркале нет списка разменов"
            n = len(re.findall(r'"[^"]*"', found.group(1)))
            if n != len(sc.tradeoffs[lang]):
                wrong.append(f"{sid}/{lang}: зеркало {n}, движок {len(sc.tradeoffs[lang])}")
    assert not wrong, "списки разменов разошлись между движками:\n  " + "\n  ".join(wrong)


# --- Анти-гейминг: косметика не спасает повтор -------------------------------

@pytest.mark.parametrize("mutate,name", [
    (lambda s, i: s, "дословно"),
    (lambda s, i: s.upper() if i % 2 else s, "регистр"),
    (lambda s, i: s.replace(".", "!" * (i + 1)), "пунктуация"),
    (lambda s, i: " ".join(s.split()[i % 7:] + s.split()[:i % 7]), "перестановка слов"),
    (lambda s, i: s + " " + "🙂" * (i + 1), "эмодзи"),
    (lambda s, i: s + "​" * (i + 1), "нулевая ширина"),
    (lambda s, i: s + f" уточнение{i}", "одно новое слово"),
])
def test_cosmetic_mutation_does_not_revive_a_repeated_line(mutate, name: str):
    """Жаккар по словам не обманывается регистром, знаками, порядком слов и
    невидимыми символами: сходство считается по множеству, а `norm` выбрасывает
    всё, что не буква и не цифра."""
    base = "По рынку медиана 88 по трём независимым прайсам, потому что объём вырос."
    sess = _play("supplier", [mutate(base, i) for i in range(12)])
    debrief = engine.score_session(sess)
    assert debrief["grade"] == "F", f"{name}: спам получил {debrief['grade']}"
    # И цена почти не двигается: 12 повторов не проходят и половины пути к дну.
    assert sess.state.offer_opp > 92, f"{name}: цена уехала до {sess.state.offer_opp}"


# --- Детерминизм -------------------------------------------------------------

def test_the_same_lines_give_byte_identical_results_every_run():
    """Ни времени, ни случайности, ни порядка словаря в счёте нет.

    Единственный `random` в движке — генерация id сессии; он в счёт не входит."""
    lines = [CORPUS[i % len(CORPUS)] for i in range(12)]
    for sc in SCENARIOS:
        for lang in ("ru", "en"):
            runs = []
            for _ in range(3):
                sess = _play(sc.id, lines, lang=lang)
                runs.append((
                    engine.score_session(sess),
                    sess.state.offer_opp,
                    sess.state.deal,
                    engine.render_line(sess, "neutral", False),
                ))
            assert runs[0] == runs[1] == runs[2], f"{sc.id}/{lang} не воспроизводится"


# ------------------------------------------------ отрицание внутри ключевого слова

def test_a_complaint_is_not_active_listening():
    """«Несправедливо» содержит «справедливо» — и жалоба шла за эмпатию.

    Ключевые слова сравнивались голым вхождением подстроки, поэтому «это
    несправедливо по отношению ко мне» получало активное слушание, +8 доверия и
    самую тёплую реакцию. Английское «unfair» при этом не давало ничего: два
    языка вели себя по-разному на одном и том же предложении.
    """
    from app.engine.techniques import analyze

    complaint = analyze("Это несправедливо по отношению ко мне.")
    assert "empathy" not in [t["key"] for t in complaint.tags]
    assert complaint.primary != "acknowledge"

    # А настоящее «справедливо» по-прежнему считается.
    fair = analyze("Это справедливо для обеих сторон.")
    assert "empathy" in [t["key"] for t in fair.tags]


def test_stems_still_catch_word_forms():
    """Закрыто только НАЧАЛО слова: основы обязаны ловить словоформы."""
    from app.engine.techniques import analyze

    for line in ("Загрузка производства для вас важна?",
                 "Загрузку производства это как-то затрагивает?"):
        assert analyze(line).flags.get("question"), line


def test_a_threat_to_leave_is_not_a_trade():
    """«Тогда мы уходим к конкуренту» читалось как РАЗМЕН и давало +6 доверия.

    Размен имеет форму условия («если мы… то вы…»); «тогда мы» — форма
    следствия, то есть ровно форма угрозы. Дистрактор упражнения `pd-01`
    обещал рост напряжения, а движок вознаграждал за него доверием.
    """
    from app.engine.techniques import analyze

    threat = analyze("Тогда мы уходим к конкуренту, у них 99.7 процента")
    assert "tradeoff" not in [t["key"] for t in threat.tags]

    trade = analyze("Если мы дадим годовой контракт — сможете подвинуться?")
    assert "tradeoff" in [t["key"] for t in trade.tags]
