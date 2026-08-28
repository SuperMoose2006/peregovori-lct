"""Ход по сокету обязан быть ограничен НА СЕРВЕРЕ.

Клиент обрезает ввод на 2000 знаков — и клиент это то, что можно не
использовать: `/v1/realtime` смотрит в интернет, а `input.append` НАКАПЛИВАЕТ.
Без предела здесь ход растёт до бесконечности и целиком уезжает в платные
модели — это и счёт, и поверхность для подсовывания инструкций.

Комментарий в main.py ссылался на «предел хода по сокету» ещё до того, как этот
предел появился: защита была описана, но не написана.
"""
from app.engine import engine
from app.realtime.session import MAX_TURN_CHARS, MAX_TURN_FRAMES, RealtimeSession


def _session() -> RealtimeSession:
    return RealtimeSession(session_id="s", engine_session=engine.create_session("supplier"))


def test_a_single_huge_append_is_cut():
    sess = _session()
    sess.append_input(text="я" * 100_000)
    assert len(sess.pending_text) == MAX_TURN_CHARS


def test_many_small_appends_cannot_walk_past_the_limit():
    """Предел на КУСОК обходится тысячей маленьких кусков — и обошёлся бы."""
    sess = _session()
    for _ in range(500):
        sess.append_input(text="слово " * 20)
    assert len(sess.pending_text) <= MAX_TURN_CHARS


def test_the_limit_does_not_eat_an_ordinary_turn():
    """Обычная реплика обязана доехать целиком, включая длинную и голосовую."""
    sess = _session()
    line = ("Ирина, что для вас важнее всего в этом контракте и почему именно это? "
            "Я хочу понять, прежде чем говорить о цене.")
    sess.append_input(text=line)
    assert sess.pending_text == line

    # Голос приходит кусками расшифровки — склейка обязана остаться целой.
    sess = _session()
    for part in ("Я вас слышу.", "А чем это грозит,", "если загрузка просядет?"):
        sess.append_input(text=part)
    assert sess.pending_text == "Я вас слышу. А чем это грозит, если загрузка просядет?"


def test_frames_keep_the_tail_not_the_flood():
    """Смотрит модель на последний кадр — копить пачку незачем, а память занимает."""
    sess = _session()
    for i in range(200):
        sess.append_input(frames=[f"кадр-{i}"])
    assert len(sess.pending_frames) == MAX_TURN_FRAMES
    assert sess.pending_frames[-1] == "кадр-199", "выброшен свежий кадр вместо старого"


def test_taking_the_input_clears_the_buffer():
    """Иначе предел копился бы между ходами и обрезал бы вторую реплику."""
    sess = _session()
    sess.append_input(text="а" * MAX_TURN_CHARS, frames=["к"])
    text, frames = sess.take_input()
    assert len(text) == MAX_TURN_CHARS and frames == ["к"]
    assert sess.pending_text == "" and sess.pending_frames == []
    sess.append_input(text="второй ход")
    assert sess.pending_text == "второй ход"


def test_the_stand_does_not_hand_its_answers_to_any_origin():
    """`allow_origins=["*"]` заводили ради vite и увезли на стенд в интернет."""
    import importlib
    import os

    from starlette.middleware.cors import CORSMiddleware

    def origins_when(password: str) -> list[str]:
        before = os.environ.get("NEGO_HTTP_PASSWORD", "")
        os.environ["NEGO_HTTP_PASSWORD"] = password
        try:
            import app.main as main
            importlib.reload(main)
            for mw in main.app.user_middleware:
                if mw.cls is CORSMiddleware:
                    return list(mw.kwargs.get("allow_origins", []))
            raise AssertionError("CORS-прослойки нет вовсе")
        finally:
            os.environ["NEGO_HTTP_PASSWORD"] = before
            import app.main as main
            importlib.reload(main)

    assert origins_when("") == ["*"], "разработка сломана: vite на другом порту"
    guarded = origins_when("секрет")
    assert "*" not in guarded, "стенд отдаёт ответы любому origin"
    assert any("5173" in o for o in guarded), "свои origin тоже перекрыли"
