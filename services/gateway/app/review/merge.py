"""merge.py — сводка «Глубокого разбора»: время, совпадения, уверенность.

Это «Взвешивание» и «Проверка совпадений» со схемы владельца, и здесь нет ни
одного обращения к модели. Причина та же, что у движка: вывод, который можно
посчитать, считается, а не спрашивается, — тогда он воспроизводим и
проверяется тестом.

ЧТО ДЕЛАЕТ:
  1. Сверяет цитаты агентов с разговором. Цитаты, которой у игрока нет, —
     нет и в отчёте: агент мог её придумать, а придуманный пример хуже
     отсутствующего (принцип 2). Сколько выброшено — пишется.
  2. Ставит каждую находку на время партии: цитата — внутрь хода (для речи —
     пропорционально месту в реплике), пауза и «э-э» — по записи, мимика — по
     кадру. Кадр и речь относятся к ходу, который игрок в этот момент СОЧИНЯЛ.
  3. Ищет совпадения: на одном ходу сошлись признаки из РАЗНЫХ каналов
     (смысл, голос, лицо) — это и есть «совпал таймкод изменения голоса и
     фраза неуверенности». Совпадение в пределах 2,5 с помечено как плотное.
  4. Для каждого вывода считает уверенность системы — по числу примеров и по
     тому, сколько независимых каналов его подтвердили; у компетенций —
     ещё и по тому, сходится ли оценка модели с тем, что посчитал движок.

Счёт движка здесь только ЧИТАЕТСЯ — для сверки направлений. Обратно ничего
не едет: отчёт не входит в `score_session` и не меняет грейд.
"""

from __future__ import annotations

import math
import re
from typing import Any, Callable, Optional

from app.review.agents import COMPETENCIES, CONTENT_AGENTS

#: Пауза, которую стоит назвать: короче — обычный вдох между мыслями.
NOTABLE_PAUSE_MS = 700

#: Совпадение сигналов разных каналов ближе этого — «плотное».
TIGHT_MS = 2_500

#: Соседние кадры с одной мимикой ближе этого — одно событие, а не три.
FACE_MERGE_MS = 4_500

#: Мимика, которая идёт в совпадения «напряжения». Улыбка, кивок и поднятые
#: брови в ленте есть, но с паузой и «наверное» их не связывают: это не
#: признак затруднения.
TENSE_CUES = frozenset({"frown", "wince", "lip_press", "gaze_away", "hand_to_face",
                        "eye_roll", "head_shake"})

#: Что в голосе идёт в совпадения.
VOICE_STRAIN = frozenset({"pause", "filler", "hesitation", "restart", "stutter", "tremor",
                          "pitch_jump", "fading", "trailing_off", "rushed"})

#: Сколько примеров на вывод уезжает клиенту.
MAX_EXAMPLES = 3
MAX_TIMELINE = 60

#: Словарь смягчений — страховка агента уверенности, а не замена ему: слова
#: без контекста ошибаются («немного» бывает количеством). Нужен на двух
#: случаях: агент молчал (тогда он — единственный источник, и уверенность
#: ниже) и агент нашёл то же (тогда находка подтверждена вторым способом).
HEDGES = {
    "ru": ("наверное", "может быть", "возможно", "как бы", "вроде", "кажется", "не уверен",
           "не уверена", "не знаю", "если можно", "попробую", "чуть-чуть", "типа", "короче",
           "в принципе", "как-то"),
    "en": ("maybe", "probably", "perhaps", "i guess", "kind of", "sort of", "not sure",
           "i don't know", "i think maybe", "basically", "you know", "a little bit"),
}

#: Вес каналов в «уверенности речи». Смысл — главный: слова игрок выбирает
#: сам; голос и лицо его дополняют.
_ASSURANCE_WEIGHTS = {"content": 0.5, "voice": 0.3, "video": 0.2}

#: Как сверить компетенцию с движком: число 0..1 из счёта или None.
_ENGINE_HINTS: dict[str, Callable[[dict], Optional[float]]] = {
    "interests": lambda sc: (sc["interests_found"] / sc["interests_total"]
                             if sc.get("interests_total") else None),
    "arguments": lambda sc: min(1.0, (sc.get("objective_criteria") or 0) / 3),
    "value": lambda sc: min(1.0, (sc.get("tradeoffs") or 0) / 2),
    "rapport": lambda sc: (sc["relationship"] / 100 if sc.get("relationship") is not None else None),
    "concessions": lambda sc: (sc["economic"] / 100 if sc.get("economic") is not None else None),
}

#: Сколько примеров нужно, чтобы оценке модели поверить целиком. Меньше —
#: оценка тянется к середине пропорционально: одна цитата не покупает 100%
#: (живая проверка на стенде 19.10: «создание ценности» 100% по одной цитате
#: при нуле разменов в счёте партии).
_FULL_EVIDENCE = 3

#: Вес счёта партии там, где у оси есть пара в нём. Счёт — посчитанное
#: (вскрытые интересы, критерии, размены), модель — прочитанное; сводятся оба.
_ENGINE_WEIGHT = 0.4

#: Расхождение с движком больше этого — «модель и движок расходятся». Четверть
#: шкалы: 30% у модели против «ни одного интереса» у счёта — уже не «так же».
_ENGINE_GAP = 0.25

#: Из чего движок взял своё число — чтобы человек видел не «0%», а «интересов
#: вскрыто 0 из 3». Ключи счёта, а не слова: подпись выбирает клиент.
_ENGINE_BASIS: dict[str, Callable[[dict], Optional[dict]]] = {
    "interests": lambda sc: ({"n": sc["interests_found"], "of": sc["interests_total"]}
                             if sc.get("interests_total") else None),
    "arguments": lambda sc: {"n": sc.get("objective_criteria") or 0},
    "value": lambda sc: {"n": sc.get("tradeoffs") or 0},
    "rapport": lambda sc: ({"n": sc["relationship"], "of": 100} if sc.get("relationship") is not None else None),
    "concessions": lambda sc: ({"n": sc["economic"], "of": 100} if sc.get("economic") is not None else None),
}


# ---------------------------------------------------------------------- цитаты

def _norm(s: str) -> str:
    s = (s or "").lower().replace("ё", "е")
    s = re.sub(r"[^\w\s%]", " ", s)
    return " ".join(s.split())


class Quotes:
    """Сверка цитат с репликами игрока."""

    def __init__(self, player: dict[int, str]) -> None:
        self.player = player
        self._norm = {t: _norm(x) for t, x in player.items()}
        self.dropped = 0

    def locate(self, turn: int, quote: str) -> Optional[int]:
        """Ход, где цитата действительно есть, или None — тогда её нет вовсе.

        ДОСЛОВНО, ЦЕЛЫМИ СЛОВАМИ. Регистр, знаки и «ё» не в счёт, а слова — в
        счёт все и подряд. Прежняя «похожесть» (четыре пятых слов от трёх
        букв) принимала «я готов снижать цену» при сказанном «я НЕ готов» —
        короткое «не» в счёт не шло, и цитата переворачивала смысл; а поиск
        подстрокой находил «ну» внутри «нужно» (ревью 19.10). В кавычках у
        человека может стоять только то, что он сказал.

        Сначала названный ход, потом любой: агент мог ошибиться номером, и
        выбросить настоящую цитату за опечатку в номере — потерять пример.
        """
        q = _norm(quote)
        if len(q) < 2:
            self.dropped += 1
            return None
        needle = f" {q} "
        if turn in self._norm and needle in f" {self._norm[turn]} ":
            return turn
        for t, text in self._norm.items():
            if needle in f" {text} ":
                return t
        self.dropped += 1
        return None


# ---------------------------------------------------------------------- время

