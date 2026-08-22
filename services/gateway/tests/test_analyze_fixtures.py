"""Фикстура классификатора для браузерного зеркала не должна протухать.

Она — эталон, по которому `frontend/test/parity.test.ts` сверяет TS-движок с
этим. Если анализатор поменяли, а фикстуру не перегенерировали, паритет
проверяется по вчерашнему ответу — то есть не проверяется.
"""

import subprocess
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[1] / "tools" / "gen_analyze_fixtures.py"


def test_analyze_fixture_is_fresh() -> None:
    result = subprocess.run([sys.executable, str(TOOLS), "--check"],
                            capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr
