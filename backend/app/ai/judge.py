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
    """Whether the semantic judge runs. Explicit NEGO_JUDGE wins; otherwise it
    auto-enables for the FAST API backends (openai/api) — so the recommended prod
    profile is semantic by default — but stays off for off/cli/sdk/tmux where the
    extra per-turn call would be slow (there it needs an explicit NEGO_JUDGE=1)."""
    v = os.environ.get("NEGO_JUDGE", "").strip().lower()
    if v in ("1", "on", "true", "yes"):
        return True
    if v in ("0", "off", "false", "no"):
        return False
    return os.environ.get("NEGO_AI", "off").strip().lower() in ("api", "openai")


# Closed vocabulary for the recognized-technique chips. The judge picks from it
# instead of free-writing labels: free-form output produced unreadable chips
# ("интерrogация", "предложениеУсловия") in the demo's most visible surface.
TECHNIQUES_RU = (
    "вскрытие интересов", "объективный критерий", "размен", "BATNA",
    "активное слушание", "SPIN-вопрос", "обоснование", "давление",
    "уступка", "закрытие сделки",
)
TECHNIQUES_EN = (
    "probing interests", "objective criteria", "trade-off", "BATNA",
    "active listening", "SPIN question", "rationale", "pressure",
    "concession", "closing",
)


def _sys(lang: str) -> str:
    if lang == "ru":
        return (
            "Ты — строгий, но справедливый тренер по переговорам (Гарвардский метод, SPIN, BATNA), "
            "и одновременно ты понимаешь скрытые интересы второй стороны. "
            "Оцени ПОСЛЕДНЮЮ реплику игрока по СМЫСЛУ, а не по ключевым словам.\n"
            "ШКАЛА arg_score (следуй ей буквально):\n"
            "0-20: грубость, пустая реплика ИЛИ набор переговорных клише («рынок», «стандарт индустрии», "
            "«в обмен на объём») БЕЗ конкретных цифр, данных и без конкретной уступки — это спам, а не аргумент.\n"
            "ВАЖНО: если в реплике есть конкретное число, диапазон, ссылка на реальную альтернативу (BATNA) "
            "или названная уступка — это НЕ спам, ставь минимум 55, даже если слова звучат шаблонно.\n"
            "Реплика из 1-3 слов без содержания («ну», «ок», «дальше») — не выше 15.\n"
            "21-40: голая позиция, требование или давление без обоснования.\n"
            "41-60: осмысленный, но поверхностный ход: общий вопрос или слабое обоснование.\n"
            "61-80: один сильный приём по существу — вскрытие конкретного интереса, настоящий объективный "
            "критерий с цифрой/источником, или конкретный размен «мы даём X — вы двигаетесь по Y».\n"
            "81-100: два и более таких приёма вместе, продвигают к сделке и не рушат отношения.\n"
            "Сначала спроси себя: что КОНКРЕТНО игрок сообщил или узнал этой репликой? Если ничего "
            "конкретного — балл низкий, сколько бы «правильных» слов там ни было. "
            "Верни СТРОГО JSON без markdown:\n"
            '{"arg_score": 0-100, '
            '"interest_targeted": индекс интереса из списка (0-based), в который РЕАЛЬНО метит вопрос игрока, или null, '
            '"secondary_conceded": id вторичного вопроса из списка, который игрок реально предлагает уступить в размене, или null, '
            '"criteria_legitimate": true если игрок опёрся на настоящий объективный критерий (данные/стандарт), иначе false, '
            '"note": "одно короткое конкретное указание игроку", '
            '"techniques": [список ТОЛЬКО из этих значений, без своих формулировок: '
            + ", ".join(f'"{t}"' for t in TECHNIQUES_RU) + "]}"
        )
    return (
        "You are a strict but fair negotiation coach (Harvard method, SPIN, BATNA) who also knows the other "
        "side's hidden interests. Rate the player's LAST line on MEANING, not keywords.\n"
        "arg_score SCALE (follow it literally):\n"
        "0-20: hostility, an empty line, OR a salad of negotiation cliches (\"market rate\", \"industry "
        "standard\", \"in exchange for volume\") with NO concrete numbers, data or actual concession — that is "
        "spam, not an argument.\n"        "IMPORTANT: if the line carries a concrete number, a range, a real alternative (BATNA) or a named "
        "concession, it is NOT spam — score at least 55, however boilerplate the wording sounds.\n"
        "A throwaway 1-3 word line (\"ok\", \"sure\", \"go on\") — no higher than 15.\n"
        "21-40: a bare position, demand or pressure with no grounding.\n"
        "41-60: meaningful but shallow: a generic question or weak rationale.\n"
        "61-80: one strong substantive move — probing a specific interest, a real objective criterion with a "
        "number/source, or a concrete trade \"we give X if you move on Y\".\n"
        "81-100: two or more such moves together, advancing the deal without wrecking the relationship.\n"
        "First ask yourself: what did the player CONCRETELY tell or learn with this line? If nothing concrete, "
        "the score is low no matter how many \"right\" words it contains. "
        "Return STRICT JSON, no markdown:\n"
        '{"arg_score": 0-100, '
        '"interest_targeted": index (0-based) of the interest the question ACTUALLY targets, or null, '
        '"secondary_conceded": id of the secondary issue from the list the player actually offers to concede in a trade, or null, '
        '"criteria_legitimate": true if the player leaned on a real objective criterion (data/standard), else false, '
        '"note": "one short concrete tip to the player", '
        '"techniques": [pick ONLY from this list, invent nothing: '
        + ", ".join(f'"{t}"' for t in TECHNIQUES_EN) + "]}"
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


def _clean_techniques(items, lang: str) -> list[str]:
    """Keep only labels from the closed vocabulary (models still drift)."""
    vocab = TECHNIQUES_RU if lang == "ru" else TECHNIQUES_EN
    index = {v.lower(): v for v in vocab}
    out: list[str] = []
    for it in (items or []):
        v = index.get(str(it).strip().lower())
        if v and v not in out:
            out.append(v)
    return out[:4]


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
    backend = get_chat_backend()
    sys_p = _sys(lang)
    user_p = _user(context, player_text, lang, interests, secondary)
    d = None
    for _ in range(2):
        d = _extract_json(backend.generate(sys_p, user_p, raw=True) or "")
        if d:
            break
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
        "techniques": _clean_techniques(d.get("techniques"), lang),
    }
