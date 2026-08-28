"""Эталонные партии: движок обязан отличать мастерство от спама.

ЗАЧЕМ ЭТОТ ФАЙЛ. Раньше абзац с ключевыми словами, вставленный одиннадцать раз
с меняющейся цифрой, давал A (98 из 100), а настоящая принципиальная партия —
99. Один балл разницы между работой и вставкой из буфера. Отдельные тесты этого
не ловили: каждый проверял свой кусок формулы, а вопрос «что выше чего» не
задавал никто.

Здесь утверждается ПОРЯДОК, а не числа. Баланс двигать можно — переставлять
качество местами нельзя. Партии лежат в `frontend/test/fixtures/games.json`,
потому что их читает и браузерное зеркало (`frontend/test/games.test.ts`):
инвариант 8 проверяется на тех же самых репликах, а не на похожих.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app import engine
from app.engine import analyze, by_id

FIXTURE = (Path(__file__).resolve().parents[3]
           / "frontend" / "test" / "fixtures" / "games.json")
GAMES = json.loads(FIXTURE.read_text(encoding="utf-8"))
LADDER = GAMES["ladder"]
PRINCIPLED = {k: v for k, v in GAMES["principled"].items() if k != "note"}


def lines_of(game: dict) -> list[str]:
    """`@principled.<id>` — ссылка на партию из соседнего раздела, чтобы
    образцовая игра лестницы и эталон стола не разъезжались копипастой."""
    lines = game["lines"]
    if isinstance(lines, str) and lines.startswith("@principled."):
        return PRINCIPLED[lines.split(".", 1)[1]]
    return lines


def play(scenario_id: str, msgs: list[str], lang: str = "ru"):
    sess = engine.create_session(scenario_id, lang)
    for text in msgs:
        if sess.state.status != "active":
            break
        sess.turn += 1
        engine.apply_move(sess, analyze(text), text)
        if sess.state.status == "active" and sess.turn >= sess.max_turns:
            sess.state.status = "breakdown"
    return sess, engine.score_session(sess)


def _ladder_scores() -> dict[str, int]:
    out = {}
    for gid in LADDER["order"]:
        game = next(g for g in LADDER["games"] if g["id"] == gid)
        _, debrief = play(LADDER["scenario"], lines_of(game), LADDER["lang"])
        out[gid] = debrief["overall"]
    return out


def test_quality_ladder_is_monotone() -> None:
    """Партии выстроены от худшей к лучшей — и движок обязан согласиться."""
    scores = _ladder_scores()
    order = LADDER["order"]
    for lo, hi in zip(order, order[1:]):
        assert scores[lo] <= scores[hi], (
            f"«{lo}» ({scores[lo]}) выше «{hi}» ({scores[hi]}): "
            f"лестница качества перевернулась — {scores}"
        )


def test_spam_scores_below_a_basic_game() -> None:
    """Главный замер этой правки: спам обязан быть НИЖЕ базовой игры.

    Было 98 против 99 в пользу спама — фактически ничья. Здесь требуется
    строгое неравенство, иначе тренажёр снова перестанет различать игрока и
    вставку из буфера.
    """
    scores = _ladder_scores()
    assert scores["spam"] < scores["basic"], scores
    assert scores["alternating"] < scores["basic"], scores
    assert scores["passive"] < scores["basic"], scores


def test_exemplary_game_earns_an_a() -> None:
    scores = _ladder_scores()
    assert scores["exemplary"] >= 85, scores


@pytest.mark.parametrize("scenario_id", sorted(PRINCIPLED))
def test_principled_play_grades_a_or_b_everywhere(scenario_id: str) -> None:
    """Инвариант 2 на КАЖДОМ столе, а не только на первом."""
    sess, debrief = play(scenario_id, PRINCIPLED[scenario_id])
    assert debrief["grade"] in ("A", "B"), (
        f"{scenario_id}: {debrief['grade']} ({debrief['overall']}), "
        f"econ={debrief['economic']} tech={debrief['technique']} "
        f"status={sess.state.status}"
    )
    assert sess.state.status == "agreement", scenario_id
    assert len(sess.state.interests_found) == 3, (
        f"{scenario_id}: вскрыто {sess.state.interests_found} из трёх — "
        "вопрос по теме обязан вскрывать интерес"
    )


# ---- Отдельные замеры, по одному на починенный дефект -----------------------

def test_twelve_empty_lines_do_not_move_the_price() -> None:
    """«Ага 1.»…«Ага 12.» уводили цену со 100 до 84.85 при дне 84.

    База уступки капала каждый ход независимо от сказанного, а `_concede` не
    умел ходить назад. Теперь молчание стоит ровно ноль.
    """
    game = next(g for g in LADDER["games"] if g["id"] == "passive")
    sess, _ = play(LADDER["scenario"], lines_of(game))
    sc = by_id(LADDER["scenario"])
    drift = abs(sess.state.offer_opp - sc.opponent_open)
    assert drift <= 0.03 * abs(sc.opponent_open), (
        f"цена уехала на {drift} без единого повода: {sess.state.offer_opp}"
    )


def test_hostility_walks_the_price_back() -> None:
    """После грубости предложение оппонента становится ХУЖЕ для игрока."""
    sess = engine.create_session("supplier", "ru")
    line = "По рыночным данным медиана независимых прайсов 86, потому что это стандарт."
    sess.turn += 1
    engine.apply_move(sess, analyze(line), line)
    before = sess.state.offer_opp
    rude = "Это просто смешно и некомпетентно, вы обманываете."
    sess.turn += 1
    engine.apply_move(sess, analyze(rude), rude)
    assert sess.state.offer_opp > before, (
        f"после хамства цена {sess.state.offer_opp} не хуже прежней {before}"
    )


def test_repeated_threat_walks_the_price_back() -> None:
    """Вторая угроза подряд — тоже обратный ход, а не бесплатный рычаг."""
    sess = engine.create_session("supplier", "ru")
    for line in ("По рыночным данным медиана прайсов 86, потому что это стандарт.",
                 "Либо вы двигаетесь, либо мы уходим — это ультиматум."):
        sess.turn += 1
        engine.apply_move(sess, analyze(line), line)
    before = sess.state.offer_opp
    line = "Требую немедленно снизить, иначе разрываем."
    sess.turn += 1
    engine.apply_move(sess, analyze(line), line)
    assert sess.state.offer_opp > before, (before, sess.state.offer_opp)


def test_lowball_close_is_a_failed_close_not_a_jackpot() -> None:
    """«Договорились, 42» первым ходом давало economic 100 — схождение
    клампом ровно на дне оппонента. Теперь это провал закрытия."""
    sess, debrief = play("supplier", ["Договорились, 42"])
    assert sess.state.status != "agreement", sess.state.status
    assert debrief["economic"] <= 15, debrief["economic"]
    assert sess.state.tension > 25, "провал закрытия обязан стоить нервов"


def test_generic_probes_uncover_at_most_one_interest() -> None:
    sess, _ = play("supplier", ["Почему для вас это важно?"] * 3)
    assert len(sess.state.interests_found) <= 1, sess.state.interests_found


def test_thematic_probes_uncover_all_three() -> None:
    sess, _ = play("supplier", PRINCIPLED["supplier"][:3])
    assert len(sess.state.interests_found) == 3, sess.state.interests_found


def test_alternating_two_lines_is_no_better_than_three_real_moves() -> None:
    """A,B,A,B… обходило анти-гейминг: память была на ОДНУ прошлую реплику."""
    alt = next(g for g in LADDER["games"] if g["id"] == "alternating")
    _, gamed = play(LADDER["scenario"], lines_of(alt))
    _, honest = play(LADDER["scenario"], PRINCIPLED["supplier"][:3])
    assert gamed["overall"] <= honest["overall"], (gamed["overall"], honest["overall"])
