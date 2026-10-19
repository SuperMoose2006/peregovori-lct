"""agents.py — агенты «Глубокого разбора»: что спросить и как прочитать ответ.

Восемь агентов читают СМЫСЛ (по схеме владельца), девятый слушает ГОЛОС,
десятый смотрит МИМИКУ. Каждый — отдельный вызов с узкой задачей: узкий вопрос
дешёвая модель решает заметно лучше, чем «оцени всё сразу», и падение одного
агента не роняет остальные.

ОБЩИЕ ПРАВИЛА ДЛЯ ВСЕХ:
  - ответ — строго JSON, разбирается здесь и проверяется: незнакомые коды и
    поля выбрасываются, числа обрезаются в пределы;
  - каждая ссылка на речь игрока — ход и ДОСЛОВНАЯ цитата. Цитату потом
    сверяет сводка (`merge.py`): чего нет в разговоре, то выбрасывается;
  - никаких выводов о чувствах и личности: агент описывает речь, а не человека.

Ничего отсюда не входит в счёт: агенты получают уже сыгранную партию и не
возвращают ничего, что движок прочитал бы.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Callable, Optional

from app.perception.vision import CUES

#: Восемь компетенций переговорщика. Порядок — порядок карточек в разборе.
COMPETENCIES = ("interests", "listening", "arguments", "value",
                "concessions", "pressure", "rapport", "closing")

_COMPETENCY_TEXT = {
    "ru": {
        "interests": "выяснение интересов: вопросы о том, что стоит за позицией",
        "listening": "слушание: перефраз, опора на сказанное собеседником",
        "arguments": "аргументы: объективные критерии, рынок, данные",
        "value": "создание ценности: размены, пакеты, второстепенные условия",
        "concessions": "уступки и якорь: первая цифра, шаг уступок, условие за уступку",
        "pressure": "устойчивость к давлению: спокойствие на нажим, без капитуляции",
        "rapport": "отношения и тон: уважение, эмпатия, без угроз",
        "closing": "фиксация: резюме договорённостей, следующий шаг",
    },
    "en": {
        "interests": "uncovering interests: questions about what is behind a position",
        "listening": "listening: paraphrase, building on what the counterpart said",
        "arguments": "arguments: objective criteria, market, data",
        "value": "creating value: trade-offs, packages, secondary terms",
        "concessions": "concessions and anchor: first number, concession steps, getting something back",
        "pressure": "resilience under pressure: calm when pushed, no capitulation",
        "rapport": "relationship and tone: respect, empathy, no threats",
        "closing": "closing: summarising agreements, next step",
    },
}

#: Что агент голоса может услышать. Закрытый список — по той же причине, что и
#: у мимики: ни одна строка модели не доезжает до человека без перевода в код.
VOICE_KINDS = ("filler", "hesitation", "restart", "stutter", "tremor",
               "laugh", "sigh", "rushed", "trailing_off")

#: Виды пометок агента уверенности.
CONFIDENCE_KINDS = ("hedge", "softener", "self_doubt", "apology", "filler_word")


@dataclass(frozen=True)
class ContentAgent:
    id: str
    task: dict[str, str]          # задача агента, ru/en
    schema: str                   # форма JSON-ответа
    parse: Callable[[dict], dict]
    #: Нужна ли агенту вводная целиком (цифры, альтернатива). Остальным хватает
    #: роли и описания: лишние числа только отвлекают дешёвую модель.
    needs_brief: bool = False
    max_tokens: int = 900


# ---------------------------------------------------------------------- разбор

def extract_json(text: Optional[str]) -> Optional[dict]:
    """Первый JSON-объект из ответа модели; markdown-ограды допустимы."""
    if not text:
        return None
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    try:
        data = json.loads(m.group(0))
    except Exception:
        return None
    return data if isinstance(data, dict) else None


def _int(v: Any, lo: int = 0, hi: int = 999) -> Optional[int]:
    try:
        n = int(v)
    except (TypeError, ValueError):
        return None
    return n if lo <= n <= hi else None


def _str(v: Any, cap: int = 200) -> str:
    if not isinstance(v, str):
        return ""
    s = " ".join(v.split()).strip().strip('"«»')
    return s[:cap]


def _items(data: dict, key: str, cap: int = 12) -> list[dict]:
    raw = data.get(key)
    return [x for x in raw[:cap] if isinstance(x, dict)] if isinstance(raw, list) else []


def _quote(item: dict, turn_key: str = "turn", quote_key: str = "quote") -> Optional[dict]:
    turn, quote = _int(item.get(turn_key), 0), _str(item.get(quote_key), 160)
    if turn is None or not quote:
        return None
    return {"turn": turn, "quote": quote}


def _parse_confidence(data: dict) -> dict:
    out = []
    for item in _items(data, "markers", 20):
        q = _quote(item)
        kind = _str(item.get("kind"), 20)
        if q and kind in CONFIDENCE_KINDS:
            out.append({**q, "kind": kind})
    return {"markers": out}


def _parse_competency(data: dict) -> dict:
    found: dict[str, dict] = {}
    for item in _items(data, "competencies", 12):
        cid = _str(item.get("id"), 20)
        if cid not in COMPETENCIES or cid in found:
            continue
        try:
            score = float(item.get("score"))
        except (TypeError, ValueError):
            continue
        if score != score:     # NaN
            continue
        # Модель иногда отвечает по сто-балльной шкале, хотя просили долю: «70»
        # — это 70 из 100, а не «больше единицы, значит 100%». Число вне обеих
        # шкал — не ответ, а мусор, и выдумывать за него оценку нельзя.
        if 1 < score <= 100:
            score /= 100
        if not 0 <= score <= 1:
            continue
        pro = [q for q in (_quote(x) for x in _items(item, "pro", 3)) if q]
        con = []
        for x in _items(item, "con", 3):
            q = _quote(x)
            if q:
                con.append({**q, "why": _str(x.get("why"), 160)})
        found[cid] = {"id": cid, "score": round(score, 3), "pro": pro, "con": con}
    return {"competencies": [found[c] for c in COMPETENCIES if c in found]}


def _parse_thinking(data: dict) -> dict:
    declared = []
    for item in _items(data, "declared", 12):
        q = _quote(item)
        kind = _str(item.get("kind"), 20)
        if q and kind in ("position", "reasoning", "conclusion", "proposal"):
            declared.append({**q, "kind": kind})
    unspoken = []
    for item in _items(data, "unspoken", 8):
        turn, note = _int(item.get("turn"), 0), _str(item.get("note"), 200)
        if turn is not None and note:
            unspoken.append({"turn": turn, "note": note})
    questions = [q for q in (_quote(x) for x in _items(data, "questions", 12)) if q]
    shifts = []
    for item in _items(data, "shifts", 8):
        q = _quote(item)
        if q:
            shifts.append({**q, "note": _str(item.get("note"), 160)})
    return {"declared": declared, "unspoken": unspoken, "questions": questions, "shifts": shifts}


def _parse_specificity(data: dict) -> dict:
    specific = []
    for item in _items(data, "specific", 14):
        q = _quote(item)
        kind = _str(item.get("kind"), 20)
        if q and kind in ("number", "example", "fact", "deadline"):
            specific.append({**q, "kind": kind})
    generic = [q for q in (_quote(x) for x in _items(data, "generic", 14)) if q]
    return {"specific": specific, "generic": generic}


def _parse_comprehension(data: dict) -> dict:
    out = []
    for item in _items(data, "questions", 14):
        turn = _int(item.get("turn"), 0)
        question = _str(item.get("question"), 200)
        answered = _str(item.get("answered"), 10)
        if turn is None or not question or answered not in ("full", "partial", "no"):
            continue
        entry = {"turn": turn, "question": question, "answered": answered,
                 "answer_turn": _int(item.get("answer_turn"), 1)}
        quote = _str(item.get("quote"), 160)
        if quote and entry["answer_turn"] is not None:
            entry["quote"] = quote
        out.append(entry)
    return {"questions": out}


def _parse_followups(data: dict) -> dict:
    out = []
    for item in _items(data, "followups", 12):
        turn = _int(item.get("turn"), 0)
        handling = _str(item.get("handling"), 12)
        probe = _str(item.get("probe"), 200)
        if turn is None or not probe or handling not in ("steady", "defensive", "evasive", "conceded"):
            continue
        entry = {"turn": turn, "probe": probe, "handling": handling,
                 "answer_turn": _int(item.get("answer_turn"), 1)}
        quote = _str(item.get("quote"), 160)
        if quote and entry["answer_turn"] is not None:
            entry["quote"] = quote
        out.append(entry)
    return {"followups": out}


def _parse_consistency(data: dict) -> dict:
    out = []
    for item in _items(data, "contradictions", 8):
        a = _quote(item, "turn_a", "quote_a")
        b = _quote(item, "turn_b", "quote_b")
        if a and b and a["turn"] != b["turn"]:
            out.append({"turn_a": a["turn"], "quote_a": a["quote"],
                        "turn_b": b["turn"], "quote_b": b["quote"],
                        "note": _str(item.get("note"), 200)})
    return {"contradictions": out}


def _parse_facts(data: dict) -> dict:
    out = []
    for item in _items(data, "claims", 14):
        q = _quote(item)
        verdict = _str(item.get("verdict"), 14)
        if q and verdict in ("matches", "contradicts", "unsupported"):
            out.append({**q, "verdict": verdict, "brief": _str(item.get("brief"), 200),
                        "note": _str(item.get("note"), 200)})
    return {"claims": out}


# ---------------------------------------------------------------------- агенты

_Q = '{"turn": <номер хода игрока>, "quote": "<дословная цитата игрока, до 12 слов>"}'
_Q_EN = '{"turn": <player turn number>, "quote": "<verbatim player quote, up to 12 words>"}'

CONTENT_AGENTS: tuple[ContentAgent, ...] = (
    ContentAgent(
        id="confidence",
        task={
            "ru": "Ты — агент уверенности речи. Найди в репликах ИГРОКА слова и обороты, которые "
                  "смягчают или ослабляют сказанное: hedge («наверное», «может быть», «возможно»), "
                  "softener («как бы», «вроде», «немного»), self_doubt («я не уверен», «не знаю»), "
                  "apology (лишние «извините»), filler_word («ну», «типа», «короче»). Только то, что "
                  "реально есть в тексте; вежливость и уместная осторожность — не повод.",
            "en": "You are the speech-assurance agent. Find words and phrases in the PLAYER's lines that "
                  "soften or weaken what is said: hedge (\"maybe\", \"probably\", \"perhaps\"), softener "
                  "(\"kind of\", \"sort of\", \"a bit\"), self_doubt (\"I'm not sure\", \"I don't know\"), "
                  "apology (needless \"sorry\"), filler_word (\"like\", \"you know\", \"basically\"). Only what "
                  "is really in the text; politeness and fitting caution are not markers.",
        },
        schema='{"markers": [{"turn": n, "quote": "...", "kind": "hedge|softener|self_doubt|apology|filler_word"}]}',
        parse=_parse_confidence,
    ),
    ContentAgent(
        id="competency",
        task={
            "ru": "Ты — агент компетенций. Оцени игрока по восьми компетенциям переговорщика числом от 0 "
                  "до 1 и подкрепи каждую цитатами: pro — что получилось, con — что не получилось и почему. "
                  "Нет материала — ставь 0.5 и оставляй списки пустыми. Компетенции: "
                  + "; ".join(f"{k} — {v}" for k, v in _COMPETENCY_TEXT["ru"].items()) + ".",
            "en": "You are the competency agent. Rate the player on eight negotiator competencies from 0 to 1 "
                  "and back each with quotes: pro — what worked, con — what did not and why. No material — "
                  "give 0.5 and leave the lists empty. Competencies: "
                  + "; ".join(f"{k} — {v}" for k, v in _COMPETENCY_TEXT["en"].items()) + ".",
        },
        schema=('{"competencies": [{"id": "interests", "score": 0.0, "pro": [' + _Q +
                '], "con": [{"turn": n, "quote": "...", "why": "..."}]}]}'),
        parse=_parse_competency,
        max_tokens=1600,
    ),
    ContentAgent(
        id="thinking",
        task={
            "ru": "Ты — агент проговаривания. Проверь, проговаривает ли игрок свои мысли: declared — где он "
                  "явно назвал позицию, довод, вывод или предложение (kind: position|reasoning|conclusion|proposal); "
                  "unspoken — ходы, где он сделал шаг (уступил, сменил тему, назвал цифру), не сказав зачем; "
                  "questions — его вопросы собеседнику; shifts — крупные логические переходы разговора.",
            "en": "You are the reasoning-out-loud agent. Check whether the player voices their thinking: declared — "
                  "where they explicitly state a position, reason, conclusion or proposal "
                  "(kind: position|reasoning|conclusion|proposal); unspoken — turns where they made a move (conceded, "
                  "switched topic, named a number) without saying why; questions — their questions to the "
                  "counterpart; shifts — major logical turns of the conversation.",
        },
        schema=('{"declared": [{"turn": n, "quote": "...", "kind": "position"}], '
                '"unspoken": [{"turn": n, "note": "..."}], "questions": [' + _Q + '], '
                '"shifts": [{"turn": n, "quote": "...", "note": "..."}]}'),
        parse=_parse_thinking,
    ),
    ContentAgent(
        id="specificity",
        task={
            "ru": "Ты — агент конкретики. Раздели утверждения игрока на подкреплённые (specific: цифра, "
                  "пример, факт, срок — kind: number|example|fact|deadline) и общие слова без опоры (generic). "
                  "Вопросы и приветствия не считай.",
            "en": "You are the specificity agent. Split the player's statements into backed ones (specific: a "
                  "number, example, fact or deadline — kind: number|example|fact|deadline) and generic words "
                  "with nothing behind them (generic). Do not count questions and greetings.",
        },
        schema=('{"specific": [{"turn": n, "quote": "...", "kind": "number"}], "generic": [' + _Q + ']}'),
        parse=_parse_specificity,
    ),
    ContentAgent(
        id="comprehension",
        task={
            "ru": "Ты — агент понимания вопросов. Найди вопросы СОБЕСЕДНИКА к игроку (turn — номер хода, на "
                  "который отвечал собеседник; приветствие — ход 0) и проверь, ответил ли игрок следующим "
                  "ходом: full — по существу, partial — частично, no — ушёл от ответа или не заметил. "
                  "question — ДОСЛОВНАЯ цитата вопроса собеседника: сверяется с разговором.",
            "en": "You are the question-comprehension agent. Find the COUNTERPART's questions to the player "
                  "(turn — the turn the counterpart was answering; the greeting is turn 0) and check whether the "
                  "player answered in the next turn: full — to the point, partial — in part, no — dodged or "
                  "missed it. question is a VERBATIM quote of the counterpart's question: it is checked.",
        },
        schema=('{"questions": [{"turn": n, "question": "...", "answer_turn": n, '
                '"answered": "full|partial|no", "quote": "..."}]}'),
        parse=_parse_comprehension,
    ),
    ContentAgent(
        id="followups",
        task={
            "ru": "Ты — агент реакции на уточнения. Найди, где собеседник переспрашивал, уточнял, давил или "
                  "возражал, и оцени ответ игрока: steady — спокойно и по делу, defensive — оправдывался, "
                  "evasive — ушёл от ответа, conceded — сдал позицию без встречного условия. probe — "
                  "ДОСЛОВНАЯ цитата собеседника: сверяется с разговором.",
            "en": "You are the follow-up agent. Find where the counterpart probed, asked to clarify, pushed or "
                  "objected, and rate the player's answer: steady — calm and to the point, defensive — "
                  "justifying, evasive — dodged, conceded — gave ground with nothing in return. probe is a "
                  "VERBATIM quote of the counterpart: it is checked.",
        },
        schema=('{"followups": [{"turn": n, "probe": "...", "answer_turn": n, '
                '"handling": "steady|defensive|evasive|conceded", "quote": "..."}]}'),
        parse=_parse_followups,
    ),
    ContentAgent(
        id="consistency",
        task={
            "ru": "Ты — агент последовательности. Найди места, где игрок противоречит САМ СЕБЕ: назвал одно, "
                  "потом другое без объяснения (цифры, условия, сроки, позиция). Обоснованная уступка — не "
                  "противоречие. Нет противоречий — пустой список.",
            "en": "You are the consistency agent. Find where the player contradicts THEMSELVES: said one thing, "
                  "then another without explanation (numbers, terms, deadlines, position). A reasoned concession "
                  "is not a contradiction. None — an empty list.",
        },
        schema=('{"contradictions": [{"turn_a": n, "quote_a": "...", "turn_b": n, "quote_b": "...", '
                '"note": "..."}]}'),
        parse=_parse_consistency,
    ),
    ContentAgent(
        id="facts",
        task={
            "ru": "Ты — агент сверки фактов. Сверь утверждения игрока о цифрах, условиях и обстоятельствах с "
                  "ВВОДНОЙ — тем, что ему было известно: matches — совпадает, contradicts — расходится с "
                  "вводной, unsupported — во вводной этого нет (возможен блеф; не осуждай, просто отметь). В "
                  "brief коротко напиши, что сказано во вводной. Мнения и вопросы не сверяй.",
            "en": "You are the fact-check agent. Check the player's claims about numbers, terms and circumstances "
                  "against the BRIEF — what they knew: matches — agrees, contradicts — conflicts with the brief, "
                  "unsupported — the brief says nothing of it (could be a bluff; do not judge, just note). In "
                  "brief, state shortly what the brief says. Do not check opinions or questions.",
        },
        schema=('{"claims": [{"turn": n, "quote": "...", "verdict": "matches|contradicts|unsupported", '
                '"brief": "...", "note": "..."}]}'),
        parse=_parse_facts,
        needs_brief=True,
    ),
)


def _fmt_clock(ms: Optional[int]) -> str:
    if ms is None:
        return ""
    s = max(0, int(ms)) // 1000
    return f"{s // 60:02d}:{s % 60:02d}"


def render_transcript(facts: dict, timing: dict[int, dict]) -> str:
    """Разговор для агентов: ходы пронумерованы, у хода игрока — время и способ.

    `timing`: ход → {"at_ms", "source"} (из записи партии). Чего не знаем, того
    не пишем: ход без времени остаётся без времени, а не получает «00:00».
    """
    ru = facts.get("lang", "ru") == "ru"
    you, them = ("Игрок", "Собеседник") if ru else ("Player", "Counterpart")
    via = {"voice": "голосом" if ru else "spoken", "text": "текстом" if ru else "typed"}
    rows = []
    if facts.get("greeting"):
        rows.append(f"[0] {them}: «{facts['greeting']}»")
    for line in facts.get("lines") or []:
        turn = line["turn"]
        if line["role"] == "player":
            info = timing.get(turn) or {}
            tags = [t for t in (_fmt_clock(info.get("at_ms")), via.get(info.get("source") or "", "")) if t]
            meta = f" ({', '.join(tags)})" if tags else ""
            rows.append(f"[{turn}] {you}{meta}: «{line['text']}»")
        else:
            cut = (" (перебит)" if ru else " (interrupted)") if line.get("interrupted") else ""
            rows.append(f"[{turn}] {them}{cut}: «{line['text']}»")
    return "\n".join(rows)


def render_brief(facts: dict, full: bool) -> str:
    b = facts.get("brief") or {}
    ru = facts.get("lang", "ru") == "ru"
    rows = [f"{'Роль игрока' if ru else 'Player role'}: {b.get('role', '')}",
            f"{'Собеседник' if ru else 'Counterpart'}: {b.get('counterpart', '')}"]
    if full:
        unit = b.get("unit", "")
        rows += [
            f"{'Вводная' if ru else 'Briefing'}: {b.get('briefing', '')}",
            f"{'Стартовое предложение собеседника' if ru else 'Counterpart opening offer'}: "
            f"{b.get('opponent_open')} {unit}",
            f"{'Цель игрока' if ru else 'Player target'}: {b.get('target')} {unit}; "
            f"{'красная линия' if ru else 'red line'}: {b.get('reservation')} {unit}",
            f"{'Альтернатива игрока' if ru else 'Player alternative (BATNA)'}: {b.get('batna', '')}",
        ]
        if b.get("issues"):
            rows.append(f"{'Второстепенные условия' if ru else 'Secondary terms'}: {', '.join(b['issues'])}")
    return "\n".join(rows)


def content_prompt(agent: ContentAgent, facts: dict, transcript: str) -> tuple[str, str]:
    lang = facts.get("lang", "ru")
    ru = lang == "ru"
    rules = (
        "Правила: отвечай СТРОГО JSON без markdown и пояснений, по форме ниже. Ссылайся на ход игрока "
        "номером из квадратных скобок и цитируй ДОСЛОВНО — цитаты сверяются с разговором, придуманные "
        "выбрасываются. Не делай выводов о чувствах и личности игрока — только о речи. Пояснения пиши "
        "по-русски, коротко.\nФорма ответа: " if ru else
        "Rules: reply with STRICT JSON only, no markdown, no commentary, in the form below. Refer to a player "
        "turn by the number in square brackets and quote VERBATIM — quotes are checked against the "
        "conversation and invented ones are dropped. Draw no conclusions about the player's feelings or "
        "personality — only about the speech. Keep notes short, in English.\nAnswer form: ")
    system = f"{agent.task[lang if lang in agent.task else 'ru']}\n{rules}{agent.schema}"
    user = (f"{render_brief(facts, agent.needs_brief)}\n\n"
            f"{'Разговор' if ru else 'Conversation'}:\n{transcript}")
    return system, user


# ---------------------------------------------------------------------- голос

def voice_prompt(lang: str, text: str) -> tuple[str, str]:
    ru = lang == "ru"
    kinds = ", ".join(VOICE_KINDS)
    system = (
        "Ты — агент голоса. Перед тобой запись ОДНОЙ реплики игрока на деловых переговорах. Отметь только "
        f"то, что СЛЫШНО, кодами из списка: {kinds}. filler — слово-паразит или «э-э», «м-м» (в text — "
        "само слово); hesitation — заминка; restart — начал фразу заново; stutter — запинка на звуке; "
        "tremor — дрожь в голосе; laugh — смех; sigh — вздох; rushed — скороговорка; trailing_off — голос "
        "затухает к концу. t — секунда от начала записи. Ничего не слышно — пустой список. Никаких выводов "
        'о чувствах. Ответ СТРОГО JSON: {"events": [{"t": 1.5, "kind": "filler", "text": "э-э"}]}'
        if ru else
        "You are the voice agent. This is a recording of ONE line by the player in a business negotiation. "
        f"Mark only what is AUDIBLE, with codes from this list: {kinds}. filler — a filler word or \"uh\", "
        "\"um\" (put the word in text); hesitation — a hitch; restart — restarted the sentence; stutter — "
        "stumbled on a sound; tremor — shaky voice; laugh; sigh; rushed — gabbling; trailing_off — the voice "
        "fades towards the end. t — seconds from the start of the recording. Nothing audible — an empty list. "
        'No conclusions about feelings. Reply with STRICT JSON: {"events": [{"t": 1.5, "kind": "filler", "text": "uh"}]}')
    user = (f"Расшифровка этой реплики: «{text}»" if ru else f"Transcript of this line: \"{text}\"")
    return system, user


def parse_voice(raw: Optional[str], dur_s: float) -> Optional[list[dict]]:
    data = extract_json(raw)
    if data is None:
        return None
    out = []
    for item in _items(data, "events", 20):
        kind = _str(item.get("kind"), 16)
        try:
            t = float(item.get("t"))
        except (TypeError, ValueError):
            continue
        if kind not in VOICE_KINDS or not (0 <= t <= dur_s + 0.5):
            continue
        out.append({"t": round(t, 2), "kind": kind, "text": _str(item.get("text"), 40)})
    return out


# ---------------------------------------------------------------------- мимика

def face_prompt(lang: str) -> str:
    codes = ", ".join(CUES)
    if lang == "ru":
        return ("Ты — агент мимики. Перед тобой кадры с веб-камеры участника деловых переговоров, по порядку, "
                "у каждого номер и время. Для КАЖДОГО кадра назови коды того, что ЯВНО видно на лице или в "
                f"жесте, только из списка: {codes}. Не видно ничего из списка или лица нет — пустой список. "
                "Не угадывай чувства и не описывай внешность. Ответ СТРОГО JSON: "
                '{"frames": [{"i": 1, "cues": ["frown"]}]}')
    return ("You are the facial-cue agent. These are webcam frames of a participant in a business negotiation, "
            "in order, each with a number and a time. For EACH frame name the codes of what is CLEARLY visible "
            f"on the face or in a gesture, only from this list: {codes}. Nothing from the list or no face — an "
            "empty list. Do not guess feelings and do not describe appearance. Reply with STRICT JSON: "
            '{"frames": [{"i": 1, "cues": ["frown"]}]}')


def parse_face(raw: Optional[str], count: int) -> Optional[dict[int, list[str]]]:
    data = extract_json(raw)
    if data is None:
        return None
    out: dict[int, list[str]] = {}
    for item in _items(data, "frames", count + 4):
        i = _int(item.get("i"), 1, count)
        cues = item.get("cues")
        if i is None or not isinstance(cues, list):
            continue
        codes = []
        for c in cues:
            code = _str(c, 20).lower().replace(" ", "_").replace("-", "_")
            if code in CUES and code not in codes:
                codes.append(code)
        out[i] = codes
    return out
