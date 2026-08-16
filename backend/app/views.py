"""views.py — the ONLY adapter between engine internals and the wire protocol.

Everything the WebSocket server needs to turn engine objects into protocol
messages lives here, so main.py stays decoupled from engine field names.
"""

from __future__ import annotations

from app import engine
from app.engine.campaigns import Campaign
from app.protocol import (
    Analysis, Tag, Flags, Deltas, StateView, ScenarioView, Debrief,
    CampaignView, CampaignStageView,
)


def campaign_view(c: "Campaign", lang: str) -> CampaignView:
    stages = []
    for st in c.stages:
        sc = engine.by_id(st.scenario_id)
        stages.append(CampaignStageView(
            scenario_id=st.scenario_id,
            act=st.act[lang],
            intro=st.intro[lang],
            title=sc.title[lang],
            icon=sc.icon,
            difficulty=sc.difficulty,
        ))
    return CampaignView(id=c.id, icon=c.icon, title=c.title[lang], tagline=c.tagline[lang], stages=stages)


def apply_reputation(sess: "engine.Session", reputation: float) -> None:
    """Carry campaign reputation into the next stage as an initial-trust nudge
    (±15 max). Reputation is an initial condition only — scoring is untouched."""
    nudge = max(-15.0, min(15.0, reputation * 0.12))
    sess.state.trust = max(0.0, min(100.0, sess.state.trust + nudge))


# ---- engine → protocol shapes ----------------------------------------------

def scenario_view(sc: "engine.Scenario", lang: str) -> ScenarioView:
    return ScenarioView(
        id=sc.id,
        icon=sc.icon,
        difficulty=sc.difficulty,
        title=sc.title[lang],
        role=sc.role[lang],
        counterpart_name=sc.counterpart.name[lang],
        counterpart_persona=sc.counterpart.persona[lang],
        headline_unit=sc.headline.unit[lang],
        briefing=sc.briefing[lang],
        batna=sc.player_batna.note[lang],
        target=sc.player_target,
        reservation=sc.player_reservation,
    )


def state_view(sess: "engine.Session") -> StateView:
    return StateView(**engine.to_state_view(sess))


def analysis_view(a: "engine.Analysis") -> Analysis:
    return Analysis(
        tags=[Tag(key=t["key"], label=t["label"]) for t in a.tags],
        primary=a.primary,
        arg_quality=a.arg_quality,
        spin=a.spin,
        flags=Flags(**{k: bool(v) for k, v in (a.flags or {}).items() if k in ("hostile", "threat", "question")}),
    )


def deltas_view(result: "engine.MoveResult") -> Deltas:
    d = result.deltas or {}
    return Deltas(
        trust=d.get("trust", 0),
        tension=d.get("tension", 0),
        info=d.get("info", 0),
        leverage=d.get("leverage", 0),
    )


def debrief_view(sess: "engine.Session") -> Debrief:
    return Debrief(**engine.to_debrief(sess))


# ---- AI facts ---------------------------------------------------------------

_MOODS = {
    "ru": {
        "warmed": "потеплел, чувствует уважение", "opened_up": "приоткрылся, делится болью",
        "persuaded": "убеждён данными, готов подвинуться", "pressured": "под давлением, насторожен",
        "collaborated": "настроен на сотрудничество", "hardened": "ожесточился от давления",
        "offended": "обижен резким тоном", "neutral": "нейтрален",
        "not_yet": "ещё не готов пожать руки", "walked_out": "встаёт из-за стола",
    },
    "en": {
        "warmed": "warmed, feels respected", "opened_up": "opening up, sharing pain",
        "persuaded": "persuaded by data, ready to move", "pressured": "under pressure, wary",
        "collaborated": "in a collaborative mood", "hardened": "hardened by pressure",
        "offended": "offended by a harsh tone", "neutral": "neutral",
        "not_yet": "not ready to shake hands", "walked_out": "getting up to leave",
    },
}


def _mood(reaction: str, lang: str) -> str:
    return _MOODS.get(lang, _MOODS["ru"]).get(reaction, _MOODS[lang]["neutral"])


def _last_player_text(sess: "engine.Session") -> str:
    for entry in reversed(sess.log):
        if entry.get("role") == "player":
            return entry.get("text", "")
    return ""


