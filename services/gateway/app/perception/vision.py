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

_SYSTEM = {
    "ru": ("Ты смотришь на кадр с веб-камеры участника деловых переговоров.\n"
           "Опиши ОДНИМ коротким предложением только то, что имеет отношение к "
           "присутствию и обстановке: есть ли человек в кадре, сколько людей, "
           "смотрит ли он в камеру или в бумаги, показывает ли что-то, изменилась "
           "ли обстановка.\n"
           "НЕ описывай внешность, НЕ оценивай эмоции, настроение или уверенность — "
           "этого по кадру не видно, и это не твоя задача.\n"
           "Если ничего примечательного нет, ответь одним словом: нет."),
    "en": ("You are looking at a webcam frame of a participant in a business "
           "negotiation.\n"
           "Describe in ONE short sentence only what relates to presence and "
           "setting: is a person in frame, how many people, are they looking at the "
           "camera or at papers, are they showing something, did the setting change.\n"
           "Do NOT describe appearance, do NOT judge emotion, mood or confidence — "
           "a frame does not show that, and it is not your job.\n"
           "If nothing is notable, answer with one word: no."),
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


class VisionSampler:
    """Поток кадров внутрь — редкие наблюдения наружу."""

    def __init__(self, lang: str, publish: Callable[[dict], None],
                 record: Callable[..., None],
                 min_interval_s: float = _MIN_INTERVAL_S,
                 pokerface: bool = False) -> None:
        self._lang = lang
        self._publish = publish
        self._record = record
        self._min_interval = min_interval_s
        self._pokerface = pokerface

        self._last_call = 0.0
        self._last_size = 0
        self._task: Optional[asyncio.Task] = None
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

        if not (first_ever or (due and changed)):
            return
        if self._task and not self._task.done():
            return                              # предыдущий взгляд ещё не вернулся

        self._last_call = now
        self._task = asyncio.create_task(self._look(frame, turn))

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
        response = await orchat._get_client().post("/chat/completions", json=payload)
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
            "max_tokens": 110 if self._pokerface else 80,
            "temperature": 0.2,
        }
        try:
            response = await orchat._get_client().post("/chat/completions", json=payload)
            response.raise_for_status()
            text = (response.json()["choices"][0]["message"]["content"] or "").strip()
        except Exception:
            # Зрение — украшение, а не механика. Отвалилось — партия идёт дальше.
            return

        self.stats.calls_made += 1
        self.stats.last_ms = (time.perf_counter() - started) * 1000

        # «ЛИЦО: да/нет» снимается ДО проверки на пустое наблюдение: кадр может
        # не нести ничего про обстановку и при этом нести выражение на лице.
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
        self._record(text, turn=turn, expressive=tell)

        if not text:
            return

        self._publish({
            "type": "vision.observation",
            "text": text,
            "turn": turn,
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
