"""engine.py — faithful Python port of legacy-node/engine/engine.js.

The deterministic negotiation engine. It owns game state, decides how the AI
counterpart reacts to each player move, moves the price/terms inside the ZOPA,
and produces a coaching debrief at the end.

The SAME concession can be earned the productive way (uncover interests, use
objective criteria, trade across issues, keep trust high) or the destructive
way (threats, hostility). The engine rewards the former with better economics
AND relationship, and punishes the latter with tension that freezes concessions.

Every numeric constant and formula is identical to the reference JS.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Optional

from .format import format_deal, format_number
from .scenarios import Scenario, by_id
from .techniques import Analysis, analyze, norm
# `_has` — то же сравнение «основа с начала слова», по которому работают все
# словари приёмов. Тема обязана засчитываться ровно так же, как ключевое
# слово, иначе на одном столе будут два разных правила совпадения.
from .techniques import _has


def _js_round(x: float) -> int:
    """Replicate JS Math.round (round half toward +infinity)."""
    return math.floor(x + 0.5)


def _round2(x: float) -> float:
    """Replicate JS  Math.round(x * 100) / 100."""
    return _js_round(x * 100) / 100


def _js_num(n: float) -> str:
    """Format a number the way JS String(number) would (no trailing .0)."""
    f = float(n)
    if f.is_integer():
        return str(int(f))
    return repr(f)


def clamp(v: float, lo: float = 0, hi: float = 100) -> float:
    return max(lo, min(hi, v))


# ---- State containers -------------------------------------------------------

@dataclass
class GameState:
    trust: float = 40
    tension: float = 25
    info: float = 0            # % of hidden interests uncovered
    leverage: float = 0        # grows as you cite criteria/BATNA well
    offer_opp: float = 0       # opponent's current number on the table
    offer_player: Optional[float] = None
    #: Рамка стола — якорь, к которому возвращает откат. Совпадает с
    #: `opponent_open`, пока ПЕРВОЕ число не назвал игрок: обоснованный первый
    #: якорь сдвигает не только текущую цифру, но и точку отсчёта, иначе
    #: хамством на третьем ходу рамку можно было бы отыграть назад целиком —
    #: и «кто первый назвал, тот задал систему координат» перестало бы быть
    #: правдой ровно там, где курс это обещает.
    frame_open: float = 0
    interests_found: list[int] = field(default_factory=list)
    tradeoffs_used: list[int] = field(default_factory=list)
    terms_conceded: list[str] = field(default_factory=list)  # ids of secondary issues traded
    deal: Optional[float] = None
    status: str = "active"     # active | agreement | breakdown


@dataclass
class Metrics:
    move_counts: dict[str, int] = field(default_factory=dict)
    arg_quality_sum: float = 0
    arg_quality_n: int = 0
    threats: int = 0
    hostiles: int = 0
    empathy: int = 0
    objective_criteria: int = 0
    spin_stages: set = field(default_factory=set)
    interest_probes: int = 0
    #: Сумма сходства ходов с уже сказанным (0..1 за ход) и число ходов —
    #: доля партии, потраченная на повторы. Техника считает её в минус.
    repeat_sum: float = 0
    repeat_n: int = 0
    #: Игрок назвал обоснованную цифру ПЕРВЫМ — до того, как оппонент положил
    #: свою на стол. Приём «якорение» до сих пор не стоил в счёте ничего: чип
    #: под композером зажигался, а техника его не замечала.
    opening_anchor: bool = False


@dataclass
class Session:
    id: str
    scenario_id: str
    lang: str
    lower_better: bool
    created_turn: int
    max_turns: int
    turn: int
    state: GameState
    metrics: Metrics
    #: Сложность стола (1..5) — та самая, что рисуется точками на карточке
    #: выбора. Живёт на СЕССИИ, а не читается из сценария на каждом ходу:
    #: партия может быть заведена с подменённой сложностью (тесты, будущие
    #: режимы), и тогда всё поведение обязано пересчитаться из одного места.
    difficulty: int = 3
    log: list = field(default_factory=list)
    last_player_norm: str = ""  # anti-gaming: detect repeated identical lines
    # Анти-гейминг с памятью на ВСЮ партию: (множество слов, множество приёмов)
    # каждого хода игрока. Памяти на одну прошлую реплику не хватало —
    # чередование A,B,A,B обходило проверку целиком, потому что «предыдущая»
    # всегда была другой. См. _repeat_strength.
    move_history: list = field(default_factory=list)
    #: Хроника хода ГЛАЗАМИ ОППОНЕНТА: по записи на каждый `apply_move` с тем,
    #: что движок уже посчитал (реакция, дельты, события, откат, вскрытый
    #: интерес, закрытый порогом доверия вопрос). НОВЫХ СИГНАЛОВ ЗДЕСЬ НЕТ —
    #: только те, что уже поучаствовали в ходе; в `score_session` ничего из
    #: этого не заходит и зайти не может (инвариант 6). Нужна затем, что
    #: `MoveResult` живёт один ход, а разбор объясняет партию целиком, и
    #: `sess.log` до неё не дотягивается: оркестратор кладёт туда текст и
    #: дельты, а «почему цена поехала назад» знает только `apply_move`.
    #: Прозу по этой хронике собирает views.her_side — здесь голые факты.
    ledger: list = field(default_factory=list)


@dataclass
class MoveResult:
    reaction: str
    deltas: dict[str, float]
    closed: bool
    concession_fraction: float
    analysis: Analysis


def create_session(scenario_id: str, lang: str = "ru") -> Session:
    sc = by_id(scenario_id)
    if not sc:
        raise ValueError("unknown scenario")
    lower_better = sc.headline.dir == "lower_is_better"

    return Session(
        id="sess_" + "".join(random.choice("0123456789abcdefghijklmnopqrstuvwxyz") for _ in range(8)),
        scenario_id=scenario_id,
        lang=lang,
        lower_better=lower_better,
        created_turn=0,
        max_turns=12,
        turn=0,
        difficulty=sc.difficulty,
        state=GameState(
            trust=40,
            tension=25,
            info=0,
            leverage=sc.player_batna.strength * 0.4,
            offer_opp=sc.opponent_open,
            offer_player=None,
            frame_open=sc.opponent_open,
            interests_found=[],
            tradeoffs_used=[],
            deal=None,
            status="active",
        ),
        metrics=Metrics(),
        log=[],
    )


#: Середина шкалы сложности (2..5 у готовых столов; своя сделка может
#: прислать 1). Множитель сопротивления считается ОТ НЕЁ, а не от самого лёгкого
#: стола: иначе «привязать сложность» означало бы «сделать всем хуже, кроме
#: двойки», и баланс всех столов, кроме самого лёгкого, поехал бы вниз разом.
DIFFICULTY_MID = 3.5
#: Шаг сопротивления на единицу сложности. Числу цена известна: при 0.06 путь от
#: 2 к 5 меняет заработанную уступку на ±9 % от середины, и этого хватает, чтобы
#: разница читалась в цифре на столе, но не хватает, чтобы принципиальная партия
#: у инвестора (74 из 100, запас до B — четыре балла) свалилась в C. Инвариант 2
#: тут ограничивает сверху, а требование различимости — снизу.
DIFFICULTY_CONCESSION_K = 0.06
#: Прибавка к порогу доверия за единицу сложности сверх двойки. Базовые 30
#: остаются у самого лёгкого стола; у инвестора порог 36. Стартовое доверие 40,
#: поэтому первый вопрос вскрывает интерес на ЛЮБОМ столе (инвариант 9: капстоун
#: обязан проходиться), а вот вернуться к расспросам после хамства на трудном
#: столе уже не выйдет — доверие туда не дотянется.
DIFFICULTY_TRUST_GATE_STEP = 2.0
#: Порог доверия для вскрытия интереса у самого лёгкого стола.
REVEAL_TRUST_GATE_BASE = 30.0


def _difficulty(sess: Session) -> float:
    """Сложность сессии, зажатая в шкалу карточки (1..5)."""
    return max(1.0, min(5.0, float(sess.difficulty)))


def resistance(sess: Session) -> float:
    """Во сколько раз сложность стола меняет ЗАРАБОТАННУЮ уступку.

    Множитель, а не прибавка: инвариант 1 (оппонент не переходит свой floor)
    держится тем, что уступка — это доля оставшегося пути до дна. Умножить долю
    можно, прибавить к цене нельзя.

    Трудный собеседник не отказывается двигаться — он двигается скупее на то же
    самое заработанное событие. Лёгкий, наоборот, щедрее: точки на карточке
    обязаны означать что-то в обе стороны, иначе «сложность» это просто налог.
    """
    return 1.0 + DIFFICULTY_CONCESSION_K * (DIFFICULTY_MID - _difficulty(sess))


def reveal_trust_gate(sess: Session) -> float:
    """Порог доверия, ниже которого интерес не вскрывается.

    Был жёсткий `trust > 30` для всех столов. У человека, который держит
    вас за угрозу своему бизнесу, открыться должно быть труднее, чем у сговорчивого
    поставщика, — и это ровно та разница, которую карточка обещала точками.
    """
    return REVEAL_TRUST_GATE_BASE + DIFFICULTY_TRUST_GATE_STEP * (_difficulty(sess) - 2.0)


def flexibility(sess: Session) -> float:
    """How willing the opponent is, right now, to move toward the player (0..1)."""
    s = sess.state
    trust_part = s.trust / 100
    info_part = s.info / 100
    leverage_part = clamp(s.leverage) / 100
    tension_penalty = s.tension / 100
    raw = 0.45 * trust_part + 0.3 * info_part + 0.25 * leverage_part - 0.5 * tension_penalty
    return clamp(raw, 0, 1)


#: Из каких шагов выбирается шаг цены. Список «человеческих» чисел: живые люди
#: двигаются на 5, на 0.5, на 1 — но не на 1.37.
_NICE_STEPS = (0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0, 25.0, 50.0)


def price_step(sc: Scenario) -> float:
    """Шаг, которым двигается цена на этом столе.

    ЗАЧЕМ. Уступка считалась долей оставшегося пути и округлялась до сотых, из-за
    чего оппонент называл «96,11» и произносил это вслух: «при цене в девяносто
    шесть рублей одиннадцать копеек за штуку». Копейки в первой же реплике ломают
    достоверность сильнее, чем любая ошибка модели, — живые люди двигаются на 96,
    на 95,50, на 95.

    ВЫВОДИТСЯ ИЗ РАЗМАХА, А НЕ ВПИСЫВАЕТСЯ ЧИСЛОМ: на девяти столах шкалы
    отличаются в двести раз (0.9 процентного пункта аптайма против 160 тысяч за
    машину), а «своя сделка» генерируется на ходу — руками для неё шаг не
    пропишешь. Шестнадцатая часть размаха даёт примерно дюжину заметных шагов на
    партию, что и есть торг.
    """
    span = abs(sc.opponent_open - sc.opponent_reservation)
    if span <= 0:
        return 0.01
    target = span / 16
    return min(_NICE_STEPS, key=lambda x: abs(x - target))


def _to_step(value: float, step: float, floor: float, toward_floor: bool) -> float:
    """Округлить цену к шагу — В СТОРОНУ ОППОНЕНТА, а не к ближайшему.

    Направление важнее аккуратности: округление к ближайшему может перебросить
    цену ЗА дно, а инвариант 1 говорит, что оппонент не переходит свой пол
    никогда. Округляя в его сторону, мы делаем инвариант строже, а не слабее.
    """
    if step <= 0:
        return _round2(value)
    units = value / step
    rounded = (math.floor(units) if toward_floor == (floor > value) else math.ceil(units)) * step
    return _round2(rounded)


def _concede(sess: Session, fraction: float) -> None:
    """Move opponent's number a fraction of the remaining distance to their floor."""
    sc = by_id(sess.scenario_id)
    s = sess.state
    floor = sc.opponent_reservation
    dist = floor - s.offer_opp  # signed; toward player
    moved = s.offer_opp + dist * fraction
    step = price_step(sc)
    # Округляем ПРОТИВ движения: оппонент уступает ровно на «человеческий» шаг
    # и ни копейкой больше. Дно от этого только дальше.
    units = moved / step
    snapped = (math.ceil(units) if floor < s.offer_opp else math.floor(units)) * step
    # Шаг не должен съесть уступку целиком: если после округления цена не
    # сдвинулась, а движение было — двигаем ровно на один шаг.
    if abs(snapped - s.offer_opp) < step / 2 and abs(dist * fraction) > step / 2:
        snapped = s.offer_opp + (-step if floor < s.offer_opp else step)
    s.offer_opp = _round2(snapped)


