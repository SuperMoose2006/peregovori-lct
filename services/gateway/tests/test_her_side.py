"""«С той стороны стола» — разбор глазами оппонента.

Колонка объясняет партию ХОД ЗА ХОДОМ: почему цена поехала назад, почему вопрос
не открыл интерес, почему один и тот же абзац перестал работать. Всё это движок
и так считал — просто до сих пор оставалось внутри `apply_move`.

Что здесь защищается:
  · это ЧИСТАЯ ФУНКЦИЯ ОТ СОСТОЯНИЯ — одна и та же партия даёт один и тот же
    текст (без этого разбор нечем проверить, и «А что если…» рядом врёт);
  · за столом говорит персона ЭТОГО стола и никакая другая;
  · ни один сигнал колонки не заходит в счёт (инвариант 6);
  · без ИИ она полна (инвариант 5) — тесты и так офлайн, `NEGO_AI=off`;
  · совет «одна реплика открыла бы это» действительно работает в движке
    (инвариант 9: правильный ответ обязан быть правильным).
"""

from __future__ import annotations

import re

import pytest

from app import engine, views
from app.engine import analyze
from app.engine.engine import reveal_trust_gate

CYRILLIC = re.compile(r"[а-яА-ЯёЁ]")

PRINCIPLED = [
    "Здравствуйте! Почему для вас так важна стабильная загрузка производства?",
    "Понимаю вас. А почему для вас важен денежный поток и предоплата?",
    "Зачем вам разовый заказ, если можно долгосрочный годовой контракт?",
    "По рыночным данным медиана независимых прайсов 86, потому что это отраслевой стандарт.",
    "Если мы дадим годовой контракт с гарантией объёма и предоплату, сможете подвинуться к 86?",
    "Фиксируем пакет: годовой контракт, предоплата — и цена 86. Договорились?",
]

RUDE = [
    "Что для вас важнее всего — и почему именно это?",
    "Либо вы двигаетесь, либо мы уходим — это ультиматум.",
    "Требую немедленно снизить, иначе разрываем.",
    "Это просто смешно и некомпетентно, вы обманываете.",
]


def play(scenario_id: str, lines: list[str], lang: str = "ru") -> engine.Session:
    sess = engine.create_session(scenario_id, lang)
    for text in lines:
        if sess.state.status != "active":
            break
        sess.turn += 1
        engine.apply_move(sess, analyze(text), text)
    return sess


def texts(col: dict) -> list[str]:
    """Весь пользовательский текст колонки. `ask` пуст, когда открывать нечего, —
    пустую строку в проверки не тащим."""
    return [t["said"] for t in col["turns"]] + [x for x in (col["missed"], col["ask"]) if x]


# --- форма и происхождение ---------------------------------------------------

def test_no_moves_no_column() -> None:
    """Партия без единого хода не рисует колонку вовсе. Пустая карточка — это
    ровно то четвёртое состояние («выглядит настоящим, а внутри пусто»),
    которого второй принцип не разрешает."""
    assert views.her_side(engine.create_session("supplier", "ru")) is None


def test_column_covers_every_turn_and_quotes_the_player() -> None:
    sess = play("supplier", PRINCIPLED)
    col = views.her_side(sess)
    assert [t["turn"] for t in col["turns"]] == [1, 2, 3, 4, 5, 6]
    for line, turn in zip(PRINCIPLED, col["turns"]):
        assert turn["quote"] == line[:140]
        assert turn["said"], "у хода обязана быть реплика оппонента"
        assert turn["tone"] in ("good", "bad", "flat")


def test_every_string_is_fully_substituted() -> None:
    """Незакрытый плейсхолдер («{topic}») — это дефект, который видно только
    глазами, поэтому его ищет тест, а не читатель разбора."""
    for lang in ("ru", "en"):
        for lines in (PRINCIPLED, RUDE):
            col = views.her_side(play("supplier", lines, lang))
            for s in texts(col):
                assert "{" not in s and "}" not in s, s


def test_column_is_a_pure_function_of_the_game() -> None:
    """Одинаковая партия — одинаковый текст. Иначе разбор не проверить ничем, а
    «А что если…» рядом сравнивал бы две случайности."""
    a = views.her_side(play("supplier", PRINCIPLED))
    b = views.her_side(play("supplier", PRINCIPLED))
    assert a == b
    # …и то же самое для партии, которая кончилась плохо.
    assert views.her_side(play("supplier", RUDE)) == views.her_side(play("supplier", RUDE))


# --- персона -----------------------------------------------------------------

@pytest.mark.parametrize("sc", engine.SCENARIOS, ids=lambda s: s.id)
def test_the_table_speaks_with_its_own_persona(sc) -> None:
    """За столом Марины не может заговорить Ирина. Имя берётся из сценария, а
    все прочие имена каталога в колонке запрещены — включая падежные формы,
    поэтому сверяем по основе."""
    for lang in ("ru", "en"):
        col = views.her_side(play(sc.id, PRINCIPLED, lang))
        mine = views._short_name(sc.counterpart.name[lang])
        assert col["name"] == mine
        blob = " ".join(texts(col))
        for other in engine.SCENARIOS:
            alien = views._short_name(other.counterpart.name[lang])
            if alien == mine:
                continue
            # По ОСНОВЕ и от границы слова: русское имя в колонке склоняется
            # («Ирине»), а внутри английского «hiring» сидит «irin» — и то и
            # другое проверка обязана различать.
            stem = re.escape(alien[:-1])
            assert not re.search(rf"\b{stem}", blob, re.I), f"{sc.id}: чужое имя {alien}"


def test_persona_style_changes_the_words() -> None:
    """Три стиля — три голоса. Одинаковый текст на всех столах означал бы, что
    персона нарисована, но не звучит."""
    said = {}
    for sid in ("supplier", "investor", "conflict"):  # relationship · analytical · tough
        said[sid] = views.her_side(play(sid, RUDE))["turns"][-1]["said"]
    assert len(set(said.values())) == 3, said


# --- то, что движок стал считать за сутки, и чего не было видно ---------------

def test_hostility_rollback_is_visible_and_costed() -> None:
    """Откат за хамство: реплика оппонента про возврат уступки И чип цены,
    ушедшей НАЗАД. До этой колонки движок делал откат молча."""
    sess = play("supplier", [
        "По рыночным данным медиана независимых прайсов 86, потому что это стандарт.",
        "Это просто смешно и некомпетентно, вы обманываете.",
    ])
    turn = views.her_side(sess)["turns"][1]
    assert turn["tone"] == "bad"
    price = [m for m in turn["meters"] if m.startswith("Цена")]
    assert price, turn["meters"]
    before, after = (float(x.replace(",", ".")) for x in price[0].split()[1::2])
    assert after > before, "цена обязана уйти назад, к стартовому якорю"


def test_second_ultimatum_reads_as_a_style_not_as_nerves() -> None:
    sess = play("supplier", [
        "По рыночным данным медиана прайсов 86, потому что это стандарт.",
        "Либо вы двигаетесь, либо мы уходим — это ультиматум.",
        "Требую немедленно снизить, иначе разрываем.",
    ])
    turns = views.her_side(sess)["turns"]
    assert turns[1]["said"] != turns[2]["said"], "второй ультиматум обязан звучать иначе"
    assert "Половину уступки" in turns[2]["said"]


def test_trust_gate_is_explained_not_hidden() -> None:
    """Вопрос по теме после хамства не вскрывает интерес — не потому, что был
    плох, а потому, что доверия не осталось. Раньше это выглядело как «вопрос не
    сработал» без единого объяснения."""
    sess = play("supplier", [
        "Это просто смешно и некомпетентно, вы обманываете.",
        "Почему для вас так важна стабильная загрузка производства?",
    ])
    assert sess.state.trust <= reveal_trust_gate(sess)
    turn = views.her_side(sess)["turns"][1]
    assert sess.ledger[1]["gated"] is True
    assert "доверия" in turn["said"] or "не разговаривали" in turn["said"], turn["said"]
    assert turn["tone"] == "bad"


def test_repeated_line_is_named_as_a_repeat() -> None:
    line = "По рыночным данным медиана независимых прайсов 86, потому что это отраслевой стандарт."
    turns = views.her_side(play("supplier", [line, line]))["turns"]
    assert turns[0]["said"] != turns[1]["said"]
    assert "уже говорили" in turns[1]["said"]


