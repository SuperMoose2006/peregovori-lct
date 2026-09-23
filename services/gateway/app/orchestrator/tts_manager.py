"""tts_manager.py — параллельный синтез фраз со строгим порядком выдачи.

╔══════════════════════════════════════════════════════════════════════════╗
║ ПОРТ UPSTREAM-КОДА                                                       ║
║ Источник: Open-LLM-VTuber, MIT License, Copyright (c) 2025 Yi-Ting Chiu   ║
║ Коммит:   992309c0aa19845960228f880013d4685fde93b5                       ║
║ Файл:     src/open_llm_vtuber/conversations/tts_manager.py               ║
║ Полный провенанс: docs/upstream-code-map.md                              ║
╚══════════════════════════════════════════════════════════════════════════╝

ЗАЧЕМ ЭТО НУЖНО. Измерено на этой машине: edge-tts отдаёт первый чанк через
0.6–3.4 с, и разброс зависит от сети, а не от длины фразы. Синтезировать фразы
по очереди — значит складывать эти задержки: пять фраз, каждая по полторы
секунды ожидания, и человек семь секунд слушает тишину между предложениями.

Решение оригинала: **синтезировать параллельно, отдавать строго по порядку**.
Счётчик последовательности плюс буфер переупорядочивания — пока играется
первая фраза, вторая и третья уже готовы.

ЧТО ИЗМЕНЕНО ОТНОСИТЕЛЬНО ОРИГИНАЛА, И ПОЧЕМУ.

1. Оригинал синтезирует фразу в **файл** и отдаёт путь. Здесь — PCM-чанки в
   шину: файл нельзя перебить на середине и нельзя начать играть, пока он не
   дописан (см. `providers/tts/base.py`).

2. Добавлена потоковость **внутри** текущей фразы. У оригинала единица выдачи —
   готовый файл целиком. Здесь каждая фраза пишет в свою очередь, а отправщик
   пересылает чанки текущей фразы по мере поступления. Параллельность между
   фразами сохранена, но первый звук уходит ещё раньше.

3. Добавлено владение поколением. У оригинала `clear()` просто отменяет задачи;
   здесь каждая фраза помнит своё `generation_id`, и шина выбрасывает хвост
   перебитого поколения на выходе (`realtime/bus.py`). Без этого чанк,
   дописанный синтезом уже после перебивания, всё равно доехал бы до колонок.
"""

from __future__ import annotations

import asyncio
import base64
from typing import Callable, Optional

from app.providers.tts.base import TTSProvider, Voice
from app.realtime.events import error, output_delta

#: Метка конца фразы во внутренней очереди.
_EOP = b""


class TTSTaskManager:
    """Очередь фраз на озвучку с параллельным синтезом."""

    def __init__(self, provider: TTSProvider, publish: Callable[[dict], None],
                 voice: Voice, *, fallback: Optional[TTSProvider] = None) -> None:
        self._provider = provider
        self._fallback = fallback
        self._publish = publish
        self._voice = voice

        self._tasks: list[asyncio.Task] = []
        self._queues: list[asyncio.Queue[bytes | dict]] = []
        self._sender: Optional[asyncio.Task] = None
        self._sequence = 0          # сколько фраз принято
        self._next_to_send = 0      # какая фраза сейчас имеет право звучать
        self._generation_id = ""
        self._turn_id = 0

    # ------------------------------------------------------------------ вход

    def speak(self, text: str, *, generation_id: str, turn_id: int) -> None:
        """Поставить фразу в очередь. Синтез стартует немедленно и параллельно."""
        if not text.strip() or not any(p and p.available() for p in
                                      (self._provider, self._fallback)):
            return

        # Смена поколения = новая реплика. Всё, что осталось от прошлой, гасим:
        # иначе хвост перебитой реплики озвучится поверх новой.
        if generation_id != self._generation_id:
            self.clear()
            self._generation_id = generation_id
            self._turn_id = turn_id

        index = self._sequence
        self._sequence += 1
        queue: asyncio.Queue[bytes | dict] = asyncio.Queue()
        self._queues.append(queue)
        self._tasks.append(asyncio.create_task(
            self._synth(text, queue, generation_id, turn_id)))

        if self._sender is None or self._sender.done():
            self._sender = asyncio.create_task(self._send_in_order())
        _ = index  # порядок задаётся позицией в `self._queues`

    # -------------------------------------------------------------- внутри

    async def _synth(self, text: str, queue: asyncio.Queue[bytes | dict],
                     generation_id: str, turn_id: int) -> None:
        """Запасной голос допустим, пока ни один кусок этой фразы не выдан.

        После первого чанка повтор синтеза повторил бы услышанные слова.
        Тогда сохраняем уже выданный звук и явно сообщаем об обрыве.
        Ошибка стоит в той же очереди, что звук: порядок фраз сохраняется.
        """
        emitted = False
        try:
            for provider in (self._provider, self._fallback):
                if provider is None or not provider.available():
                    continue
                try:
                    async for chunk in provider.stream(text, self._voice):
                        if chunk:
                            emitted = True
                            await queue.put(chunk)
                    if emitted:
                        return
                except asyncio.CancelledError:
                    raise
                except Exception:
                    if emitted:
                        break
            code = "tts_interrupted" if emitted else "tts_unavailable"
            messages = {
                "ru": ("Озвучка прервалась. Продолжение реплики доступно в тексте."
                       if emitted else "Озвучка недоступна. Реплика доступна в тексте."),
                "en": ("Audio was interrupted. Read the rest of the reply in the text."
                       if emitted else "Audio is unavailable. Read the reply in the text."),
            }
            event = error(code, messages.get(self._voice.lang, messages["ru"]))
            event.update(generation_id=generation_id, turn_id=turn_id)
            await queue.put(event)
        except asyncio.CancelledError:
            raise
        finally:
            await queue.put(_EOP)

    async def _send_in_order(self) -> None:
        """Отправщик: строго по очереди фраз, внутри фразы — по мере готовности.

        Это и есть буфер переупорядочивания оригинала, только вывернутый в
        потоковую форму: ждём не «готовый файл фразы N», а «очередь фразы N».
        """
        try:
            while True:
                if self._next_to_send >= len(self._queues):
                    # Фраз пока нет. Ждём коротко, а не выходим: делитель мог
                    # ещё не дорезать следующую — реплика продолжается.
                    await asyncio.sleep(0.02)
                    if self._next_to_send >= len(self._queues) and self._all_done():
                        return
                    continue

                queue = self._queues[self._next_to_send]
                while True:
                    chunk = await queue.get()
                    if chunk is _EOP or chunk == _EOP:
                        break
                    if isinstance(chunk, dict):
                        self._publish(chunk)
                        continue
                    self._publish(output_delta(
                        "audio",
                        generation_id=self._generation_id,
                        turn_id=self._turn_id,
                        audio=base64.b64encode(chunk).decode("ascii"),
                    ))
                self._next_to_send += 1
        except asyncio.CancelledError:
            raise

    def _all_done(self) -> bool:
        return bool(self._tasks) and all(t.done() for t in self._tasks)

    # ----------------------------------------------------------------- отмена

    def clear(self) -> None:
        """Перебивание: погасить синтез и выбросить всё, что не успело зазвучать.

        Перенос `clear()` оригинала. Шина отдельно выбросит уже опубликованные
        чанки этого поколения — это второй, независимый рубеж (см. модульный
        комментарий, пункт 3).
        """
        for task in self._tasks:
            if not task.done():
                task.cancel()
        if self._sender and not self._sender.done():
            self._sender.cancel()
        self._tasks.clear()
        self._queues.clear()
        self._sender = None
        self._sequence = 0
        self._next_to_send = 0

    async def wait_idle(self) -> None:
        """Дождаться, пока всё запрошенное озвучится (для тестов и разбора)."""
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        if self._sender and not self._sender.done():
            try:
                await asyncio.wait_for(self._sender, timeout=5.0)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                pass
