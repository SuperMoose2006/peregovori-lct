"""engine.py — faithful Python port of legacy-node/engine/engine.js.

The deterministic negotiation engine. It owns game state, decides how the AI
counterpart reacts to each player move, moves the price/terms inside the ZOPA,
and produces a coaching debrief at the end.

The SAME concession can be earned the productive way (uncover interests, use
objective criteria, trade across issues, keep trust high) or the destructive
way (threats, hostility). The engine rewards the former with better economics
AND relationship, and punishes the latter with tension that freezes concessions.

Every numeric constant and formula is identical to the reference JS.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Optional

from .scenarios import Scenario, by_id
from .techniques import Analysis, analyze, norm


def _js_round(x: float) -> int:
    """Replicate JS Math.round (round half toward +infinity)."""
    return math.floor(x + 0.5)


def _round2(x: float) -> float:
    """Replicate JS  Math.round(x * 100) / 100."""
    return _js_round(x * 100) / 100


def _js_num(n: float) -> str:
    """Format a number the way JS String(number) would (no trailing .0)."""
    f = float(n)
    if f.is_integer():
        return str(int(f))
    return repr(f)


def clamp(v: float, lo: float = 0, hi: float = 100) -> float:
    return max(lo, min(hi, v))


# ---- State containers -------------------------------------------------------

@dataclass
class GameState:
    trust: float = 40
    tension: float = 25
    info: float = 0            # % of hidden interests uncovered
    leverage: float = 0        # grows as you cite criteria/BATNA well
    offer_opp: float = 0       # opponent's current number on the table
    offer_player: Optional[float] = None
    interests_found: list[int] = field(default_factory=list)
    tradeoffs_used: list[int] = field(default_factory=list)
    terms_conceded: list[str] = field(default_factory=list)  # ids of secondary issues traded
    deal: Optional[float] = None
    status: str = "active"     # active | agreement | breakdown


@dataclass
class Metrics:
    move_counts: dict[str, int] = field(default_factory=dict)
    arg_quality_sum: float = 0
    arg_quality_n: int = 0
    threats: int = 0
    hostiles: int = 0
    empathy: int = 0
    objective_criteria: int = 0
    spin_stages: set = field(default_factory=set)
    interest_probes: int = 0


@dataclass
class Session:
    id: str
    scenario_id: str
    lang: str
    lower_better: bool
    created_turn: int
    max_turns: int
    turn: int
    state: GameState
    metrics: Metrics
    log: list = field(default_factory=list)
    last_player_norm: str = ""  # anti-gaming: detect repeated identical lines


@dataclass
class MoveResult:
    reaction: str
    deltas: dict[str, float]
    closed: bool
    concession_fraction: float
    analysis: Analysis


def create_session(scenario_id: str, lang: str = "ru") -> Session:
    sc = by_id(scenario_id)
    if not sc:
        raise ValueError("unknown scenario")
    lower_better = sc.headline.dir == "lower_is_better"

    return Session(
        id="sess_" + "".join(random.choice("0123456789abcdefghijklmnopqrstuvwxyz") for _ in range(8)),
        scenario_id=scenario_id,
        lang=lang,
        lower_better=lower_better,
        created_turn=0,
        max_turns=12,
        turn=0,
        state=GameState(
            trust=40,
            tension=25,
            info=0,
            leverage=sc.player_batna.strength * 0.4,
            offer_opp=sc.opponent_open,
            offer_player=None,
            interests_found=[],
            tradeoffs_used=[],
            deal=None,
            status="active",
        ),
        metrics=Metrics(),
        log=[],
    )


def flexibility(sess: Session) -> float:
    """How willing the opponent is, right now, to move toward the player (0..1)."""
    s = sess.state
    trust_part = s.trust / 100
    info_part = s.info / 100
    leverage_part = clamp(s.leverage) / 100
    tension_penalty = s.tension / 100
    raw = 0.45 * trust_part + 0.3 * info_part + 0.25 * leverage_part - 0.5 * tension_penalty
    return clamp(raw, 0, 1)


def _concede(sess: Session, fraction: float) -> None:
    """Move opponent's number a fraction of the remaining distance to their floor."""
    sc = by_id(sess.scenario_id)
    s = sess.state
    floor = sc.opponent_reservation
    dist = floor - s.offer_opp  # signed; toward player
    s.offer_opp = _round2(s.offer_opp + dist * fraction)


def _acceptable(sess: Session, number: float) -> bool:
    """Is a proposed number acceptable to the opponent given their floor?"""
    sc = by_id(sess.scenario_id)
    if sess.lower_better:
        return number >= sc.opponent_reservation - 0.001
    return number <= sc.opponent_reservation + 0.001


def _match_secondary_issues(sc: Scenario, cur_norm: str, lang: str,
                            judge: dict | None) -> list:
    """Which secondary issues is the player conceding on THIS trade-off?

    Semantic judge (if it names one by id via `secondary_conceded`) is
    authoritative — it read the meaning. Otherwise fall back to offline keyword
    detection, which can match several issues offered in one breath. Returns the
    SecondaryIssue objects (deduped by id, order preserved)."""
    if not sc.secondary_issues:
        return []
    if judge is not None:
        jid = judge.get("secondary_conceded")
        if jid:
            for iss in sc.secondary_issues:
                if iss.id == jid:
                    return [iss]
            return []  # judge spoke and named nothing valid → trust it, no keyword guess
    out = []
    for iss in sc.secondary_issues:
        kws = iss.keywords.get(lang, [])
        if any(k in cur_norm for k in kws):
            out.append(iss)
    return out


def apply_move(sess: Session, analysis: Analysis, raw_text: str = "",
               judge: dict | None = None) -> MoveResult:
    """The reactive core. Given the analyzed utterance, update meters, possibly
    move the opponent's offer, and choose a reply.

    Optional `judge` (semantic AI judgement, CLAUDE.md option C) refines two
    things while the engine keeps owning all state/scoring: it overrides the
    keyword arg-quality with a meaning-based score, and reveals the interest the
    question ACTUALLY targeted instead of the next one in list order. When judge
    is None the behaviour is exactly the deterministic keyword path (offline)."""
    sc = by_id(sess.scenario_id)
    s = sess.state
    m = sess.metrics
    style = sc.counterpart.style

    # Semantic judge overrides keyword arg-quality (resists buzzword spam).
    if judge is not None and judge.get("arg_score") is not None:
        analysis.arg_quality = int(judge["arg_score"])

    # Anti-gaming: repeating the exact same line barely works — the opponent
    # notices, and it stops padding your technique score.
    cur_norm = norm(raw_text)
    repeated = bool(cur_norm) and cur_norm == sess.last_player_norm
    sess.last_player_norm = cur_norm
    if repeated:
        analysis.arg_quality = min(analysis.arg_quality, 12)

    before = {
        "trust": s.trust,
        "tension": s.tension,
        "info": s.info,
        "leverage": s.leverage,
        "offer_opp": s.offer_opp,
    }

    # Track metrics.
    m.move_counts[analysis.primary] = m.move_counts.get(analysis.primary, 0) + 1
    m.arg_quality_sum += analysis.arg_quality
    m.arg_quality_n += 1
    if analysis.spin:
        m.spin_stages.add(analysis.spin)

    def has(k: str) -> bool:
        return k in analysis.moves

    reaction = "neutral"
    concession_fraction = 0.0

    # --- Empathy / active listening: always cools tension, builds trust. -------
    if has("acknowledge"):
        s.trust = clamp(s.trust + 8)
        s.tension = clamp(s.tension - 10)
        m.empathy += 1
        reaction = "warmed"

    # --- SPIN & interest probing: uncover hidden interests. --------------------
    judge_interest = judge.get("interest_targeted") if judge else None
    if (analysis.spin or has("interests_probe") or judge_interest is not None) and not repeated:
        total = len(sc.hidden_interests[sess.lang])
        revealed = False
        if s.trust > 30:
            if judge_interest is not None and 0 <= judge_interest < total and judge_interest not in s.interests_found:
                # Reveal the interest the question ACTUALLY targeted (semantic).
                s.interests_found.append(judge_interest)
                revealed = True
            elif judge is None and len(s.interests_found) < total:
                # Offline fallback: reveal next in order (deterministic).
                s.interests_found.append(len(s.interests_found))
                revealed = True
        gain_base = 22 if analysis.spin in ("implication", "need-payoff") else 14
        gain = gain_base + (10 if has("interests_probe") else 0)
        # With the judge on, a vague question that hit no real interest earns little.
        if judge is not None and not revealed:
            gain = min(gain, 5)
        s.info = clamp(s.info + gain)
        s.trust = clamp(s.trust + 4)
        s.tension = clamp(s.tension - 3)
        if has("interests_probe") or judge_interest is not None:
            m.interest_probes += 1
        reaction = "warmed" if reaction == "warmed" else "opened_up"

    # --- Objective criteria: legitimate leverage. ------------------------------
    if has("objective_criteria"):
        s.leverage = clamp(s.leverage + 16)
        s.trust = clamp(s.trust + 3)
        m.objective_criteria += 1
        if style == "analytical":
            s.leverage = clamp(s.leverage + 6)
        reaction = "persuaded"

    # --- BATNA / alternatives: leverage, but risky. ----------------------------
    if has("batna"):
        backed = has("objective_criteria") or analysis.arg_quality > 55
        s.leverage = clamp(s.leverage + (18 if backed else 10))
        s.tension = clamp(s.tension + (4 if backed else 14))
        if style == "relationship":
            s.tension = clamp(s.tension + 6)
        reaction = "pressured"

    # --- Trade-off / logrolling: value creation. -------------------------------
    if has("tradeoff"):
        s.trust = clamp(s.trust + 6)
        s.tension = clamp(s.tension - 4)
        bonus = 0.12 + 0.18 * (s.info / 100)
        concession_fraction += bonus
        tset = sc.tradeoffs[sess.lang]
        if len(s.tradeoffs_used) < len(tset):
            s.tradeoffs_used.append(len(s.tradeoffs_used))
        reaction = "collaborated"
        # Structured logrolling (scenarios with secondary_issues only): trading a
        # concrete issue the opponent values unlocks a genuine SECOND axis of
        # price movement, scaled by how much they want it. Cheap-for-you /
        # valuable-for-them trades are the whole point. Scenarios with no
        # secondary_issues keep exactly the flat tradeoff behaviour above.
        for iss in _match_secondary_issues(sc, cur_norm, sess.lang, judge):
            if iss.id not in s.terms_conceded:
                s.terms_conceded.append(iss.id)
                concession_fraction += 0.10 + 0.30 * iss.opp_value
                s.trust = clamp(s.trust + 3 + 4 * iss.opp_value)

    # --- Threat / ultimatum: leverage up, relationship down. -------------------
    if has("threat"):
        m.threats += 1
        s.tension = clamp(s.tension + 22)
        s.trust = clamp(s.trust - 14)
        s.leverage = clamp(s.leverage + 6)
        if style == "tough":
            s.tension = clamp(s.tension + 8)
        reaction = "hardened"

    # --- Hostility: pure damage. -----------------------------------------------
    if has("hostile"):
        m.hostiles += 1
        s.tension = clamp(s.tension + 26)
        s.trust = clamp(s.trust - 22)
        reaction = "offended"

    # --- Rapport / small talk early is fine. -----------------------------------
    if has("rapport"):
        s.trust = clamp(s.trust + 5)
        s.tension = clamp(s.tension - 4)

    # --- Player states an offer number (incl. while closing). ------------------
    if analysis.number is not None and (
        has("offer") or has("anchor") or has("concession") or has("accept") or has("tradeoff")
    ):
        s.offer_player = analysis.number

    # --- Compute concession from productive pressure. --------------------------
    flex = flexibility(sess)
    concession_fraction += 0.10 + 0.34 * flex
    if has("objective_criteria"):
        concession_fraction += 0.12
    if analysis.spin or has("interests_probe"):
        concession_fraction += 0.05
    if has("acknowledge"):
        concession_fraction += 0.03
    if has("threat") and s.leverage > 45 and s.tension < 80:
        concession_fraction += 0.06
    if s.offer_player is not None:
        gap = (s.offer_opp - s.offer_player) if sess.lower_better else (s.offer_player - s.offer_opp)
        if gap > 0:
            concession_fraction += min(0.08, gap * 0.01)
    if s.tension > 75:
        concession_fraction *= 0.25
    elif s.tension > 55:
        concession_fraction *= 0.6
    if repeated:
        concession_fraction *= 0.15  # repeating the same line won't move them
    concession_fraction = clamp(concession_fraction, 0, 0.7)

    if concession_fraction > 0.01:
        _concede(sess, concession_fraction)

    # --- Closing: player tries to accept / lock a deal. ------------------------
    closed = False
    if has("accept"):
        if s.offer_player is not None:
            w = 0.3 + 0.45 * flex
            meeting = s.offer_opp + (s.offer_player - s.offer_opp) * w
            if sess.lower_better:
                meeting = max(meeting, sc.opponent_reservation)
            else:
                meeting = min(meeting, sc.opponent_reservation)
            meeting = _round2(meeting)
        else:
            meeting = s.offer_opp
        if _acceptable(sess, meeting):
            s.deal = meeting
            s.status = "agreement"
            closed = True
        else:
            reaction = "not_yet"

    # --- Breakdown check. ------------------------------------------------------
    if s.tension >= 100 or s.trust <= 3:
        s.status = "breakdown"
        closed = True
        reaction = "walked_out"

    deltas = {
        "trust": s.trust - before["trust"],
        "tension": s.tension - before["tension"],
        "info": s.info - before["info"],
        "leverage": s.leverage - before["leverage"],
        "offer_opp": _round2(s.offer_opp - before["offer_opp"]),
    }

    return MoveResult(
        reaction=reaction,
        deltas=deltas,
        closed=closed,
        concession_fraction=concession_fraction,
        analysis=analysis,
    )


# -----------------------------------------------------------------------------
# Dialogue generation (templated, in-character).
# -----------------------------------------------------------------------------

LINES: dict[str, dict[str, list[str]]] = {
    "ru": {
        "warmed": [
            "Приятно, что вы это понимаете. Тогда давайте по делу.",
            "Спасибо, редко кто слышит нашу сторону. Продолжим.",
        ],
        "opened_up": [
            "Хороший вопрос… Честно говоря, для нас критично {interest}.",
            "Раз уж вы спросили — нас правда беспокоит {interest}.",
        ],
        "persuaded": [
            "С такими данными спорить сложно. Могу подвинуться — сейчас {offer}{unit}.",
            "Ладно, цифры говорят сами за себя. Пусть будет {offer}{unit}.",
        ],
        "pressured": [
            "Слышал про ваши альтернативы. Но давайте без ультиматумов — {offer}{unit}.",
            "Понимаю, что у вас есть варианты. Готов обсуждать, {offer}{unit}.",
        ],
        "collaborated": [
            "Вот это уже интересно. Если так, то {offer}{unit} — реально.",
            "Такой размен нам подходит. Тогда {offer}{unit}.",
        ],
        "hardened": [
            "Давление здесь не поможет. Моя позиция прежняя — {offer}{unit}.",
            "В таком тоне мне сложно двигаться. Остаюсь на {offer}{unit}.",
        ],
        "offended": [
            "Я бы попросил без перехода на личности.",
            "Так мы точно ни о чём не договоримся.",
        ],
        "neutral": [
            "Хорошо, я вас понял. Пока моё предложение — {offer}{unit}.",
            "Принято. На данный момент — {offer}{unit}.",
        ],
        "not_yet": [
            "Пока рано пожимать руки — {offer}{unit} моё текущее предложение.",
            "Ещё не сходимся. Сейчас у меня {offer}{unit}.",
        ],
        "walked_out": [
            "Знаете, наверное, нам стоит взять паузу. На этом остановимся.",
            "Боюсь, продолжать в таком ключе бессмысленно. Всего доброго.",
        ],
        "agreement": [
            "По рукам! Договорились на {deal}{unit}. Рад иметь с вами дело.",
            "Отлично, фиксируем {deal}{unit}. Было приятно вести переговоры.",
        ],
    },
    "en": {
        "warmed": [
            "I appreciate that you get it. Let's get to business.",
            "Thanks — few people hear our side. Go on.",
        ],
        "opened_up": [
            "Good question… Honestly, what matters to us is {interest}.",
            "Since you ask — we really care about {interest}.",
        ],
        "persuaded": [
            "Hard to argue with those numbers. I can move — {offer}{unit} now.",
            "Fair, the data speaks for itself. Let's say {offer}{unit}.",
        ],
        "pressured": [
            "I hear you have alternatives. But no ultimatums — {offer}{unit}.",
            "I know you have options. Happy to talk, {offer}{unit}.",
        ],
        "collaborated": [
            "Now that's interesting. On those terms, {offer}{unit} is doable.",
            "That trade works for us. Then {offer}{unit}.",
        ],
        "hardened": [
            "Pressure won't help here. My position stands — {offer}{unit}.",
            "I can't move in that tone. Staying at {offer}{unit}.",
        ],
        "offended": [
            "I'd ask you to keep this professional.",
            "This isn't going anywhere like that.",
        ],
        "neutral": [
            "Understood. For now my offer is {offer}{unit}.",
            "Noted. At this point — {offer}{unit}.",
        ],
        "not_yet": [
            "Too early to shake hands — {offer}{unit} is where I am.",
            "We're not there yet. Right now I'm at {offer}{unit}.",
        ],
        "walked_out": [
            "You know, maybe we should take a break. Let's stop here.",
            "I'm afraid there's no point continuing like this. Good day.",
        ],
        "agreement": [
            "Deal! {deal}{unit} it is. A pleasure doing business.",
            "Great, we lock {deal}{unit}. Good negotiating with you.",
        ],
    },
}


def _pick(arr: list[str], seed: int) -> str:
    return arr[seed % len(arr)]


def render_line(sess: Session, reaction: str, closed: bool) -> str:
    sc = by_id(sess.scenario_id)
    s = sess.state
    lang = sess.lang
    unit = sc.headline.unit[lang]
    bank = LINES[lang]
    key = reaction
    if closed and s.status == "agreement":
        key = "agreement"
    if closed and s.status == "breakdown":
        key = "walked_out"
    arr = bank.get(key) or bank["neutral"]
    line = _pick(arr, sess.turn + len(s.interests_found))
    interest_list = sc.hidden_interests[lang]
    if s.interests_found:
        last_interest = interest_list[s.interests_found[-1]]
    else:
        last_interest = interest_list[0]
    return (
        line.replace("{offer}", _js_num(s.offer_opp))
        .replace("{deal}", _js_num(s.deal) if s.deal is not None else _js_num(s.offer_opp))
        .replace("{unit}", unit)
        .replace("{interest}", (last_interest or "").lower())
    )


# -----------------------------------------------------------------------------
# Scoring & debrief
# -----------------------------------------------------------------------------

def score_session(sess: Session) -> dict:
    sc = by_id(sess.scenario_id)
    s = sess.state
    m = sess.metrics
    lang = sess.lang

    # 1) Economic score: where did we land inside the ZOPA?
    economic = 0
    unit = sc.headline.unit[lang]
    if s.status == "agreement" and s.deal is not None:
        t = sc.player_target
        r = sc.player_reservation
        ratio = (s.deal - r) / (t - r)
        economic = clamp(_js_round(ratio * 100))
        deal_text = f"{_js_num(s.deal)}{unit}"
    elif s.status == "breakdown":
        economic = 0
        deal_text = "Сделка сорвалась" if lang == "ru" else "Deal broke down"
    else:
        economic = 10
        deal_text = "Без соглашения" if lang == "ru" else "No agreement"

    # 2) Relationship score.
    relationship = clamp(_js_round(s.trust - s.tension * 0.6 + 30))

    # 3) Technique score — variety and appropriateness.
    spin_count = len(m.spin_stages)
    avg_arg = (m.arg_quality_sum / m.arg_quality_n) if m.arg_quality_n else 0
    technique = 0
    technique += min(24, spin_count * 8)
    technique += 16 if m.objective_criteria > 0 else 0
    technique += 14 if m.interest_probes > 0 else 0
    technique += 12 if len(s.interests_found) >= len(sc.hidden_interests[lang]) else len(s.interests_found) * 4
    technique += 12 if len(s.tradeoffs_used) > 0 else 0
    technique += 8 if m.empathy > 0 else 0
    technique += _js_round((avg_arg / 100) * 14)
    technique -= m.hostiles * 12
    technique -= max(0, m.threats - 1) * 6
    # Package signal — ONLY for scenarios with a structured logrolling axis, so
    # scoring is byte-identical for scenarios without secondary_issues. Reward
    # trading issues the opponent values (high opp_value) and lightly discount
    # giving away things costly to the player (high player_cost). Folded into
    # technique with a small weight; capped so it can't dominate the dimension.
    if sc.secondary_issues:
        package = 0.0
        for iss in sc.secondary_issues:
            if iss.id in s.terms_conceded:
                package += 10 * iss.opp_value - 6 * iss.player_cost
        technique += clamp(package, -10, 16)
    technique = clamp(_js_round(technique))

    overall = clamp(_js_round(0.4 * economic + 0.25 * relationship + 0.35 * technique))

    grade = (
        "A" if overall >= 85 else
        "B" if overall >= 70 else
        "C" if overall >= 55 else
        "D" if overall >= 40 else
        "F"
    )

    # Technique floor: A/B must be EARNED with method, not bought with a good
    # number. Landing a great price while ignoring interests/criteria/trade-offs
    # (technique < 45) caps the grade at C — the Harvard thesis, not haggling.
    if technique < 45 and grade in ("A", "B"):
        grade = "C"

    tips: list[str] = []

    def T(ru: str, en: str) -> None:
        tips.append(ru if lang == "ru" else en)

    if spin_count < 2:
        T("Задавайте больше вопросов по SPIN (Проблема → Последствия), чтобы вскрыть боль второй стороны.",
          "Ask more SPIN questions (Problem → Implication) to surface the other side's pain.")
    if m.objective_criteria == 0:
        T("Опирайтесь на объективные критерии (рыночные данные, стандарты) — это легитимный рычаг по Гарвардскому методу.",
          "Anchor on objective criteria (market data, standards) — legitimate leverage per the Harvard method.")
    if len(s.interests_found) < len(sc.hidden_interests[lang]):
        T("Вы вскрыли не все скрытые интересы. За позициями всегда стоят интересы — ищите «почему».",
          "You didn't surface every hidden interest. Behind positions lie interests — dig for the \"why\".")
    if m.interest_probes == 0:
        T("Переходите от позиций к интересам: спрашивайте, что и почему важно для оппонента.",
          "Move from positions to interests: ask what matters to them and why.")
    if len(s.tradeoffs_used) == 0:
        T("Создавайте ценность разменом по нескольким вопросам (логроллинг), а не только торгом по цене.",
          "Create value by trading across issues (logrolling), not just haggling on price.")
    if m.empathy == 0:
        T("Используйте активное слушание — отражайте слова оппонента, чтобы снизить напряжение.",
          "Use active listening — paraphrase them to lower tension.")
    if m.threats > 1 or m.hostiles > 0:
        T("Меньше давления и перехода на личности: напряжение замораживает уступки.",
          "Less pressure and personal attacks: tension freezes concessions.")
    if sc.player_batna.strength > 55 and m.move_counts.get("batna", 0) == 0:
        T("У вас была сильная BATNA — стоило её аккуратно упомянуть как рычаг.",
          "You had a strong BATNA — worth citing it carefully as leverage.")
    if len(tips) == 0:
        T("Отличная работа — чистое применение принципиальных переговоров.",
          "Excellent — a clean application of principled negotiation.")

    return {
        "overall": int(overall),
        "grade": grade,
        "economic": int(economic),
        "relationship": int(relationship),
        "technique": int(technique),
        "deal_text": deal_text,
        "status": s.status,
        "interests_found": len(s.interests_found),
        "interests_total": len(sc.hidden_interests[lang]),
        "spin_stages": spin_count,
        "objective_criteria": m.objective_criteria,
        "empathy": m.empathy,
        "threats": m.threats,
        "hostiles": m.hostiles,
        "tradeoffs": len(s.tradeoffs_used),
        "avg_arg": _js_round(avg_arg),
        "tips": tips,
    }


