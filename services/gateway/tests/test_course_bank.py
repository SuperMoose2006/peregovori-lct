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


@pytest.mark.parametrize("item", CHOICE, ids=_ids(CHOICE))
@pytest.mark.parametrize("lang", LANGS)
def test_choice_distractors_do_not_give_the_expected_moves(item: dict, lang: str) -> None:
    """И НЕВЕРНЫЕ варианты обязаны этих приёмов НЕ давать.

    Проверка «верный вариант даёт приём» сама по себе ничего не доказывает: если
    его же даёт соседний вариант, у задания два правильных ответа, а движок
    засчитает игроку оба. Дефект тихий — разбор всё так же красиво объясняет,
    почему верен именно первый.
    """
    for i, option in enumerate(item["options"]):
        if i == item["answer"]:
            continue
        moves = analyze(option[lang]).moves
        leaked = [m for m in item["expect_moves"] if m in moves]
        assert not leaked, f"{item['id']}/{lang}: вариант {i} тоже даёт {leaked}"


#: `choice`, у которых expect_moves не может быть В ПРИНЦИПЕ, и почему.
#: Варианты в них — не реплики игрока, а суждения о движке, поэтому прогонять их
#: через `analyze()` бессмысленно: приёмы «правильного ответа» здесь не приёмы.
#: Список закрытый: новый `choice` без expect_moves валит сборку, пока автор не
#: объяснит его здесь — иначе правильность варианта не сверена ни с чем.
CHOICE_WITHOUT_MOVES = {
    "bz-03": "варианты — объяснения, почему красная линия строже альтернативы",
    "lr-01": "варианты — арифметика пакета (что менять первым), а не реплики",
    "cl-02": "варианты — ИСХОДЫ хода («сделка закроется на 84»), а не ходы",
}


def test_every_choice_is_engine_checked_or_explained() -> None:
    """У `choice` либо есть expect_moves, либо есть названная причина, почему нет."""
    naked = {x["id"] for x in BANK if x["type"] == "choice" and not x.get("expect_moves")}
    assert naked == set(CHOICE_WITHOUT_MOVES), (
        f"без expect_moves и без объяснения: {sorted(naked - set(CHOICE_WITHOUT_MOVES))}; "
        f"объяснены, но уже проверяются: {sorted(set(CHOICE_WITHOUT_MOVES) - naked)}")


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


# `fault_key` → чем эта ошибка ВИДНА движку. До этого ключ жил только в банке и
# в проверке выше: она сверяла строку со строкой, то есть доказывала лишь то,
# что автор дважды написал одно слово. Сама плохая реплика через `analyze()` не
# прогонялась ни разу — и «ошибка» могла оказаться безупречным ходом.
#
# (`fault_key` НЕ показывается в интерфейсе: презентер рисует только текст
# варианта. Он существует ради этой сверки — и ради неё обязан быть доказуем.)
def _no_method(a) -> bool:
    method = {"interests_probe", "objective_criteria", "acknowledge", "tradeoff",
              "spin_situation", "spin_problem", "spin_implication", "spin_needpayoff"}
    return "offer" in a.moves and not (method & set(a.moves))


FAULT_PROOF = {
    # Позиция без интереса: цифра есть, приёма нет ни одного.
    "position_no_interest": _no_method,
    # Заявление без критерия: то же, но обвинение конкретнее — нет `objective_criteria`.
    "claim_without_criteria": _no_method,
    # Сразу N, минуя S/P/I: движок видит верхнюю ступень первой же репликой.
    "spin_out_of_order": lambda a: "spin_needpayoff" in a.moves,
    # BATNA дубиной: альтернатива И угроза в одной реплике — рычаг ценой доверия.
    "batna_as_club": lambda a: "batna" in a.moves and "threat" in a.moves,
}

SPOT = [x for x in BANK if x["type"] == "spot_error"]


@pytest.mark.parametrize("item", SPOT, ids=_ids(SPOT))
@pytest.mark.parametrize("lang", LANGS)
def test_spot_error_bad_line_really_has_that_fault(item: dict, lang: str) -> None:
    """Плохая реплика обязана быть плохой ДЛЯ ДВИЖКА, а не только на словах."""
    key = item["fault_key"]
    if key == "repeat_same_line":
        pytest.skip("доказывается партией, а не разбором одной реплики — тест ниже")
    assert key in FAULT_PROOF, f"{item['id']}: у ошибки «{key}» нет доказательства"
    a = analyze(item["bad_line"][lang])
    assert FAULT_PROOF[key](a), f"{item['id']}/{lang}: {a.moves} — это не «{key}»"


@pytest.mark.parametrize("item", [x for x in SPOT if x["fault_key"] == "repeat_same_line"],
                         ids=_ids([x for x in SPOT if x["fault_key"] == "repeat_same_line"]))
@pytest.mark.parametrize("lang", LANGS)
def test_repeat_same_line_is_punished_by_the_engine(item: dict, lang: str) -> None:
    """«Дословный повтор» — единственная ошибка, которой нет в одной реплике.

    Она существует только во ВТОРОМ ходу, поэтому и доказывается партией:
    сама по себе реплика безупречна (критерий + цифра), а повторённая — стоит 12.
    """
    from app import engine

    line = item["bad_line"][lang]
    sess = engine.create_session(item["scenario_id"], lang)
    sess.turn += 1
    first = engine.apply_move(sess, engine.analyze(line), line)
    sess.turn += 1
    second = engine.apply_move(sess, engine.analyze(line), line)
    assert first.analysis.arg_quality > 12, f"{item['id']}/{lang}: реплика и так слабая"
    assert second.analysis.arg_quality <= 12, (
        f"{item['id']}/{lang}: повтор не наказан ({second.analysis.arg_quality})")


DRILL = [x for x in BANK if x["type"] == "drill"]


@pytest.mark.parametrize("item", DRILL, ids=_ids(DRILL))
def test_drill_predicate_uses_only_engine_fields(item: dict) -> None:
    """Ни один сигнал слоёв в предикат не входит — сравнимость грейдов."""
    allowed = {"status", "deal", "interests_found", "tension", "trust", "info",
               "leverage", "turn", "terms_conceded", "offer_opp", "offer_player"}
    for cond in item["pass"]:
        assert cond["field"] in allowed, item["id"]
        # `terms_conceded` — СПИСОК идентификаторов, а не счётчик: сравнение с
        # числом в зеркале на TS даёт NaN и молча заваливает капстоун. Поэтому
        # поле остаётся читаемым, но условием прохода быть не может.
        assert cond["field"] != "terms_conceded", (
            f"{item['id']}: terms_conceded — список, предикат его не сравнит")


@pytest.mark.parametrize("block", BLOCKS, ids=[b.id for b in BLOCKS])
def test_every_block_has_a_capstone_on_its_own_table(block) -> None:
    """Экзамен блока добавляет капстоун «если он есть» — значит он обязан быть.

    Без него экзамен блока это чистое узнавание, при том что docs/course.md §5
    обещает применение и весит капстоун вдвое. И стол обязан быть СВОИМ: разминка
    перед актом кампании подбирается по `block.scenario_id`.
    """
    mine = [x for x in BANK if x["block"] == block.id and x["type"] == "drill"]
    assert len(mine) == 1, f"{block.id}: капстоунов {len(mine)}, нужен ровно один"
    assert mine[0]["scenario_id"] == block.scenario_id, block.id
    assert 5 <= mine[0]["max_turns"] <= 7, mine[0]["id"]


@pytest.mark.parametrize("block", BLOCKS, ids=[b.id for b in BLOCKS])
def test_block_trains_on_its_own_table(block) -> None:
    """Хотя бы одно упражнение блока стоит на столе самого блока.

    Дефект, ради которого это написано: блок «BATNA и ZOPA» объявлен на столе
    `investor`, а все шесть его упражнений стояли на чужих столах. Кампания
    подбирает разминку перед актом по `block.scenario_id` — и перед «Фаундером и
    инвестором» человек получал разминку про поставщика.
    """
    mine = [x for x in BANK if x["block"] == block.id]
    on_table = [x for x in mine if x.get("scenario_id") == block.scenario_id]
    assert len(on_table) >= 2, f"{block.id}: на своём столе только {len(on_table)}"


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


@pytest.mark.parametrize("item", DRILL + list(MASTER),
                         ids=[x["id"] for x in DRILL + list(MASTER)])
def test_capstone_target_is_inside_the_deal_zone(item: dict) -> None:
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


# ---- лестница реакций: урок обязан учить ТОЙ ЖЕ шкале ---------------------
#
# ДЕФЕКТ, РАДИ КОТОРОГО ЭТО НАПИСАНО. Урок «Лестница реакций» перечислял десять
# состояний прозой, и русский список совпадал со шкалой, а английский — нет:
# переставлены `neutral`/`not_yet` и `collaborated`/`opened_up`. То есть
# английский урок учил порядку, по которому в игре не строятся ни соседи по
# шкале теплоты, ни дистракторы «прочитай лицо». Расхождение было невидимым:
# оба текста одинаково правдоподобны, и ни один тест их не читал.
#
# Порядок берём из ЕДИНСТВЕННОГО места, где он объявлен, — `lib/probe.ts`
# (по нему строятся варианты ответа), а состав сверяем с реакциями, которые
# реально присваивает `engine.apply_move`.

