"""Зеркало кампаний во фронтенде не должно отставать от Python-источника.

Раньше синхронность держал комментарий «kept in sync with backend CAMPAIGNS»,
а проверял её тест, сравнивавший длину списка на своей же стороне. Добавленный
акт расходился молча — в офлайн-ядре, которое обязано играть ту же игру.
"""
import subprocess
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[1] / "tools" / "sync_campaigns.py"


def test_campaign_mirror_is_in_sync() -> None:
    result = subprocess.run([sys.executable, str(TOOLS), "--check"],
                            capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr
