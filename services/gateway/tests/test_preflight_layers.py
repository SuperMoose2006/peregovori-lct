"""Живые проверки голоса и зрения — их ветки отказа, офлайн и без единой копейки.

ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ И ЧТО НЕТ. Проверки `preflight --voice` и
`--vision` затем и написаны, что офлайновый тест не может ответить на вопрос
«поднялся ли слой на самом деле»: тесты этого репозитория ВСЕГДА офлайн
(`conftest.py` ставит `NEGO_AI=off`). Здесь поэтому проверяется не живая
половина, а **разбор ответов и ветки отказа**: что прибор считает успехом,
что — провалом, и что провал НАЗЫВАЕТ ПРИЧИНУ, а не печатает трассировку.
Живая половина подтверждается прогоном руками; она в отчёте.

ПОЧЕМУ ЧЕРЕЗ НАСТОЯЩИЙ СОКЕТ, А НЕ ПОДМЕНОЙ ФУНКЦИЙ. Прибор ловит ровно то,
что приходит по проводу, и мок на уровне функций проверял бы наши же
представления о протоколе. Поддельный шлюз здесь говорит теми же событиями,
что и `realtime/events.py`, и молчит там, где молчал бы сломанный слой.

САМОЕ ВАЖНОЕ — ДВА ТЕСТА ПРО ЛЬСТИВЫЙ ОТКАЗ. Приборы этого репозитория врали
шесть раз, и каждый раз ошибка льстила: чип камеры горел от кадра, который
никто не смотрел. Поэтому здесь стоят два случая, в которых слой ОТВЕЧАЕТ, но
мёртв по сути: синтез вернул тишину теми же чанками, а распознавание вернуло
не те слова. Оба обязаны быть красными.
"""

from __future__ import annotations

import asyncio
import base64
import contextlib
import importlib.util
import json
import threading
from pathlib import Path

import numpy as np
import pytest
import websockets

TOOL = Path(__file__).resolve().parents[1] / "tools" / "preflight.py"


def _load_preflight():
    spec = importlib.util.spec_from_file_location("preflight_tool", TOOL)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def tool():
    """Свежий модуль на каждый случай: `problems`/`warnings` в нём глобальные."""
    module = _load_preflight()
    # Ждать по сорок пять секунд поддельного сервера незачем — он либо ответил
    # сразу, либо не ответит вовсе.
    module.VOICE_WAIT_S = 1.5
    module.VOICE_IDLE_S = 0.4
    module.VISION_WAIT_S = 1.5
    return module


class FakeGateway:
    """Шлюз, который говорит ровно то, что ему сказали, и молчит про остальное."""

    def __init__(self, script: dict) -> None:
        self.script = script
        self.frames: list[str] = []
        self.audio_chunks = 0
        self._loop = asyncio.new_event_loop()
        self._ready = threading.Event()
        self.port = 0
        self._server = None
        self._thread = threading.Thread(target=self._serve, daemon=True)

    # ------------------------------------------------------------------ жизнь

    def __enter__(self) -> "FakeGateway":
        self._thread.start()
        assert self._ready.wait(10), "поддельный шлюз не поднялся"
        return self

    def __exit__(self, *exc) -> None:
        # ГАСИТЬ ПО-ЧЕСТНОМУ, а не выдёргивать петлю из-под живых соединений:
        # оборванный сокет всплывает потом как «Event loop is closed» в чужом
        # тесте, и шум в выводе приучает вывод не читать.
        async def shutdown() -> None:
            self._server.close()
            await self._server.wait_closed()

        with contextlib.suppress(Exception):
            asyncio.run_coroutine_threadsafe(shutdown(), self._loop).result(timeout=5)
        self._loop.call_soon_threadsafe(self._loop.stop)
        self._thread.join(timeout=5)
        with contextlib.suppress(Exception):
            self._loop.close()

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def _serve(self) -> None:
        asyncio.set_event_loop(self._loop)

        async def boot():
            # `websockets.serve(...)` строит объект сервера НА ВЫЗОВЕ и требует
            # работающей петли — снаружи корутины он падает с «no running event
            # loop», а падает в чужом потоке, то есть молча.
            return await websockets.serve(self._handler, "127.0.0.1", 0,
                                          max_size=16 * 1024 * 1024)

        server = self._server = self._loop.run_until_complete(boot())
        self.port = server.sockets[0].getsockname()[1]
        self._ready.set()
        try:
            self._loop.run_forever()
        finally:
            server.close()

    # --------------------------------------------------------------- протокол

    async def _handler(self, ws) -> None:
        sent_after_input = False
        async for raw in ws:
            message = json.loads(raw)
            kind = message.get("type")
            if kind == "session.init":
                await ws.send(json.dumps({
                    "type": "session.created",
                    "capabilities": self.script.get("capabilities", {}),
                    "scenario": {}, "state": {}, "greeting": "",
                }))
                for event in self.script.get("on_init", []):
                    await ws.send(json.dumps(event))
            elif kind == "input.append":
                payload = message.get("input") or {}
                if payload.get("video_frames"):
                    self.frames.extend(payload["video_frames"])
                if payload.get("audio"):
                    self.audio_chunks += 1
                if not sent_after_input:
                    sent_after_input = True
                    for event in self.script.get("on_input", []):
                        await ws.send(json.dumps(event))


def _audio_event(samples: np.ndarray) -> dict:
    return {"type": "response.output.delta", "kind": "audio",
            "generation_id": "g1", "turn_id": 1,
            "audio": base64.b64encode(samples.astype(np.float32).tobytes()).decode()}


#: Голос оппонента — то, что человек слышит. 0.5 с синуса: не тишина.
LOUD = _audio_event(0.5 * np.sin(np.linspace(0, 900, 12000)))
#: Тот же поток чанков, но пустой по существу. Мёртвый синтез выглядит ровно так.
SILENT = _audio_event(np.zeros(12000))

FULL_VOICE = {
    "capabilities": {"voice": True, "microphone": True},
    "on_input": [
        {"type": "user.speech.started"},
        {"type": "user.transcript", "text": "Что для вас важнее всего", "final": False},
        {"type": "turn.analysis", "turn_id": 1,
         "text": "Что для вас важнее всего в этом контракте?", "analysis": {}},
        {"type": "engine.state", "turn_id": 1,
         "state": {"trust": 52, "info": 20, "turn": 1}, "judged": True},
        LOUD,
        {"type": "response.done", "generation_id": "g1", "turn_id": 1,
         "text": "Важнее всего сроки."},
    ],
}


@pytest.fixture()
def mic(monkeypatch):
    """Подменить генератор сигнала: настоящий ходит в сеть за синтезом."""
    def _fake(module):
        monkeypatch.setattr(
            module, "_probe_speech",
            lambda text: (np.zeros(int(16000 * 0.3), dtype=np.int16), "тест"))
    return _fake


# ---------------------------------------------------------------------- голос


def test_voice_green_path_says_the_move_reached_the_engine(tool, mic):
    """Успех — это не «сессия открылась», а ХОД, дошедший до движка."""
    mic(tool)
    with FakeGateway(FULL_VOICE) as gw:
        tool.check_live_voice(gw.url)
    assert not tool.problems, tool.problems
    assert not tool.warnings, tool.warnings
    assert gw.audio_chunks > 0, "прибор не отправил ни одного куска звука"


def test_voice_that_is_analysed_but_never_counted_is_noticed(tool, mic):
    """Реплика разобрана, а ход не посчитан — партия встала на судье.

    `turn.analysis` доказывает только доехавший ТЕКСТ. Признать это полным
    успехом значило бы пропустить партию, замершую между разбором и ходом.
    """
    mic(tool)
    script = dict(FULL_VOICE)
    script["on_input"] = [e for e in FULL_VOICE["on_input"]
                          if e.get("type") != "engine.state"]
    with FakeGateway(script) as gw:
        tool.check_live_voice(gw.url)
    assert not tool.problems, tool.problems
    assert any("не прислал engine.state" in w for w in tool.warnings), tool.warnings


def test_voice_without_microphone_names_the_key_and_the_file(tool, mic):
    """Слой не поднялся — отказ обязан сказать, какой ключ и куда его класть."""
    mic(tool)
    with FakeGateway({"capabilities": {"voice": True, "microphone": False}}) as gw:
        tool.check_live_voice(gw.url)
    assert len(tool.problems) == 1, tool.problems
    line = tool.problems[0]
    assert "микрофон" in line and "OPENAI_REALTIME_KEY" in line and ".env" in line


