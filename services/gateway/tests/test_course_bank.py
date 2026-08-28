"""Банк упражнений сверяется с НАСТОЯЩИМ движком — на обоих языках.

Это главный тест курса. Он существует ради одного: «правильный ответ» в
упражнении обязан быть правильным и в игре. Любая правка баланса, словаря
приёмов или сценария, которая расходится с курсом, валит сборку — вместо того
чтобы тихо превратить урок в ложь.
"""

from __future__ import annotations

from pathlib import Path

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
         "reaction", "meters", "face", "drill"}

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


# ---- «прочитай лицо»: картинка обязана быть однозначной ------------------

from app.avatar.base import REACTION_TO_STATE  # noqa: E402

#: Псевдонимы фронтенда: не для каждого состояния нарисована своя картинка.
#: Зеркало `ALIASES` в components/OpponentFace.tsx.
_DRAWN_ALIAS = {"nod": "warm", "smile": "warm", "shake_head": "annoyed",
                "idle": "listening", "hesitation": "thinking"}


def _drawn(reaction: str) -> str:
    state = REACTION_TO_STATE.get(reaction, "listening")
    return _DRAWN_ALIAS.get(state, state)


FACE = [x for x in BANK if x["type"] == "face"]


@pytest.mark.parametrize("item", FACE, ids=_ids(FACE))
def test_face_answer_has_its_own_picture(item: dict) -> None:
    """Ни один дистрактор не должен выглядеть ТАК ЖЕ, как верный ответ.

    Картинок меньше, чем реакций: `nod` и `smile` рисуются как `warm`, а
    `shake_head` — как `annoyed`. Если в вариантах окажется реакция с той же
    картинкой, у задания будет два одинаково верных ответа — и это ровно та
    тихая ложь, ради которой банк вообще проверяется тестами.
    """
    from app.course.simulate import METERS  # noqa: F401  (держим импорт локальным)

    scale = ["walked_out", "offended", "hardened", "pressured", "not_yet",
             "neutral", "collaborated", "persuaded", "opened_up", "warmed"]
    answer = item["answer"]
    assert answer in scale, item["id"]
    i = scale.index(answer)
    near = []
    d = 1
    while len(near) < 3 and d < len(scale):
        for j in (i - d, i + d):
            if 0 <= j < len(scale) and len(near) < 3:
                near.append(scale[j])
        d += 1
    for other in near:
        assert _drawn(other) != _drawn(answer), (
            f"{item['id']}: «{other}» рисуется так же, как «{answer}»")


@pytest.mark.parametrize("item", FACE, ids=_ids(FACE))
def test_face_picture_exists(item: dict) -> None:
    """Картинка обязана лежать на диске — иначе задание показывает пустоту."""
    root = Path(__file__).resolve().parents[3] / "frontend" / "public" / "avatars"
    path = root / item["scenario_id"] / f"{_drawn(item['answer'])}.webp"
    assert path.is_file(), path


# ---- предикаты, которыми судят игрока -------------------------------------
#
# Выше проверено, что эталон проходит собственный предикат у `choice` и
# `freeform`. У остальных типов предикат не вызывался НИ РАЗУ — ни в приложении
# (проверку ведёт офлайн-ядро фронтенда), ни в тестах. То есть для `match`,
# `reaction`, `meters` и `face` главное обещание курса — «правильный ответ
# обязан быть правильным» — держалось ни на чём.

MATCH = [x for x in BANK if x["type"] == "match"]
PICKED = [x for x in BANK if x["type"] in ("reaction", "meters", "face")]
ORDERED = [x for x in BANK if x["type"] == "order"]


@pytest.mark.parametrize("item", MATCH, ids=_ids(MATCH))
def test_match_answer_passes_its_own_check(item: dict) -> None:
    """Заявленное соответствие обязано проходить предикат `check_match`."""
    from app.course.check import check_match
    assert check_match(item, item["answer"]), item["id"]


@pytest.mark.parametrize("item", MATCH, ids=_ids(MATCH))
def test_match_rejects_a_swapped_pair(item: dict) -> None:
    """И обязано ОТВЕРГАТЬ перепутанное — иначе предикат принимает что угодно."""
    from app.course.check import check_match
    pairs = dict(item["answer"])
    if len(pairs) < 2:
        pytest.skip("нечего менять местами")
    keys = list(pairs)
    pairs[keys[0]], pairs[keys[1]] = pairs[keys[1]], pairs[keys[0]]
    assert not check_match(item, pairs), f"{item['id']}: перепутанные пары зачтены"


@pytest.mark.parametrize("item", PICKED, ids=_ids(PICKED))
def test_picked_answer_passes_its_own_check(item: dict) -> None:
    """`reaction`, `meters`, `face`: заявленный ответ обязан проходить предикат."""
    from app.course.check import check_pick
    assert check_pick(item, item["answer"]), item["id"]
    assert not check_pick(item, str(item["answer"]) + "_нет"), f"{item['id']}: предикат принимает что угодно"


@pytest.mark.parametrize("item", ORDERED, ids=_ids(ORDERED))
def test_order_partial_credit_counts_hits(item: dict) -> None:
    """`order_hits` считает частичное попадание — на нём держится подсказка
    «сколько шагов уже на месте». Полный порядок обязан давать полный счёт."""
    from app.course.check import order_hits
    right = list(item["answer"])
    assert order_hits(item, right) == len(right), item["id"]
    if len(right) >= 2:
        swapped = right[:]
        swapped[0], swapped[1] = swapped[1], swapped[0]
        assert order_hits(item, swapped) < len(right), f"{item['id']}: перестановка не замечена"


# ---- проходимость капстоунов ----------------------------------------------
#
# Выше проверено, что предикат опирается только на поля движка и что цена цели
# лежит внутри зоны сделки. Не проверено было главное: выполнимы ли условия
# ВМЕСТЕ. «Сделка ≤ 88 И два интереса И напряжение ≤ 45 за шесть ходов» — три
# требования разом, и правка баланса может сделать их несовместимыми, оставив
# курс с воротами, которые не открываются.
#
# Играем принципиальную линию — вопрос на интерес, SPIN, объективный критерий,
# размен, закрытие — и требуем, чтобы она проходила. Сценарий фиксирован
# намеренно: если завтра баланс разъедется с курсом, тест обязан упасть.

# Принципиальная партия берётся из общей фикстуры эталонных партий, а не пишется
# здесь заново: общего скрипта «на все столы» больше не существует. Интерес
# вскрывается только вопросом ПО ТЕМЕ, поэтому у каждого стола своя лексика — и
# ровно её проверяет test_reference_games.py. Одна фикстура на оба теста значит,
# что капстоун курса проходят теми же словами, что и эталонную игру.
#
# Оба языка обязательны. Английские реплики — не перевод русских: словарь тем у
# каждого языка свой, поэтому «работает на RU» ничего не говорит про EN, а
# капстоунов на английском ровно столько же (инвариант 4 + инвариант 9).
from tests.test_reference_games import PRINCIPLED as _PRINCIPLED_BY_SCENARIO  # noqa: E402

CAPSTONES = [x for x in BANK if x["type"] == "drill"] + list(MASTER)


@pytest.mark.parametrize("item", CAPSTONES, ids=[x["id"] for x in CAPSTONES])
@pytest.mark.parametrize("lang", LANGS)
def test_capstone_is_actually_winnable(item: dict, lang: str) -> None:
    """Условие прохода обязано выполняться принципиальной игрой целиком."""
    from app import engine, views
    from app.course.check import check_drill

    sess = engine.create_session(item["scenario_id"], lang)
    lines = _PRINCIPLED_BY_SCENARIO[item["scenario_id"]][lang]
    for line in lines[: item.get("max_turns", 8)]:
        sess.turn += 1
        if engine.apply_move(sess, engine.analyze(line), line).closed:
            break

    verdict = check_drill(item, views.state_view(sess).model_dump())
    assert verdict["ok"], (
        f"{item['id']}/{lang}: принципиальная игра не проходит капстоун — "
        f"не выполнено: {', '.join(verdict['failed'])}"
    )
