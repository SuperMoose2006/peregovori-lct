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
from app.course.master import MASTER, PASS_MARK
from app.course.simulate import answer_for, seeded
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


#: Уроки, где за `choice` СОЗНАТЕЛЬНО не идёт `freeform`. Каждый — с причиной:
#: либо второй такт уже стоит рядом в блоке на том же материале, либо
#: производить нечего — варианты не реплики игрока, а суждение о движке.
CHOICE_WITHOUT_A_SECOND_BEAT = {
    ("foundations", 1): "тот же вопрос производится в уроке 3 (fo-04) — тот же стол, "
                        "тот же приём, та же эталонная реплика; копия ничему не учит",
    ("objective-criteria", 1): "критерий производится в уроке 2 (oc-02) на том же столе "
                               "и с более строгим предикатом (require_number)",
    ("batna-zopa", 2): "варианты — арифметика красной линии, а не реплика за столом: "
                       "произносить нечего",
    ("logrolling", 2): "варианты — ценность фишек; НАЗВАННУЮ фишку игрок произносит "
                       "в lr-07 и lr-08 (require_secondary)",
    ("closing", 2): "варианты — предсказание, где закроется сделка; реплики в задании нет",
    ("styles", 1): "варианты — реплики ОППОНЕНТА: узнать стиль и есть навык урока",
}


def test_every_choice_lesson_has_a_freeform_second_beat() -> None:
    """Узнал приём — произведи его. Узнавание без производства не переносится.

    Половина банка — узнавание («выбери верный из четырёх»), и это самый дешёвый
    режим: узнать хороший вопрос среди четырёх и ЗАДАТЬ его живому человеку —
    разные умения, а тренажёр переговоров ценен вторым. Поэтому за `choice`
    обязан идти `freeform` НА ТОМ ЖЕ материале — в том же уроке.

    Не везде: там, где узнавание самоценно (опознать стиль собеседника) или где
    произносить нечего (варианты — суждение о движке), второй такт был бы парой
    ради симметрии. Такие уроки перечислены поимённо с причиной; новый `choice`
    без пары валит сборку, пока причина не названа.
    """
    lessons = {(x["block"], x["lesson"]) for x in BANK if x["type"] == "choice"}
    produced = {(x["block"], x["lesson"]) for x in BANK if x["type"] == "freeform"}
    orphan = sorted(lessons - produced - set(CHOICE_WITHOUT_A_SECOND_BEAT))
    assert not orphan, (
        "узнавание без производства — добавьте freeform в тот же урок или "
        f"назовите причину в CHOICE_WITHOUT_A_SECOND_BEAT: {orphan}")
    stale = sorted(k for k in CHOICE_WITHOUT_A_SECOND_BEAT if k not in lessons)
    assert not stale, f"исключение указывает на урок без choice: {stale}"


@pytest.mark.parametrize("item", FREEFORM, ids=_ids(FREEFORM))
def test_freeform_predicate_uses_more_than_one_guard(item: dict) -> None:
    """`require_moves` в одиночку зачтёт реплику с нужными словами и без содержания.

    Предикат ловит ФОРМУ хода — это признано вслух в docs/course.md. Ровно
    поэтому он обязан пользоваться всем, что у него есть: запретом на приёмы,
    которые ломают урок, порогом длины и хотя бы одной проверкой ВЕСА реплики
    (качество довода, число, названная вторичная фишка). «Насколько важно?» —
    формально ступень N, а в игре переспрос и +5 к Информации.
    """
    spec = item.get("check", {})
    assert spec.get("require_moves") or spec.get("require_any"), item["id"]
    assert spec.get("forbid_moves"), f"{item['id']}: нет запретов"
    assert spec.get("min_words", 0) >= 5, f"{item['id']}: нет порога длины"
    weight = ("min_arg", "require_number", "require_secondary")
    assert any(spec.get(k) for k in weight), (
        f"{item['id']}: предикат смотрит только на форму — добавьте одну из {weight}")


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


#: Имена собеседников со всех столов: стем русского имени + английское имя.
#: Собираются из `scenarios.py`, а не выписываются руками — переименуют
#: персонажа, тест продолжит ловить чужие упоминания.
def _counterpart_names() -> dict[str, tuple[str, str]]:
    from app.engine.scenarios import SCENARIOS
    out = {}
    for sc in SCENARIOS:
        ru = sc.counterpart.name["ru"].split(",")[0].strip()
        en = sc.counterpart.name["en"].split(",")[0].strip()
        out[sc.id] = (ru[:-1] if ru[-1] in "аяйь" else ru, en)
    return out


def _all_strings(node) -> list:
    out = []
    if isinstance(node, dict):
        for key, value in node.items():
            if key in ("ru", "en") and isinstance(value, str):
                out.append(value)
            else:
                out.extend(_all_strings(value))
    elif isinstance(node, list):
        for value in node:
            out.extend(_all_strings(value))
    return out


WITH_TABLE = [x for x in BANK + list(MASTER) if x.get("scenario_id")]


@pytest.mark.parametrize("item", WITH_TABLE, ids=[x["id"] for x in WITH_TABLE])
def test_exercise_never_names_a_counterpart_from_another_table(item: dict) -> None:
    """Упражнение не имеет права звать собеседника чужим именем.

    Именно так ломался `bz-07`: разбор задания про инвестора писал «Открылся
    Павел», хотя Павел — основатель со стола ставки фрилансера, а за столом
    сидит Марина. Ошибка невидима для всех остальных тестов: текст двуязычный,
    приёмы верные, число верное — а человек читает про персонажа, которого в
    этой партии нет. Сверять надо со сценарием, а не с памятью автора.
    """
    names = _counterpart_names()
    mine = item["scenario_id"]
    alien = []
    for text in _all_strings({k: v for k, v in item.items()
                              if k not in ("id", "type", "block", "scenario_id")}):
        for scenario_id, (ru_stem, en_name) in names.items():
            if scenario_id == mine:
                continue
            if re.search(ru_stem, text) or re.search(rf"\b{en_name}\b", text):
                alien.append(f"{names[scenario_id][1]} ({scenario_id})")
    assert not alien, (
        f"{item['id']}: стол {mine} ({names[mine][1]}), а текст зовёт "
        + ", ".join(sorted(set(alien))))


#: Уроки, которым МОЖНО называть чужих персонажей: они и существуют ради
#: сравнения столов между собой. Новый такой урок валит сборку, пока не назван.
LESSONS_THAT_LIST_EVERY_TABLE = {
    ("styles", 1): "урок перечисляет всех девятерых по стилям — в этом и смысл",
}


@pytest.mark.parametrize("block", BLOCKS, ids=[b.id for b in BLOCKS])
def test_lesson_never_names_a_counterpart_from_another_table(block) -> None:
    """То же для уроков: блок стоит на своём столе, значит и персонаж свой."""
    names = _counterpart_names()
    for lesson in block.lessons:
        if (block.id, lesson.idx) in LESSONS_THAT_LIST_EVERY_TABLE:
            continue
        for text in (lesson.body["ru"], lesson.body["en"]):
            for scenario_id, (ru_stem, en_name) in names.items():
                if scenario_id == block.scenario_id:
                    continue
                assert not re.search(ru_stem, text) and not re.search(
                    rf"\b{en_name}\b", text), (
                    f"{block.id}/{lesson.idx}: стол {block.scenario_id}, "
                    f"а урок зовёт {en_name} ({scenario_id})")


#: Приёмы-вопросы: за них движок платит Информацией — но ТОЛЬКО если вопрос
#: попал в тему ещё не вскрытого интереса. Иначе оппонент переспрашивает
#: (`probe_vague`), прибавка режется до 5, и «правильный ответ» упражнения в
#: игре не работает.
_QUESTION_MOVES = {"interests_probe", "spin_situation", "spin_problem",
                   "spin_implication", "spin_needpayoff"}

#: Пункты, где вопрос НАМЕРЕННО не вскрывает интерес — и разбор об этом прямо
#: говорит. Причина обязана быть названа: новый пункт с неработающим вопросом
#: валит сборку, пока автор не объяснит, зачем он такой.
PROBE_THAT_MUST_NOT_REVEAL = {
    "fo-08": "доверие 18 ниже порога вскрытия — на этом и построено задание",
    "al-01": "вопрос намеренно общий: разбор показывает +5 вместо +24",
}


def _own_line(item: dict, lang: str):
    """Реплика, которую упражнение вкладывает в рот игроку как ПРАВИЛЬНУЮ."""
    if item["type"] == "choice" and "options" in item:
        return item["options"][item["answer"]][lang]
    if item["type"] == "freeform":
        return item["reference"][lang]
    if "player_line" in item:
        return item["player_line"][lang]
    return None