def test_voice_that_recognises_but_never_moves_is_a_failure(tool, mic):
    """Расшифровка на экране без хода — это сломанная игра, а не медленная.

    Ровно тот случай, который прибор обязан отличать от исправного: слова
    видно, значит распознавание живо, а ход не закрылся — виноват не ключ, а
    окно тишины, и в отказе названо именно оно.
    """
    mic(tool)
    script = {"capabilities": {"voice": True, "microphone": True},
              "on_input": [{"type": "user.speech.started"},
                           {"type": "user.transcript", "text": "Что для вас важнее"},
                           {"type": "response.done", "generation_id": "g1",
                            "turn_id": 1, "text": ""}]}
    with FakeGateway(script) as gw:
        tool.check_live_voice(gw.url)
    assert any("ход до движка НЕ ДОШЁЛ" in p for p in tool.problems), tool.problems
    assert any("NEGO_REALTIME_QUIET_MS" in p for p in tool.problems)


def test_voice_with_no_words_at_all_blames_the_recognition(tool, mic):
    mic(tool)
    script = {"capabilities": {"voice": True, "microphone": True},
              "on_input": [{"type": "user.speech.started"},
                           {"type": "response.done", "generation_id": "g1",
                            "turn_id": 1, "text": ""}]}
    with FakeGateway(script) as gw:
        tool.check_live_voice(gw.url)
    assert any("НИ ОДНОГО слова" in p for p in tool.problems), tool.problems


def test_voice_that_hears_something_else_is_red(tool, mic):
    """ЛЬСТИВЫЙ ОТКАЗ №1: заглушка вернула текст — и он не тот, что сказали.

    Постоянная строка от мёртвого распознавания выглядит как успех по любому
    признаку вида «текст пришёл». Поэтому слова сверяются со сказанными.
    """
    mic(tool)
    script = {"capabilities": {"voice": True, "microphone": True},
              "on_input": [{"type": "user.speech.started"},
                           {"type": "turn.analysis", "turn_id": 1,
                            "text": "Погода сегодня прекрасная", "analysis": {}},
                           LOUD,
                           {"type": "response.done", "generation_id": "g1",
                            "turn_id": 1, "text": "Да."}]}
    with FakeGateway(script) as gw:
        tool.check_live_voice(gw.url)
    assert any("распознано НЕ ТО" in p for p in tool.problems), tool.problems


def test_voice_with_silent_synthesis_is_red(tool, mic):
    """ЛЬСТИВЫЙ ОТКАЗ №2: чанки идут, а звука нет.

    Провайдер, вернувший тишину, отдаёт ровно те же события, что и живой.
    Признаком успеха поэтому служит АМПЛИТУДА, а не факт прихода чанка.
    """
    mic(tool)
    script = dict(FULL_VOICE)
    script["on_input"] = [e if e is not LOUD else SILENT for e in FULL_VOICE["on_input"]]
    with FakeGateway(script) as gw:
        tool.check_live_voice(gw.url)
    assert any("ТИШИНУ" in p for p in tool.problems), tool.problems


def test_voice_without_any_sound_says_the_room_will_hear_nothing(tool, mic):
    mic(tool)
    script = dict(FULL_VOICE)
    script["on_input"] = [e for e in FULL_VOICE["on_input"] if e is not LOUD]
    with FakeGateway(script) as gw:
        tool.check_live_voice(gw.url)
    assert any("НЕ ЗАЗВУЧАЛ" in p for p in tool.problems), tool.problems


def test_broken_probe_is_a_warning_about_the_probe_not_the_product(tool, monkeypatch):
    """Генератор сигнала не поднялся — виноват ПРИБОР, и так и написано.

    Сказать «голос сломан» там, где сломался инструмент, значит послать людей
    чинить исправное. Такой случай обязан быть жёлтым, а не красным.
    """
    monkeypatch.setattr(tool, "_probe_speech", lambda text: (None, "edge-tts: нет сети"))
    with FakeGateway(FULL_VOICE) as gw:
        tool.check_live_voice(gw.url)
    assert not tool.problems
    assert any("отказ прибора, а не продукта" in w for w in tool.warnings), tool.warnings


# --------------------------------------------------------------------- зрение


def test_vision_green_path_reports_what_the_model_said(tool):
    script = {"capabilities": {"camera": True, "pokerface": True},
              "on_input": [{"type": "vision.observation", "turn": 0,
                            "text": "В кадре один человек, смотрит в камеру.",
                            "affects_score": False, "latency_ms": 1400},
                           {"type": "vision.tell", "expressive": True,
                            "total": 1, "turn": 0, "affects_score": False}]}
    with FakeGateway(script) as gw:
        tool.check_live_vision(gw.url)
        assert gw.frames, "кадр до сервера не доехал"
        assert len(gw.frames[0]) > 1000, "кадр подозрительно мал"
    assert not tool.problems, tool.problems


