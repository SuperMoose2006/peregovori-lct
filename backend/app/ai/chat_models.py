"""chat_models.py — LangChain-compatible chat backends, selected by env NEGO_AI.

One narrow interface — `.generate(system, user) -> str | None` — with three
implementations chosen at call time (so tests can flip env between calls):

    off  -> returns None (the caller falls back to the engine's templated line).
            This is the DEFAULT: the simulator must be fully playable with no AI.
    cli  -> wraps the local `claude` CLI: `claude -p --model <NEGO_MODEL>
            --output-format text`, prompt fed on stdin, with a timeout. This is
            the "local API" for development without an API key.
    api  -> langchain_anthropic.ChatAnthropic (production, ANTHROPIC_API_KEY).
            Degrades to None (never crashes on import) if the package or key is
            missing.

CLI/tmux specifics stay INSIDE this module — nothing leaks to the graph. Any
error/timeout/non-zero exit becomes None: the opponent line is cosmetic flavor
and can never change the deterministic outcome.
"""

from __future__ import annotations

import os
import re
import subprocess
import tempfile
from typing import Optional

# Output cap (chars) — mirrors legacy sanitize; keeps a reply to a couple lines.
MAX_LEN = 400

# Markers that betray the CLI answering as an assistant instead of the character.
# Specific multi-word phrases only, to avoid flagging legitimate negotiation lines.
_BREAK_MARKERS = (
    "я специализируюсь", "как ии", "как искусственный интеллект", "как языковая модель",
    "виртуальный ассистент", "чем могу помочь", "как ассистент", "я — ии", "я ии,",
    "as an ai", "i'm an ai", "i am an ai", "language model", "i cannot assist",
    "i'm claude", "i am claude", "i specialize in", "how can i help", "as an assistant",
)

# `claude -p` must run in a NEUTRAL directory: if it runs inside this repo it
# loads the project CLAUDE.md + skills and answers as "Claude Code working on
# the project" instead of as our role-play/generation prompt (and is far slower).
# One throwaway empty dir, created lazily and reused.
_CLI_CWD: Optional[str] = None


def _cli_cwd() -> str:
    global _CLI_CWD
    if _CLI_CWD is None:
        _CLI_CWD = tempfile.mkdtemp(prefix="nego-cli-")
    return _CLI_CWD


def _model() -> str:
    return os.environ.get("NEGO_MODEL", "claude-sonnet-5")


def _timeout() -> float:
    try:
        return float(os.environ.get("NEGO_AI_TIMEOUT", "30"))
    except ValueError:
        return 30.0


def sanitize(text: Optional[str]) -> Optional[str]:
    """Strip CLI noise / markdown / wrapping quotes and cap length.

    Returns a clean single-paragraph line, or None if nothing usable remains.
    """
    if not text:
        return None
    s = text.replace("\r", "").strip()

    # Drop obvious non-dialogue lines (CLI warnings, notes, bracketed banners).
    good = []
    for line in s.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        if re.match(r"^(warning|note|error|\[)", stripped, re.IGNORECASE):
            continue
        good.append(stripped)
    s = " ".join(good).strip()

    # Strip markdown: code fences, inline emphasis/backticks, headers, blockquotes.
    s = s.replace("```", "")
    s = re.sub(r"[*_`]{1,3}", "", s)
    s = re.sub(r"^\s*#{1,6}\s*", "", s)
    s = re.sub(r"^\s*>+\s*", "", s)

    # Strip a single layer of wrapping quotes the model may add around the line.
    s = s.strip().strip("\"'«»").strip()
    if not s:
        return None

    # Reject "assistant-persona" breaks: the CLI is an assistant and sometimes
    # answers out of character. Better to fall back to the engine's in-character
    # templated line than show the opponent breaking the fourth wall.
    low = s.lower()
    if any(mk in low for mk in _BREAK_MARKERS):
        return None

    if len(s) > MAX_LEN:
        s = re.sub(r"\s+\S*$", "", s[:MAX_LEN]) + "…"
    return s or None


# ---- backends ---------------------------------------------------------------

class OffBackend:
    """No AI: always None so the caller uses the engine's templated fallback."""

    def generate(self, system: str, user: str, raw: bool = False) -> Optional[str]:
        return None

    def describe_mode(self) -> str:
        return "off — AI disabled; caller uses the engine's templated fallback"


class CliBackend:
    """Wraps the local `claude` CLI as a 'local API' (no API key needed)."""

    def generate(self, system: str, user: str, raw: bool = False) -> Optional[str]:
        # `--system-prompt` REPLACES Claude Code's default agent system prompt,
        # so the globally-installed skills/plugins and user memory can't leak in
        # (otherwise the CLI sometimes answers as "Claude Code" — e.g. classifies
        # the task as "Bounded" — instead of our role/generation prompt). The
        # user turn is fed on stdin. raw=True skips sanitize (structured/JSON).
        model = re.sub(r"[^a-zA-Z0-9._-]", "", _model())  # whitelist: no arg injection
        # Structured (raw) generation is a heavier task → allow more time. Short
        # opponent lines get a tight cap so a slow/throttled CLI falls back to the
        # instant templated line fast, instead of stalling the turn.
        timeout = max(_timeout(), 90.0) if raw else min(_timeout(), 18.0)
        # For short opponent lines, --effort low suppresses Claude Code's extended
        # thinking (the dominant per-call cost) → ~6-7s and far more consistent.
        # Scenario generation (raw) keeps default effort for quality.
        effort = [] if raw else ["--effort", "low"]
        try:
            proc = subprocess.run(
                # --setting-sources "" loads NO CLAUDE.md / skills / plugins / hooks
                # (OAuth creds live elsewhere, so auth still works). Together with
                # --system-prompt this fully isolates the call from the dev's
                # global Claude Code environment → no context leak, and faster.
                ["claude", "-p", "--model", model, "--output-format", "text",
                 "--setting-sources", "", "--system-prompt", system, *effort],
                input=user,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=_cli_cwd(),  # neutral dir: don't load the project's CLAUDE.md/skills
            )
        except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
            return None
        if proc.returncode != 0:
            return None
        return proc.stdout.strip() if raw else sanitize(proc.stdout)

    def describe_mode(self) -> str:
        return f"cli — local `claude -p` (model={_model()}, timeout={_timeout():g}s)"


class ApiBackend:
    """langchain_anthropic.ChatAnthropic for production; degrades to None."""

    def __init__(self) -> None:
        self._reason: Optional[str] = None
        self._llm = None
        if not os.environ.get("ANTHROPIC_API_KEY"):
            self._reason = "ANTHROPIC_API_KEY not set"
            return
        try:
            from langchain_anthropic import ChatAnthropic
        except Exception:
            self._reason = "langchain_anthropic not installed"
            return
        try:
            # max_tokens keeps replies to a short line (legacy used 120).
            self._llm = ChatAnthropic(model=_model(), max_tokens=200, timeout=_timeout())
        except Exception as exc:  # pragma: no cover - defensive
            self._reason = f"ChatAnthropic init failed: {exc}"

    @property
    def available(self) -> bool:
        return self._llm is not None

    def generate(self, system: str, user: str, raw: bool = False) -> Optional[str]:
        if self._llm is None:
            return None
        try:
            from langchain_core.messages import SystemMessage, HumanMessage

            # raw=True needs room for a full JSON scenario and skips sanitize.
            llm = self._llm.bind(max_tokens=1024) if raw else self._llm
            resp = llm.invoke(
                [SystemMessage(content=system), HumanMessage(content=user)]
            )
            content = getattr(resp, "content", None)
            # ChatAnthropic content is usually a str, but can be a list of blocks.
            if isinstance(content, list):
                content = "".join(
                    b.get("text", "") if isinstance(b, dict) else str(b) for b in content
                )
            return (content or "").strip() if raw else sanitize(content)
        except Exception:
            return None

    def describe_mode(self) -> str:
        if self.available:
            return f"api — ChatAnthropic (model={_model()})"
        return f"api — unavailable ({self._reason}); returns None"


def _openai_model() -> str:
    """OpenAI model id; defaults to the cheapest (gpt-5-nano). NEGO_MODEL wins
    only if it actually names a gpt/o-series model, so a global claude default
    doesn't bleed into the OpenAI backend."""
    m = os.environ.get("NEGO_OPENAI_MODEL") or os.environ.get("NEGO_MODEL", "")
    return m if (m.startswith("gpt") or m.startswith("o")) else "gpt-5-nano"