import re  # noqa: E402

from app.course.blocks import REACTION_LADDER, ladder_text  # noqa: E402

_ROOT = Path(__file__).resolve().parents[3]


def _scale_from_probe_ts() -> list[str]:
    src = (_ROOT / "frontend" / "src" / "lib" / "probe.ts").read_text(encoding="utf-8")
    body = re.search(r"REACTION_SCALE = \[(.*?)\]", src, re.S)
    assert body, "REACTION_SCALE не найдена в probe.ts"
    return re.findall(r'"([a-z_]+)"', body.group(1))


def _reactions_the_engine_assigns() -> set[str]:
    """Всё, что `apply_move` умеет положить в `reaction`.

    Читаем строки присваивания целиком, а не одну кавычку после знака равенства:
    `opened_up` выдаётся тернарником и мимо узкого шаблона проходит незамеченным.
    """
    src = (_ROOT / "services" / "gateway" / "app" / "engine" / "engine.py").read_text(encoding="utf-8")
    out: set[str] = {"neutral"}
    for line in src.splitlines():
        if re.match(r"\s*reaction = ", line):
            out.update(re.findall(r'"([a-z_]+)"', line))
    return out


def test_reaction_ladder_matches_the_engine_scale() -> None:
    """Состав лестницы — реакции движка, порядок — шкала, по которой играет игра."""
    keys = [key for key, _, _ in REACTION_LADDER]
    assert keys == _scale_from_probe_ts()
    assert set(keys) == _reactions_the_engine_assigns()


@pytest.mark.parametrize("lang", LANGS)
def test_reaction_lesson_lists_the_ladder_in_engine_order(lang: str) -> None:
    """И РУССКИЙ, и АНГЛИЙСКИЙ текст урока идёт ровно в порядке шкалы."""
    col = 1 if lang == "ru" else 2
    lesson = BLOCK_BY_ID["active-listening"].lessons[2]
    listing = lesson.body[lang].split("\n\n")[0]
    assert ladder_text(lang) in listing, f"{lang}: перечисление разошлось со шкалой"
    seen = [listing.index(row[col]) for row in REACTION_LADDER]
    assert seen == sorted(seen), f"{lang}: состояния перечислены не по шкале"


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


# ---- require_secondary: предикат, который до этого падал -------------------
#
# `require_secondary` — единственный предикат курса, который требует НАЗВАТЬ
# конкретную вторичную фишку, а не «что-нибудь разменять». Он был описан в
# docs/course.md, реализован на обеих сторонах — и не использовался ни одним
# упражнением, поэтому никто не замечал, что питоновская половина падала с
# AttributeError: в движок на место «судьи» уходил `set()`, а список
# `SecondaryIssue` индексировался как список индексов. Зеркало на TS при этом
# было верным — то есть браузер и сервер судили ОДНО И ТО ЖЕ по-разному.

SECONDARY = [x for x in BANK if (x.get("check") or {}).get("require_secondary")]


def test_require_secondary_is_actually_used() -> None:
    """Предикат без единого пользователя — мёртвый код, а не возможность."""
    assert len(SECONDARY) >= 2, "require_secondary снова никем не используется"


@pytest.mark.parametrize("item", SECONDARY, ids=_ids(SECONDARY))
@pytest.mark.parametrize("lang", LANGS)
def test_require_secondary_needs_the_named_term(item: dict, lang: str) -> None:
    """Названная фишка — зачёт; тот же размен без названия — отказ.

    Негатив важнее позитива: без него предикат мог бы всегда возвращать «ок» и
    тест остался бы зелёным (ровно так он и жил, пока не вызывался вовсе).
    """
    key = item["check"]["require_secondary"]
    ok = check_freeform(item, item["reference"][lang], lang)
    assert ok["ok"], f"{item['id']}/{lang}: {ok['reasons']}"

    vague = {"ru": "Если мы пойдём вам навстречу по условиям, сможете подвинуться по цене за штуку?",
             "en": "If we accommodate you on the terms, can you move down on the price per unit?"}[lang]
    bad = check_freeform(item, vague, lang)
    assert f"missing_term:{key}" in bad["reasons"], (
        f"{item['id']}/{lang}: безымянный размен зачтён как названный")


