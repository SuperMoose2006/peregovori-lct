"""session.py — состояние одной realtime-сессии.

Тонкая оболочка вокруг сессии движка. Всё, что относится к **игре** (шкалы,
цена, интересы, счёт), живёт в `engine.Session` и меняется только движком.
Здесь — только то, что относится к **разговору**: чей сейчас ход, какое
поколение ответа живо, какие слои включены, что оппонент успел сказать до того,
как его перебили.

Разделение неслучайно: движок обязан оставаться воспроизводимым и тестируемым
без единого упоминания сокетов, поколений и микрофона.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from app.realtime.bus import EventBus, new_generation_id


@dataclass
class Layers:
    """Опциональные слои модальностей.

    ИНВАРИАНТ (docs/modalities.md): ни один слой не входит в `score_session`.
    Грейд со слоями обязан быть сравним с грейдом без них, иначе сертификат
    экзамена перестаёт что-то значить. Слои меняют только то, ЧТО ПОКАЗЫВАЕТ
    РАЗБОР и насколько живым выглядит оппонент.
    """
    probe: bool = False    # «читай лицо» — вопрос про реакцию оппонента
    voice: bool = False    # микрофон + голос оппонента
    camera: bool = False   # кадры в VLM для контекста присутствия
    avatar: bool = False   # лицо оппонента (состояния / липсинк)

    @classmethod
    def from_dict(cls, d: dict[str, bool] | None) -> "Layers":
        d = d or {}
        return cls(probe=bool(d.get("probe")), voice=bool(d.get("voice")),
                   camera=bool(d.get("camera")), avatar=bool(d.get("avatar")))


@dataclass
class RealtimeSession:
    """Одна партия по одному сокету."""

    session_id: str
    engine_session: Any                 # engine.Session — истина игры
    lang: str = "ru"
    mode: str = "text"                  # text | voice
    game_mode: str = "practice"         # practice | campaign | custom | exam
    layers: Layers = field(default_factory=Layers)
    bus: EventBus = field(default_factory=EventBus)

    # --- владение поколением ------------------------------------------------
    #: Поколение — это одна попытка оппонента ответить. Ход игрока может
    #: породить их несколько: начал отвечать → перебили → отвечает заново.
    generation_id: Optional[str] = None

    # --- буфер входящего хода ----------------------------------------------
    #: `input.append` накапливает сюда, `input.commit` забирает. В голосовом
    #: режиме сюда падает расшифровка, в текстовом — то, что напечатали.
    pending_text: str = ""
    pending_frames: list[str] = field(default_factory=list)

    # --- что оппонент успел сказать вслух ----------------------------------
    #: Заполняется по мере стриминга. При перебивании этот кусок дописывается
    #: в историю (см. `interrupt()`), иначе оппонент не знает, на чём его
    #: оборвали, и повторяет сказанное — в голосе это слышно мгновенно.
    #: Приём взят из Open-LLM-VTuber `conversation_handler.py:112`
    #: (`heard_response` → `[Interrupted by user]`).
    spoken_so_far: str = ""

    #: Наблюдения камеры за сессию. Идут в контекст оппонента и в разбор,
    #: НО НИКОГДА в счёт. Хранятся здесь, а не в engine.Session, именно чтобы
    #: физически не оказаться на входе `score_session`.
    observations: list[str] = field(default_factory=list)

    # ------------------------------------------------------------------ ходы

    @property
    def turn_id(self) -> int:
        return self.engine_session.turn

    def begin_generation(self) -> str:
        """Открыть новое поколение ответа оппонента."""
        self.generation_id = new_generation_id(self.session_id, self.turn_id)
        self.spoken_so_far = ""
        return self.generation_id

    def interrupt(self, reason: str = "barge_in") -> Optional[str]:
        """Погасить текущее поколение. Возвращает погашенный id (или None).

        Три вещи происходят здесь и только здесь:
          1. шина перестаёт выпускать хвост поколения наружу;
          2. услышанный кусок дописывается в историю разговора;
          3. поколение забывается, чтобы следующий ответ был новым.

        Гашение TTS, мозга и аватара — не тут: этим занимается оркестратор,
        потому что у него есть ссылки на живые задачи. Здесь — только то, что
        касается состояния разговора.
        """
        gen = self.generation_id
        if gen is None:
            return None
        self.bus.cancel(gen)
        heard = self.spoken_so_far.strip()
        if heard:
            # Ровно та формулировка, что у Open-LLM-VTuber: оппонент видит в
            # истории собственную оборванную реплику и метку, что его прервали.
            self.engine_session.log.append(
                {"role": "opp", "text": heard + " …", "interrupted": True}
            )
        self.generation_id = None
        self.spoken_so_far = ""
        return gen

    # ------------------------------------------------------------- накопление

    def append_input(self, *, text: str | None = None,
                     frames: list[str] | None = None) -> None:
        if text:
            # Пробел между кусками: ASR отдаёт фразы без хвостового пробела,
            # склейка встык слепила бы «ценаменя не устраивает».
            self.pending_text = (self.pending_text + " " + text).strip() if self.pending_text else text
        if frames:
            self.pending_frames.extend(frames)

    def take_input(self) -> tuple[str, list[str]]:
        """Забрать накопленный ход и очистить буфер."""
        text, frames = self.pending_text.strip(), self.pending_frames
        self.pending_text, self.pending_frames = "", []
        return text, frames