class OpenAIBackend:
    """langchain_openai.ChatOpenAI — cheapest-model default. Degrades to None
    (never crashes on import) if the package or OPENAI_API_KEY is missing."""

    def __init__(self) -> None:
        self._reason: Optional[str] = None
        self._llm = None
        if not os.environ.get("OPENAI_API_KEY"):
            self._reason = "OPENAI_API_KEY not set"
            return
        try:
            from langchain_openai import ChatOpenAI
        except Exception:
            self._reason = "langchain_openai not installed"
            return
        try:
            self._llm = ChatOpenAI(model=_openai_model(), timeout=_timeout())
        except Exception as exc:  # pragma: no cover - defensive
            self._reason = f"ChatOpenAI init failed: {exc}"

    @property
    def available(self) -> bool:
        return self._llm is not None

    def generate(self, system: str, user: str, raw: bool = False) -> Optional[str]:
        if self._llm is None:
            return None
        try:
            from langchain_core.messages import SystemMessage, HumanMessage

            # A short line normally; room for a full JSON scenario when raw.
            llm = self._llm.bind(max_tokens=1024) if raw else self._llm.bind(max_tokens=200)
            resp = llm.invoke([SystemMessage(content=system), HumanMessage(content=user)])
            content = getattr(resp, "content", None)
            if isinstance(content, list):
                content = "".join(
                    b.get("text", "") if isinstance(b, dict) else str(b) for b in content
                )
            return (content or "").strip() if raw else sanitize(content)
        except Exception:
            return None

    def describe_mode(self) -> str:
        if self.available:
            return f"openai — ChatOpenAI (model={_openai_model()})"
        return f"openai — unavailable ({self._reason}); returns None"


class SdkBackend:
    """Claude Agent SDK — the supported programmatic Claude Code client (vs
    shelling out to `claude -p`). Wins over CliBackend: native setting_sources=[]
    isolation, direct thinking control (max_thinking_tokens=0 / effort=low) which
    was the latency bottleneck, and a clean async/streaming API. Still runs the
    Claude Code engine (subscription rate limits apply). Degrades to None on any
    error so the opponent falls back to the engine's templated line."""

    def __init__(self) -> None:
        self._reason: Optional[str] = None
        try:
            import claude_agent_sdk  # noqa: F401
        except Exception:
            self._reason = "claude-agent-sdk not installed"

    @property
    def available(self) -> bool:
        return self._reason is None

    def _options(self, system: str):
        from claude_agent_sdk import ClaudeAgentOptions
        base = dict(
            system_prompt=system,
            allowed_tools=[],          # no tools → leaner, no tool-thinking
            max_turns=1,
            model=re.sub(r"[^a-zA-Z0-9._-]", "", _model()),
            setting_sources=[],        # native isolation: no CLAUDE.md/skills/plugins
        )
        # Thinking is the dominant per-call cost; kill it for short lines. Guard
        # each option so an SDK version without a field can't break construction.
        for extra in ({"max_thinking_tokens": 0, "effort": "low"}, {"effort": "low"}, {}):
            try:
                return ClaudeAgentOptions(**base, **extra)
            except TypeError:
                continue
        return ClaudeAgentOptions(**base)

    async def _agenerate(self, system: str, user: str) -> Optional[str]:
        import asyncio
        from claude_agent_sdk import query, AssistantMessage
        text = ""

        async def run():
            nonlocal text
            async for msg in query(prompt=user, options=self._options(system)):
                if isinstance(msg, AssistantMessage):
                    for b in msg.content:
                        t = getattr(b, "text", None)
                        if t:
                            text += t

        await asyncio.wait_for(run(), timeout=_timeout())
        return text.strip() or None

    def generate(self, system: str, user: str, raw: bool = False) -> Optional[str]:
        if not self.available:
            return None
        try:
            import asyncio
            out = asyncio.run(self._agenerate(system, user))  # called in a worker thread
        except Exception:
            return None
        if not out:
            return None
        return out if raw else sanitize(out)

    def describe_mode(self) -> str:
        if self.available:
            return f"sdk — Claude Agent SDK (model={_model()}, thinking off)"
        return f"sdk — unavailable ({self._reason}); returns None"


def get_chat_backend():
    """Return the backend selected by env NEGO_AI (default 'off').

    Read fresh each call so env changes (and tests) take effect immediately.
    """
    mode = os.environ.get("NEGO_AI", "off").strip().lower()
    if mode == "cli":
        return CliBackend()
    if mode == "sdk":
        return SdkBackend()
    if mode == "api":
        return ApiBackend()
    if mode == "openai":
        return OpenAIBackend()
    return OffBackend()


def describe_mode() -> str:
    """Human-readable description of the currently selected backend."""
    return get_chat_backend().describe_mode()
