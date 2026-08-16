"""judge.py — semantic argumentation judge (the "ИИ-судья", CLAUDE.md option C).

The deterministic engine scores technique from keyword lexicons, which is
transparent and reproducible but shallow and gameable (spam the right words →
high score). This judge reads the player's line for MEANING and returns a
0-100 argumentation score plus one line of concrete coaching and the techniques
it actually recognized.

Design (keeps the main invariant intact):
  - Off by default (env NEGO_JUDGE) and requires an AI backend. When off, the
    engine's keyword arg-quality stands → offline play stays deterministic.
  - When on, the caller uses this score IN PLACE OF the keyword arg-quality for
    that turn (the engine still owns all state and the final formula — it just
    receives a better-informed per-turn number), and surfaces `note` as live
    per-turn coaching. This resists keyword-spam and powers real feedback.

Returns None on any problem → caller falls back to the keyword score.
"""

from __future__ import annotations

import json
import os
import re
from typing import Optional

from app.ai.chat_models import get_chat_backend


def judge_enabled() -> bool:
    return os.environ.get("NEGO_JUDGE", "").strip().lower() in ("1", "on", "true", "yes")


def _sys(lang: str) -> str:
    if lang == "ru":
        return (
            "Ты — строгий, но справедливый тренер по переговорам (Гарвардский метод, SPIN, BATNA), "
            "и одновременно ты понимаешь скрытые интересы второй стороны. "
            "Оцени ПОСЛЕДНЮЮ реплику игрока по СМЫСЛУ, а не по ключевым словам. "
            "Учитывай: подлинное вскрытие интересов, опора на ОБЪЕКТИВНЫЕ критерии, логическую обоснованность, "
            "тон/эмпатию, продвигает ли реплика позицию без разрушения отношений. "
            "Спам заученных фраз без смысла — НИЗКИЙ балл. Верни СТРОГО JSON без markdown:\n"
            '{"arg_score": 0-100, '
            '"interest_targeted": индекс интереса из списка (0-based), в который РЕАЛЬНО метит вопрос игрока, или null, '
            '"secondary_conceded": id вторичного вопроса из списка, который игрок реально предлагает уступить в размене, или null, '
            '"criteria_legitimate": true если игрок опёрся на настоящий объективный критерий (данные/стандарт), иначе false, '
            '"note": "одно короткое конкретное указание игроку", '
            '"techniques": ["распознанные приёмы, по-русски"]}'
        )
    return (
        "You are a strict but fair negotiation coach (Harvard method, SPIN, BATNA) who also knows the other "
        "side's hidden interests. Rate the player's LAST line on MEANING, not keywords. "
        "Consider: genuine interest-probing, use of OBJECTIVE criteria, logical grounding, tone/empathy, and whether "
        "it advances their position without wrecking the relationship. Parroting phrases → LOW score. "
        "Return STRICT JSON, no markdown:\n"
        '{"arg_score": 0-100, '
        '"interest_targeted": index (0-based) of the interest the question ACTUALLY targets, or null, '
        '"secondary_conceded": id of the secondary issue from the list the player actually offers to concede in a trade, or null, '
        '"criteria_legitimate": true if the player leaned on a real objective criterion (data/standard), else false, '
        '"note": "one short concrete tip to the player", '
        '"techniques": ["recognized techniques, in English"]}'
    )


def _user(context: str, player_text: str, lang: str, interests: Optional[list] = None,
          secondary: Optional[list] = None) -> str:
    head = "Контекст переговоров" if lang == "ru" else "Negotiation context"
    line = "Реплика игрока" if lang == "ru" else "Player's line"
    parts = [f"{head}: {context}"]
    if interests:
        lbl = "Скрытые интересы второй стороны (0-based)" if lang == "ru" else "Other side's hidden interests (0-based)"
        parts.append(lbl + ": " + "; ".join(f"[{i}] {t}" for i, t in enumerate(interests)))
    if secondary:
        # (id, label) pairs so the judge can name WHICH issue is being conceded.
        lbl = "Вторичные вопросы для размена (id: описание)" if lang == "ru" else "Secondary issues to trade (id: label)"
        parts.append(lbl + ": " + "; ".join(f"{sid}: {slabel}" for sid, slabel in secondary))
    parts.append(f"{line}: {player_text}")
    return "\n".join(parts)


def _extract_json(text: str) -> Optional[dict]:
    if not text:
        return None
    text = re.sub(r"^```[a-zA-Z]*|```$", "", text.strip(), flags=re.MULTILINE)
    m = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def judge_turn(context: str, player_text: str, lang: str = "ru",
               interests: Optional[list] = None,
               secondary: Optional[list] = None) -> Optional[dict]:
    """Semantic judgement of the player's last line, or None on any problem.

    Returns: {arg_score:int 0-100, interest_targeted:int|None,
              secondary_conceded:str|None, criteria_legitimate:bool,
              note:str, techniques:list[str]}.
    `interests` is the localized list of the opponent's hidden interests so the
    judge can say WHICH one the question actually targets (index), not fixed order.
    `secondary` is an optional list of (id, label) pairs for the scenario's
    tradeable secondary issues, so the judge can name which one the player concedes.
    """
    if not (player_text or "").strip():
        return None
    raw = get_chat_backend().generate(
        _sys(lang), _user(context, player_text, lang, interests, secondary), raw=True)
    d = _extract_json(raw or "")
    if not d:
        return None
    try:
        score = max(0, min(100, int(round(float(d.get("arg_score"))))))
    except (TypeError, ValueError):
        return None

    idx = d.get("interest_targeted")
    if isinstance(idx, bool) or not isinstance(idx, (int, float)):
        idx = None
    else:
        idx = int(idx)
        if interests is not None and not (0 <= idx < len(interests)):
            idx = None

    # Only accept a secondary_conceded id that is actually one of this scenario's.
    sec = d.get("secondary_conceded")
    if not isinstance(sec, str) or not sec.strip():
        sec = None
    elif secondary is not None and sec not in {sid for sid, _ in secondary}:
        sec = None

    return {
        "arg_score": score,
        "interest_targeted": idx,
        "secondary_conceded": sec,
        "criteria_legitimate": bool(d.get("criteria_legitimate")),
        "note": str(d.get("note") or "").strip()[:280],
        "techniques": [str(t) for t in (d.get("techniques") or [])][:6],
    }
