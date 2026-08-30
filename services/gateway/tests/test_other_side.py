"""«Обратная сторона стола»: тот же движок, другая сторона записи.

ЧТО ЗДЕСЬ ДОКАЗЫВАЕТСЯ, И ПОЧЕМУ ЭТО ГЛАВНОЕ. Замысел режима — пересадить
игрока за вторую сторону того же стола. Первый вопрос был не «как это
нарисовать», а «сколько это стоит»: новый режим поверх той же машины или второй
движок рядом. Ответ — первое, и он проверяем: `apply_move` и `score_session`
читают из сценария РОВНО ТРИНАДЦАТЬ полей, и ни одно из них не знает, кем
работает игрок. Вся асимметрия «кто здесь игрок» лежит в ЗАПИСИ.

Отсюда три следствия, каждое своим тестом:

  1. Движок не меняется вовсе. Ни одной ветки «если зеркало», ни одного чтения
     `mirror_of` — иначе через год «зеркальная» ветка тихо разъедется с обычной,
     и грейды перестанут быть сравнимыми.
  2. Грейд зеркального стола СРАВНИМ с обычным по построению: его считает та же
     функция по той же формуле, с тем же потолком техники и без единого сигнала
     слоя (инвариант 6). Поэтому режим и даёт грейд, в отличие от «Чтения
     стола», которое партией не является.
  3. Инвариант 2 держится на новых записях так же, как на девяти старых:
     принципиальная игра → A/B (эталонные партии в `games.json::other_side`,
     их гоняет `test_reference_games.py`), агрессия → срыв и F — здесь.

И четвёртое, ради чего режим существует: карточка `views.other_side`. Она
обязана быть ПОЛНОЙ офлайн (инвариант 5) и не имеет права заявлять того, чего
не считала (принцип 2) — «человек напротив не увидел» здесь утверждение об
устройстве машины, а «на этом ходу вопрос сработал бы» — замер по хронике.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

from app import engine, views
from app.engine import analyze
from app.engine.scenarios import MIRRORS, SCENARIOS

ENGINE_SRC = Path(engine.engine.__file__)
LANGS = ("ru", "en")
MIRROR_IDS = [s.id for s in MIRRORS]


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


# ---- 1. Движок остался симметричным ----------------------------------------

def test_the_engine_never_reads_mirror_of() -> None:
    """Ни одной ветки «если это зеркало» — иначе режимов стало бы два движка.

    Проверяется разбором AST, а не гревом по слову: `mirror_of` могло бы
    просочиться в движок через `getattr(sc, "mirror_of")`, и строковый поиск
    поймал бы это, а вот `sc.mirror_of` внутри f-строки — уже нет.
    """
    tree = ast.parse(ENGINE_SRC.read_text(encoding="utf-8"))
    hits = [n for n in ast.walk(tree)
            if isinstance(n, ast.Attribute) and n.attr == "mirror_of"]
    hits += [n for n in ast.walk(tree)
             if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
             and n.func.id == "getattr"
             and any(isinstance(a, ast.Constant) and a.value == "mirror_of"
                     for a in n.args)]
    assert not hits, (
        "движок узнал про зеркальные столы — значит их поведение может "
        "разъехаться с обычными, и грейды перестанут быть сравнимыми")


def test_the_engine_reads_the_same_scenario_fields_for_every_table() -> None:
    """Список полей сценария, которые читает движок, — закрытый.

    Это и есть цена вопроса «новый режим или новая машина»: пока читаются
    только эти поля, смена стороны стола стоит одной ЗАПИСИ. Новое поле в этом
    списке — сигнал, что в движок заехало знание о том, кем работает игрок;
    оно может быть законным, но молча появиться не должно.
    """
    tree = ast.parse(ENGINE_SRC.read_text(encoding="utf-8"))
    read: set[str] = set()
    for node in ast.walk(tree):
        if (isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name)
                and node.value.id == "sc"):
            read.add(node.attr)
    assert read == {
        "opponent_open", "opponent_reservation", "player_target", "player_reservation",
        "player_batna", "hidden_interests", "hidden_interest_keywords", "interest_topics",
        "secondary_issues", "tradeoffs", "counterpart", "headline", "difficulty",
    }, sorted(read)


# ---- 2. Записи зеркал здоровы ------------------------------------------------

def test_a_mirror_is_not_in_the_library() -> None:
    """Десятый стол в `SCENARIOS` сдвинул бы «стол дня» всем.

    Девять столов и четыре условия взаимно просты — на этом стоит расписание
    (`daily.py`). Зеркала — режим, а не пополнение библиотеки.
    """
    library = {s.id for s in SCENARIOS}
    assert not (library & set(MIRROR_IDS))
    assert len(SCENARIOS) == 9, "изменилась длина библиотеки — проверьте daily.py"


@pytest.mark.parametrize("sc", MIRRORS, ids=MIRROR_IDS)
def test_a_mirror_points_at_a_real_table_and_borrows_its_numbers(sc) -> None:
    """Красные линии зеркала — НЕ выдумка: они взяты у оригинала.

    Дно игрока за зеркалом было дном оппонента за оригиналом, а дно нового
    оппонента — красной линией игрока. Совпадать они обязаны до числа, иначе
    «та же сделка с другой стороны» — просто новый стол с похожим названием.
    """
    origin = engine.by_id(sc.mirror_of)
    assert origin is not None and origin in SCENARIOS, sc.mirror_of
    assert sc.player_reservation == origin.opponent_reservation, (
        "дно игрока за зеркалом обязано быть дном персоны оригинала")
    assert sc.opponent_reservation == origin.player_reservation, (
        "дно оппонента за зеркалом обязано быть красной линией игрока оригинала")
    assert sc.headline.dir != origin.headline.dir, "направление шкалы не перевёрнуто"
    assert sc.headline.unit == origin.headline.unit, "торгуются за другое — это не тот же стол"


@pytest.mark.parametrize("sc", MIRRORS, ids=MIRROR_IDS)
def test_a_mirror_target_is_reachable(sc) -> None:
    """Цель зеркала стоит НЕ ЗА дном оппонента.

    Тогда `best_available` совпадает с целью, и экономика считается ровно так
    же, как на семи столах из девяти (`test_unreachable_target.py`). Стол, у
    которого цель недостижима, продукт умеет, но заводить такой НАРОЧНО в
    режиме, чья единственная задача — сравнимость, значит спорить с самим собой.
    """
    from app.engine.engine import best_available, target_reachable
    assert target_reachable(sc), sc.id
    assert best_available(sc) == float(sc.player_target)


@pytest.mark.parametrize("sc", MIRRORS, ids=MIRROR_IDS)
def test_a_mirror_has_a_zopa_and_the_opponent_opens_outside_it(sc) -> None:
    """ZOPA есть, и оппонент начинает ЗА красной линией игрока — как в оригинале."""
    if sc.headline.dir == "lower_is_better":
        assert sc.opponent_reservation < sc.player_reservation, "ZOPA пустая"
        assert sc.opponent_open > sc.player_reservation, "оппонент открылся внутри ZOPA"
    else:
        assert sc.opponent_reservation > sc.player_reservation, "ZOPA пустая"
        assert sc.opponent_open < sc.player_reservation, "оппонент открылся внутри ZOPA"


# ---- 3. Инвариант 1 и инвариант 2 на новых записях ---------------------------

@pytest.mark.parametrize("scenario_id", MIRROR_IDS)
@pytest.mark.parametrize("lang", LANGS)
def test_the_opponent_never_crosses_their_floor(scenario_id: str, lang: str) -> None:
    """Инвариант 1. Двадцать ходов подряд по всем поводам сразу."""
    sess = engine.create_session(scenario_id, lang)
    sc = engine.by_id(scenario_id)
    lines = {
        "ru": ["Почему для вас это важно и что для вас важнее всего?",
               "По рыночным данным медиана 1000000, потому что это стандарт.",
               "Если мы дадим всё, что вы просите, сможете подвинуться?"],
        "en": ["Why is that important to you and what matters to you most?",
               "Market data puts the median at 1000000, because that is the standard.",
               "If we give you everything you ask for, can you move to 1000000?"],
    }[lang]
    for i in range(20):
        text = lines[i % len(lines)] + f" ({i})"
        sess.turn += 1
        engine.apply_move(sess, analyze(text), text)
        if sess.lower_better:
            assert sess.state.offer_opp >= sc.opponent_reservation - 1e-9, sess.state.offer_opp
        else:
            assert sess.state.offer_opp <= sc.opponent_reservation + 1e-9, sess.state.offer_opp


#: Хамство и ультиматумы — единственный текст в этом файле, который НЕ зависит
#: от стола: оскорбление одинаково оскорбительно за любым из них. Поэтому
#: агрессивная партия здесь общая, а принципиальная — своя на каждый стол и
#: лежит в фикстуре (`games.json::other_side`), потому что вскрытие интереса
#: держится на словаре темы, а он у каждого стола свой.
AGGRESSIVE = {
    "ru": ["Ваша цена — просто грабёж, вы обманываете.",
           "Либо вы двигаетесь прямо сейчас, либо мы уходим — это ультиматум.",
           "Требую немедленно двигаться, иначе разрываем.",
           "Это просто смешно и некомпетентно.",
           "Вы врёте, и с вами противно разговаривать."],
    "en": ["Your price is daylight robbery, you are lying to me.",
           "Either you move right now or we walk — this is an ultimatum.",
           "I demand you move immediately, otherwise we terminate.",
           "This is ridiculous and incompetent.",
           "You are lying, and talking to you is disgusting."],
}


@pytest.mark.parametrize("scenario_id", MIRROR_IDS)
@pytest.mark.parametrize("lang", LANGS)
def test_aggression_breaks_the_table_and_earns_an_f(scenario_id: str, lang: str) -> None:
    """Инвариант 2, вторая половина. Проверялась на девяти столах — теперь на всех."""
    sess, debrief = play(scenario_id, AGGRESSIVE[lang], lang)
    assert sess.state.status == "breakdown", (scenario_id, lang, sess.state.status)
    assert debrief["grade"] == "F", (scenario_id, lang, debrief["grade"], debrief["overall"])


# ---- 4. Карточка режима ------------------------------------------------------

def test_an_ordinary_table_has_no_card() -> None:
    """Режима, которого не было, на экране не бывает (принцип 2)."""
    sess, _ = play("supplier", ["Почему для вас важна загрузка производства?"])
    assert views.other_side(sess) is None
    assert views.scenario_view(engine.by_id("supplier"), "ru").defending == []


def test_a_mirror_card_shows_exactly_the_interests_of_the_table_it_mirrors() -> None:
    """«Что вы защищали» ЦИТИРУЕТ оригинал, а не пишет свой текст рядом.

    Отдельный текст разъехался бы с оригиналом при первой правке, и карточка
    обещала бы игроку секреты, которых за тем столом нет.
    """
    for sc in MIRRORS:
        origin = engine.by_id(sc.mirror_of)
        for lang in LANGS:
            got = views.defended_interests(sc, lang)
            assert [d.text for d in got] == origin.hidden_interests[lang], sc.id
            assert [d.topic for d in got] == origin.interest_topics[lang], sc.id


@pytest.mark.parametrize("lang", LANGS)
def test_the_card_names_the_turn_a_question_would_have_worked(lang: str) -> None:
    """«Спросить надо было раньше» стоит чего-то, только если назван ХОД.

    Число берётся из хроники движка (`trust_before` / `trust_gate`), а не из
    совета наставника: доверие на первом ходу равно 40, порог зеркала
    поставщика — 32, значит вопрос по теме сработал бы прямо там.
    """
    line = {"ru": "Ваша цена — просто грабёж.", "en": "Your price is robbery."}[lang]
    sess, _ = play("supplier_mirror", [line], lang)
    card = views.other_side(sess)
    assert card is not None
    assert card["asked"] == 0 and card["total"] == 3
    assert len(card["windows"]) == 3, card["windows"]
    assert all(("Ход 1" if lang == "ru" else "Turn 1") in w for w in card["windows"]), card["windows"]
    assert len(card["defended"]) == 3
    assert card["seat"] == engine.by_id("supplier").counterpart.name[lang]


def test_the_card_says_nothing_before_the_first_move() -> None:
    """Пустая карточка — это четвёртое состояние «выглядит настоящим, а внутри
    пусто». Его не бывает."""
    sess = engine.create_session("supplier_mirror", "ru")
    assert views.other_side(sess) is None


def test_a_cold_table_says_the_question_would_not_have_worked_at_all() -> None:
    """Если доверие ни разу не встало выше порога — карточка обязана сказать
    именно это, а не назвать ход, на котором вопрос всё равно не сработал бы."""
    sess = engine.create_session("investor_mirror", "ru")
    sess.state.trust = 10
    for text in ["Ваша цена — просто грабёж.", "Вы обманываете, это некомпетентно."]:
        sess.turn += 1
        engine.apply_move(sess, analyze(text), text)
    card = views.other_side(sess)
    assert card is not None
    assert all("ни на одном ходу" in w for w in card["windows"]), card["windows"]


def test_the_card_never_reaches_the_score() -> None:
    """Инвариант 6 в лоб: карточка — послесловие, а не слагаемое.

    Партия играется дважды одними и теми же репликами; во второй раз карточка
    собирается ПЕРЕД подсчётом. Счёт обязан совпасть до поля.
    """
    lines = ["Почему для вас так важен бюджет закупки на этот год?",
             "По рыночным данным медиана независимых прайсов 90 рублей за штуку, "
             "потому что это отраслевой стандарт."]
    a, _ = play("supplier_mirror", lines)
    quiet = engine.score_session(a)
    b, _ = play("supplier_mirror", lines)
    views.other_side(b)
    views.defended_interests(engine.by_id("supplier_mirror"), "ru")
    assert engine.score_session(b) == quiet


# ---- 5. Через провод ---------------------------------------------------------
#
# Режим не заводит своего `gameMode`: партия за зеркальным столом идёт обычной
# практикой, потому что правила у неё те же. Значит проверять надо ровно одно —
# что публичный протокол ПРОПУСКАЕТ зеркальный стол и довозит обе половины
# карточки: собственную карту игрока в `session.created` (до первого хода — он
# и есть та сторона) и итог режима в разборе.

def test_the_wire_carries_a_mirror_table_end_to_end() -> None:
    from fastapi.testclient import TestClient
    from app.main import app

    with TestClient(app).websocket_connect("/v1/realtime") as ws:
        assert ws.receive_json()["type"] == "session.queue_done"
        ws.send_json({"type": "session.init", "payload": {
            "scenarioId": "supplier_mirror", "lang": "ru", "gameMode": "practice"}})
        created = ws.receive_json()
        assert created["type"] == "session.created", created
        scenario = created["scenario"]
        assert scenario["mirror_of"] == "supplier"
        # Карта игрока приходит ДО первого хода: это его собственные причины.
        assert [d["text"] for d in scenario["defending"]] == \
            engine.by_id("supplier").hidden_interests["ru"]

        # Реплики — из той же фикстуры, что судит движок и браузерное зеркало
        # (`games.json::other_side`): партия, которую проверяет провод, обязана
        # быть той же, а не похожей.
        import json
        fixture = (Path(__file__).resolve().parents[3]
                   / "frontend" / "test" / "fixtures" / "games.json")
        moves = json.loads(fixture.read_text(encoding="utf-8"))["other_side"]["supplier_mirror"]["ru"]
        debrief = None
        for move in moves:
            ws.send_json({"type": "input.append", "input": {"text": move}})
            ws.send_json({"type": "input.commit"})
            state = None
            for _ in range(60):
                event = ws.receive_json()
                if event["type"] == "engine.state":
                    state = event
                if event["type"] == "response.done":
                    break
            else:
                raise AssertionError("реплика оппонента так и не пришла")
            if state and state["state"]["status"] != "active":
                for _ in range(10):
                    event = ws.receive_json()
                    if event["type"] == "debrief":
                        debrief = event
                        break
                break
        assert debrief is not None, "партия закрылась без разбора"
        assert debrief["debrief"]["grade"] in ("A", "B"), debrief["debrief"]["grade"]
        card = debrief["debrief"]["other_side"]
        assert card["origin_id"] == "supplier"
        assert card["seat"] == engine.by_id("supplier").counterpart.name["ru"]
        assert len(card["defended"]) == 3
        assert card["asked"] == 3 and card["windows"] == []


def test_an_ordinary_table_carries_no_card_over_the_wire() -> None:
    from fastapi.testclient import TestClient
    from app.main import app

    with TestClient(app).websocket_connect("/v1/realtime") as ws:
        assert ws.receive_json()["type"] == "session.queue_done"
        ws.send_json({"type": "session.init", "payload": {
            "scenarioId": "supplier", "lang": "ru", "gameMode": "practice"}})
        created = ws.receive_json()
        assert created["scenario"]["mirror_of"] == ""
        assert created["scenario"]["defending"] == []
