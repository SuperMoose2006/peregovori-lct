"""debriefer.py — the AI mentor's closing word on the finished negotiation.

The engine already produced the honest, reproducible verdict: grade, three
sub-scores and a list of deterministic tips. That is the truth and it does not
move. What it cannot do is speak to THIS player about THIS conversation — the
tips are drawn from a fixed ladder, so two very different games can end on the
same three bullets.

So the mentor gets the finished scorecard as a GIVEN and is asked only to
narrate it: name the one thing that actually worked, name the one thing that
cost the most, in the player's own quoted words. It never scores, never grades,
never contradicts the numbers it was handed — the prompt states the grade as
settled fact and asks for an explanation, not an opinion.

Returns None on any problem → the debrief renders exactly as it does offline.
"""

from __future__ import annotations

import json
import re
from typing import Optional

from app.ai.chat_models import get_chat_backend

MAX_VERDICT = 340
MAX_LINE = 180


def _sys(lang: str) -> str:
    if lang == "ru":
        return (
            "Ты — наставник по переговорам (Гарвардский метод, SPIN, BATNA). Переговоры закончены, "
            "оценка уже выставлена движком и НЕ обсуждается — твоя задача объяснить её человеку, "
            "а не пересматривать.\n"
            "Пиши коротко, конкретно и по делу, обращаясь к игроку на «вы». Опирайся на его "
            "РЕАЛЬНЫЕ реплики: цитируй или пересказывай то, что он действительно сказал. "
            "Никаких общих слов вроде «хорошая работа, продолжайте в том же духе». "
            "Не называй новых цифр оценки и не спорь с грейдом.\n"
            "ЖЁСТКО: если счётчик приёма больше нуля — этот приём УЖЕ применён, и советовать его "
            "как новый нельзя. «Что изменить» должно совпадать с разбором движка (он дан ниже) "
            "и не противоречить счётчикам.\n"
            'Верни СТРОГО JSON без markdown: {"verdict": "2-3 предложения: что это были за переговоры '
            'и почему они закончились именно так", "strength": "одно предложение — что сработало, '
            'со ссылкой на конкретный ход", "growth": "одно предложение — что изменить в следующий раз, '
            'максимально конкретно"}'
        )
    return (
        "You are a negotiation mentor (Harvard method, SPIN, BATNA). The negotiation is over and the "
        "engine has already issued the grade — it is settled and not up for debate. Your job is to "
        "explain it to a human, not to re-judge it.\n"
        "Be short, concrete and specific, addressing the player as 'you'. Ground everything in what they "
        "ACTUALLY said: quote or paraphrase their real lines. No filler like 'good job, keep it up'. "
        "Do not invent new scores and do not argue with the grade.\n"
        "STRICT: a technique whose counter is above zero was ALREADY used — never advise it as if it "
        "were missing. 'What to change' must agree with the engine's own debrief (given below) and "
        "must not contradict the counters.\n"
        'Return STRICT JSON, no markdown: {"verdict": "2-3 sentences: what kind of negotiation this was '
        'and why it ended this way", "strength": "one sentence — what worked, pointing at a specific '
        'move", "growth": "one sentence — what to change next time, as concretely as possible"}'
    )


def _user(facts: dict, lang: str) -> str:
    ru = lang == "ru"
    parts = [
        f"{'Ситуация' if ru else 'Situation'}: {facts.get('role', '')}",
        f"{'Оппонент' if ru else 'Counterpart'}: {facts.get('persona_name', '')} — {facts.get('persona_desc', '')}",
        f"{'Итог' if ru else 'Outcome'}: {facts.get('deal_text', '')} ({facts.get('status', '')})",
        f"{'Грейд движка' if ru else 'Engine grade'}: {facts.get('grade')} — "
        f"{facts.get('overall')}/100 ({'экономика' if ru else 'economic'} {facts.get('economic')}, "
        f"{'отношения' if ru else 'relationship'} {facts.get('relationship')}, "
        f"{'техника' if ru else 'technique'} {facts.get('technique')})",
        f"{'Вскрыто интересов' if ru else 'Interests surfaced'}: "
        f"{facts.get('interests_found')}/{facts.get('interests_total')}; "
        f"{'объективных критериев' if ru else 'objective criteria'}: {facts.get('objective_criteria')}; "
        f"{'разменов' if ru else 'trade-offs'}: {facts.get('tradeoffs')}; "
        f"{'угроз/давления' if ru else 'threats'}: {facts.get('threats')}",
    ]
    if facts.get("engine_tips"):
        # The engine's own gap list. The mentor rephrases it in this player's
        # words; without it a cheap model invents gaps the counters disprove.
        parts.append(("Разбор движка — что действительно не хватило" if ru
                      else "The engine's own debrief - what was actually missing")
                     + ": " + " ".join(facts["engine_tips"]))
    if facts.get("hidden_interests"):
        parts.append(("Настоящие интересы оппонента" if ru else "The counterpart's real interests")
                     + ": " + "; ".join(facts["hidden_interests"]))
    if facts.get("transcript"):
        parts.append(("Стенограмма" if ru else "Transcript") + f":\n{facts['transcript']}")
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


def _trim(s: str, cap: int) -> str:
    s = str(s or "").strip().strip('"«»').strip()
    if len(s) > cap:
        s = re.sub(r"\s+\S*$", "", s[:cap]) + "…"
    return s


def build_prompts(facts: dict, lang: str = "ru") -> tuple[str, str]:
    """The mentor's (system, user) pair.

    Public so the async realtime path (app/orchestrator/negotiation.py) sends
    the SAME prompt through the OpenRouter provider instead of re-deriving it.
    """
    return _sys(lang), _user(facts, lang)


def parse(raw: str, lang: str = "ru") -> Optional[dict]:
    """Validate a raw mentor reply, or None if it says nothing useful.

    Shared by the sync and async paths: the length floor below is the guard
    that keeps a one-word "well done" from replacing the engine's own tips.
    """
    d = _extract_json(raw or "")
    if not d:
        return None
    verdict = _trim(d.get("verdict"), MAX_VERDICT)
    if len(verdict) < 20:
        return None
    return {
        "verdict": verdict,
        "strength": _trim(d.get("strength"), MAX_LINE),
        "growth": _trim(d.get("growth"), MAX_LINE),
    }


def summarize(facts: dict, lang: str = "ru") -> Optional[dict]:
    """{'verdict','strength','growth'} narrating the engine's verdict, or None."""
    raw = get_chat_backend().generate(*build_prompts(facts, lang), raw=True)
    d = _extract_json(raw or "")
    if not d:
        return None
    verdict = _trim(d.get("verdict"), MAX_VERDICT)
    if len(verdict) < 20:  # a one-word "good" is worse than the engine's own tips
        return None
    return {
        "verdict": verdict,
        "strength": _trim(d.get("strength"), MAX_LINE),
        "growth": _trim(d.get("growth"), MAX_LINE),
    }
