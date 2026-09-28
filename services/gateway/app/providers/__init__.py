"""Пакет realtime-архитектуры «Диалога». См. docs/upstream-code-map.md."""

import os


def network_enabled() -> bool:
    """Один выключатель облака, включая бесплатный сетевой синтез Edge."""
    return os.getenv("NEGO_AI", "").strip().lower() != "off"
