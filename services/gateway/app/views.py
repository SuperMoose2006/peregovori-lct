"""views.py — the ONLY adapter between engine internals and the wire protocol.

Everything the WebSocket server needs to turn engine objects into protocol
messages lives here, so main.py stays decoupled from engine field names.
"""

from __future__ import annotations

from app import engine
from app.engine.campaigns import Campaign
from app.protocol import (
    Analysis, Tag, Flags, Deltas, StateView, ScenarioView, SecondaryIssueView, Debrief,
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
        secondary_issues=[
            SecondaryIssueView(id=iss.id, label=iss.label[lang])
            for iss in getattr(sc, "secondary_issues", [])
        ],
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

# Формулировки БЕЗРОДОВЫЕ: половина персон — женщины, половина мужчины, а факты
# уходят в промпт оппонента. «Потеплел» в фактах про Наталью подталкивает модель
# писать о себе в мужском роде — дефект, который потом видно прямо в реплике.
_MOODS = {
    "ru": {
        "warmed": "стало теплее, чувствует уважение", "opened_up": "открытость: делится болью",
        "persuaded": "довод убедил, есть готовность подвинуться",
        "pressured": "под давлением, настороженность",
        "collaborated": "настрой на сотрудничество", "hardened": "ожесточение от давления",
        "offended": "обида от резкого тона", "neutral": "нейтралитет",
        "not_yet": "до рукопожатия ещё далеко", "walked_out": "встаёт из-за стола",
        "probe_vague": "вопрос слишком общий, просит уточнить",
    },
    "en": {
        "warmed": "warmed, feels respected", "opened_up": "opening up, sharing pain",
        "persuaded": "persuaded by data, ready to move", "pressured": "under pressure, wary",
        "collaborated": "in a collaborative mood", "hardened": "hardened by pressure",
        "offended": "offended by a harsh tone", "neutral": "neutral",
        "not_yet": "not ready to shake hands", "walked_out": "getting up to leave",
        "probe_vague": "the question was too broad, asking to narrow it",
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
        jd = e.get("judge") if isinstance(e.get("judge"), dict) else None
        if jd:
            if jd.get("note"):
                item["coach"] = jd["note"]
            techs = jd.get("techniques")
            if techs:  # recognized technique labels (judge-cam), when present
                item["coach_techniques"] = list(techs)
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


def judge_secondary(sess: "engine.Session") -> list[tuple[str, str]]:
    """(id, label) pairs of the scenario's tradeable secondary issues, so the
    semantic judge can name which one the player concedes. Empty when the
    scenario has none (then the judge simply won't return a secondary id)."""
    sc = engine.by_id(sess.scenario_id)
    lang = sess.lang
    return [(iss.id, iss.label[lang]) for iss in getattr(sc, "secondary_issues", [])]


def build_facts(sess: "engine.Session", result: "engine.MoveResult") -> dict:
    """Assemble the decoupled facts dict the AI layer consumes (fallback added by caller)."""
    sc = engine.by_id(sess.scenario_id)
    lang = sess.lang
    # Interests the player has ALREADY uncovered — the opponent may speak to these
    # (it must not volunteer the ones still hidden). This closes the loop between
    # the judge's understanding and the opponent's actual words.
    ilist = sc.hidden_interests[lang]
    revealed = [ilist[i] for i in sess.state.interests_found if 0 <= i < len(ilist)]
    return {
        "lang": lang,
        "persona_name": sc.counterpart.name[lang],
        "persona_desc": sc.counterpart.persona[lang],
        "style": sc.counterpart.style,          # relationship | tough | analytical
        "offer_opp": sess.state.offer_opp,
        "unit": sc.headline.unit[lang],
        "mood": _mood(result.reaction, lang),
        "status": sess.state.status,
        "revealed_interests": revealed,
        "transcript": _transcript(sess, lang),  # memory: the opponent remembers the dialogue
        "player_text": _last_player_text(sess),
    }


def coach_facts(sess: "engine.Session", lang: str) -> dict:
    """Facts for the AI coach behind the hint button.

    Deliberately a SUBSET of build_facts: the coach sees the meters, the briefing
    and the interests the player has already surfaced — never the hidden ones.
    A hint that spoils the discovery would defeat the whole exercise.
    """
    sc = engine.by_id(sess.scenario_id)
    ilist = sc.hidden_interests[lang]
    revealed = [ilist[i] for i in sess.state.interests_found if 0 <= i < len(ilist)]
    s = sess.state
    return {
        "lang": lang,
        "role": sc.role[lang],
        "persona_name": sc.counterpart.name[lang],
        "persona_desc": sc.counterpart.persona[lang],
        "offer_opp": s.offer_opp,
        "unit": sc.headline.unit[lang],
        "trust": s.trust,
        "tension": s.tension,
        "info": s.info,
        "revealed_interests": revealed,
        "transcript": _transcript(sess, lang),
    }


def debrief_facts(sess: "engine.Session", deb: dict, lang: str) -> dict:
    """Facts for the AI mentor's closing word.

    The mirror image of `coach_facts`: the game is over, so the hidden interests
    ARE included — the teaching moment is showing the player what they never
    asked about. The engine's finished scorecard is passed in verbatim so the
    mentor narrates it instead of inventing a second, competing verdict.
    """
    sc = engine.by_id(sess.scenario_id)
    facts = {
        "lang": lang,
        "role": sc.role[lang],
        "persona_name": sc.counterpart.name[lang],
        "persona_desc": sc.counterpart.persona[lang],
        "hidden_interests": list(sc.hidden_interests[lang]),
        "transcript": _transcript(sess, lang, max_turns=14),
    }
    for k in ("grade", "overall", "economic", "relationship", "technique", "deal_text",
              "status", "interests_found", "interests_total", "objective_criteria",
              "tradeoffs", "threats"):
        facts[k] = deb.get(k)
    facts["engine_tips"] = list(deb.get("tips") or [])
    return facts


def _transcript(sess: "engine.Session", lang: str, max_turns: int = 6) -> str:
    """Recent dialogue so the opponent has memory of its own concessions/words.
    Excludes the current player line (that's passed separately as player_text)."""
    you = "Ты" if lang == "ru" else "You"
    them = "Игрок" if lang == "ru" else "Player"
    prior = sess.log[:-1] if sess.log else []
    recent = [e for e in prior if e.get("role") in ("opp", "player")][-max_turns:]
    return "\n".join(
        f"{you if e['role'] == 'opp' else them}: {(e.get('text') or '').strip()}"
        for e in recent
    )


# ---- fixed lines ------------------------------------------------------------

def greeting_line(sess: "engine.Session", lang: str) -> str:
    sc = engine.by_id(sess.scenario_id)
    name = sc.counterpart.name[lang]
    unit = sc.headline.unit[lang]
    offer = sess.state.offer_opp
    if lang == "ru":
        return f"Здравствуйте. Я {name}. Наше стартовое предложение — {offer}{unit}. С чего начнём?"
    return f"Hello. I'm {name}. Our opening position is {offer}{unit}. Where shall we start?"


def reputation_intro(reputation: float, lang: str) -> str:
    """A campaign opponent references the reputation the player earned in prior
    stages — 'your reputation preceded you'. Empty for a neutral/first stage."""
    if reputation is None:
        return ""
    ru = lang == "ru"
    if reputation >= 45:
        return ("Наслышан — говорят, с вами приятно и по делу вести дела." if ru
                else "I've heard good things — they say you're straight and fair to deal with.")
    if reputation >= 15:
        return ("Слышал, вы уверенно ведёте переговоры." if ru
                else "I hear you drive a confident bargain.")
    if reputation <= -45:
        return ("Наслышан о вашей манере — давайте на этот раз без давления." if ru
                else "I've heard about your style — let's keep the pressure down this time.")
    if reputation <= -15:
        return ("Говорят, с вами бывает непросто договориться." if ru
                else "They say you can be a tough one to settle with.")
    return ""


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