# ---- проходимость капстоунов ----------------------------------------------
#
# Выше проверено, что предикат опирается только на поля движка и что цена цели
# лежит внутри зоны сделки. Не проверено было главное: выполнимы ли условия
# ВМЕСТЕ. «Сделка ≤ 88 И два интереса И напряжение ≤ 45 за шесть ходов» — три
# требования разом, и правка баланса может сделать их несовместимыми, оставив
# курс с воротами, которые не открываются.
#
# Играем принципиальную линию — вопрос на интерес, SPIN, объективный критерий,
# размен НАЗВАННОЙ фишкой, закрытие с цифрой — и требуем, чтобы она проходила
# КАЖДЫЙ капстоун на ОБОИХ языках. Линия своя на каждый стол, потому что
# вторичные фишки у столов разные: общая формулировка «разменяем что-нибудь»
# ничего бы не доказала — движок её и не засчитает как размен.
#
# Реплики фиксированы намеренно: если завтра баланс разъедется с курсом, тест
# обязан упасть здесь, а не у человека, который третий раз не может сдать блок.

_PRINCIPLED: dict[str, dict[str, list[str]]] = {
    "rent": {
        "ru": [
            "Наталья, что для вас важнее всего в жильце и почему именно это?",
            "Я вас слышу. А чем это грозит, если квартира простоит без жильца ещё месяц?",
            "По рыночным данным медиана по таким квартирам ниже; давайте опираться на них.",
            "Если я подпишу договор надолго и внесу депозит за два месяца — сможете подвинуться?",
            "Договорились, фиксируем на 64?",
        ],
        "en": [
            "Natalia, what matters most to you in a tenant, and why exactly that?",
            "I hear you. What happens if the flat sits empty for another month?",
            "Comparable listings put the benchmark rent lower; let us rely on the data.",
            "If I sign a long lease and pay a two-month deposit, can you move down on rent?",
            "We have a deal at 64 then.",
        ],
    },
    "supplier": {
        "ru": [
            "Ирина, что для вас важнее всего в этом контракте и почему именно это?",
            "Я вас слышу. А чем это грозит, если загрузка производства просядет?",
            "По рыночным данным справедливый ориентир другой; давайте опираться на них.",
            "Если мы дадим годовой контракт и предоплату — сможете подвинуться по цене?",
            "Договорились, фиксируем на 86?",
        ],
        "en": [
            "Irina, what matters most to you in this contract, and why exactly that?",
            "I hear you. What does that cost you if the plant load drops?",
            "Comparable quotes put the fair benchmark lower; let us rely on the data.",
            "If we give you an annual volume commitment and pay upfront, can you move down on price?",
            "We have a deal at 86 then.",
        ],
    },
    "conflict": {
        "ru": [
            "Что для вас важнее всего в этой ситуации и почему именно это?",
            "Я вас слышу. А чем это грозит вашей команде, если так продолжится?",
            "По регламенту релизов есть объективный порядок; давайте опираться на него.",
            "Если мы вместе доложим статус руководству и я выделю человека — сможете подвинуться?",
            "Договорились, фиксируем сдвиг на 6 дней?",
        ],
        "en": [
            "What matters most to you here, and why exactly that?",
            "I hear you. What does that cost your team if this continues?",
            "The release procedure sets an objective order; let us rely on it.",
            "If we do a joint status to leadership and I share a resource, can you move down on the slip?",
            "We have a deal on a 6 day slip then.",
        ],
    },
    "salary": {
        "ru": [
            "Что для вас важнее всего в этой позиции и почему именно это?",
            "Я вас слышу. А чем это грозит, если позиция останется открытой ещё квартал?",
            "По обзору зарплат медиана по грейду выше; давайте опираться на данные.",
            "Если мы зафиксируем пересмотр по kpi и подписной бонус — сможете подвинуться?",
            "Договорились, фиксируем на 230?",
        ],
        "en": [
            "What matters most to you in this role, and why exactly that?",
            "I hear you. What does that cost you if the seat stays open another quarter?",
            "The salary research puts the median for this grade higher; let us rely on the data.",
            "If we lock a kpi review and a signing bonus, can you move to a higher base?",
            "We have a deal at 230 then.",
        ],
    },
    "investor": {
        "ru": [
            "Павел, что для вас важнее всего в этой сделке и почему именно это?",
            "Я вас слышу. А чем это грозит фонду, если фаундер потеряет мотивацию?",
            "По рыночным данным медиана раунда на этой стадии другая; давайте опираться на них.",
            "Если мы дадим место в совете директоров и деньги траншами по метрикам — сможете подвинуться?",
            "Договорились, фиксируем на 18%?",
        ],
        "en": [
            "Pavel, what matters most to you in this deal, and why exactly that?",
            "I hear you. What does that cost the fund if the founder loses motivation?",
            "Comparable rounds at this stage put the benchmark lower; let us rely on the data.",
            "If we give you a board seat and stage the money in tranches, can you move down on equity?",
            "We have a deal at 18% then.",
        ],
    },
    "used_car": {
        "ru": [
            "Что для вас важнее всего в этой продаже и почему именно это?",
            "Я вас слышу. А чем это грозит, если машина простоит ещё месяц?",
            "По рыночным данным медиана по этой модели ниже; давайте опираться на них.",
            "Если я оплачу наличными сразу и перерегистрацию беру на себя — сможете подвинуться?",
            "Договорились, фиксируем на 1060?",
        ],
        "en": [
            "What matters most to you in this sale, and why exactly that?",
            "I hear you. What does that cost you if the car sits another month?",
            "Comparable listings put the benchmark for this model lower; let us rely on the data.",
            "If I pay cash in full today and handle the paperwork, can you move down on the price?",
            "We have a deal at 1060 then.",
        ],
    },
    "sla_renewal": {
        "ru": [
            "Что для вас важнее всего в этом продлении и почему именно это?",
            "Я вас слышу. А чем это грозит вашей команде эксплуатации, если инциденты повторятся?",
            "По отраслевым стандартам аптайма ориентир другой; давайте опираться на них.",
            "Если мы продлим на три года и сделаем ступенчатый sla — сможете подвинуться?",
            "Договорились, фиксируем на 99.8?",
        ],
        "en": [
            "What matters most to you in this renewal, and why exactly that?",
            "I hear you. What does that cost your operations team if the incidents repeat?",
            "The industry standard for uptime sits higher; let us rely on the data.",
            "If we renew for three years with a phased sla, can you move to a higher uptime?",
            "We have a deal at 99.8 then.",
        ],
    },
    "freelance_rate": {
        "ru": [
            "Что для вас важнее всего в этом проекте и почему именно это?",
            "Я вас слышу. А чем это грозит, если не успеть к раунду инвестиций?",
            "По рыночным данным ставка сеньора выше; давайте опираться на них.",
            "Если я возьму фикс-прайс за этап и дам приоритетный доступ — сможете подвинуться?",
            "Договорились, фиксируем на 19?",
        ],
        "en": [
            "What matters most to you in this project, and why exactly that?",
            "I hear you. What does that cost you if we miss the funding round?",
            "Comparable senior rates put the benchmark higher; let us rely on the data.",
            "If I take a fixed price per phase and give you priority availability, can you move to a higher rate?",
            "We have a deal at 19 then.",
        ],
    },
}