def quote_ms(timing: dict[int, dict], player: dict[int, str], turn: int, quote: str) -> Optional[int]:
    """Где внутри хода прозвучала цитата: для речи — по месту в реплике."""
    info = timing.get(turn) or {}
    start, end = info.get("start_ms"), info.get("end_ms")
    if start is None:
        return info.get("at_ms")
    if end is None or end <= start:
        return start
    text, q = _norm(player.get(turn, "")), _norm(quote)
    pos = text.find(q)
    frac = (pos / max(1, len(text))) if pos >= 0 else 0.0
    return int(start + frac * (end - start))


def _ev(channel: str, kind: str, turn: Optional[int], at_ms: Optional[int], *,
        text: str = "", value: Optional[float] = None) -> dict:
    out: dict[str, Any] = {"channel": channel, "kind": kind, "turn": turn, "at_ms": at_ms}
    if text:
        out["text"] = text
    if value is not None:
        out["value"] = value
    return out


def _confidence(examples: int, channels: int = 1, adjust: float = 0.0) -> float:
    """Уверенность системы в выводе: примеры насыщают, каналы подтверждают."""
    base = 0.2 + 0.5 * (1 - math.exp(-examples / 3)) + 0.1 * max(0, channels - 1)
    return round(min(0.95, max(0.05, base + adjust)), 2)


def _ratio(num: float, den: float) -> Optional[float]:
    return round(num / den, 2) if den else None


# ---------------------------------------------------------------------- сводка

