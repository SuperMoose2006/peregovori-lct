"""Банк упражнений сверяется с НАСТОЯЩИМ движком — на обоих языках.

Это главный тест курса. Он существует ради одного: «правильный ответ» в
упражнении обязан быть правильным и в игре. Любая правка баланса, словаря
приёмов или сценария, которая расходится с курсом, валит сборку — вместо того
чтобы тихо превратить урок в ложь.
"""

from __future__ import annotations

import re
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


_CYRILLIC = re.compile(r"[а-яА-ЯёЁ]")


@pytest.mark.parametrize("item", BANK, ids=_ids(BANK))
def test_english_half_never_leaks_cyrillic(item: dict) -> None:
    """Непереведённая строка выглядит как перевод — и видна только в EN-сессии.

    Билингвальность проверяется парой тестов, а не одним: `bilingual_everywhere`
    ловит пустую половину, этот — половину, которая осталась русской.
    """
    leaks: list[str] = []

    def walk(node) -> None:
        if isinstance(node, dict):
            en = node.get("en")
            if isinstance(en, str) and _CYRILLIC.search(en):
                leaks.append(en)
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(item)
    assert not leaks, f"{item['id']}: кириллица в английском — {leaks}"


@pytest.mark.parametrize("block", BLOCKS, ids=[b.id for b in BLOCKS])
def test_block_text_is_bilingual_and_english_is_english(block) -> None:
    """То же для уроков: текст блока живёт в Python и генерируется в браузер."""
    for field in (block.title, block.skill):
        assert field["ru"] and field["en"], block.id
        assert not _CYRILLIC.search(field["en"]), f"{block.id}: кириллица в английском"
    for lesson in block.lessons:
        for field in (lesson.title, lesson.body):
            assert field["ru"] and field["en"], f"{block.id}/{lesson.idx}"
            assert not _CYRILLIC.search(field["en"]), (
                f"{block.id}/{lesson.idx}: кириллица в английском")


@pytest.mark.parametrize("block", BLOCKS, ids=[b.id for b in BLOCKS])
def test_every_block_has_exercises(block) -> None:
    mine = [x for x in BANK if x["block"] == block.id]
    assert len(mine) >= 5, block.id
    assert len({x["type"] for x in mine}) >= 3, block.id


@pytest.mark.parametrize("block", BLOCKS, ids=[b.id for b in BLOCKS])
def test_every_block_has_a_capstone_on_its_own_table(block) -> None:
    """Экзамен блока добавляет капстоун «если он есть» и весит его вдвое.

    Значит блок без капстоуна проверяет ЧИСТОЕ УЗНАВАНИЕ — при том, что курс
    обещает применение. И стоять капстоун обязан на столе своего блока: партия
    на чужом столе проверяет что угодно, только не пройденный блок.
    """
    drills = [x for x in BANK if x["block"] == block.id and x["type"] == "drill"]
    assert drills, f"{block.id}: блок без капстоуна"
    for item in drills:
        assert item["scenario_id"] == block.scenario_id, (
            f"{item['id']}: капстоун на чужом столе ({item['scenario_id']} "
            f"вместо {block.scenario_id})")


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


@pytest.mark.parametrize("item", CHOICE, ids=_ids(CHOICE))
@pytest.mark.parametrize("lang", LANGS)
def test_choice_distractors_do_not_give_the_same_moves(item: dict, lang: str) -> None:
    """«Верный вариант даёт приём» ничего не доказывает, если его даёт и сосед.

    Тогда у задания два одинаково верных ответа, а зачёт держится на том, какой
    из них автор пометил ответом. Неверные варианты обязаны НЕ давать заявленный
    приём — на обоих языках, потому что словари RU и EN разные.
    """
    for i, option in enumerate(item["options"]):
        if i == item["answer"]:
            continue
        moves = analyze(option[lang]).moves
        clash = [m for m in item["expect_moves"] if m in moves]
        assert not clash, f"{item['id']}/{lang}: вариант {i} тоже даёт {clash}"


