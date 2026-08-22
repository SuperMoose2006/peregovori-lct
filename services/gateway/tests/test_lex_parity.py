"""Словарь приёмов один — на сервере и в браузере.

Разъехавшиеся списки означают разный вердикт на одну и ту же реплику: чип под
композером говорит «объективный критерий», а движок засчитывает голое
предложение. Это не косметика — на этом стоит проверка упражнений курса.
"""

import subprocess
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[1] / "tools" / "sync_lexicon.py"


def test_frontend_lexicon_is_in_sync() -> None:
    result = subprocess.run(
        [sys.executable, str(TOOLS), "--check"], capture_output=True, text=True
    )
    assert result.returncode == 0, result.stdout + result.stderr
