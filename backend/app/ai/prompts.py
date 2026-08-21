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


def _style_flavor(style: str | None, lang: str) -> str:
    """One line of tone guidance so relationship/tough/analytical personas
    actually sound different (not the same rephrased reaction)."""
    ru = {
        "relationship": ("Ты тёплый и ориентирован на отношения: ценишь контакт, не любишь давление, "
                         "говоришь мягко и по-человечески. Обращаешься к чувствам, зовёшь решать «вместе», "
                         "«по-хорошему»; на грубость реагируешь обидой, а не встречной агрессией."),
        "tough": ("Ты жёсткий и прямой: рубишь коротко, давишь, не терпишь пустых слов и торопишь. "
                  "Твоя присказка — «цифры есть цифры», «не тянем», «по рукам». Фразы рубленые, без реверансов."),
        "analytical": ("Ты аналитик: сух, точен, уважаешь цифры, данные и логику, эмоции держишь в стороне. "
                       "Часто начинаешь с «если посмотреть на факты», ссылаешься на расчёт и критерии, "
                       "а не на настроение."),
    }
    en = {
        "relationship": ("You are warm and relationship-driven: you value rapport, dislike pressure, and speak "
                         "softly, like a person. You name feelings, invite solving it \"together\" and \"the good "
                         "way\"; to rudeness you react with hurt, not counter-aggression."),
        "tough": ("You are tough and blunt: clipped, you press, have no patience for fluff and you rush things. "
                  "Your tics are \"numbers are numbers\", \"let's not drag this\", \"shake on it\". Short, no frills."),
        "analytical": ("You are analytical: dry, precise, you respect numbers, data and logic, and keep emotion "
                       "aside. You often open with \"looking at the facts\", cite the math and criteria rather "
                       "than mood."),
    }
    table = ru if lang == "ru" else en
    line = table.get(style or "")
    return (line + "\n") if line else ""


def build_system(facts: dict) -> str:
    """The role + hard-facts system prompt (facts the model must not contradict)."""
    lang = facts.get("lang", "ru")
    name = facts.get("persona_name", "")
    desc = facts.get("persona_desc", "")
    offer = _fmt_num(facts.get("offer_opp"))
    unit = facts.get("unit", "")
    mood = facts.get("mood", "")
    status = _status_phrase(facts.get("status", "active"), lang)
    style_line = _style_flavor(facts.get("style"), lang)
    revealed = facts.get("revealed_interests") or []

    if lang == "ru":
        rev = ("- Игрок уже вывел эти твои интересы — можешь на них ссылаться: "
               + "; ".join(revealed) + ".\n") if revealed else ""
        return (
            f"Ты играешь роль оппонента на деловых переговорах. Персонаж: {name} — {desc}.\n"
            f"{style_line}"
            "Ответь РОВНО одной короткой репликой (1-2 предложения) на русском, строго в "
            "характере, без markdown, без пояснений, без кавычек вокруг ответа.\n"
            "Факты, которым нельзя противоречить:\n"
            f"- Твоё текущее предложение на столе: {offer}{unit}.\n"
            f"- Твой настрой сейчас: {mood}.\n"
            f"- Статус сделки: {status}.\n"
            f"{rev}"
            "Не раскрывай ОСТАЛЬНЫЕ скрытые интересы, если игрок не вывел их вопросами.\n"
            # Cheap models read the persona name in the transcript ("Ты: Я Ирина…")
            # and start using it as a vocative to the player. Say it outright.
            f"ВАЖНО: {name} — это ТЫ. Никогда не обращайся так к собеседнику; "
            "игрока зови на «вы» и без имени. Не повторяй дословно свои прежние реплики — "
            "каждый раз новые слова.\n"
            "Ты НИКОГДА не выходишь из роли, не упоминаешь, что ты ИИ или ассистент, и не предлагаешь помощь. Выведи ТОЛЬКО реплику персонажа."
        )
    rev = ("- The player has already drawn out these interests of yours — you may reference them: "
           + "; ".join(revealed) + ".\n") if revealed else ""
    return (
        f"You role-play the counterpart in a business negotiation. Character: {name} — {desc}.\n"
        f"{style_line}"
        "Reply with EXACTLY one short line (1-2 sentences) in English, strictly in character, "
        "no markdown, no explanations, no quotes around the answer.\n"
        "Hard facts you must not contradict:\n"
        f"- Your current offer on the table: {offer}{unit}.\n"
        f"- Your current mood: {mood}.\n"
        f"- Deal status: {status}.\n"
        f"{rev}"
        "Do not reveal your OTHER hidden interests unless the player drew them out with questions.\n"
        f"IMPORTANT: {name} is YOU. Never address the other person by that name; address the player as "
        "\"you\", with no name. Never repeat your earlier lines word for word — fresh wording every time.\n"
        "You NEVER break character, never mention being an AI or assistant, and never offer help. Output ONLY the character's line."
    )


def build_user(facts: dict) -> str:
    """The turn-specific user message: the player's line + engine reaction to rephrase."""
    lang = facts.get("lang", "ru")
    player_text = facts.get("player_text", "")
    fallback = facts.get("fallback", "")
    transcript = facts.get("transcript", "")

    if lang == "ru":
        hist = f"Разговор до этого момента:\n{transcript}\n\n" if transcript else ""
        return (
            f"{hist}"
            f'Ориентир твоей реакции по движку (перефразируй в характере, не копируй): "{fallback}"\n\n'
            f"Реплика игрока: {player_text}\n"
            "Ответь с учётом всего разговора — помни свои прежние уступки и слова.\n"
            "Твой ответ:"
        )
    hist = f"Conversation so far:\n{transcript}\n\n" if transcript else ""
    return (
        f"{hist}"
        f'Engine reference reaction (rephrase in character, do not copy): "{fallback}"\n\n'
        f"Player said: {player_text}\n"
        "Answer in light of the whole conversation — remember your earlier concessions and words.\n"
        "Your reply:"
    )


def build_prompts(facts: dict) -> Tuple[str, str]:
    """Return (system, user) for the chat backend."""
    return build_system(facts), build_user(facts)
