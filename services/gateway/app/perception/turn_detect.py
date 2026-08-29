"""turn_detect.py — «игрок договорил или просто задумался?»

ПРОИСХОЖДЕНИЕ. Перенос из TEN Framework (Apache-2.0 + дополнительные
условия Agora, среди них запрет на конкуренцию с их предложениями; полный
разбор — docs/upstream-code-map.md §5; commit 2e56d965),
`ai_agents/agents/ten_packages/extension/ten_turn_detection/`: файлы
`turn_detector.py` (классы `SpecialToken`, `TurnDetectorDecision`, метод `eval`
с отменяемой задачей и таймаутом), `config.py` (`force_threshold_ms`) и
`utils.py` (`remove_punctuation`). Единственная реализация детектора конца
реплики среди всех шести репозиториев — сравнивать было не с чем.

ПОЧЕМУ ЭТО ВООБЩЕ НУЖНО. VAD говорит только «звук кончился». Для переговоров
этого мало: «Я готов согласиться, но при одном условии…» — тут секунда тишины
посреди мысли, и если считать её концом хода, оппонент влезет в середину
аргумента. Именно на этом разговор перестаёт быть похожим на человеческий.
Отсюда три исхода, а не два:

    finished    — мысль закончена, можно отвечать
    unfinished  — фраза оборвана, ждём продолжения
    wait        — человек явно просит паузу («секунду», «дайте подумать»)

ЧТО ИЗМЕНЕНО. Оригинал ходит в собственную модель `TEN_Turn_Detection`,
поднятую локально через vLLM (`base_url: http://localhost:8000/v1`), и берёт
`max_tokens=1` — модель обучена отвечать одним специальным токеном. Такой
модели у нас нет, поэтому `base_url` переставлен на OpenRouter (замена
provider backend прямо разрешена заданием), а решение получается закрытым
словарём из трёх слов в промпте. Структура сохранена: отменяемая задача,
таймаут 5 с, значение по умолчанию `unfinished` при любой ошибке.

ПОЧЕМУ ПО УМОЛЧАНИЮ `unfinished`. Это осознанно асимметричный выбор: ошибиться
в сторону «подождать» дешевле, чем перебить человека на середине мысли. Именно
поэтому есть `force_threshold_ms` — потолок ожидания, после которого ход
считается сделанным, что бы ни решил детектор.
"""

from __future__ import annotations

import asyncio
import os
import re
from dataclasses import dataclass
from enum import Enum

from app.providers.openrouter import chat as orchat
from app.providers.routing import model_for

PUNCTUATION_PATTERN = re.compile(r"[,，.。!！?？:：;；、]")


def remove_punctuation(text: str) -> str:
    """Перенос `utils.py::remove_punctuation` из TEN.

    Знаки убираются, потому что расшифровка их расставляет по своим правилам, и
    точка от ASR не значит, что человек закончил мысль.
    """
    return PUNCTUATION_PATTERN.sub("", text)


class TurnDecision(str, Enum):
    FINISHED = "finished"
    UNFINISHED = "unfinished"
    WAIT = "wait"


@dataclass
class TurnDetectConfig:
    #: Потолок ожидания. `<=0` — выключено. Значение из TEN.
    force_threshold_ms: int = 5000
    timeout_s: float = 5.0
    temperature: float = 0.1
    top_p: float = 0.1


_SYSTEM = {
    "ru": (
        "Ты определяешь, закончил ли собеседник свою мысль в переговорах.\n"
        "Ответь РОВНО одним словом из списка:\n"
        "finished — мысль завершена, собеседнику можно отвечать;\n"
        "unfinished — фраза оборвана на полуслове или явно требует продолжения;\n"
        "wait — собеседник просит паузу («секунду», «дайте подумать»).\n"
        "Никаких пояснений. Только одно слово."
    ),
    "en": (
        "You decide whether the speaker finished their thought in a negotiation.\n"
        "Answer with EXACTLY one word:\n"
        "finished — the thought is complete, it is fine to reply;\n"
        "unfinished — the phrase is cut off or clearly needs continuation;\n"
        "wait — the speaker asks for a pause ('one second', 'let me think').\n"
        "No explanation. One word only."
    ),
}


class TurnDetector:
    """Отменяемая оценка конца хода."""

    def __init__(self, config: TurnDetectConfig | None = None) -> None:
        self.config = config or TurnDetectConfig()
        self._task: asyncio.Task | None = None

    def available(self) -> bool:
        # Явный выключатель: без ИИ детектор молчит, а голосовой путь
        # откатывается на «тишина = конец хода», как было бы с одним VAD.
        return orchat.available() and os.getenv("NEGO_TURN_DETECT", "1") != "0"

    def force_chat_enabled(self) -> bool:
        return self.config.force_threshold_ms > 0

    def cancel(self) -> None:
        """Перенос `cancel_eval()`: игрок продолжил говорить — оценка неактуальна."""
        if self._task and not self._task.done():
            self._task.cancel()
        self._task = None

    async def eval(self, text: str, lang: str = "ru") -> TurnDecision:
        """Решение по накопленной расшифровке. При любой беде — `UNFINISHED`."""
        decision = TurnDecision.UNFINISHED  # по умолчанию — слушать дальше
        if not text.strip() or not self.available():
            # Без ИИ полагаться не на что: пусть решает тишина, то есть
            # считаем ход законченным, иначе игрок не сможет сходить вообще.
            return TurnDecision.FINISHED if text.strip() else decision

        stripped = remove_punctuation(text)
        task = asyncio.create_task(self._ask(stripped, lang))
        self._task = task
        try:
            content = (await asyncio.wait_for(task, timeout=self.config.timeout_s) or "").strip().lower()
        except (asyncio.TimeoutError, asyncio.CancelledError):
            return decision
        except Exception:
            return decision
        finally:
            self._task = None

        # Закрытый словарь, а не разбор свободного текста: дешёвая модель любит
        # добавить пояснение, и «finished, потому что…» обязано читаться как
        # finished, а не проваливаться в default.
        if content.startswith(TurnDecision.FINISHED.value):
            return TurnDecision.FINISHED
        if content.startswith(TurnDecision.WAIT.value):
            return TurnDecision.WAIT
        return TurnDecision.UNFINISHED

    async def _ask(self, text: str, lang: str) -> str | None:
        return await orchat.complete(
            _SYSTEM.get(lang, _SYSTEM["ru"]), text,
            role="judge",                 # тот же быстрый эндпоинт, что у судьи
            # Оригинал TEN ставит `max_tokens=1`: их модель `TEN_Turn_Detection`
            # обучена отвечать ровно одним специальным токеном. Универсальная
            # модель так не умеет — при бюджете в 4 токена gemini возвращала
            # пустой ответ, и детектор молча вырождался в вечное «unfinished»,
            # то есть ход не засчитывался никогда. Шестнадцати хватает.
            max_tokens=16, temperature=self.config.temperature, raw=True,
        )
