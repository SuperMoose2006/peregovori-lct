"""protocol.py — SHARED CONTRACT between backend and frontend.

Modality-agnostic "turn" protocol carried over WebSocket (REST fallback mirrors
these payloads). The core is always TEXT; voice (STT/TTS) will be edge adapters
that produce/consume `Turn.text` and `Opponent.text` — nothing here changes.

Frontend mirror: frontend/src/types.ts (keep in sync).

Wire format: every message is a JSON object with a `type` discriminator.
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


class StateView(BaseModel):
    """The public slice of game state the client renders."""
    trust: int
    tension: int
    info: int
    leverage: int
    offer_opp: float
    offer_player: Optional[float] = None
    interests_found: int
    interests_total: int
    status: Status
    turn: int
    max_turns: int


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
    spin_stages: int
    objective_criteria: int
    empathy: int
    threats: int
    tradeoffs: int
    avg_arg: int
    tips: list[str] = Field(default_factory=list)


# ---- client -> server -------------------------------------------------------

class StartMsg(BaseModel):
    type: Literal["start"] = "start"
    scenarioId: str
    lang: Lang = "ru"
    mode: Mode = "practice"


class TurnMsg(BaseModel):
    type: Literal["turn"] = "turn"
    text: str


class HintMsg(BaseModel):
    type: Literal["hint"] = "hint"


# ---- server -> client -------------------------------------------------------

class GreetingMsg(BaseModel):
    type: Literal["greeting"] = "greeting"
    sessionId: str
    scenario: ScenarioView
    state: StateView
    text: str  # opponent's opening line


class OpponentDeltaMsg(BaseModel):
    """Streaming chunk of the opponent's reply (token streaming / future TTS)."""
    type: Literal["opponent_delta"] = "opponent_delta"
    chunk: str


class OpponentMsg(BaseModel):
    type: Literal["opponent"] = "opponent"
    text: str
    analysis: Analysis
    deltas: Deltas
    state: StateView


class DebriefMsg(BaseModel):
    type: Literal["debrief"] = "debrief"
    debrief: Debrief


class HintReplyMsg(BaseModel):
    type: Literal["hint"] = "hint"
    text: str


class ErrorMsg(BaseModel):
    type: Literal["error"] = "error"
    message: str