#: `choice` без `expect_moves` сверить с движком нельзя: его варианты — не
#: реплики игрока, а суждения о движке или чужие реплики. Такие пункты
#: перечислены поимённо с причиной; новый валит сборку, пока причина не названа.
CHOICE_WITHOUT_MOVES = {
    "bz-03": "варианты — рассуждение о том, почему красная линия строже альтернативы",
    "lr-01": "варианты — суждение о ценности фишек, а не реплики за столом",
    "cl-02": "варианты — предсказание, где закроется сделка",
    "st-01": "варианты — реплики ОППОНЕНТА: по ним опознают стиль, игрок их не произносит",
}


def test_every_choice_without_expect_moves_is_named() -> None:
    """Пункт, который нельзя сверить с движком, обязан быть исключением с причиной."""
    unnamed = [x["id"] for x in BANK
               if x["type"] == "choice" and not x.get("expect_moves")
               and x["id"] not in CHOICE_WITHOUT_MOVES]
    assert not unnamed, (
        "новый choice без expect_moves — назовите причину в CHOICE_WITHOUT_MOVES: "
        + str(unnamed))
    stale = [k for k in CHOICE_WITHOUT_MOVES if k not in BY_ID]
    assert not stale, f"исключение осталось от удалённого упражнения: {stale}"


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


#: Приёмы, за которые движок ПЛАТИТ. Плохая реплика не может нести ни одного —
#: иначе «ошибка» существует только в голове автора задания.
_PRODUCTIVE = {"acknowledge", "interests_probe", "objective_criteria", "tradeoff"}
#: Ошибки, которых нет в ОДНОЙ реплике: они доказываются партией, а не разбором.
_FAULT_NEEDS_A_GAME = {
    "repeat_same_line": "второй дословный повтор режет качество аргумента до 12 — "
                        "в одной реплике этого не видно",
}


@pytest.mark.parametrize("item", [x for x in BANK if x["type"] == "spot_error"],
                         ids=_ids([x for x in BANK if x["type"] == "spot_error"]))
@pytest.mark.parametrize("lang", LANGS)
def test_spot_error_bad_line_is_bad_for_the_engine(item: dict, lang: str) -> None:
    """Плохая реплика обязана быть плохой ДЛЯ ДВИЖКА, а не только на словах.

    Раньше ключ ошибки сверялся со строкой в вариантах — то есть доказывал лишь
    то, что автор дважды написал одно слово. Здесь реплика прогоняется через
    настоящий `analyze()`: она либо несёт разрушительный приём, либо не несёт ни
    одного продуктивного. Исключения — ошибки, которые видны только в партии.
    """
    if item["fault_key"] in _FAULT_NEEDS_A_GAME:
        pytest.skip(_FAULT_NEEDS_A_GAME[item["fault_key"]])
    moves = set(analyze(item["bad_line"][lang]).moves)
    damaging = moves & {"threat", "hostile"}
    good = moves & _PRODUCTIVE
    assert damaging or not good, (
        f"{item['id']}/{lang}: реплика несёт {sorted(good)} и ничего не ломает — "
        "для движка она не плохая")


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


def test_no_exercise_answer_is_a_reaction_the_layer_cannot_ask_about() -> None:
    """Ответом `reaction`/`face` может быть только состояние со шкалы теплоты.

    `probe_vague` («а что именно вас интересует?») — не состояние, а просьба
    уточнить: в REACTION_SCALE его нет, и `reactionOptions` на нём не соберёт
    дистракторов. Упражнение с таким ответом выглядело бы правильным в банке и
    падало бы в браузере — то есть ровно то расхождение курса с игрой, ради
    которого написан весь этот файл.

    Ответы reaction/meters вычисляются настоящим движком, поэтому запретить это
    заранее нельзя: движок может вернуть probe_vague на слишком общий вопрос.
    Значит проверять надо после — здесь.
    """
    from app.course.bank import BANK

    scale = {"walked_out", "offended", "hardened", "pressured", "not_yet",
             "neutral", "collaborated", "persuaded", "opened_up", "warmed"}
    off_scale = [x["id"] for x in BANK
                 if x["type"] in ("reaction", "face") and x.get("answer") not in scale]
    assert not off_scale, (
        "ответ вне шкалы теплоты — слой не сможет построить варианты: " + str(off_scale))