@pytest.mark.parametrize("item", WITH_TABLE, ids=[x["id"] for x in WITH_TABLE])
@pytest.mark.parametrize("lang", LANGS)
def test_a_correct_question_actually_uncovers_an_interest(item: dict, lang: str) -> None:
    """Вопрос, названный верным, обязан работать в игре — на обоих языках.

    Так ломался `fo-01`: «что для вас важнее всего в жильце» — образцовый
    вопрос всего блока, разбор обещал Информацию +24, а движок отвечал
    переспросом и давал 5, потому что реплика не попала ни в одно ключевое
    слово интереса. Урок учил ходу, который в партии не работает, — это прямое
    нарушение инварианта 9. И RU с EN здесь расходятся сами по себе: словари
    тем у языков разные, поэтому «работает на русском» ничего не доказывает.
    """
    from app import engine as _engine

    line = _own_line(item, lang)
    if line is None:
        pytest.skip("у пункта нет собственной реплики игрока")
    analysis = analyze(line)
    if not (set(analysis.moves) & _QUESTION_MOVES):
        pytest.skip("реплика не является вопросом-приёмом")
    if item["id"] in PROBE_THAT_MUST_NOT_REVEAL:
        pytest.skip(PROBE_THAT_MUST_NOT_REVEAL[item["id"]])

    sess = seeded(item["scenario_id"], lang, item.get("state"), item.get("seed_turn", 0))
    _engine.apply_move(sess, analysis, line)
    assert sess.state.interests_found, (
        f"{item['id']}/{lang}: вопрос не вскрыл ни одного интереса — движок "
        "переспросит (probe_vague) и даст 5 вместо 24"
    )


def test_every_named_non_revealing_probe_still_exists() -> None:
    """Исключение, пережившее своё упражнение, — это разрешение на будущую ложь."""
    stale = [k for k in PROBE_THAT_MUST_NOT_REVEAL if k not in BY_ID]
    assert not stale, f"исключение осталось от удалённого упражнения: {stale}"
    stale_lessons = [k for k in LESSONS_THAT_LIST_EVERY_TABLE
                     if k[0] not in BLOCK_BY_ID
                     or k[1] > len(BLOCK_BY_ID[k[0]].lessons)]
    assert not stale_lessons, f"исключение указывает на несуществующий урок: {stale_lessons}"


@pytest.mark.parametrize("item", [x for x in BANK if x["type"] == "drill"],
                         ids=_ids([x for x in BANK if x["type"] == "drill"]))
def test_drill_predicate_uses_only_engine_fields(item: dict) -> None:
    """Ни один сигнал слоёв в предикат не входит — сравнимость грейдов."""
    allowed = {"status", "deal", "interests_found", "tension", "trust", "info",
               "leverage", "turn", "terms_conceded", "offer_opp", "offer_player"}
    for cond in item["pass"]:
        assert cond["field"] in allowed, item["id"]


# ---- экзамен мастера ------------------------------------------------------

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
    """Хотя бы один стол экзамена мастера обязан быть вне блоков.

    Всех трёх свободных столов в игре нет: блоки стоят на восьми сценариях из
    девяти. Докстринг `master.py` когда-то утверждал обратное — «три партии на
    неизученных столах» — и тут же перечислял `investor` и `used_car`, которые
    и есть столы блоков «BATNA и ZOPA» и «Якорь». Утверждение держалось ни на
    чём: тест проверял только непустоту. Он и сейчас проверяет её — но текст
    рядом больше не обещает большего, чем есть.
    """
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


#: Куда «строже» по каждому оператору. Для «≥» строже — БОЛЬШЕЕ значение, для
#: «≤» — меньшее; при равных значениях строгое неравенство строже нестрогого.
_DIRECTION = {"==": "eq", "!=": "eq", ">=": "up", ">": "up", "<=": "down", "<": "down"}
_SHARP = {">": 1, ">=": 0, "<": 1, "<=": 0, "==": 0, "!=": 0}


def _at_least_as_strict(mine: dict, theirs: dict) -> bool:
    """Требует ли условие `mine` не меньше, чем `theirs`, по той же шкале."""
    side = _DIRECTION[theirs["op"]]
    if _DIRECTION[mine["op"]] != side:
        return False
    if side == "eq":
        return mine["op"] == theirs["op"] and mine["value"] == theirs["value"]
    if mine["value"] != theirs["value"]:
        return (mine["value"] > theirs["value"] if side == "up"
                else mine["value"] < theirs["value"])
    return _SHARP[mine["op"]] >= _SHARP[theirs["op"]]


