"""Счёт эталонных партий для браузерного зеркала не должен протухать.

`frontend/test/games.test.ts` требует от офлайн-ядра ТЕ ЖЕ числа, что посчитал
движок здесь. Если баланс поправили, а фикстуру не перегенерировали, паритет
сверяется по вчерашнему ответу — то есть не сверяется.
"""

import subprocess
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[1] / "tools" / "gen_game_scores.py"


def test_game_scores_fixture_is_fresh() -> None:
    result = subprocess.run([sys.executable, str(TOOLS), "--check"],
                            capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr
