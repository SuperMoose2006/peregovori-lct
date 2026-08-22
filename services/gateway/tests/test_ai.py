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

from app.ai import build_prompts  # noqa: E402
from app.ai.sanitize import sanitize  # noqa: E402


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


def test_off_returns_none(monkeypatch):
    """`NEGO_AI=off` — облака нет, провайдер молчит, берётся шаблон движка.

    Проверка того, что офлайн-реплика действительно доезжает до клиента, живёт
    в `test_streaming.py` и `test_resilience.py`: там она идёт через
    оркестратор, то есть по настоящему пути.
    """
    import asyncio

    from app.providers.openrouter import chat as orchat

    monkeypatch.setenv("NEGO_AI", "off")
    assert orchat.available() is False
    assert asyncio.run(orchat.complete("s", "u")) is None


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


def test_health_names_the_model_for_every_role():
    """На демо всегда должно быть видно, какой моделью говорит оппонент.

    Раньше это делал `describe_mode()` одной строкой на весь слой. Ролей стало
    пять, и молчаливая подмена любой из них — самый неприятный способ узнать,
    что реплики стали хуже.
    """
    from app.providers.routing import describe

    roles = describe()
    assert set(roles) == {"opponent", "judge", "vision", "reasoning", "asr"}
    assert all(model for model in roles.values())
