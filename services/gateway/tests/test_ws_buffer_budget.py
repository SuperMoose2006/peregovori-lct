"""Буфер входящих кадров сокетов помещается в память юнита.

Найдено после аудита 17.10: `--ws-max-size 8388608 --ws-max-queue 4` давало
до 32 МиБ очереди на сокет — около 4 ГиБ на 128 сокетов при `MemoryMax=2G`.
Клиент, грузящий быстрее, чем цикл разбирает, мог уронить гейтвей вместе со
всеми партиями. Граница — та, что обещает библиотека: сокеты × очередь × размер.
"""
import re
from pathlib import Path

from app.realtime.session import MAX_AUDIO_BYTES, MAX_FRAME_B64

ROOT = Path(__file__).resolve().parents[3]
UNIT = (ROOT / "deploy" / "dialog.service").read_text(encoding="utf-8")
ENV = (ROOT / "deploy" / "dialog.env.example").read_text(encoding="utf-8")


def _flag(name: str) -> int:
    return int(re.search(rf"--{name} (\d+)", UNIT).group(1))


def _mem(name: str) -> int:
    value = re.search(rf"^{name}=(\d+)([MG])$", UNIT, re.M)
    return int(value.group(1)) * (1024 ** 2 if value.group(2) == "M" else 1024 ** 3)


def test_the_largest_legitimate_message_fits_one_frame():
    audio_b64 = MAX_AUDIO_BYTES * 4 // 3 + 4
    assert _flag("ws-max-size") >= max(audio_b64, MAX_FRAME_B64) + 64 * 1024


def test_all_sockets_queues_fit_under_the_soft_memory_limit():
    sockets = int(re.search(r"^NEGO_MAX_WEBSOCKETS=(\d+)$", ENV, re.M).group(1))
    budget = sockets * _flag("ws-max-queue") * _flag("ws-max-size")
    assert budget <= _mem("MemoryHigh"), budget