def _retract(sess: Session, fraction: float) -> None:
    """Обратный ход: оппонент снимает часть уже данной уступки.

    Цена уходит НАЗАД, к его стартовому якорю, на долю пройденного пути. Этого у
    движка не было вовсе: нагрубить стоило только шкал, а цифра на столе всё
    равно продолжала ползти к игроку. Наказание, которого не видно в цифре, —
    не наказание. Рамка ограничивает откат сама собой: дальше неё не уедет — а
    рамку мог сдвинуть первый якорь игрока (см. `_anchor_frame`), поэтому здесь
    стоит `frame_open`, а не `opponent_open`: иначе одна грубость возвращала бы
    стол к цифре, которую оппонент так и не произнёс.
    """
    s = sess.state
    dist = s.frame_open - s.offer_opp  # знаковое; ПРОЧЬ от игрока
    s.offer_opp = _round2(s.offer_opp + dist * fraction)


#: Доля расстояния до якоря игрока, на которую сдвигается рамка стола. Якорь
#: ТЯНЕТ рамку, а не назначает её: 0.25 — это «первый номер слышен», а не
#: «первый номер выигрывает».
FIRST_WORD_PULL = 0.25
#: Потолок сдвига — доля размаха «открытие ↔ дно». Без него экстремальный якорь
#: («по рынку это 700») тянул бы сильнее обоснованного (1080) ровно потому, что
#: наглее, и урок «цифра стоит на критерии» превращался бы в «называй меньше».
#: С потолком 0.20 оба сдвигают рамку на один и тот же максимум.
FIRST_WORD_CAP = 0.20
#: Порог качества довода, на котором критерий засчитывается СОБЫТИЕМ. Голое
#: слово «рынок» без цифры и без «потому что» ниже него и цену не двигает.
CRITERIA_EVENT_MIN = 35


def _anchor_frame(sess: Session, anchor: float) -> bool:
    """Первое названное число задаёт рамку: позиция оппонента едет к игроку.

    Курс учит этому прямым текстом (блок «Якорь», урок 2: «кто называет цифру
    первым, тот делает свою систему координат общей»), а за столом приём был
    неисполним — приветствие оппонента само открывало торг его ценой, и игроку
    оставалось только защищаться. Теперь оппонент здоровается без цифры, а
    первое слово чего-то стоит.

    Три ограничения, и каждое закрывает свой способ превратить урок в эксплойт:
    сдвиг идёт ТОЛЬКО в сторону игрока (якорь против себя не наказывает второй
    раз), он ограничен долей размаха (наглость не выигрывает у обоснованности),
    и он никогда не переходит дно оппонента — инвариант 1 старше любой рамки.

    Возвращает True, если рамка действительно сдвинулась: приём засчитывается
    по факту сдвига, а не по факту произнесения.
    """
    sc = by_id(sess.scenario_id)
    s = sess.state
    floor = sc.opponent_reservation
    span = abs(sc.opponent_open - floor)
    gap = anchor - s.offer_opp  # знаковое: + или − в сторону игрока
    toward_player = (gap < 0) if sess.lower_better else (gap > 0)
    if span <= 0 or not toward_player:
        return False
    shift = min(abs(gap) * FIRST_WORD_PULL, span * FIRST_WORD_CAP)
    moved = s.offer_opp + math.copysign(shift, gap)
    # Округляем ПРОТИВ движения, как и уступку: оппонент двигается на
    # «человеческий» шаг и ни копейкой больше, а дно от этого только дальше.
    step = price_step(sc)
    units = moved / step
    snapped = (math.ceil(units) if floor < s.offer_opp else math.floor(units)) * step
    snapped = max(snapped, floor) if floor < s.offer_opp else min(snapped, floor)
    if abs(snapped - s.offer_opp) < 1e-9:
        return False
    s.offer_opp = _round2(snapped)
    s.frame_open = s.offer_opp
    return True


def _tokens(cur_norm: str) -> frozenset:
    """Слова реплики без краевой пунктуации — основа лексической близости.

    Зеркало `tokensOf` в mock/engine.ts; расходиться им нельзя (инвариант 8)."""
    out = set()
    for w in cur_norm.split(" "):
        w = w.strip(".,?!-")
        if w:
            out.add(w)
    return frozenset(out)


#: Порог «это та же реплика»: жёсткий штраф (как за дословный повтор).
REPEAT_HARD = 0.85
#: Порог «это перепев»: мягкий штраф, растущий со сходством.
REPEAT_SOFT = 0.5


def _repeat_strength(sess: Session, tokens: frozenset, moves: frozenset) -> float:
    """Насколько сильно ход повторяет ЛЮБОЙ прошлый ход этой партии (0..1).

    Прежняя проверка помнила ровно одну прошлую реплику и сравнивала на точное
    равенство, поэтому чередование двух сильных строк A,B,A,B проходило её
    насквозь. Здесь память на всю партию, а мера — Жаккар по словам, поднятый
    на 0.15, если совпало ещё и множество приёмов: один и тот же приём теми же
    словами — это повтор, даже если переставлена цифра.
    """
    best = 0.0
    for prev_tokens, prev_moves in sess.move_history:
        union = tokens | prev_tokens
        if not union:
            continue
        j = len(tokens & prev_tokens) / len(union)
        if moves and moves == prev_moves:
            j = min(1.0, j + 0.15)
        if j > best:
            best = j
    return best


def _plausible_offer(sc: Scenario, number: float) -> Optional[float]:
    """Цена это или просто число? Возвращает цену в единицах сценария либо None.

    «Мне 30 лет» и «Ага 1.» не должны становиться офертой на 30 и на 1 — а
    становились: любая цифра при подходящем намерении шла в `offer_player`.
    Коридор — [0.5×, 2×] от масштаба сценария: за его пределами число к торгу
    отношения не имеет. Ветка ×1000 оставлена ТОЛЬКО для единиц самого
    сценария (сказали «1040», когда сценарий считает в тысячах), и только если
    после умножения число попадает в тот же коридор.
    """
    corners = (sc.opponent_open, sc.opponent_reservation,
               sc.player_target, sc.player_reservation)
    scale = sum(corners) / 4
    if scale <= 0:
        return number
    # СОБСТВЕННЫЕ ЧИСЛА СТОЛА ВСЕГДА ПРАВДОПОДОБНЫ. Коридор [0.5×, 2×] от
    # средней держится на допущении, что четыре угла лежат кучно, — а на
    # «Конфликте отделов» они не лежат: 20/6/5/12 дают среднюю 10.75 и нижнюю
    # границу 5.38, то есть ЦЕЛЬ ИГРОКА ИЗ БРИФА (5) переставала быть офертой.
    # Человек называл число, которое ему велели назвать, и не получал за него
    # ничего: «Договорились на 5» уходило в «пока не соглашается».
    lo = min(0.5 * scale, min(corners))
    hi = max(2.0 * scale, max(corners))
    if lo <= number <= hi:
        return number
    # Оба направления пересчёта, и оба — единицы САМОГО сценария. «1040», когда
    # стол считает тысячами, и «70 тысяч» на столе, который считает тысячами:
    # человек назвал ту же величину в другой записи, а не другое число.
    for candidate in (number * 1000, number / 1000):
        if lo <= candidate <= hi:
            return _round2(candidate)
    return None


def _acceptable(sess: Session, number: float) -> bool:
    """Is a proposed number acceptable to the opponent given their floor?"""
    sc = by_id(sess.scenario_id)
    if sess.lower_better:
        return number >= sc.opponent_reservation - 0.001
    return number <= sc.opponent_reservation + 0.001


#: Слово темы короче четырёх букв в основы не идёт: «в», «и», «с» совпадут с
#: чем угодно. Хвост в две буквы срезается ради русской морфологии — «оплата»
#: обязана ловить «оплате» и «оплату», иначе тема, написанная на чипе, не
#: работала бы в той форме, в какой её произносит человек. Нижняя граница в
#: четыре буквы держит основу осмысленной («деньги» → «день» было бы приветствием).
_TOPIC_MIN_WORD = 4


def _topic_stems(label: str) -> list[str]:
    """Основы, по которым засчитывается попадание ПО ТЕМЕ.

    Выводятся из самого ярлыка темы — того, что игрок читает чипом на столе.
    Это не оптимизация, а инвариант: что написано на чипе, то и работает.
    Отдельный список основ рядом с ярлыком разъехался бы с ним при первой же
    правке текста, и продукт снова начал бы предлагать слова, которых не
    засчитывает. Зеркало — mock/engine.ts::topicStems."""
    out: list[str] = []
    for w in norm(label).split(" "):
        if len(w) < _TOPIC_MIN_WORD:
            continue
        out.append(w[:max(_TOPIC_MIN_WORD, len(w) - 2)])
    return out


def _reveal_index_offline(sc: Scenario, cur_norm: str, lang: str,
                          found: list[int]) -> Optional[int]:
    """Which hidden interest does an OFFLINE probe uncover (judge is None)?

    Интерес вскрывается ТОЛЬКО по теме вопроса: слова игрока обязаны попасть в
    ключевые слова ещё не вскрытого интереса. Прежде здесь стоял запасной ход —
    «не совпало ни с чем, отдай следующий по списку», — и он опрокидывал главный
    тезис продукта: три одинаковых общих «Почему для вас это важно?» вскрывали
    все три интереса. Выигрывал не тот, кто вскрыл интересы, а тот, кто трижды
    нажал подсказанную кнопку. Не совпало — не вскрыли, и оппонент честно
    переспрашивает (реакция probe_vague). Возвращает None и когда всё уже
    вскрыто.

    ПОПАДАНИЕ ПО НАЗВАНИЮ ТЕМЫ РАВНО ПОПАДАНИЮ ПО КЛЮЧЕВОМУ СЛОВУ. Один
    keyword-путь требовал от игрока НАЗВАТЬ СОДЕРЖАНИЕ СЕКРЕТА, чтобы секрет
    открылся: «что для вас важнее всего в этой сделке?» давало probe_vague, а
    «что для вас важно в загрузке производства?» — вскрытие. Без сети главный
    тезис продукта был недостижим, то есть инвариант 5 держался на вере. Темы
    видны игроку (`Scenario.interest_topics` едет в состояние стола), поэтому
    вопрос по теме — ВЫБОР, а не угадывание, а секрет остаётся секретом: тема
    называет область, а не содержание."""
    total = len(sc.hidden_interests[lang])
    kw = (sc.hidden_interest_keywords.get(lang) or []) if sc.hidden_interest_keywords else []
    topics = (sc.interest_topics.get(lang) or []) if sc.interest_topics else []
    if not kw and not topics:
        return None
    for i in range(total):
        if i in found:
            continue
        if i < len(kw) and any(k in cur_norm for k in kw[i]):
            return i
        if i < len(topics) and _has(cur_norm, _topic_stems(topics[i])):
            return i
    return None


def _match_secondary_issues(sc: Scenario, cur_norm: str, lang: str,
                            judge: dict | None) -> list:
    """Which secondary issues is the player conceding on THIS trade-off?

    Semantic judge (if it names one by id via `secondary_conceded`) is
    authoritative — it read the meaning. Otherwise fall back to offline keyword
    detection, which can match several issues offered in one breath. Returns the
    SecondaryIssue objects (deduped by id, order preserved)."""
    if not sc.secondary_issues:
        return []
    if judge is not None:
        jid = judge.get("secondary_conceded")
        if jid:
            for iss in sc.secondary_issues:
                if iss.id == jid:
                    return [iss]
            return []  # judge spoke and named nothing valid → trust it, no keyword guess
    out = []
    for iss in sc.secondary_issues:
        kws = iss.keywords.get(lang, [])
        if any(k in cur_norm for k in kws):
            out.append(iss)
    return out


def apply_move(sess: Session, analysis: Analysis, raw_text: str = "",
               judge: dict | None = None) -> MoveResult:
    """The reactive core. Given the analyzed utterance, update meters, possibly
    move the opponent's offer, and choose a reply.

    Optional `judge` (semantic AI judgement, CLAUDE.md option C) refines three
    things while the engine keeps owning all state/scoring: it overrides the
    keyword arg-quality with a meaning-based score, reveals the interest the
    question ACTUALLY targeted instead of the next one in list order, and VETOES
    a technique it read as fake (`criteria_legitimate` / `tradeoff_real` /
    `batna_real` = False → no leverage, no concession for that technique). A
    veto is only ever a subtraction: the judge cannot invent a technique the
    text does not carry. When judge is None — or when it left those fields out —
    the behaviour is exactly the deterministic keyword path (offline)."""
    sc = by_id(sess.scenario_id)
    s = sess.state
    m = sess.metrics
    style = sc.counterpart.style

    # Semantic judge overrides keyword arg-quality (resists buzzword spam).
    if judge is not None and judge.get("arg_score") is not None:
        analysis.arg_quality = int(judge["arg_score"])

    # Анти-гейминг с памятью на всю партию. Точное равенство с ОДНОЙ прошлой
    # репликой ловило только самый ленивый спам: чередование A,B,A,B проходило
    # насквозь, а тот же абзац с переставленной цифрой — тем более. Считаем
    # сходство со всеми ходами партии и штрафуем непрерывно.
    cur_norm = norm(raw_text)
    cur_tokens = _tokens(cur_norm)
    cur_moves = frozenset(analysis.moves)
    repeat = _repeat_strength(sess, cur_tokens, cur_moves) if cur_norm else 0.0
    sess.move_history.append((cur_tokens, cur_moves))
    sess.last_player_norm = cur_norm
    repeated = repeat >= REPEAT_HARD
    if repeated:
        analysis.arg_quality = min(analysis.arg_quality, 12)
    elif repeat >= REPEAT_SOFT:
        analysis.arg_quality = min(analysis.arg_quality, _js_round(100 * (1 - repeat)))

    before = {
        "trust": s.trust,
        "tension": s.tension,
        "info": s.info,
        "leverage": s.leverage,
        "offer_opp": s.offer_opp,
    }

    # Track metrics.
    m.move_counts[analysis.primary] = m.move_counts.get(analysis.primary, 0) + 1
    m.arg_quality_sum += analysis.arg_quality
    m.arg_quality_n += 1
    # В счёт идёт только сходство ВЫШЕ мягкого порога: живая партия неизбежно
    # повторяет слова («почему для вас важ…»), и штрафовать за это нельзя.
    m.repeat_sum += max(0.0, repeat - REPEAT_SOFT) / (1 - REPEAT_SOFT)
    m.repeat_n += 1
    if analysis.spin:
        m.spin_stages.add(analysis.spin)

    def has(k: str) -> bool:
        return k in analysis.moves

    # Живой судья читает СМЫСЛ приёма, словарь — только форму. Пока приёмы
    # начислялись по попаданию в LEX, один и тот же абзац со словами «рынок»,
    # «альтернатива», «в обмен» приносил рычаг, сколько бы раз судья ни сказал,
    # что настоящего критерия там нет. Явное `False` от судьи — вето: приём не
    # начисляется вовсе. Поля нет (ответ модели постарше) или судьи нет вовсе →
    # None → ровно keyword-путь. Офлайн (`judge is None`) не меняется никак:
    # `judged(k, …)` там тождественно `has(k)`.
    def judged(k: str, field: str) -> bool:
        return has(k) and not (judge is not None and judge.get(field) is False)

    criteria = judged("objective_criteria", "criteria_legitimate")
    batna = judged("batna", "batna_real")
    tradeoff = judged("tradeoff", "tradeoff_real")

    reaction = "neutral"
    concession_fraction = 0.0
    # Что в ЭТОМ ходе заработало движение цены. Пусто — оппонент не двигается.
    # Раньше к дроби уступки безусловно прибавлялась база 0.10 + 0.34·flex, и
    # цена капала сама: двенадцать реплик «Ага N.» проходили 15 из 16 рублей до
    # дна оппонента, не сказав ничего. Уступка обязана иметь причину.
    events: list[str] = []
    # Обратный ход: доля уже данной уступки, которую оппонент снимает.
    rollback = 0.0
    # Для хроники (sess.ledger): КАКОЙ интерес вскрыт этим ходом и был ли
    # вопрос закрыт порогом доверия. Обе величины движок и так вычисляет ниже —
    # здесь они просто не теряются к концу функции.
    revealed_idx: Optional[int] = None
    probe_gated = False

    # --- Empathy / active listening: always cools tension, builds trust. -------
    # Повтор не слушают — его вставляют. Отражение чужих слов работает один
    # раз: иначе одиннадцать копий одного абзаца поднимали доверие до потолка
    # и давали спамеру relationship 100.
    if has("acknowledge") and not repeated:
        s.trust = clamp(s.trust + 8)
        s.tension = clamp(s.tension - 10)
        m.empathy += 1
        reaction = "warmed"

    # --- SPIN & interest probing: uncover hidden interests. --------------------
    judge_interest = judge.get("interest_targeted") if judge else None
    if (analysis.spin or has("interests_probe") or judge_interest is not None) and not repeated:
        total = len(sc.hidden_interests[sess.lang])
        revealed = False
        probe_gated = s.trust <= reveal_trust_gate(sess)
        if s.trust > reveal_trust_gate(sess):
            if judge_interest is not None and 0 <= judge_interest < total and judge_interest not in s.interests_found:
                # Reveal the interest the question ACTUALLY targeted (semantic).
                s.interests_found.append(judge_interest)
                revealed = True
                revealed_idx = judge_interest
            else:
                # СУДЬЯ ТОЛЬКО ДОБАВЛЯЕТ, НО НЕ ОТНИМАЕТ. Раньше здесь стояло
                # `elif judge is None`, и при живом судье попадание по теме не
                # засчитывалось вовсе: молчание судьи означало «интерес не
                # вскрыт», хотя вопрос называл тему дословно.
                #
                # Цена этому нашлась на живом прогоне: принципиальная линия —
                # та самая, которой курс доказывает свои эталонные ответы, —
                # вскрывала два интереса из трёх, цена не доходила до названной
                # игроком, и «Договорились, фиксируем на 86» НЕ ЗАКРЫВАЛО
                # сделку. Офлайн та же линия закрывала. То есть образцовый ответ
                # работал без сети и не работал с ней.
                #
                # Ключевые слова тут не «слабее» судьи: с прошлой правки они
                # требуют попадания ПО ТЕМЕ, ровно как он. Судья добавляет
                # смысл там, где слов не хватило, — но не отменяет попадание.
                idx = _reveal_index_offline(sc, cur_norm, sess.lang, s.interests_found)
                if idx is not None:
                    s.interests_found.append(idx)
                    revealed = True
                    revealed_idx = idx
        gain_base = 22 if analysis.spin in ("implication", "need-payoff") else 14
        gain = gain_base + (10 if has("interests_probe") else 0)
        # Общий вопрос, не попавший ни в один живой интерес, приносит крохи —
        # и с судьёй, и офлайн. `info` — это доля ВСКРЫТОГО, а не число
        # заданных вопросов; иначе шкала растёт от нажатий, а не от работы.
        if not revealed:
            gain = min(gain, 5)
        s.info = clamp(s.info + gain)
        s.trust = clamp(s.trust + 4)
        s.tension = clamp(s.tension - 3)
        if has("interests_probe") or judge_interest is not None:
            m.interest_probes += 1
        if revealed:
            events.append("interest")
            # ВСКРЫТИЕ ГЛАВНЕЕ ТЕПЛОТЫ. Раньше `warmed` побеждал: реплика,
            # соединившая эмпатию с вопросом об интересе — то есть ДВА хороших
            # приёма сразу, — получала «вот за это я и люблю нормальный
            # разговор», и оппонент секрет не называл. Счётчик при этом писал
            # «вскрыто 1 из 3», и человек видел цифру без слов, которые за ней
            # стоят. Наказывать за соединение приёмов — ровно наоборот тому,
            # чему учит курс.
            reaction = "opened_up"
        elif reaction != "warmed":
            # «Почему?» — а что именно вас интересует? Оппонент переспрашивает,
            # вместо того чтобы выложить следующий секрет по списку. Реакция
            # обязана быть отдельной: `opened_up` подставляет в реплику текст
            # интереса, и на невскрытом вопросе это была бы выдача секрета за
            # спиной у счётчика — ровно то, чего второй принцип не разрешает.
            reaction = "probe_vague"

    # --- Objective criteria: legitimate leverage. ------------------------------
    if criteria:
        s.leverage = clamp(s.leverage + 16)
        s.trust = clamp(s.trust + 3)
        m.objective_criteria += 1
        if style == "analytical":
            s.leverage = clamp(s.leverage + 6)
        # Критерий засчитан событием только с опорой: голое слово «рынок» без
        # цифры и без «потому что» — это не критерий, а его имитация.
        # `arg_quality` уже несёт эту проверку (см. techniques.substance).
        if analysis.arg_quality >= CRITERIA_EVENT_MIN:
            events.append("criteria")
        reaction = "persuaded"

    # --- BATNA / alternatives: leverage, but risky. ----------------------------
    if batna:
        backed = criteria or analysis.arg_quality > 55
        s.leverage = clamp(s.leverage + (18 if backed else 10))
        s.tension = clamp(s.tension + (4 if backed else 14))
        if style == "relationship":
            s.tension = clamp(s.tension + 6)
        # Двигает цену ОБОСНОВАННАЯ альтернатива. Названная вслух и ничем не
        # подкреплённая — только поднимает напряжение.
        if backed:
            events.append("batna")
        reaction = "pressured"

    # --- Trade-off / logrolling: value creation. -------------------------------
    if tradeoff:
        s.trust = clamp(s.trust + 6)
        s.tension = clamp(s.tension - 4)
        bonus = 0.12 + 0.18 * (s.info / 100)
        concession_fraction += bonus
        events.append("tradeoff")
        tset = sc.tradeoffs[sess.lang]
        if len(s.tradeoffs_used) < len(tset):
            s.tradeoffs_used.append(len(s.tradeoffs_used))
        reaction = "collaborated"
        # Structured logrolling (scenarios with secondary_issues only): trading a
        # concrete issue the opponent values unlocks a genuine SECOND axis of
        # price movement, scaled by how much they want it. Cheap-for-you /
        # valuable-for-them trades are the whole point. Scenarios with no
        # secondary_issues keep exactly the flat tradeoff behaviour above.
        for iss in _match_secondary_issues(sc, cur_norm, sess.lang, judge):
            if iss.id not in s.terms_conceded:
                s.terms_conceded.append(iss.id)
                concession_fraction += 0.10 + 0.30 * iss.opp_value
                events.append("term:" + iss.id)
                s.trust = clamp(s.trust + 3 + 4 * iss.opp_value)

    # --- Threat / ultimatum: leverage up, relationship down. -------------------
    if has("threat"):
        m.threats += 1
        s.tension = clamp(s.tension + 22)
        s.trust = clamp(s.trust - 14)
        s.leverage = clamp(s.leverage + 6)
        if style == "tough":
            s.tension = clamp(s.tension + 8)
        # Повторная угроза — обратный ход: оппонент снимает часть уступки.
        # Один ультиматум ещё можно списать на нервы, второй — это стиль.
        if m.threats >= 2:
            rollback = max(rollback, 0.20)
        reaction = "hardened"

    # --- Hostility: pure damage. -----------------------------------------------
    if has("hostile"):
        m.hostiles += 1
        s.tension = clamp(s.tension + 26)
        s.trust = clamp(s.trust - 22)
        # Хамство откатывает цену назад, к стартовому якорю: за столом это
        # «раз так — моё предложение снова прежнее», а не молчаливая скидка.
        rollback = max(rollback, 0.35)
        reaction = "offended"

    # --- Rapport / small talk early is fine. -----------------------------------
    if has("rapport") and not repeated:
        s.trust = clamp(s.trust + 5)
        s.tension = clamp(s.tension - 4)

    # --- Player states an offer number (incl. while closing). ------------------
    # Намерение назвать цену — необходимое условие, но не достаточное: число
    # обязано ещё и попасть в коридор масштаба сценария. Иначе «Ага 1.»
    # становилось офертой в 1 ₽/шт, а «Мне 30 лет» — зарплатой в 30 там, где
    # шкала 180–240.
    # Здесь намеренно `has("tradeoff")`, а не вето-версия: судья может не
    # признать размен настоящим, но число, названное вслух, остаётся числом на
    # столе. Вето снимает НАЧИСЛЕНИЕ за приём, а не право игрока назвать цену.
    priced = None
    if analysis.number is not None and (
        has("offer") or has("anchor") or has("concession") or has("accept") or has("tradeoff")
    ):
        priced = _plausible_offer(sc, analysis.number)
        if priced is not None:
            s.offer_player = priced
            # Показанное игроку число обязано совпасть с тем, по которому
            # движок считал: иначе разбор цитирует «70 000», а сделка идёт от 70.
            analysis.number = priced

    # --- Право первого слова: обоснованный якорь двигает РАМКУ. ----------------
    # Условия ровно те, которым учит упражнение `an-07`/`an-10`: цифра, приём
    # «якорение», критерий — и всё это ДО того, как оппонент положил на стол
    # свою цифру. Голая цифра («Наша цена 86.») рамку не двигает: без критерия
    # событие `criteria` не наступает, и урок с движком говорят одно и то же.
    #
    # ПОЧЕМУ ИМЕННО `anchor`, А НЕ ЛЮБОЕ ПЕРВОЕ ЧИСЛО. «Первый названный номер»
    # звучит шире, и шире было проверено: с условием `anchor or offer` партия
    # «чередование» из `games.json` (две сильные строки по кругу, первая — с
    # критерием и цифрой) поднималась с 28 до 30 и обгоняла базовую игру — то
    # есть анти-гейминговая лестница переворачивалась. Приём считается по
    # чипу, который игрок видит под композером: «Наша цена…», «Мы предлагаем…»
    # — это ЗАЯВЛЕНИЕ ПОЗИЦИИ, а цифра внутри довода — довод. Ровно этого же
    # требует предикат упражнения (`require_moves: anchor + objective_criteria`).
    if (not sess.ledger and sess.turn <= 1 and priced is not None
            and has("anchor") and criteria
            and analysis.arg_quality >= CRITERIA_EVENT_MIN
            and _anchor_frame(sess, priced)):
        m.opening_anchor = True

    # --- Compute concession from productive pressure. --------------------------
    # Гибкость больше НЕ порождает движение сама по себе: она лишь превращает
    # заработанное событие в рубли. Нет события — нет и хода цены.
    flex = flexibility(sess)
    concession_fraction += 0.10 + 0.34 * flex
    if criteria:
        concession_fraction += 0.12
    if analysis.spin or has("interests_probe"):
        concession_fraction += 0.05
    if has("acknowledge"):
        concession_fraction += 0.03
    if has("threat") and s.leverage > 45 and s.tension < 80:
        concession_fraction += 0.06
    if s.offer_player is not None:
        gap = (s.offer_opp - s.offer_player) if sess.lower_better else (s.offer_player - s.offer_opp)
        if gap > 0:
            concession_fraction += min(0.08, gap * 0.01)
    if not events:
        # Ни одного события — оппонент не двигается ВООБЩЕ. Прежде здесь текла
        # безусловная база: двенадцать «Ага N.» проходили почти весь путь до
        # дна, ничего не сказав. Хорошая атмосфера и удачные вопросы делают
        # уступку крупнее, но не заменяют повода её сделать.
        concession_fraction = 0.0
    # Сложность стола — множитель к ЗАРАБОТАННОМУ движению, и только к нему.
    # Стоит ПОСЛЕ обнуления без события: трудный стол уступает скупее, но повод
    # уступить он не отменяет и не выдумывает. Нулю множитель не поможет.
    concession_fraction *= resistance(sess)
    if s.tension > 75:
        concession_fraction *= 0.25
    elif s.tension > 55:
        concession_fraction *= 0.6
    # Повтор — не ход: чем ближе реплика к уже сказанному, тем меньше от неё
    # движения. Непрерывно, чтобы перефразировка спама не давала полный эффект.
    if repeat >= REPEAT_SOFT:
        concession_fraction *= max(0.15, 1 - repeat)
    concession_fraction = clamp(concession_fraction, 0, 0.7)

    # Обратный ход старше уступки: в ход, где нагрубили или дожали второй
    # угрозой, цена уходит назад, а не вперёд.
    if rollback > 0:
        concession_fraction = 0.0
        _retract(sess, rollback)
    elif concession_fraction > 0.01:
        _concede(sess, concession_fraction)

    # Повтор не заставляет оппонента реагировать ЗАНОВО. Он уже ответил на эту
    # реплику — второй раз она не поднимает ни доверия, ни информации. Иначе
    # один и тот же абзац, вставленный одиннадцать раз, докручивал отношения до
    # ста из ста. Грубость и угрозы — исключение: их повтор ранит каждый раз,
    # иначе агрессивная партия перестала бы срываться (инвариант 2).
    if repeated and not (has("hostile") or has("threat")):
        s.trust = before["trust"]
        s.tension = before["tension"]
        s.info = before["info"]
        s.leverage = before["leverage"]
        # …но раздражает: «вы это уже говорили» — цена терпения.
        s.tension = clamp(s.tension + 6)
        reaction = "neutral"

    # --- Closing: player tries to accept / lock a deal. ------------------------
    closed = False
    if has("accept"):
        # Число вне коридора сценария — это не оферта, а провал закрытия.
        # Прежде «Договорились, 42» проходило через `max(meeting, floor)` и
        # сходилось РОВНО на дне оппонента: одна фраза первым ходом давала
        # economic 100. Клампа больше нет — сходимся от того, что назвал игрок.
        stated_unpriced = analysis.number is not None and priced is None
        no_bridge = False
        if priced is not None:
            gap = ((s.offer_opp - priced) if sess.lower_better
                   else (priced - s.offer_opp))
            # Хвостик в пару процентов от хода якоря — это уже рукопожатие,
            # а не разрыв: спорить из-за копейки никто не станет.
            near = abs(gap) <= 0.02 * abs(sc.opponent_open - sc.opponent_reservation)
            if gap <= 0 or near:
                # Игрок назвал число не лучше того, что уже лежит на столе, —
                # то есть сам пришёл к оппоненту. Тут спорить не о чем.
                meeting = priced
            else:
                # Разрыв закрывают ТЕМ ЖЕ, чем двигают цену: заработанным
                # событием. Слово «договорились» само по себе не событие.
                w = (0.3 + 0.45 * flex) if events else 0.0
                meeting = _round2(s.offer_opp + (priced - s.offer_opp) * w)
                no_bridge = not events
        else:
            # Голое «договорились» — это согласие на ТО, ЧТО ЛЕЖИТ НА СТОЛЕ.
            # Считать его попыткой дожать цифру, названную три хода назад,
            # значит отказывать игроку в закрытии, которого он и просит.
            meeting = s.offer_opp
        if stated_unpriced or no_bridge or not _acceptable(sess, meeting):
            # Не сошлись — и это стоит нервов обеим сторонам.
            s.tension = clamp(s.tension + 8)
            reaction = "not_yet"
        else:
            s.deal = meeting
            s.status = "agreement"
            closed = True

    # --- Breakdown check. ------------------------------------------------------
    if s.tension >= 100 or s.trust <= 3:
        s.status = "breakdown"
        closed = True
        reaction = "walked_out"
        # Срыв старше рукопожатия. Одна реплика умеет и то и другое сразу —
        # «По рукам, вы врёте, но ладно»: `accept` успевает записать сделку, а
        # хамство в той же строке добивает напряжение до ста. Оставить число
        # значит показать на столе цену сделки, которой нет: разбор честно
        # пишет «Сделка сорвалась» и economic 0, а StateView отдаёт `deal`.
        # Второй принцип запрещает ровно это — вид сделки без сделки.
        s.deal = None

    deltas = {
        "trust": s.trust - before["trust"],
        "tension": s.tension - before["tension"],
        "info": s.info - before["info"],
        "leverage": s.leverage - before["leverage"],
        "offer_opp": _round2(s.offer_opp - before["offer_opp"]),
    }

    # Хроника хода для разбора «с той стороны стола». Пишется ПОСЛЕ всего —
    # включая срыв, который старше рукопожатия, — поэтому запись отражает
    # окончательное решение движка, а не промежуточное.
    sess.ledger.append({
        # Номер хода считается по самой хронике, а не по `sess.turn`: счётчик
        # крутит вызывающая сторона, и в тестах/переигровке его не крутит никто.
        "turn": len(sess.ledger) + 1,
        "text": raw_text,
        "reaction": reaction,
        "moves": sorted(analysis.moves),
        "deltas": dict(deltas),
        "events": list(events),
        "rollback": rollback,
        "repeat": _round2(repeat),
        "revealed": revealed_idx,
        "gated": probe_gated,
        "offer_before": _round2(before["offer_opp"]),
        "offer_after": _round2(s.offer_opp),
        "closed": closed,
        "status": s.status,
    })

    return MoveResult(
        reaction=reaction,
        deltas=deltas,
        closed=closed,
        concession_fraction=concession_fraction,
        analysis=analysis,
    )


# -----------------------------------------------------------------------------
# Dialogue generation (templated, in-character).
# -----------------------------------------------------------------------------

# Templated reaction banks. Each reaction maps to a dict with a shared "base"
# bank (5-6 neutral-but-in-character lines, always present) plus OPTIONAL
# per-persona-style variants keyed by counterpart.style ("relationship" /
# "tough" / "analytical"). render_line pools the style variants (when the active
# persona has them) in FRONT of the base so a warm sales head, a blunt hard
# bargainer and a dry numbers person sound different for the SAME reaction, while
# the base guarantees a fallback and extra variety. Placeholders are unchanged:
# {offer}{unit}, {deal}{unit}, {interest}. Everything here is pure text — no
# state — so render_line stays a pure, reproducible function (what-if replay).
LINES: dict[str, dict[str, dict[str, list[str]]]] = {
    "ru": {
        "warmed": {
            "base": [
                "Приятно, что вы это понимаете. Тогда давайте по делу.",
                "Спасибо, редко кто слышит нашу сторону. Продолжим.",
                "Вот с этого и стоило начинать — так гораздо проще разговаривать.",
                "Хорошо, что мы друг друга слышим. Идём дальше.",
                "Уже теплее. С таким настроем и договориться реально.",
                "Ценю, что вы вникаете в нашу ситуацию. Продолжайте.",
            ],
            "relationship": [
                "Как приятно иметь дело с понимающим человеком. Давайте решим всё по-хорошему, вместе.",
                "Вот за это я и люблю нормальный разговор. Спасибо, что услышали меня.",
                "Мне правда важно, что вы вникли. Давайте дальше двигаться вместе.",
            ],
            "tough": [
                "Ладно, уже без наездов. Так и быть, продолжим.",
                "Наконец по-деловому. Дальше, не тянем.",
                "Хорошо. Меньше эмоций, больше дела.",
            ],
            "analytical": [
                "Разумно. Раз мы сходимся по фактам — двигаемся дальше.",
                "Логично. С таким подходом можно работать.",
                "Если посмотреть на факты — вы правы. Продолжим.",
            ],
        },
        "opened_up": {
            "base": [
                "Хороший вопрос… Честно говоря, для нас критично {interest}.",
                "Раз уж вы спросили — нас правда беспокоит {interest}.",
                "Скажу как есть: больше всего нас волнует {interest}.",
                "Если по-честному, то главный вопрос для нас — {interest}.",
                "Тут вы попали в точку. Для нас важно именно {interest}.",
                "Не буду скрывать: за этим стоит {interest}.",
            ],
            "relationship": [
                "Раз уж вы так по-доброму спрашиваете — по-человечески нам важно {interest}.",
                "Вам скажу откровенно, как своим: для нас это про {interest}.",
                "Спасибо, что интересуетесь. По-настоящему нас волнует {interest}.",
            ],
            "tough": [
                "Ладно. Коротко: нам нужно {interest}. Вот и весь секрет.",
                "Скажу прямо, без обёртки: дело в {interest}.",
                "Раз надо — {interest}. Всё, поехали дальше.",
            ],
            "analytical": [
                "Если разложить по сути — ключевой фактор для нас {interest}.",
                "По факту всё упирается в {interest}.",
                "Если посмотреть на факты, для нас определяющее — {interest}.",
            ],
        },
        "persuaded": {
            "base": [
                "С такими данными спорить сложно. Могу подвинуться — сейчас {offer}{unit}.",
                "Ладно, цифры говорят сами за себя. Пусть будет {offer}{unit}.",
                "Аргумент принят. Готов пересмотреть — {offer}{unit}.",
                "Убедили. Тогда моё предложение {offer}{unit}.",
                "Против фактов не пойду. Сдвигаюсь к {offer}{unit}.",
                "Справедливо. Пойду вам навстречу — {offer}{unit}.",
            ],
            "relationship": [
                "Вы меня по-хорошему убедили. Давайте так и сделаем — {offer}{unit}.",
                "Ради добрых отношений с радостью подвинусь — {offer}{unit}.",
                "Мне приятно, что мы слышим друг друга. Пусть будет {offer}{unit}.",
            ],
            "tough": [
                "Ладно. Цифра бьёт — {offer}{unit}. Дальше.",
                "Принято, крыть нечем. {offer}{unit}.",
                "Цифры есть цифры. {offer}{unit}, идём.",
            ],
            "analytical": [
                "Расчёт корректный. Пересчитал — {offer}{unit}.",
                "Данные сходятся. По ним получается {offer}{unit}.",
                "Если посмотреть на факты, ваш довод верен. {offer}{unit}.",
            ],
        },
        "pressured": {
            "base": [
                "Слышал про ваши альтернативы. Но давайте без ультиматумов — {offer}{unit}.",
                "Понимаю, что у вас есть варианты. Готов обсуждать, {offer}{unit}.",
                "Рычаг у вас есть, не спорю. И всё же {offer}{unit}.",
                "Давайте не мериться силами. По цене — {offer}{unit}.",
                "Ваши козыри вижу. Но моя цифра пока {offer}{unit}.",
                "Угрозы лишние, у нас и так есть о чём говорить. {offer}{unit}.",
            ],
            "relationship": [
                "Ну зачем же так резко? Мы ведь можем по-хорошему, вместе. {offer}{unit}.",
                "Не надо давить, я и так к вам расположена. Давайте спокойно — {offer}{unit}.",
                "Мне неуютно от такого тона. Давайте по-доброму: {offer}{unit}.",
            ],
            "tough": [
                "Давите? Давите. Меня этим не сдвинуть. {offer}{unit}.",
                "Альтернативы — это ваше дело. Моё — {offer}{unit}.",
                "Пугать будете кого другого. {offer}{unit}.",
            ],
            "analytical": [
                "Ваша BATNA — это тоже цифра, давайте её и обсудим. Пока {offer}{unit}.",
                "Хорошо, сравним варианты по фактам. У меня {offer}{unit}.",
                "Эмоции опустим. По расчёту у меня {offer}{unit}.",
            ],
        },
        "collaborated": {
            "base": [
                "Вот это уже интересно. Если так, то {offer}{unit} — реально.",
                "Такой размен нам подходит. Тогда {offer}{unit}.",
                "О, это меняет дело. Давайте под это {offer}{unit}.",
                "Если вы про это всерьёз — я готов на {offer}{unit}.",
                "Хороший пакет. При таком раскладе {offer}{unit}.",
                "Вот теперь мы создаём ценность, а не делим её. {offer}{unit}.",
            ],
            "relationship": [
                "Вот это по-партнёрски! Давайте вместе так и сделаем — {offer}{unit}.",
                "Люблю, когда ищут общий интерес, а не тянут одеяло. Тогда {offer}{unit}.",
                "Вот теперь мы заодно. С удовольствием — {offer}{unit}.",
            ],
            "tough": [
                "Годится. Даёте это — беру {offer}{unit}. Почти по рукам.",
                "Вот это конкретика. За такое — {offer}{unit}.",
                "Дело говорите. {offer}{unit}, и не тянем.",
            ],
            "analytical": [
                "Сходится: ваша уступка компенсирует мою. Тогда {offer}{unit}.",
                "По балансу выгод это работает. {offer}{unit}.",
                "Если посмотреть на факты, размен честный. {offer}{unit}.",
            ],
        },
        "hardened": {
            "base": [
                "Давление здесь не поможет. Моя позиция прежняя — {offer}{unit}.",
                "В таком тоне мне сложно двигаться. Остаюсь на {offer}{unit}.",
                "Так вопрос не решается. Цифра прежняя — {offer}{unit}.",
                "Нет. На угрозы я не реагирую. {offer}{unit}.",
                "Это только всё портит. Я на {offer}{unit} и остаюсь.",
                "Чем сильнее давите, тем меньше желания двигаться. {offer}{unit}.",
            ],
            "relationship": [
                "Мне неприятен такой напор, честно. Так уступать не хочется — {offer}{unit}.",
                "Жаль, что вы так со мной. По-доброму было бы куда проще. {offer}{unit}.",
                "Мне обидно от такого давления. Пока остаюсь на {offer}{unit}.",
            ],
            "tough": [
                "Не пройдёт. {offer}{unit}, и точка.",
                "Меня на испуг не возьмёшь. {offer}{unit}.",
                "Давите сколько хотите — {offer}{unit}.",
            ],
            "analytical": [
                "Эмоции — не аргумент. Пока цифры прежние: {offer}{unit}.",
                "Без фактов это просто давление. {offer}{unit}.",
                "Дайте данные, а не тон. Пока {offer}{unit}.",
            ],
        },
        "offended": {
            "base": [
                "Я бы попросил без перехода на личности.",
                "Так мы точно ни о чём не договоримся.",
                "Это уже лишнее. Давайте держаться в рамках.",
                "Не надо так со мной разговаривать.",
                "Подобный тон я терпеть не обязан.",
                "Ещё одно такое слово — и разговор закончен.",
            ],
            "relationship": [
                "Мне правда обидно это слышать, я так не привыкла разговаривать.",
                "Зачем же так? Я ведь к вам со всей душой.",
                "Мне неприятно. Давайте всё же по-человечески.",
            ],
            "tough": [
                "Полегче. Ещё раз так — и разошлись.",
                "Аккуратнее в выражениях со мной.",
                "Тон смени. Быстро.",
            ],
            "analytical": [
                "Эмоции оставим за скобками, это непродуктивно.",
                "Переход на личности к сути отношения не имеет.",
                "Давайте по фактам, а не на личности.",
            ],
        },
        "neutral": {
            "base": [
                "Хорошо, я вас понял. Пока моё предложение — {offer}{unit}.",
                "Принято. На данный момент — {offer}{unit}.",
                "Ясно. Пока остаёмся на {offer}{unit}.",
                "Понял вас. Моя цифра сейчас — {offer}{unit}.",
                "Ок, услышал. Пока что {offer}{unit}.",
                "Давайте зафиксируем: сейчас на столе {offer}{unit}.",
            ],
            "relationship": [
                "Хорошо, давайте пока остановимся на {offer}{unit}, а дальше вместе посмотрим.",
                "Я вас понимаю. Пусть пока будет {offer}{unit}, спокойно.",
                "Хорошо, услышала вас. Пока {offer}{unit}, и давайте не спеша.",
            ],
            "tough": [
                "Так. Пока {offer}{unit}. Что дальше?",
                "Ясно. {offer}{unit}. Не тянем.",
                "Коротко: {offer}{unit}. Дальше.",
            ],
            "analytical": [
                "Фиксирую: текущая цифра {offer}{unit}.",
                "По состоянию на сейчас — {offer}{unit}.",
                "Если по фактам — на столе {offer}{unit}.",
            ],
        },
        # Общий вопрос, не попавший ни в один интерес. Отдельная реакция нужна
        # ради второго принципа: `opened_up` подставляет в реплику текст
        # интереса, и на невскрытом вопросе оппонент выдал бы секрет, которого
        # счётчик не засчитал. Здесь он честно переспрашивает.
        "probe_vague": {
            "base": [
                "Почему — а что именно вас интересует? Спросите конкретнее.",
                "Смотря о чём вы. Что именно вам важно понять?",
                "Вопрос широкий. Про что конкретно спрашиваете?",
                "Так сразу и не ответишь. Уточните, о чём речь?",
                "Про что именно? Тем тут хватает.",
                "Можно поконкретнее? Иначе отвечу общими словами.",
            ],
            "relationship": [
                "Я бы рада ответить, но вы спросите поконкретнее — о чём именно?",
                "Давайте по-человечески: что именно вас интересует?",
                "Мне бы понять, о чём вы. Уточните, пожалуйста?",
            ],
            "tough": [
                "Что именно? Общие вопросы — общие ответы.",
                "Конкретнее. Про что спрашиваете?",
                "Так не работает. Спросите по делу.",
            ],
            "analytical": [
                "Вопрос сформулирован широко. Уточните предмет.",
                "О каком именно факторе речь?",
                "Давайте сузим вопрос — иначе ответ будет ни о чём.",
            ],
        },
        "not_yet": {
            "base": [
                "Пока рано пожимать руки — {offer}{unit} моё текущее предложение.",
                "Ещё не сходимся. Сейчас у меня {offer}{unit}.",
                "Рановато. До {offer}{unit} я дошёл, дальше пока нет.",
                "Не спешите. Пока это {offer}{unit}.",
                "Мы близко, но ещё не там. {offer}{unit}.",
                "Руку жать пока не за что — {offer}{unit}.",
            ],
            "relationship": [
                "Давайте не будем спешить, хорошо? Пока {offer}{unit}.",
                "Мне бы очень хотелось договориться, но пока рановато — {offer}{unit}.",
                "Мы ведь к этому идём вместе. Пока {offer}{unit}.",
            ],
            "tough": [
                "Нет. Пока нет. {offer}{unit}.",
                "Рано. {offer}{unit}, и не торопите.",
                "Не сходимся. {offer}{unit}.",
            ],
            "analytical": [
                "По цифрам мы ещё не сошлись: {offer}{unit}.",
                "Разрыв пока есть. {offer}{unit}.",
                "Данные пока расходятся. {offer}{unit}.",
            ],
        },
        "walked_out": {
            "base": [
                "Знаете, наверное, нам стоит взять паузу. На этом остановимся.",
                "Боюсь, продолжать в таком ключе бессмысленно. Всего доброго.",
                "Пожалуй, на сегодня достаточно. Я выхожу.",
                "Так дела не делаются. Разговор окончен.",
                "Мы зашли в тупик. Дальше нет смысла.",
                "Всё, я не готов это продолжать. До свидания.",
            ],
            "relationship": [
                "Мне очень жаль, но так я больше не могу. Давайте на этом по-доброму закончим.",
                "Обидно, что так вышло между нами. Всего вам доброго.",
                "Не хочу ссориться. Давайте остановимся, мне так спокойнее.",
            ],
            "tough": [
                "Всё, хватит. Я закончил.",
                "Разговор окончен. Ищите другого.",
                "Время не тяните — я ушёл.",
            ],
            "analytical": [
                "Дальнейший разговор непродуктивен. Закрываем.",
                "Смысла продолжать нет. Расходимся.",
                "По фактам продолжать нерационально. Всё.",
            ],
        },
        "agreement": {
            "base": [
                "По рукам! Договорились на {deal}{unit}. Рад иметь с вами дело.",
                "Отлично, фиксируем {deal}{unit}. Было приятно вести переговоры.",
                "Идёт! {deal}{unit} — и по рукам.",
                "Договорились на {deal}{unit}. Хорошая работа с обеих сторон.",
                "Пусть будет {deal}{unit}. Ударили по рукам.",
                "Согласен, {deal}{unit}. Оформляем.",
            ],
            "relationship": [
                "Вот и славно! {deal}{unit} — и работаем дальше по-доброму. Рада сделке.",
                "По рукам, {deal}{unit}! Приятно, когда всё по-человечески, вместе.",
                "Договорились, {deal}{unit}. Спасибо, что услышали меня.",
            ],
            "tough": [
                "Идёт. {deal}{unit}. По рукам, не будем тянуть.",
                "Ок, {deal}{unit}. Договорились.",
                "{deal}{unit}. Всё, по рукам.",
            ],
            "analytical": [
                "Цифра сходится: {deal}{unit}. Фиксируем в договоре.",
                "{deal}{unit} — по расчётам всех устраивает. Договорились.",
                "Если посмотреть на факты — {deal}{unit} оптимально. Договорились.",
            ],
        },
    },
    "en": {
        "warmed": {
            "base": [
                "I appreciate that you get it. Let's get to business.",
                "Thanks — few people hear our side. Go on.",
                "That's the right way to start. Much easier to talk like this.",
                "Good, we're hearing each other. Let's move on.",
                "That's warmer already. With that attitude we can make a deal.",
                "I appreciate you engaging with our situation. Please continue.",
            ],
            "relationship": [
                "It's a pleasure dealing with someone who understands. Let's sort this out together, the good way.",
                "This is why I like a civil negotiation. Thanks for hearing me out.",
                "It really means a lot that you get it. Let's work through this together.",
            ],
            "tough": [
                "Alright, no more jabs. Fine, let's keep going.",
                "Good, now you're talking business. Next.",
                "Right. Less noise, more substance.",
            ],
            "analytical": [
                "Reasonable. Since we agree on the facts, let's move on.",
                "Logical. I can work with that approach.",
                "Looking at the facts, you're right. Let's continue.",
            ],
        },
        "opened_up": {
            "base": [
                "Good question… Honestly, what matters to us is {interest}.",
                "Since you ask — we really care about {interest}.",
                "I'll be straight: what worries us most is {interest}.",
                "Honestly, the real issue for us is {interest}.",
                "You've hit it. For us it's exactly {interest}.",
                "I won't hide it: behind this is {interest}.",
            ],
            "relationship": [
                "Since you ask so kindly — on a human level, {interest} matters to us.",
                "I'll be open with you, as a friend: for us this is about {interest}.",
                "Thank you for caring to ask. What truly worries us is {interest}.",
            ],
            "tough": [
                "Fine. Short version: we need {interest}. That's the whole story.",
                "I'll say it plainly: it comes down to {interest}.",
                "If you must know — {interest}. That's it, moving on.",
            ],
            "analytical": [
                "If we break it down — the key factor for us is {interest}.",
                "In effect it all reduces to {interest}.",
                "Look at the facts and it's clear: what decides it for us is {interest}.",
            ],
        },
        "persuaded": {
            "base": [
                "Hard to argue with those numbers. I can move — {offer}{unit} now.",
                "Fair, the data speaks for itself. Let's say {offer}{unit}.",
                "Point taken. I'm willing to revise — {offer}{unit}.",
                "You've convinced me. Then my offer is {offer}{unit}.",
                "I won't argue against facts. Moving to {offer}{unit}.",
                "That's fair. I'll meet you — {offer}{unit}.",
            ],
            "relationship": [
                "You've won me over the decent way. Let's do it — {offer}{unit}.",
                "For the sake of a good relationship I'll gladly move — {offer}{unit}.",
                "I'm glad we hear each other. Let it be {offer}{unit}.",
            ],
            "tough": [
                "Fine. The number lands — {offer}{unit}. Next.",
                "Taken, nothing to add. {offer}{unit}.",
                "Numbers are numbers. {offer}{unit}, let's go.",
            ],
            "analytical": [
                "The math checks out. Recalculated — {offer}{unit}.",
                "The data lines up. It comes to {offer}{unit}.",
                "On the facts, your point holds. {offer}{unit}.",
            ],
        },
        "pressured": {
            "base": [
                "I hear you have alternatives. But no ultimatums — {offer}{unit}.",
                "I know you have options. Happy to talk, {offer}{unit}.",
                "You've got leverage, I won't deny it. Still, {offer}{unit}.",
                "Let's not measure muscle. On price — {offer}{unit}.",
                "I see your cards. But my number is still {offer}{unit}.",
                "Threats are unnecessary, we have plenty to discuss. {offer}{unit}.",
            ],
            "relationship": [
                "Why so sharp? We can do this the friendly way, together. {offer}{unit}.",
                "No need to push, I'm already on your side. Let's stay calm — {offer}{unit}.",
                "That tone makes me uneasy. Let's keep it kind: {offer}{unit}.",
            ],
            "tough": [
                "Push all you like. It won't move me. {offer}{unit}.",
                "Your alternatives are your business. Mine is {offer}{unit}.",
                "Save the scare tactics for someone else. {offer}{unit}.",
            ],
            "analytical": [
                "Your BATNA is a number too — let's discuss that. For now {offer}{unit}.",
                "Fine, let's compare options on the facts. I'm at {offer}{unit}.",
                "Let's set emotion aside. By my math I'm at {offer}{unit}.",
            ],
        },
        "collaborated": {
            "base": [
                "Now that's interesting. On those terms, {offer}{unit} is doable.",
                "That trade works for us. Then {offer}{unit}.",
                "That changes things. Under that, {offer}{unit}.",
                "If you mean that seriously — I can do {offer}{unit}.",
                "Good package. In that case {offer}{unit}.",
                "Now we're creating value, not just splitting it. {offer}{unit}.",
            ],
            "relationship": [
                "Now that's a partnership! Let's do it together — {offer}{unit}.",
                "I love it when we find the shared interest instead of tugging. Then {offer}{unit}.",
                "Now we're on the same side. Happily — {offer}{unit}.",
            ],
            "tough": [
                "Works. You give that, I take {offer}{unit}. Almost a deal.",
                "Now that's concrete. For that — {offer}{unit}.",
                "Now you're talking. {offer}{unit}, no dragging it out.",
            ],
            "analytical": [
                "It nets out: your concession offsets mine. Then {offer}{unit}.",
                "On the balance of value, that works. {offer}{unit}.",
                "On the facts, that's a fair trade. {offer}{unit}.",
            ],
        },
        "hardened": {
            "base": [
                "Pressure won't help here. My position stands — {offer}{unit}.",
                "I can't move in that tone. Staying at {offer}{unit}.",
                "That's not how this gets solved. Number stands — {offer}{unit}.",
                "No. I don't respond to threats. {offer}{unit}.",
                "This only makes it worse. I'm staying at {offer}{unit}.",
                "The harder you push, the less I want to move. {offer}{unit}.",
            ],
            "relationship": [
                "I honestly don't like this pressure. I don't want to concede like this — {offer}{unit}.",
                "A shame you're taking this tack with me. It'd be far easier the kind way. {offer}{unit}.",
                "This pressure upsets me. I'm staying at {offer}{unit} for now.",
            ],
            "tough": [
                "Not happening. {offer}{unit}, period.",
                "You won't scare me. {offer}{unit}.",
                "Push all day — {offer}{unit}.",
            ],
            "analytical": [
                "Emotion isn't an argument. Numbers stand: {offer}{unit}.",
                "Without facts this is just noise. {offer}{unit}.",
                "Bring data, not tone. For now {offer}{unit}.",
            ],
        },
        "offended": {
            "base": [
                "I'd ask you to keep this professional.",
                "This isn't going anywhere like that.",
                "That's out of line. Let's stay within bounds.",
                "Don't talk to me like that.",
                "I don't have to put up with that tone.",
                "One more remark like that and we're done.",
            ],
            "relationship": [
                "That genuinely hurts to hear. I'm not used to being spoken to this way.",
                "Why be like that? I've been nothing but fair with you.",
                "That upsets me. Let's keep this human, please.",
            ],
            "tough": [
                "Easy. One more like that and we're through.",
                "Watch your tone with me.",
                "Drop the tone. Now.",
            ],
            "analytical": [
                "Let's leave emotion out of it, it's unproductive.",
                "Personal attacks have no bearing on the substance.",
                "Let's stick to the facts, not personalities.",
            ],
        },
        "neutral": {
            "base": [
                "Understood. For now my offer is {offer}{unit}.",
                "Noted. At this point — {offer}{unit}.",
                "Clear. We're staying at {offer}{unit} for now.",
                "Got it. My number right now is {offer}{unit}.",
                "Okay, heard you. For now {offer}{unit}.",
                "Let's log it: {offer}{unit} is on the table.",
            ],
            "relationship": [
                "Alright, let's leave it at {offer}{unit} for now and see together.",
                "I hear you. Let's rest at {offer}{unit}, no rush.",
                "Okay, I hear you. {offer}{unit} for now, let's take it easy.",
            ],
            "tough": [
                "Right. {offer}{unit} for now. What's next?",
                "Clear. {offer}{unit}. Let's not drag this.",
                "Short version: {offer}{unit}. Next.",
            ],
            "analytical": [
                "Logged: current figure {offer}{unit}.",
                "As of now — {offer}{unit}.",
                "On the facts — {offer}{unit} is on the table.",
            ],
        },
        # A generic question that hit no live interest — see the RU bank above.
        "probe_vague": {
            "base": [
                "Why — but what exactly are you asking about? Be specific.",
                "Depends what you mean. What is it you want to understand?",
                "That's a broad question. About what exactly?",
                "Hard to answer like that. Narrow it down?",
                "About what specifically? There's plenty here.",
                "Could you be more concrete? Otherwise you'll get platitudes.",
            ],
            "relationship": [
                "I'd love to answer, but ask me something specific — about what?",
                "Let's keep it human: what exactly matters to you here?",
                "I'd like to follow you. Could you narrow it down?",
            ],
            "tough": [
                "What exactly? Generic questions get generic answers.",
                "Be specific. What are you asking?",
                "That doesn't work. Ask something concrete.",
            ],
            "analytical": [
                "The question is stated too broadly. Specify the subject.",
                "Which factor exactly are we talking about?",
                "Let's narrow the question — otherwise the answer says nothing.",
            ],
        },
        "not_yet": {
            "base": [
                "Too early to shake hands — {offer}{unit} is where I am.",
                "We're not there yet. Right now I'm at {offer}{unit}.",
                "Bit soon. I've come to {offer}{unit}, no further yet.",
                "No rush. For now it's {offer}{unit}.",
                "We're close, but not there. {offer}{unit}.",
                "Nothing to shake on yet — {offer}{unit}.",
            ],
            "relationship": [
                "Let's not rush it, okay? For now {offer}{unit}.",
                "I'd really like to get there, but it's a touch early — {offer}{unit}.",
                "We're getting there together. For now {offer}{unit}.",
            ],
            "tough": [
                "No. Not yet. {offer}{unit}.",
                "Too soon. {offer}{unit}, and don't rush me.",
                "We're not there. {offer}{unit}.",
            ],
            "analytical": [
                "On the numbers we haven't converged: {offer}{unit}.",
                "There's still a gap. {offer}{unit}.",
                "The data still diverges. {offer}{unit}.",
            ],
        },
        "walked_out": {
            "base": [
                "You know, maybe we should take a break. Let's stop here.",
                "I'm afraid there's no point continuing like this. Good day.",
                "That's enough for today. I'm out.",
                "This isn't how business is done. We're finished.",
                "We've hit a wall. No sense going on.",
                "That's it, I'm not continuing this. Goodbye.",
            ],
            "relationship": [
                "I'm sorry, but I can't do this anymore. Let's end here kindly.",
                "It pains me it came to this between us. All the best to you.",
                "I don't want a quarrel. Let's stop — it's easier for me this way.",
            ],
            "tough": [
                "That's it. I'm done.",
                "This conversation is over. Find someone else.",
                "Don't waste my time — I'm out.",
            ],
            "analytical": [
                "Continuing is unproductive. We're closing this.",
                "No point going further. We're done here.",
                "On the facts, continuing is irrational. That's all.",
            ],
        },
        "agreement": {
            "base": [
                "Deal! {deal}{unit} it is. A pleasure doing business.",
                "Great, we lock {deal}{unit}. Good negotiating with you.",
                "Done! {deal}{unit} — let's shake on it.",
                "Agreed at {deal}{unit}. Good work on both sides.",
                "Let's call it {deal}{unit}. Hands on it.",
                "I'm in at {deal}{unit}. Let's paper it.",
            ],
            "relationship": [
                "Wonderful! {deal}{unit} — and let's keep working together. Glad we did this.",
                "Deal, {deal}{unit}! It's nice when it's done the human way, together.",
                "Agreed, {deal}{unit}. Thank you for truly hearing me.",
            ],
            "tough": [
                "Done. {deal}{unit}. Shake on it, let's not drag it.",
                "Okay, {deal}{unit}. We've got a deal.",
                "{deal}{unit}. That's it, shake on it.",
            ],
            "analytical": [
                "The number works: {deal}{unit}. Let's put it in the contract.",
                "{deal}{unit} — it pencils out for everyone. Agreed.",
                "On the facts, {deal}{unit} is optimal. Agreed.",
            ],
        },
    },
}


def _pick(arr: list[str], seed: int) -> str:
    return arr[seed % len(arr)]


def _line_seed(sess: Session) -> int:
    """A deterministic seed that changes across turns AND as the game develops,
    so a single game doesn't cycle the same reaction line. Pure function of
    session state (no time/random) → what-if replay stays reproducible. The
    coprime-ish weights spread consecutive turns across the whole bank instead of
    stepping +1, and progress signals (interests/tradeoffs/terms) reshuffle the
    pick so identical consecutive reactions rarely repeat verbatim."""
    s = sess.state
    return (
        sess.turn * 7
        + len(s.interests_found) * 3
        + len(s.tradeoffs_used) * 5
        + len(s.terms_conceded) * 11
    )


def _reaction_bank(lang: str, key: str, style: str) -> list[str]:
    """Pool the persona-style variants (if this persona has any for this
    reaction) in front of the shared base bank. Style-appropriate lines get
    picked first for low seeds, and the base always supplies a fallback and extra
    variety so no reaction ever loops between just two lines."""
    entry = LINES[lang].get(key) or LINES[lang]["neutral"]
    base = entry["base"]
    variants = entry.get(style)
    return (variants + base) if variants else base


def render_line(sess: Session, reaction: str, closed: bool) -> str:
    sc = by_id(sess.scenario_id)
    s = sess.state
    lang = sess.lang
    unit = sc.headline.unit[lang]
    style = sc.counterpart.style
    key = reaction
    if closed and s.status == "agreement":
        key = "agreement"
    if closed and s.status == "breakdown":
        key = "walked_out"
    arr = _reaction_bank(lang, key, style)
    line = _pick(arr, _line_seed(sess))
    interest_list = sc.hidden_interests[lang]
    if s.interests_found:
        last_interest = interest_list[s.interests_found[-1]]
    else:
        last_interest = interest_list[0]
    # Реплику оппонента и озвучивают, и читают глазами, поэтому цифра в ней
    # печатается по тем же правилам, что и в разборе: разделитель по языку и
    # узкий пробел перед знаком валюты (иначе «100₽/шт» слипается в один глиф).
    return (
        line.replace("{offer}{unit}", format_deal(s.offer_opp, unit, lang))
        .replace("{deal}{unit}",
                 format_deal(s.deal if s.deal is not None else s.offer_opp, unit, lang))
        .replace("{offer}", format_number(s.offer_opp, lang))
        .replace("{deal}", format_number(s.deal if s.deal is not None else s.offer_opp, lang))
        .replace("{unit}", unit)
        .replace("{interest}", (last_interest or "").lower())
    )


