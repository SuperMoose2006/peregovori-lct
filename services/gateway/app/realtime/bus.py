"""bus.py — шина событий сессии с владением поколениями.

ЗАЧЕМ ОТДЕЛЬНАЯ ШИНА. В старом пути хендлер `/ws` сам звал ИИ и сам слал ответ:
одна корутина, один порядок, отменять нечего. В дуплексе одновременно живут
несколько производителей (судья, мозг оппонента, TTS, зрение, VAD) и один
потребитель (сокет). Им нужна общая точка, где можно **погасить всё, что
принадлежит перебитому ходу**.

ГЛАВНОЕ АРХИТЕКТУРНОЕ РЕШЕНИЕ: отмена фильтрует на ВЫХОДЕ, а не на входе.

Соблазнительно проверять «поколение живо?» перед `publish`. Так делать нельзя:
между проверкой и записью проходит время, а корутина TTS могла проснуться уже
после перебивания и успеть положить чанк. Проверка на выходе — единственное
место, где ответ гарантированно свежий, потому что дальше сразу сокет.

Практическое следствие, ради которого всё и затевалось: после `cancel()` ни
один старый аудиочанк не доедет до клиента, даже если синтез успел его
дописать. Это проверяется тестом `test_cancelled_generation_never_reaches_the_socket`.

Паттерн владения поколением взят из TEN main_control (Apache-2.0, commit
2e56d965), `ai_agents/agents/examples/voice-assistant/tenapp/ten_packages/
extension/main_python/extension.py`: там каждое сообщение несёт
`{session_id, turn_id}` в метаданных, а `_interrupt()` гасит подсистемы разом.
Мы добавили третий уровень — `generation_id`: один ход игрока может породить
несколько поколений ответа (например, оппонент начал, его перебили, он начал
заново), и гасить надо именно поколение, а не ход целиком.
"""

from __future__ import annotations

import asyncio
import contextlib
import itertools
from typing import AsyncIterator

# Потолок очереди. Аудио идёт чанками по ~20–40 мс, так что тысяча событий —
# это порядка полуминуты речи в буфере. Если мы столько отстали, клиент всё
# равно уже не слушает, и копить дальше вредно.
_MAX_QUEUE = 1000


class EventBus:
    """Односессионная шина: много производителей, один потребитель (сокет)."""

    def __init__(self) -> None:
        self._q: asyncio.Queue[dict] = asyncio.Queue(maxsize=_MAX_QUEUE)
        self._dead: set[str] = set()
        self._closed = False
        self._dropped = 0  # для метрик: сколько хвостов погашенных поколений съедено

    # -- производители ------------------------------------------------------

    def publish(self, event: dict) -> None:
        """Положить событие. Никогда не блокирует и никогда не бросает.

        Производители — это корутины ИИ и TTS; уронить синтез из-за переполнения
        очереди было бы худшим из возможных исходов, поэтому переполнение просто
        теряет событие и увеличивает счётчик.
        """
        if self._closed:
            return
        try:
            self._q.put_nowait(event)
        except asyncio.QueueFull:
            self._dropped += 1

    # -- отмена -------------------------------------------------------------

    def cancel(self, generation_id: str) -> None:
        """Пометить поколение мёртвым. Всё, что от него ещё придёт, — в мусор."""
        if generation_id:
            self._dead.add(generation_id)

    def is_dead(self, generation_id: str | None) -> bool:
        return bool(generation_id) and generation_id in self._dead

    # -- потребитель --------------------------------------------------------

    async def drain(self) -> AsyncIterator[dict]:
        """Поток живых событий. Хвосты погашенных поколений отсеиваются здесь.

        Событие без `generation_id` (состояние движка, разбор, ошибка) проходит
        всегда: оно не принадлежит ни одному поколению и остаётся правдой
        независимо от того, кого перебили.

        Условие цикла — стоп-метка, а не флаг `_closed`. Разница существенная:
        после `close()` в очереди ещё лежат события, и разбор партии не должен
        пропасть только потому, что клиент уже отсоединяется.
        """
        while True:
            event = await self._q.get()
            if event is _SENTINEL:
                break
            if self.is_dead(event.get("generation_id")):
                self._dropped += 1
                continue
            yield event

    def close(self) -> None:
        self._closed = True
        try:
            self._q.put_nowait(_SENTINEL)
        except asyncio.QueueFull:
            # Очередь переполнена — освобождаем одно место: без стоп-метки
            # читатель повис бы навсегда, а это утечка задачи на каждую сессию.
            with contextlib.suppress(asyncio.QueueEmpty):
                self._q.get_nowait()
                self._dropped += 1
            with contextlib.suppress(asyncio.QueueFull):
                self._q.put_nowait(_SENTINEL)

    @property
    def dropped(self) -> int:
        return self._dropped


#: Стоп-метка для `drain()`. Отдельный объект, а не None: None — законное
#: значение внутри событий, а спутать стоп с данными нельзя.
_SENTINEL: dict = {"type": "__sentinel__"}


_gen_counter = itertools.count(1)


def new_generation_id(session_id: str, turn_id: int) -> str:
    """Идентификатор поколения, читаемый в логах: видно сессию, ход и попытку.

    Счётчик процессный, а не пер-сессионный — так два поколения из разных
    сессий никогда не совпадут даже при коллизии коротких session_id.
    """
    return f"{session_id}:{turn_id}:{next(_gen_counter)}"