CAPSTONES = DRILL + list(MASTER)


def test_every_table_has_a_principled_line() -> None:
    """Нет линии — нечем доказать проходимость: сценарий не должен ускользнуть."""
    need = {x["scenario_id"] for x in CAPSTONES}
    assert need <= set(_PRINCIPLED), sorted(need - set(_PRINCIPLED))


@pytest.mark.parametrize("item", CAPSTONES, ids=[x["id"] for x in CAPSTONES])
@pytest.mark.parametrize("lang", LANGS)
def test_capstone_is_actually_winnable(item: dict, lang: str) -> None:
    """Условие прохода обязано выполняться принципиальной игрой целиком."""
    from app import engine, views
    from app.course.check import check_drill

    sess = engine.create_session(item["scenario_id"], lang)
    for line in _PRINCIPLED[item["scenario_id"]][lang][: item.get("max_turns", 8)]:
        sess.turn += 1
        if engine.apply_move(sess, engine.analyze(line), line).closed:
            break

    verdict = check_drill(item, views.state_view(sess).model_dump())
    assert verdict["ok"], (
        f"{item['id']}/{lang}: принципиальная игра не проходит капстоун — "
        f"не выполнено: {', '.join(verdict['failed'])}"
    )


@pytest.mark.parametrize("item", CAPSTONES, ids=[x["id"] for x in CAPSTONES])
def test_capstone_is_not_free(item: dict) -> None:
    """И не проходится агрессией: иначе ворота открыты чем угодно."""
    from app import engine, views
    from app.course.check import check_drill

    sess = engine.create_session(item["scenario_id"], "ru")
    for _ in range(item.get("max_turns", 8)):
        sess.turn += 1
        line = "Это смешно, вы некомпетентны — либо ваша цена, либо мы уходим."
        if engine.apply_move(sess, engine.analyze(line), line).closed:
            break

    verdict = check_drill(item, views.state_view(sess).model_dump())
    assert not verdict["ok"], f"{item['id']}: капстоун сдаётся грубостью"
