"""vision.py — камера как контекст присутствия, а не как детектор эмоций.

ЧТО ЭТОТ СЛОЙ ДЕЛАЕТ. Отвечает на вопросы вида «человек ещё здесь?», «он
смотрит в документы?», «в кадре появился второй?», «он что-то показывает?».
Наблюдение уходит в контекст оппонента — тот может на него сослаться, как
сослался бы живой человек на видеозвонке, — и отдельной карточкой в разбор.

ЧЕГО ЭТОТ СЛОЙ НЕ ДЕЛАЕТ, И ЭТО ГЛАВНОЕ. Он не оценивает игрока. Ни одно
наблюдение не входит в `score_session` — они живут в `RealtimeSession`, куда
счёт физически не дотягивается. Причина не в осторожности: «модель посмотрела
на лицо и решила, что вы неуверенны» — это псевдонаука, и грейд, полученный с
камерой, перестал бы быть сравнимым с грейдом без неё. Тогда сертификат
экзамена не значит ничего. Экзамен поэтому фиксирует слои выключенными.

АДАПТИВНЫЙ СЭМПЛИНГ. Транспорт камеры и зрительный вывод — разные вещи. Кадры
могут идти непрерывно, но в модель уходит один кадр не чаще, чем раз в
`_MIN_INTERVAL_S`, и только когда есть повод:

  - начало партии — понять, кто и где сидит;
  - кадр заметно изменился — что-то произошло.

Третьего повода, «долгая тишина — человек мог отойти», здесь НЕТ, и его
отсутствие намеренно: уход из кадра сам по себе меняет кадр, и его ловит второй
повод. Отдельный таймер смотрел бы в неподвижную комнату и платил за это.
Раньше на этот случай был заведён параметр `reason`, который никто никогда не
передавал, — то есть ветка, обещанная докстрокой и недостижимая в проде.

Тридцать кадров в секунду в облако — это не «более внимательное зрение», это
счёт за электричество и секунда задержки на ровном месте.

МИМИКА — ТОЖЕ НАБЛЮДЕНИЕ, А НЕ ВЫВОД (решение владельца 19.10). Каждый взгляд
заканчивается строкой «МИМИКА: …» — кодами из закрытого списка `CUES`: брови
нахмурены, гримаса, улыбка, поджатые губы, взгляд в сторону и т.п. Это то, что
увидел бы человек на видеозвонке, и собеседнику это отдаётся так же, как живому
человеку: он может спросить «Вижу, вас это смутило?» (`ai/prompts.py::_face_block`).
Выводов — «неуверен», «врёт», «нервничает» — нет и здесь: код описывает лицо, а
не того, кто за ним. В счёт мимика не входит по той же причине, что и всё в
этом файле, — она живёт в `RealtimeSession`.

Чтобы собеседнику было на что реагировать, у взгляда есть третий повод —
РЕАКЦИЯ: после того как собеседник договорил (`response.done`, а в созвоне —
конец его звука), ближайший кадр через `_REACTION_DELAY_S` досматривается, даже
если почти не изменился, — вскинутые
брови меняют восемь процентов решётки редко. Не чаще раза за ход и не чаще
`_REACTION_MIN_INTERVAL_S` после прошлого взгляда.

«ПОКЕРФЕЙС» — И ПОЧЕМУ ЭТО НЕ ПРОТИВОРЕЧИТ ПЕРВОМУ АБЗАЦУ. Слой `pokerface`
просит модель ответить на наблюдаемый вопрос: видно ли на лице ЯВНОЕ выражение
(улыбка, нахмуренные брови, поджатые губы) вместо нейтрального. Это не вывод о
внутреннем состоянии — «неуверен», «врёт», «нервничает», — а признак, который
человек рядом увидел бы сам. Счётчик уходит в разбор с той же плашкой «не
влияет на оценку» и в `score_session` не входит: держать лицо — упражнение, а
не критерий сделки.

КУДА ЭТО ЛОЖИТСЯ. Не строкой в общий список, а записью с номером хода и
временем от начала партии (`RealtimeSession.note_vision`). Без хода лента в
разборе была списком из четырёх последних фраз, ни к чему не привязанных:
человек читал «в кадре появился второй» и не мог сказать, случилось это на
приветствии или на последнем торге. Номер хода берётся НА МОМЕНТ КАДРА и едет
через `offer()`: пока модель смотрит, ход успевает смениться, и записать
результат «текущим» значило бы датировать наблюдение чужим ходом.

«КАДР ЗАМЕТНО ИЗМЕНИЛСЯ» СЧИТАЕТ БРАУЗЕР. Кадр там и так рисуется в canvas,
поэтому проход по решётке яркостей стоит одного цикла, и наружу едет доля
изменившихся проб. Прежний прокси — «размер JPEG изменился» — ловил смену
освещения и крупное движение, но тихий уход из кадра не ловил вовсе: пустая
комната жмётся не хуже человека в ней.

Прокси остался запасным путём: старый клиент поля не пришлёт, а слой обязан
работать и с ним.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Callable, Optional

from app.providers.openrouter import chat as orchat
from app.providers.routing import model_for
from app.providers.tts.base import OUTPUT_SAMPLE_RATE
# Единственная связь perception → realtime, и она к схеме, а не к транспорту:
# `events.py` не импортирует ничего из приложения, поэтому цикла нет. Отказ слоя
# обязан выглядеть для клиента так же, как любой другой отказ, — значит и
# собираться той же функцией, а не похожим словарём рядом.
from app.realtime.events import error as _error

#: Не чаще одного обращения к модели зрения за столько секунд.
_MIN_INTERVAL_S = 8.0

#: На сколько процентов должен измениться размер кадра, чтобы счесть это
#: событием. Порог грубый намеренно — он отсеивает шум сенсора, а не работает
#: как детектор.
_CHANGE_RATIO = 0.18

#: Доля изменившихся проб яркости, начиная с которой кадр считается новым.
#: Восемь процентов решётки — это уже движение человека, а не шум сенсора:
#: порог по яркости (12 из 255) шум отсекает раньше.
_CHANGE_PIXELS = 0.08

#: Через сколько секунд после конца реплики собеседника смотреть на лицо. Сразу
#: — рано: в текстовом виде человек ещё читает, в созвоне ещё слушает.
_REACTION_DELAY_S = 1.2

#: Реакционный взгляд — не чаще, чем через столько секунд после прошлого. Он
#: короче общего интервала намеренно: ответ на предложение случается один раз
#: и длится секунду, а восьмисекундный такт его почти всегда пропускает.
_REACTION_MIN_INTERVAL_S = 3.0

#: Сколько ждать кадр под реакцию. Камеру выключили или кадров нет — повод
#: истекает, а не висит до следующего хода, датируя чужую реакцию этим.
_REACTION_WINDOW_S = 10.0

#: Закрытый список того, что модель может назвать на лице. Коды, а не свободный
#: текст: собеседнику они уходят подписями (`cue_labels`), разбору — как есть,
#: и ни одна строка из-за границы доверия не доезжает до промпта сырой. Подписи
#: — существительными, без рода: пол игрока неизвестен (правило промпта).
CUES: dict[str, dict[str, str]] = {
    "frown": {"ru": "нахмуренные брови", "en": "furrowed brows"},
    "wince": {"ru": "гримаса", "en": "a wince"},
    "smile": {"ru": "улыбка", "en": "a smile"},
    "lip_press": {"ru": "поджатые губы", "en": "pressed lips"},
    "raised_brows": {"ru": "поднятые брови", "en": "raised eyebrows"},
    "eye_roll": {"ru": "закатывание глаз", "en": "an eye roll"},
    "gaze_away": {"ru": "взгляд в сторону", "en": "looking away"},
    "head_shake": {"ru": "покачивание головой", "en": "a head shake"},
    "nod": {"ru": "кивок", "en": "a nod"},
    "hand_to_face": {"ru": "рука у лица", "en": "a hand to the face"},
}


def cue_labels(cues, lang: str) -> list[str]:
    """Коды → подписи на языке партии. Незнакомый код молча выпадает."""
    out: list[str] = []
    for code in cues or ():
        label = CUES.get(code, {}).get(lang) or CUES.get(code, {}).get("en")
        if label and label not in out:
            out.append(label)
    return out


#: Свой потолок ожидания у взгляда, а не общий читательский (60 с у клиента
#: OpenRouter). Наблюдение отвечает на вопрос «что происходит СЕЙЧАС»: ответ,
#: пришедший через минуту, описывает кадр из другой эпохи партии, а всё это
#: время сэмплер стоит — следующий кадр он не смотрит, пока не вернулся
#: предыдущий. Замер: наблюдение занимает 1.2–1.7 с (docs/latency.md), так что
#: двенадцать секунд это семикратный запас, а не жадность.
_LOOK_TIMEOUT_S = 12.0

#: Сколько взглядов подряд должны сорваться, прежде чем слой скажет об этом
#: вслух. Один сорванный взгляд — сетевая заминка, о которой сообщать нечего:
#: следующий кадр придёт через восемь секунд. Три подряд — это уже полминуты
#: молчания, а молчащий слой неотличим от сломанной камеры (принцип 2).
_QUIET_AFTER_FAILURES = 3

#: Что говорится, когда взгляды срываются подряд. Формулировка обязана назвать
#: СЛОЙ и сказать, что с партией: «ошибка» без этого на показе неотличима от
#: сломанного сервера.
_QUIET_MESSAGE = {
    "ru": ("Модель зрения не отвечает: три взгляда подряд сорвались, наблюдений "
           "сейчас нет. Слой продолжит пробовать; на игру и на оценку это не влияет."),
    "en": ("The vision model is not answering: three looks in a row failed, so there "
           "are no observations right now. The layer keeps trying; neither the game "
           "nor the grade is affected."),
}

_SYSTEM = {
    "ru": ("Ты смотришь на кадр с веб-камеры участника деловых переговоров.\n"
           "Опиши ОДНИМ коротким предложением только то, что имеет отношение к "
           "присутствию и обстановке: есть ли человек в кадре, сколько людей, "
           "смотрит ли он в камеру или в бумаги, показывает ли что-то, изменилась "
           "ли обстановка.\n"
           "НЕ описывай внешность, НЕ оценивай чувства, настроение или уверенность — "
           "этого по кадру не видно, и это не твоя задача.\n"
           "Если ничего примечательного нет, ответь одним словом: нет.\n"
           "ПОСЛЕДНЕЙ строкой всегда пиши «МИМИКА: » и через запятую коды того, что "
           "ЯВНО видно на лице или в жесте прямо сейчас, только из списка: "
           + ", ".join(CUES) + ". Если ничего из этого не видно или лица не видно — "
           "«МИМИКА: нет». Только коды, без пояснений."),
    "en": ("You are looking at a webcam frame of a participant in a business "
           "negotiation.\n"
           "Describe in ONE short sentence only what relates to presence and "
           "setting: is a person in frame, how many people, are they looking at the "
           "camera or at papers, are they showing something, did the setting change.\n"
           "Do NOT describe appearance, do NOT judge feelings, mood or confidence — "
           "a frame does not show that, and it is not your job.\n"
           "If nothing is notable, answer with one word: no.\n"
           "ALWAYS end with a line \"CUES: \" followed by comma-separated codes of what "
           "is CLEARLY visible on the face or in a gesture right now, only from this list: "
           + ", ".join(CUES) + ". If none of these is visible or no face is visible — "
           "\"CUES: none\". Codes only, no explanations."),
}


#: Добавка к системному промпту, когда включён «покерфейс». Отдельным вопросом,
#: а не отдельным вызовом: второй запрос на тот же кадр удвоил бы и счёт, и
#: задержку ради одного бита.
_TELL_ADDON = {
    "ru": ("\nВТОРОЙ СТРОКОЙ ответь ровно так: «ЛИЦО: да» или «ЛИЦО: нет».\n"
           "«да» — если на лице ЯВНОЕ выражение: улыбка, нахмуренные брови, "
           "поджатые губы, расширенные глаза, смех.\n"
           "«нет» — если лицо нейтральное, спокойное, или лица не видно.\n"
           "Не объясняй и не угадывай настроение — только то, что видно."),
    "en": ("\nON A SECOND LINE answer exactly: \"FACE: yes\" or \"FACE: no\".\n"
           "\"yes\" — the face carries a CLEAR expression: a smile, furrowed brows, "
           "pressed lips, widened eyes, laughter.\n"
           "\"no\" — the face is neutral or not visible.\n"
           "Do not explain and do not guess the mood — only what is visible."),
}

_TELL_RE = None  # заполняется лениво, чтобы не тащить re в горячий путь импорта


def split_tell(raw: str) -> tuple[str, Optional[bool]]:
    """Отделить строку «ЛИЦО: да» от самого наблюдения.

    Возвращает `(наблюдение, выражение_видно | None)`. `None` значит «модель не
    ответила на второй вопрос» — это не «нет»: молчание модели и нейтральное
    лицо не одно и то же, и считать их одинаково значило бы придумывать данные.
    """
    global _TELL_RE
    if _TELL_RE is None:
        import re
        _TELL_RE = re.compile(r"^\s*(?:ЛИЦО|FACE)\s*[:\-]\s*(да|нет|yes|no)\b\.?\s*$",
                              re.IGNORECASE)
    kept, tell = [], None
    for line in (raw or "").splitlines():
        m = _TELL_RE.match(line)
        if m:
            tell = m.group(1).lower() in ("да", "yes")
        else:
            kept.append(line)
    return " ".join(" ".join(kept).split()), tell


_CUES_RE = None


def split_cues(raw: str) -> tuple[str, Optional[list[str]]]:
    """Отделить строку «МИМИКА: …» от остального ответа.

    `(остальное, коды | None)`. `None` — модель строки не прислала: это не
    «лицо спокойно», а «про лицо ничего не сказано», и выдумывать за неё нельзя.
    Пустой список — модель ответила «нет». Незнакомые коды выпадают: список
    закрытый, и всё, что сверх него, — текст из-за границы доверия.
    """
    global _CUES_RE
    if _CUES_RE is None:
        import re
        _CUES_RE = re.compile(r"^\s*(?:МИМИКА|CUES)\s*[:\-]\s*(.*)$", re.IGNORECASE)
    kept, cues = [], None
    for line in (raw or "").splitlines():
        m = _CUES_RE.match(line)
        if not m:
            kept.append(line)
            continue
        found: list[str] = []
        for part in m.group(1).replace(";", ",").split(","):
            code = part.strip().strip(".«»\"'`").lower().replace(" ", "_").replace("-", "_")
            if code in CUES and code not in found:
                found.append(code)
        cues = found
    return "\n".join(kept), cues


#: Промпт калибровки. Отдельный, потому что вопрос другой: не «что происходит»,
#: а «годится ли этот кадр для игры». Ответ строго машинный — три да/нет и одна
#: короткая подсказка человеку, если что-то не так.
_CALIBRATION = {
    "ru": ("Ты проверяешь кадр с веб-камеры ПЕРЕД началом деловой игры.\n"
           "Ответь РОВНО тремя строками и ничем больше:\n"
           "ЧЕЛОВЕК: да|нет — виден ли человек в кадре\n"
           "ЛИЦО: да|нет — видно ли лицо целиком, не обрезано ли краем\n"
           "СВЕТ: да|нет — достаточно ли света, чтобы разглядеть лицо\n"
           "Если на что-то ответил «нет», добавь ЧЕТВЁРТОЙ строкой одно короткое "
           "предложение: что сделать человеку. Если всё «да», четвёртой строки не пиши."),
    "en": ("You are checking a webcam frame BEFORE a business role-play starts.\n"
           "Answer with EXACTLY three lines and nothing else:\n"
           "PERSON: yes|no — is a person visible in frame\n"
           "FACE: yes|no — is the whole face visible, not cut off by the edge\n"
           "LIGHT: yes|no — is there enough light to make out the face\n"
           "If anything is \"no\", add a FOURTH line: one short sentence telling the "
           "person what to change. If everything is \"yes\", write no fourth line."),
}

_CHECK_RE = None


def parse_calibration(raw: str) -> dict:
    """Три строки да/нет плюс подсказка → словарь. Неполный ответ — не «нет».

    Отсутствующая строка возвращается как None, а не False, по той же причине,
    что и в «покерфейсе»: молчание модели и ответ «нет» — разные вещи, и
    показывать «лицо не видно» там, где модель просто не ответила, значит
    придумать данные.
    """
    global _CHECK_RE
    if _CHECK_RE is None:
        import re
        _CHECK_RE = re.compile(
            r"^\s*(ЧЕЛОВЕК|ЛИЦО|СВЕТ|PERSON|FACE|LIGHT)\s*[:\-]\s*(да|нет|yes|no)\b",
            re.IGNORECASE)
    keys = {"человек": "person", "person": "person", "лицо": "face", "face": "face",
            "свет": "light", "light": "light"}
    out: dict = {"person": None, "face": None, "light": None, "hint": ""}
    rest: list[str] = []
    for line in (raw or "").splitlines():
        m = _CHECK_RE.match(line)
        if m:
            out[keys[m.group(1).lower()]] = m.group(2).lower() in ("да", "yes")
        elif line.strip():
            rest.append(line.strip())
    out["hint"] = " ".join(rest)[:160]
    return out


@dataclass
class VisionStats:
    frames_seen: int = 0
    calls_made: int = 0
    last_ms: float = 0.0
    #: Кадров, на которых лицо несло явное выражение. Считается только при
    #: включённом «покерфейсе»; иначе модель этого вопроса даже не видит.
    tells: int = 0
    #: Взглядов, сорвавшихся ПОДРЯД. Обнуляется первым же удавшимся: слой,
    #: который отвечал и замолчал, и слой, который не отвечал никогда, — разные
    #: новости, и различить их можно только по этому счётчику.
    failures_in_a_row: int = 0


class VisionSampler:
    """Поток кадров внутрь — редкие наблюдения наружу."""

    def __init__(self, lang: str, publish: Callable[[dict], None],
                 record: Callable[..., None],
                 min_interval_s: float = _MIN_INTERVAL_S,
                 pokerface: bool = False,
                 budget: Optional[Callable[[], bool]] = None) -> None:
        self._lang = lang
        self._publish = publish
        self._record = record
        self._min_interval = min_interval_s
        self._pokerface = pokerface
        #: Последняя проверка перед платным вызовом: «хватает ли ещё бюджета».
        #: Своего интервала мало — он ограничивает ОДНУ партию, а платит хост за
        #: все сразу. Кто считает бюджет и по какому признаку, сэмплеру знать не
        #: нужно; ему нужно знать, звонить или нет. Нет функции — предела нет
        #: (так сэмплер работает в тестах и в калибровке).
        self._budget = budget

        self._last_call = 0.0
        self._last_size = 0
        self._task: Optional[asyncio.Task] = None
        #: Когда собеседник договорил (монотонные часы) — повод посмотреть на
        #: реакцию. 0 — повода нет.
        self._reaction_at = 0.0
        #: До какого момента у клиента ещё звучит голос собеседника — по звуку,
        #: который ушёл в сокет. `response.done` значит «текст дописан», а звук
        #: играет секунды дольше (правило 3 протокола): реакция на слова — после
        #: слов, а не посреди них (ревью 19.10).
        self._voice_until = 0.0
        self.stats = VisionStats()

    def available(self) -> bool:
        return orchat.available()

    # ------------------------------------------------------------------ вход

    def offer(self, frames: list[str], *, change: float | None = None,
              turn: int = 0) -> None:
        """Предложить кадры. Решение «смотреть или нет» принимается здесь.

        Вызывающему не нужно ничего знать про частоту и бюджет — он просто
        отдаёт всё, что пришло с камеры, и говорит, сколько ходов уже сделано:
        это единственный момент, когда номер хода ещё точно относится к кадру.
        """
        if not frames or not self.available():
            return
        self.stats.frames_seen += len(frames)

        frame = frames[-1]                      # свежий кадр информативнее пачки
        now = time.monotonic()
        first_ever = self._last_call == 0.0
        # Доля от браузера точнее прокси по размеру, поэтому она главнее. Нет
        # её — считаем по-старому: слой обязан работать и со старым клиентом.
        changed = (change >= _CHANGE_PIXELS) if change is not None else self._changed(len(frame))
        # Размер кадра запоминаем в любом случае: иначе первый же кадр после
        # обновления клиента сравнится с давним и соврёт.
        if change is not None:
            self._last_size = len(frame)
        due = (now - self._last_call) >= self._min_interval
        ready_at = max(self._reaction_at, self._voice_until) + _REACTION_DELAY_S
        if self._reaction_at and now - ready_at > _REACTION_WINDOW_S:
            self._reaction_at = 0.0             # кадра под реакцию не дождались
        reaction = (bool(self._reaction_at)
                    and now >= ready_at
                    and now - self._last_call >= _REACTION_MIN_INTERVAL_S)

        if not (first_ever or (due and changed) or reaction):
            return
        if self._task and not self._task.done():
            return                              # предыдущий взгляд ещё не вернулся
        if self._budget is not None and not self._budget():
            # Бюджет спрашивается ПОСЛЕДНИМ — после интервала, изменения кадра
            # и незавершённого взгляда. Иначе кадр, который и так не привёл бы
            # к вызову, списывал бы токен: ведро пустело бы там, где провайдеру
            # не платили ни копейки.
            return

        self._last_call = now
        # Любой состоявшийся взгляд снимает повод: лицо после реплики уже
        # досмотрено, второй раз за тот же ход за ним не ходят.
        self._reaction_at = 0.0
        self._task = asyncio.create_task(self._look(frame, turn))

    def expect_reaction(self) -> None:
        """Собеседник договорил — ближайший кадр досмотреть ради реакции."""
        self._reaction_at = time.monotonic()

    def on_event(self, event: dict) -> None:
        """Наблюдатель исходящих событий партии (`endpoint.py::_pump`)."""
        kind = event.get("type")
        if kind == "response.done":
            self.expect_reaction()
        elif kind == "response.output.delta" and event.get("kind") == "audio":
            # Клиент играет куски подряд: конец звука — это «сейчас или конец
            # прежнего куска» плюс длина нового. Формат провода —
            # float32 PCM 24 кГц моно (`providers/tts/base.py`).
            seconds = len(event.get("audio") or "") * 3 / 4 / 4 / OUTPUT_SAMPLE_RATE
            now = time.monotonic()
            self._voice_until = max(self._voice_until, now) + seconds
        elif kind == "generation.cancelled":
            # Перебили — клиент глушит звук сразу.
            self._voice_until = min(self._voice_until, time.monotonic())

    def _changed(self, size: int) -> bool:
        previous, self._last_size = self._last_size, size
        if previous == 0:
            return True
        return abs(size - previous) / max(previous, 1) >= _CHANGE_RATIO

    # ---------------------------------------------------------------- модель

    def _system_prompt(self) -> str:
        base = _SYSTEM.get(self._lang, _SYSTEM["ru"])
        if not self._pokerface:
            return base
        return base + _TELL_ADDON.get(self._lang, _TELL_ADDON["ru"])

    async def calibrate(self, frame_b64: str) -> dict:
        """Один кадр → годится ли он для игры. Вне такта сэмплинга.

        Отдельный путь, а не `offer(reason=...)`: калибровка отвечает на другой
        вопрос, спрашивается по требованию человека и НЕ должна ни ждать
        интервала, ни попадать в наблюдения партии.
        """
        payload = {
            "model": model_for("vision"),
            "messages": [
                {"role": "system",
                 "content": _CALIBRATION.get(self._lang, _CALIBRATION["ru"])},
                {"role": "user", "content": [
                    {"type": "text", "text": "Годится?" if self._lang == "ru" else "Is this usable?"},
                    {"type": "image_url",
                     "image_url": {"url": f"data:image/jpeg;base64,{frame_b64}"}},
                ]},
            ],
            "max_tokens": 90,
            "temperature": 0.0,
        }
        # Потолок тот же, что у взгляда, и по той же причине: страница проверки
        # оборудования ждёт ответа с человеком перед экраном, и минута ожидания
        # там — это «камера не работает», а не диагноз.
        response = await asyncio.wait_for(
            orchat._get_client().post("/chat/completions", json=payload),
            timeout=_LOOK_TIMEOUT_S)
        response.raise_for_status()
        text = (response.json()["choices"][0]["message"]["content"] or "").strip()
        return parse_calibration(text)

    async def _look(self, frame_b64: str, turn: int = 0) -> None:
        started = time.perf_counter()
        payload = {
            "model": model_for("vision"),
            "messages": [
                {"role": "system", "content": self._system_prompt()},
                {"role": "user", "content": [
                    {"type": "text", "text": "Что видно?" if self._lang == "ru" else "What is visible?"},
                    {"type": "image_url",
                     "image_url": {"url": f"data:image/jpeg;base64,{frame_b64}"}},
                ]},
            ],
            # Строка мимики — до десятка кодов, отсюда запас сверх прежнего.
            "max_tokens": 150 if self._pokerface else 120,
            "temperature": 0.2,
        }
        try:
            response = await asyncio.wait_for(
                orchat._get_client().post("/chat/completions", json=payload),
                timeout=_LOOK_TIMEOUT_S)
            response.raise_for_status()
            text = (response.json()["choices"][0]["message"]["content"] or "").strip()
        except Exception:
            # Зрение — украшение, а не механика. Отвалилось — партия идёт дальше.
            # Но МОЛЧА идёт дальше только первые два раза: дальше слой обязан
            # назвать себя, иначе он неотличим от сломанной камеры. Чип за
            # столом горит от ушедшего кадра, а кадр уходит и в мёртвое зрение.
            self.stats.failures_in_a_row += 1
            if self.stats.failures_in_a_row == _QUIET_AFTER_FAILURES:
                self._publish(_error("vision_unavailable",
                                     _QUIET_MESSAGE.get(self._lang, _QUIET_MESSAGE["ru"]),
                                     "layer_unavailable"))
            return

        self.stats.calls_made += 1
        self.stats.failures_in_a_row = 0
        self.stats.last_ms = (time.perf_counter() - started) * 1000

        # «МИМИКА» и «ЛИЦО: да/нет» снимаются ДО проверки на пустое наблюдение:
        # кадр может не нести ничего про обстановку и при этом нести выражение.
        text, cues = split_cues(text)
        text, tell = split_tell(text)
        if tell is not None:
            if tell:
                self.stats.tells += 1
            self._publish({
                "type": "vision.tell",
                "expressive": tell,
                "total": self.stats.tells,
                # Ход едет вместе с событием по той же причине, что и у
                # наблюдения: «лицо себя выдало» без ответа на вопрос «когда»
                # — это число, а не наблюдение.
                "turn": turn,
                # Та же плашка, что и у наблюдения, и по той же причине:
                # держать лицо — упражнение, а не критерий сделки.
                "affects_score": False,
            })

        if not text or text.strip().lower().rstrip(".") in ("нет", "no"):
            text = ""
        else:
            text = text.strip().strip('"«»').strip()[:200]

        # ОДНА ЗАПИСЬ НА ОДИН ВЗГЛЯД. Обстановку и лицо модель сняла с одного
        # кадра одним вызовом — значит, и в ленте это одна строка. Пустой текст
        # при спокойном лице записью не становится: решает `note_vision`.
        # Пустой список — тоже ответ («мимики нет»), и он важен: он гасит
        # прошлую гримасу для собеседника (`fresh_cues`). None — модель не
        # сказала про мимику ничего.
        self._record(text, turn=turn, expressive=tell, cues=cues)

        if not text:
            return

        self._publish({
            "type": "vision.observation",
            "text": text,
            "turn": turn,
            # Коды, не подписи: язык подписи выбирает тот, кто показывает.
            **({"cues": cues} if cues else {}),
            # Плашка едет вместе с наблюдением, чтобы клиенту не приходилось
            # помнить правило. На карточке скрытых интересов такой плашки нет и
            # быть не должно — те входят в technique и влияют на оценку.
            "affects_score": False,
            "latency_ms": round(self.stats.last_ms),
        })

    async def aclose(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