def turning_points(sess: "engine.Session", k: int = 2) -> list[dict]:
    """The 1-2 turns that moved the negotiation most — quoted with what happened,
    so the debrief teaches from the player's ACTUAL words, not generic tips."""
    ru = sess.lang == "ru"
    entries = [e for e in sess.log if e.get("role") == "player" and e.get("deltas")]

    def swing(e):
        d = e["deltas"]
        return max(abs(d.get("trust", 0)), abs(d.get("tension", 0)), abs(d.get("info", 0)))

    top = sorted(entries, key=swing, reverse=True)[:k]
    top = sorted(top, key=lambda e: e.get("turn", 0))  # chronological
    out = []
    for e in top:
        d = e["deltas"]
        parts = []
        if d.get("tension", 0) >= 6:
            parts.append("напряжение подскочило" if ru else "tension spiked")
        elif d.get("tension", 0) <= -6:
            parts.append("напряжение спало" if ru else "tension eased")
        if d.get("trust", 0) >= 6:
            parts.append("доверие выросло" if ru else "trust rose")
        elif d.get("trust", 0) <= -6:
            parts.append("доверие упало" if ru else "trust fell")
        if d.get("info", 0) >= 10:
            parts.append("вы вскрыли интерес" if ru else "you uncovered an interest")
        what = ", ".join(parts) or ("этот ход сдвинул переговоры" if ru else "this move shifted the talk")
        item = {"turn": e.get("turn"), "quote": (e.get("text") or "")[:140], "what": what}
        jn = (e.get("judge") or {}).get("note") if isinstance(e.get("judge"), dict) else None
        if jn:
            item["coach"] = jn
        out.append(item)
    return out


def judge_context(sess: "engine.Session") -> tuple[str, list[str]]:
    """Context + hidden-interest list the semantic judge needs to score a turn
    and identify which interest a question targets."""
    sc = engine.by_id(sess.scenario_id)
    lang = sess.lang
    unit = sc.headline.unit[lang]
    who = "Оппонент" if lang == "ru" else "Counterpart"
    cur = "Текущее предложение оппонента" if lang == "ru" else "Opponent's current offer"
    ctx = (f"{sc.role[lang]} {who}: {sc.counterpart.name[lang]} — {sc.counterpart.persona[lang]}. "
           f"{cur}: {sess.state.offer_opp}{unit}.")
    return ctx, list(sc.hidden_interests[lang])


def build_facts(sess: "engine.Session", result: "engine.MoveResult") -> dict:
    """Assemble the decoupled facts dict the AI layer consumes (fallback added by caller)."""
    sc = engine.by_id(sess.scenario_id)
    lang = sess.lang
    return {
        "lang": lang,
        "persona_name": sc.counterpart.name[lang],
        "persona_desc": sc.counterpart.persona[lang],
        "offer_opp": sess.state.offer_opp,
        "unit": sc.headline.unit[lang],
        "mood": _mood(result.reaction, lang),
        "status": sess.state.status,
        "player_text": _last_player_text(sess),
    }


# ---- fixed lines ------------------------------------------------------------

def greeting_line(sess: "engine.Session", lang: str) -> str:
    sc = engine.by_id(sess.scenario_id)
    name = sc.counterpart.name[lang]
    unit = sc.headline.unit[lang]
    offer = sess.state.offer_opp
    if lang == "ru":
        return f"Здравствуйте. Я {name}. Наше стартовое предложение — {offer}{unit}. С чего начнём?"
    return f"Hello. I'm {name}. Our opening position is {offer}{unit}. Where shall we start?"


def timeout_line(lang: str) -> str:
    if lang == "ru":
        return "У нас вышло время на сегодня. Предлагаю вернуться позже — договориться так и не удалось."
    return "We're out of time for today. Let's revisit later — we couldn't reach agreement."


def compute_hint(sess: "engine.Session", lang: str) -> str:
    """Contextual coaching hint (port of legacy server.js /api/hint)."""
    s = sess.state
    sc = engine.by_id(sess.scenario_id)
    ru = lang == "ru"
    if s.info < 40:
        return ("Вы почти не знаете, что движет оппонентом. Задайте вопрос: «Что для вас важнее всего в этой сделке?»"
                if ru else
                'You barely know what drives them. Ask: "What matters most to you in this deal?"')
    if s.tension > 60:
        return ("Напряжение высокое — уступки заморожены. Признайте их позицию: «Понимаю, откуда вы идёте…»"
                if ru else
                "Tension is high — concessions are frozen. Acknowledge them: \"I understand where you're coming from…\"")
    if sess.metrics.objective_criteria == 0:
        return ("Подкрепите позицию объективным критерием: сошлитесь на рыночные данные или стандарт."
                if ru else
                "Back your position with an objective criterion: cite market data or a standard.")
    if len(s.tradeoffs_used) == 0 and s.info > 40:
        trade = sc.tradeoffs[lang][0].lower()
        return (f"Вы знаете их интересы — предложите размен: «Если мы дадим {trade}, сможете подвинуться по цене?»"
                if ru else
                f"You know their interests — propose a trade: \"If we offer {trade}, can you move on price?\"")
    return ("Хорошая траектория. Двигайтесь к закрытию: назовите число и предложите зафиксировать сделку."
            if ru else
            "Good trajectory. Move to close: name a number and propose to lock the deal.")
