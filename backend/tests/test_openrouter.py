"""Tests for the OpenAI-compatible backend when it points at a gateway
(OpenRouter) instead of api.openai.com, plus the guards the cheap-model
bake-off forced us to add (see docs/model-bakeoff.md).

No network: everything here is env resolution and pure text guards.
"""

import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.ai.chat_models import (  # noqa: E402
    _OPENROUTER_DEFAULT_MODEL, _openai_base_url, _openai_fallbacks, _openai_model, sanitize,
)
from app.ai.judge import TECHNIQUES_RU, _clean_techniques  # noqa: E402


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for k in ("NEGO_MODEL", "NEGO_OPENAI_MODEL", "NEGO_OPENAI_BASE_URL",
              "OPENAI_BASE_URL", "NEGO_OPENAI_FALLBACKS"):
        monkeypatch.delenv(k, raising=False)
    yield


def test_plain_openai_keeps_cheapest_gpt_default():
    assert _openai_base_url() is None
    assert _openai_model() == "gpt-5-nano"
    assert _openai_fallbacks() == []


def test_claude_model_does_not_bleed_into_openai(monkeypatch):
    """A global NEGO_MODEL naming a Claude model must not be sent to OpenAI."""
    monkeypatch.setenv("NEGO_MODEL", "claude-sonnet-5")
    assert _openai_model() == "gpt-5-nano"


def test_openrouter_default_and_fallbacks(monkeypatch):
    monkeypatch.setenv("OPENAI_BASE_URL", "https://openrouter.ai/api/v1")
    assert _openai_model() == _OPENROUTER_DEFAULT_MODEL
    fb = _openai_fallbacks()
    assert fb and _OPENROUTER_DEFAULT_MODEL not in fb  # no pointless self-retry


def test_openrouter_accepts_vendor_slash_model_from_nego_model(monkeypatch):
    """On a gateway the ids are `vendor/model`; that shape is served here."""
    monkeypatch.setenv("OPENAI_BASE_URL", "https://openrouter.ai/api/v1")
    monkeypatch.setenv("NEGO_MODEL", "qwen/qwen3-30b-a3b-instruct-2507")
    assert _openai_model() == "qwen/qwen3-30b-a3b-instruct-2507"
    monkeypatch.setenv("NEGO_MODEL", "claude-sonnet-5")  # not servable there
    assert _openai_model() == _OPENROUTER_DEFAULT_MODEL


def test_explicit_model_and_fallbacks_win(monkeypatch):
    monkeypatch.setenv("OPENAI_BASE_URL", "https://openrouter.ai/api/v1")
    monkeypatch.setenv("NEGO_OPENAI_MODEL", "some/other-model")
    monkeypatch.setenv("NEGO_OPENAI_FALLBACKS", "a/b, c/d")
    assert _openai_model() == "some/other-model"
    assert _openai_fallbacks() == ["a/b", "c/d"]


def test_foreign_script_reply_is_rejected():
    """Cheap multilingual models drop CJK mid-sentence; the templated persona
    line is better than a garbled one, so sanitize() must refuse it."""
    assert sanitize("Да, для нас — 携手守护, и мы идём навстречу.") is None
    assert sanitize("Мы готовы обсудить объём.") == "Мы готовы обсудить объём."


def test_judge_techniques_are_whitelisted():
    """Free-form labels reach the judge-cam chips, so only the closed
    vocabulary survives — and duplicates collapse."""
    got = _clean_techniques(
        ["вскрытие интересов", "интерrogация", "  РАЗМЕН  ", "вскрытие интересов"], "ru")
    assert got == ["вскрытие интересов", "размен"]
    assert all(t in TECHNIQUES_RU for t in got)
    assert _clean_techniques(None, "ru") == []