CAPSTONE_BY_TABLE: dict[str, list[dict]] = {}
for _drill in (x for x in BANK if x["type"] == "drill"):
    CAPSTONE_BY_TABLE.setdefault(_drill["scenario_id"], []).append(_drill)

#: Пары «партия экзамена — капстоун того же стола». `freelance_rate` сюда не
#: попадает: блока на этом столе нет, сравнивать не с чем.
MASTER_VS_CAPSTONE = [(m, c) for m in MASTER
                      for c in CAPSTONE_BY_TABLE.get(m["scenario_id"], [])]


def test_master_exam_and_capstones_share_at_least_one_table() -> None:
    """Иначе тест ниже «проходит» на пустом списке пар и не значит ничего."""
    assert MASTER_VS_CAPSTONE, (
        "экзамен мастера не пересекается с капстоунами по столам — "
        "сравнивать строгость нечем"
    )


@pytest.mark.parametrize(
    "master_item, capstone", MASTER_VS_CAPSTONE,
    ids=[f"{m['id']}-vs-{c['id']}" for m, c in MASTER_VS_CAPSTONE])
def test_master_exam_is_never_softer_than_its_block_capstone(
        master_item: dict, capstone: dict) -> None:
    """Ни одно условие экзамена мастера не мягче капстоуна того же стола.

    ЗАЧЕМ. Экзамен стоит ПОСЛЕ блока и без единой подсказки — значит он не может
    просить меньше, чем зачёт по блоку, который к нему ведёт. А просил: на
    `investor` доля ≤ 22% за десять ходов против ≤ 20% за семь у `bz-09`, на
    `used_car` ≤ 1100k за восемь против ≤ 1080k за шесть у `an-08`, и требования
    к напряжению у экзамена не было вовсе там, где капстоун его ставил. Финал
    курса выдавал сертификат мастера дешевле, чем блок — свой значок.

    Проверяются ОБЕ стороны условия: и лимит хода (шесть ходов строже восьми),
    и каждый предикат по своей шкале. Пропуск шкалы — тоже послабление, поэтому
    «у экзамена такого условия нет» здесь падает так же, как слабое число.
    """
    assert master_item["max_turns"] <= capstone["max_turns"], (
        f"{master_item['id']}: {master_item['max_turns']} ходов против "
        f"{capstone['max_turns']} у {capstone['id']} — экзамен просторнее блока"
    )
    for cond in capstone["pass"]:
        mine = [c for c in master_item["pass"] if c["field"] == cond["field"]]
        assert mine, (
            f"{master_item['id']}: нет условия по «{cond['field']}», а "
            f"{capstone['id']} его требует ({cond['op']} {cond['value']}) — "
            "пропущенная шкала это послабление"
        )
        assert any(_at_least_as_strict(c, cond) for c in mine), (
            f"{master_item['id']}: {[(c['op'], c['value']) for c in mine]} по "
            f"«{cond['field']}» мягче, чем {cond['op']} {cond['value']} "
            f"у {capstone['id']}"
        )


def test_strictness_comparison_actually_distinguishes() -> None:
    """Сам компаратор обязан отличать строгое от мягкого, иначе тест выше пуст."""
    assert _at_least_as_strict({"op": "<=", "value": 19}, {"op": "<=", "value": 20})
    assert not _at_least_as_strict({"op": "<=", "value": 22}, {"op": "<=", "value": 20})
    assert _at_least_as_strict({"op": "<", "value": 20}, {"op": "<=", "value": 20})
    assert not _at_least_as_strict({"op": "<=", "value": 20}, {"op": "<", "value": 20})
    assert _at_least_as_strict({"op": ">=", "value": 3}, {"op": ">=", "value": 2})
    assert not _at_least_as_strict({"op": ">=", "value": 1}, {"op": ">=", "value": 2})
    # Разные стороны шкалы несравнимы: «≥ 20» не строже «≤ 20».
    assert not _at_least_as_strict({"op": ">=", "value": 20}, {"op": "<=", "value": 20})
    assert _at_least_as_strict({"op": "==", "value": "agreement"},
                               {"op": "==", "value": "agreement"})
    assert not _at_least_as_strict({"op": "==", "value": "breakdown"},
                                   {"op": "==", "value": "agreement"})


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
