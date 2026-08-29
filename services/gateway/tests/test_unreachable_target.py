"""Цель, до которой оппонент не может дойти, — и что за это ставят.

ЗАМЕР, ИЗ КОТОРОГО ВЫРОС ЭТОТ ФАЙЛ (`tools/scenario_audit.py`). У семи столов
из девяти дно оппонента стоит ЗА целью игрока — цель берётся торгом, и зазор
составляет 12.5–40% расстояния «старт → цель». У двух дно НЕ ДОХОДИТ до цели:
`conflict` (цель 5 дней при дне 6, зазор −6.7%) и `investor` (цель 15% при дне
18%, зазор −20%). Там `economic` упирался в 86 и 67 соответственно, грейд A на
`investor` требовал техники ≥ 95 при лучшей измеренной в банке 78 — и продукт об
этом молчал: ноль партий с грейдом A на 126 прогонах подмножеств.

Продукт уже держит это правило с другой стороны: генератор «своей сделки»
(`ai/scenario_gen.py::_normalize_zopa`) НАМЕРЕННО ставит дно за целью на 14.3%,
чтобы грейд своей сделки был сопоставим с грейдом тренировки. Сгенерированный
стол был честнее двух рукописных.

Починка — в мерке, а не в числах стола: `economic` считается от ЛУЧШЕГО
ДОСТУПНОГО (`engine.best_available`), то есть от цели там, где до неё можно
дойти, и от дна оппонента там, где нельзя. Здесь доказывается, что это правда
ничего не меняет на семи столах и что двум оставшимся продукт теперь ОБЪЯСНЯЕТ
свою мерку — в брифинге и в разборе.
"""
import pytest

from app.engine import engine
from app.engine.scenarios import SCENARIOS, by_id

#: Два стола, у которых цель стоит за дном оппонента. Список НАЗВАН, а не
#: вычислен: вычисленный список молча опустеет, если кто-то поправит числа, и
#: тест начнёт доказывать пустоту.
BEYOND_REACH = {"conflict", "investor"}


def _closed(scenario_id: str, deal: float, lang: str = "ru"):
    """Партия, доведённая до рукопожатия на заданной цифре, без ходов.

    Ходы здесь не нужны: проверяется мерка `economic`, а она чистая функция от
    цифры сделки и углов стола.
    """
    sess = engine.create_session(scenario_id, lang)
    sess.state.status = "agreement"
    sess.state.deal = deal
    return sess


def test_the_bank_splits_exactly_as_the_audit_measured():
    beyond = {sc.id for sc in SCENARIOS if not engine.target_reachable(sc)}
    assert beyond == BEYOND_REACH, (
        "состав столов с недостижимой целью изменился; это правка баланса — "
        "пересчитать эталонные партии и обновить брифинги")


@pytest.mark.parametrize("sc", [s for s in SCENARIOS if s.id not in BEYOND_REACH],
                         ids=lambda s: s.id)
def test_where_the_target_is_reachable_nothing_changed_at_all(sc):
    """Семь столов: мерка — по-прежнему ровно цель, число в число.

    Это и есть цена правки. Не «почти не изменилось», а тождество: функция
    возвращает `player_target`, значит формула `(deal − r) / (t − r)` та же
    самая, что была до правки, на любой цифре сделки.
    """
    assert engine.best_available(sc) == float(sc.player_target)
    lo, hi = sorted((sc.player_reservation, sc.opponent_reservation))
    for i in range(41):
        deal = lo + (hi - lo) * i / 40
        want = engine.clamp(engine._js_round(
            (deal - sc.player_reservation)
            / (sc.player_target - sc.player_reservation) * 100))
        got = engine.score_session(_closed(sc.id, deal))["economic"]
        assert got == int(want), f"{sc.id}: сделка {deal:g} → {got}, а было {want}"


@pytest.mark.parametrize("sid", sorted(BEYOND_REACH))
def test_where_the_target_is_out_of_reach_the_ruler_is_the_floor(sid):
    sc = by_id(sid)
    assert engine.best_available(sc) == float(sc.opponent_reservation)
    # Прежняя мерка давала за ту же сделку меньше 100 — и это был потолок стола,
    # а не оценка игрока.
    old = engine.clamp(engine._js_round(
        (sc.opponent_reservation - sc.player_reservation)
        / (sc.player_target - sc.player_reservation) * 100))
    assert old < 100, f"{sid}: стол попал в список по ошибке"


@pytest.mark.parametrize("sc", SCENARIOS, ids=lambda s: s.id)
def test_squeezing_everything_available_is_worth_a_hundred(sc):
    """Главный вывод правки: выжал всё, что лежало на столе, — получил 100.

    На девяти столах из девяти, а не на семи. Дно оппонента — предел по
    инварианту 1, дальше не бывает; значит экономика там обязана быть полной.
    """
    d = engine.score_session(_closed(sc.id, sc.opponent_reservation))
    assert d["economic"] == 100, f"{sc.id}: {d['economic']} за лучшую доступную сделку"


@pytest.mark.parametrize("sc", SCENARIOS, ids=lambda s: s.id)
@pytest.mark.parametrize("lang", ["ru", "en"])
def test_the_debrief_names_the_ruler_when_it_is_not_the_target(sc, lang):
    """Принцип 2: сменилась мерка — она названа, и названа ПЕРВОЙ строкой.

    `tips[0]` разбор показывает словом наставника. Игрок, увидевший 100 при
    цифре хуже собственной цели, обязан прочитать почему — иначе это ровно то
    «выглядит настоящим, а внутри пусто», которого в продукте не бывает.
    """
    tips = engine.score_session(_closed(sc.id, sc.opponent_reservation, lang))["tips"]
    marker = "недостижимой цели" if lang == "ru" else "unreachable target"
    if sc.id in BEYOND_REACH:
        assert marker in tips[0], f"{sc.id}/{lang}: разбор молчит о мерке"
        floor_text = engine.format_deal(sc.opponent_reservation, sc.headline.unit[lang], lang)
        assert floor_text in tips[0], f"{sc.id}/{lang}: не названо, докуда можно было дойти"
    else:
        assert all(marker not in t for t in tips), (
            f"{sc.id}/{lang}: сказано про недостижимую цель там, где она достижима")


@pytest.mark.parametrize("sc", SCENARIOS, ids=lambda s: s.id)
@pytest.mark.parametrize("lang", ["ru", "en"])
def test_every_briefing_names_the_target_and_the_red_line(sc, lang):
    """Бриф — единственное место, где игрок читает свою цель словами.

    Семь столов её называли, `conflict` и `investor` — нет, и именно там цель
    была недостижима: человек не мог даже заподозрить, что упирается в стол, а
    не в себя. Теперь называют все девять; расходиться с углами стола числа в
    брифе по-прежнему не имеют права.
    """
    import re
    text = sc.briefing[lang]
    nums = {float(m.group(0).replace(",", ".")) for m in re.finditer(r"-?\d+(?:[.,]\d+)?", text)}
    assert float(sc.player_target) in nums, f"{sc.id}/{lang}: бриф не называет цель"
    assert float(sc.player_reservation) in nums, f"{sc.id}/{lang}: бриф не называет красную линию"
    corners = {float(sc.player_target), float(sc.player_reservation),
               float(sc.opponent_open), float(sc.opponent_reservation)}
    assert nums <= corners, f"{sc.id}/{lang}: в брифе числа {sorted(nums - corners)} — не углы стола"


@pytest.mark.parametrize("sid", sorted(BEYOND_REACH))
@pytest.mark.parametrize("lang", ["ru", "en"])
def test_the_briefing_warns_that_the_target_may_be_out_of_reach(sid, lang):
    """Предупреждение есть только там, где оно правда.

    Обратная половина не менее важна: на семи столах цель достижима, и обещать
    там «возможно, не выйдет» значило бы заявлять то, чего нет.
    """
    warn = ("амбициозна", "ambitious")
    for sc in SCENARIOS:
        text = sc.briefing[lang]
        hit = any(w in text for w in warn)
        assert hit == (sc.id in BEYOND_REACH), f"{sc.id}/{lang}: предупреждение не по адресу"
    assert any(w in by_id(sid).briefing[lang] for w in warn)


def test_the_generator_of_custom_deals_keeps_targets_reachable():
    """Правило шире девяти столов: «своя сделка» обязана быть играбельной так же.

    `_normalize_zopa` ставит дно ЗА целью на 14.3% — то есть по мерке
    `best_available` своя сделка всегда меряется целью, и грейд остаётся
    сопоставимым с тренировкой. Проверяем не комментарий, а функцию.
    """
    from app.ai.scenario_gen import _normalize_zopa
    for dir_ in ("lower_is_better", "higher_is_better"):
        for raw in ([100, 84, 86, 92], [1, 2, 3, 4], [0, 0, 0, 0], [7, 7, 7, 9]):
            opp_open, opp_res, target, p_res = _normalize_zopa({
                "opponent_open": raw[0], "opponent_reservation": raw[1],
                "player_target": raw[2], "player_reservation": raw[3], "dir": dir_})
            reachable = (opp_res <= target if dir_ == "lower_is_better"
                         else opp_res >= target)
            assert reachable, f"{dir_}/{raw}: дно {opp_res} не доходит до цели {target}"
