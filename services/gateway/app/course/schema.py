"""Формы курса на проводе и при генерации офлайн-банка.

Схемы проверяют структуру и ссылки ответов. Правильность учебного ответа
по-прежнему доказывают тесты настоящего движка, а не Pydantic.
"""
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, model_validator


class CourseModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class Localized(CourseModel):
    ru: str = Field(min_length=1)
    en: str = Field(min_length=1)


class KeyedOption(Localized):
    key: str = Field(min_length=1)


class NamedItem(Localized):
    id: str = Field(min_length=1)


class ExerciseBase(CourseModel):
    id: str = Field(min_length=1)
    block: str | None = None
    lesson: int | None = Field(default=None, ge=1)
    difficulty: int | None = Field(default=None, ge=1)
    xp: int = Field(ge=0)
    prompt: Localized
    explain: Localized
    scenario_id: str | None = None


class ChoiceExercise(ExerciseBase):
    type: Literal["choice"]
    options: list[Localized | KeyedOption] = Field(min_length=2)
    answer: int = Field(ge=0)
    expect_moves: list[str] | None = None

    @model_validator(mode="after")
    def answer_exists(self):
        if self.answer >= len(self.options):
            raise ValueError("answer must index an option")
        return self


class SpotErrorExercise(ExerciseBase):
    type: Literal["spot_error"]
    options: list[KeyedOption] = Field(min_length=2)
    answer: int = Field(ge=0)
    bad_line: Localized
    fault_key: str

    @model_validator(mode="after")
    def fault_exists(self):
        keys = [o.key for o in self.options]
        if len(set(keys)) != len(keys):
            raise ValueError("option keys must be unique")
        if self.answer >= len(keys) or keys[self.answer] != self.fault_key:
            raise ValueError("answer must identify fault_key")
        return self


class OrderExercise(ExerciseBase):
    type: Literal["order"]
    items: list[NamedItem] = Field(min_length=2)
    answer: list[str] = Field(min_length=2)

    @model_validator(mode="after")
    def permutation(self):
        ids = [i.id for i in self.items]
        if len(set(ids)) != len(ids) or sorted(ids) != sorted(self.answer):
            raise ValueError("answer must be a permutation of unique item IDs")
        return self


class MatchExercise(ExerciseBase):
    type: Literal["match"]
    left: list[NamedItem] = Field(min_length=1)
    right: list[NamedItem] = Field(min_length=1)
    answer: dict[str, str]

    @model_validator(mode="after")
    def bijection(self):
        left, right = [i.id for i in self.left], [i.id for i in self.right]
        if (len(set(left)) != len(left) or len(set(right)) != len(right)
                or set(self.answer) != set(left)
                or sorted(self.answer.values()) != sorted(right)):
            raise ValueError("answer must bijectively match the two sets of IDs")
        return self


class NumericAnswer(CourseModel):
    value: float
    tolerance: float = Field(ge=0)


class NumericExercise(ExerciseBase):
    type: Literal["numeric"]
    answer: NumericAnswer
    unit: Localized
    derive: str | None = None


class FreeformCheck(CourseModel):
    require_moves: list[str] | None = None
    require_any: list[str] | None = None
    forbid_moves: list[str] | None = None
    min_arg: int | None = Field(default=None, ge=0, le=100)
    min_words: int | None = Field(default=None, ge=0)
    require_number: bool | None = None
    require_secondary: str | None = None


class FreeformExercise(ExerciseBase):
    type: Literal["freeform"]
    check: FreeformCheck
    reference: Localized


Reaction = Literal["walked_out", "offended", "hardened", "pressured", "not_yet",
                   "neutral", "collaborated", "persuaded", "opened_up", "warmed", "probe_vague"]
Meter = Literal["trust", "tension", "info", "leverage"]


class ExerciseState(CourseModel):
    trust: float = Field(ge=0, le=100)
    tension: float = Field(ge=0, le=100)
    info: float = Field(ge=0, le=100)
    leverage: float = Field(ge=0, le=100)
    turn: int = Field(ge=0)


class SimulatedExercise(ExerciseBase):
    scenario_id: str = Field(min_length=1)
    player_line: Localized
    opponent_line: Localized | None = None
    seed_turn: int | None = Field(default=None, ge=0)
    state: ExerciseState | None = None


class ReactionExercise(SimulatedExercise):
    type: Literal["reaction"]
    answer: Reaction


class MetersExercise(SimulatedExercise):
    type: Literal["meters"]
    ask: Literal["largest_delta", "reaction", "sign_of:trust", "sign_of:tension",
                 "sign_of:info", "sign_of:leverage"] = "largest_delta"
    answer: Meter | Reaction | Literal["up", "down", "flat"]

    @model_validator(mode="after")
    def answer_matches_question(self):
        if self.ask == "largest_delta":
            allowed = {"trust", "tension", "info", "leverage"}
        elif self.ask == "reaction":
            from typing import get_args
            allowed = set(get_args(Reaction))
        else:
            allowed = {"up", "down", "flat"}
        if self.answer not in allowed:
            raise ValueError("answer does not match ask")
        return self


class FaceExercise(ExerciseBase):
    type: Literal["face"]
    scenario_id: str = Field(min_length=1)
    answer: Reaction


class PassCondition(CourseModel):
    field: Literal["status", "deal", "interests_found", "tension", "trust", "info",
                   "leverage", "turn", "terms_conceded", "offer_opp", "offer_player"]
    op: Literal["==", "!=", ">=", "<=", ">", "<"]
    value: float | str

    @model_validator(mode="after")
    def comparable(self):
        if self.field == "status":
            if self.op not in ("==", "!=") or self.value not in ("active", "agreement", "breakdown"):
                raise ValueError("status requires equality with a known status")
        elif isinstance(self.value, str):
            raise ValueError("numeric engine fields require numeric values")
        return self


class DrillExercise(ExerciseBase):
    type: Literal["drill"]
    scenario_id: str = Field(min_length=1)
    max_turns: int = Field(ge=1)
    goal: Localized
    pass_conditions: list[PassCondition] = Field(alias="pass", min_length=1)


CourseExercise = Annotated[
    ChoiceExercise | SpotErrorExercise | OrderExercise | MatchExercise |
    NumericExercise | FreeformExercise | ReactionExercise | MetersExercise |
    FaceExercise | DrillExercise,
    Field(discriminator="type"),
]
COURSE_EXERCISE = TypeAdapter(CourseExercise)