def test_vision_layer_that_did_not_rise_names_the_openrouter_key(tool):
    with FakeGateway({"capabilities": {"camera": False, "pokerface": False}}) as gw:
        tool.check_live_vision(gw.url)
        assert not gw.frames, "кадр ушёл в модель, которой нет — это трата впустую"
    assert len(tool.problems) == 1, tool.problems
    assert "OPENAI_API_KEY" in tool.problems[0] and "камер" in tool.problems[0]


def test_vision_silence_is_a_failure_not_a_pass(tool):
    """Слой поднялся и промолчал — это и есть «молчащий слой», принцип 2.

    Молчание неотличимо от сломанной камеры, и признать его успехом значило бы
    завести то самое четвёртое состояние: выглядит настоящим, внутри пусто.
    """
    with FakeGateway({"capabilities": {"camera": True, "pokerface": True}}) as gw:
        tool.check_live_vision(gw.url)
    assert any("наблюдения НЕТ" in p for p in tool.problems), tool.problems


def test_vision_that_answers_about_the_face_but_not_the_room_is_a_frame_problem(tool):
    """Слой жив, а наблюдения нет — виноват КАДР, и отказ говорит именно это.

    Отличать этот случай от мёртвого слоя важно: диагнозы противоположные, а
    выглядят одинаково — в разборе пусто и там, и там.
    """
    script = {"capabilities": {"camera": True, "pokerface": True},
              "on_input": [{"type": "vision.tell", "expressive": False,
                            "total": 0, "turn": 0, "affects_score": False}]}
    with FakeGateway(script) as gw:
        tool.check_live_vision(gw.url)
    assert any("VISION_FRAME" in p for p in tool.problems), tool.problems


def test_vision_without_the_pokerface_line_does_not_invent_an_answer(tool):
    """Модель не ответила на второй вопрос — это НЕ «нет».

    Та же граница, что в `vision.split_tell`: молчание модели и спокойное лицо
    — разные вещи, и прибор не имеет права превращать одно в другое.
    """
    script = {"capabilities": {"camera": True, "pokerface": True},
              "on_input": [{"type": "vision.observation", "turn": 0,
                            "text": "В кадре один человек.", "affects_score": False}]}
    with FakeGateway(script) as gw:
        tool.check_live_vision(gw.url)
    assert not tool.problems, tool.problems
    assert any("не ответила на второй вопрос" in w for w in tool.warnings), tool.warnings


# ------------------------------------------------------------------- материал


def test_the_probe_frame_is_in_git_and_becomes_a_jpeg(tool):
    """Кадр обязан лежать в репозитории и превращаться в JPEG.

    Он выбран замером (см. `VISION_FRAME`), и подмена его на снимок интерфейса
    сделала бы проверку красной на исправном слое: на снимке модель отвечает
    «ничего примечательного», а пустое наблюдение события не порождает вовсе.
    """
    assert tool.VISION_FRAME.is_file(), tool.VISION_FRAME
    frame, about = tool._probe_frame()
    assert frame and "портрет" in about
    assert base64.b64decode(frame)[:3] == b"\xff\xd8\xff", "это не JPEG"
    assert len(frame) < tool_max_frame(), "кадр больше, чем примет сокет"


def tool_max_frame() -> int:
    from app.realtime.session import MAX_FRAME_B64

    return MAX_FRAME_B64


def test_words_ignores_the_short_ones(tool):
    """Сверка «сказано/услышано» идёт по значимым словам.

    По коротким («что», «для», «в») совпадали бы любые две русские фразы — то
    есть прибор показывал бы сходство там, где его нет.
    """
    assert tool._words("Что для вас важнее всего в этом контракте?") == {
        "важнее", "всего", "этом", "контракте"}


# ------------------------------------------------- шлюз молчит целиком


class MuteGateway(FakeGateway):
    """Сокет открывается, а на `session.init` не отвечает ничего.

    Отдельный случай, потому что диагноз ДРУГОЙ: молчит не слой, а сервер, и
    послать человека искать ключ камеры значит послать его не туда.
    """

    async def _handler(self, ws) -> None:
        async for _ in ws:
            pass


def test_a_mute_gateway_is_not_reported_as_a_missing_layer(tool, mic):
    mic(tool)
    with MuteGateway({}) as gw:
        tool.check_live_voice(gw.url)
    assert any("не ответил на session.init" in p for p in tool.problems), tool.problems


def test_a_mute_gateway_is_not_reported_as_a_missing_camera(tool):
    with MuteGateway({}) as gw:
        tool.check_live_vision(gw.url)
    assert any("не ответил на session.init" in p for p in tool.problems), tool.problems