def test_hollow_criterion_reads_as_a_word_not_a_criterion() -> None:
    """Судья и словарь одинаково не считают событием голое слово «рынок». До
    колонки эта разница была видна только по неподвижной цене."""
    weak = views.her_side(play("supplier", ["Мы смотрим на рыночные данные."]))["turns"][0]
    strong = views.her_side(play("supplier", [
        "По рыночным данным медиана независимых прайсов 86, потому что это отраслевой стандарт."]))["turns"][0]
    assert "не критерий" in weak["said"]
    assert weak["said"] != strong["said"]


def test_judge_reveal_is_narrated_by_the_topic_it_targeted() -> None:
    """Живой судья вскрывает интерес ПО СМЫСЛУ. Колонка обязана назвать ту тему,
    в которую он попал, а не первую по списку."""
    sess = engine.create_session("supplier", "ru")
    line = "А что для вас тут важно, если честно?"
    sess.turn += 1
    engine.apply_move(sess, analyze(line), line, judge={"interest_targeted": 2})
    said = views.her_side(sess)["turns"][0]["said"]
    assert "Срок контракта" in said, said


# --- связь с занавесом -------------------------------------------------------

def test_missed_topics_are_linked_not_duplicated() -> None:
    """Занавес разбора уже перечисляет интересы дословно. Колонка называет ТЕМЫ,
    которые остались нетронутыми, — и объясняет, где игрок про них узнал."""
    col = views.her_side(play("supplier", RUDE))
    sc = engine.by_id("supplier")
    for topic in sc.interest_topics["ru"]:
        assert topic in col["missed"]
    for interest in sc.hidden_interests["ru"]:
        assert interest not in col["missed"], "текст интереса дублирует занавес"
    assert col["ask"]


def test_clean_sweep_has_nothing_left_to_ask() -> None:
    col = views.her_side(play("supplier", PRINCIPLED))
    assert col["ask"] == ""
    assert "не осталось" in col["missed"]


def test_the_suggested_line_actually_works_in_the_engine() -> None:
    """Инвариант 9 в его самой прямой форме: реплика, которую колонка называет
    ключом, обязана открыть ровно тот интерес, про который она это говорит."""
    for sc in engine.SCENARIOS:
        for lang in ("ru", "en"):
            col = views.her_side(play(sc.id, ["Здравствуйте."], lang))
            ask = col["ask"]
            assert ask, sc.id
            quote = ask.split("«")[-1].rstrip("»") if "«" in ask else ask.split('"')[-2]
            fresh = engine.create_session(sc.id, lang)
            fresh.turn += 1
            engine.apply_move(fresh, analyze(quote), quote)
            assert fresh.state.interests_found == [0], (
                f"{sc.id}/{lang}: совет «{quote}» не вскрывает первый интерес")


# --- границы -----------------------------------------------------------------

def test_bilingual_and_no_language_leaks() -> None:
    ru = views.her_side(play("supplier", PRINCIPLED, "ru"))
    en = views.her_side(play("supplier", PRINCIPLED, "en"))
    assert [t["said"] for t in ru["turns"]] != [t["said"] for t in en["turns"]]
    for s in texts(en):
        assert not CYRILLIC.search(s), f"русский текст в английской колонке: {s}"
    for s in texts(ru):
        assert CYRILLIC.search(s), f"английский текст в русской колонке: {s}"


def test_the_column_never_touches_the_score() -> None:
    """Инвариант 6. Колонка — послесловие: счёт обязан быть тем же, есть хроника
    или нет, и не должен меняться от того, что её прочитали."""
    for lines in (PRINCIPLED, RUDE):
        sess = play("supplier", lines)
        before = engine.score_session(sess)
        views.her_side(sess)
        assert engine.score_session(sess) == before
        sess.ledger = []
        assert engine.score_session(sess) == before


def test_debrief_view_carries_the_column() -> None:
    sess = play("supplier", PRINCIPLED)
    deb = views.debrief_view(sess)
    assert deb.her_side is not None
    assert deb.her_side.name == "Ирина"
    assert len(deb.her_side.turns) == len(PRINCIPLED)
    # …и не тащит её там, где ходов не было.
    assert views.debrief_view(engine.create_session("supplier", "ru")).her_side is None
