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
    # The AI mentor's closing word. Present only when a live backend produced it;
    # the deterministic tips above always stand on their own, so the client must
    # render a complete debrief without any of these three.
    ai_verdict: Optional[str] = None
    ai_strength: Optional[str] = None
    ai_growth: Optional[str] = None


# ---- client -> server -------------------------------------------------------

class StartMsg(BaseModel):
    type: Literal["start"] = "start"
    scenarioId: str = ""          # empty for mode="custom" (scenario is generated)
    lang: Lang = "ru"
    mode: Mode = "practice"
    situation: Optional[str] = None  # free-text for mode="custom" scenario generation
    reputation: Optional[float] = None  # campaign carry (-100..100): nudges initial trust


class TurnMsg(BaseModel):
    type: Literal["turn"] = "turn"
    text: str


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
    # A ready-to-send line the player can drop straight into the composer.
    # Present only when the AI coach produced one; the deterministic hint has
    # no worked example, so the client must render fine without it.
    line: Optional[str] = None


class ErrorMsg(BaseModel):
    type: Literal["error"] = "error"
    message: str
