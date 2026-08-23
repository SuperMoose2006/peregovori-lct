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
# Замок на внешние запросы (NEGO_HTTP_PASSWORD) нужен боевому серверу с публичным
# адресом, но TestClient приходит не с localhost и получал бы 401 на каждом
# запросе. Тесты проверяют логику, а не проходную, — снимаем его здесь, как и
# живой профиль ИИ выше.
# Именно ПУСТАЯ строка, а не pop: _load_dotenv() в main.py делает setdefault,
# и удалённая переменная тут же вернулась бы из .env.
os.environ["NEGO_HTTP_PASSWORD"] = ""
os.environ["NEGO_JUDGE"] = "0"
