"""scenario_gen.py — generate a playable Scenario from the user's free-text
situation (the "Своя сделка" mode).

The LLM proposes the persona, positions, hidden interests and ZOPA numbers; we
then NORMALIZE the four price points into a strictly-ordered, guaranteed-playable
ZOPA (per the headline direction), so a sloppy model can never produce an
unplayable game. If no AI backend is available, returns None and the caller
tells the user this mode needs AI.

The generated Scenario plugs into the SAME deterministic engine as authored
scenarios — the engine remains the source of truth for state and scoring.
"""

from __future__ import annotations

import json
import re
import secrets
from typing import Optional

from app.engine.scenarios import Scenario, Counterpart, Headline, Batna, register_runtime_scenario
from app.ai.chat_models import get_chat_backend

_STYLES = {"relationship", "tough", "analytical"}


def _sys_prompt(lang: str) -> str:
    if lang == "ru":
        return (
            "Ты — дизайнер сценариев для тренажёра переговоров. По описанию ситуации от пользователя "
            "создай ОДИН сценарий деловых переговоров. Верни СТРОГО JSON (без markdown, без пояснений) "
            "со следующими полями:\n"
            '{"title": str, "icon": один эмодзи, "role": "кто игрок и его цель, 1-2 предложения",\n'
            ' "counterpart_name": str, "counterpart_persona": "1 предложение", '
            '"style": "relationship|tough|analytical",\n'
            ' "unit": "суффикс числа, напр. \'₽\', \'%\', \' млн\', \' дн\'", '
            '"dir": "lower_is_better|higher_is_better",\n'
            ' "opponent_open": число, "opponent_reservation": число, "player_target": число, '
            '"player_reservation": число,\n'
            ' "batna_strength": 0-100, "batna_note": str,\n'
            ' "hidden_interests": [три скрытых интереса второй стороны],\n'
            ' "tradeoffs": [два-три предмета для размена],\n'
            ' "briefing": "краткая вводная для игрока: цель, красная линия, подсказка"}\n'
            "dir=lower_is_better если игрок хочет меньшее число (цена, доля, срок), иначе higher_is_better. "
            "Числа должны образовывать реалистичную зону торга. Всё на русском."
        )
    return (
        "You are a scenario designer for a negotiation trainer. From the user's situation, create ONE "
        "business-negotiation scenario. Return STRICT JSON (no markdown, no prose) with these fields:\n"
        '{"title": str, "icon": one emoji, "role": "who the player is and their goal, 1-2 sentences",\n'
        ' "counterpart_name": str, "counterpart_persona": "1 sentence", '
        '"style": "relationship|tough|analytical",\n'
        ' "unit": "number suffix e.g. \'$\', \'%\', \'k\', \' days\'", '
        '"dir": "lower_is_better|higher_is_better",\n'
        ' "opponent_open": number, "opponent_reservation": number, "player_target": number, '
        '"player_reservation": number,\n'
        ' "batna_strength": 0-100, "batna_note": str,\n'
        ' "hidden_interests": [three hidden interests of the counterpart],\n'
        ' "tradeoffs": [two-three tradeable items],\n'
        ' "briefing": "short player briefing: goal, red line, a hint"}\n'
        "dir=lower_is_better if the player wants the smaller number (price, equity, days), else higher_is_better. "
        "Numbers must form a realistic bargaining zone. All text in English."
    )


def _extract_json(text: str) -> Optional[dict]:
    if not text:
        return None
    # strip code fences and grab the outermost {...}
    text = re.sub(r"^```[a-zA-Z]*|```$", "", text.strip(), flags=re.MULTILINE)
    m = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def _num(v, default: float = 0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _normalize_zopa(d: dict) -> tuple[float, float, float, float]:
    """Return (opponent_open, opponent_reservation, player_target, player_reservation)
    as a strictly-ordered, guaranteed-playable ZOPA for the given direction."""
    raw = [
        _num(d.get("opponent_open")), _num(d.get("opponent_reservation")),
        _num(d.get("player_target")), _num(d.get("player_reservation")),
    ]
    nums = sorted(raw)
    # Degenerate input → fabricate a spread around the largest magnitude seen.
    if nums[0] == nums[3]:
        base = abs(nums[3]) or 100.0
        nums = [base * f for f in (0.7, 0.85, 1.0, 1.15)]
    # Force strictly increasing.
    for i in range(1, 4):
        if nums[i] <= nums[i - 1]:
            nums[i] = nums[i - 1] + max(1.0, abs(nums[i - 1]) * 0.05)
    a, b, c, dd = (round(x, 2) for x in nums)
    lower = str(d.get("dir", "lower_is_better")) != "higher_is_better"
    if lower:
        # player wants LOW: floor=a, target=b, reservation=c, open=d
        return dd, a, b, c
    # player wants HIGH: open=a, reservation=b, target=c, opp_reservation=d
    return a, dd, c, b


def _dual(text: str) -> dict[str, str]:
    """A custom scenario is generated in one language; fill both locale keys so
    engine lookups in either lang never KeyError."""
    s = str(text or "")
    return {"ru": s, "en": s}


def _dual_list(items: list) -> dict[str, list[str]]:
    lst = [str(x) for x in (items or [])]
    return {"ru": lst, "en": lst}


def generate_scenario(situation: str, lang: str = "ru") -> Optional[Scenario]:
    backend = get_chat_backend()
    raw = backend.generate(_sys_prompt(lang), (situation or "").strip()[:1500], raw=True)
    d = _extract_json(raw or "")
    if not d:
        return None

    dir_ = "higher_is_better" if str(d.get("dir")) == "higher_is_better" else "lower_is_better"
    style = d.get("style") if d.get("style") in _STYLES else "analytical"
    opp_open, opp_res, p_target, p_res = _normalize_zopa({**d, "dir": dir_})

    interests = [str(x) for x in (d.get("hidden_interests") or [])][:3]
    while len(interests) < 3:
        interests.append({"ru": "Скрытый интерес", "en": "A hidden interest"}[lang])
    tradeoffs = [str(x) for x in (d.get("tradeoffs") or [])][:3]
    while len(tradeoffs) < 2:
        tradeoffs.append({"ru": "уступка по срокам", "en": "a timing concession"}[lang])

    sc_id = "custom_" + secrets.token_hex(4)
    icon = str(d.get("icon") or "🎯")[:4]
    try:
        difficulty = max(1, min(5, int(_num(d.get("difficulty"), 3))))
    except Exception:
        difficulty = 3

    scenario = Scenario(
        id=sc_id,
        icon=icon,
        difficulty=difficulty,
        title=_dual(d.get("title") or ("Своя сделка" if lang == "ru" else "Custom deal")),
        role=_dual(d.get("role") or ""),
        counterpart=Counterpart(
            name=_dual(d.get("counterpart_name") or ("Оппонент" if lang == "ru" else "Counterpart")),
            persona=_dual(d.get("counterpart_persona") or ""),
            style=style,
        ),
        headline=Headline(unit=_dual(d.get("unit") or ""), dir=dir_),
        opponent_open=opp_open,
        opponent_reservation=opp_res,
        player_target=p_target,
        player_reservation=p_res,
        player_batna=Batna(
            strength=max(0, min(100, int(_num(d.get("batna_strength"), 50)))),
            note=_dual(d.get("batna_note") or ""),
        ),
        hidden_interests=_dual_list(interests),
        tradeoffs=_dual_list(tradeoffs),
        briefing=_dual(d.get("briefing") or ""),
    )
    register_runtime_scenario(scenario)
    return scenario
