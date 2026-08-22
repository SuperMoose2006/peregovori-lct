"""Зеркало курса во фронтенде не должно отставать от Python-источника."""

import subprocess
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[1] / "tools" / "sync_course.py"


def test_course_mirror_is_in_sync() -> None:
    result = subprocess.run([sys.executable, str(TOOLS), "--check"],
                            capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr
