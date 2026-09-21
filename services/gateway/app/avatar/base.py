"""base.py — интерфейс лица оппонента.

ГЛАВНОЕ РЕШЕНИЕ ЭТОГО СЛОЯ: **эмоцию оппонента определяет движок, а не модель.**

Соблазн очевидный — попросить мультимодальную модель посмотреть на разговор и
сказать, что чувствует персонаж. Так делать нельзя, и не из экономии.
Детерминированный движок УЖЕ вычислил реакцию на этот ход
(`engine.MoveResult.reaction`): он знает, перешёл ли игрок черту, вскрыл ли
интерес, надавил ли. Спросить модель — значит получить второе, менее
информированное мнение о том, что уже известно точно, и рискнуть, что лицо
покажет улыбку в тот ход, когда движок засчитал оскорбление. Тренажёр обязан
быть объяснимым: реакция на лице и реакция в шкалах — одно и то же число.

ЛЕСТНИЦА РЕАКЦИЙ ДВИЖКА (`app/engine/engine.py:257-424`) уже ровно та, что
нужна: neutral · warmed · opened_up · persuaded · pressured · collaborated ·
hardened · offended · not_yet · probe_vague · walked_out.

СЛОВАРЬ СОБЫТИЙ взят у Duix-Mobile (DUIX.COM Community License, commit
690fe81d), `duix-android/.../sdk/client/Constant.java`: `play.start` /
`play.end` / `motion.start` / `motion.end`. Мы держим ту же форму, чтобы
мобильный рендерер Duix однажды встал сюда без переговоров о протоколе.

ЧЕСТНОСТЬ ВОЗМОЖНОСТЕЙ. `capabilities()` — не украшение. Провайдер обязан
сказать `lipsync=False`, если за ним нет настоящего липсинка. Правило проекта:
слой, который мы не умеем, сообщает «недоступно», а не изображает умение.
"""

from __future__ import annotations

# CONTRACT(avatar-video): общий интерфейс и передача PCM готовы, внешнего адаптера нет.
# Настоящим станет: выбранный провайдер с проверкой задержки, отмены и закрытия ресурсов.

import abc
from dataclasses import dataclass, field

#: Состояния лица. Надмножество запрошенного в задании; каждое обязано иметь
#: картинку или клип — то, что умеет `presence`.
AVATAR_STATES = (
    "idle", "listening", "thinking", "speaking", "hesitation",
    "nod", "shake_head", "lean_back", "lean_forward",
    "smile", "annoyed", "offended", "warm", "walk_out",
)

#: Реакция движка → состояние лица. Единственное место, где делается перевод.
#: Читать как сценарий: что видно на лице, когда движок засчитал такой ход.
REACTION_TO_STATE: dict[str, str] = {
    "neutral": "listening",       # ход прошёл, ничего не сдвинулось
    "warmed": "warm",             # потеплел
    "opened_up": "lean_forward",  # раскрылся, подался вперёд
    "persuaded": "nod",           # согласился с доводом
    "collaborated": "smile",      # пошёл на совместное решение
    "pressured": "lean_back",     # на него давят, он отстраняется
    "hardened": "annoyed",        # закрылся
    "offended": "offended",       # задели
    "not_yet": "shake_head",      # «нет, не так»
    "probe_vague": "listening",   # «а что именно вас интересует?» — переспрос
    "walked_out": "walk_out",     # встал и вышел — конец партии
}


def state_for_reaction(reaction: str) -> str:
    return REACTION_TO_STATE.get(reaction, "listening")


@dataclass
class AvatarCapabilities:
    """Что провайдер реально умеет. Ответ уходит клиенту в `session.created`."""

    #: Есть ли лицо вообще.
    available: bool = False
    #: Движение рта от действительного звука; качество обязательно в lipsync_mode.
    #: amplitude — локальное раскрытие рта, не фонемы/фотореализм.
    lipsync: bool = False
    #: Explicit quality: none, amplitude (local SVG), or provider visemes/video.
    lipsync_mode: str = "none"
    #: Умеет ли провайдер прерывать себя на полуслове.
    interruptible: bool = False
    #: Транспорт видео: none | images | webrtc.
    transport: str = "none"
    #: Человекочитаемая причина недоступности — рисуется под переключателем.
    reason: dict[str, str] = field(default_factory=dict)
    #: Поддерживаемые состояния.
    states: tuple[str, ...] = AVATAR_STATES


class AvatarProvider(abc.ABC):
    """Presence, local amplitude renderer, or an explicitly registered video adapter."""

    @abc.abstractmethod
    def capabilities(self) -> AvatarCapabilities:
        ...

    @abc.abstractmethod
    async def set_state(self, state: str, *, reaction: str | None = None) -> None:
        """Показать состояние. Вызывается из оркестратора после хода движка."""

    @abc.abstractmethod
    async def speak(self, pcm: bytes, *, generation_id: str) -> None:
        """Принять тот же float32 little-endian PCM 24kHz mono, что слышит клиент.

        Метод только ставит данные в ограниченную очередь провайдера (<50ms).
        Нельзя повторно озвучивать текст или блокировать TTS. generation_id
        отделяет отменённую речь; interrupt обязан очистить очередь.
        """

    @abc.abstractmethod
    async def interrupt(self) -> None:
        """Замолчать немедленно и очистить очередь звука."""

    @abc.abstractmethod
    def describe(self) -> str:
        ...

    async def close(self) -> None:
        """Release provider tasks/connections on socket close. Override for video."""
        await self.interrupt()
