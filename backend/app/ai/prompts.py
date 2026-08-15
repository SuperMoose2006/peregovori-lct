"""prompts.py — turn a plain `facts` dict into the opponent's LLM prompt.

Mirrors legacy-node/engine/llm.js + claude-tmux.js: we hand the model the exact
game-state facts it must NOT contradict (current offer, mood, deal status) so the
flavor text can never drift from what the deterministic engine already decided.
The model only rephrases in character; it never invents numbers or outcomes.

`facts` schema (see CLAUDE.md / negotiation-platform-design §5):
    lang         "ru" | "en"
    persona_name str            counterpart's name
    persona_desc str            one-line persona description
    offer_opp    float          opponent's current number on the table
    unit         str            unit suffix for the offer (e.g. "₽", "$", " млн")
    mood         str            short mood phrase already derived from the engine
    status       "active" | "agreement" | "breakdown"
    player_text  str            the player's latest line
    fallback     str            engine's templated reaction (rephrase, don't copy)
"""

from __future__ import annotations

from typing import Tuple


def _fmt_num(n) -> str:
    """Render the offer as a clean human number (5000000.0 -> "5000000")."""
    try:
        f = float(n)
    except (TypeError, ValueError):
        return str(n)
    return str(int(f)) if f.is_integer() else str(f)


def _status_phrase(status: str, lang: str) -> str:
    if lang == "ru":
        return {
            "agreement": "СОГЛАСИЕ достигнуто",
            "breakdown": "переговоры сорваны",
        }.get(status, "идут")
    return {
        "agreement": "AGREEMENT reached",
        "breakdown": "talks broke down",
    }.get(status, "ongoing")


def build_system(facts: dict) -> str:
    """The role + hard-facts system prompt (facts the model must not contradict)."""
    lang = facts.get("lang", "ru")
    name = facts.get("persona_name", "")
    desc = facts.get("persona_desc", "")
    offer = _fmt_num(facts.get("offer_opp"))
    unit = facts.get("unit", "")
    mood = facts.get("mood", "")
    status = _status_phrase(facts.get("status", "active"), lang)

    if lang == "ru":
        return (
            f"Ты играешь роль оппонента на деловых переговорах. Персонаж: {name} — {desc}.\n"
            "Ответь РОВНО одной короткой репликой (1-2 предложения) на русском, строго в "
            "характере, без markdown, без пояснений, без кавычек вокруг ответа.\n"
            "Факты, которым нельзя противоречить:\n"
            f"- Твоё текущее предложение на столе: {offer}{unit}.\n"
            f"- Твой настрой сейчас: {mood}.\n"
            f"- Статус сделки: {status}.\n"
            "Не раскрывай свои скрытые интересы напрямую, если игрок не вывел их вопросами. "
            "Не выходи из роли."
        )
    return (
        f"You role-play the counterpart in a business negotiation. Character: {name} — {desc}.\n"
        "Reply with EXACTLY one short line (1-2 sentences) in English, strictly in character, "
        "no markdown, no explanations, no quotes around the answer.\n"
        "Hard facts you must not contradict:\n"
        f"- Your current offer on the table: {offer}{unit}.\n"
        f"- Your current mood: {mood}.\n"
        f"- Deal status: {status}.\n"
        "Do not reveal your hidden interests unless the player drew them out with questions. "
        "Stay in role."
    )


def build_user(facts: dict) -> str:
    """The turn-specific user message: the player's line + engine reaction to rephrase."""
    lang = facts.get("lang", "ru")
    player_text = facts.get("player_text", "")
    fallback = facts.get("fallback", "")

    if lang == "ru":
        return (
            f'Ориентир твоей реакции по движку (перефразируй в характере, не копируй): "{fallback}"\n\n'
            f"Реплика игрока: {player_text}\n"
            "Твой ответ:"
        )
    return (
        f'Engine reference reaction (rephrase in character, do not copy): "{fallback}"\n\n'
        f"Player said: {player_text}\n"
        "Your reply:"
    )


def build_prompts(facts: dict) -> Tuple[str, str]:
    """Return (system, user) for the chat backend."""
    return build_system(facts), build_user(facts)
