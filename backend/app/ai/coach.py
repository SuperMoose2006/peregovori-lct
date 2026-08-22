"""coach.py — the AI coach behind the 💡 hint button.

The deterministic ladder in `views.compute_hint` always answers ("info is low →
ask about interests"), which is correct but generic: it says WHAT to do, never
what to actually type. With a live backend the coach reads the real transcript
and hands the player ONE sentence they can send as-is — the worked example that
deliberate-practice research keeps finding to be the strongest scaffold.

Two boundaries, both deliberate:
  - It only ever produces TEXT. The engine still owns state, scoring and what a
    move does. A suggested line is a suggestion; sending it is the player's move
    and gets judged like any other.
  - It sees only what the PLAYER already knows — the revealed interests, never
    the hidden ones. A hint that spoils the discovery would defeat the exercise.

Returns None on any problem → the caller falls back to the deterministic hint.
"""

from __future__ import annotations

import json
import re
from typing import Optional

from app.ai.chat_models import get_chat_backend

MAX_LINE = 220


def _sys(lang: str) -> str:
    if lang == "ru":
        return (
            "Ты — тренер по переговорам (Гарвардский метод, SPIN, BATNA). Игрок ведёт переговоры "
            "и попросил подсказку. Дай ему ОДНУ конкретную реплику, которую он может отправить "
            "прямо сейчас, — не абстрактный совет, а готовую фразу его словами.\n"
            "Правила: фраза уместна в текущем моменте разговора и продвигает переговоры; "
            "1-2 предложения; без давления и грубости; не выдумывай фактов, которых нет в брифинге; "
            "не раскрывай интересы второй стороны, которые игрок ещё не вскрыл сам; "
            "не предлагай реплику, которая по смыслу уже звучала в разговоре — веди игрока дальше.\n"
            'Верни СТРОГО JSON без markdown: {"why": "почему сейчас именно это, 1 короткая фраза", '
            '"line": "готовая реплика игрока"}'
        )
    return (
        "You are a negotiation coach (Harvard method, SPIN, BATNA). The player is mid-negotiation and "
        "asked for a hint. Give them ONE concrete line they can send right now — not abstract advice, "
        "a ready-to-use sentence in their own voice.\n"
        "Rules: it must fit this exact moment and move the deal forward; 1-2 sentences; no pressure or "
        "rudeness; invent no facts beyond the briefing; do not reveal the other side's interests the "
        "player has not drawn out yet; never suggest a line that already appeared in the conversation in "
        "substance — move the player forward.\n"
        'Return STRICT JSON, no markdown: {"why": "why this, one short clause", '
        '"line": "the player\'s ready-to-send line"}'
    )


def _user(facts: dict, lang: str) -> str:
    ru = lang == "ru"
    revealed = facts.get("revealed_interests") or []
    parts = [
        f"{'Ситуация' if ru else 'Situation'}: {facts.get('role', '')}",
        f"{'Оппонент' if ru else 'Counterpart'}: {facts.get('persona_name', '')} — {facts.get('persona_desc', '')}",
        f"{'Его число на столе' if ru else 'Their number on the table'}: {facts.get('offer_opp')}{facts.get('unit', '')}",
        f"{'Доверие/Напряжение/Информация' if ru else 'Trust/Tension/Info'}: "
        f"{facts.get('trust')}/{facts.get('tension')}/{facts.get('info')}",
    ]
    if revealed:
        parts.append(("Интересы, которые игрок уже вскрыл" if ru else "Interests the player already surfaced")
                     + ": " + "; ".join(revealed))
    else:
        parts.append("Игрок ещё не вскрыл ни одного интереса второй стороны." if ru
                     else "The player has surfaced none of their interests yet.")
    if facts.get("transcript"):
        parts.append(("Разговор" if ru else "Conversation") + f":\n{facts['transcript']}")
    if facts.get("fallback_hint"):
        parts.append(("Направление по движку (следуй ему)" if ru else "Engine's direction (follow it)")
                     + f": {facts['fallback_hint']}")
    return "\n".join(parts)


def _extract_json(text: str) -> Optional[dict]:
    m = re.search(r"\{[\s\S]*\}", text or "")
    if not m:
        return None
    try:
        d = json.loads(m.group(0))
        return d if isinstance(d, dict) else None
    except Exception:
        return None


def suggest_line(facts: dict, lang: str = "ru") -> Optional[dict]:
    """{'why': str, 'line': str} the player can send, or None to fall back."""
    raw = get_chat_backend().generate(_sys(lang), _user(facts, lang), raw=True)
    d = _extract_json(raw or "")
    if not d:
        return None
    line = str(d.get("line") or "").strip().strip('"«»').strip()
    why = str(d.get("why") or "").strip().strip('"«»').strip()
    if len(line) < 8:
        return None
    if len(line) > MAX_LINE:
        line = re.sub(r"\s+\S*$", "", line[:MAX_LINE]) + "…"
    return {"why": why[:160], "line": line}
