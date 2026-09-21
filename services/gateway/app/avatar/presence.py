"""presence.py — лицо оппонента состояниями. Провайдер по умолчанию.

ЧТО ЭТО. Набор изображений (или коротких клипов) одного персонажа в разных
состояниях. Движок посчитал реакцию на ход — лицо меняется. Звук идёт отдельным
каналом и играется клиентом.

ПОЧЕМУ ЭТО ДЕФОЛТ, А НЕ ЗАГЛУШКА. Липсинк MuseTalk требует CUDA; на машине,
где собирался этот код, GPU нет (`nvidia-smi` отсутствует), а у OpenRouter нет
ни одной модели с видео на выходе — проверено запросом к каталогу: из 421
модели 406 текстовые, 11 с картинками, 4 со звуком, с видео ноль. Значит выбор
стоял не между «фотореализм» и «состояния», а между «состояния» и «пустой
прямоугольник».

ПОЧЕМУ ЭТО НЕ НАРУШАЕТ ПРАВИЛО ЧЕСТНОСТИ. Правило проекта — не бывает
состояния «выглядит настоящим, а внутри пусто». Здесь ничего не притворяется:
`capabilities().lipsync` равен False, интерфейс не обещает синхронных губ, а
стилистика выбрана намеренно не фотореалистичной. Меняется настоящая вещь —
реакция, вычисленная движком, а не имитация мимики.

ОТКУДА БЕРУТСЯ КАРТИНКИ. `tools/gen_avatar_states.py` генерирует их через
OpenRouter один раз и кладёт в `frontend/public/avatars/<persona>/<state>.webp`.
Результат коммитится: на демо не должно быть похода в сеть за лицом.

Локальные webm создаются tools/gen_avatar_motion.py: процедурное дыхание и
малые деформации области бровей. Это не захваченная мимика. Клиент сохраняет
webp/SVG fallback, reduced-motion и нейтральный экзамен.
"""

from __future__ import annotations

from typing import Callable, Optional

from app.avatar.base import (
    AVATAR_STATES,
    AvatarCapabilities,
    AvatarProvider,
    state_for_reaction,
)


class PresenceAvatar(AvatarProvider):
    """Лицо через смену состояний. Работает везде, GPU не нужен."""

    def __init__(self, persona_id: str, publish: Callable[[dict], None]) -> None:
        self._persona = persona_id
        self._publish = publish
        self._state = "idle"

    def capabilities(self) -> AvatarCapabilities:
        return AvatarCapabilities(
            available=True,
            # Честно: губ мы не синхронизируем. Клиент по этому флагу решает,
            # рисовать ли субтитры крупнее и не обещать ли видеозвонок словами.
            lipsync=False,
            interruptible=True,
            transport="images",
            states=AVATAR_STATES,
        )

    def describe(self) -> str:
        return f"presence (состояния персонажа {self._persona}, без липсинка)"

    async def set_state(self, state: str, *, reaction: Optional[str] = None) -> None:
        if state not in AVATAR_STATES:
            state = "listening"
        self._state = state
        self._publish({
            "type": "avatar.state",
            "state": state,
            "reaction": reaction,
            "persona": self._persona,
            # `lipsync: false` едет в каждом событии сознательно: клиент не
            # должен помнить рукопожатие, чтобы не ошибиться в подписи.
            "lipsync": False,
        })

    async def react(self, reaction: str) -> None:
        """Удобный вход из оркестратора: реакция движка → состояние."""
        await self.set_state(state_for_reaction(reaction), reaction=reaction)

    async def speak(self, pcm: bytes, *, generation_id: str) -> None:
        """Звук здесь не проходит: его несёт `response.output.delta{kind:audio}`.

        Разделение намеренное. Аудио одинаково для всех провайдеров лица, и
        гонять его вторым путём — значит завести второй источник рассинхрона.
        Провайдер лишь переключается в «говорит» на время речи.
        """
        # The client knows actual playback, including buffering and its end.
        # A server-side "speaking" here would outlive response.done and stick.
        return None

    async def interrupt(self) -> None:
        await self.set_state("listening")
