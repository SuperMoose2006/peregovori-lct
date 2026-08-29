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
    # «Покерфейс» считает кадры с явным выражением на лице. Слово стоит здесь
    # ровно затем, чтобы попытка занести счётчик в грейд валила сборку: держать
    # лицо — упражнение, а не критерий сделки.
    r"pokerface", r"poker_face", r"tells",
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


MOVES = [
    "Что для вас важнее всего в этой сделке и почему именно это?",
    "По рыночным данным справедливый ориентир другой; давайте опираться на них.",
    "Договорились, фиксируем на этих условиях?",
]

SCORE_FIELDS = ("overall", "grade", "economic", "relationship", "technique")


def test_the_same_play_is_deterministic():
    """Опорная проверка: без неё сравнение со слоями ничего не доказывало бы.

    Она И БЫЛА тем, что здесь стояло, — под именем
    «…whatever the layers» и с обещанием поймать мостик между слоями и счётом.
    Обещание было пустым: в тесте не участвовало НИ ОДНОГО слоя, обе партии шли
    голым движком, и упасть он мог только от недетерминированности самого
    движка. Прибор мерил не то, что написано на его шкале.
    """
    def play() -> dict:
        sess = engine.create_session("supplier", "ru")
        for line in MOVES:
            sess.turn += 1
            if engine.apply_move(sess, engine.analyze(line), line).closed:
                break
        return engine.score_session(sess)

    first, second = play(), play()
    for key in SCORE_FIELDS:
        assert first[key] == second[key], f"счёт недетерминирован по полю {key}"


def test_layers_that_actually_spoke_change_nothing_in_the_score():
    """А ВОТ ЗДЕСЬ СЛОИ ДЕЙСТВИТЕЛЬНО РАБОТАЮТ — и счёт обязан их не заметить.

    Партия проигрывается дважды одними и теми же репликами. Во второй раз все
    слои включены, камера успевает высказаться между ходами, «покерфейс»
    считает сорвавшееся лицо, а голосовое перебивание дописывает оборванную
    реплику оппонента в `engine.Session.log` — единственное место, где слой
    вообще касается структуры движка. Совпадение всех пяти чисел и есть
    инвариант 6.

    Ход `interrupt()` здесь не декорация: это ЕДИНСТВЕННЫЙ известный путь, по
    которому слой пишет внутрь сессии движка. Если счёт когда-нибудь начнёт
    читать `log` — длину, тон, что угодно, — упадёт эта проверка, а не разбор
    на показе.
    """
    from app.realtime.session import Layers, RealtimeSession

    def play(with_layers: bool) -> dict:
        eng = engine.create_session("supplier", "ru")
        rt = RealtimeSession(
            session_id="s", engine_session=eng, lang="ru",
            layers=Layers(probe=True, voice=True, camera=True, avatar=True,
                          pokerface=True) if with_layers else Layers())
        for i, line in enumerate(MOVES):
            if with_layers:
                rt.note_vision("в кадре появился второй человек", turn=i,
                               expressive=True)
                rt.tells += 1
                # Перебивание голосом: слой пишет в журнал сессии ДВИЖКА.
                rt.begin_generation()
                rt.spoken_so_far = "Мы не готовы двигаться по цене"
                rt.interrupt()
            eng.turn += 1
            if engine.apply_move(eng, engine.analyze(line), line).closed:
                break
        assert not with_layers or (rt.vision_notes and rt.tells and rt.vision_looks)
        return engine.score_session(eng)

    bare, layered = play(False), play(True)
    for key in SCORE_FIELDS:
        assert bare[key] == layered[key], (
            f"слой дотянулся до счёта: {key} = {bare[key]} без слоёв "
            f"и {layered[key]} со слоями")


def test_what_the_judge_sees_carries_no_layer_signal():
    """Обходной путь, которого тут могло бы не хватать: слой → судья → счёт.

    Наблюдение камеры уходит в системный промпт ОППОНЕНТА, и это законно: живой
    человек на видеозвонке тоже видит собеседника. Но балл судьи входит в
    `apply_move`, то есть в счёт напрямую, — значит, до судьи наблюдение
    доходить не имеет права. Здесь проверяется, что контекст судьи собирается
    из сценария и состояния и ни строчки не берёт из журнала разговора.
    """
    from app import views

    sess = engine.create_session("supplier", "ru")
    sess.log.append({"role": "opp", "text": "в кадре появился второй человек"})
    context, interests = views.judge_context(sess)
    assert "кадр" not in context, "наблюдение камеры доехало до судьи"
    assert all("кадр" not in i for i in interests)
