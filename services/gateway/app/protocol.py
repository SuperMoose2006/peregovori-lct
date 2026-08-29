"""protocol.py — общие value objects контракта с фронтендом.

Здесь то, что ходит ВНУТРИ realtime-событий: разбор хода, дельты шкал, срез
состояния, карточка сценария, разбор партии. Зеркало на клиенте —
`frontend/src/types.ts`, менять синхронно.

ЧТО ОТСЮДА УШЛО. Раньше файл описывал сообщения протокола «запрос-ответ»
(`StartMsg`, `TurnMsg`, `OpponentMsg`, `PhaseMsg`…). Ручка `/ws` удалена, и эти
классы вместе с ней: словарь realtime-протокола живёт в `realtime/events.py`,
где его форма — накопление ввода и поток независимых веток вывода — описана
целиком.

`WhatIfMsg` остался: «что-если» — единственное место, где игровая логика идёт
по REST, а не по сессии, потому что это не ход, а контрфактический реплей.
"""

from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field

Lang = Literal["ru", "en"]
Mode = Literal["practice", "campaign", "custom", "exam"]
Status = Literal["active", "agreement", "breakdown"]


# ---- Shared value objects ---------------------------------------------------

class Tag(BaseModel):
    """A detected negotiation technique, shown as a badge on the player's line."""
    key: str  # e.g. "spin", "criteria", "batna", "empathy", "tradeoff", "threat"
    label: str


class Flags(BaseModel):
    hostile: bool = False
    threat: bool = False
    question: bool = False


class Analysis(BaseModel):
    """Result of classifying a player's utterance."""
    tags: list[Tag] = Field(default_factory=list)
    primary: str = "statement"
    arg_quality: int = 0  # 0..100
    spin: Optional[str] = None  # situation|problem|implication|need-payoff
    flags: Flags = Field(default_factory=Flags)


class Deltas(BaseModel):
    """Per-turn change in the four meters (for the flash UI)."""
    trust: float = 0
    tension: float = 0
    info: float = 0
    leverage: float = 0


class InterestSlot(BaseModel):
    """Один скрытый интерес глазами игрока: ТЕМА видна всегда, ТЕКСТ — только
    после вскрытия.

    Тема — область, в которой интерес лежит («производство»), а не он сам
    («стабильная загрузка производства»): игрок знает, где копать, и не знает,
    что там. `text=None` — «ещё не вскрыт», и рисовать вместо него нечего
    (второй принцип). Текст вскрытого оппонент к этому моменту уже произнёс
    вслух."""
    topic: str
    text: Optional[str] = None


class StateView(BaseModel):
    """The public slice of game state the client renders."""
    trust: int
    tension: int
    info: int
    leverage: int
    offer_opp: float
    offer_player: Optional[float] = None
    # Settled price once the deal closes; None while the table is open.
    deal: Optional[float] = None
    interests_found: int
    interests_total: int
    #: Темы стола + тексты уже вскрытых интересов, по слоту на интерес.
    interests: list[InterestSlot] = Field(default_factory=list)
    terms_conceded: list[str] = Field(default_factory=list)  # ids of secondary issues traded so far
    status: Status
    turn: int
    max_turns: int


class SecondaryIssueView(BaseModel):
    """A tradeable secondary issue exposed to the client (label only, no numbers)."""
    id: str
    label: str


class ScenarioView(BaseModel):
    """Localized scenario info for the client (no hidden values leaked)."""
    id: str
    icon: str
    difficulty: int
    title: str
    role: str
    counterpart_name: str
    counterpart_persona: str
    headline_unit: str
    briefing: str
    batna: str
    target: float
    reservation: float
    secondary_issues: list[SecondaryIssueView] = Field(default_factory=list)


class CampaignStageView(BaseModel):
    scenario_id: str
    act: str
    intro: str
    title: str      # scenario title
    icon: str       # scenario icon
    difficulty: int


class CampaignView(BaseModel):
    id: str
    icon: str
    title: str
    tagline: str
    stages: list[CampaignStageView]
    #: Послесловие по полосам репутации: ключ → текст на языке запроса. Едет
    #: целиком, а не одной выбранной строкой, потому что полосу считает клиент
    #: по СВОЕЙ накопленной репутации — сервер её между актами не хранит.
    epilogue: dict[str, str] = {}


