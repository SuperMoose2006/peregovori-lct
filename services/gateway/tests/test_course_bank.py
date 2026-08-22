"""Банк упражнений сверяется с НАСТОЯЩИМ движком — на обоих языках.

Это главный тест курса. Он существует ради одного: «правильный ответ» в
упражнении обязан быть правильным и в игре. Любая правка баланса, словаря
приёмов или сценария, которая расходится с курсом, валит сборку — вместо того
чтобы тихо превратить урок в ложь.
"""

from __future__ import annotations

import pytest

from app.course.bank import BANK, BY_ID
from app.course.blocks import BLOCKS, BY_ID as BLOCK_BY_ID
from app.course.check import check_choice, check_freeform, check_numeric, check_order
from app.course.derive import derive
from app.course.simulate import answer_for
from app.engine.scenarios import by_id
from app.engine.techniques import analyze

LANGS = ("ru", "en")
TYPES = {"choice", "spot_error", "order", "match", "numeric", "freeform",
         "reaction", "meters", "drill"}

CHOICE = [x for x in BANK if x["type"] == "choice" and x.get("expect_moves")]
FREEFORM = [x for x in BANK if x["type"] == "freeform"]
GENERATED = [x for x in BANK if x["type"] in ("reaction", "meters")]
NUMERIC_DERIVED = [x for x in BANK if x["type"] == "numeric" and x.get("derive")]


def _ids(items):
    return [x["id"] for x in items]


# ---- структура ------------------------------------------------------------

def test_ids_unique_and_blocks_exist() -> None:
    assert len(BY_ID) == len(BANK)
    for item in BANK:
        assert item["block"] in BLOCK_BY_ID, item["id"]
        block = BLOCK_BY_ID[item["block"]]
        assert 1 <= item["lesson"] <= len(block.lessons), item["id"]
        assert item["type"] in TYPES
        if "scenario_id" in item:
            assert by_id(item["scenario_id"]) is not None, item["id"]


@pytest.mark.parametrize("item", BANK, ids=_ids(BANK))
def test_bilingual_everywhere(item: dict) -> None:
    """Ни одного пункта без обоих языков — иначе экзамен на EN показывает дыры."""

    def walk(node) -> None:
        if isinstance(node, dict):
            if "ru" in node or "en" in node:
                assert node.get("ru") and node.get("en"), item["id"]
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(item)


@pytest.mark.parametrize("block", BLOCKS, ids=[b.id for b in BLOCKS])
def test_every_block_has_exercises(block) -> None:
    mine = [x for x in BANK if x["block"] == block.id]
    assert len(mine) >= 5, block.id
    assert len({x["type"] for x in mine}) >= 3, block.id


# ---- сверка с движком -----------------------------------------------------

@pytest.mark.parametrize("item", CHOICE, ids=_ids(CHOICE))
@pytest.mark.parametrize("lang", LANGS)
def test_choice_answer_is_what_the_engine_sees(item: dict, lang: str) -> None:
    """Верный вариант обязан давать заявленные приёмы в НАСТОЯЩЕМ анализаторе."""
    text = item["options"][item["answer"]][lang]
    moves = analyze(text).moves
    for move in item["expect_moves"]:
        assert move in moves, f"{item['id']}/{lang}: {moves}"
    assert check_choice(item, item["answer"])


@pytest.mark.parametrize("item", FREEFORM, ids=_ids(FREEFORM))
@pytest.mark.parametrize("lang", LANGS)
def test_reference_answer_passes_its_own_check(item: dict, lang: str) -> None:
    """Эталон из банка обязан проходить предикат, которым судят игрока."""
    result = check_freeform(item, item["reference"][lang], lang)
    assert result["ok"], f"{item['id']}/{lang}: {result['reasons']}"


@pytest.mark.parametrize("item", GENERATED, ids=_ids(GENERATED))
@pytest.mark.parametrize("lang", LANGS)
def test_generated_answer_matches_engine(item: dict, lang: str) -> None:
    """`reaction` и `meters` не «написаны», а вычислены. Сверяем оба языка."""
    assert answer_for(item, lang) == item["answer"], item["id"]


@pytest.mark.parametrize("item", NUMERIC_DERIVED, ids=_ids(NUMERIC_DERIVED))
def test_derived_numbers_match_scenarios(item: dict) -> None:
    """Цифра из сценария не переписана руками — иначе баланс и курс разъедутся."""
    value = derive(item["derive"], item["scenario_id"])
    assert check_numeric(item, value), f"{item['id']}: движок даёт {value}"


@pytest.mark.parametrize("item", [x for x in BANK if x["type"] == "order"],
                         ids=_ids([x for x in BANK if x["type"] == "order"]))
def test_order_answer_covers_items(item: dict) -> None:
    assert sorted(item["answer"]) == sorted(x["id"] for x in item["items"])
    assert check_order(item, item["answer"])


@pytest.mark.parametrize("item", [x for x in BANK if x["type"] == "match"],
                         ids=_ids([x for x in BANK if x["type"] == "match"]))
def test_match_answer_is_a_bijection(item: dict) -> None:
    left = {x["id"] for x in item["left"]}
    right = {x["id"] for x in item["right"]}
    assert set(item["answer"]) == left
    assert set(item["answer"].values()) == right
    assert len(set(item["answer"].values())) == len(right)


@pytest.mark.parametrize("item", [x for x in BANK if x["type"] == "spot_error"],
                         ids=_ids([x for x in BANK if x["type"] == "spot_error"]))
def test_spot_error_points_at_its_fault_key(item: dict) -> None:
    assert item["options"][item["answer"]]["key"] == item["fault_key"]


@pytest.mark.parametrize("item", [x for x in BANK if x["type"] == "drill"],
                         ids=_ids([x for x in BANK if x["type"] == "drill"]))
def test_drill_predicate_uses_only_engine_fields(item: dict) -> None:
    """Ни один сигнал слоёв в предикат не входит — сравнимость грейдов."""
    allowed = {"status", "deal", "interests_found", "tension", "trust", "info",
               "leverage", "turn", "terms_conceded", "offer_opp", "offer_player"}
    for cond in item["pass"]:
        assert cond["field"] in allowed, item["id"]


# ---- экзамен мастера ------------------------------------------------------

from app.course.master import MASTER, PASS_MARK  # noqa: E402


@pytest.mark.parametrize("item", MASTER, ids=[x["id"] for x in MASTER])
def test_master_drill_is_playable_and_engine_only(item: dict) -> None:
    """Три партии подряд — но по тем же правилам, что и всё остальное."""
    sc = by_id(item["scenario_id"])
    assert sc is not None, item["id"]
    allowed = {"status", "deal", "interests_found", "tension", "trust", "info",
               "leverage", "turn", "terms_conceded"}
    for cond in item["pass"]:
        assert cond["field"] in allowed, item["id"]
    assert item["max_turns"] >= 6, item["id"]
    for key in ("prompt", "goal", "explain"):
        assert item[key]["ru"] and item[key]["en"], f"{item['id']}/{key}"


def test_master_uses_tables_the_blocks_do_not_train_on() -> None:
    """Знакомый стол проверял бы память, а не навык."""
    trained = {b.scenario_id for b in BLOCKS}
    fresh = [x for x in MASTER if x["scenario_id"] not in trained]
    assert fresh, "хотя бы один стол обязан быть новым"
    assert 1 <= PASS_MARK <= len(MASTER)


@pytest.mark.parametrize("item", MASTER, ids=[x["id"] for x in MASTER])
def test_master_target_is_inside_the_deal_zone(item: dict) -> None:
    """Условие прохода обязано быть достижимым: цель не за полом оппонента."""
    sc = by_id(item["scenario_id"])
    lower_better = sc.headline.dir == "lower_is_better"
    deal = next((c for c in item["pass"] if c["field"] == "deal"), None)
    if deal is None:
        return
    if lower_better:
        assert deal["value"] >= sc.opponent_reservation, item["id"]
    else:
        assert deal["value"] <= sc.opponent_reservation, item["id"]
