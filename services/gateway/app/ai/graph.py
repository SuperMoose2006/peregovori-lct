"""graph.py — the opponent's turn as a LangGraph StateGraph.

Even though generating one line is logically a single step, we model it as a real
graph on purpose: this is the extension point for future multi-step opponent
reasoning (e.g. plan -> draft -> self-check) without touching callers. The graph
is backend-agnostic — swapping NEGO_AI (off | cli | api) never changes the graph.

Flow:  START -> build_prompt -> generate -> END

Contract: `run_opponent(facts) -> str | None`. None on ANY problem, so the caller
falls back to the engine's templated line. This layer never touches game state.
"""

from __future__ import annotations

from typing import Optional, TypedDict

from langgraph.graph import StateGraph, START, END

from .prompts import build_prompts
from .chat_models import get_chat_backend, sanitize


class OpponentState(TypedDict, total=False):
    facts: dict           # input: plain facts dict (decoupled from the engine)
    system: str           # built system prompt
    user: str             # built turn/user prompt
    line: Optional[str]   # output: the in-character line, or None for fallback


def _build_prompt_node(state: OpponentState) -> dict:
    system, user = build_prompts(state["facts"])
    return {"system": system, "user": user}


def _generate_node(state: OpponentState) -> dict:
    backend = get_chat_backend()
    try:
        raw = backend.generate(state.get("system", ""), state.get("user", ""))
    except Exception:
        # Backends already swallow their own errors, but never let the graph raise.
        raw = None
    return {"line": sanitize(raw)}


_compiled_graph = None


def _graph():
    """Compile the graph once and reuse it (nodes are stateless)."""
    global _compiled_graph
    if _compiled_graph is None:
        g = StateGraph(OpponentState)
        g.add_node("build_prompt", _build_prompt_node)
        g.add_node("generate", _generate_node)
        g.add_edge(START, "build_prompt")
        g.add_edge("build_prompt", "generate")
        g.add_edge("generate", END)
        _compiled_graph = g.compile()
    return _compiled_graph


async def run_opponent(facts: dict) -> Optional[str]:
    """Async: run the opponent turn graph. Returns the line or None (fallback)."""
    try:
        result = await _graph().ainvoke({"facts": facts})
    except Exception:
        return None
    return result.get("line")


def run_opponent_sync(facts: dict) -> Optional[str]:
    """Sync wrapper for non-async callers."""
    try:
        result = _graph().invoke({"facts": facts})
    except Exception:
        return None
    return result.get("line")


def backend_streams() -> bool:
    """Whether the configured backend can produce a token stream at all."""
    return hasattr(get_chat_backend(), "stream")


def stream_opponent_sync(facts: dict, on_chunk) -> Optional[str]:
    """Stream the opponent's line, calling `on_chunk(text)` per token, and return
    the SANITIZED whole line (or None to fall back).

    This deliberately bypasses the compiled graph. LangGraph's streaming is about
    node-level events, and this graph is a single generate node — wrapping a token
    stream in it would add a layer without adding a step. The prompt building is
    the shared part, and that is reused directly. When the graph grows real steps
    (plan -> draft -> self-check), only the final step streams, and that is where
    this hook moves.

    The chunks are RAW: `sanitize()` judges the whole line and may reject it. The
    caller must therefore always follow the stream with the authoritative text —
    the client replaces the streamed bubble with it.
    """
    backend = get_chat_backend()
    stream = getattr(backend, "stream", None)
    if stream is None:
        return None
    try:
        system, user = build_prompts(facts)
        parts: list[str] = []
        for chunk in stream(system, user):
            parts.append(chunk)
            on_chunk(chunk)
        return sanitize("".join(parts))
    except Exception:
        return None