# -----------------------------------------------------------------------------
# Scoring & debrief
# -----------------------------------------------------------------------------

def score_session(sess: Session) -> dict:
    sc = by_id(sess.scenario_id)
    s = sess.state
    m = sess.metrics
    lang = sess.lang

    # 1) Economic score: where did we land inside the ZOPA?
    economic = 0
    unit = sc.headline.unit[lang]
    if s.status == "agreement" and s.deal is not None:
        t = sc.player_target
        r = sc.player_reservation
        ratio = (s.deal - r) / (t - r)
        economic = clamp(_js_round(ratio * 100))
        # Печатаем на языке сессии, а не по-джаваскриптовому: разбор и стол
        # обязаны показывать одно и то же число одними и теми же знаками.
        deal_text = format_deal(s.deal, unit, lang)
    elif s.status == "breakdown":
        economic = 0
        deal_text = "Сделка сорвалась" if lang == "ru" else "Deal broke down"
    else:
        economic = 10
        deal_text = "Без соглашения" if lang == "ru" else "No agreement"

    # 2) Relationship score.
    relationship = clamp(_js_round(s.trust - s.tension * 0.6 + 30))

    # 3) Technique score — variety and appropriateness.
    spin_count = len(m.spin_stages)
    avg_arg = (m.arg_quality_sum / m.arg_quality_n) if m.arg_quality_n else 0
    technique = 0
    technique += min(24, spin_count * 8)
    technique += 16 if m.objective_criteria > 0 else 0
    # Первое слово: обоснованный якорь, поставленный ДО цифры оппонента. Приём
    # был в словаре и на чипе под композером, а в счёте не стоил ничего —
    # то есть курс учил тому, чего оценка не видит.
    technique += 6 if m.opening_anchor else 0
    technique += 14 if m.interest_probes > 0 else 0
    technique += 12 if len(s.interests_found) >= len(sc.hidden_interests[lang]) else len(s.interests_found) * 4
    technique += 12 if len(s.tradeoffs_used) > 0 else 0
    technique += 8 if m.empathy > 0 else 0
    technique += _js_round((avg_arg / 100) * 14)
    technique -= m.hostiles * 12
    technique -= max(0, m.threats - 1) * 6
    # Доля партии, ушедшая на повторы. Ход, который уже был, — не приём:
    # без этого один сильный абзац, вставленный одиннадцать раз, набирал
    # столько же флагов техники, сколько живая партия.
    if m.repeat_n:
        technique -= _js_round(20 * (m.repeat_sum / m.repeat_n))
    # Package signal — ONLY for scenarios with a structured logrolling axis, so
    # scoring is byte-identical for scenarios without secondary_issues. Reward
    # trading issues the opponent values (high opp_value) and lightly discount
    # giving away things costly to the player (high player_cost). Folded into
    # technique with a small weight; capped so it can't dominate the dimension.
    if sc.secondary_issues:
        package = 0.0
        for iss in sc.secondary_issues:
            if iss.id in s.terms_conceded:
                package += 10 * iss.opp_value - 6 * iss.player_cost
        technique += clamp(package, -10, 16)
    technique = clamp(_js_round(technique))

    overall = clamp(_js_round(0.4 * economic + 0.25 * relationship + 0.35 * technique))

    grade = (
        "A" if overall >= 85 else
        "B" if overall >= 70 else
        "C" if overall >= 55 else
        "D" if overall >= 40 else
        "F"
    )

    # Technique floor: A/B must be EARNED with method, not bought with a good
    # number. Landing a great price while ignoring interests/criteria/trade-offs
    # (technique < 45) caps the grade at C — the Harvard thesis, not haggling.
    if technique < 45 and grade in ("A", "B"):
        grade = "C"

    tips: list[str] = []

    def T(ru: str, en: str) -> None:
        tips.append(ru if lang == "ru" else en)

    if spin_count < 2:
        T("Задавайте больше вопросов по SPIN (Проблема → Последствия), чтобы вскрыть боль второй стороны.",
          "Ask more SPIN questions (Problem → Implication) to surface the other side's pain.")
    if m.objective_criteria == 0:
        T("Опирайтесь на объективные критерии (рыночные данные, стандарты) — это легитимный рычаг по Гарвардскому методу.",
          "Anchor on objective criteria (market data, standards) — legitimate leverage per the Harvard method.")
    if len(s.interests_found) < len(sc.hidden_interests[lang]):
        T("Вы вскрыли не все скрытые интересы. За позициями всегда стоят интересы — ищите «почему».",
          "You didn't surface every hidden interest. Behind positions lie interests — dig for the \"why\".")
    if m.interest_probes == 0:
        T("Переходите от позиций к интересам: спрашивайте, что и почему важно для оппонента.",
          "Move from positions to interests: ask what matters to them and why.")
    if len(s.tradeoffs_used) == 0:
        T("Создавайте ценность разменом по нескольким вопросам (логроллинг), а не только торгом по цене.",
          "Create value by trading across issues (logrolling), not just haggling on price.")
    if m.empathy == 0:
        T("Используйте активное слушание — отражайте слова оппонента, чтобы снизить напряжение.",
          "Use active listening — paraphrase them to lower tension.")
    if m.threats > 1 or m.hostiles > 0:
        T("Меньше давления и перехода на личности: напряжение замораживает уступки.",
          "Less pressure and personal attacks: tension freezes concessions.")
    if sc.player_batna.strength > 55 and m.move_counts.get("batna", 0) == 0:
        T("У вас была сильная BATNA — стоило её аккуратно упомянуть как рычаг.",
          "You had a strong BATNA — worth citing it carefully as leverage.")
    if len(tips) == 0:
        T("Отличная работа — чистое применение принципиальных переговоров.",
          "Excellent — a clean application of principled negotiation.")

    return {
        "overall": int(overall),
        "grade": grade,
        "economic": int(economic),
        "relationship": int(relationship),
        "technique": int(technique),
        "deal_text": deal_text,
        "status": s.status,
        "interests_found": len(s.interests_found),
        "interests_total": len(sc.hidden_interests[lang]),
        # The curtain-lift: counting "1 of 3" teaches nothing, seeing the two the
        # player never asked about does. Safe to reveal only because the game is
        # over — during play these stay hidden (see views.coach_facts).
        "interests": [
            {"text": txt, "found": i in s.interests_found}
            for i, txt in enumerate(sc.hidden_interests[lang])
        ],
        "spin_stages": spin_count,
        "objective_criteria": m.objective_criteria,
        "empathy": m.empathy,
        "threats": m.threats,
        "hostiles": m.hostiles,
        "tradeoffs": len(s.tradeoffs_used),
        "avg_arg": _js_round(avg_arg),
        "tips": tips,
    }


