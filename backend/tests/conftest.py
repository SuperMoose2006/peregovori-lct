"""Ensure the backend package root is importable regardless of pytest cwd."""

import os
import sys

_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

# The suite is the OFFLINE contract: deterministic engine, no network, no spend.
# backend/.env may pin a live AI profile for RUNNING the app (NEGO_AI=openai via
# OpenRouter) — importing app.main loads it, so pin the offline profile here
# before any test module can pick that up. Individual tests still monkeypatch.
os.environ["NEGO_AI"] = "off"
os.environ["NEGO_JUDGE"] = "0"
