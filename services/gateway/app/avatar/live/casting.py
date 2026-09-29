"""casting.py — какое лицо сервиса у какого персонажа.

Одно лицо на все пятнадцать персонажей — это не собеседник, а диктор. Поэтому
лицо выбирается по персонажу, в таком порядке:

1. раскладка персонажей (`casting.json`, поле `personas`) — её пишет сессия
   кастинга в документе `AVATAR_CASTING.md` (каталог docs, появится), а `tools/sync_casting.py` переносит в
   JSON: на стенд документы не выкладываются, JSON едет вместе с кодом;
2. `NEGO_LIVE_VIDEO_AVATAR` — одно лицо на всех, если так задано;
3. лицо по умолчанию для пола персонажа (`defaults`) — пока раскладки нет,
   женщины и мужчины хотя бы не меняются голосом и лицом местами;
4. пусто — драйвер берёт стоковое лицо сам.

Путь к своей раскладке — `NEGO_LIVE_VIDEO_CASTING`. Файла нет или он битый —
раскладка пустая, партия идёт с лицом по умолчанию: лицо не повод ронять игру.
"""

from __future__ import annotations

import json
import logging
import re
from functools import lru_cache
from pathlib import Path
from typing import Optional

_log = logging.getLogger("dialog.live_video")

BUILTIN = Path(__file__).with_name("casting.json")
UUID = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.IGNORECASE)


@lru_cache(maxsize=8)
def _read(path: str, mtime: float) -> dict:
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception as exc:
        _log.warning("живое видео: раскладка лиц %s не читается (%s) — лица по умолчанию", path, exc)
        return {}


def table(path: str = "") -> dict:
    target = Path(path) if path else BUILTIN
    try:
        mtime = target.stat().st_mtime
    except OSError:
        if path:
            _log.warning("живое видео: раскладки лиц %s нет — лица по умолчанию", path)
        return {}
    return _read(str(target), mtime)


def face_for(vendor: str, scenario_id: str, female: bool, explicit: str = "", path: str = "") -> str:
    """Id лица сервиса `vendor` для персонажа. Пусто — пусть драйвер выберет сам."""
    section = table(path).get(vendor) or {}
    personas = section.get("personas") or {}
    face = personas.get(scenario_id)
    if isinstance(face, str) and face:
        return face
    if explicit:
        return explicit
    defaults = section.get("defaults") or {}
    face = defaults.get("female" if female else "male")
    return face if isinstance(face, str) else ""


def parse_casting_doc(text: str, persona_ids: set[str]) -> dict[str, str]:
    """Строки таблиц документа кастинга → {персонаж: id лица}.

    Формат документа пишет другая сессия, поэтому разбор терпимый: строка
    таблицы, в которой ровно один известный персонаж (по id стола) и хотя бы
    один UUID, даёт пару «персонаж → первый UUID строки». Всё остальное —
    заголовки, пояснения, строки без UUID — пропускается.
    """
    found: dict[str, str] = {}
    for line in text.splitlines():
        if not line.lstrip().startswith("|"):
            continue
        ids = UUID.findall(line)
        if not ids:
            continue
        cells = re.findall(r"[A-Za-z0-9_]+", line)
        hits = [c for c in dict.fromkeys(cells) if c in persona_ids]
        if len(hits) == 1:
            found[hits[0]] = ids[0].lower()
    return found
