"""views.py — the ONLY adapter between engine internals and the wire protocol.

Everything the WebSocket server needs to turn engine objects into protocol
messages lives here, so main.py stays decoupled from engine field names.
"""

from __future__ import annotations

from app import engine
from app.engine.campaigns import Campaign
# Печать числа и округление берутся у ДВИЖКА, а не пишутся здесь заново: колонка
# «с той стороны стола» сверяется с браузерным зеркалом посимвольно (инвариант
# 8), и своя арифметика разъехалась бы с ним на первом же 0.5.
from app.engine.engine import REPEAT_HARD, _js_round
from app.engine.format import format_number
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
    return CampaignView(
        id=c.id, icon=c.icon, title=c.title[lang], tagline=c.tagline[lang], stages=stages,
        epilogue={k: v[lang] for k, v in (c.epilogue or {}).items()},
    )


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
    d = engine.to_debrief(sess)
    # Колонка «с той стороны стола» собирается ЗДЕСЬ, а не в `to_debrief`:
    # движок считает партию, адаптер её рассказывает. Ключа нет, если партия не
    # сделала ни одного хода — пустая колонка была бы четвёртым состоянием
    # «выглядит настоящим, а внутри пусто» (принцип 2).
    her = her_side(sess)
    if her is not None:
        d["her_side"] = her
    return Debrief(**d)


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
    """Приветствие БЕЗ цифры — первое слово остаётся за игроком.

    Раньше здесь стояло «Наше стартовое предложение — 1200k ₽»: оппонент
    открывал торг своей ценой на всех девяти столах, и приём, которому учит
    блок «Якорь» (урок 2 — поставить свой первый номер), за столом был
    неисполним ни разу. Инвариант 9 требует обратного: чему учит упражнение,
    то обязано работать в игре.

    Позиция оппонента никуда не делась — она стоит на рельсе `DealTracker` как
    и стояла (это условие стола, как цель и красная линия игрока), и оппонент
    называет её в первой же своей реплике. Изменилось одно: кто произносит
    число первым.
    """
    sc = engine.by_id(sess.scenario_id)
    name = sc.counterpart.name[lang]
    if lang == "ru":
        return f"Здравствуйте. Я {name}. Свою цифру я назову, но начать предлагаю вам — с чего начнём?"
    return f"Hello. I'm {name}. I'll name my figure, but I'd rather you start — where shall we begin?"


def reputation_intro(reputation: float, lang: str) -> str:
    """Оппонент кампании ссылается на репутацию из прошлых актов.

    Пороги и сами строки живут в `campaigns.REPUTATION_LINES` — рядом с
    полосами эпилога, а не отдельной лесенкой `if` здесь. Раньше их было две, и
    разъехаться они могли молча: оппонент здоровался бы «наслышан, вы жёстки», а
    финал хвалил бы за сохранённые отношения. Одна таблица — и офлайн-ядро
    получает её тем же генератором, что и кампании.
    """
    if reputation is None:
        return ""
    from app.engine.campaigns import REPUTATION_LINES, epilogue_key
    line = REPUTATION_LINES.get(epilogue_key(reputation), {})
    return line.get("en" if lang == "en" else "ru", "")


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
        # ТРЕНЕР ЦИТИРУЕТ ТОЛЬКО ТО, ЧТО ДВИЖОК ЗАСЧИТЫВАЕТ. Здесь стояло «Что
        # для вас важнее всего в этой сделке?» — вопрос без темы, то есть ровно
        # тот, на который движок отвечает probe_vague: тренер называл приём и не
        # давал его. Подставляем ТЕМУ ещё не вскрытого интереса — область, а не
        # секрет; тест `test_suggested_lines.py` прогоняет эту цитату через
        # движок на всех столах.
        topics = (sc.interest_topics.get(lang) if sc.interest_topics else None) or []
        rest = [t for i, t in enumerate(topics) if i not in s.interests_found]
        topic = (rest or topics or [""])[0]
        # Ярлык темы идёт в цитату КАК ЕСТЬ, в именительном: «важно в
        # производство» было бы косноязычием, «в этой теме — Производство»
        # склоняться не обязано.
        return (f"Вы почти не знаете, что движет оппонентом. Спросите по теме: «Что для вас важно в этой теме — {topic}?»"
                if ru else
                f'You barely know what drives them. Ask about a topic: "What matters to you here — {topic}?"')
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


