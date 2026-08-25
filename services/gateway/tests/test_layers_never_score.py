"""test_layers_never_score.py — ни один слой не входит в `score_session`.

Третий принцип продукта: грейд со слоями обязан быть сравним с грейдом без них,
иначе сертификат экзамена перестаёт что-то значить, а акты кампании — быть
сопоставимыми.

Существующая проверка (`test_vision.py`) читала исходник `score_session` и
искала в нём слова «camera» и «observation». Это верно, но узко: она ничего не
говорит о голосе, зонде эмоций и аватаре, и молчит о том, откуда счёт вообще
берёт данные.

Здесь то же обещание доказывается с другой стороны — со стороны ВХОДА. Счёт
принимает `engine.Session`; если в этой структуре нет ни одного поля со
сигналом слоя, протащить слой в грейд нельзя, даже захотев: сначала пришлось
бы менять границу типов.
"""

from __future__ import annotations

import dataclasses
import inspect

from app import engine

#: Сигналы слоёв — по ГРАНИЦАМ СЛОВ, а не по подстрокам. Наивный поиск
#: подстроки давал ложные срабатывания и был бы выброшен при первой же попытке
#: им пользоваться: «mic» находился внутри «economic», «face» внутри «surface»,
#: а «probe» — внутри `interest_probes`, что вообще ПРИЁМ переговоров, а не слой.
#:
#: Список шире четырёх слоёв намеренно: он ловит и будущие сигналы — взгляд,
#: громкость, паузу, — которые захочется подмешать «на минутку».
LAYER_WORDS = (
    r"camera", r"observation", r"vision", r"video_frame",
    r"voice", r"audio", r"speech", r"microphone", r"prosody", r"pause_ms",
    r"probe_\w+", r"emotion", r"gaze", r"lipsync", r"avatar",
)


#: Граница слова считается по БУКВАМ, а не через `\\b`: подчёркивание — часть
#: слова для регулярных выражений, поэтому `\\bcamera\\b` не находил `_camera_bonus`.
#: Проверено подлогом: с такой границей тест протечку пропускал.
_BOUND = r"(?<![a-z]){}(?![a-z])"


def _field_names(cls) -> list[str]:
    if dataclasses.is_dataclass(cls):
        return [f.name for f in dataclasses.fields(cls)]
    return [k for k in getattr(cls, "__annotations__", {})]


def test_game_state_carries_no_layer_signal():
    """В состоянии партии нет полей слоёв — счёту неоткуда их взять."""
    names = _field_names(engine.Session) + _field_names(type(engine.create_session("supplier", "ru").state))
    import re
    for name in names:
        low = name.lower()
        for word in LAYER_WORDS:
            assert not re.search(_BOUND.format(word), low), (
                f"поле состояния «{name}» несёт сигнал слоя «{word}» — "
                f"счёт получил бы к нему доступ"
            )


def test_score_source_mentions_no_layer():
    """И сам счёт ни одного из них не упоминает."""
    import re
    source = inspect.getsource(engine.score_session).lower()
    for word in LAYER_WORDS:
        hit = re.search(_BOUND.format(word), source)
        assert not hit, f"score_session упоминает «{hit.group(0)}»"


def test_identical_play_scores_identically_whatever_the_layers():
    """Поведенческая проверка: одни и те же ходы — один и тот же грейд.

    Слои живут в `RealtimeSession`, счёт считает по `engine.Session`. Если
    когда-нибудь между ними появится мостик, эта проверка упадёт первой, не
    полагаясь на то, как мостик назовут.
    """
    moves = [
        "Что для вас важнее всего в этой сделке и почему именно это?",
        "По рыночным данным справедливый ориентир другой; давайте опираться на них.",
        "Договорились, фиксируем на этих условиях?",
    ]

    def play() -> dict:
        sess = engine.create_session("supplier", "ru")
        for line in moves:
            sess.turn += 1
            if engine.apply_move(sess, engine.analyze(line), line).closed:
                break
        return engine.score_session(sess)

    first, second = play(), play()
    for key in ("overall", "grade", "economic", "relationship", "technique"):
        assert first[key] == second[key], f"счёт недетерминирован по полю {key}"