# -----------------------------------------------------------------------------
# View helpers producing the protocol shapes (StateView / Debrief).
# -----------------------------------------------------------------------------

def _interest_slots(sess: Session) -> list[dict]:
    """Темы стола + тексты УЖЕ вскрытых интересов, по одному слоту на интерес.

    Текст невскрытого не уезжает никуда: `text=None` — это и есть «ещё не
    вскрыто». Текст вскрытого оппонент к этому моменту уже произнёс вслух
    (реакция `opened_up` подставляет его в реплику), так что слот ничего не
    выдаёт сверх сказанного."""
    sc = by_id(sess.scenario_id)
    lang = sess.lang
    ilist = sc.hidden_interests[lang]
    topics = (sc.interest_topics.get(lang) if sc.interest_topics else None) or []
    if not topics:
        # У сгенерированного стола («своя сделка») тем нет — и выдумывать их
        # некому. Пустой список честнее пустых чипов: рельс остаётся счётчиком.
        return []
    found = set(sess.state.interests_found)
    return [
        {"topic": topics[i] if i < len(topics) else "",
         "text": ilist[i] if i in found else None}
        for i in range(len(ilist))
    ]


def to_state_view(sess: Session) -> dict:
    """Public slice of game state (mirrors legacy server.js publicState).

    Note: leverage in the StateView is round(flexibility*100), NOT the raw
    leverage meter — matching the legacy server.
    """
    s = sess.state
    sc = by_id(sess.scenario_id)
    return {
        "trust": _js_round(s.trust),
        "tension": _js_round(s.tension),
        "info": _js_round(s.info),
        "leverage": _js_round(flexibility(sess) * 100),
        "offer_opp": s.offer_opp,
        "offer_player": s.offer_player,
        # The SETTLED price, once there is one. Distinct from offer_opp: the
        # deal closes at the meeting point, not at whatever the opponent last
        # said, so a closing screen reading offer_opp shows a number the deal
        # was never struck at. None while the table is still open.
        "deal": s.deal,
        "interests_found": len(s.interests_found),
        "interests_total": len(sc.hidden_interests[sess.lang]),
        # Занавес, начатый ЗА СТОЛОМ, а не в разборе. Раньше рельс показывал три
        # пустых кружка: счётчик без единой зацепки, по которой можно понять, о
        # чём вообще спрашивать. Тема едет всегда (она не секрет), текст
        # интереса — только у вскрытых: невскрытый несёт None, и второй принцип
        # не даёт клиенту нарисовать то, чего движок ещё не отдал.
        "interests": _interest_slots(sess),
        "terms_conceded": list(s.terms_conceded),
        "status": s.status,
        "turn": sess.turn,
        "max_turns": sess.max_turns,
    }


def to_debrief(sess: Session) -> dict:
    """Produce the Debrief shape from score_session (drops the extra `hostiles`
    field that is not part of the protocol Debrief)."""
    d = score_session(sess)
    return {
        "overall": d["overall"],
        "grade": d["grade"],
        "economic": d["economic"],
        "relationship": d["relationship"],
        "technique": d["technique"],
        "deal_text": d["deal_text"],
        "status": d["status"],
        "interests_found": d["interests_found"],
        "interests_total": d["interests_total"],
        "interests": d["interests"],
        "spin_stages": d["spin_stages"],
        "objective_criteria": d["objective_criteria"],
        "empathy": d["empathy"],
        "threats": d["threats"],
        "tradeoffs": d["tradeoffs"],
        "avg_arg": d["avg_arg"],
        "tips": d["tips"],
    }