# -----------------------------------------------------------------------------
# View helpers producing the protocol shapes (StateView / Debrief).
# -----------------------------------------------------------------------------

def to_state_view(sess: Session) -> dict:
    """Public slice of game state (mirrors legacy server.js publicState).

    Note: leverage in the StateView is round(flexibility*100), NOT the raw
    leverage meter — matching the legacy server.
    """
    s = sess.state
    sc = by_id(sess.scenario_id)
    return {
        "trust": _js_round(s.trust),
        "tension": _js_round(s.tension),
        "info": _js_round(s.info),
        "leverage": _js_round(flexibility(sess) * 100),
        "offer_opp": s.offer_opp,
        "offer_player": s.offer_player,
        "interests_found": len(s.interests_found),
        "interests_total": len(sc.hidden_interests[sess.lang]),
        "terms_conceded": list(s.terms_conceded),
        "status": s.status,
        "turn": sess.turn,
        "max_turns": sess.max_turns,
    }


def to_debrief(sess: Session) -> dict:
    """Produce the Debrief shape from score_session (drops the extra `hostiles`
    field that is not part of the protocol Debrief)."""
    d = score_session(sess)
    return {
        "overall": d["overall"],
        "grade": d["grade"],
        "economic": d["economic"],
        "relationship": d["relationship"],
        "technique": d["technique"],
        "deal_text": d["deal_text"],
        "status": d["status"],
        "interests_found": d["interests_found"],
        "interests_total": d["interests_total"],
        "spin_stages": d["spin_stages"],
        "objective_criteria": d["objective_criteria"],
        "empathy": d["empathy"],
        "threats": d["threats"],
        "tradeoffs": d["tradeoffs"],
        "avg_arg": d["avg_arg"],
        "tips": d["tips"],
    }
