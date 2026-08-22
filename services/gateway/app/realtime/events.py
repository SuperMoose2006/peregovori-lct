"""events.py — словарь realtime-протокола «Диалога».

ПРОИСХОЖДЕНИЕ. База событий перенесена из MiniCPM-o-Demo (Apache-2.0,
commit 50b0865c), файлы `docs-app/content/docs/en/realtime-api/{overview,audio,
video,chat}.md` и обработчик `gateway.py:1384`. Оттуда взяты имена и жизненный
цикл: `session.init` → `session.created` → `input.append` →
`response.output.delta{kind}` → `session.close` → `session.closed{reason}`,
плюс очередь `session.queued/queue_update/queue_done` и конверт `error`.

ПОЧЕМУ ЭТОТ ПРОТОКОЛ, А НЕ ПРЕЖНИЙ `{type:"turn"}`. Старый был «запрос-ответ»:
клиент шлёт готовую реплику и ждёт готовый ответ. Здесь вход **накапливается**
(`input.append` можно звать сколько угодно раз до конца хода), а выход —
**поток независимых веток** (`kind`), которые не обязаны совпадать один к
одному. Именно это позволяет говорить и слушать одновременно.

ЧТО ДОБАВЛЕНО СВЕРХ MiniCPM. У них модель сама себе и судья, и голос, поэтому
кроме текста и звука отдавать нечего. У нас истину считает движок, и она обязана
доезжать до клиента отдельным, объяснимым каналом — отсюда `turn.analysis`,
`engine.state`, `judge.*`, `turn.coach`, `debrief`, `avatar.state`,
`vision.observation`.

ГЛАВНОЕ ПРАВИЛО ПРОТОКОЛА: **ядро всегда текстовое**. Голос — адаптер на краю
(ASR на входе даёт тот же `text`, TTS на выходе озвучивает тот же `text`).
Ни движок, ни оркестратор не знают, откуда пришёл ход.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Клиент → сервер
# ---------------------------------------------------------------------------

#: Режим сессии. `text` — клавиатура (звук не нужен), `voice` — полный дуплекс.
#: Разделение как у MiniCPM (`?mode=chat|audio|video`), но названия наши: у нас
#: и в text-режиме идёт полноценная realtime-сессия, просто без микрофона.
SessionMode = Literal["text", "voice"]

CLIENT_EVENTS = (
    "session.init",       # инициализация: сценарий, язык, слои
    "input.append",       # кусок пользовательского ввода (текст / аудио / кадры)
    "input.commit",       # явный конец хода (в text-режиме идёт сразу за append)
    "response.cancel",    # перебивание: погасить текущее поколение
    "coach.request",      # кнопка 💡 — подсказка тренера
    "session.close",
)

# ---------------------------------------------------------------------------
# Сервер → клиент
# ---------------------------------------------------------------------------

SERVER_EVENTS = (
    # — жизненный цикл (MiniCPM) —
    "session.queued",
    "session.queue_update",
    "session.queue_done",
    "session.created",
    "session.closed",
    "error",
    # — поток ответа (MiniCPM) —
    "response.output.delta",
    "response.done",
    # — наши, негоциационные —
    "turn.analysis",        # детерминированный разбор хода игрока (мгновенно)
    "engine.state",         # шкалы и цена после хода — истина движка
    "judge.started",        # честное имя ожидания: судья читает, а не «печатает…»
    "judge.completed",
    "turn.coach",           # пер-ходовой коучинг судьи
    "debrief",              # финальный разбор
    "generation.cancelled", # поколение погашено — клиент выбрасывает его хвост
    "avatar.state",         # состояние лица оппонента (из реакции движка)
    "vision.observation",   # наблюдение камеры — НЕ влияет на оценку
    "user.speech.started",  # VAD: игрок заговорил
    "user.speech.stopped",
    "user.transcript",      # расшифровка речи игрока (partial / final)
)

#: Ветки выходного потока. `listen` от MiniCPM: модель слушает и молчит.
#: `transcript` наш — расшифровка речи игрока едет тем же каналом, что и текст
#: оппонента, чтобы клиент не заводил второй путь.
OutputKind = Literal["text", "audio", "transcript", "listen"]


# ---------------------------------------------------------------------------
# Схемы
# ---------------------------------------------------------------------------

class SessionInit(BaseModel):
    """`session.init` — единственная точка, где задаётся партия.

    `layers` — опциональные слои модальностей (см. docs/modalities.md). Они
    НИКОГДА не входят в оценку; здесь они только включают каналы.
    """
    mode: SessionMode = "text"
    scenarioId: str = ""
    lang: Literal["ru", "en"] = "ru"
    gameMode: Literal["practice", "campaign", "custom", "exam"] = "practice"
    situation: Optional[str] = None        # для режима «своя сделка»
    reputation: Optional[float] = None     # репутация из прошлых актов кампании
    layers: dict[str, bool] = Field(default_factory=dict)
    #: Вернуться в брошенную партию после обрыва связи. Состояние игры держит
    #: движок, а не сокет, поэтому переподключение — это продолжение, а не
    #: новая партия. Пусто → начать заново.
    resume: Optional[str] = None


class InputAppend(BaseModel):
    """`input.append` — кусок ввода. Все поля необязательны и композируются:
    голосовой ход несёт `audio`, текстовый — `text`, кадры едут прицепом."""
    text: Optional[str] = None
    audio: Optional[str] = None            # base64 PCM16 LE, 16 кГц моно
    video_frames: Optional[list[str]] = None  # base64 JPEG
    force_listen: bool = False             # клиент требует вернуть оппонента в «слушаю»


class ErrorBody(BaseModel):
    code: str
    message: str
    type: str = "server_error"


# ---------------------------------------------------------------------------
# Конструкторы исходящих событий
# ---------------------------------------------------------------------------
#
# Почему функции, а не Pydantic-модели на каждое событие: события ходят по
# внутренней шине как обычные dict и сериализуются один раз на выходе в WS.
# Модель на каждое из двадцати событий дала бы двадцать классов ради валидации
# того, что мы же сами и собрали строкой ниже.

def output_delta(kind: OutputKind, *, generation_id: str, turn_id: int,
                 text: str | None = None, audio: str | None = None,
                 final: bool | None = None, **extra: Any) -> dict:
    """Одна ветка выходного потока.

    `generation_id` обязателен: по нему шина выбрасывает хвост погашенного
    поколения. Без него перебивание протекает — клиент слышит фразу, которую
    оппонент «уже не говорит».
    """
    msg: dict[str, Any] = {
        "type": "response.output.delta",
        "kind": kind,
        "generation_id": generation_id,
        "turn_id": turn_id,
    }
    if text is not None:
        msg["text"] = text
    if audio is not None:
        msg["audio"] = audio
    if final is not None:
        msg["final"] = final
    msg.update(extra)
    return msg


def response_done(*, generation_id: str, turn_id: int, text: str,
                  reason: str = "turn_end", **extra: Any) -> dict:
    """Авторитетное завершение реплики.

    Дельты СЫРЫЕ (модель может выдать мусор, который отсеет санитайзер), поэтому
    за потоком ВСЕГДА идёт `response.done` с итоговым текстом — клиент заменяет
    им накопленный пузырь. Это правило унаследовано от текущего протокола
    (`opponent_delta` → `opponent`) и остаётся в силе.
    """
    return {"type": "response.done", "generation_id": generation_id,
            "turn_id": turn_id, "text": text, "reason": reason, **extra}


def error(code: str, message: str, type_: str = "server_error") -> dict:
    return {"type": "error", "error": ErrorBody(code=code, message=message, type=type_).model_dump()}


def generation_cancelled(generation_id: str, reason: str = "barge_in") -> dict:
    return {"type": "generation.cancelled", "generation_id": generation_id, "reason": reason}


def session_closed(session_id: str, reason: str) -> dict:
    return {"type": "session.closed", "session_id": session_id, "reason": reason}
