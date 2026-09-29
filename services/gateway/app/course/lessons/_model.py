"""_model.py — форма учебного материала к одному уроку курса.

ЗАЧЕМ ОТДЕЛЬНАЯ ФОРМА, А НЕ ЕЩЁ ОДИН АБЗАЦ В `Lesson.body`. Тело урока в
`blocks.py` отвечает на вопрос «как это устроено в тренажёре» и держится на
числах движка, которые сверяет тест. Человеку, который ни разу не вёл
переговоров, этого мало: он выносит термин и не выносит фразы. Материал отвечает
на другой вопрос — «что я скажу завтра» — и поэтому у него жёсткий скелет из
шести частей. Скелет задан типами, а не договорённостью: урок без плохого
примера рядом с хорошим или без «когда не работает» просто не соберётся.

ФРАЗА — НЕ ТЕКСТ, А ОБЕЩАНИЕ. Урок, который учит реплике, проигрывающей партию,
нарушает инвариант 9 («правильный ответ в упражнении курса обязан быть
правильным в игре»). Поэтому у фразы и у реплики игрока в диалоге есть поля
`moves` и `reveals`: какие приёмы движок ОБЯЗАН в ней увидеть и должен ли вопрос
вскрыть интерес на столе урока. Сверяет их `_check.py` настоящими `analyze()` и
`apply_move()` на обоих языках.

Билингвальность — как везде в продукте: `{"ru": ..., "en": ...}`.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.course.blocks import T

Loc = dict[str, str]

__all__ = ["T", "Loc", "Phrase", "Line", "you", "them", "Dialog", "Mistake",
           "Limit", "LessonMaterial"]


@dataclass(frozen=True)
class Phrase:
    """Готовая формулировка, которую можно сказать вслух."""

    text: Loc
    #: Приёмы, которые движок обязан распознать в реплике на ОБОИХ языках.
    #: Пусто — движок приёма не называет (например, «давайте договоримся, от
    #: чего считаем»), и тогда проверяется только, что фраза не читается как
    #: грубость, ультиматум, уступка или закрытие сделки.
    moves: tuple[str, ...] = ()
    #: Вопрос обязан вскрыть скрытый интерес на столе урока — с нуля, первым ходом.
    reveals: bool = False
    #: Когда её говорить, если это не очевидно из самой фразы.
    when: Loc | None = None


@dataclass(frozen=True)
class Line:
    """Реплика в примере диалога."""

    who: str  # "you" | "them"
    text: Loc
    moves: tuple[str, ...] = ()
    reveals: bool = False


def you(ru: str, en: str, moves: tuple[str, ...] = (), reveals: bool = False) -> Line:
    return Line("you", T(ru, en), tuple(moves), reveals)


def them(ru: str, en: str) -> Line:
    return Line("them", T(ru, en))


@dataclass(frozen=True)
class Dialog:
    """Один и тот же момент разговора, сыгранный плохо и хорошо.

    `opening` — общие реплики до развилки. Ветки прогоняются через движок
    ПОСЛЕДОВАТЕЛЬНО, в одной партии: вскрытие во второй реплике зависит от
    доверия, которое набрала первая, и проверять их порознь значило бы
    проверять не тот диалог, что написан.
    """

    setup: Loc
    bad: tuple[Line, ...]
    bad_why: Loc
    good: tuple[Line, ...]
    good_why: Loc
    opening: tuple[Line, ...] = ()
    #: Шкалы стола перед диалогом, если он начинается не с нуля
    #: (как `state` у упражнений банка): trust, tension, info, leverage.
    state: dict[str, float] | None = None


@dataclass(frozen=True)
class Mistake:
    title: Loc
    why: Loc


@dataclass(frozen=True)
class Limit:
    """Где приём не работает — и что делать вместо него. Вместе, всегда."""

    when: Loc
    instead: Loc


@dataclass(frozen=True)
class LessonMaterial:
    #: Ключ урока — ровно те поля, которыми упражнение банка ссылается на урок.
    block: str
    lesson: int
    #: Стол, на котором проверяются фразы, — стол блока, если не сказано иное.
    scenario_id: str
    #: Приём простыми словами — то, что человек назовёт, пересказывая урок.
    technique: Loc
    why: Loc
    core: Loc  # абзацы через "\n\n", как у `Lesson.body`
    phrases: tuple[Phrase, ...]
    dialog: Dialog
    mistakes: tuple[Mistake, ...]
    limits: tuple[Limit, ...]
    #: Другие столы, чьих собеседников урок называет по имени НАМЕРЕННО.
    also_tables: tuple[str, ...] = field(default_factory=tuple)

    @property
    def key(self) -> tuple[str, int]:
        return (self.block, self.lesson)