class RevealedInterest(BaseModel):
    text: str
    found: bool


class HerSideTurn(BaseModel):
    """Один ход партии, рассказанный ОТ ЛИЦА ОППОНЕНТА.

    Разбор до сих пор говорил, ЧТО случилось. Здесь — почему: та же хроника
    движка, но с той стороны стола. Всё поле собрано детерминированно из
    `engine.Session.ledger`; ИИ тут не участвует ни на одном шаге, поэтому
    колонка целиком есть и офлайн (инвариант 5).
    """
    turn: int
    quote: str            # реплика игрока, как он её написал (обрезана)
    said: str             # что происходило у НЕЁ — от первого лица, её словами
    meters: list[str] = Field(default_factory=list)  # «Доверие +8», «Цена 100 → 98»
    tone: str             # good | bad | flat — только для оформления


class HerSide(BaseModel):
    """Колонка «с той стороны стола» целиком: кто говорит, ход за ходом, и чего
    игрок так и не узнал. `missed` НЕ дублирует занавес разбора (там — список
    интересов), а связывает его с ходами: объясняет, почему они не открылись."""
    name: str                                    # имя персоны ЭТОГО стола
    turns: list[HerSideTurn] = Field(default_factory=list)
    missed: str                                  # «Чего вы так и не узнали: …»
    ask: str = ""                                # реплика, которая открыла бы это


class Debrief(BaseModel):
    overall: int
    grade: str  # A|B|C|D|F
    economic: int
    relationship: int
    technique: int
    deal_text: str
    status: Status
    interests_found: int
    interests_total: int
    # Every hidden interest with whether the player drew it out — the debrief's
    # reveal. Deterministic; present offline too.
    interests: list[RevealedInterest] = Field(default_factory=list)
    spin_stages: int
    objective_criteria: int
    empathy: int
    threats: int
    tradeoffs: int
    avg_arg: int
    tips: list[str] = Field(default_factory=list)
    # The AI mentor's closing word. Present only when a live backend produced it;
    # the deterministic tips above always stand on their own, so the client must
    # render a complete debrief without any of these three.
    ai_verdict: Optional[str] = None
    ai_strength: Optional[str] = None
    ai_growth: Optional[str] = None
    # «С той стороны стола» — ход за ходом глазами оппонента. Детерминированно,
    # из хроники движка; ключа нет только там, где партия не сделала ни хода.
    her_side: Optional[HerSide] = None


# ---- client -> server -------------------------------------------------------

class CourseCoachMsg(BaseModel):
    """REST-тело для комментария тренера к свободному ответу в курсе.

    ВАЖНО: зачёт этим не решается. Верно/неверно уже посчитал движок на клиенте
    тем же предикатом, что и на сервере; сюда приходит только текст ответа, чтобы
    ИИ добавил одну конкретную подсказку. Судья выключен или недоступен → ответ
    пустой, и упражнение работает ровно как раньше (инвариант офлайна).
    """
    exerciseId: str
    text: str
    lang: Lang = "ru"
    #: Что решил движок. Зачёт считает КЛИЕНТ тем же предикатом, что и сервер, и
    #: присылает результат сюда — не для того, чтобы тренер его пересмотрел, а
    #: чтобы он его ОБЪЯСНИЛ. Без этого поля тренер оценивал реплику как реплику,
    #: пока предикат валил её как ответ на задание, и экран показывал «Не то»
    #: рядом с «отличный размен».
    ok: Optional[bool] = None


class WhatIfMsg(BaseModel):
    """REST body for the deterministic "А что если…" replay.

    The client (holding a finished game's transcript) sends the player's actual
    lines in order plus ONE turn to branch and an alternative line. The server
    re-runs that pivotal turn both ways on fresh deterministic sessions and
    returns the divergence — no LLM, so it's instant and reproducible.
    """
    scenarioId: str
    lang: Lang = "ru"
    moves: list[str] = Field(default_factory=list)  # player's actual lines, in order
    turnIndex: int                                   # 0-based move to replace
    altText: str                                     # the "what if I'd said…" line
