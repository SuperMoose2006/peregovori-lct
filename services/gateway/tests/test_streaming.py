"""Tests for the opponent's token stream (app.ai.graph.stream_opponent_sync).

The contract that matters: chunks are RAW and the returned line is SANITIZED, so
a line that fails the guards is rejected even though its text was already sent.
The caller must then use the deterministic fallback — which the WebSocket does by
following every stream with an authoritative `opponent` message.
"""

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.ai import graph  # noqa: E402


class _Streaming:
    def __init__(self, chunks):
        self.chunks = chunks

    def stream(self, system, user):
        for c in self.chunks:
            yield c

    def generate(self, system, user, raw=False):  # pragma: no cover - unused here
        return "".join(self.chunks)


class _NoStream:
    def generate(self, system, user, raw=False):
        return "whatever"


FACTS = {"lang": "ru", "role": "Вы закупщик.", "persona_name": "Ирина",
         "persona_desc": "Опытная.", "offer_opp": 100, "unit": " ₽",
         "trust": 40, "tension": 20, "info": 0, "reaction": "neutral",
         "fallback": "Шаблонная реплика."}


def test_off_backend_has_no_stream():
    """NEGO_AI=off (the test default) — the caller must not try to stream."""
    assert graph.backend_streams() is False


def test_chunks_arrive_in_order_and_the_line_is_joined(monkeypatch):
    seen = []
    monkeypatch.setattr(graph, "get_chat_backend",
                        lambda: _Streaming(["Хорошо, ", "давайте ", "обсудим."]))
    out = graph.stream_opponent_sync(FACTS, seen.append)
    assert seen == ["Хорошо, ", "давайте ", "обсудим."]
    assert out == "Хорошо, давайте обсудим."


def test_a_line_that_fails_the_guards_is_rejected_after_streaming(monkeypatch):
    """The foreign-script guard needs the whole line, so the chunks go out first
    and the verdict comes after. Returning None is what makes the caller send the
    templated line as the authoritative text."""
    seen = []
    monkeypatch.setattr(graph, "get_chat_backend", lambda: _Streaming(["Хорошо, ", "价格 ", "нормально."]))
    assert graph.stream_opponent_sync(FACTS, seen.append) is None
    assert len(seen) == 3  # they WERE sent — hence the mandatory final message


def test_a_backend_without_stream_declines(monkeypatch):
    monkeypatch.setattr(graph, "get_chat_backend", lambda: _NoStream())
    assert graph.stream_opponent_sync(FACTS, lambda c: None) is None


def test_a_stream_that_breaks_midway_falls_back(monkeypatch):
    class _Broken:
        def stream(self, system, user):
            yield "Начал "
            raise RuntimeError("connection reset")

    monkeypatch.setattr(graph, "get_chat_backend", lambda: _Broken())
    seen = []
    assert graph.stream_opponent_sync(FACTS, seen.append) is None
    assert seen == ["Начал "]
