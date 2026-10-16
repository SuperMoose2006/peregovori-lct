"""Process-local provider counters and JSON journal records; never log payloads."""
from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
from collections import Counter

import httpx

_log = logging.getLogger("dialog.providers")
_log.setLevel(logging.INFO)
if not _log.hasHandlers():
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(message)s"))
    _log.addHandler(_handler)

_lock = threading.Lock()
_counts: Counter = Counter()


def error_kind(exc: BaseException) -> str:
    if isinstance(exc, (TimeoutError, httpx.TimeoutException)):
        return "timeout"
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        return "http_429" if status == 429 else "http_5xx" if status >= 500 else "http_4xx"
    if isinstance(exc, httpx.TransportError):
        return "transport"
    if isinstance(exc, (ValueError, KeyError, IndexError, TypeError)):
        return "invalid_response"
    return "error"


class ProviderCall:
    """One attempt. Outer cancellation is recorded separately from provider errors.

    Labels are fixed at call sites; no session IDs, prompts, URLs or exception
    messages. Counters reset at process restart; journal records retain history.
    """

    def __init__(self, operation: str, provider: str, role: str = "") -> None:
        self.operation, self.provider, self.role = operation, provider, role
        self.outcome = "success"
        self.kind = ""
        self.first_chunk_ms = None

    def __enter__(self):
        self.started = time.perf_counter()
        return self

    def first_chunk(self) -> None:
        if self.first_chunk_ms is None:
            self.first_chunk_ms = round((time.perf_counter() - self.started) * 1000, 3)

    def fail(self, exc: BaseException) -> None:
        self.outcome, self.kind = "error", error_kind(exc)

    def __exit__(self, exc_type, exc, traceback):
        if isinstance(exc, (asyncio.CancelledError, GeneratorExit)):
            self.outcome, self.kind = "cancelled", "cancelled"
        elif exc is not None:
            self.fail(exc)
        target = (self.operation, self.provider, self.role)
        with _lock:
            _counts[(*target, self.outcome)] += 1
            calls = sum(_counts[(*target, outcome)] for outcome in ("success", "error", "cancelled"))
            errors = _counts[(*target, "error")]
        _log.info(json.dumps({
            "event": "provider_call", "operation": self.operation,
            "provider": self.provider, "role": self.role, "outcome": self.outcome,
            "error_kind": self.kind, "duration_ms": round((time.perf_counter() - self.started) * 1000, 3),
            "first_chunk_ms": self.first_chunk_ms, "call_count": calls, "error_count": errors,
        }, separators=(",", ":")))
        return False