def build_report(*, facts: dict, timing: dict[int, dict], content: dict[str, Optional[dict]],
                 voice: Optional[dict], face: Optional[dict], channels: dict,
                 agents: list[dict]) -> dict:
    """Собрать отчёт.

    content  — ответы агентов смысла по id; None — агент не ответил.
    voice    — {"turns": {ход: {"clips": [{"at_ms", "features", "events"}], "voiced_ms"}}}
               или None, если голоса не было.
    face     — {"frames": [{"turn", "at_ms", "cues"}]} или None, если камеры не было.
    timing   — ход → {"at_ms", "source", "start_ms", "end_ms"}.
    """
    lang = facts.get("lang", "ru")
    player = {ln["turn"]: ln["text"] for ln in facts.get("lines") or [] if ln["role"] == "player"}
    quotes = Quotes(player)
    # Слова СОБЕСЕДНИКА сверяются так же, как слова игрока: его вопрос стоит в
    # отчёте в кавычках с подписью «собеседник», и выдуманный вопрос был бы
    # приписан ему — а заодно вошёл бы в долю отвеченных (ревью 19.10).
    said: dict[int, str] = {0: facts.get("greeting") or ""} if facts.get("greeting") else {}
    for ln in facts.get("lines") or []:
        if ln["role"] == "opp":
            said[ln["turn"]] = (said.get(ln["turn"], "") + " " + ln["text"]).strip()
    theirs = Quotes(said)
    turns = sorted(player)
    last_turn = turns[-1] if turns else 0
    timeline: list[dict] = []
    per_turn: dict[int, dict[str, list[dict]]] = {}

    def note(ev: dict, *, strain: bool = False, listed: bool = True) -> dict:
        # В ленту — сигналы, а не всё подряд: удачная цитата под компетенцией
        # живёт в карточке компетенции, а лента отвечает на «что и когда
        # происходило» — паузы, мимика, смягчения, пропущенные вопросы.
        if listed:
            timeline.append(ev)
        if strain and ev.get("turn") is not None:
            per_turn.setdefault(ev["turn"], {}).setdefault(ev["channel"], []).append(ev)
        return ev

    def cite(turn: Any, quote: str, kind: str, *, strain: bool = False,
             extra: Optional[str] = None, listed: Optional[bool] = None) -> Optional[dict]:
        t = quotes.locate(int(turn), quote)
        if t is None:
            return None
        ev = _ev("content", kind, t, quote_ms(timing, player, t, quote), text=quote)
        if extra:
            ev["note"] = extra
        return note(ev, strain=strain, listed=strain if listed is None else listed)

    # ---------------------------------------------------------- уверенность речи
    conf = content.get("confidence")
    hedge_evs: list[dict] = []
    lexicon_hits: list[tuple[int, str]] = []
    for turn, text in player.items():
        low = _norm(text)
        for word in HEDGES.get(lang, HEDGES["ru"]):
            if re.search(rf"(?<!\w){re.escape(_norm(word))}(?!\w)", low):
                lexicon_hits.append((turn, word))
    if conf is not None:
        for m in conf["markers"]:
            ev = cite(m["turn"], m["quote"], m["kind"], strain=True)
            if ev is not None:
                ev["corroborated"] = any(t == ev["turn"] and _norm(w) in _norm(m["quote"])
                                         for t, w in lexicon_hits)
                hedge_evs.append(ev)
    else:
        # Агент не ответил — словарь остаётся единственным источником, и это
        # видно: пометка `lexicon`, уверенность ниже.
        for turn, word in lexicon_hits:
            ev = note(_ev("content", "hedge", turn, quote_ms(timing, player, turn, word),
                          text=word), strain=True)
            ev["lexicon"] = True
            hedge_evs.append(ev)

    # ---------------------------------------------------------- голос
    voice_evs: list[dict] = []
    voice_turns: list[dict] = []
    voiced_ms_total = 0
    if voice:
        for turn, info in sorted(voice.get("turns", {}).items()):
            t = min(int(turn), last_turn) if last_turn else int(turn)
            pauses, jumps, fading, events = 0, 0, False, 0
            longest = 0
            for clip in info.get("clips", []):
                f = clip.get("features") or {}
                base = int(clip.get("at_ms") or 0)
                for p in f.get("pauses", []):
                    if p["dur_ms"] >= NOTABLE_PAUSE_MS:
                        pauses += 1
                        longest = max(longest, p["dur_ms"])
                        voice_evs.append(note(_ev("voice", "pause", t, base + p["at_ms"],
                                                  value=p["dur_ms"]), strain=True))
                for j in f.get("pitch_jumps", []):
                    jumps += 1
                    voice_evs.append(note(_ev("voice", "pitch_jump", t, base + j["at_ms"],
                                              value=j["st"]), strain=True))
                if f.get("fading"):
                    fading = True
                    voice_evs.append(note(_ev("voice", "fading", t,
                                              base + max(0, int(f.get("dur_ms", 0)) - 1000)),
                                          strain=True))
                for e in clip.get("events") or []:
                    events += 1
                    voice_evs.append(note(_ev("voice", e["kind"], t, base + int(e["t"] * 1000),
                                              text=e.get("text", "")),
                                          strain=e["kind"] in VOICE_STRAIN))
            voiced = int(info.get("voiced_ms") or 0)
            voiced_ms_total += voiced
            words = len(_norm(player.get(t, "")).split())
            voice_turns.append({
                "turn": t, "voiced_ms": voiced,
                "wpm": round(words / (voiced / 60000)) if voiced >= 1500 and words else None,
                "pauses": pauses, "longest_pause_ms": longest or None,
                "pitch_jumps": jumps, "fading": fading, "events": events,
            })

    # ---------------------------------------------------------- лицо
    face_evs: list[dict] = []
    cue_counts: dict[str, int] = {}
    frames_seen = 0
    tense_frames = 0
    if face:
        open_: dict[str, dict] = {}
        for fr in sorted(face.get("frames", []), key=lambda x: x["at_ms"]):
            frames_seen += 1
            t = min(int(fr["turn"]), last_turn) if last_turn else int(fr["turn"])
            cues = fr.get("cues") or []
            if TENSE_CUES & set(cues):
                tense_frames += 1
            for code in cues:
                cue_counts[code] = cue_counts.get(code, 0) + 1
                prev = open_.get(code)
                if prev is not None and fr["at_ms"] - prev["_last"] <= FACE_MERGE_MS and prev["turn"] == t:
                    prev["value"] = fr["at_ms"] - prev["at_ms"]
                    prev["_last"] = fr["at_ms"]
                    continue
                ev = _ev("video", code, t, fr["at_ms"])
                ev["_last"] = fr["at_ms"]
                open_[code] = ev
                face_evs.append(note(ev, strain=code in TENSE_CUES))
        for ev in face_evs:
            ev.pop("_last", None)

    # ---------------------------------------------------------- прочие агенты смысла
    soft: list[dict] = []

    def soft_item(sid: str, value: Optional[float], examples: list[dict], *, num: Optional[float] = None,
                  den: Optional[float] = None, channels_used: int = 1, agent_ok: bool = True,
                  adjust: float = 0.0) -> None:
        if not agent_ok:
            soft.append({"id": sid, "value": None, "confidence": None, "unavailable": True,
                         "examples": []})
            return
        soft.append({"id": sid, "value": value, "num": num, "den": den,
                     "confidence": _confidence(len(examples), channels_used, adjust)
                     if value is not None else None,
                     "examples": examples[:MAX_EXAMPLES]})

    # Уверенность речи — сводная, из трёх каналов.
    parts: dict[str, float] = {}
    if player:
        parts["content"] = len({e["turn"] for e in hedge_evs}) / len(player)
    if voice and voiced_ms_total >= 3000:
        strain = sum(1 for e in voice_evs if e["kind"] in VOICE_STRAIN)
        # На минуту речи, но не меньше чем на полминуты: две заминки в трёх
        # секундах — это не «сорок в минуту», а две заминки.
        parts["voice"] = min(1.0, strain / max(0.5, voiced_ms_total / 60000) / 8)
    if face and frames_seen:
        parts["video"] = tense_frames / frames_seen
    if parts:
        w = sum(_ASSURANCE_WEIGHTS[k] for k in parts)
        level = sum(_ASSURANCE_WEIGHTS[k] * v for k, v in parts.items()) / w
        examples = sorted(hedge_evs + [e for e in voice_evs if e["kind"] in VOICE_STRAIN]
                          + [e for e in face_evs if e["kind"] in TENSE_CUES],
                          key=lambda e: (e.get("at_ms") is None, e.get("at_ms") or 0))
        soft_item("assurance", round(1 - level, 2), examples,
                  num=len({e["turn"] for e in hedge_evs}), den=len(player),
                  channels_used=len(parts),
                  adjust=-0.15 if conf is None else 0.0)
        soft[-1]["channels"] = {k: round(v, 2) for k, v in parts.items()}

    spec = content.get("specificity")
    if spec is not None:
        good = [e for e in (cite(x["turn"], x["quote"], x["kind"]) for x in spec["specific"]) if e]
        bad = [e for e in (cite(x["turn"], x["quote"], "generic") for x in spec["generic"]) if e]
        soft_item("specificity", _ratio(len(good), len(good) + len(bad)), bad + good,
                  num=len(good), den=len(good) + len(bad))
    else:
        soft_item("specificity", None, [], agent_ok=False)

    think = content.get("thinking")
    if think is not None:
        declared = [e for e in (cite(x["turn"], x["quote"], x["kind"]) for x in think["declared"]) if e]
        unspoken = []
        for x in think["unspoken"]:
            if x["turn"] in player:
                unspoken.append(note(_ev("content", "unspoken", x["turn"],
                                         (timing.get(x["turn"]) or {}).get("at_ms"), text=x["note"])))
        for x in think["shifts"]:
            ev = cite(x["turn"], x["quote"], "shift", listed=True)
            if ev is not None and x.get("note"):
                ev["note"] = x["note"]
        asked = [e for e in (cite(x["turn"], x["quote"], "question") for x in think["questions"]) if e]
        soft_item("declaration", _ratio(len(declared), len(declared) + len(unspoken)),
                  unspoken + declared, num=len(declared), den=len(declared) + len(unspoken))
        soft[-1]["questions"] = len(asked)
    else:
        soft_item("declaration", None, [], agent_ok=False)

    comp = content.get("comprehension")
    if comp is not None:
        score, examples = 0.0, []
        for q in comp["questions"]:
            if theirs.locate(q["turn"], q["question"]) is None:
                continue
            score += {"full": 1.0, "partial": 0.5, "no": 0.0}[q["answered"]]
            at_turn = q.get("answer_turn") or min(q["turn"] + 1, last_turn or q["turn"] + 1)
            ev = _ev("content", f"answer_{q['answered']}", at_turn,
                     (timing.get(at_turn) or {}).get("at_ms"), text=q["question"])
            # Цитата ответа доказывает ответ, только если она из ЭТОГО хода.
            if q.get("quote") and quotes.locate(at_turn, q["quote"]) == at_turn:
                ev["quote"] = q["quote"]
            examples.append(note(ev, strain=q["answered"] == "no", listed=q["answered"] == "no"))
        examples.sort(key=lambda e: e["kind"] != "answer_no")
        soft_item("comprehension", _ratio(score, len(examples)), examples,
                  num=score, den=len(examples))
    else:
        soft_item("comprehension", None, [], agent_ok=False)

    fol = content.get("followups")
    if fol is not None:
        steady, examples = 0, []
        for f in fol["followups"]:
            if theirs.locate(f["turn"], f["probe"]) is None:
                continue
            steady += f["handling"] == "steady"
            at_turn = f.get("answer_turn") or f["turn"] + 1
            ev = _ev("content", f"followup_{f['handling']}", at_turn,
                     (timing.get(at_turn) or {}).get("at_ms"), text=f["probe"])
            if f.get("quote") and quotes.locate(at_turn, f["quote"]) == at_turn:
                ev["quote"] = f["quote"]
            examples.append(note(ev, strain=f["handling"] != "steady",
                                 listed=f["handling"] != "steady"))
        examples.sort(key=lambda e: e["kind"] == "followup_steady")
        soft_item("followups", _ratio(steady, len(examples)), examples,
                  num=steady, den=len(examples))
    else:
        soft_item("followups", None, [], agent_ok=False)

    cons = content.get("consistency")
    if cons is not None:
        examples = []
        for c in cons["contradictions"]:
            a = quotes.locate(c["turn_a"], c["quote_a"])
            b = quotes.locate(c["turn_b"], c["quote_b"])
            # Обе цитаты нашлись в одной реплике — это не противоречие ходов.
            if a is None or b is None or a == b:
                continue
            ev = _ev("content", "contradiction", b, quote_ms(timing, player, b, c["quote_b"]),
                     text=c["quote_b"])
            ev.update({"quote_a": c["quote_a"], "turn_a": a, "note": c["note"]})
            examples.append(note(ev, strain=True))
        value = (round(max(0.0, 1 - len(examples) / 3), 2) if len(player) >= 3 else None)
        soft_item("consistency", value, examples, num=len(examples), den=None,
                  adjust=0.1 if not examples and len(player) >= 5 else 0.0)
    else:
        soft_item("consistency", None, [], agent_ok=False)

    fac = content.get("facts")
    if fac is not None:
        # «Во вводной этого нет» — не ошибка: так выглядит и блеф, и довод из
        # жизни. Доля считается по тому, что можно СВЕРИТЬ: совпало или
        # разошлось; непроверяемое показано, но в число не входит.
        examples, matches, contradicts = [], 0, 0
        for c in fac["claims"]:
            ev = cite(c["turn"], c["quote"], f"claim_{c['verdict']}",
                      strain=c["verdict"] == "contradicts", listed=c["verdict"] != "matches")
            if ev is None:
                continue
            matches += c["verdict"] == "matches"
            contradicts += c["verdict"] == "contradicts"
            if c.get("brief"):
                ev["brief"] = c["brief"]
            if c.get("note"):
                ev["note"] = c["note"]
            examples.append(ev)
        examples.sort(key=lambda e: {"claim_contradicts": 0, "claim_unsupported": 1}.get(e["kind"], 2))
        soft_item("facts", _ratio(matches, matches + contradicts), examples,
                  num=matches, den=matches + contradicts)
        soft[-1]["unchecked"] = len(examples) - matches - contradicts
    else:
        soft_item("facts", None, [], agent_ok=False)

    # ---------------------------------------------------------- компетенции
    scorecard = facts.get("scorecard") or {}
    competencies: list[dict] = []
    compet = content.get("competency")
    if compet is not None:
        for item in compet["competencies"]:
            pro = [e for e in (cite(x["turn"], x["quote"], "pro") for x in item["pro"]) if e]
            con = []
            for x in item["con"]:
                ev = cite(x["turn"], x["quote"], "con", extra=x.get("why") or None)
                if ev:
                    con.append(ev)
            hint = _ENGINE_HINTS.get(item["id"])
            engine_value = None
            adjust = 0.0
            if hint is not None:
                try:
                    engine_value = hint(scorecard)
                except (KeyError, TypeError, ZeroDivisionError):
                    engine_value = None
            # ВЗВЕШИВАНИЕ. Модель выставила число — сводка решает, сколько ему
            # верить: по примерам в его пользу (за высокую — цитаты «получилось»,
            # за низкую — «не получилось») и по счёту партии, если у оси есть
            # пара. Число модели едет рядом как есть: человек видит обе стороны.
            backing = len(pro) if item["score"] >= 0.5 else len(con)
            shown = 0.5 + (item["score"] - 0.5) * min(1.0, backing / _FULL_EVIDENCE)
            agrees = None
            basis = None
            if engine_value is not None:
                shown = (1 - _ENGINE_WEIGHT) * shown + _ENGINE_WEIGHT * engine_value
                agrees = abs(item["score"] - engine_value) <= _ENGINE_GAP
                adjust = 0.15 if agrees else -0.25
                try:
                    basis = _ENGINE_BASIS[item["id"]](scorecard)
                except (KeyError, TypeError):
                    basis = None
            competencies.append({
                "id": item["id"], "score": round(shown, 2), "model_score": round(item["score"], 2),
                "confidence": _confidence(len(pro) + len(con), 1, adjust),
                "pro": pro[:MAX_EXAMPLES], "con": con[:MAX_EXAMPLES],
                "engine": round(engine_value, 2) if engine_value is not None else None,
                "engine_agrees": agrees,
                "engine_basis": basis,
            })

    # ---------------------------------------------------------- совпадения
    convergences = []
    for turn in sorted(per_turn):
        by_channel = per_turn[turn]
        if len(by_channel) < 2:
            continue
        signals = []
        for ch in ("content", "voice", "video"):
            signals += by_channel.get(ch, [])[:2]
        timed = [e["at_ms"] for e in signals if e.get("at_ms") is not None]
        tight = False
        chans = {e["channel"]: [e["at_ms"] for e in by_channel[e["channel"]] if e.get("at_ms") is not None]
                 for e in signals}
        names = list(chans)
        for i, a in enumerate(names):
            for b in names[i + 1:]:
                if any(abs(x - y) <= TIGHT_MS for x in chans[a] for y in chans[b]):
                    tight = True
        convergences.append({
            "turn": turn, "at_ms": min(timed) if timed else None, "tight": tight,
            "channels": sorted(by_channel), "signals": signals[:5],
        })
    convergences.sort(key=lambda c: (not c["tight"], -len(c["channels"]), c["turn"]))

    timeline.sort(key=lambda e: (e.get("at_ms") is None, e.get("at_ms") or 0, e.get("turn") or 0))
    by_id = {a.id for a in CONTENT_AGENTS}
    return {
        "version": 1,
        "lang": lang,
        "affects_score": False,
        "agents": agents,
        "agents_ok": sum(1 for a in agents if a.get("ok")),
        "agents_total": len(agents),
        "channels": channels,
        "competencies": competencies,
        "competency_order": list(COMPETENCIES),
        "soft": soft,
        "voice": ({"turns": voice_turns, "voiced_ms": voiced_ms_total} if voice else None),
        "face": ({"frames": frames_seen, "cues": cue_counts, "tense_frames": tense_frames}
                 if face else None),
        "convergences": convergences[:12],
        "timeline": timeline[:MAX_TIMELINE],
        "timeline_total": len(timeline),
        "dropped_quotes": quotes.dropped + theirs.dropped,
        "content_agents": sorted(by_id),
    }