# ---- «С той стороны стола» --------------------------------------------------
#
# Разбор говорил, ЧТО случилось: грейд, три шкалы, занавес над интересами,
# ключевые ходы цитатами. Не говорил ПОЧЕМУ — а переносится на следующие
# переговоры только «почему». Вся работа движка, которая и решает партию (откат
# за хамство, порог доверия под вопросом, вето над пустым критерием, память на
# повторы), на экране не была видна нигде.
#
# ЭТО ЧИСТАЯ ФУНКЦИЯ ОТ СОСТОЯНИЯ ДВИЖКА. Ни одного обращения к ИИ: колонка
# собирается из `engine.Session.ledger` — хроники, которую `apply_move` пишет по
# ходу, — и потому полна офлайн (инвариант 5). Судья, если он был, уже
# поучаствовал ВНУТРИ хода: его вето сняло событие, и колонка честно расскажет
# про «слово, а не критерий». Ни один сигнал отсюда не заходит в `score_session`
# (инвариант 6): это послесловие, а не оценка.
#
# ФОРМУЛИРОВКИ БЕЗРОДОВЫЕ — по той же причине, что и `_MOODS` выше, только
# строже: там род путала модель, здесь его выбирали бы МЫ. Половина персон
# мужчины (Дмитрий, Алексей, Сергей, Павел, Виктор, Тимур), половина женщины
# (Ирина, Марина, Наталья), а браузерное зеркало о поле персоны не знает вовсе —
# в `frontend/src/data/scenarios.ts` этого поля нет. Прошедшее время первого
# лица («я убрала») развалило бы либо половину столов, либо паритет. Настоящее
# время работает и там и там — и звучит живее.

#: Обрезка цитаты. Ровно как в `turning_points`: разбор цитирует реплику, а не
#: печатает её целиком.
_QUOTE_MAX = 140


def _short_name(full: str) -> str:
    """«Ирина, глава продаж» → «Ирина». Колонка обращается к персоне по имени, а
    не по должности: должность уже написана на карточке стола."""
    return full.split(",")[0].strip()


#: Реплики оппонента о СОБСТВЕННОМ ходе. Структура — как у `engine.LINES`:
#: общая «base» плюс необязательные варианты под стиль персоны. Стиль читается
#: из сценария (`counterpart.style`), поэтому за одним столом говорит один
#: голос, и Ирина не может заговорить за столом, где сидит Марина.
_HER: dict[str, dict[str, dict[str, str] | list[dict[str, str]]]] = {
    "walked_out": {
        "base": {"ru": "Всё, разговор окончен. Я встаю из-за стола.",
                 "en": "That's it, we're done. I'm getting up from the table."},
        "relationship": {"ru": "Мне жаль, но так дальше нельзя. Я ухожу.",
                         "en": "I'm sorry, but this can't go on. I'm leaving."},
        "tough": {"ru": "Хватит. Мы закончили.",
                  "en": "Enough. We're finished here."},
        "analytical": {"ru": "Дальше считать нечего. Я закрываю папку.",
                       "en": "There's nothing left to compute. I'm closing the file."},
    },
    "closed": {
        "base": {"ru": "По рукам. На этой цифре я подписываю — торговаться больше не о чем.",
                 "en": "Deal. I'll sign at that number — there's nothing left to haggle over."},
        "relationship": {"ru": "По рукам, и мне правда приятно, чем это кончилось. Работаем.",
                         "en": "Deal — and I'm genuinely glad this is how it ended. Let's work."},
        "tough": {"ru": "Ладно. По рукам, пока я не передумал. Дальше — по документам.",
                  "en": "Fine. Deal, before I change my mind. Paperwork next."},
        "analytical": {"ru": "Сходится. На этой цифре подписываю — расчёт закрыт.",
                       "en": "It checks out. I'll sign at that number — the math is closed."},
    },
    "hostile": {
        "base": {"ru": "Это уже не про сделку, а про меня лично. В таком тоне я не работаю — и то, что уже уступил, возвращаю назад.",
                 "en": "That stopped being about the deal and became about me. I don't work in that tone — and the concession goes back."},
        "relationship": {"ru": "Мне просто обидно. Я двигаюсь вам навстречу, а в ответ слышу вот это — уступку возвращаю назад.",
                         "en": "That simply hurts. I keep moving toward you and get this in return — so my concession goes back."},
        "tough": {"ru": "Хамить мне не надо, тут вы соперника не найдёте. Раз так — моё предложение снова прежнее.",
                  "en": "Don't take that tone with me, you won't win that game. Fine — my offer is back where it started."},
        "analytical": {"ru": "К цифрам это отношения не имеет. Возвращаю предложение к исходному — считать будем заново.",
                       "en": "None of that touches the numbers. I'm resetting my offer — we'll count again."},
    },
    "threat_again": {
        "base": {"ru": "Второй ультиматум подряд — это уже не нервы, а способ разговаривать. Половину уступки я забираю обратно.",
                 "en": "A second ultimatum in a row isn't nerves any more, it's a method. Half of my concession goes back."},
        "tough": {"ru": "Давите второй раз — значит, аргументы кончились. Уступку снимаю.",
                  "en": "Pressing twice means the arguments ran out. The concession is off."},
    },
    "threat_backed": {
        "base": {"ru": "Альтернатива у вас и правда есть, и вы её обосновали. Приятного мало, но считаться приходится.",
                 "en": "You do have an alternative, and you backed it up. I don't enjoy it, but I have to reckon with it."},
        "analytical": {"ru": "Альтернатива названа и подкреплена. Это довод, а не давление, — принимаю к расчёту.",
                       "en": "The alternative is named and supported. That's an argument, not pressure — I'll factor it in."},
    },
    "threat_bare": {
        "base": {"ru": "Это прозвучало как угроза без опоры. Напряжение выросло, а двигаться под таким разговором я не стану.",
                 "en": "That landed as a threat with nothing behind it. Tension is up, and I won't move under that."},
        "relationship": {"ru": "Зачем так? Мы же разговаривали по-человечески. Под ультиматум я не подвинусь.",
                         "en": "Why like that? We were talking like people. I won't move under an ultimatum."},
        "tough": {"ru": "Угрозы? Я в этом деле давно. Ничего, кроме напряжения, вы этим не добились.",
                  "en": "Threats? I've been at this a long time. All you got was tension."},
    },
    "batna_backed": {
        "base": {"ru": "Альтернатива названа и подкреплена — это довод, а не пугалка. Приходится считаться.",
                 "en": "The alternative is named and backed — that's an argument, not a scare. I have to reckon with it."},
        "analytical": {"ru": "Альтернатива с цифрами. Такое я кладу в расчёт, а не в спор.",
                       "en": "An alternative with numbers. That goes into my model, not into an argument."},
    },
    "batna_bare": {
        "base": {"ru": "Вы намекаете, что есть кому позвонить кроме меня. Ни цифр, ни условий за этим нет — давит, но не убеждает.",
                 "en": "You're hinting there's someone else you could call. No numbers, no terms behind it — that pushes, but it doesn't persuade."},
        "relationship": {"ru": "Значит, вы уже смотрите на сторону. Мне это неприятно слышать, и ближе мы от этого не стали.",
                         "en": "So you're already looking elsewhere. I don't enjoy hearing that, and it didn't bring us closer."},
        "tough": {"ru": "Альтернатива? Попробуйте. Пока это просто слова.",
                  "en": "An alternative? Go ahead and try. So far those are just words."},
    },
    "bare_offer": {
        "base": {"ru": "Число вы назвали, а чем оно обосновано — нет. Позицию я слышу, повода двигаться не вижу.",
                 "en": "You named a number but not what backs it. I hear the position; I don't hear a reason to move."},
        "analytical": {"ru": "Цифра без модели за ней. Мне не с чем её сопоставить.",
                       "en": "A figure with no model behind it. I have nothing to compare it against."},
        "tough": {"ru": "Просто цифра. И что дальше?",
                  "en": "Just a number. And then what?"},
    },
    "repeat": {
        "base": {"ru": "Вы это уже говорили. Второй раз то же самое не работает — и ответ у меня тот же.",
                 "en": "You've said this already. The same line twice doesn't work — and my answer is the same."},
    },
    "not_yet": {
        "base": {"ru": "Вы предлагаете ударить по рукам, но повода сойтись именно на этой цифре я не вижу. Пока нет.",
                 "en": "You're offering to shake hands, but I see no reason to settle at that number. Not yet."},
        "analytical": {"ru": "Цифра названа, обоснование — нет. Сойтись на ней я не могу.",
                       "en": "The number is named, the rationale isn't. I can't settle there."},
    },
    # САМ СЕКРЕТ ЗДЕСЬ НЕ ЦИТИРУЕТСЯ, и это не экономия слов. Занавес разбора
    # («Что на самом деле было важно») перечисляет интересы дословно карточкой
    # выше — колонка объясняет, ПОЧЕМУ они открылись или нет, а не повторяет их
    # второй раз. Заодно это единственная формулировка, которая переживает
    # паритет: тексты интересов у браузерного каталога короче серверных
    # («Стабильная загрузка» против «Стабильная загрузка производства»), а
    # ярлыки ТЕМ совпадают у обоих до символа.
    # Три варианта на стиль — по числу интересов у стола. Выбор идёт по тому,
    # СКОЛЬКО она уже открыла: первое признание звучит не так, как третье.
    # Одна строка здесь давала «я открываюсь, хотя обычно этого не делаю» три
    # раза подряд в образцовой партии — то есть ровно там, где колонку и будут
    # читать внимательнее всего.
    "revealed": {
        "base": [
            {"ru": "Вы попали в тему: {topic}. Раз спрашиваете по делу — рассказываю то, что обычно держу при себе.",
             "en": "You hit the topic: {topic}. Since you're asking properly, I tell you what I usually keep to myself."},
            {"ru": "И снова по адресу: {topic}. Хорошо, об этом я тоже расскажу.",
             "en": "On target again: {topic}. All right, I'll tell you about that too."},
            {"ru": "Тема: {topic}. Вы разговорили меня окончательно — держать это при себе больше нет смысла.",
             "en": "Topic: {topic}. You've got me talking for good — there's no point holding this back."},
        ],
        "relationship": [
            {"ru": "Вы попали в тему: {topic}. Спрашиваете по-доброму — и я открываюсь, хотя обычно этого не делаю.",
             "en": "You hit the topic: {topic}. You ask kindly — so I open up, which I don't usually do."},
            {"ru": "Опять в точку: {topic}. С вами почему-то легко говорить о своём.",
             "en": "On the nose again: {topic}. Somehow it's easy to talk about my own things with you."},
            {"ru": "И это тоже — {topic}. Ну вот, теперь вы знаете обо мне почти всё.",
             "en": "That as well — {topic}. There, now you know almost everything about me."},
        ],
        "tough": [
            {"ru": "Ладно, тема угадана: {topic}. Скажу коротко и по делу, раз спросили.",
             "en": "Fine, you guessed the topic: {topic}. I'll say it short, since you asked."},
            {"ru": "Снова угадали: {topic}. Ладно, слушайте.",
             "en": "Guessed right again: {topic}. All right, listen."},
            {"ru": "{topic}. Всё, больше вытягивать из меня нечего.",
             "en": "{topic}. That's it, there's nothing left to pull out of me."},
        ],
        "analytical": [
            {"ru": "Вопрос по существу, тема: {topic}. Отвечаю фактом, а не общими словами.",
             "en": "A substantive question, topic: {topic}. I answer with a fact, not generalities."},
            {"ru": "Второй точный вопрос подряд, тема: {topic}. Отвечаю так же прямо.",
             "en": "A second precise question, topic: {topic}. I answer just as directly."},
            {"ru": "Тема: {topic}. Картина у вас теперь полная — работайте с ней.",
             "en": "Topic: {topic}. You have the full picture now — work with it."},
        ],
    },
    "revealed_plain": {
        "base": [
            {"ru": "Вопрос попал в цель. Рассказываю то, что обычно держу при себе.",
             "en": "The question landed. I tell you what I usually keep to myself."},
            {"ru": "И снова в цель. Хорошо, об этом я тоже расскажу.",
             "en": "On target again. All right, I'll tell you about that too."},
            {"ru": "Вы разговорили меня окончательно — держать это при себе больше нет смысла.",
             "en": "You've got me talking for good — there's no point holding this back."},
        ],
        "relationship": [
            {"ru": "Спрашиваете по-доброму — и я открываюсь, хотя обычно этого не делаю.",
             "en": "You ask kindly — so I open up, which I don't usually do."},
            {"ru": "Опять в точку. С вами почему-то легко говорить о своём.",
             "en": "On the nose again. Somehow it's easy to talk about my own things with you."},
            {"ru": "И это тоже. Ну вот, теперь вы знаете обо мне почти всё.",
             "en": "That as well. There, now you know almost everything about me."},
        ],
        "tough": [
            {"ru": "Попали. Скажу коротко, раз спросили.",
             "en": "You landed it. Short version, since you asked."},
            {"ru": "Снова попали. Ладно, слушайте.",
             "en": "Landed it again. All right, listen."},
            {"ru": "Всё, больше вытягивать из меня нечего.",
             "en": "That's it, there's nothing left to pull out of me."},
        ],
        "analytical": [
            {"ru": "Вопрос по существу. Отвечаю фактом, а не общими словами.",
             "en": "A substantive question. I answer with a fact, not generalities."},
            {"ru": "Второй точный вопрос подряд. Отвечаю так же прямо.",
             "en": "A second precise question. I answer just as directly."},
            {"ru": "Картина у вас теперь полная — работайте с ней.",
             "en": "You have the full picture now — work with it."},
        ],
    },
    "gated": {
        "base": {"ru": "Вопрос личный, а доверия между нами ещё нет. Отвечаю вежливо и ни о чём.",
                 "en": "A personal question, and there's no trust between us yet. I answer politely and say nothing."},
        "tough": {"ru": "С чего бы мне это вам рассказывать? Мы даже не разговаривали толком.",
                  "en": "Why would I tell you that? We've barely talked."},
    },
    "probe_vague": {
        "base": {"ru": "Вопрос вежливый, но не про меня. Я не понимаю, о чём именно вы спрашиваете, и отвечаю общим.",
                 "en": "A polite question, but not about me. I don't know what exactly you're asking, so I answer in generalities."},
        "analytical": {"ru": "Вопрос без предмета. Непонятно, какую величину вы хотите узнать, — отвечаю общим.",
                       "en": "A question with no subject. It's unclear what quantity you're after — so I stay general."},
    },
    "term": {
        "base": {"ru": "Вот это разговор: {term} — ровно то, что мне нужно. За это можно и подвинуться по цене.",
                 "en": "Now we're talking: {term} is exactly what I need. For that I can move on price."},
        "tough": {"ru": "{term} — вот это по делу. Ладно, за это подвинусь.",
                  "en": "{term} — that's the real thing. Fine, I'll move for it."},
        "analytical": {"ru": "{term} меняет расчёт в мою сторону. Значит, по цене есть куда идти.",
                       "en": "{term} changes the math in my favour. So there is room on price."},
    },
    "tradeoff": {
        "base": {"ru": "Вы предлагаете обмен, а не просто скидку. Это уже разговор о деле — часть пути я пройду.",
                 "en": "You're proposing a trade, not just a discount. That's a real conversation — I'll come part of the way."},
    },
    "criteria": {
        "base": {"ru": "Цифра, на которую можно опереться. Спорить с рынком мне нечем — двигаюсь.",
                 "en": "A number I can lean on. I have nothing to argue against the market with — so I move."},
        "analytical": {"ru": "Наконец цифра и источник. С этим я работать умею — пересчитываю.",
                       "en": "Finally a number with a source. That I can work with — recalculating."},
    },
    "criteria_hollow": {
        "base": {"ru": "Вы сослались на рынок, но ни цифры, ни источника не назвали. Это слово, а не критерий, — цену оно не двигает.",
                 "en": "You invoked the market but named neither a number nor a source. That's a word, not a criterion — it moves nothing."},
    },
    "warmed": {
        "base": {"ru": "Вы повторили мои же слова — значит, слушали. Напряжение спадает.",
                 "en": "You said my own words back to me — so you were listening. The tension eases."},
        "relationship": {"ru": "Вот так со мной и надо. Меня услышали, и разговаривать сразу легче.",
                         "en": "That's how you talk to me. I feel heard, and it's easier already."},
    },
    "quiet": {
        "base": {"ru": "Ничего нового. Повода двигать цену вы мне не дали.",
                 "en": "Nothing new. You gave me no reason to move my price."},
    },
}

#: Подписи шкал в колонке. Те же четыре, что и на столе.
_METER_LABELS = {
    "trust": {"ru": "Доверие", "en": "Trust"},
    "tension": {"ru": "Напряжение", "en": "Tension"},
    "info": {"ru": "Информация", "en": "Info"},
    "leverage": {"ru": "Рычаг", "en": "Leverage"},
}
_PRICE_LABEL = {"ru": "Цена", "en": "Price"}

#: Приставки и хвосты, которые собираются вокруг реплики.
#: Ярлык темы подставляется КАК ЕСТЬ, в именительном — ровно как в цитате
#: тренера (`compute_hint`). «Вы спросили про оплата» — то, что получается, если
#: склонять чужую строку падежом предлога; тире и двоеточие этого не требуют.
_STILL_CLOSED = {"ru": " А тема «{topic}» так и осталась закрытой.",
                 "en": " And the topic \u201c{topic}\u201d stayed closed."}
#: Связка с занавесом, а НЕ его повтор: там написано, что стояло за темами,
#: здесь — что эти темы так и не были тронуты за столом.
_MISSED = {"ru": "Закрытыми остались темы: {list}. Что за ними стояло, вы узнали не за столом, а из разбора.",
           "en": "The topics that stayed closed: {list}. What sat behind them you learned from the debrief, not from me at the table."}
_MISSED_NONE = {"ru": "Секретов у меня для вас не осталось — вы спросили обо всём.",
                "en": "I have no secrets left for you — you asked about everything."}
#: Реплика, которая открыла бы закрытое. ТА ЖЕ формулировка, что даёт тренер за
#: столом (`compute_hint`): её прогоняет через движок test_suggested_lines.py,
#: поэтому совет здесь — проверенно рабочий ход, а не красивая фраза.
_ASK = {"ru": "Одна реплика открыла бы это: «Что для вас важно в этой теме — {topic}?»",
        "en": "One line would have opened it: \"What matters to you here — {topic}?\""}
_ASK_NO_TOPIC = {"ru": "Одна реплика открыла бы это: спросить, что за этим стоит и почему именно это.",
                 "en": "One line would have opened it: ask what sits behind that, and why exactly that."}


def _her_voice(case: str, style: str, lang: str, pick: int = 0) -> str:
    """Реплика оппонента по случаю. Список вариантов вместо строки — там, где
    один и тот же случай выпадает в партии несколько раз подряд; `pick`
    выбирает вариант ДЕТЕРМИНИРОВАННО, по состоянию, а не случайно."""
    bank = _HER[case]
    entry = bank.get(style) or bank["base"]
    if isinstance(entry, list):
        return entry[pick % len(entry)][lang]
    return entry[lang]


def _meters(entry: dict, lang: str) -> list[str]:
    """Голые числа движка рядом с репликой: колонка объясняет, а доказывает —
    шкала. Порог в единицу, потому что дрожь ±0 читателю ничего не говорит."""
    out: list[str] = []
    d = entry.get("deltas") or {}
    for key in ("trust", "tension", "info", "leverage"):
        v = _js_round(d.get(key, 0))
        if v:
            out.append(f"{_METER_LABELS[key][lang]} {'+' if v > 0 else '−'}{abs(v)}")
    before, after = entry.get("offer_before"), entry.get("offer_after")
    if before is not None and after is not None and before != after:
        out.append(f"{_PRICE_LABEL[lang]} {format_number(before, lang)} → {format_number(after, lang)}")
    return out


def _her_turn(entry: dict, style: str, lang: str, interests: list[str],
              topics: list[str], issue_labels: dict[str, str],
              open_topic: str, opened: int) -> tuple[str, str]:
    """Один ход глазами оппонента: (что она говорит, тон).

    Порядок веток — это ПРИОРИТЕТ, и он тот же, что у самого движка: конец
    партии старше хода, откат старше уступки, грубость старше приёма. Ровно
    поэтому колонка не может разойтись с цифрами рядом с ней."""
    moves = set(entry.get("moves") or [])
    events = list(entry.get("events") or [])
    reaction = entry.get("reaction")
    # `opened` — сколько интересов она открыла ДО этого хода: первое признание
    # звучит не так, как третье.
    say = lambda case: _her_voice(case, style, lang, opened)

    if reaction == "walked_out" or entry.get("status") == "breakdown":
        return say("walked_out"), "bad"
    if entry.get("closed") and entry.get("status") == "agreement":
        return say("closed"), "good"
    if "hostile" in moves:
        return say("hostile"), "bad"
    if "threat" in moves:
        if entry.get("rollback", 0) > 0:
            return say("threat_again"), "bad"
        return (say("threat_backed"), "flat") if "batna" in events else (say("threat_bare"), "bad")
    if "batna" in moves:
        # Событие `batna` возникает только у ОБОСНОВАННОЙ альтернативы — ровно
        # то же различие, что двигает или не двигает цену внутри хода.
        return (say("batna_backed"), "flat") if "batna" in events else (say("batna_bare"), "bad")
    if entry.get("repeat", 0) >= REPEAT_HARD:
        return say("repeat"), "flat"
    if reaction == "not_yet":
        return say("not_yet"), "bad"

    idx = entry.get("revealed")
    if idx is not None and 0 <= idx < len(interests):
        if idx < len(topics) and topics[idx]:
            return say("revealed").format(topic=topics[idx]), "good"
        # У сгенерированного стола («своя сделка») тем нет, и выдумывать их
        # некому — реплика просто обходится без названия темы.
        return say("revealed_plain"), "good"

    traded = [issue_labels[e[5:]] for e in events
              if e.startswith("term:") and e[5:] in issue_labels]
    if traded:
        return say("term").format(term=", ".join(traded)), "good"
    if "tradeoff" in moves:
        return say("tradeoff"), "good"

    if entry.get("gated"):
        tail = _STILL_CLOSED[lang].format(topic=open_topic) if open_topic else ""
        return say("gated") + tail, "bad"
    if reaction == "probe_vague":
        tail = _STILL_CLOSED[lang].format(topic=open_topic) if open_topic else ""
        return say("probe_vague") + tail, "flat"

    if "objective_criteria" in moves:
        return (say("criteria"), "good") if "criteria" in events else (say("criteria_hollow"), "flat")
    if "acknowledge" in moves:
        return say("warmed"), "good"
    if moves & {"offer", "anchor", "concession"}:
        return say("bare_offer"), "flat"
    return say("quiet"), "flat"


def her_side(sess: "engine.Session") -> dict | None:
    """Колонка «с той стороны стола» целиком.

    Занавес над интересами разбор поднимает и без неё; здесь объясняется, ПОЧЕМУ
    невскрытые остались закрытыми — ход за ходом, а не общим советом."""
    ledger = list(getattr(sess, "ledger", None) or [])
    if not ledger:
        return None
    sc = engine.by_id(sess.scenario_id)
    lang = sess.lang if sess.lang in ("ru", "en") else "ru"
    style = sc.counterpart.style
    interests = list(sc.hidden_interests[lang])
    topics = list((sc.interest_topics.get(lang) if sc.interest_topics else None) or [])
    issue_labels = {iss.id: iss.label[lang] for iss in getattr(sc, "secondary_issues", [])}

    # Тема, которая была ещё закрыта НА ТОТ МОМЕНТ, а не в конце партии: упрёк
    # «вы не спросили про оплату» на ходу, где про оплату уже спросили, был бы
    # неправдой. Поэтому множество вскрытого набирается по ходу хроники.
    found: set[int] = set()
    turns: list[dict] = []
    for entry in ledger:
        rest = [i for i in range(len(interests)) if i not in found]
        open_topic = topics[rest[0]] if rest and rest[0] < len(topics) else ""
        said, tone = _her_turn(entry, style, lang, interests, topics, issue_labels,
                               open_topic, len(found))
        idx = entry.get("revealed")
        if idx is not None:
            found.add(idx)
        turns.append({
            "turn": entry.get("turn", len(turns) + 1),
            "quote": (entry.get("text") or "")[:_QUOTE_MAX],
            "said": said,
            "meters": _meters(entry, lang),
            "tone": tone,
        })

    # Итог берётся из СОСТОЯНИЯ, а не из накопленного по хронике: судья умеет
    # вскрыть интерес по смыслу, и правда о вскрытом лежит в `interests_found`.
    unfound = [i for i in range(len(interests)) if i not in set(sess.state.interests_found)]
    if unfound:
        labels = [topics[i] for i in unfound if i < len(topics)] or [interests[i] for i in unfound]
        missed = _MISSED[lang].format(list=", ".join(labels))
        topic = topics[unfound[0]] if unfound[0] < len(topics) else ""
        ask = _ASK[lang].format(topic=topic) if topic else _ASK_NO_TOPIC[lang]
    else:
        missed, ask = _MISSED_NONE[lang], ""
    return {"name": _short_name(sc.counterpart.name[lang]), "turns": turns,
            "missed": missed, "ask": ask}
