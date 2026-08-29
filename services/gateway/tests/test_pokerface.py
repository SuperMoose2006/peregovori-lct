"""«Покерфейс» — упражнение на лицо, которое НЕ входит в оценку.

Слой отвечает на наблюдаемый вопрос («видно ли на лице явное выражение»), а не
делает вывод о внутреннем состоянии. Разница принципиальная: «модель посмотрела
и решила, что вы неуверенны» — псевдонаука, и такое в грейд не пускают. Здесь
проверяется и то, что счётчик работает, и то, что он не дотягивается до счёта.
"""
import asyncio
import dataclasses

from app.engine import engine
from app.perception.vision import VisionSampler, split_tell
from app.realtime.session import Layers, RealtimeSession


# ------------------------------------------------------------------ разбор

def test_tell_line_is_split_off_the_observation():
    obs, tell = split_tell("Человек в кадре, смотрит в бумаги.\nЛИЦО: да")
    assert obs == "Человек в кадре, смотрит в бумаги."
    assert tell is True


def test_tell_line_in_english():
    obs, tell = split_tell("A person at a desk.\nFACE: no")
    assert obs == "A person at a desk." and tell is False


def test_silent_model_is_not_a_neutral_face():
    """`None` — не «нет».

    Молчание модели и нейтральное лицо это разные вещи; считать их одинаково
    значило бы придумать данные, которых не было.
    """
    obs, tell = split_tell("Человек в кадре.")
    assert tell is None and obs == "Человек в кадре."


def test_tell_can_arrive_without_any_observation():
    """Кадр может не нести ничего про обстановку и нести выражение на лице."""
    obs, tell = split_tell("нет\nЛИЦО: да")
    assert tell is True and obs.strip().lower() == "нет"


# ------------------------------------------------------------------ промпт

def test_question_about_the_face_is_asked_only_when_the_layer_is_on():
    off = VisionSampler("ru", lambda e: None, lambda *a, **k: None)
    on = VisionSampler("ru", lambda e: None, lambda *a, **k: None, pokerface=True)
    assert "ЛИЦО" not in off._system_prompt()
    assert "ЛИЦО" in on._system_prompt()
    # Запрет на угадывание настроения обязан пережить добавку.
    assert "НЕ оцен" in on._system_prompt()


def test_the_face_question_asks_for_what_is_visible_not_for_a_verdict():
    prompt = VisionSampler("ru", lambda e: None, lambda *a, **k: None, pokerface=True)._system_prompt()
    for verdict in ("неуверен", "нервнича", "врёт", "настроение"):
        assert f"{verdict}» — да" not in prompt
    assert "Не объясняй и не угадывай настроение" in prompt


# ------------------------------------------------------------------ счёт

def test_layer_needs_a_camera():
    """Тумблер без кадров — включённый переключатель, за которым ничего нет."""
    assert Layers.from_dict({"pokerface": True}).pokerface is False
    assert Layers.from_dict({"pokerface": True, "camera": True}).pokerface is True


def test_exam_keeps_the_layer_off():
    assert Layers.for_exam().pokerface is False


def test_counter_lives_outside_the_engine_session():
    """Физическая, а не дисциплинарная гарантия: поля просто нет в движке."""
    sess = RealtimeSession(session_id="s", engine_session=engine.create_session("supplier"))
    assert sess.tells == 0
    assert not hasattr(sess.engine_session, "tells")
    names = {f.name for f in dataclasses.fields(type(sess.engine_session))}
    assert "tells" not in names and "pokerface" not in names


def test_events_carry_the_badge():
    """Плашка едет вместе с событием, чтобы клиент не помнил правило сам."""
    seen = []
    s = VisionSampler("ru", seen.append, lambda *a, **k: None, pokerface=True)

    class _Resp:
        @staticmethod
        def raise_for_status(): pass
        @staticmethod
        def json():
            return {"choices": [{"message": {"content": "Человек в кадре.\nЛИЦО: да"}}]}

    class _Client:
        async def post(self, *a, **kw): return _Resp()

    from app.providers.openrouter import chat as orchat
    original = orchat._get_client
    orchat._get_client = lambda: _Client()
    try:
        asyncio.run(s._look("zzz"))
    finally:
        orchat._get_client = original

    tell = [e for e in seen if e["type"] == "vision.tell"]
    assert len(tell) == 1
    assert tell[0]["expressive"] is True and tell[0]["total"] == 1
    assert tell[0]["affects_score"] is False
    assert s.stats.tells == 1
    # И наблюдение уехало отдельным событием, без строки «ЛИЦО: да».
    obs = [e for e in seen if e["type"] == "vision.observation"]
    assert obs and "ЛИЦО" not in obs[0]["text"]
