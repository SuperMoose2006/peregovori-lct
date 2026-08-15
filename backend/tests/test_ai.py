"""Tests for the AI dialogue layer (app.ai).

Boundary under test: this layer produces ONLY the opponent's spoken line and
returns None on any error/timeout so the caller uses the engine's templated
fallback. It never computes game state or scoring.
"""

import os
import shutil
import sys
from pathlib import Path

import pytest

# Make `app` importable without installing the backend as a package.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.ai import build_prompts, describe_mode, run_opponent_sync  # noqa: E402
from app.ai.chat_models import get_chat_backend, sanitize  # noqa: E402


RU_FACTS = {
    "lang": "ru",
    "persona_name": "Марина Соколова",
    "persona_desc": "жёсткий закупщик, ценит цифры и уважение",
    "offer_opp": 4500000.0,
    "unit": "₽",
    "mood": "под давлением, насторожен",
    "status": "active",
    "player_text": "Давайте обсудим объёмы и сроки.",
    "fallback": "Пока не вижу причин двигаться по цене.",
}

EN_FACTS = {
    "lang": "en",
    "persona_name": "Marina Sokolova",
    "persona_desc": "a hard buyer who values numbers and respect",
    "offer_opp": 4500000.0,
    "unit": "$",
    "mood": "under pressure, wary",
    "status": "active",
    "player_text": "Let's talk about volume and timelines.",
    "fallback": "I don't see a reason to move on price yet.",
}


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    # Each test controls NEGO_AI explicitly; start from a clean default.
    monkeypatch.delenv("NEGO_AI", raising=False)
    yield


def test_off_returns_none_fast():
    """Default / off backend: no AI, returns None so the fallback is used."""
    assert os.environ.get("NEGO_AI") is None
    assert get_chat_backend().generate("s", "u") is None
    assert run_opponent_sync(RU_FACTS) is None


def test_off_explicit_returns_none(monkeypatch):
    monkeypatch.setenv("NEGO_AI", "off")
    assert run_opponent_sync(EN_FACTS) is None


def test_ru_prompt_contains_offer_and_mood():
    system, user = build_prompts(RU_FACTS)
    # Offer number rendered cleanly (no float noise, no scientific notation).
    assert "4500000" in system
    assert "4500000.0" not in system
    assert RU_FACTS["mood"] in system
    assert RU_FACTS["unit"] in system
    assert "СОГЛАСИЕ" not in system  # status is active, not agreement
    # Turn context carries the player's line and the engine reaction to rephrase.
    assert RU_FACTS["player_text"] in user
    assert RU_FACTS["fallback"] in user


def test_en_prompt_contains_offer_and_mood():
    system, user = build_prompts(EN_FACTS)
    assert "4500000" in system
    assert EN_FACTS["mood"] in system
    assert "counterpart" in system.lower()
    assert EN_FACTS["player_text"] in user


def test_status_phrases_reflected_in_prompt():
    agreed = dict(RU_FACTS, status="agreement")
    broken = dict(EN_FACTS, status="breakdown")
    assert "СОГЛАСИЕ достигнуто" in build_prompts(agreed)[0]
    assert "talks broke down" in build_prompts(broken)[0]


def test_sanitize_strips_quotes_markdown_and_noise():
    raw = 'Warning: something\n**"Мы не двинемся по цене."**'
    out = sanitize(raw)
    assert out == "Мы не двинемся по цене."


def test_sanitize_empty_returns_none():
    assert sanitize("") is None
    assert sanitize(None) is None
    assert sanitize("   \n  ") is None


def test_sanitize_caps_length():
    out = sanitize("слово " * 200)
    assert out is not None
    assert len(out) <= 401  # MAX_LEN + ellipsis


def test_describe_mode_for_each_backend(monkeypatch):
    monkeypatch.setenv("NEGO_AI", "off")
    assert describe_mode().startswith("off")
    monkeypatch.setenv("NEGO_AI", "cli")
    assert describe_mode().startswith("cli")
    monkeypatch.setenv("NEGO_AI", "api")
    assert describe_mode().startswith("api")


@pytest.mark.skipif(
    shutil.which("claude") is None,
    reason="claude CLI not available; skipping live bridge smoke test",
)
def test_cli_smoke_generates_line(monkeypatch):
    """Best-effort live check that the CLI bridge yields a short in-character line."""
    monkeypatch.setenv("NEGO_AI", "cli")
    monkeypatch.setenv("NEGO_MODEL", "claude-haiku-4-5-20251001")
    monkeypatch.setenv("NEGO_AI_TIMEOUT", "60")
    line = run_opponent_sync(EN_FACTS)
    # The bridge may still return None (offline/quota); only assert shape if present.
    if line is not None:
        assert isinstance(line, str)
        assert 0 < len(line) <= 401
